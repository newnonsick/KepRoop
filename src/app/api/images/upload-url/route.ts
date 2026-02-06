
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { generateUploadUrl } from "@/lib/s3";
import { nanoid } from "nanoid";
import { getExtensionFromMime } from "@/lib/image-processing"; // Reusing this helper

async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { filename, contentType, albumId } = await request.json();

        if (!filename || !contentType || !albumId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Check if user has edit permission for the album
        const canUpload = await checkAlbumPermission(userId, albumId, "editor");
        if (!canUpload) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Generate a unique S3 key
        // We will store the "original" upload. 
        // Note: Without server-side processing, we just store the raw file.
        // The client-side logic keeps "original.webp" naming convention if it converts, 
        // but for now we expect raw uploads.
        // Let's stick to the existing folder structure: albums/{albumId}/{nanoid}/original.{ext}

        const ext = getExtensionFromMime(contentType);
        const imageId = nanoid();
        const baseKey = `albums/${albumId}/${imageId}`;
        const key = `${baseKey}/original.${ext}`;

        const url = await generateUploadUrl(key, contentType);

        return NextResponse.json({
            url,
            key,
            imageId, // Return the ID we generated so the client can use it for registration if needed
            baseKey  // useful for client to know where things are going?
        });

    } catch (error) {
        console.error("Presigned URL error:", error);
        return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
    }
}
