"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { shouldStartNavigation } from "@/lib/navigation/should-start-navigation";

// Slim orange bar pinned to the top of the admin header. Starts when an in-app
// navigation begins (a captured anchor click), trickles toward 90% so it keeps
// moving during slow server-rendered loads, and completes when the new route
// commits (pathname change). A safety timeout prevents it ever sticking if a
// navigation is canceled.

const TRICKLE_MS = 400; // cadence of the creep toward 90%
const SAFETY_MS = 8000; // auto-complete if no route commit arrives
const HOLD_MS = 180; // brief hold at 100% before fading
const FADE_MS = 250; // opacity fade-out duration

export function RouteProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);

  const activeRef = useRef(false);
  const reducedMotion = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    reducedMotion.current =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  const clearRunTimers = useCallback(() => {
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
    if (safety.current) {
      clearTimeout(safety.current);
      safety.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearRunTimers();
    setProgress(100);
    // Hold at 100%, fade opacity out, then reset width while invisible.
    finishTimers.current.push(
      setTimeout(() => setActive(false), HOLD_MS),
      setTimeout(() => setProgress(0), HOLD_MS + FADE_MS)
    );
  }, [clearRunTimers]);

  const start = useCallback(() => {
    if (activeRef.current) return; // already running — let it ride
    finishTimers.current.forEach(clearTimeout);
    finishTimers.current = [];
    activeRef.current = true;
    setActive(true);
    setProgress(reducedMotion.current ? 90 : 8);
    clearRunTimers();
    if (!reducedMotion.current) {
      trickle.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : Math.min(90, p + Math.max(0.5, (90 - p) * 0.12))));
      }, TRICKLE_MS);
    }
    safety.current = setTimeout(finish, SAFETY_MS);
  }, [clearRunTimers, finish]);

  // Start on eligible internal-link clicks. Capture phase runs before Next's own
  // Link handler, so defaultPrevented is still false here.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor || !anchor.getAttribute("href")) return;
      let destUrl: URL;
      try {
        destUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (
        shouldStartNavigation({
          destUrl,
          currentUrl: new URL(window.location.href),
          target: anchor.getAttribute("target"),
          hasDownload: anchor.hasAttribute("download"),
          button: e.button,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          defaultPrevented: e.defaultPrevented,
        })
      ) {
        start();
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // Complete once the new route commits.
  useEffect(() => {
    if (activeRef.current) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Tidy up on unmount.
  useEffect(
    () => () => {
      clearRunTimers();
      finishTimers.current.forEach(clearTimeout);
    },
    [clearRunTimers]
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px]"
      style={{ opacity: active ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <div
        className="h-full bg-[var(--accent-orange)]"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease",
          boxShadow:
            "0 0 8px var(--accent-orange), 0 0 4px var(--accent-orange)",
        }}
      />
    </div>
  );
}
