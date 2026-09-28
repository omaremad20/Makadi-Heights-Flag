"use client";

import { useEffect, type RefObject } from "react";

/**
 * Locks background page scrolling while `locked` is true.
 *
 * - Pins <body> with `position: fixed` (plain `overflow: hidden` is not enough
 *   on iOS Safari) and offsets it by -scrollY so nothing visually moves.
 * - Compensates for the vanishing desktop scrollbar (body padding + the
 *   `--lock-scrollbar` CSS variable) so there is no layout shift.
 * - Blocks touchmove everywhere except inside `allowScrollRef`, and only there
 *   when that element can actually scroll (stops iOS rubber-banding the page).
 * - Restores every style it touched and the original scroll position on
 *   unlock or unmount.
 */
export function useScrollLock(
  locked: boolean,
  allowScrollRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };

    html.style.setProperty("--lock-scrollbar", `${scrollbarWidth}px`);
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    if (scrollbarWidth > 0) {
      const currentPadding =
        parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) return; // allow pinch-zoom
      const allowed = allowScrollRef?.current;
      if (
        allowed &&
        event.target instanceof Node &&
        allowed.contains(event.target) &&
        allowed.scrollHeight > allowed.clientHeight
      ) {
        return;
      }
      if (event.cancelable) event.preventDefault();
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchmove", onTouchMove);

      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.paddingRight = previous.paddingRight;
      html.style.removeProperty("--lock-scrollbar");

      // "instant" so a global `scroll-behavior: smooth` can't animate the restore.
      window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    };
  }, [locked, allowScrollRef]);
}
