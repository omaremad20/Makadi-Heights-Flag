import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPhotoJobs } from "../lib/photos/build-photo-jobs.ts";
import type { PhotoFlowDeps, PhotoJob, Reservation } from "../lib/photos/photo-upload-flow.ts";
import { uploadPhotos } from "../lib/photos/photo-upload-flow.ts";
import type { UploadOutcome } from "../lib/photos/signed-upload.ts";
import { classifyUploadFailure } from "../lib/photos/signed-upload.ts";

const blob = new Blob(["x"], { type: "image/webp" });
const job = (personKey: string): PhotoJob => ({ personKey, blob, ext: "webp" });

/** In-memory stand-in for the reserve/confirm routes + Storage. */
function fakeBackend(opts: {
  uploadPlan?: Record<string, UploadOutcome[]>; // per person, consumed in order
  reserveFails?: boolean;
  confirmFails?: boolean;
  confirmResult?: (path: string) => string;
} = {}) {
  let n = 0;
  const reserved: Reservation[] = [];
  const uploadedPaths = new Set<string>();
  const calls = { reserve: 0, confirm: 0, upload: 0 };
  const plan = Object.fromEntries(Object.entries(opts.uploadPlan ?? {}).map(([k, v]) => [k, [...v]]));

  const deps: PhotoFlowDeps = {
    async reserve(keys) {
      calls.reserve++;
      if (opts.reserveFails) return { ok: false, message: "reserve down" };
      const items = keys.map((personKey) => {
        n++;
        const r = { personKey, path: `app/${personKey}/${n}.webp`, signedUrl: `https://signed/${n}` };
        reserved.push(r);
        return r;
      });
      return { ok: true, items };
    },
    async upload({ signedUrl, onProgress }) {
      calls.upload++;
      const r = reserved.find((x) => x.signedUrl === signedUrl)!;
      const next = plan[r.personKey]?.shift() ?? { ok: true };
      if (next.ok) {
        onProgress(0.5);
        onProgress(1);
        if (uploadedPaths.has(r.path)) return { ok: false, reason: "exists" };
        uploadedPaths.add(r.path);
      }
      return next;
    },
    async confirm(paths) {
      calls.confirm++;
      if (opts.confirmFails) return { ok: false, message: "confirm down" };
      return {
        ok: true,
        results: paths.map((path) => ({
          path,
          result: (opts.confirmResult?.(path) ?? (uploadedPaths.has(path) ? "confirmed" : "not_uploaded")) as never,
        })),
      };
    },
  };
  return { deps, calls, reserved, uploadedPaths };
}

describe("uploadPhotos", () => {
  it("uploads every photo and confirms them in one call", async () => {
    const b = fakeBackend();
    const progress: number[] = [];
    const states = await uploadPhotos({
      jobs: [job("applicant"), job("partner"), job("p-1")],
      deps: b.deps,
      onState: (s) => s.status === "uploading" && progress.push(s.progress),
    });
    assert.deepEqual([...states.values()].map((s) => s.status), ["done", "done", "done"]);
    assert.equal(b.calls.reserve, 1);
    assert.equal(b.calls.confirm, 1);
    assert.ok(progress.includes(0.5), "progress is reported");
  });

  it("reports partial failures without failing the others", async () => {
    const b = fakeBackend({ uploadPlan: { partner: [{ ok: false, reason: "network" }] } });
    const states = await uploadPhotos({ jobs: [job("applicant"), job("partner")], deps: b.deps });
    assert.equal(states.get("applicant")?.status, "done");
    assert.equal(states.get("partner")?.status, "failed");
    assert.match(states.get("partner")?.error ?? "", /connection/);
  });

  it("retrying a failed photo reserves a NEW path (never re-uses or overwrites)", async () => {
    const b = fakeBackend({ uploadPlan: { partner: [{ ok: false, reason: "network" }] } });
    await uploadPhotos({ jobs: [job("partner")], deps: b.deps });
    const states = await uploadPhotos({ jobs: [job("partner")], deps: b.deps });
    assert.equal(states.get("partner")?.status, "done");
    const paths = b.reserved.filter((r) => r.personKey === "partner").map((r) => r.path);
    assert.equal(new Set(paths).size, 2);
  });

  it("re-reserves once when the signed URL expired", async () => {
    const b = fakeBackend({ uploadPlan: { applicant: [{ ok: false, reason: "expired" }] } });
    const states = await uploadPhotos({ jobs: [job("applicant")], deps: b.deps });
    assert.equal(states.get("applicant")?.status, "done");
    assert.equal(b.calls.reserve, 2);
  });

  it("gives up after a second expiry", async () => {
    const b = fakeBackend({
      uploadPlan: { applicant: [{ ok: false, reason: "expired" }, { ok: false, reason: "expired" }] },
    });
    const states = await uploadPhotos({ jobs: [job("applicant")], deps: b.deps });
    assert.equal(states.get("applicant")?.status, "failed");
    assert.equal(b.calls.reserve, 2);
  });

  it("fails every photo cleanly when reservation is refused (e.g. window closed)", async () => {
    const b = fakeBackend({ reserveFails: true });
    const states = await uploadPhotos({ jobs: [job("applicant"), job("partner")], deps: b.deps });
    assert.deepEqual([...states.values()].map((s) => s.status), ["failed", "failed"]);
    assert.equal(b.calls.upload, 0);
  });

  it("marks uploads failed when confirmation fails, so they can be retried", async () => {
    const b = fakeBackend({ confirmFails: true });
    const states = await uploadPhotos({ jobs: [job("applicant")], deps: b.deps });
    assert.equal(states.get("applicant")?.status, "failed");
  });

  it("treats 'superseded' (a newer/admin photo exists) as done", async () => {
    const b = fakeBackend({ confirmResult: () => "superseded" });
    const states = await uploadPhotos({ jobs: [job("applicant")], deps: b.deps });
    assert.equal(states.get("applicant")?.status, "done");
  });

  it("de-duplicates jobs for the same person", async () => {
    const b = fakeBackend();
    await uploadPhotos({ jobs: [job("applicant"), job("applicant")], deps: b.deps });
    assert.equal(b.calls.upload, 1);
  });

  it("limits concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const b = fakeBackend();
    const deps: PhotoFlowDeps = {
      ...b.deps,
      async upload(args) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return b.deps.upload(args);
      },
    };
    await uploadPhotos({ jobs: Array.from({ length: 10 }, (_, i) => job(`p-${i}`)), deps, concurrency: 3 });
    assert.ok(peak <= 3, `peak ${peak}`);
  });
});

describe("classifyUploadFailure", () => {
  it("recognises the Storage error shapes", () => {
    assert.equal(classifyUploadFailure(400, '{"error":"Duplicate","message":"The resource already exists"}'), "exists");
    assert.equal(classifyUploadFailure(400, '{"message":"jwt expired"}'), "expired");
    assert.equal(classifyUploadFailure(413, "Payload too large"), "too_large");
    assert.equal(classifyUploadFailure(400, '{"message":"mime type image/png is not supported"}'), "rejected");
    assert.equal(classifyUploadFailure(0, ""), "network");
  });
});

describe("buildPhotoJobs", () => {
  const ready = { status: "ready", photo: { blob, ext: "webp" as const } };
  it("maps slots to database person keys", () => {
    const jobs = buildPhotoJobs(
      { applicant: ready, partner: ready, "additional:1": ready, "additional:0": { status: "error" } },
      {
        partner_name: "Sara Test",
        additional_persons: [
          { id: "11111111-1111-4111-8111-111111111111", name: "A B" },
          { id: "22222222-2222-4222-8222-222222222222", name: "C D" },
        ],
      },
    );
    assert.deepEqual(jobs.map((j) => j.personKey).sort(), ["22222222-2222-4222-8222-222222222222", "applicant", "partner"]);
  });
  it("skips the partner photo when no partner was saved, and unknown indexes", () => {
    const jobs = buildPhotoJobs({ partner: ready, "additional:5": ready, "additional:x": ready }, { partner_name: null, additional_persons: null });
    assert.equal(jobs.length, 0);
  });
});
