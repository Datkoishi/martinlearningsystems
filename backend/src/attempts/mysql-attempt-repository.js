const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const attemptError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

const mapAttempt = (row) => row && ({
  id: row.id,
  studentUserId: row.student_user_id,
  examVersionId: row.exam_version_id,
  status: row.status,
  idempotencyKey: row.idempotency_key,
  studentSnapshot: parseJson(row.student_snapshot_json),
  scoringSnapshot: parseJson(row.scoring_snapshot_json),
  snapshotSha256: row.snapshot_sha256,
  startedAt: row.started_at,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at
});

const selectAttempt = async (executor, whereSql, values, forUpdate = false) => {
  const [rows] = await executor.execute(
    `SELECT id, student_user_id, exam_version_id, status, idempotency_key,
            student_snapshot_json, scoring_snapshot_json, snapshot_sha256,
            started_at, submitted_at, updated_at
     FROM exam_attempts
     WHERE ${whereSql}
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    values
  );
  return mapAttempt(rows[0]);
};

export class MysqlAttemptRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findOwned(id, studentUserId) {
    return selectAttempt(this.pool, 'id = ? AND student_user_id = ?', [id, studentUserId]);
  }

  async findByIdempotency(studentUserId, idempotencyKey) {
    return selectAttempt(this.pool, 'student_user_id = ? AND idempotency_key = ?', [studentUserId, idempotencyKey]);
  }

  async createAttempt(attempt) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectAttempt(
        connection,
        'student_user_id = ? AND idempotency_key = ?',
        [attempt.studentUserId, attempt.idempotencyKey],
        true
      );
      if (existing) {
        if (existing.examVersionId !== attempt.examVersionId) {
          throw attemptError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho đề khác.');
        }
        await connection.commit();
        return { attempt: existing, duplicate: true };
      }
      const [examRows] = await connection.execute(
        `SELECT approval_status, exam_mode, purpose
         FROM exam_versions
         WHERE id = ?
         FOR UPDATE`,
        [attempt.examVersionId]
      );
      if (!examRows[0]) throw attemptError('EXAM_NOT_FOUND', 'Không tìm thấy đề đã publish.', 404);
      if (examRows[0].approval_status !== 'PUBLISHED' || examRows[0].exam_mode !== 'FIXED') {
        throw attemptError('EXAM_NOT_AVAILABLE', 'Đề chưa sẵn sàng để tạo attempt.');
      }
      if (examRows[0].purpose === 'FORMAL_ASSESSMENT') {
        throw attemptError('FORMAL_ASSESSMENT_DISABLED', 'Formal assessment đang bị khóa.');
      }
      await connection.execute(
        `INSERT INTO exam_attempts
          (id, student_user_id, exam_version_id, status, idempotency_key,
           student_snapshot_json, scoring_snapshot_json, snapshot_sha256, started_at)
         VALUES (?, ?, ?, 'IN_PROGRESS', ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?)`,
        [attempt.id, attempt.studentUserId, attempt.examVersionId, attempt.idempotencyKey,
          JSON.stringify(attempt.studentSnapshot), JSON.stringify(attempt.scoringSnapshot),
          attempt.snapshotSha256, attempt.startedAt]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ATTEMPT_STARTED', 'EXAM_ATTEMPT', ?, 'SUCCESS', CAST(? AS JSON))`,
        [attempt.auditId, attempt.studentUserId, attempt.id,
          JSON.stringify({ examVersionId: attempt.examVersionId, snapshotSha256: attempt.snapshotSha256 })]
      );
      const created = await selectAttempt(connection, 'id = ? AND student_user_id = ?', [attempt.id, attempt.studentUserId]);
      await connection.commit();
      return { attempt: created, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await this.findByIdempotency(attempt.studentUserId, attempt.idempotencyKey);
        if (existing && existing.examVersionId === attempt.examVersionId) return { attempt: existing, duplicate: true };
        if (existing) throw attemptError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho đề khác.');
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}
