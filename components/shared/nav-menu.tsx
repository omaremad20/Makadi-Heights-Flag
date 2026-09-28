"use client";

import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";

const NAV_LINKS = [
  { label: "Flag", id: "flag" },
  { label: "Serenity Beach Access", id: "serenity-beach-access" },
  { label: "Aquapark at Serenity", id: "aquapark-at-serenity" },
  { label: "Dining", id: "dining" }, 
  { label: "Serenity Location", id: "serenity-location" },
] as const;

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  const navbarHeight =
    document.getElementById("site-navbar")?.offsetHeight ?? 0;
  const top =
    target.getBoundingClientRect().top + window.scrollY - navbarHeight;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

export function NavMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const pendingSectionRef = useRef<string | null>(null);

  useScrollLock(open, panelRef);

  // Runs after the scroll lock has been released (hook cleanup runs first),
  // so the page can actually scroll to the chosen section.
  useEffect(() => {
    if (open || !pendingSectionRef.current) return;
    const id = pendingSectionRef.current;
    pendingSectionRef.current = null;
    scrollToSection(id);
  }, [open]);

  // Escape + outside click, only while open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const onLinkClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    pendingSectionRef.current = id;
    setOpen(false);
  };

  const bar =
    "absolute left-1/2 top-1/2 -ml-3 -mt-px block h-0.5 w-6 rounded-full bg-current transition-transform duration-300 ease-out motion-reduce:transition-none";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="relative size-11 rounded-full text-brand-button outline-none focus-visible:ring-[3px] focus-visible:ring-brand-secondary/50"
      >
        <span
          className={`${bar} ${open ? "translate-y-0 rotate-45" : "-translate-y-1"}`}
        />
        <span
          className={`${bar} ${open ? "translate-y-0 -rotate-45" : "translate-y-1"}`}
        />
      </button>

      {/* Backdrop: sits below the navbar, blurs the page behind the menu. */}
      <div
        aria-hidden="true"
        className={`fixed inset-x-0 top-(--navbar-h) h-dvh bg-brand-button/15 backdrop-blur-md transition-[opacity,visibility] duration-300 ease-out motion-reduce:transition-none ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      />

      <nav
        id={panelId}
        ref={panelRef}
        aria-label="Main"
        inert={!open}
        className={`absolute inset-x-0 top-full max-h-[calc(100dvh-var(--navbar-h))] origin-top overflow-y-auto overscroll-contain border-b border-brand-primary/30 bg-brand-bg transition-[opacity,transform,visibility] duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-2 opacity-0"
        }`}
      >
        <ul className="mx-auto max-w-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">
          {NAV_LINKS.map((link, index) => (
            <li
              key={link.id}
              style={{
                transitionDelay: open ? `${120 + index * 60}ms` : "0ms",
              }}
              className={`border-b border-brand-primary/30 transition-[opacity,transform] duration-500 ease-out last:border-b-0 motion-reduce:transition-none ${
                open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
            >
              <a
                href={`#${link.id}`}
                onClick={(event) => onLinkClick(event, link.id)}
                className="flex min-h-14 items-center py-4 font-brand-heading text-xl text-brand-button outline-none transition-colors hover:text-brand-secondary focus-visible:text-brand-secondary focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4 sm:text-2xl"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
