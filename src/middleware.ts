
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/tokens";

// Routes that always require authentication
const PROTECTED_PATHS = ["/dashboard"];

// API routes that require authentication
const PROTECTED_API_PATHS: string[] = [];

// API routes that handle their own auth checks (allow unauthenticated requests through)
const SELF_AUTH_API_PATHS = ["/api/albums", "/api/images", "/api/invites/accept"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check if path requires auth
    const isProtectedPage = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
    const isProtectedApi = PROTECTED_API_PATHS.some((path) => pathname.startsWith(path));
    const isSelfAuthApi = SELF_AUTH_API_PATHS.some((path) => pathname.startsWith(path));

    // Self-auth APIs handle their own permission checks (for public albums, etc.)
    if (isSelfAuthApi) {
        return NextResponse.next();
    }

    // Page routes under /albums - allow through, API handles auth
    if (pathname.startsWith("/albums")) {
        return NextResponse.next();
    }

    if (!isProtectedPage && !isProtectedApi) {
        return NextResponse.next();
    }

    // Validate Access Token
    const accessToken = request.cookies.get("accessToken")?.value;
    let isValid = false;

    if (accessToken) {
        const payload = await verifyAccessToken(accessToken);
        if (payload) {
            isValid = true;
        }
    }

    // Handle Unauthorized
    if (!isValid) {
        // API Routes -> 401
        if (pathname.startsWith("/api")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Page Routes -> Redirect to refresh
        const refreshUrl = new URL("/api/auth/refresh", request.url);
        refreshUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(refreshUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (Auth endpoints)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public (public folder)
         */
        "/((?!api/auth|_next/static|_next/image|favicon.ico|public).*)",
    ],
};
