"use client";

import { useEffect, useState, useCallback } from "react";

interface UseUnsavedChangesOptions {
  isDirty: boolean;
  isSubmitted: boolean;
}

export function useUnsavedChanges({ isDirty, isSubmitted }: UseUnsavedChangesOptions) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);

  const shouldWarn = isDirty && !isSubmitted;

  // 1. Browser refresh / tab close protection via beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!shouldWarn) return;
      e.preventDefault();
      // Required for modern browsers to display the native "Leave site?" prompt
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldWarn]);

  // 2. In-app link navigation interception
  useEffect(() => {
    if (!shouldWarn) return;

    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore hash links, javascript:, tel:, mailto:, new tabs
      if (
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("tel:") ||
        href.startsWith("mailto:") ||
        target.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      ) {
        return;
      }

      // Intercept and present custom confirmation dialog
      e.preventDefault();
      e.stopPropagation();
      setPendingNavigationUrl(href);
      setShowConfirmDialog(true);
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => {
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, [shouldWarn]);

  const confirmNavigation = useCallback(() => {
    setShowConfirmDialog(false);
    if (pendingNavigationUrl) {
      window.location.href = pendingNavigationUrl;
      setPendingNavigationUrl(null);
    }
  }, [pendingNavigationUrl]);

  const cancelNavigation = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingNavigationUrl(null);
  }, []);

  return {
    showConfirmDialog,
    confirmNavigation,
    cancelNavigation,
  };
}
