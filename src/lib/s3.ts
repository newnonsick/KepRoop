
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
    forcePathStyle: true,
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.AWS_S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME!;

/**
 * Upload a buffer directly to S3 (for server-side processed images)
 */
export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });
    return s3Client.send(command);
}

export async function generateUploadUrl(key: string, contentType: string) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes
}

export async function generateDownloadUrl(key: string) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
}

export async function deleteS3Object(key: string) {
    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        return await s3Client.send(command);
    } catch (error: any) {
        // Ignore if object not found (idempotent delete)
        if (error.Code === 'NoSuchKey' || (error.$metadata && error.$metadata.httpStatusCode === 404)) {
            return;
        }
        throw error;
    }
}

/**
 * Delete multiple S3 objects using native S3 batch delete (up to 1,000 per request).
 */
export async function deleteS3Objects(keys: string[]) {
    if (keys.length === 0) return;

    // S3 DeleteObjects supports max 1,000 keys per request
    const BATCH_SIZE = 1_000;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batch = keys.slice(i, i + BATCH_SIZE);
        const command = new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
                Objects: batch.map(Key => ({ Key })),
                Quiet: true,
            },
        });
        try {
            await s3Client.send(command);
        } catch (error) {
            console.error(`Failed to batch delete ${batch.length} S3 objects:`, error);
            // Fallback to individual deletes for this batch
            await Promise.all(batch.map(key => deleteS3Object(key)));
        }
    }
}

/**
 * Get S3 object as stream (for ZIP downloads)
 */
export async function getS3Object(key: string) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    return s3Client.send(command);
}

