import "server-only";

import { createHash } from "node:crypto";

/**
 * Best-effort client IP. On Vercel, `x-real-ip` and the first `x-forwarded-for`
 * entry are set by the platform edge (client-supplied values are overwritten).
 * Used ONLY as a rate-limit bucket, never for authorization.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Salted SHA-256 of the client IP, so raw IPs are never stored.
 * Fails closed when the salt is not configured.
 */
export function rateLimitKey(headers: Headers): string {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt || salt.length < 16) {
    throw new Error("RATE_LIMIT_SALT is missing or too short (min 16 chars).");
  }
  return createHash("sha256").update(`${salt}:${clientIp(headers)}`).digest("hex");
}

/**
 * Extra layer only (Origin can be spoofed outside a browser): rejects browser
 * requests that come from another site. Requests without an Origin header are
 * allowed through; the database-side validation and rate limit still apply.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

/** Reads a JSON body with a hard size cap. Returns undefined if invalid or too large. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown | undefined> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return undefined;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
