/**
 * Uploads one blob to a Supabase Storage signed upload URL with progress.
 * Mirrors storage-js `uploadToSignedUrl` (multipart body, x-upsert: false) but
 * uses XMLHttpRequest because fetch() cannot report upload progress.
 *
 * Never overwrites: the token was issued without upsert and x-upsert is false,
 * so an existing object at that path makes the upload fail with "exists".
 */

export type UploadFailure = "expired" | "exists" | "too_large" | "rejected" | "network" | "aborted";

export type UploadOutcome = { ok: true } | { ok: false; reason: UploadFailure; status?: number };

export interface SignedUploadRequest {
  signedUrl: string;
  blob: Blob;
  /** Public (publishable) key; the gateway may require it. Never a secret key. */
  apiKey?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Classifies a Storage error response. Exported for tests. */
export function classifyUploadFailure(status: number, body: string): UploadFailure {
  const text = body.toLowerCase();
  if (status === 409 || text.includes("already exists") || text.includes("duplicate")) return "exists";
  if (status === 413 || text.includes("payload too large") || text.includes("exceeded the maximum")) return "too_large";
  if (
    text.includes("jwt") ||
    text.includes("expired") ||
    text.includes("invalid signature") ||
    text.includes("token")
  ) {
    return "expired";
  }
  if (status === 0) return "network";
  return "rejected";
}

export function uploadToSignedUrl({ signedUrl, blob, apiKey, onProgress, signal }: SignedUploadRequest): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, reason: "aborted" });

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    if (apiKey) xhr.setRequestHeader("apikey", apiKey);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, reason: classifyUploadFailure(xhr.status, xhr.responseText ?? ""), status: xhr.status });
      }
    };
    xhr.onerror = () => resolve({ ok: false, reason: "network" });
    xhr.ontimeout = () => resolve({ ok: false, reason: "network" });
    xhr.onabort = () => resolve({ ok: false, reason: "aborted" });
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.timeout = 120_000;
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", blob);
    xhr.send(form);
  });
}
