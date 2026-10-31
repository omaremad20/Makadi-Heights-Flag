"use client";

import { useCallback, useRef, useState } from "react";

import type { PhotoFlowDeps, PhotoJob, PhotoJobState } from "@/lib/photos/photo-upload-flow";
import { uploadPhotos } from "@/lib/photos/photo-upload-flow";

export interface LabelledPhotoJob extends PhotoJob {
  label: string;
}

/**
 * Runs an upload batch and keeps per-person progress for the UI.
 * `retryFailed` re-sends only the failed photos (each retry gets new paths).
 * Concurrent runs are blocked so a double click can never upload twice.
 */
export function usePhotoUploads() {
  const [states, setStates] = useState<Record<string, PhotoJobState>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const jobsRef = useRef<Map<string, PhotoJob>>(new Map());
  const depsRef = useRef<PhotoFlowDeps | null>(null);

  const run = useCallback(async (jobs: PhotoJob[]) => {
    const deps = depsRef.current;
    if (!deps || runningRef.current || jobs.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    try {
      await uploadPhotos({
        jobs,
        deps,
        onState: (s) => setStates((prev) => ({ ...prev, [s.personKey]: s })),
      });
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  const start = useCallback(
    async (deps: PhotoFlowDeps, jobs: LabelledPhotoJob[]) => {
      depsRef.current = deps;
      jobsRef.current = new Map(jobs.map((j) => [j.personKey, j]));
      setLabels(Object.fromEntries(jobs.map((j) => [j.personKey, j.label])));
      setStates({});
      await run(jobs);
    },
    [run],
  );

  const retryFailed = useCallback(async () => {
    const failed = Object.values(states)
      .filter((s) => s.status === "failed")
      .map((s) => jobsRef.current.get(s.personKey))
      .filter((j): j is PhotoJob => Boolean(j));
    await run(failed);
  }, [run, states]);

  const reset = useCallback(() => {
    jobsRef.current = new Map();
    depsRef.current = null;
    setStates({});
    setLabels({});
  }, []);

  const list = Object.values(states);
  return {
    items: list.map((s) => ({ ...s, label: labels[s.personKey] ?? s.personKey })),
    running,
    hasFailures: list.some((s) => s.status === "failed"),
    start,
    retryFailed,
    reset,
  };
}

export type PhotoUploads = ReturnType<typeof usePhotoUploads>;
