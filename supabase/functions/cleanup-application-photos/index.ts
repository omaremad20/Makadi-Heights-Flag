// Supabase Edge Function (Deno): applies the application-photo retention policy.
// Deploy with JWT verification OFF (it authenticates with its own secret):
//   supabase functions deploy cleanup-application-photos --no-verify-jwt
// Required secrets (supabase secrets set …):
//   CLEANUP_SECRET   long random string; also stored in Vault for pg_cron
//   CLEANUP_LIVE     "true" to allow real deletions. Anything else = dry run.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";

import { PHOTO_BUCKET, runPhotoCleanup, type Candidate, type CleanupDb, type CleanupStorage } from "../_shared/photo-cleanup.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("CLEANUP_SECRET") ?? "";
  const given = req.headers.get("x-cleanup-secret") ?? "";
  if (secret.length < 32 || !timingSafeEqual(given, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { kind?: string; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const kind = body.kind === "manual" ? "manual" : "scheduled";
  // Live deletion needs BOTH the deployment flag and the caller not asking for a dry run.
  const live = Deno.env.get("CLEANUP_LIVE") === "true" && body.dryRun !== true;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
    return data as T;
  };

  const db: CleanupDb = {
    startRun: (dryRun, k) => rpc<number | null>("start_photo_cleanup_run", { p_dry_run: dryRun, p_trigger_kind: k }),
    candidates: (limit) => rpc<Candidate[]>("photo_cleanup_candidates", { p_limit: limit }),
    stillEligible: (photoId) => rpc<boolean>("photo_cleanup_still_eligible", { p_photo_id: photoId }),
    finishItem: (photoId, action, existed) =>
      rpc<string>("finish_photo_cleanup_item", { p_photo_id: photoId, p_action: action, p_object_existed: existed }),
    finishRun: (runId, totals, error, details) =>
      rpc<string>("finish_photo_cleanup_run", {
        p_run_id: runId,
        p_candidates: totals.candidates,
        p_deleted: totals.deleted,
        p_expired: totals.expired,
        p_failed: totals.failed,
        p_error: error,
        p_details: details,
      }),
  };

  // Bound to the photo bucket only. Never reads or deletes anything else.
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const storage: CleanupStorage = {
    async exists(path) {
      const { data, error } = await bucket.exists(path);
      if (error) throw new Error(`exists: ${error.message}`);
      return Boolean(data);
    },
    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw new Error(`remove: ${error.message}`);
    },
  };

  try {
    const summary = await runPhotoCleanup({
      db,
      storage,
      dryRun: !live,
      kind,
      log: (msg, extra) => console.log(JSON.stringify({ msg, ...extra })),
    });
    console.log(JSON.stringify({ msg: "photo cleanup finished", ...summary, failures: undefined }));
    return Response.json(summary, { status: summary.status === "failed" ? 500 : 200 });
  } catch (e) {
    console.error(JSON.stringify({ msg: "photo cleanup crashed", error: e instanceof Error ? e.message : String(e) }));
    return Response.json({ status: "failed" }, { status: 500 });
  }
});
