import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { checkAlbumPermission } from "@/lib/auth/rbac";
import { generateUploadUrl } from "@/lib/s3";
import { z } from "zod";
import { nanoid } from "nanoid";

// Helper
async function getUserId() {
    const cookieStore = await cookies();
    const token = cookieStore.get("accessToken")?.value;
    if (!token) return null;
    const payload = await verifyAccessToken(token);
    return payload?.userId;
}

const reqSchema = z.object({
    albumId: z.string().uuid().optional(),
    contentType: z.string(), // e.g. image/jpeg
    filename: z.string(),
});

export async function POST(request: Request) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await request.json();
        const { albumId, contentType, filename } = reqSchema.parse(body);

        if (albumId) {
            const canUpload = await checkAlbumPermission(userId, albumId, "editor");
            if (!canUpload) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        // Generate Key
        // If no albumId, it's a new cover. Use a temp path or just a flat structure for covers.
        const key = albumId
            ? `albums/${albumId}/${nanoid()}`
            : `temp_covers/${userId}/${nanoid()}`;

        // Generate URL
        const url = await generateUploadUrl(key, contentType);

        return NextResponse.json({ url, key });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
