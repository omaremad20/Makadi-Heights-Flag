"use client";

import { confirmPhotoReplacementAction, reservePhotoReplacementAction } from "@/lib/applications/actions";

import type { PhotoExtension } from "./constants.ts";
import type { ConfirmResult, PhotoFlowDeps, Reservation, ReserveResult } from "./photo-upload-flow.ts";
import { uploadToSignedUrl } from "./signed-upload.ts";

/** Wires the shared upload flow to the admin server actions (admin session, admin-only paths). */
export function adminPhotoDeps(applicationId: string): PhotoFlowDeps {
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return {
    async reserve(personKeys: string[], ext: PhotoExtension): Promise<ReserveResult> {
      const items: Reservation[] = [];
      for (const personKey of personKeys) {
        const res = await reservePhotoReplacementAction(applicationId, personKey, ext);
        if (!res.ok) return { ok: false, message: res.message };
        items.push({ personKey, path: res.data.path, signedUrl: res.data.signedUrl });
      }
      return { ok: true, items };
    },
    async confirm(paths: string[]): Promise<ConfirmResult> {
      const results: Array<{ path: string; result: "confirmed" | "not_uploaded" }> = [];
      for (const path of paths) {
        const res = await confirmPhotoReplacementAction(path);
        if (!res.ok && res.code !== "conflict") return { ok: false, message: res.message };
        results.push({ path, result: res.ok ? "confirmed" : "not_uploaded" });
      }
      return { ok: true, results };
    },
    upload: (args) => uploadToSignedUrl({ ...args, apiKey }),
  };
}
