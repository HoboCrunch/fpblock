/**
 * Pure predicate deciding whether a captured anchor click should start the
 * top-of-header route progress bar. Kept free of DOM/React so it can be unit
 * tested; the component resolves the raw values and passes them in.
 *
 * We start the bar only for genuine in-app navigations to a different path —
 * the same set of clicks Next.js handles as a client-side route change.
 */
export interface NavClickInput {
  /** Fully-resolved destination URL of the clicked anchor. */
  destUrl: URL;
  /** The current page URL. */
  currentUrl: URL;
  /** The anchor's `target` attribute (e.g. "_blank"), or null. */
  target: string | null;
  /** Whether the anchor has a `download` attribute. */
  hasDownload: boolean;
  /** Mouse button (0 = primary/left). */
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** Whether something earlier in the event path already called preventDefault. */
  defaultPrevented: boolean;
}

export function shouldStartNavigation(c: NavClickInput): boolean {
  // Only a plain left-click triggers client navigation.
  if (c.defaultPrevented) return false;
  if (c.button !== 0) return false;
  if (c.metaKey || c.ctrlKey || c.shiftKey || c.altKey) return false;

  // New-tab / download / non-self targets do a separate load, not an in-app nav.
  if (c.hasDownload) return false;
  if (c.target && c.target !== "_self") return false;

  // Only http(s) — skips mailto:, tel:, etc. (different protocol / origin).
  if (c.destUrl.protocol !== "http:" && c.destUrl.protocol !== "https:") return false;

  // External links leave the app — the browser handles those.
  if (c.destUrl.origin !== c.currentUrl.origin) return false;

  // Only when the path actually changes. Query-only and hash-only changes on the
  // same path are typically instant client state (tab toggles, anchors) and would
  // just flicker the bar.
  if (c.destUrl.pathname === c.currentUrl.pathname) return false;

  return true;
}
