import crypto from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class ObjectStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ObjectStorageError';
    this.code = code;
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isMissingObject = (error) => (
  error?.name === 'NoSuchKey'
  || error?.name === 'NotFound'
  || error?.$metadata?.httpStatusCode === 404
);
const isPreconditionFailed = (error) => (
  error?.name === 'PreconditionFailed'
  || error?.$metadata?.httpStatusCode === 412
);

export const objectKeyForSha256 = (prefix, digest) => {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new ObjectStorageError('OBJECT_SHA256_INVALID', 'SHA-256 object không hợp lệ.');
  const normalizedPrefix = String(prefix).replace(/\/+$/, '');
  return `${normalizedPrefix}/sha256/${digest.slice(0, 2)}/${digest}`;
};

export class S3ObjectStorage {
  constructor({ endpoint, bucket, region, keyPrefix, forcePathStyle, credentials }, client = null) {
    this.bucket = bucket;
    this.keyPrefix = keyPrefix.replace(/\/+$/, '');
    this.client = client || new S3Client({
      region,
      forcePathStyle,
      ...(endpoint ? { endpoint } : {}),
      ...(credentials ? { credentials } : {})
    });
  }

  validateKey(key) {
    const value = String(key);
    const contentAddress = value.slice(`${this.keyPrefix}/sha256/`.length).match(/^([a-f0-9]{2})\/([a-f0-9]{64})$/);
    if (value.length > 700 || value.startsWith('/') || value.includes('//')
      || value.split('/').includes('..') || !value.startsWith(`${this.keyPrefix}/sha256/`)
      || !contentAddress || contentAddress[1] !== contentAddress[2].slice(0, 2)) {
      throw new ObjectStorageError('OBJECT_KEY_INVALID', 'Object storage key không hợp lệ hoặc nằm ngoài prefix cấu hình.');
    }
    return value;
  }

  keyForSha256(digest) {
    return objectKeyForSha256(this.keyPrefix, digest);
  }

  async readObject(key) {
    const validatedKey = this.validateKey(key);
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: validatedKey }));
      if (!response.Body) throw new ObjectStorageError('OBJECT_BODY_MISSING', 'Object storage trả response không có body.');
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async ensureVerifiedObject({ key, data, mimeType, expectedSha256, expectedSizeBytes }) {
    const validatedKey = this.validateKey(key);
    const bytes = Buffer.from(data);
    if (bytes.length !== expectedSizeBytes || sha256(bytes) !== expectedSha256) {
      throw new ObjectStorageError('OBJECT_SOURCE_INTEGRITY_FAILED', 'Source bytes không khớp metadata trước khi upload.');
    }

    const existing = await this.readObject(validatedKey);
    if (existing) {
      if (existing.length !== expectedSizeBytes || sha256(existing) !== expectedSha256) {
        throw new ObjectStorageError('OBJECT_KEY_COLLISION', 'Object key đã tồn tại nhưng bytes không khớp hash/size.');
      }
      return { key: validatedKey, uploaded: false };
    }

    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: validatedKey,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { sha256: expectedSha256 },
        IfNoneMatch: '*'
      }));
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
      const concurrent = await this.readObject(validatedKey);
      if (!concurrent || concurrent.length !== expectedSizeBytes || sha256(concurrent) !== expectedSha256) {
        throw new ObjectStorageError('OBJECT_KEY_COLLISION', 'Object key được tạo đồng thời nhưng bytes không khớp hash/size.');
      }
      return { key: validatedKey, uploaded: false };
    }
    const uploaded = await this.readObject(validatedKey);
    if (!uploaded || uploaded.length !== expectedSizeBytes || sha256(uploaded) !== expectedSha256) {
      throw new ObjectStorageError('OBJECT_UPLOAD_VERIFICATION_FAILED', 'Object upload không vượt qua read-after-write hash verification.');
    }
    return { key: validatedKey, uploaded: true };
  }

  destroy() {
    this.client.destroy?.();
  }
}
