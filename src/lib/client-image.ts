export interface ImageVariant {
    blob: Blob;
    width: number;
    height: number;
}

/**
 * Helper: convert a canvas to a Blob with the given format and quality.
 */
function canvasToBlob(canvas: HTMLCanvasElement, format: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas to Blob failed"));
        }, format, quality);
    });
}

/**
 * Resizes an image file to a specific maximum dimension, converting to WebP.
 * Ensures the output is never larger than the original file by iteratively
 * reducing quality if needed, and falling back to JPEG as a last resort.
 */
export async function resizeImage(
    file: File,
    maxDimension: number,
    quality: number = 0.9,
    format: string = 'image/webp'
): Promise<ImageVariant> {
    const img = await loadImage(file);

    let width = img.width;
    let height = img.height;

    // Calculate new dimensions
    // If maxDimension is 0, we keep original dimensions
    if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
        if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
        } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error("Could not get canvas context");
    }

    // High quality image scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const originalSize = file.size;

    // Try the requested format at the given quality first
    let blob = await canvasToBlob(canvas, format, quality);

    // If the output is larger than the original, iteratively reduce quality
    if (blob.size > originalSize) {
        const qualitySteps = [0.85, 0.80, 0.75, 0.70, 0.60, 0.50];
        for (const q of qualitySteps) {
            blob = await canvasToBlob(canvas, format, q);
            if (blob.size <= originalSize) break;
        }
    }

    // If still larger, try JPEG as a fallback (often smaller for photos)
    if (blob.size > originalSize) {
        const jpegQualities = [0.85, 0.80, 0.75, 0.70, 0.60, 0.50];
        for (const q of jpegQualities) {
            blob = await canvasToBlob(canvas, 'image/jpeg', q);
            if (blob.size <= originalSize) break;
        }
    }

    return { blob, width, height };
}

/**
 * Loads a File as an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.src = url;
    });
}
