export interface ImageVariant {
    blob: Blob;
    width: number;
    height: number;
}

/**
 * Resizes an image file to a specific maximum dimension, converting to WebP
 * Uses an offscreen canvas or standard canvas for client-side processing
 */
export async function resizeImage(
    file: File,
    maxDimension: number,
    quality: number = 0.9,
    format: string = 'image/webp'
): Promise<ImageVariant> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

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
                reject(new Error("Could not get canvas context"));
                return;
            }

            // High quality image scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) {
                    resolve({ blob, width, height });
                } else {
                    reject(new Error("Canvas to Blob failed"));
                }
            }, format, quality);
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };

        img.src = url;
    });
}
