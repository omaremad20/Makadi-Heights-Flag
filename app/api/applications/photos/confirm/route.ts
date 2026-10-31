import type { NextRequest } from "next/server";

import { isBoundedList, isPhotoPath, isUuid } from "@/lib/photos/validation";
import { isCrossSiteRequest, readJsonBody } from "@/lib/server/request-guards";
import { getAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 8 * 1024;

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Marks uploaded guest photos as current. The database checks that each path
 * was reserved for THIS application (by idempotency key), that the object
 * exists, and applies the precedence rules (admin photos and newer uploads
 * always win). Safe to call repeatedly.
 */
export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) return reply({ ok: false, message: "Request not allowed." }, 403);

  const body = (await readJsonBody(request, MAX_BODY_BYTES)) as
    | { idempotencyKey?: unknown; paths?: unknown }
    | undefined;
  if (!body || !isUuid(body.idempotencyKey) || !isBoundedList(body.paths, isPhotoPath)) {
    return reply({ ok: false, message: "Invalid request." }, 400);
  }

  const { data, error } = await getAdminClient().rpc("confirm_application_photos", {
    p_idempotency_key: body.idempotencyKey,
    p_paths: body.paths,
  });

  if (error) {
    console.error("[photos] confirm failed", error.code, error.message);
    const status = error.code === "PT404" ? 404 : error.code === "PT422" ? 422 : 502;
    return reply({ ok: false, message: "The photos couldn’t be saved. Try again." }, status);
  }

  const results = ((data ?? []) as Array<{ storage_path: string; result: string }>).map((r) => ({
    path: r.storage_path,
    result: r.result,
  }));
  return reply({ ok: true, results }, 200);
}
