import { config } from '../src/config.js';
import { db } from '../src/db.js';
import { LocalImportStorage } from '../src/imports/local-import-storage.js';
import { MediaPromotionError, MediaPromotionService } from '../src/operations/media-promotion-service.js';
import { MysqlMediaPromotionRepository } from '../src/operations/mysql-media-promotion-repository.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';

const operations = new Set(['status', 'promote', 'rollback']);
const operation = process.argv[2];
const args = process.argv.slice(3);

const argumentError = (message) => {
  console.error(JSON.stringify({ code: 'MEDIA_ARGUMENT_INVALID', message }));
  process.exit(2);
};

if (!operations.has(operation)) argumentError('Operation phải là status, promote hoặc rollback.');

const options = { limit: 100, assetId: null, allowRolledBack: false, dryRun: false };
const supplied = new Set();
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (supplied.has(argument)) argumentError(`Flag bị lặp: ${argument}`);
  if (argument === '--limit') {
    supplied.add(argument);
    const value = args[index + 1];
    if (!value || !/^\d+$/.test(value)) argumentError('--limit cần số nguyên.');
    options.limit = Number(value);
    index += 1;
  } else if (argument === '--asset-id') {
    supplied.add(argument);
    const value = args[index + 1];
    if (!value) argumentError('--asset-id cần UUID.');
    options.assetId = value;
    index += 1;
  } else if (argument === '--allow-rolled-back') {
    supplied.add(argument);
    options.allowRolledBack = true;
  } else if (argument === '--dry-run') {
    supplied.add(argument);
    options.dryRun = true;
  } else {
    argumentError(`Argument không hỗ trợ: ${argument}`);
  }
}
if (operation === 'status' && supplied.size > 0) argumentError('status không nhận flag.');
if (operation === 'rollback') {
  if (!options.assetId) argumentError('rollback bắt buộc --asset-id.');
  if ([...supplied].some((flag) => flag !== '--asset-id')) {
    argumentError('rollback chỉ nhận --asset-id.');
  }
}
if (operation === 'promote') {
  if (options.assetId && supplied.has('--limit')) argumentError('--limit không dùng cùng --asset-id.');
  if (!options.assetId && options.allowRolledBack) {
    argumentError('--allow-rolled-back chỉ dùng khi promote một --asset-id cụ thể.');
  }
}

let objectStorage = null;
try {
  if (config.objectStorage.enabled) objectStorage = new S3ObjectStorage(config.objectStorage);
  const service = new MediaPromotionService({
    repository: new MysqlMediaPromotionRepository(db),
    archiveStorage: new LocalImportStorage(config.importStoragePath),
    objectStorage,
    actor: process.env.MEDIA_PROMOTION_ACTOR || 'eduassess-media-promoter'
  });
  let result;
  if (operation === 'status') result = await service.status();
  if (operation === 'promote') {
    result = options.assetId
      ? await service.promoteAsset(options.assetId, options)
      : await service.promoteBatch(options);
  }
  if (operation === 'rollback') result = await service.rollbackAsset(options.assetId);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const known = error instanceof MediaPromotionError || typeof error?.code === 'string';
  console.error(JSON.stringify({
    code: known ? error.code : 'MEDIA_STORAGE_UNEXPECTED_ERROR',
    message: known ? error.message : 'Media storage operation không thể hoàn tất.'
  }));
  process.exitCode = 1;
} finally {
  objectStorage?.destroy();
  await db.end();
}
