
import { Metadata } from 'next';
import { db } from "@/db";
import { albums, images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDownloadUrl } from "@/lib/s3";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id: albumId } = await params;

    // Fetch album basic info
    const album = await db.query.albums.findFirst({
        where: eq(albums.id, albumId),
        with: {
            images: {
                limit: 4, // Just need to know if there are images, and finding cover
                orderBy: (images, { asc }) => [asc(images.createdAt)]
            }
        }
    });

    if (!album) {
        return {
            title: "Album Not Found | KepRoop",
            description: "The album you are looking for does not exist or has been removed."
        };
    }

    if (album.visibility === 'private') {
        return {
            title: "Private Album | KepRoop",
            description: "This album is private.",
        };
    }

    let imageUrl = '';

    // Strategy:
    // 1. If Cover Image Explicitly Set -> Use it
    // 2. If No Cover but has images -> Use /api/og dynamic grid
    // 3. If No images -> Use default placeholder

    if (album.coverImageId) {
        const coverImage = await db.query.images.findFirst({
            where: eq(images.id, album.coverImageId)
        });
        if (coverImage) {
            imageUrl = await generateDownloadUrl(coverImage.s3KeyThumb || coverImage.s3KeyDisplay || coverImage.s3Key!);
        }
    }

    // specific check: if no cover found OR cover logic failed, and fallback to grid
    // But actually, if we have images, we prefer grid IF no cover is set?
    // User request: "if not have use dynamic grid" - means if no cover photo.

    if (!imageUrl && album.images.length > 0) {
        // Use our dynamic OG generator
        // We need an absolute URL for OG images usually, or relative works for same domain?
        // Next.js metadata resolution builds absolute URLs if base is set, but saftest is absolute.
        // Assuming we rely on next.js to resolve or we use relative path.
        // Let's us absolute path if possible, but relative usually works in Next 13+ metadata.
        imageUrl = `/api/og?albumId=${albumId}`;
    }

    if (!imageUrl) {
        // Fallback default
        imageUrl = '/images/og-default.png'; // Or some default
    }

    return {
        title: `${album.title} | KepRoop`,
        description: album.description || `View ${album.title} on KepRoop`,
        openGraph: {
            title: album.title,
            description: album.description || `View ${album.title} on KepRoop`,
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
            title: album.title,
            description: album.description || `View ${album.title} on KepRoop`,
            images: [imageUrl],
        }
    };
}

export default function AlbumLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
