import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

/** Path of the public open-tracking image; the token follows it. */
export const OPEN_PIXEL_PATH = "/api/o/";

export function newOpenToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Public address of this app, used in the tracking image URL. Set APP_URL to pin
 * it; otherwise the address the request came in on is used. Returns null for
 * local development, where recipients could never load the image anyway.
 */
export function publicBaseUrl(request: NextRequest): string | null {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const origin = request.nextUrl.origin;
  return origin.startsWith("https://") ? origin : null;
}

/** Adds the invisible 1x1 image at the end of the email's HTML. */
export function withOpenPixel(html: string, baseUrl: string, token: string): string {
  const pixel = `<img src="${baseUrl}${OPEN_PIXEL_PATH}${token}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`;
  return html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel;
}
