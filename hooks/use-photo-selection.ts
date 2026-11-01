"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PhotoPrepareError, preparePhoto, type PreparedPhoto } from "@/lib/photos/compress";

/** Slot ids used by the form: "applicant" | "partner" | "additional:<index>". */
export type PhotoSlot = string;

export type SlotState =
  | { status: "preparing" }
  | { status: "ready"; photo: PreparedPhoto }
  | { status: "error"; message: string };

/**
 * Holds the optional photo chosen for each person on the public form.
 * Photos are compressed as soon as they are chosen, so submitting is not
 * slowed down and problems (e.g. HEIC on desktop Chrome) show up next to the
 * right person immediately. Preview URLs are always revoked.
 */
export function usePhotoSelection() {
  const [slots, setSlots] = useState<Record<PhotoSlot, SlotState>>({});
  const latest = useRef<Record<PhotoSlot, number>>({});
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const revoke = (state: SlotState | undefined) => {
    if (state?.status === "ready") URL.revokeObjectURL(state.photo.previewUrl);
  };

  const select = useCallback(async (slot: PhotoSlot, file: File) => {
    const token = (latest.current[slot] ?? 0) + 1;
    latest.current[slot] = token; // a newer selection for the same slot wins
    setSlots((prev) => {
      revoke(prev[slot]);
      return { ...prev, [slot]: { status: "preparing" } };
    });

    let next: SlotState;
    try {
      next = { status: "ready", photo: await preparePhoto(file) };
    } catch (e) {
      next = {
        status: "error",
        message: e instanceof PhotoPrepareError ? e.message : "This photo couldn’t be prepared. Choose another photo.",
      };
    }

    if (latest.current[slot] !== token) {
      revoke(next);
      return;
    }
    setSlots((prev) => ({ ...prev, [slot]: next }));
  }, []);

  const remove = useCallback((slot: PhotoSlot) => {
    latest.current[slot] = (latest.current[slot] ?? 0) + 1;
    setSlots((prev) => {
      if (!(slot in prev)) return prev;
      revoke(prev[slot]);
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }, []);

  /** Drops photos for people no longer on the form (headcount reduced). */
  const keepOnly = useCallback((valid: (slot: PhotoSlot) => boolean) => {
    setSlots((prev) => {
      let changed = false;
      const next: Record<PhotoSlot, SlotState> = {};
      for (const [slot, state] of Object.entries(prev)) {
        if (valid(slot)) next[slot] = state;
        else {
          revoke(state);
          latest.current[slot] = (latest.current[slot] ?? 0) + 1;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const clear = useCallback(() => {
    setSlots((prev) => {
      Object.values(prev).forEach(revoke);
      return {};
    });
    latest.current = {};
  }, []);

  // Revoke previews on unmount.
  useEffect(() => () => Object.values(slotsRef.current).forEach(revoke), []);

  const preparing = Object.values(slots).some((s) => s.status === "preparing");

  return { slots, select, remove, keepOnly, clear, preparing };
}

export type PhotoSelection = ReturnType<typeof usePhotoSelection>;
