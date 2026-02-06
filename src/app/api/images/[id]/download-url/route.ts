import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { generateDownloadUrl } from "@/lib/s3";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const userId = await getUserId();
    const resolvedParams = await params;
    const imageId = resolvedParams.id;

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 1. Get image details to find albumId
        const image = await db.query.images.findFirst({
            where: eq(images.id, imageId),
            columns: {
                id: true,
                albumId: true,
                s3Key: true,
                s3KeyOriginal: true,
                originalFilename: true,
            }
        });

        if (!image) {
            return NextResponse.json({ error: "Image not found" }, { status: 404 });
        }

        // 2. Check viewer permission
        const canView = await checkAlbumPermission(userId, image.albumId, "viewer");
        if (!canView) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 3. Generate fresh URL
        // 3. Generate fresh URL
        // Prefer original key, fallback to standard key
        const key = image.s3KeyOriginal || image.s3Key;

        if (!key) {
            return NextResponse.json({ error: "Image key not found" }, { status: 404 });
        }

        const url = await generateDownloadUrl(key);

        // Use original filename or fallback
        const filename = image.originalFilename || `photo-${image.id}.webp`;

        return NextResponse.json({ url, filename });

    } catch (error) {
        console.error("Download URL error:", error);
        return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }
}
