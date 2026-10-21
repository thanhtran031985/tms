// Lưu file trên S3 (MinIO khi dev). Mọi key có tiền tố `tenants/{tenantId}/` (ADR-002).
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireEnv } from '../env';

export function createS3() {
  return new S3Client({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY'),
      secretAccessKey: requireEnv('S3_SECRET_KEY'),
    },
  });
}

export function tenantObjectKey(tenantId: string, ...parts: string[]) {
  if (!tenantId) throw new Error('tenantObjectKey cần tenantId');
  return ['tenants', tenantId, ...parts].join('/');
}

export function getSignedDownloadUrl(
  client: S3Client,
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: requireEnv('S3_BUCKET'), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export function getSignedUploadUrl(
  client: S3Client,
  key: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<string> {
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: requireEnv('S3_BUCKET'), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}
