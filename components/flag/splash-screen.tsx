"use client";

import { useEffect, useState } from "react";
import { MakadiHeghitsLogo } from "./makadi-heights-logo";

export function SplashScreen() {
  const [dismissed, setDismissed] = useState(false);

  // Safety net: if this node is ever removed without its animationend
  // firing (Fast Refresh, an early route change, etc.), don't leave the
  // page permanently unscrollable.
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("overflow-y-hidden");
    };
  }, []);

  if (dismissed) return null;

  return (
    <div
      aria-hidden="true"
      className="splash-overlay fixed inset-0 z-100 flex flex-col items-center justify-center gap-5 bg-brand-bg"
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        document.documentElement.classList.remove("overflow-y-hidden");
        setDismissed(true);
      }}
    >
      <div className="splash-logo">
        <MakadiHeghitsLogo />
      </div>
      <p className="splash-tagline font-brand-body text-base tracking-widest uppercase text-brand-secondary">
        Made of moments
      </p>
    </div>
  );
}
