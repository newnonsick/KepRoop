
import { Metadata } from 'next';
import { db } from "@/db";
import { albumInvites, albums, images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDownloadUrl } from "@/lib/s3";
import { verifyPassword } from "@/lib/auth/password";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
    const { code } = await params;

    // 1. Parse Token
    // Format: {id}.{secret}
    const [inviteId, secret] = code.split(".");

    // Quick validation
    if (!inviteId || !secret) {
        return {
            title: "Invalid Invite | Keproop",
            description: "This invite link is invalid."
        };
    }

    // 2. Fetch Invite
    const invite = await db.query.albumInvites.findFirst({
        where: eq(albumInvites.id, inviteId),
        with: {
            // We need to fetch basic album info to confirm existence?
            // Usually we assume if invite exists, album exists (FK constraint).
            // But we need Album Title for metadata.
            // drizzle-orm `with` can fetch relations if defined.
        }
    });

    if (!invite) {
        return {
            title: "Invite Not Found | Keproop",
            description: "This invite link may have expired or is invalid."
        };
    }

    // 3. Validate Token Secret (Security Check)
    let isValid = false;
    const storedToken = invite.token.trim();
    if (storedToken === secret.trim()) {
        isValid = true;
    } else if (storedToken.length > 30) {
        // Legacy bcrypted tokens
        isValid = await verifyPassword(secret.trim(), storedToken);
    }

    if (!isValid) {
        return {
            title: "Invalid Invite | Keproop",
            description: "This invite link is invalid."
        };
    }

    // 4. Fetch Album Details
    const album = await db.query.albums.findFirst({
        where: eq(albums.id, invite.albumId),
        with: {
            images: {
                limit: 4,
                orderBy: (images, { asc }) => [asc(images.createdAt)]
            }
        }
    });

    if (!album) {
        return {
            title: "Album Not Found | Keproop",
            description: "The album associated with this invite cannot be found."
        };
    }

    // 5. Generate Metadata Image
    let imageUrl = '';

    if (album.coverImageId) {
        const coverImage = await db.query.images.findFirst({
            where: eq(images.id, album.coverImageId)
        });
        if (coverImage) {
            imageUrl = await generateDownloadUrl(coverImage.s3Key);
        }
    }

    if (!imageUrl && album.images.length > 0) {
        // Reuse the API OG route
        imageUrl = `/api/og?albumId=${album.id}`;
    }

    if (!imageUrl) {
        imageUrl = '/images/og-default.png';
    }

    const title = `Join "${album.title}" on Keproop`;
    const description = `You've been invited to view this album. ${album.images.length} photos.`;

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
            images: [
                {
                    url: imageUrl,
                    width: 1200,
                    height: 630,
                    alt: album.title,
                }
            ],
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: title,
            description: description,
            images: [imageUrl],
        }
    };
}

export default function InviteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
