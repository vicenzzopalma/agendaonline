"use client";

import { useEffect, useRef } from "react";

export function useNavigationDrawer(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const main = mainRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = "hidden";
    const items = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input,select,[tabindex="0"]',
        ) ?? [],
      ).filter((item) => item.getClientRects().length > 0);
    items()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = items();
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const desktop = window.matchMedia("(min-width: 75rem)");
    const onResize = () => {
      if (desktop.matches) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
      if (main) main.inert = false;
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return { panelRef, mainRef };
}
