"use client";

import type { PhotoExtension } from "./constants.ts";
import type { ConfirmResult, PhotoFlowDeps, ReserveResult } from "./photo-upload-flow.ts";
import { uploadToSignedUrl } from "./signed-upload.ts";

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/** Wires the upload flow to the public API routes for one submitted application. */
export function guestPhotoDeps(idempotencyKey: string): PhotoFlowDeps {
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return {
    async reserve(personKeys: string[], ext: PhotoExtension): Promise<ReserveResult> {
      const { data } = await postJson<ReserveResult>("/api/applications/photos/reserve", { idempotencyKey, personKeys, ext });
      return data ?? { ok: false, message: "Photo uploads aren’t available right now. Try again." };
    },
    async confirm(paths: string[]): Promise<ConfirmResult> {
      const { data } = await postJson<ConfirmResult>("/api/applications/photos/confirm", { idempotencyKey, paths });
      return data ?? { ok: false, message: "The photos couldn’t be saved. Try again." };
    },
    upload: (args) => uploadToSignedUrl({ ...args, apiKey }),
  };
}
