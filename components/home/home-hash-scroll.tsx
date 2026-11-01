"use client";

import { useEffect } from "react";

const SECTION_IDS = new Set(["flag", "serenity-beach-access", "aquapark-at-serenity", "dining", "serenity-location"]);

function scrollToHash(behavior: ScrollBehavior) {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!SECTION_IDS.has(id)) return;
  const target = document.getElementById(id);
  if (!target) return;
  const navbar = document.getElementById("site-navbar")?.offsetHeight ?? 0;
  const top = target.getBoundingClientRect().top + window.scrollY - navbar;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

/**
 * Arriving on the homepage from another page via "/#section": scrolls to the
 * section below the fixed navbar. Sections stream in (Suspense) and can move
 * as content above them loads, so the position is corrected a few times.
 */
export function HomeHashScroll() {
  useEffect(() => {
    if (!window.location.hash) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = [0, 350, 1200].map((ms, i) =>
      window.setTimeout(() => scrollToHash(i === 0 && !reduce ? "smooth" : "auto"), ms),
    );
    const onHash = () => scrollToHash(reduce ? "auto" : "smooth");
    // Stop correcting as soon as the visitor scrolls on their own.
    const stop = () => timers.forEach(clearTimeout);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      stop();
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, []);
  return null;
}
