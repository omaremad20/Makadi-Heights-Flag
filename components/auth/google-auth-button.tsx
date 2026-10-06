"use client";

import { loginWithGoogle } from "@/lib/services/auth/auth.service";
import { useState } from "react";
import { Button } from "../ui/button";
import GoogleIcon from "../icons/GoogleIcon";

export function GoogleAuthButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      await loginWithGoogle();
      // On success the browser is redirected to Google, then back to
      // /auth/callback, so no further state change happens here.
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <Button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        aria-label="Continue with Google"
        className="cursor-pointer w-full"
      >
        {status === "loading" ? (
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
          />
        ) : (
          <GoogleIcon />
        )}
        <span>
          {status === "loading" ? "Connecting…" : "Continue with Google"}
        </span>
      </Button>

      <p
        role="status"
        aria-live="polite"
        className="mt-3 min-h-5 text-center text-sm text-brand-secondary"
      >
        {status === "error" && "We couldn't reach Google. Please try again."}
      </p>
    </div>
  );
}
