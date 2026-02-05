
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });
    return s3Client.send(command);
}
