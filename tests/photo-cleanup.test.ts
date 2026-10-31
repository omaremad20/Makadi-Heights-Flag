import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runPhotoCleanup, type Candidate, type CleanupDb, type CleanupStorage } from "../supabase/functions/_shared/photo-cleanup.ts";

const APP = "a39034a3-e7bf-460c-979d-589d4fa540ff";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = (n: number) => `${APP}/applicant/${uuid(n)}.webp`;

type Row = { id: string; path: string; action: "expire" | "delete"; status: string; eligible: boolean; object: boolean };

/** In-memory database + storage that follow the same contracts as the SQL functions. */
function world(rows: Row[], opts: { failRemove?: Set<string>; alreadyRan?: boolean; candidatesThrow?: boolean } = {}) {
  const runs: Array<{ id: number; status: string; totals?: unknown; error?: string | null }> = [];
  const removed: string[] = [];
  const db: CleanupDb = {
    async startRun() {
      if (opts.alreadyRan) return null;
      runs.push({ id: runs.length + 1, status: "running" });
      return runs.length;
    },
    async candidates(limit) {
      if (opts.candidatesThrow) throw new Error("db down");
      return rows
        .filter((r) => (r.action === "expire" ? r.status === "reserved" : r.status !== "deleted" && r.eligible))
        .slice(0, limit)
        .map<Candidate>((r) => ({ photo_id: r.id, storage_path: r.path, action: r.action, reason: "test" }));
    },
    async stillEligible(id) {
      return rows.find((r) => r.id === id)!.eligible;
    },
    async finishItem(id, action, existed) {
      const r = rows.find((x) => x.id === id)!;
      if (action === "expire") {
        r.status = existed ? "active" : "expired";
        return existed ? "activated" : "expired";
      }
      r.status = "deleted";
      return "deleted";
    },
    async finishRun(id, totals, error) {
      const run = runs.find((r) => r.id === id)!;
      run.totals = totals;
      run.error = error;
      run.status = error ? "failed" : totals.failed > 0 ? "partial" : "succeeded";
      return run.status;
    },
  };
  const storage: CleanupStorage = {
    async exists(p) {
      return rows.find((r) => r.path === p)?.object ?? false;
    },
    async remove(p) {
      if (opts.failRemove?.has(p)) throw new Error("storage 503");
      removed.push(p);
      const r = rows.find((x) => x.path === p);
      if (r) r.object = false;
    },
  };
  return { db, storage, runs, removed, rows };
}

const del = (n: number, eligible = true): Row => ({ id: uuid(n), path: path(n), action: "delete", status: "replaced", eligible, object: true });
const exp = (n: number, object = false): Row => ({ id: uuid(n), path: path(n), action: "expire", status: "reserved", eligible: false, object });

describe("photo cleanup", () => {
  it("deletes eligible photos and expires stale reservations", async () => {
    const w = world([del(1), del(2), exp(3), exp(4, true)]);
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled" });
    if (s.status === "skipped") throw new Error("unexpected");
    assert.equal(s.status, "succeeded");
    assert.equal(s.deleted, 2);
    assert.equal(s.expired, 1);
    assert.equal(s.activated, 1, "an uploaded-but-unconfirmed photo is kept, not deleted");
    assert.deepEqual(w.removed.sort(), [path(1), path(2)]);
  });

  it("dry run changes nothing", async () => {
    const w = world([del(1), exp(2)]);
    const s = await runPhotoCleanup({ ...w, dryRun: true, kind: "manual" });
    if (s.status === "skipped") throw new Error("unexpected");
    assert.equal(s.wouldDelete, 1);
    assert.equal(s.wouldExpire, 1);
    assert.equal(w.removed.length, 0);
    assert.deepEqual(w.rows.map((r) => r.status), ["replaced", "reserved"]);
  });

  it("re-checks eligibility right before deleting (status changed meanwhile)", async () => {
    const w = world([del(1), del(2)]);
    const realCandidates = w.db.candidates;
    w.db.candidates = async (limit) => {
      const list = await realCandidates(limit);
      w.rows[1].eligible = false; // application re-opened after the list was built
      return list;
    };
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled" });
    if (s.status === "skipped") throw new Error("unexpected");
    assert.deepEqual(w.removed, [path(1)]);
    assert.equal(s.skipped, 1);
  });

  it("a Storage failure leaves the row for the next run and marks the run partial", async () => {
    const w = world([del(1), del(2)], { failRemove: new Set([path(2)]) });
    const first = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled" });
    if (first.status === "skipped") throw new Error("unexpected");
    assert.equal(first.status, "partial");
    assert.equal(first.failed, 1);
    assert.equal(w.rows[1].status, "replaced", "row untouched after failed delete");

    // next run (Storage recovered) finishes the job
    const retry = world(w.rows);
    const second = await runPhotoCleanup({ ...retry, dryRun: false, kind: "manual" });
    if (second.status === "skipped") throw new Error("unexpected");
    assert.equal(second.deleted, 1);
    assert.equal(second.status, "succeeded");
  });

  it("does not loop forever on items that keep failing", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => del(i + 1));
    const w = world(rows, { failRemove: new Set(rows.map((r) => r.path)) });
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled", batchSize: 2, maxBatches: 50 });
    if (s.status === "skipped") throw new Error("unexpected");
    assert.equal(s.candidates, 5);
    assert.equal(s.failed, 5);
  });

  it("processes more than one batch", async () => {
    const w = world(Array.from({ length: 7 }, (_, i) => del(i + 1)));
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled", batchSize: 3 });
    if (s.status === "skipped") throw new Error("unexpected");
    assert.equal(s.deleted, 7);
  });

  it("refuses paths outside the expected shape (never reaches Storage)", async () => {
    const bad: Row = { ...del(1), path: "menu/Menu_Serenity_2026.pdf" };
    const w = world([bad]);
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled" });
    if (s.status === "skipped") throw new Error("unexpected");
    assert.equal(w.removed.length, 0);
    assert.equal(s.failed, 1);
  });

  it("is idempotent per day: a second scheduled run is skipped", async () => {
    const w = world([del(1)], { alreadyRan: true });
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled" });
    assert.deepEqual(s, { status: "skipped", reason: "already_ran_today" });
    assert.equal(w.removed.length, 0);
  });

  it("records a failed run when the database is unreachable mid-run", async () => {
    const w = world([del(1)], { candidatesThrow: true });
    const s = await runPhotoCleanup({ ...w, dryRun: false, kind: "scheduled" });
    assert.equal(s.status, "failed");
    assert.equal(w.runs[0].error, "db down");
  });
});
