"use client";

import { useEffect, useRef, useState } from "react";
import {
  StatusPage,
  brandButtonClassName,
} from "@/components/flag/status-page";

// Minimum time the "Trying again…" state stays visible, so a retry that
// resolves instantly still reads as a deliberate action rather than a
// no-op. Purely a perception thing — reset() itself is not delayed by app logic.
const MIN_RETRY_VISIBLE_MS = 600;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Route errors are already reported by Next.js; this just surfaces
    // them in the local dev console for convenience.
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }, [error]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleRetry() {
    setIsRetrying(true);
    // If the underlying error is fixed, reset() re-renders the segment and
    // this component unmounts — isRetrying never needs to be cleared. If
    // the error persists, the boundary re-catches and this component
    // remounts fresh, which naturally puts the button back to "Try again".
    timeoutRef.current = setTimeout(() => {
      reset();
    }, MIN_RETRY_VISIBLE_MS);
  }

  return (
    <StatusPage
      title="Something went wrong"
      message="We hit a snag loading this page. Please try again."
      action={
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          aria-busy={isRetrying}
          className={`${brandButtonClassName} disabled:cursor-not-allowed disabled:opacity-70`}
        >
          {isRetrying ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
              />
              <span>Trying again…</span>
            </>
          ) : (
            <span>Try again</span>
          )}
        </button>
      }
    />
  );
}
