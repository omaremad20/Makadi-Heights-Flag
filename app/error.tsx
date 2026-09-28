"use client";

import { useEffect, useRef, useState } from "react";

import {
  brandButtonClassName,
  StatusPage,
} from "@/components/shared/status-page";

const MIN_RETRY_VISIBLE_MS = 600;

interface ErrorProps {
  error: {
    digest?: string;
    message: string;
    name: string;
  };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function handleRetry() {
    setIsRetrying(true);

    timeoutRef.current = setTimeout(() => {
      reset();
    }, MIN_RETRY_VISIBLE_MS);
  }

  return (
    <StatusPage
      title="Something went wrong"
      message={"We hit a snag loading this page. Please try again."}
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
