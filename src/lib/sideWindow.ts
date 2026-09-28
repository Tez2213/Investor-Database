/**
 * LinkedIn refuses to be shown inside other sites (it sends frame-ancestors
 * restrictions), so profiles can't be embedded in the page. Instead they open
 * in one reusable window docked to the right half of the screen, next to the
 * portal. While that window is open it follows along as you move between
 * investors.
 */

const WINDOW_NAME = "investor-linkedin";

let sideWindow: Window | null = null;

function features(): string {
  const { availWidth, availHeight } = window.screen;
  const left = (window.screen as Screen & { availLeft?: number }).availLeft ?? 0;
  const top = (window.screen as Screen & { availTop?: number }).availTop ?? 0;
  const width = Math.max(480, Math.min(960, Math.round(availWidth * 0.45)));
  return `popup=yes,width=${width},height=${availHeight},left=${left + availWidth - width},top=${top}`;
}

/** Opens (or reuses) the docked window on the given URL. Returns false if the browser blocked it. */
export function openInSideWindow(url: string, { focus = true } = {}): boolean {
  const reuse = sideWindow && !sideWindow.closed;
  const opened = window.open(url, WINDOW_NAME, reuse ? "" : features());
  if (!opened) return false;
  sideWindow = opened;
  if (focus) opened.focus();
  return true;
}

export function isSideWindowOpen(): boolean {
  return Boolean(sideWindow && !sideWindow.closed);
}

/** Shows the URL in the side window only if it is already open, without stealing focus. */
export function followInSideWindow(url: string) {
  if (isSideWindowOpen()) openInSideWindow(url, { focus: false });
}
