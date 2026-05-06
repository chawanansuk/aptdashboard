import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Page-level auth gate.
 *
 * /api/* routes are NOT covered here — they perform their own auth() check
 * and return JSON 401/403 directly. Redirecting JSON requests to an HTML
 * /login page would break fetch() consumers.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  // Public auth pages — never redirect away from them
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname + (search || ""));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Skip API routes (handlers do their own 401 JSON), Next internals, and static assets
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icon-.*\\.svg|apple-touch-icon\\.svg).*)",
  ],
};
