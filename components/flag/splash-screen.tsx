"use client";

import { useState } from "react";
import { MakadiHeghitsLogo } from "./makadi-heights-logo";

/**
 * Always renders — on the server, on the client's hydration pass, and
 * after. Whether it's actually *visible* is decided by pure CSS before
 * React ever runs (see the blocking script + `data-splash` attribute in
 * layout.tsx), which is what eliminates the flash-of-content bug: the
 * overlay is part of the very first HTML painted, not something that
 * only appears once JS has loaded and hydrated.
 *
 * The only thing React does here is remove the node from the DOM once
 * its CSS animation finishes — whether that's the full ~2.8s first-visit
 * sequence or the ~1ms "skip" variant used on repeat visits within the
 * same tab session. Both are real animations that fire `animationend`,
 * so this is the one code path for both cases.
 */
export function SplashScreen() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      aria-hidden="true"
      className="splash-overlay fixed inset-0 z-100 flex flex-col items-center justify-center gap-5 bg-brand-bg"
      onAnimationEnd={(event) => {
        // Ignore the logo/tagline's own animations bubbling up.
        if (event.target !== event.currentTarget) return;
        document.documentElement.style.overflow = "";
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
