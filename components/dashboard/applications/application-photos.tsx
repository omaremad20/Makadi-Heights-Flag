"use client";

import { useRef, useState } from "react";
import { Camera, CircleCheck, LoaderCircle, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/applications/labels";
import type { PhotoView } from "@/lib/applications/types";
import { adminPhotoDeps } from "@/lib/photos/admin-photo-api";
import { PhotoPrepareError, preparePhoto } from "@/lib/photos/compress";
import { PHOTO_ACCEPT_ATTRIBUTE } from "@/lib/photos/constants";
import { uploadPhotos, type PhotoJobState } from "@/lib/photos/photo-upload-flow";

function PhotoCard({
  applicationId,
  photo,
  disabled,
  onBusy,
  onDone,
}: {
  applicationId: string;
  photo: PhotoView;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PhotoJobState | { status: "preparing"; progress: 0; personKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const working = state !== null && state.status !== "done" && state.status !== "failed";

  const replace = async (file: File) => {
    setError(null);
    onBusy(true);
    setState({ status: "preparing", progress: 0, personKey: photo.personKey });
    try {
      const prepared = await preparePhoto(file);
      URL.revokeObjectURL(prepared.previewUrl);
      const result = await uploadPhotos({
        jobs: [{ personKey: photo.personKey, blob: prepared.blob, ext: prepared.ext }],
        deps: adminPhotoDeps(applicationId),
        onState: setState,
      });
      const final = result.get(photo.personKey);
      if (final?.status === "done") {
        toast.success(`Photo updated for ${photo.personLabel}. The approval status is unchanged.`);
        onDone();
      } else {
        setError(final?.error ?? "The photo couldn’t be uploaded. Try again.");
      }
    } catch (e) {
      setError(e instanceof PhotoPrepareError ? e.message : "The photo couldn’t be prepared. Try another photo.");
      setState(null);
    } finally {
      onBusy(false);
    }
  };

  return (
    <li className="flex gap-3 rounded-lg border p-3">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
          <img src={photo.url} alt={`Photo of ${photo.personLabel}`} className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <UserRound className="size-8" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="truncate font-medium">{photo.personLabel}</p>
        <p className="text-xs text-muted-foreground">
          {photo.url ? `Uploaded ${formatDateTime(photo.uploadedAt)}` : "No photo"}
          {photo.replacedCount > 0 ? ` · replaced ${photo.replacedCount}×` : ""}
        </p>
        {working && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {state?.status === "preparing" ? "Preparing…" : state?.status === "confirming" ? "Saving…" : `Uploading ${Math.round((state?.progress ?? 0) * 100)}%`}
          </div>
        )}
        {state?.status === "done" && (
          <p className="flex items-center gap-1 text-xs text-emerald-700">
            <CircleCheck className="size-3.5" aria-hidden /> Updated
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-auto">
          <input
            ref={input}
            type="file"
            accept={PHOTO_ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-label={`Choose a new photo for ${photo.personLabel}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void replace(file);
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={disabled || working} onClick={() => input.current?.click()}>
            <Camera aria-hidden />
            {photo.url ? "Replace photo" : "Add photo"}
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Admin photo management. Views use short-lived signed URLs; replacements go
 * through admin-only reservations and never overwrite an object. The previous
 * photo is kept for 30 days (retention policy) and the change is recorded in
 * the history. Replacing a photo never changes the approval status.
 */
export function ApplicationPhotos({
  applicationId,
  photos,
  onChanged,
}: {
  applicationId: string;
  photos: PhotoView[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Photos are private. Links shown here expire after 5 minutes; reopen the application to refresh them.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {photos.map((p) => (
          <PhotoCard key={p.personKey} applicationId={applicationId} photo={p} disabled={busy} onBusy={setBusy} onDone={onChanged} />
        ))}
      </ul>
    </div>
  );
}
