import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "tars_session";

const publicPaths = ["/login", "/api/auth/"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some((path) => pathname.startsWith(path));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return handleUnauthenticated(request, pathname);
  }

  try {
    const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(token, secretKey);
    return NextResponse.next();
  } catch {
    return handleUnauthenticated(request, pathname);
  }
}

function handleUnauthenticated(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
