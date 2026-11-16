import { NextResponse } from "next/server";
import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Uses the edge-safe config (no Prisma adapter) and JWT sessions, so no database
// access is needed to authorise a request.
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/login" || pathname.startsWith("/api/auth");

  if (!request.auth && !isAuthRoute) {
    // An unauthenticated API caller wants JSON, not a login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.nextUrl);
    // Return the visitor to whatever they asked for once they sign in.
    if (pathname !== "/") loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (request.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next internals, the auth endpoints themselves, and
    // static assets, which cannot be meaningfully "logged in".
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
