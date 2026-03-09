import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page, auth API, and public license endpoints
  // License endpoints are called by client apps for activation/token refresh
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/license/")
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = req.cookies.get("admin_session")?.value;
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
