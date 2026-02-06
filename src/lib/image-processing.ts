import sharp from 'sharp';
import exifr from 'exifr';

export interface ProcessedImage {
    originalBuffer: Buffer;
    displayBuffer: Buffer;
    thumbBuffer: Buffer;
    width: number;
    height: number;
    exif: {
        dateTaken?: Date;
        cameraMake?: string;
        cameraModel?: string;
        gpsLatitude?: number;
        gpsLongitude?: number;
    } | null;
}

/**
 * Process an image buffer into three WebP variants:
 * - original: lossless WebP (highest quality)
 * - display: WebP quality 90, max 2000px (for photo viewer)
 * - thumb: WebP quality 70, max 400px (for gallery grid)
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
    // Extract EXIF before processing (sharp may strip it)
    const exif = await extractExif(buffer);

    // Get original dimensions
    const metadata = await sharp(buffer).metadata();

    // Process all three variants in parallel
    const [originalBuffer, displayBuffer, thumbBuffer] = await Promise.all([
        // Original: WebP lossless, preserving full quality
        sharp(buffer)
            .webp({ lossless: true })
            .toBuffer(),

        // Display: WebP quality 90, max 2000px on longest side
        sharp(buffer)
            .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 90 })
            .toBuffer(),

        // Thumbnail: WebP quality 70, max 400px on longest side
        sharp(buffer)
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 70 })
            .toBuffer(),
    ]);

    return {
        originalBuffer,
        displayBuffer,
        thumbBuffer,
        width: metadata.width || 0,
        height: metadata.height || 0,
        exif,
    };
}

/**
 * Extract EXIF metadata from an image buffer
 */
async function extractExif(buffer: Buffer): Promise<ProcessedImage['exif']> {
    try {
        const data = await exifr.parse(buffer, {
            pick: ['DateTimeOriginal', 'Make', 'Model', 'GPSLatitude', 'GPSLongitude']
        });

        if (!data) return null;

        return {
            dateTaken: data.DateTimeOriginal ? new Date(data.DateTimeOriginal) : undefined,
            cameraMake: data.Make,
            cameraModel: data.Model,
            gpsLatitude: data.GPSLatitude,
            gpsLongitude: data.GPSLongitude,
        };
    } catch (error) {
        console.error('Failed to extract EXIF:', error);
        return null;
    }
}

/**
 * Get file extension from mime type
 */
export function getExtensionFromMime(mimeType: string): string {
    const map: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
    };
    return map[mimeType] || 'jpg';
}
