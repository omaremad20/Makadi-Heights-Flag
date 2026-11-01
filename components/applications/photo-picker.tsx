"use client";

import { createContext, useContext, useId, useRef } from "react";
import { Camera, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PhotoSelection, PhotoSlot } from "@/hooks/use-photo-selection";
import { PHOTO_ACCEPT_ATTRIBUTE } from "@/lib/photos/constants";

const PhotoSelectionContext = createContext<PhotoSelection | null>(null);
export const PhotoSelectionProvider = PhotoSelectionContext.Provider;

/**
 * Optional photo for one person. Renders inside a FormSection grid and spans
 * the full row. The file never leaves the browser until the application is
 * submitted; only the compressed copy is uploaded.
 */
export function PhotoPicker({ slot, personLabel }: { slot: PhotoSlot; personLabel: string }) {
  const selection = useContext(PhotoSelectionContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  if (!selection) return null;

  const state = selection.slots[slot];
  const errorId = `${id}-error`;

  return (
    <div className="sm:col-span-2 flex flex-col gap-2">
      <span className="text-sm font-medium text-neutral-800">
        Photo <span className="font-normal text-neutral-500">(optional)</span>
      </span>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-neutral-300 bg-white p-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400">
          {state?.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={state.photo.previewUrl} alt={`Selected photo for ${personLabel}`} className="size-full object-cover" />
          ) : state?.status === "preparing" ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-brand-secondary" />
          ) : (
            <Camera aria-hidden="true" className="size-6" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          {state?.status === "ready" ? (
            <span className="text-neutral-700">
              Ready · {Math.max(1, Math.round(state.photo.blob.size / 1024))} KB
            </span>
          ) : state?.status === "preparing" ? (
            <span className="text-neutral-600" role="status">Preparing photo…</span>
          ) : (
            <span className="text-neutral-600">A clear, front-facing photo. JPEG, PNG or WebP.</span>
          )}
          {state?.status === "error" && (
            <span id={errorId} role="alert" className="text-destructive">
              {state.message}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={PHOTO_ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-describedby={state?.status === "error" ? errorId : undefined}
            aria-label={`Choose a photo for ${personLabel}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow choosing the same file again
              if (file) void selection.select(slot, file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state?.status === "preparing"}
            onClick={() => inputRef.current?.click()}
          >
            {state?.status === "ready" ? <RefreshCw aria-hidden="true" /> : <Camera aria-hidden="true" />}
            {state?.status === "ready" ? "Change" : "Add photo"}
          </Button>
          {state && state.status !== "preparing" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove photo for ${personLabel}`}
              onClick={() => selection.remove(slot)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
