/**
 * Application-photo cleanup: the decision logic, independent of Deno/Node and
 * of Supabase clients so it is unit tested with fakes (tests/photo-cleanup.test.ts).
 *
 * Safety model
 *  - WHAT may be deleted is decided only by the database
 *    (photo_cleanup_candidates / photo_delete_reason). This code never builds
 *    its own selection.
 *  - Right before each delete it re-asks the database (photo_cleanup_still_eligible),
 *    so an application re-opened or approved after the list was built is respected.
 *  - Only paths shaped like {application}/{person}/{uuid}.{webp|jpg} are ever
 *    passed to Storage, and the Storage adapter is bound to the
 *    'application-photos' bucket.
 *  - A Storage failure leaves the row untouched; the next run retries it.
 *  - One scheduled run per Cairo day (start_photo_cleanup_run); dry-run makes
 *    no changes at all.
 */

export const PHOTO_BUCKET = "application-photos";

const PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(applicant|partner|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$/;

export interface Candidate {
  photo_id: string;
  storage_path: string;
  action: "expire" | "delete";
  reason: string;
}

export interface CleanupDb {
  startRun(dryRun: boolean, kind: "scheduled" | "manual"): Promise<number | null>;
  candidates(limit: number): Promise<Candidate[]>;
  stillEligible(photoId: string): Promise<boolean>;
  finishItem(photoId: string, action: "expire" | "delete", objectExisted: boolean): Promise<string>;
  finishRun(
    runId: number,
    totals: { candidates: number; deleted: number; expired: number; failed: number },
    error: string | null,
    details: Record<string, unknown>,
  ): Promise<string>;
}

export interface CleanupStorage {
  exists(path: string): Promise<boolean>;
  /** Removes one object. Resolves when gone (also when it was already missing); rejects on failure. */
  remove(path: string): Promise<void>;
}

export interface CleanupOptions {
  db: CleanupDb;
  storage: CleanupStorage;
  dryRun: boolean;
  kind: "scheduled" | "manual";
  batchSize?: number;
  maxBatches?: number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export type CleanupSummary =
  | { status: "skipped"; reason: "already_ran_today" }
  | {
      status: "succeeded" | "partial" | "failed";
      runId: number;
      dryRun: boolean;
      candidates: number;
      deleted: number;
      expired: number;
      activated: number;
      skipped: number;
      failed: number;
      wouldDelete: number;
      wouldExpire: number;
      failures: Array<{ photoId: string; reason: string }>;
    };

export async function runPhotoCleanup({
  db,
  storage,
  dryRun,
  kind,
  batchSize = 100,
  maxBatches = 20,
  log = () => {},
}: CleanupOptions): Promise<CleanupSummary> {
  const runId = await db.startRun(dryRun, kind);
  if (runId === null) {
    log("cleanup skipped: today's scheduled run already exists");
    return { status: "skipped", reason: "already_ran_today" };
  }

  const t = { candidates: 0, deleted: 0, expired: 0, activated: 0, skipped: 0, failed: 0, wouldDelete: 0, wouldExpire: 0 };
  const failures: Array<{ photoId: string; reason: string }> = [];
  const seen = new Set<string>();
  let fatal: string | null = null;

  try {
    // Dry run never changes anything, so a single (larger) batch is the whole picture.
    const batches = dryRun ? 1 : maxBatches;
    for (let b = 0; b < batches; b++) {
      // Items that failed earlier in this run are still candidates; ask for
      // enough extra rows to look past them instead of stopping early.
      const limit = dryRun ? 1000 : Math.min(1000, batchSize + seen.size);
      const list = await db.candidates(limit);
      const fresh = list.filter((c) => !seen.has(c.photo_id));
      if (fresh.length === 0) break; // nothing new (only items that already failed this run)

      for (const c of fresh) {
        seen.add(c.photo_id);
        t.candidates++;
        try {
          if (!PATH_RE.test(c.storage_path)) throw new Error("unexpected_path_shape");

          if (c.action === "expire") {
            if (dryRun) {
              t.wouldExpire++;
              continue;
            }
            const existed = await storage.exists(c.storage_path);
            const result = await db.finishItem(c.photo_id, "expire", existed);
            if (result === "expired") t.expired++;
            else if (result === "activated" || result === "superseded") t.activated++;
            else t.skipped++;
            continue;
          }

          if (c.action === "delete") {
            if (!(await db.stillEligible(c.photo_id))) {
              t.skipped++; // e.g. the application was re-opened or approved meanwhile
              continue;
            }
            if (dryRun) {
              t.wouldDelete++;
              continue;
            }
            await storage.remove(c.storage_path); // throws on failure -> row untouched, retried next run
            const result = await db.finishItem(c.photo_id, "delete", true);
            if (result === "deleted") t.deleted++;
            else t.skipped++;
            continue;
          }

          throw new Error(`unknown_action:${String(c.action)}`);
        } catch (e) {
          t.failed++;
          const reason = e instanceof Error ? e.message : String(e);
          failures.push({ photoId: c.photo_id, reason });
          log("cleanup item failed", { photoId: c.photo_id, reason });
        }
      }

      if (list.length < limit) break; // last page
    }
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
    log("cleanup aborted", { error: fatal });
  }

  const details = {
    dryRun,
    activated: t.activated,
    skipped: t.skipped,
    wouldDelete: t.wouldDelete,
    wouldExpire: t.wouldExpire,
    failures: failures.slice(0, 50),
  };
  const status = (await db.finishRun(
    runId,
    { candidates: t.candidates, deleted: t.deleted, expired: t.expired, failed: t.failed },
    fatal,
    details,
  )) as "succeeded" | "partial" | "failed";
  return { status, runId, dryRun, ...t, failures };
}
