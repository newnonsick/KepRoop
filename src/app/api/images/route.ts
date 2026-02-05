import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { db } from "@/db";
import { images } from "@/db/schema";
import { z } from "zod";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const confirmSchema = z.object({
    albumId: z.string().uuid(),
    s3Key: z.string(),
    mimeType: z.string(),
    size: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
});

export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json();
        const { albumId, s3Key, mimeType, size, width, height } = confirmSchema.parse(body);

        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Insert into DB
        const [image] = await db.insert(images).values({
            albumId,
            uploaderId: userId,
            s3Key,
            mimeType,
            size,
            width,
            height,
        }).returning();

        return NextResponse.json({ image });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
