import type { SubmitApplicationResponse, SubmittedApplication } from "@/lib/applications/api-types";
import type { ApplicationFormValues } from "@/lib/applications/form-schema";

export type SubmitResult =
  | { ok: true; application: SubmittedApplication }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string>;
      /** True when nothing was stored, so the caller should use a new idempotency key next time. */
      rotateKey: boolean;
    };

const NETWORK_MESSAGE =
  "Your application wasn’t submitted. Check your connection and try again. Your details are still here.";

/**
 * Sends the application to POST /api/applications (server-side validation,
 * rate limit and idempotent insert). The browser never talks to the database
 * for this, and no keys beyond the public URL are involved.
 *
 * `idempotencyKey` must stay the same for retries of the same submission so a
 * lost response can never create a duplicate application.
 */
export async function submitApplication(
  values: ApplicationFormValues,
  idempotencyKey: string,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey, application: values }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: NETWORK_MESSAGE, rotateKey: false };
  }

  let body: SubmitApplicationResponse | null = null;
  try {
    body = (await res.json()) as SubmitApplicationResponse;
  } catch {
    body = null;
  }

  if (body?.ok) return { ok: true, application: body.application };

  return {
    ok: false,
    message: body && !body.ok ? body.message : NETWORK_MESSAGE,
    fieldErrors: body && !body.ok ? body.fieldErrors : undefined,
    // 400/403/422/429: definitely nothing stored. 5xx/unknown: maybe stored -> keep the key.
    rotateKey: res.status >= 400 && res.status < 500 && res.status !== 409,
  };
}
