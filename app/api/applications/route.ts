import type { NextRequest } from "next/server";

import type { SubmitApplicationResponse, SubmittedApplication } from "@/lib/applications/api-types";
import { applicationFormSchema, toApplicationPayload } from "@/lib/applications/form-schema";
import { validateApplication } from "@/lib/applications/vaildation";
import { isCrossSiteRequest, rateLimitKey, readJsonBody } from "@/lib/server/request-guards";
import { getAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_MAX = 10; // new applications per IP ...
const RATE_LIMIT_WINDOW_SECONDS = 3600; // ... per hour
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: SubmitApplicationResponse, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/**
 * Public application submission.
 *
 * Flow: size/shape checks -> same validation as the form (Zod + DB-mirroring
 * rules) -> submit_application() with the service role, which re-validates,
 * enforces the per-IP rate limit and makes the call idempotent.
 * The service-role key never leaves the server.
 */
export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return reply({ ok: false, code: "forbidden", message: "Request not allowed." }, 403);
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply({ ok: false, code: "invalid_request", message: "Invalid request." }, 400);
  }
  const { idempotencyKey, application } = body as { idempotencyKey?: unknown; application?: unknown };
  if (typeof idempotencyKey !== "string" || !UUID_RE.test(idempotencyKey)) {
    return reply({ ok: false, code: "invalid_request", message: "Invalid request." }, 400);
  }

  const parsed = applicationFormSchema.safeParse(application);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return reply(
      {
        ok: false,
        code: "validation_failed",
        message: "Some details need attention. Check the highlighted fields and try again.",
        fieldErrors,
      },
      422,
    );
  }

  const checked = validateApplication(toApplicationPayload(parsed.data));
  if (!checked.ok) {
    return reply(
      { ok: false, code: "validation_failed", message: "Some details need attention. Check the highlighted fields and try again." },
      422,
    );
  }

  const v = checked.value;
  const payload = {
    ...v,
    persons_count: 1 + (v.partner_name ? 1 : 0) + (v.additional_persons?.length ?? 0),
  };

  let ipKey: string;
  try {
    ipKey = rateLimitKey(request.headers);
  } catch (e) {
    console.error("[applications] configuration error", e instanceof Error ? e.message : e);
    return reply({ ok: false, code: "unavailable", message: "Applications can’t be accepted right now. Please try again later." }, 503);
  }

  try {
    const { data, error } = await getAdminClient().rpc("submit_application", {
      p_idempotency_key: idempotencyKey.toLowerCase(),
      p_payload: payload,
      p_ip_hash: ipKey,
      p_max_requests: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    if (error) {
      // Log codes only, never personal data.
      console.error("[applications] submit_application failed", error.code, error.message);
      switch (error.code) {
        case "PT429": {
          const retry = Number.parseInt(error.hint ?? "", 10);
          const retryAfterSeconds = Number.isFinite(retry) && retry > 0 ? retry : RATE_LIMIT_WINDOW_SECONDS;
          return reply(
            {
              ok: false,
              code: "rate_limited",
              message: "Too many applications were sent from this connection. Please try again later.",
              retryAfterSeconds,
            },
            429,
            { "Retry-After": String(retryAfterSeconds) },
          );
        }
        case "PT409":
          return reply(
            {
              ok: false,
              code: "conflict",
              message: "This application was already submitted with different details. Refresh the page to start a new one.",
            },
            409,
          );
        case "PT422":
        case "23514":
        case "23502":
        case "22P02":
          return reply(
            { ok: false, code: "validation_failed", message: "Some details were not accepted. Check them and try again." },
            422,
          );
        default:
          return reply(
            { ok: false, code: "unavailable", message: "Your application wasn’t submitted. Please try again. Your details are still here." },
            502,
          );
      }
    }

    const row = data as Record<string, unknown>;
    const application: SubmittedApplication = {
      id: String(row.id),
      created_at: String(row.created_at),
      status: row.status as SubmittedApplication["status"],
      persons_count: Number(row.persons_count),
      partner_name: (row.partner_name as string | null) ?? null,
      additional_persons: (row.additional_persons as SubmittedApplication["additional_persons"]) ?? null,
    };
    return reply({ ok: true, application }, 201);
  } catch (e) {
    console.error("[applications] unexpected error", e instanceof Error ? e.message : e);
    return reply({ ok: false, code: "unavailable", message: "Your application wasn’t submitted. Please try again. Your details are still here." }, 500);
  }
}
