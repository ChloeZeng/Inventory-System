import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE } from "@/lib/cookies";

// First visit (nobody chosen yet on this browser): start at the welcome screens.
export function proxy(request: NextRequest) {
  if (!request.cookies.get(USER_COOKIE)?.value) return NextResponse.redirect(new URL("/welcome", request.url));
  return NextResponse.next();
}

export const config = {
  // every page except the welcome screens, API routes, Next internals and static files
  matcher: ["/((?!welcome|api|_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
