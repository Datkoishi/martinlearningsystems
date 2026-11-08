import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { MediaPromotionService } from '../src/operations/media-promotion-service.js';
import { PublishedAssetStorage } from '../src/storage/published-asset-storage.js';
import { ObjectStorageError, S3ObjectStorage } from '../src/storage/s3-object-storage.js';

const ASSET_ID = '123e4567-e89b-42d3-a456-426614174000';
const bytes = Buffer.from('verified-media-bytes');
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
const baseAsset = () => ({
  id: ASSET_ID,
  storageKey: `${ASSET_ID}/source.zip#assets/example.png`,
  storageBackend: 'ARCHIVE',
  objectStorageKey: null,
  objectPromotedAt: null,
  objectRolledBackAt: null,
  mimeType: 'image/png',
  sha256: digest,
  sizeBytes: bytes.length,
  approvalStatus: 'PUBLISHED'
});

class FakeS3Client {
  constructor() {
    this.objects = new Map();
    this.putCount = 0;
  }

  async send(command) {
    if (command.constructor.name === 'GetObjectCommand') {
      if (!this.objects.has(command.input.Key)) throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
      const data = this.objects.get(command.input.Key);
      return { Body: { transformToByteArray: async () => data } };
    }
    if (command.constructor.name === 'PutObjectCommand') {
      this.putCount += 1;
      this.objects.set(command.input.Key, Buffer.from(command.input.Body));
      return {};
    }
    throw new Error(`Unexpected command ${command.constructor.name}`);
  }
}

class MemoryPromotionRepository {
  constructor(asset = baseAsset()) {
    this.asset = structuredClone(asset);
    this.events = [];
  }

  async findAssetById(id) {
    return id === this.asset.id ? structuredClone(this.asset) : null;
  }

  async listPromotionCandidates(limit) {
    return this.asset.storageBackend === 'ARCHIVE' && !this.asset.objectRolledBackAt
      ? [structuredClone(this.asset)].slice(0, limit)
      : [];
  }

  async markPromoted({ asset, objectStorageKey, allowRolledBack }) {
    if (this.asset.objectRolledBackAt && !allowRolledBack) throw Object.assign(new Error('rolled back'), { code: 'MEDIA_ASSET_ROLLED_BACK' });
    if (this.asset.storageBackend === 'OBJECT') return { changed: false, asset: structuredClone(this.asset) };
    assert.equal(asset.sha256, this.asset.sha256);
    this.asset.storageBackend = 'OBJECT';
    this.asset.objectStorageKey = objectStorageKey;
    this.asset.objectPromotedAt = new Date();
    this.asset.objectRolledBackAt = null;
    this.events.push('PROMOTED');
    return { changed: true, asset: structuredClone(this.asset) };
  }

  async markRolledBack({ asset }) {
    assert.equal(asset.id, this.asset.id);
    if (this.asset.storageBackend === 'ARCHIVE' && this.asset.objectRolledBackAt) {
      return { changed: false, asset: structuredClone(this.asset) };
    }
    this.asset.storageBackend = 'ARCHIVE';
    this.asset.objectRolledBackAt = new Date();
    this.events.push('ROLLED_BACK');
    return { changed: true, asset: structuredClone(this.asset) };
  }

  async getStatus() {
    return {
      pending: Number(this.asset.storageBackend === 'ARCHIVE' && !this.asset.objectRolledBackAt),
      active: Number(this.asset.storageBackend === 'OBJECT'),
      rolledBack: Number(Boolean(this.asset.objectRolledBackAt)),
      total: 1,
      events: this.events.length
    };
  }
}

const createObjectStorage = () => {
  const client = new FakeS3Client();
  const storage = new S3ObjectStorage({
    endpoint: 'http://minio:9000',
    bucket: 'eduassess-media',
    region: 'us-east-1',
    keyPrefix: 'eduassess/media',
    forcePathStyle: true,
    credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' }
  }, client);
  return { client, storage };
};

test('S3 storage uses content-addressed keys and verifies existing/uploaded bytes', async () => {
  const { client, storage } = createObjectStorage();
  const key = storage.keyForSha256(digest);
  assert.equal(key, `eduassess/media/sha256/${digest.slice(0, 2)}/${digest}`);
  assert.throws(
    () => storage.validateKey(`eduassess/media/sha256/00/${digest}`),
    (error) => error.code === 'OBJECT_KEY_INVALID'
  );

  const first = await storage.ensureVerifiedObject({
    key,
    data: bytes,
    mimeType: 'image/png',
    expectedSha256: digest,
    expectedSizeBytes: bytes.length
  });
  assert.equal(first.uploaded, true);
  assert.equal(client.putCount, 1);

  const retry = await storage.ensureVerifiedObject({
    key,
    data: bytes,
    mimeType: 'image/png',
    expectedSha256: digest,
    expectedSizeBytes: bytes.length
  });
  assert.equal(retry.uploaded, false);
  assert.equal(client.putCount, 1);

  client.objects.set(key, Buffer.from('wrong'));
  await assert.rejects(
    storage.ensureVerifiedObject({ key, data: bytes, mimeType: 'image/png', expectedSha256: digest, expectedSizeBytes: bytes.length }),
    (error) => error instanceof ObjectStorageError && error.code === 'OBJECT_KEY_COLLISION'
  );
});

test('published storage prefers verified object bytes and falls back to archive only when configured', async () => {
  const asset = { ...baseAsset(), storageBackend: 'OBJECT', objectStorageKey: `eduassess/media/sha256/${digest.slice(0, 2)}/${digest}` };
  let archiveReads = 0;
  const archiveStorage = { readArchiveEntry: async () => { archiveReads += 1; return bytes; } };
  const valid = new PublishedAssetStorage({
    archiveStorage,
    objectStorage: { readObject: async () => bytes },
    archiveFallback: true
  });
  assert.deepEqual(await valid.readPublishedAsset(asset), bytes);
  assert.equal(archiveReads, 0);

  const fallback = new PublishedAssetStorage({
    archiveStorage,
    objectStorage: { readObject: async () => Buffer.from('corrupt') },
    archiveFallback: true
  });
  assert.deepEqual(await fallback.readPublishedAsset(asset), bytes);
  assert.equal(archiveReads, 1);

  const strict = new PublishedAssetStorage({
    archiveStorage,
    objectStorage: { readObject: async () => null },
    archiveFallback: false
  });
  await assert.rejects(strict.readPublishedAsset(asset), (error) => error.code === 'OBJECT_ASSET_UNAVAILABLE');
});

test('promotion verifies archive and object before cutover, retries exactly and supports rollback', async () => {
  const repository = new MemoryPromotionRepository();
  const { storage } = createObjectStorage();
  const service = new MediaPromotionService({
    repository,
    archiveStorage: { readArchiveEntry: async () => bytes },
    objectStorage: storage,
    actor: 'unit-promoter'
  });

  const dryRun = await service.promoteAsset(ASSET_ID, { dryRun: true });
  assert.equal(dryRun.dryRun, true);
  assert.equal(repository.asset.storageBackend, 'ARCHIVE');

  const promoted = await service.promoteAsset(ASSET_ID);
  assert.equal(promoted.changed, true);
  assert.equal(repository.asset.storageBackend, 'OBJECT');
  assert.deepEqual(repository.events, ['PROMOTED']);

  const retry = await service.promoteAsset(ASSET_ID);
  assert.equal(retry.changed, false);
  assert.deepEqual(repository.events, ['PROMOTED']);

  const rollback = await service.rollbackAsset(ASSET_ID);
  assert.equal(rollback.changed, true);
  assert.equal(repository.asset.storageBackend, 'ARCHIVE');
  assert.deepEqual(repository.events, ['PROMOTED', 'ROLLED_BACK']);
  await assert.rejects(service.promoteAsset(ASSET_ID), (error) => error.code === 'MEDIA_ASSET_ROLLED_BACK');
  const promotedAgain = await service.promoteAsset(ASSET_ID, { allowRolledBack: true });
  assert.equal(promotedAgain.changed, true);
});

test('promotion never cuts over when archive or object verification fails', async () => {
  const corruptArchiveRepository = new MemoryPromotionRepository();
  const { storage } = createObjectStorage();
  const corruptArchive = new MediaPromotionService({
    repository: corruptArchiveRepository,
    archiveStorage: { readArchiveEntry: async () => Buffer.from('corrupt') },
    objectStorage: storage
  });
  await assert.rejects(corruptArchive.promoteAsset(ASSET_ID), (error) => error.code === 'ARCHIVE_ASSET_INTEGRITY_FAILED');
  assert.equal(corruptArchiveRepository.asset.storageBackend, 'ARCHIVE');

  const objectFailureRepository = new MemoryPromotionRepository();
  const objectFailure = new MediaPromotionService({
    repository: objectFailureRepository,
    archiveStorage: { readArchiveEntry: async () => bytes },
    objectStorage: {
      keyForSha256: () => 'eduassess/media/sha256/failure',
      ensureVerifiedObject: async () => { throw new Error('object unavailable'); }
    }
  });
  await assert.rejects(objectFailure.promoteAsset(ASSET_ID), /object unavailable/);
  assert.equal(objectFailureRepository.asset.storageBackend, 'ARCHIVE');
  assert.deepEqual(objectFailureRepository.events, []);

  const unsafeRollbackRepository = new MemoryPromotionRepository({
    ...baseAsset(),
    storageBackend: 'OBJECT',
    objectStorageKey: 'eduassess/media/sha256/unsafe'
  });
  const unsafeRollback = new MediaPromotionService({
    repository: unsafeRollbackRepository,
    archiveStorage: { readArchiveEntry: async () => Buffer.from('corrupt') }
  });
  await assert.rejects(
    unsafeRollback.rollbackAsset(ASSET_ID),
    (error) => error.code === 'ARCHIVE_ASSET_INTEGRITY_FAILED'
  );
  assert.equal(unsafeRollbackRepository.asset.storageBackend, 'OBJECT');
  assert.deepEqual(unsafeRollbackRepository.events, []);
});
