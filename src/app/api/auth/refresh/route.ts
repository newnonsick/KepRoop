import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { performTokenRefresh } from "@/lib/auth/refresh";

/** Cookie settings shared by POST and GET handlers */
function setAuthCookies(
    cookieStore: Awaited<ReturnType<typeof cookies>>,
    accessToken: string,
    refreshToken: string
) {
    cookieStore.set("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60, // 1 hour
        path: "/",
    });

    cookieStore.set("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 90, // 90 days
        path: "/",
    });
}

export async function POST(request: Request) {
    const { apiKey } = await getAuthContext();
    if (apiKey) {
        return NextResponse.json({ error: "API Key access not allowed for this endpoint" }, { status: 403 });
    }

    try {
        const cookieStore = await cookies();
        const oldRefreshToken = cookieStore.get("refreshToken")?.value;

        if (!oldRefreshToken) {
            return NextResponse.json({ error: "No refresh token" }, { status: 401 });
        }

        const result = await performTokenRefresh(oldRefreshToken);
        if (!result) {
            return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
        }

        setAuthCookies(cookieStore, result.accessToken, result.refreshToken);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const redirectPath = url.searchParams.get("redirect") || "/albums";

    try {
        const cookieStore = await cookies();
        const oldRefreshToken = cookieStore.get("refreshToken")?.value;

        if (!oldRefreshToken) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        const result = await performTokenRefresh(oldRefreshToken);
        if (!result) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        const response = NextResponse.redirect(new URL(redirectPath, request.url));

        response.cookies.set("accessToken", result.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60,
            path: "/",
        });

        response.cookies.set("refreshToken", result.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 90,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Refresh GET error", error);
        return NextResponse.redirect(new URL("/", request.url));
    }
}
