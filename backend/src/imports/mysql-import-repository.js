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

  async listReviews(importJobId) {
    const [rows] = await this.pool.execute(
      `SELECT id, import_job_id, reviewer_id, review_scope, decision, reason,
              validation_report_sha256, actor_source, created_at
       FROM import_reviews
       WHERE import_job_id = ?
       ORDER BY created_at ASC`,
      [importJobId]
    );
    return rows.map((row) => ({
      id: row.id,
      importJobId: row.import_job_id,
      reviewerId: row.reviewer_id,
      scope: row.review_scope,
      decision: row.decision,
      reason: row.reason,
      validationReportSha256: row.validation_report_sha256,
      actorSource: row.actor_source,
      createdAt: row.created_at
    }));
  }

  async createTechnicalReview(review) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT status FROM import_jobs WHERE id = ? FOR UPDATE',
        [review.importJobId]
      );
      if (!rows[0]) {
        const error = new Error('Không tìm thấy import job.');
        error.code = 'IMPORT_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }
      if (rows[0].status !== 'READY_FOR_REVIEW') {
        const error = new Error('Import job không còn ở trạng thái chờ review.');
        error.code = 'IMPORT_NOT_REVIEWABLE';
        error.statusCode = 409;
        throw error;
      }
      await connection.execute(
        `INSERT INTO import_reviews
          (id, import_job_id, reviewer_id, review_scope, decision, reason,
           validation_report_sha256, actor_source)
         VALUES (?, ?, ?, 'TECHNICAL', ?, ?, ?, 'DEVELOPMENT_HEADER')`,
        [review.id, review.importJobId, review.reviewerId, review.decision, review.reason, review.validationReportSha256]
      );
      const nextStatus = review.decision === 'APPROVE' ? 'TECHNICALLY_APPROVED' : 'REJECTED';
      await connection.execute('UPDATE import_jobs SET status = ? WHERE id = ?', [nextStatus, review.importJobId]);
      await connection.commit();
      return { ...review, scope: 'TECHNICAL', actorSource: 'DEVELOPMENT_HEADER', status: nextStatus };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const conflict = new Error('Import job đã có quyết định review bất biến.');
        conflict.code = 'REVIEW_ALREADY_RECORDED';
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}
