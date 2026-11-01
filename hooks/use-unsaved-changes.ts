"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UseUnsavedChangesOptions {
  isDirty: boolean;
  isSubmitted: boolean;
}

type Pending = { kind: "href"; href: string } | { kind: "back" };

const GUARD_KEY = "__flagUnsavedGuard";

/**
 * Warns before leaving a form with unsaved input:
 *  - refresh / close tab / typed URL  -> native `beforeunload` prompt
 *    (browsers show their own text; custom messages are ignored);
 *  - internal links (incl. the navbar)  -> in-app confirmation dialog;
 *  - browser Back                      -> in-app confirmation dialog, using one
 *    extra history entry that keeps Next.js' own history state intact.
 * Nothing happens while the form is untouched or after a successful submit.
 */
export function useUnsavedChanges({ isDirty, isSubmitted }: UseUnsavedChangesOptions) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const shouldWarn = isDirty && !isSubmitted;
  const bypass = useRef(false); // set once the user confirmed leaving
  const guarded = useRef(false);

  // 1. refresh / close tab
  useEffect(() => {
    if (!shouldWarn) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypass.current) return;
      e.preventDefault();
      e.returnValue = ""; // required by some browsers to show the prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldWarn]);

  // 2. in-app links (capture phase, before Next.js' Link handler)
  useEffect(() => {
    if (!shouldWarn) return;
    const onClick = (e: MouseEvent) => {
      if (bypass.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window: nothing is lost
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript):/i.test(raw)) return;

      const url = new URL(raw, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) {
        return; // same page (e.g. an in-page anchor)
      }
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: "href", href: url.origin === window.location.origin ? url.pathname + url.search + url.hash : url.href });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [shouldWarn]);

  // 3. browser Back
  useEffect(() => {
    if (!shouldWarn) return;
    if (!guarded.current) {
      // Duplicate the current entry, keeping Next.js' state so its router is unaffected.
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, "", window.location.href);
      guarded.current = true;
    }
    const onPopState = () => {
      if (bypass.current) return;
      // We just left the guard entry: put it back and ask.
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, "", window.location.href);
      setPending({ kind: "back" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [shouldWarn]);

  const confirmNavigation = useCallback(() => {
    const target = pending;
    setPending(null);
    if (!target) return;
    bypass.current = true;
    if (target.kind === "back") {
      window.history.go(guarded.current ? -2 : -1);
      return;
    }
    if (target.href.startsWith("/")) router.push(target.href);
    else window.location.assign(target.href);
  }, [pending, router]);

  const cancelNavigation = useCallback(() => setPending(null), []);

  return { showConfirmDialog: pending !== null, confirmNavigation, cancelNavigation };
}
