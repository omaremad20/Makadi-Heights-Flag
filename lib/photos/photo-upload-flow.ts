/**
 * Orchestrates uploading prepared photos: reserve -> upload (parallel, with
 * progress) -> confirm. Framework-free and dependency-injected so it is unit
 * tested with fakes (see tests/photo-upload-flow.test.ts).
 *
 * Used for both guests (API routes keyed by the submission idempotency key)
 * and admins (server actions keyed by the application id); only the injected
 * `reserve` / `confirm` differ.
 */
import type { PhotoExtension } from "./constants.ts";
import type { UploadFailure, UploadOutcome } from "./signed-upload.ts";

export interface PhotoJob {
  personKey: string;
  blob: Blob;
  ext: PhotoExtension;
}

export type PhotoJobStatus = "queued" | "uploading" | "confirming" | "done" | "failed";

export interface PhotoJobState {
  personKey: string;
  status: PhotoJobStatus;
  /** 0..1 for the upload phase */
  progress: number;
  error?: string;
}

export interface Reservation {
  personKey: string;
  path: string;
  signedUrl: string;
}

export type ReserveResult = { ok: true; items: Reservation[] } | { ok: false; message: string };

export type ConfirmItemResult =
  | "confirmed"
  | "superseded"
  | "already_confirmed"
  | "not_uploaded"
  | "not_found";

export type ConfirmResult =
  | { ok: true; results: Array<{ path: string; result: ConfirmItemResult }> }
  | { ok: false; message: string };

export interface PhotoFlowDeps {
  reserve: (personKeys: string[], ext: PhotoExtension) => Promise<ReserveResult>;
  confirm: (paths: string[]) => Promise<ConfirmResult>;
  upload: (args: { signedUrl: string; blob: Blob; onProgress: (f: number) => void; signal?: AbortSignal }) => Promise<UploadOutcome>;
}

export const UPLOAD_FAILURE_MESSAGES: Record<UploadFailure | "confirm_failed" | "reserve_failed" | "not_uploaded", string> = {
  expired: "The upload link expired. Try again.",
  exists: "This photo was already uploaded. Try again to send a new copy.",
  too_large: "This photo is too large. Choose another photo.",
  rejected: "The photo was not accepted. Try again or choose another photo.",
  network: "Upload interrupted. Check your connection and try again.",
  aborted: "Upload cancelled.",
  confirm_failed: "The photo was uploaded but couldn’t be saved. Try again.",
  reserve_failed: "Photo uploads aren’t available right now. Try again.",
  not_uploaded: "The photo didn’t arrive. Try again.",
};

/** Runs `worker` over `items` with at most `limit` in flight. */
async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export interface UploadPhotosOptions {
  jobs: PhotoJob[];
  deps: PhotoFlowDeps;
  onState?: (state: PhotoJobState) => void;
  concurrency?: number;
  signal?: AbortSignal;
}

/**
 * Uploads every job once. Returns the final state per person. Failed jobs can
 * simply be passed to this function again: each attempt reserves a NEW path,
 * so retries never collide with or overwrite an earlier upload.
 * An expired signed URL is re-reserved and retried once automatically.
 */
export async function uploadPhotos({
  jobs,
  deps,
  onState,
  concurrency = 3,
  signal,
}: UploadPhotosOptions): Promise<Map<string, PhotoJobState>> {
  const states = new Map<string, PhotoJobState>();
  const set = (s: PhotoJobState) => {
    states.set(s.personKey, s);
    onState?.(s);
  };

  // de-duplicate by person (last selection wins)
  const byPerson = new Map(jobs.map((j) => [j.personKey, j]));
  for (const j of byPerson.values()) set({ personKey: j.personKey, status: "queued", progress: 0 });
  if (byPerson.size === 0) return states;

  const uploaded: Array<{ job: PhotoJob; path: string }> = [];

  // Reserve per extension (normally a single group).
  const groups = new Map<PhotoExtension, PhotoJob[]>();
  for (const j of byPerson.values()) groups.set(j.ext, [...(groups.get(j.ext) ?? []), j]);

  for (const [ext, group] of groups) {
    let reservation: ReserveResult;
    try {
      reservation = await deps.reserve(group.map((j) => j.personKey), ext);
    } catch {
      reservation = { ok: false, message: UPLOAD_FAILURE_MESSAGES.reserve_failed };
    }
    if (!reservation.ok) {
      for (const j of group) set({ personKey: j.personKey, status: "failed", progress: 0, error: reservation.message });
      continue;
    }
    const byKey = new Map(reservation.items.map((r) => [r.personKey, r]));

    await runLimited(group, concurrency, async (job) => {
      let target = byKey.get(job.personKey);
      if (!target) {
        set({ personKey: job.personKey, status: "failed", progress: 0, error: UPLOAD_FAILURE_MESSAGES.reserve_failed });
        return;
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        set({ personKey: job.personKey, status: "uploading", progress: 0 });
        let outcome: UploadOutcome;
        try {
          outcome = await deps.upload({
            signedUrl: target.signedUrl,
            blob: job.blob,
            signal,
            onProgress: (f) => set({ personKey: job.personKey, status: "uploading", progress: f }),
          });
        } catch {
          outcome = { ok: false, reason: "network" };
        }

        if (outcome.ok) {
          uploaded.push({ job, path: target.path });
          set({ personKey: job.personKey, status: "confirming", progress: 1 });
          return;
        }

        if (outcome.reason === "expired" && attempt === 0) {
          // Signed URLs live ~2 h: get a fresh slot and try once more.
          const again = await deps.reserve([job.personKey], job.ext).catch(() => null);
          const fresh = again && again.ok ? again.items.find((i) => i.personKey === job.personKey) : undefined;
          if (fresh) {
            target = fresh;
            continue;
          }
        }
        set({
          personKey: job.personKey,
          status: "failed",
          progress: 0,
          error: UPLOAD_FAILURE_MESSAGES[outcome.reason] ?? UPLOAD_FAILURE_MESSAGES.rejected,
        });
        return;
      }
    });
  }

  if (uploaded.length > 0) {
    let confirmation: ConfirmResult;
    try {
      confirmation = await deps.confirm(uploaded.map((u) => u.path));
    } catch {
      confirmation = { ok: false, message: UPLOAD_FAILURE_MESSAGES.confirm_failed };
    }
    const results = new Map(confirmation.ok ? confirmation.results.map((r) => [r.path, r.result]) : []);

    for (const { job, path } of uploaded) {
      const result = results.get(path);
      if (result === "confirmed" || result === "already_confirmed" || result === "superseded") {
        set({ personKey: job.personKey, status: "done", progress: 1 });
      } else {
        set({
          personKey: job.personKey,
          status: "failed",
          progress: 0,
          error:
            result === "not_uploaded"
              ? UPLOAD_FAILURE_MESSAGES.not_uploaded
              : confirmation.ok
                ? UPLOAD_FAILURE_MESSAGES.confirm_failed
                : confirmation.message,
        });
      }
    }
  }

  return states;
}
