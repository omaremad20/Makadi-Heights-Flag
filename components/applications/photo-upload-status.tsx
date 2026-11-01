"use client";

import { CircleCheck, CircleX, LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PhotoJobState } from "@/lib/photos/photo-upload-flow";

type Item = PhotoJobState & { label: string };

const STATUS_TEXT: Record<PhotoJobState["status"], string> = {
  queued: "Waiting…",
  uploading: "Uploading…",
  confirming: "Saving…",
  done: "Uploaded",
  failed: "Failed",
};

/** Per-person photo upload progress, shown after the application is submitted. */
export function PhotoUploadStatus({
  items,
  running,
  hasFailures,
  onRetry,
}: {
  items: Item[];
  running: boolean;
  hasFailures: boolean;
  onRetry: () => void;
}) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.status === "done").length;

  return (
    <section aria-labelledby="photo-upload-heading" className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="photo-upload-heading" className="text-sm font-semibold text-neutral-900">
          Photos · {done} of {items.length} uploaded
        </h3>
        {hasFailures && !running && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Retry failed photos
          </Button>
        )}
      </div>

      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item.personKey} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-neutral-800">{item.label}</span>
              <span
                className={
                  item.status === "failed"
                    ? "flex items-center gap-1 text-destructive"
                    : item.status === "done"
                      ? "flex items-center gap-1 text-emerald-700"
                      : "flex items-center gap-1 text-neutral-600"
                }
              >
                {item.status === "done" ? (
                  <CircleCheck aria-hidden="true" className="size-4" />
                ) : item.status === "failed" ? (
                  <CircleX aria-hidden="true" className="size-4" />
                ) : (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                )}
                {STATUS_TEXT[item.status]}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`Photo upload for ${item.label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((item.status === "done" ? 1 : item.progress) * 100)}
              className="h-1.5 overflow-hidden rounded-full bg-neutral-100"
            >
              <div
                className={item.status === "failed" ? "h-full bg-destructive/60" : "h-full bg-brand-secondary transition-[width]"}
                style={{ width: `${Math.round((item.status === "done" ? 1 : item.progress) * 100)}%` }}
              />
            </div>
            {item.error && <p className="text-xs text-destructive">{item.error}</p>}
          </li>
        ))}
      </ul>

      {hasFailures && !running && (
        <p className="mt-3 text-xs text-neutral-600">
          Your application is saved. Photos that failed can be retried now; if it keeps failing, bring them to the community office.
        </p>
      )}
    </section>
  );
}
