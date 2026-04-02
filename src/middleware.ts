
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/tokens";

// Routes that require authentication (not handled by API self-auth)
const PROTECTED_PATHS = ["/map", "/timeline"];

// API routes that require authentication
const PROTECTED_API_PATHS: string[] = [];

// API routes and page routes that handle their own auth checks (allow unauthenticated requests through)
const SELF_AUTH_PATHS = ["/api/albums", "/api/images", "/api/invites/accept", "/albums"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Self-auth paths handle their own permission checks (for public albums, guest access, etc.)
    const isSelfAuth = SELF_AUTH_PATHS.some((path) => pathname.startsWith(path));
    if (isSelfAuth) {
        return NextResponse.next();
    }

    const isProtectedPage = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
    const isProtectedApi = PROTECTED_API_PATHS.some((path) => pathname.startsWith(path));

    if (!isProtectedPage && !isProtectedApi) {
        return NextResponse.next();
    }

    // Allow API Keys to bypass Edge Middleware (validation happens in route handler)
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer kp_") || authHeader?.startsWith("Api-Key ")) {
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
