import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("accessToken")?.value;

    if (!accessToken) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
        columns: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
        }
    });

    if (!user) {
        return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user });
}
