
import { ImageResponse } from 'next/og';
import { db } from "@/db";
import { albums, images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDownloadUrl } from "@/lib/s3";

export const runtime = 'nodejs'; // Required for pg/drizzle

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const albumId = searchParams.get('albumId');

        if (!albumId) {
            return new ImageResponse(
                (
                    <div style={{
                        display: 'flex',
                        fontSize: 40,
                        color: 'black',
                        background: 'white',
                        width: '100%',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        Keproop Album
                    </div>
                ),
                { width: 1200, height: 630 }
            );
        }

        // Fetch album images
        const albumImages = await db.query.images.findMany({
            where: eq(images.albumId, albumId),
            orderBy: (images, { asc }) => [asc(images.createdAt)],
            limit: 4,
        });

        if (!albumImages || albumImages.length === 0) {
            return new ImageResponse(
                (
                    <div style={{
                        display: 'flex',
                        fontSize: 60,
                        color: '#333',
                        background: '#f8fafc',
                        width: '100%',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold'
                    }}>
                        Keproop
                    </div>
                ),
                { width: 1200, height: 630 }
            );
        }

        // Generate URLs
        const imageUrls = await Promise.all(
            albumImages.map(img => generateDownloadUrl(img.s3Key))
        );

        // Calculate Grid Styles
        // 1 Image: Full Cover
        // 2 Images: Split Vertical
        // 3 Images: 1 Big Left, 2 Small Right (or similar) - Let's keep simple: Grid 2x2.
        // 4 Images: 2x2 Grid

        // Simplified Logic: Always render a container with flex wrap 50% width
        // If 1 image: width 100%, height 100%
        // If 3 images: 4th slot empty? Or 1st Image full width?
        // Let's do a strict 2x2 grid logic for robustness.

        const count = imageUrls.length;

        // Container Style
        const containerStyle = {
            display: 'flex',
            flexWrap: 'wrap',
            width: '100%',
            height: '100%',
            backgroundColor: '#fff',
        } as const;

        return new ImageResponse(
            (
                <div style={containerStyle}>
                    {imageUrls.map((url, i) => {
                        let width = '50%';
                        let height = '50%';

                        if (count === 1) {
                            width = '100%';
                            height = '100%';
                        } else if (count === 2) {
                            width = '50%';
                            height = '100%';
                        } else if (count === 3) {
                            // 1st image 100% width (half height), 2 and 3 50% width (half height)
                            // wait, let's keep it simple.
                            // 2x2 grid. empty slots for missing.
                            width = '50%';
                            height = '50%';
                        }

                        // objectFit: cover is not supported well in satori directly on img tag sometimes without strict dimension?
                        // Satori supports objectFit: 'cover'.

                        return (
                            <img
                                key={i}
                                src={url}
                                style={{
                                    width: width,
                                    height: height,
                                    objectFit: 'cover',
                                    border: '2px solid white', // Optional grid lines
                                }}
                            />
                        );
                    })}
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );

    } catch (e: any) {
        console.log(`${e.message}`);
        return new Response(`Failed to generate the image`, {
            status: 500,
        });
    }
}
