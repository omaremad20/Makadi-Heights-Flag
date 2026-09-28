"use client";

import { useEffect, useState } from "react";
import { MakadiHeghitsLogo } from "../shared/makadi-heights-logo";

const unlockScroll = () =>
  document.documentElement.removeAttribute("data-splash-lock");

export function SplashScreen() {
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    unlockScroll();
    setDismissed(true);
  };

  // Backstop if animationend fired before hydration and was never seen.
  useEffect(() => {
    const timer = setTimeout(dismiss, 2900);
    return () => clearTimeout(timer);
  }, []);

  // iOS Safari: block touch scrolling while the splash is up.
  // Non-passive listener, removed the moment the splash is dismissed.
  useEffect(() => {
    if (dismissed) return;
    if (!document.documentElement.hasAttribute("data-splash-lock")) return; // repeat visit
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // allow pinch-zoom
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div
      aria-hidden="true"
      className="splash-overlay fixed inset-0 z-100 flex flex-col items-center justify-center gap-5 bg-brand-bg"
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        dismiss();
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
