import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { buildConfig, ConfigError } from '../src/config.js';

test('development config keeps local-safe defaults', () => {
  const config = buildConfig({}, '/srv/eduassess/backend');

  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.clientOrigin, 'http://localhost:5173');
  assert.equal(config.cookieSecure, false);
  assert.equal(config.importApiEnabled, true);
  assert.equal(config.trustProxy, 0);
  assert.equal(config.shutdownGraceMs, 10000);
  assert.deepEqual(config.metrics, {
    enabled: false,
    port: 9464,
    bindAddress: '127.0.0.1',
    bearerToken: ''
  });
  assert.equal(config.importStoragePath, path.resolve('/srv/eduassess/backend/.data/imports'));
  assert.equal(config.migrationsPath, path.resolve('/srv/eduassess/database/init'));
  assert.equal(config.migrationLockTimeoutSeconds, 30);
  assert.deepEqual(config.objectStorage, {
    enabled: false,
    endpoint: null,
    bucket: '',
    region: 'ap-southeast-1',
    keyPrefix: 'eduassess/media',
    forcePathStyle: false,
    archiveFallback: true,
    credentials: null
  });
});

test('production config accepts explicit HTTPS, secure cookie and database secret', () => {
  const config = buildConfig({
    NODE_ENV: 'production',
    CLIENT_ORIGIN: 'https://eduassess.example',
    COOKIE_SECURE: 'true',
    MYSQL_PASSWORD: 'fixture-production-secret',
    ENABLE_IMPORT_API: 'false',
    TRUST_PROXY: '1',
    SHUTDOWN_GRACE_MS: '15000'
  });

  assert.equal(config.clientOrigin, 'https://eduassess.example');
  assert.equal(config.cookieSecure, true);
  assert.equal(config.importApiEnabled, false);
  assert.equal(config.trustProxy, 1);
  assert.equal(config.shutdownGraceMs, 15000);
});

test('production config fails closed for insecure origin, cookie or default password', () => {
  const base = {
    NODE_ENV: 'production',
    CLIENT_ORIGIN: 'https://eduassess.example',
    COOKIE_SECURE: 'true',
    MYSQL_PASSWORD: 'fixture-production-secret'
  };

  assert.throws(
    () => buildConfig({ ...base, CLIENT_ORIGIN: 'http://eduassess.example' }),
    (error) => error instanceof ConfigError && /HTTPS/.test(error.message)
  );
  assert.throws(
    () => buildConfig({ ...base, COOKIE_SECURE: 'false' }),
    (error) => error instanceof ConfigError && /COOKIE_SECURE/.test(error.message)
  );
  assert.throws(
    () => buildConfig({ ...base, MYSQL_PASSWORD: 'change_me' }),
    (error) => error instanceof ConfigError && /MYSQL_PASSWORD/.test(error.message)
  );
});

test('config rejects malformed values instead of silently using fallbacks', () => {
  assert.throws(() => buildConfig({ BACKEND_PORT: 'not-a-port' }), ConfigError);
  assert.throws(() => buildConfig({ AUTH_SESSION_HOURS: '0' }), ConfigError);
  assert.throws(() => buildConfig({ ENABLE_IMPORT_API: 'yes' }), ConfigError);
  assert.throws(() => buildConfig({ CLIENT_ORIGIN: 'https://example.test/path' }), ConfigError);
  assert.throws(() => buildConfig({ TRUST_PROXY: '11' }), ConfigError);
  assert.throws(() => buildConfig({ MIGRATION_LOCK_TIMEOUT_SECONDS: '301' }), ConfigError);
  assert.throws(() => buildConfig({ OBJECT_STORAGE_ENABLED: 'yes' }), ConfigError);
  assert.throws(() => buildConfig({ OBJECT_STORAGE_ENABLED: 'true', OBJECT_STORAGE_BUCKET: '' }), ConfigError);
  assert.throws(() => buildConfig({ OBJECT_STORAGE_KEY_PREFIX: '../escape' }), ConfigError);
  assert.throws(() => buildConfig({ OBJECT_STORAGE_ACCESS_KEY_ID: 'only-one' }), ConfigError);
});

test('object storage accepts S3-compatible development config and rejects insecure production endpoint', () => {
  const config = buildConfig({
    OBJECT_STORAGE_ENABLED: 'true',
    OBJECT_STORAGE_ENDPOINT: 'http://minio:9000',
    OBJECT_STORAGE_BUCKET: 'eduassess-media',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_ARCHIVE_FALLBACK: 'true',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'fixture-access',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'fixture-secret'
  });
  assert.equal(config.objectStorage.enabled, true);
  assert.equal(config.objectStorage.endpoint, 'http://minio:9000');
  assert.equal(config.objectStorage.forcePathStyle, true);
  assert.equal(config.objectStorage.credentials.secretAccessKey, 'fixture-secret');

  assert.throws(() => buildConfig({
    NODE_ENV: 'production',
    CLIENT_ORIGIN: 'https://eduassess.example',
    COOKIE_SECURE: 'true',
    MYSQL_PASSWORD: 'fixture-production-secret',
    OBJECT_STORAGE_ENABLED: 'true',
    OBJECT_STORAGE_ENDPOINT: 'http://minio:9000',
    OBJECT_STORAGE_BUCKET: 'eduassess-media'
  }), ConfigError);
});

test('secrets can be read from absolute files without exposing file contents', () => {
  const secrets = new Map([
    ['/run/secrets/mysql_password', 'database-secret\n'],
    ['/run/secrets/object_access', 'object-access\n'],
    ['/run/secrets/object_secret', 'object-secret\n'],
    ['/run/secrets/metrics_token', `${'m'.repeat(40)}\n`]
  ]);
  const readFileSync = (file) => {
    if (!secrets.has(file)) throw new Error('missing fixture');
    return secrets.get(file);
  };
  const config = buildConfig({
    NODE_ENV: 'production',
    CLIENT_ORIGIN: 'https://eduassess.example',
    COOKIE_SECURE: 'true',
    MYSQL_PASSWORD_FILE: '/run/secrets/mysql_password',
    OBJECT_STORAGE_ENABLED: 'true',
    OBJECT_STORAGE_BUCKET: 'eduassess-media',
    OBJECT_STORAGE_ACCESS_KEY_ID_FILE: '/run/secrets/object_access',
    OBJECT_STORAGE_SECRET_ACCESS_KEY_FILE: '/run/secrets/object_secret',
    METRICS_ENABLED: 'true',
    METRICS_BIND_ADDRESS: '0.0.0.0',
    METRICS_BEARER_TOKEN_FILE: '/run/secrets/metrics_token'
  }, '/srv/eduassess/backend', { readFileSync });

  assert.equal(config.database.password, 'database-secret');
  assert.equal(config.objectStorage.credentials.accessKeyId, 'object-access');
  assert.equal(config.metrics.bearerToken, 'm'.repeat(40));
  assert.equal(config.metrics.enabled, true);
});

test('secret files and metrics configuration fail closed', () => {
  const reader = () => 'line-one\nline-two\n';
  assert.throws(() => buildConfig({
    MYSQL_PASSWORD: 'direct',
    MYSQL_PASSWORD_FILE: '/run/secrets/mysql'
  }, process.cwd(), { readFileSync: reader }), /không được cấu hình đồng thời/);
  assert.throws(() => buildConfig({
    MYSQL_PASSWORD_FILE: 'relative-secret'
  }, process.cwd(), { readFileSync: reader }), /đường dẫn tuyệt đối/);
  assert.throws(() => buildConfig({
    MYSQL_PASSWORD_FILE: '/run/secrets/mysql'
  }, process.cwd(), { readFileSync: reader }), /một secret không rỗng/);
  assert.throws(() => buildConfig({
    METRICS_ENABLED: 'true',
    METRICS_BEARER_TOKEN: 'too-short'
  }), /ít nhất 32/);
  assert.throws(() => buildConfig({
    METRICS_ENABLED: 'true',
    METRICS_BEARER_TOKEN: 'm'.repeat(40),
    METRICS_PORT: '3000'
  }), /phải khác PORT/);
  assert.throws(() => buildConfig({ METRICS_BIND_ADDRESS: '192.0.2.1' }), /không thuộc/);
});
