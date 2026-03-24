import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const user = req.auth?.user as any;
  const role = user?.role as string | undefined;

  // Public routes — always accessible
  const publicPaths = ["/login", "/signup", "/api/auth", "/api/webhooks", "/api/debug", "/onboard", "/sign"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    // Redirect logged-in users away from login page
    if (pathname === "/login" && isLoggedIn) {
      const dest = role === "PLATFORM_OWNER" ? "/platform" : role === "CLIENT" ? "/client" : "/admin";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // Landing page — redirect based on role
  if (pathname === "/") {
    if (isLoggedIn) {
      const dest = role === "PLATFORM_OWNER" ? "/platform" : role === "CLIENT" ? "/client" : "/admin";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // Platform owner dashboard — PLATFORM_OWNER only
  if (pathname.startsWith("/platform")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (role !== "PLATFORM_OWNER") {
      const dest = role === "CLIENT" ? "/client" : "/admin";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // Client portal — requires CLIENT role or admin
  if (pathname.startsWith("/client")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // CLIENT users can only access /client routes
    // Admin users can also access for support/debugging
    if (role === "CLIENT" || role === "SUPER_ADMIN" || role === "AGENCY_ADMIN" || role === "ACCOUNT_ADMIN") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // All /admin routes require admin authentication
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // CLIENT role cannot access admin
    if (role === "CLIENT") {
      return NextResponse.redirect(new URL("/client", req.url));
    }

    // Super admin only routes
    if (pathname.startsWith("/admin/agencies")) {
      if (role !== "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
    }

    return NextResponse.next();
  }

  // API routes (except auth) require authentication
  if (pathname.startsWith("/api") && !pathname.startsWith("/api/auth")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all paths except static files and _next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
