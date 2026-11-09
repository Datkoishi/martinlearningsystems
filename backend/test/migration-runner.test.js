import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  loadMigrations,
  MigrationError,
  normalizeMigrationSql,
  validateLedger
} from '../src/operations/migration-runner.js';

const withMigrationDirectory = async (context, files) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-migrations-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  await Promise.all(Object.entries(files).map(([name, contents]) => fs.writeFile(path.join(directory, name), contents)));
  return directory;
};

test('migration discovery enforces sequence and computes stable checksums', async (context) => {
  const directory = await withMigrationDirectory(context, {
    '001_first.sql': 'CREATE TABLE first_table (id INT);\n',
    '002_second.sql': 'CREATE TABLE second_table (id INT);\n'
  });

  const first = await loadMigrations(directory);
  const second = await loadMigrations(directory);
  assert.deepEqual(first.map(({ version, sequence }) => ({ version, sequence })), [
    { version: '001_first.sql', sequence: 1 },
    { version: '002_second.sql', sequence: 2 }
  ]);
  assert.match(first[0].checksumSha256, /^[a-f0-9]{64}$/);
  assert.equal(first[0].checksumSha256, second[0].checksumSha256);
});

test('migration discovery rejects sequence gaps', async (context) => {
  const directory = await withMigrationDirectory(context, {
    '001_first.sql': 'SELECT 1;',
    '003_gap.sql': 'SELECT 3;'
  });

  await assert.rejects(
    loadMigrations(directory),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_SEQUENCE_INVALID'
  );
});

test('migration SQL is pinned to the configured connection database', () => {
  const normalized = normalizeMigrationSql(`CREATE DATABASE IF NOT EXISTS legacy_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
    USE legacy_db;
    CREATE TABLE example (id INT);`);
  assert.equal(normalized, 'CREATE TABLE example (id INT);');

  assert.throws(
    () => normalizeMigrationSql('CREATE TABLE ok_table (id INT); USE another_db;'),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_DATABASE_COMMAND_FORBIDDEN'
  );
});

test('ledger validation detects checksum, sequence and missing-file drift', () => {
  const migrations = [{ version: '001_first.sql', sequence: 1, checksumSha256: 'a'.repeat(64) }];
  const valid = validateLedger(migrations, [{
    version: '001_first.sql', sequence_number: 1, checksum_sha256: 'a'.repeat(64), operation: 'APPLIED'
  }]);
  assert.equal(valid.get('001_first.sql').operation, 'APPLIED');

  assert.throws(
    () => validateLedger(migrations, [{ version: '001_first.sql', sequence_number: 1, checksum_sha256: 'b'.repeat(64) }]),
    (error) => error.code === 'MIGRATION_CHECKSUM_DRIFT'
  );
  assert.throws(
    () => validateLedger(migrations, [{ version: '001_first.sql', sequence_number: 2, checksum_sha256: 'a'.repeat(64) }]),
    (error) => error.code === 'MIGRATION_SEQUENCE_DRIFT'
  );
  assert.throws(
    () => validateLedger(migrations, [{ version: '999_missing.sql', sequence_number: 999, checksum_sha256: 'a'.repeat(64) }]),
    (error) => error.code === 'MIGRATION_FILE_MISSING'
  );
});
