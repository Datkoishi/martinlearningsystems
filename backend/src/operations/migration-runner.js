import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/;
const LEDGER_TABLE = 'schema_migrations';
const DEMO_MIGRATION_SEQUENCE = 3;

export class MigrationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
    this.details = details;
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const columnKey = (table, column) => `${table}.${column}`;

const MIGRATION_SHAPES = new Map([
  [1, { tables: ['service_status'] }],
  [2, { tables: [
    'content_sources', 'usage_licenses', 'media_assets', 'exams', 'exam_versions', 'exam_sections',
    'stimuli', 'stimulus_versions', 'question_groups', 'questions', 'question_versions', 'question_options',
    'question_group_items', 'exam_items', 'source_provenance', 'asset_references', 'import_jobs'
  ] }],
  [4, {
    tables: ['import_reviews'],
    checks: [
      ['import_jobs.status has technical approval', (schema) => schema.columns.get(columnKey('import_jobs', 'status'))?.columnType.includes('TECHNICALLY_APPROVED') === true]
    ]
  }],
  [5, {
    tables: ['users', 'user_roles', 'auth_sessions', 'audit_logs'],
    columns: [['import_jobs', 'created_by_user_id']]
  }],
  [6, {
    tables: ['import_publications'],
    columns: [['import_reviews', 'package_sha256']],
    checks: [
      ['import_reviews.review_scope has academic', (schema) => schema.columns.get(columnKey('import_reviews', 'review_scope'))?.columnType.includes('ACADEMIC') === true],
      ['import_jobs.status has academic approval', (schema) => schema.columns.get(columnKey('import_jobs', 'status'))?.columnType.includes('ACADEMICALLY_APPROVED') === true]
    ]
  }],
  [7, { tables: ['exam_attempts'] }],
  [8, {
    tables: ['attempt_responses', 'attempt_score_revisions', 'attempt_operations'],
    columns: [
      ['exam_attempts', 'answer_revision'],
      ['exam_attempts', 'last_saved_at'],
      ['exam_attempts', 'current_score_revision']
    ]
  }],
  [9, {
    tables: ['assembly_runs'],
    columns: [
      ['question_versions', 'curriculum_version'],
      ['question_versions', 'topic_key'],
      ['question_versions', 'skill_key'],
      ['question_versions', 'difficulty'],
      ['question_versions', 'estimated_seconds'],
      ['question_versions', 'family_key']
    ]
  }],
  [10, {
    tables: ['exam_blueprints', 'exam_blueprint_versions', 'assembly_reviews', 'assembly_publications'],
    columns: [['assembly_runs', 'blueprint_version_id']],
    checks: [
      ['exams.source_id is nullable', (schema) => schema.columns.get(columnKey('exams', 'source_id'))?.isNullable === 'YES']
    ]
  }],
  [12, {
    tables: ['media_asset_storage_events'],
    columns: [
      ['media_assets', 'storage_backend'],
      ['media_assets', 'object_storage_key'],
      ['media_assets', 'object_promoted_at'],
      ['media_assets', 'object_rolled_back_at']
    ]
  }],
  [13, {
    tables: [
      'assessment_definitions', 'assessment_framework_versions',
      'assessment_framework_reviews', 'assessment_results'
    ]
  }]
]);

export const loadMigrations = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name)).map((entry) => entry.name).sort();
  if (names.length === 0) throw new MigrationError('MIGRATIONS_NOT_FOUND', `Không tìm thấy migration trong ${directory}.`);

  const migrations = await Promise.all(names.map(async (version) => {
    const match = version.match(MIGRATION_FILE);
    const sql = await fs.readFile(path.join(directory, version), 'utf8');
    return {
      version,
      sequence: Number(match[1]),
      checksumSha256: sha256(sql),
      sql
    };
  }));

  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.sequence !== expected) {
      throw new MigrationError('MIGRATION_SEQUENCE_INVALID', `Migration phải liên tục từ 001; thiếu hoặc trùng sequence ${String(expected).padStart(3, '0')}.`);
    }
  });
  return migrations;
};

export const normalizeMigrationSql = (sql) => {
  const withoutDatabaseCreate = sql.replace(
    /^\uFEFF?\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?[A-Za-z0-9_]+`?[\s\S]*?;\s*/i,
    ''
  );
  const normalized = withoutDatabaseCreate.replace(/^\s*USE\s+`?[A-Za-z0-9_]+`?\s*;\s*/gim, '').trim();
  if (/(^|;)\s*(USE|CREATE\s+DATABASE|DROP\s+DATABASE)\b/im.test(normalized)) {
    throw new MigrationError('MIGRATION_DATABASE_COMMAND_FORBIDDEN', 'Migration không được đổi/tạo/xóa database khi chạy qua runner.');
  }
  if (!normalized) throw new MigrationError('MIGRATION_EMPTY', 'Migration không có câu lệnh sau khi chuẩn hóa.');
  return normalized;
};

const schemaShapeState = (schema, sequence) => {
  const shape = MIGRATION_SHAPES.get(sequence);
  if (!shape) return { observable: false, complete: false, evidence: false, missing: [] };

  const missing = [];
  const markers = [];
  for (const table of shape.tables || []) {
    const exists = schema.tables.has(table);
    markers.push(exists);
    if (!exists) missing.push(`table:${table}`);
  }
  for (const [table, column] of shape.columns || []) {
    const exists = schema.columns.has(columnKey(table, column));
    markers.push(exists);
    if (!exists) missing.push(`column:${table}.${column}`);
  }
  for (const [label, check] of shape.checks || []) {
    const passed = check(schema);
    markers.push(passed);
    if (!passed) missing.push(`check:${label}`);
  }
  return {
    observable: true,
    complete: missing.length === 0,
    evidence: markers.some(Boolean),
    missing
  };
};

export const validateLedger = (migrations, rows) => {
  const migrationByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const applied = new Map();
  for (const row of rows) {
    const migration = migrationByVersion.get(row.version);
    if (!migration) {
      throw new MigrationError('MIGRATION_FILE_MISSING', `Ledger có ${row.version} nhưng file không còn trong source.`);
    }
    if (Number(row.sequence_number) !== migration.sequence) {
      throw new MigrationError('MIGRATION_SEQUENCE_DRIFT', `Sequence của ${row.version} không khớp ledger.`);
    }
    if (row.checksum_sha256 !== migration.checksumSha256) {
      throw new MigrationError('MIGRATION_CHECKSUM_DRIFT', `Checksum của migration đã ghi ${row.version} đã thay đổi.`);
    }
    applied.set(row.version, row);
  }
  return applied;
};

const ledgerSql = `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
  version VARCHAR(255) NOT NULL,
  sequence_number INT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  operation ENUM('APPLIED', 'ADOPTED', 'SKIPPED', 'BOOTSTRAPPED') NOT NULL,
  execution_ms INT UNSIGNED NOT NULL DEFAULT 0,
  applied_by VARCHAR(160) NOT NULL,
  applied_at DATETIME(6) NOT NULL,
  PRIMARY KEY (version),
  UNIQUE KEY uq_schema_migrations_sequence (sequence_number)
) ENGINE=InnoDB`;

const readSchema = async (connection, database) => {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?`,
    [database]
  );
  const tables = new Set();
  const columns = new Map();
  for (const row of rows) {
    const table = row.TABLE_NAME || row.table_name;
    const column = row.COLUMN_NAME || row.column_name;
    tables.add(table);
    columns.set(columnKey(table, column), {
      isNullable: row.IS_NULLABLE || row.is_nullable,
      columnType: row.COLUMN_TYPE || row.column_type
    });
  }
  return { tables, columns };
};

const ledgerExists = async (connection, database) => {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, LEDGER_TABLE]
  );
  return Number(rows[0]?.count) === 1;
};

const readLedger = async (connection) => {
  const [rows] = await connection.query(
    `SELECT version, sequence_number, checksum_sha256, operation, execution_ms, applied_by, applied_at
     FROM ${LEDGER_TABLE}
     ORDER BY sequence_number`
  );
  return rows;
};

const recordMigration = async (connection, migration, operation, executionMs, actor) => {
  await connection.execute(
    `INSERT INTO ${LEDGER_TABLE}
      (version, sequence_number, checksum_sha256, operation, execution_ms, applied_by, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(6))`,
    [migration.version, migration.sequence, migration.checksumSha256, operation, Math.max(0, Math.round(executionMs)), actor]
  );
};

const databaseHasApplicationTables = (schema) => [...schema.tables].some((table) => table !== LEDGER_TABLE);

const assertNoLaterEvidence = (schema, migrations, fromIndex) => {
  for (const migration of migrations.slice(fromIndex + 1)) {
    const state = schemaShapeState(schema, migration.sequence);
    if (state.evidence) {
      throw new MigrationError(
        'MIGRATION_SCHEMA_INCONSISTENT',
        `Schema có dấu vết của ${migration.version} trong khi migration trước chưa đầy đủ.`,
        { migration: migration.version, missing: state.missing }
      );
    }
  }
};

export class MigrationRunner {
  constructor({ connection, database, migrationsPath, actor = 'eduassess-migrator', lockTimeoutSeconds = 30 }) {
    this.connection = connection;
    this.database = database;
    this.migrationsPath = migrationsPath;
    this.actor = actor;
    this.lockTimeoutSeconds = lockTimeoutSeconds;
    if (!/^[A-Za-z0-9._:@/-]{1,160}$/.test(actor)) {
      throw new MigrationError('MIGRATION_ACTOR_INVALID', 'MIGRATION_ACTOR có ký tự hoặc độ dài không hợp lệ.');
    }
  }

  async acquireLock() {
    this.lockName = `eduassess:migrations:${this.database}`.slice(0, 64);
    const [rows] = await this.connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [this.lockName, this.lockTimeoutSeconds]);
    if (Number(rows[0]?.acquired) !== 1) {
      throw new MigrationError('MIGRATION_LOCK_TIMEOUT', 'Không lấy được advisory lock migration trong thời gian cho phép.');
    }
  }

  async releaseLock() {
    if (!this.lockName) return;
    await this.connection.execute('SELECT RELEASE_LOCK(?) AS released', [this.lockName]);
    this.lockName = null;
  }

  async status() {
    const migrations = await loadMigrations(this.migrationsPath);
    const exists = await ledgerExists(this.connection, this.database);
    const rows = exists ? await readLedger(this.connection) : [];
    const applied = validateLedger(migrations, rows);
    const schema = await readSchema(this.connection, this.database);
    return {
      ledgerExists: exists,
      hasUntrackedSchema: !exists && databaseHasApplicationTables(schema),
      migrations: migrations.map((migration) => ({
        version: migration.version,
        sequence: migration.sequence,
        checksumSha256: migration.checksumSha256,
        state: applied.get(migration.version)?.operation || 'PENDING'
      }))
    };
  }

  async migrate({ adoptExisting = false, includeDemo = false } = {}) {
    const migrations = await loadMigrations(this.migrationsPath);
    await this.acquireLock();
    try {
      await this.connection.query(ledgerSql);
      let rows = await readLedger(this.connection);
      let applied = validateLedger(migrations, rows);
      let schema = await readSchema(this.connection, this.database);
      const operations = [];

      if (applied.size === 0 && databaseHasApplicationTables(schema)) {
        if (!adoptExisting) {
          throw new MigrationError(
            'MIGRATION_EXISTING_SCHEMA_UNTRACKED',
            'Database đã có schema nhưng chưa có ledger; chạy lại với --adopt-existing sau khi backup và xác minh.'
          );
        }

        for (let index = 0; index < migrations.length; index += 1) {
          const migration = migrations[index];
          if (migration.sequence === DEMO_MIGRATION_SEQUENCE && !includeDemo) {
            const laterEvidence = migrations.slice(index + 1).some((later) => schemaShapeState(schema, later.sequence).evidence);
            const operation = laterEvidence ? 'ADOPTED' : 'SKIPPED';
            await recordMigration(this.connection, migration, operation, 0, this.actor);
            operations.push({ version: migration.version, operation });
            applied.set(migration.version, { operation });
            continue;
          }
          const state = schemaShapeState(schema, migration.sequence);
          if (!state.observable) break;
          if (state.complete) {
            await recordMigration(this.connection, migration, 'ADOPTED', 0, this.actor);
            operations.push({ version: migration.version, operation: 'ADOPTED' });
            applied.set(migration.version, { operation: 'ADOPTED' });
            continue;
          }
          if (state.evidence) {
            throw new MigrationError(
              'MIGRATION_PARTIALLY_APPLIED',
              `Không thể adopt ${migration.version}: schema mới áp dụng một phần.`,
              { migration: migration.version, missing: state.missing }
            );
          }
          assertNoLaterEvidence(schema, migrations, index);
          break;
        }
      }

      for (const migration of migrations) {
        if (applied.has(migration.version)) continue;
        if (migration.sequence === DEMO_MIGRATION_SEQUENCE && !includeDemo) {
          await recordMigration(this.connection, migration, 'SKIPPED', 0, this.actor);
          operations.push({ version: migration.version, operation: 'SKIPPED' });
          applied.set(migration.version, { operation: 'SKIPPED' });
          continue;
        }

        schema = await readSchema(this.connection, this.database);
        const state = schemaShapeState(schema, migration.sequence);
        if (state.complete) {
          if (!adoptExisting) {
            throw new MigrationError(
              'MIGRATION_APPLIED_WITHOUT_LEDGER',
              `${migration.version} đã có đủ schema nhưng chưa có ledger; cần --adopt-existing sau khi kiểm tra.`
            );
          }
          await recordMigration(this.connection, migration, 'ADOPTED', 0, this.actor);
          operations.push({ version: migration.version, operation: 'ADOPTED' });
          applied.set(migration.version, { operation: 'ADOPTED' });
          continue;
        }
        if (state.evidence) {
          throw new MigrationError(
            'MIGRATION_PARTIALLY_APPLIED',
            `${migration.version} có dấu vết schema nhưng chưa đầy đủ; dừng để sửa thủ công trên bản sao.`,
            { migration: migration.version, missing: state.missing }
          );
        }

        const startedAt = Date.now();
        try {
          await this.connection.query(normalizeMigrationSql(migration.sql));
        } catch (error) {
          throw new MigrationError(
            'MIGRATION_EXECUTION_FAILED',
            `Migration ${migration.version} thất bại: ${error.code || error.message}`,
            { migration: migration.version, databaseErrorCode: error.code }
          );
        }
        const executionMs = Date.now() - startedAt;
        await recordMigration(this.connection, migration, 'APPLIED', executionMs, this.actor);
        operations.push({ version: migration.version, operation: 'APPLIED', executionMs });
        applied.set(migration.version, { operation: 'APPLIED' });
      }

      rows = await readLedger(this.connection);
      validateLedger(migrations, rows);
      return { operations, appliedCount: rows.length, latestVersion: rows.at(-1)?.version || null };
    } finally {
      await this.releaseLock();
    }
  }
}
