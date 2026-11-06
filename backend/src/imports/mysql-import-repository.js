const mapRow = (row) => row && ({
  id: row.id,
  packageId: row.package_id,
  packageSha256: row.package_sha256,
  status: row.status,
  schemaVersion: row.schema_version,
  sourceStorageKey: row.source_storage_key,
  report: typeof row.validation_report_json === 'string' ? JSON.parse(row.validation_report_json) : row.validation_report_json,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class MysqlImportRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findByPackageHash(packageId, packageSha256) {
    const [rows] = await this.pool.execute(
      `SELECT id, package_id, package_sha256, status, schema_version, source_storage_key,
              validation_report_json, created_at, updated_at
       FROM import_jobs
       WHERE package_id = ? AND package_sha256 = ?
       LIMIT 1`,
      [packageId, packageSha256]
    );
    return mapRow(rows[0]);
  }

  async findById(id) {
    const [rows] = await this.pool.execute(
      `SELECT id, package_id, package_sha256, status, schema_version, source_storage_key,
              validation_report_json, created_at, updated_at
       FROM import_jobs
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return mapRow(rows[0]);
  }

  async create(job) {
    await this.pool.execute(
      `INSERT INTO import_jobs
        (id, package_id, package_sha256, status, schema_version, source_storage_key, validation_report_json)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      [job.id, job.packageId, job.packageSha256, job.status, job.schemaVersion, job.sourceStorageKey, JSON.stringify(job.report)]
    );
    return this.findById(job.id);
  }
}
