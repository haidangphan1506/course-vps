import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const ok = await verifyToken(request.cookies.get(COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return ok ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (ok) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
