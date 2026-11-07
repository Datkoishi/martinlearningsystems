const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
const attemptError = (code, message, statusCode = 409, details) => Object.assign(new Error(message), {
  code,
  statusCode,
  ...(details ? { details } : {})
});

const mapAttempt = (row) => row && ({
  id: row.id,
  studentUserId: row.student_user_id,
  examVersionId: row.exam_version_id,
  status: row.status,
  idempotencyKey: row.idempotency_key,
  studentSnapshot: parseJson(row.student_snapshot_json),
  scoringSnapshot: parseJson(row.scoring_snapshot_json),
  snapshotSha256: row.snapshot_sha256,
  answerRevision: Number(row.answer_revision),
  lastSavedAt: row.last_saved_at,
  startedAt: row.started_at,
  submittedAt: row.submitted_at,
  currentScoreRevision: row.current_score_revision === null ? null : Number(row.current_score_revision),
  updatedAt: row.updated_at,
  responses: {}
});

const selectAttempt = async (executor, whereSql, values, forUpdate = false) => {
  const [rows] = await executor.execute(
    `SELECT id, student_user_id, exam_version_id, status, idempotency_key,
            student_snapshot_json, scoring_snapshot_json, snapshot_sha256,
            answer_revision, last_saved_at, started_at, submitted_at,
            current_score_revision, updated_at
     FROM exam_attempts
     WHERE ${whereSql}
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    values
  );
  return mapAttempt(rows[0]);
};

const selectResponses = async (executor, attemptId) => {
  const [rows] = await executor.execute(
    `SELECT question_version_id, answer_json
     FROM attempt_responses
     WHERE attempt_id = ?
     ORDER BY question_version_id`,
    [attemptId]
  );
  return Object.fromEntries(rows.map((row) => [row.question_version_id, parseJson(row.answer_json)]));
};

const attachResponses = async (executor, attempt) => {
  if (!attempt) return null;
  return { ...attempt, responses: await selectResponses(executor, attempt.id) };
};

const readAttemptSnapshot = async (pool, whereSql, values, includeScore = false) => {
  const connection = await pool.getConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction();
    transactionOpen = true;
    const attempt = await attachResponses(
      connection,
      await selectAttempt(connection, whereSql, values)
    );
    const score = includeScore && attempt
      ? await selectScore(connection, attempt.id, attempt.currentScoreRevision)
      : null;
    await connection.commit();
    transactionOpen = false;
    return includeScore ? { attempt, score } : attempt;
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const selectOperation = async (executor, studentUserId, operationType, idempotencyKey, forUpdate = false) => {
  const [rows] = await executor.execute(
    `SELECT attempt_id, request_sha256, response_json
     FROM attempt_operations
     WHERE student_user_id = ? AND operation_type = ? AND idempotency_key = ?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [studentUserId, operationType, idempotencyKey]
  );
  return rows[0] && {
    attemptId: rows[0].attempt_id,
    requestSha256: rows[0].request_sha256,
    response: parseJson(rows[0].response_json)
  };
};

const selectScore = async (executor, attemptId, revisionNumber) => {
  if (revisionNumber === null) return null;
  const [rows] = await executor.execute(
    `SELECT id, revision_number, scoring_state, scoring_version, result_json, created_at
     FROM attempt_score_revisions
     WHERE attempt_id = ? AND revision_number = ?
     LIMIT 1`,
    [attemptId, revisionNumber]
  );
  return rows[0] && {
    id: rows[0].id,
    revisionNumber: Number(rows[0].revision_number),
    scoringState: rows[0].scoring_state,
    scoringVersion: rows[0].scoring_version,
    result: parseJson(rows[0].result_json),
    createdAt: rows[0].created_at
  };
};

const assertOperationMatches = (operation, command) => {
  if (operation.attemptId !== command.attemptId || operation.requestSha256 !== command.requestSha256) {
    throw attemptError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho payload khác.');
  }
};

const insertOperation = (connection, command, operationType, response) => connection.execute(
  `INSERT INTO attempt_operations
    (id, attempt_id, student_user_id, operation_type, idempotency_key,
     request_sha256, response_json, created_at)
   VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
  [command.operationId, command.attemptId, command.studentUserId, operationType,
    command.idempotencyKey, command.requestSha256, JSON.stringify(response), command.occurredAt]
);

export class MysqlAttemptRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findOwned(id, studentUserId) {
    return readAttemptSnapshot(this.pool, 'id = ? AND student_user_id = ?', [id, studentUserId]);
  }

  async findByIdempotency(studentUserId, idempotencyKey) {
    return readAttemptSnapshot(
      this.pool,
      'student_user_id = ? AND idempotency_key = ?',
      [studentUserId, idempotencyKey]
    );
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
        const hydrated = await attachResponses(connection, existing);
        await connection.commit();
        return { attempt: hydrated, duplicate: true };
      }
      const [examRows] = await connection.execute(
        `SELECT ev.approval_status, ev.exam_mode, ev.purpose,
                EXISTS (
                  SELECT 1 FROM assembly_publications ap WHERE ap.exam_version_id = ev.id
                ) AS assembly_published
         FROM exam_versions ev
         WHERE ev.id = ?
         FOR UPDATE`,
        [attempt.examVersionId]
      );
      if (!examRows[0]) throw attemptError('EXAM_NOT_FOUND', 'Không tìm thấy đề đã publish.', 404);
      if (examRows[0].approval_status !== 'PUBLISHED'
        || !['FIXED', 'ASSEMBLED'].includes(examRows[0].exam_mode)
        || (examRows[0].exam_mode === 'ASSEMBLED' && !examRows[0].assembly_published)) {
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
        const existing = await attachResponses(connection, await selectAttempt(
          connection,
          'student_user_id = ? AND idempotency_key = ?',
          [attempt.studentUserId, attempt.idempotencyKey]
        ));
        if (existing && existing.examVersionId === attempt.examVersionId) return { attempt: existing, duplicate: true };
        if (existing) throw attemptError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho đề khác.');
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async saveResponses(command) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const attempt = await selectAttempt(
        connection,
        'id = ? AND student_user_id = ?',
        [command.attemptId, command.studentUserId],
        true
      );
      if (!attempt) {
        await connection.rollback();
        return null;
      }
      const existingOperation = await selectOperation(
        connection,
        command.studentUserId,
        'AUTOSAVE',
        command.idempotencyKey,
        true
      );
      if (existingOperation) {
        assertOperationMatches(existingOperation, command);
        await connection.commit();
        return { ...existingOperation.response, duplicate: true };
      }
      if (attempt.status !== 'IN_PROGRESS') {
        throw attemptError('ATTEMPT_NOT_EDITABLE', 'Attempt đã đóng và không thể autosave.');
      }
      if (attempt.answerRevision !== command.baseRevision) {
        throw attemptError('ATTEMPT_REVISION_CONFLICT', 'Attempt có bản trả lời mới hơn.', 409, {
          currentRevision: attempt.answerRevision
        });
      }

      const newRevision = attempt.answerRevision + 1;
      for (const response of command.responses) {
        if (response.answer === null) {
          await connection.execute(
            'DELETE FROM attempt_responses WHERE attempt_id = ? AND question_version_id = ?',
            [command.attemptId, response.questionVersionId]
          );
        } else {
          const encoded = JSON.stringify(response.answer);
          await connection.execute(
            `INSERT INTO attempt_responses
              (attempt_id, question_version_id, answer_json, saved_revision, updated_at)
             VALUES (?, ?, CAST(? AS JSON), ?, ?)
             ON DUPLICATE KEY UPDATE
               answer_json = CAST(? AS JSON), saved_revision = ?, updated_at = ?`,
            [command.attemptId, response.questionVersionId, encoded, newRevision, command.occurredAt,
              encoded, newRevision, command.occurredAt]
          );
        }
      }
      await connection.execute(
        `UPDATE exam_attempts
         SET answer_revision = ?, last_saved_at = ?
         WHERE id = ? AND student_user_id = ?`,
        [newRevision, command.occurredAt, command.attemptId, command.studentUserId]
      );
      const response = {
        id: command.attemptId,
        status: 'IN_PROGRESS',
        responses: await selectResponses(connection, command.attemptId),
        answerRevision: newRevision,
        lastSavedAt: command.occurredAt
      };
      await insertOperation(connection, command, 'AUTOSAVE', response);
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ATTEMPT_RESPONSES_SAVED', 'EXAM_ATTEMPT', ?, 'SUCCESS', CAST(? AS JSON))`,
        [command.auditId, command.studentUserId, command.attemptId,
          JSON.stringify({ answerRevision: newRevision, questionCount: command.responses.length })]
      );
      await connection.commit();
      return { ...response, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await selectOperation(connection, command.studentUserId, 'AUTOSAVE', command.idempotencyKey);
        if (existing) {
          assertOperationMatches(existing, command);
          return { ...existing.response, duplicate: true };
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async submitAttempt(command) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const attempt = await selectAttempt(
        connection,
        'id = ? AND student_user_id = ?',
        [command.attemptId, command.studentUserId],
        true
      );
      if (!attempt) {
        await connection.rollback();
        return null;
      }
      const existingOperation = await selectOperation(
        connection,
        command.studentUserId,
        'SUBMIT',
        command.idempotencyKey,
        true
      );
      if (existingOperation) {
        assertOperationMatches(existingOperation, command);
        await connection.commit();
        return { ...existingOperation.response, duplicate: true };
      }

      if (attempt.status !== 'IN_PROGRESS') {
        const currentScore = await selectScore(connection, attempt.id, attempt.currentScoreRevision);
        if (!currentScore) throw attemptError('ATTEMPT_SCORE_MISSING', 'Attempt đã đóng nhưng thiếu score revision.', 500);
        const response = {
          id: attempt.id,
          status: attempt.status,
          answerRevision: attempt.answerRevision,
          submittedAt: attempt.submittedAt,
          scoreRevision: currentScore.revisionNumber,
          scoringResult: currentScore.result
        };
        await connection.commit();
        return { ...response, duplicate: true };
      }
      if (attempt.answerRevision !== command.baseRevision) {
        throw attemptError('ATTEMPT_REVISION_CONFLICT', 'Attempt có bản trả lời mới hơn.', 409, {
          currentRevision: attempt.answerRevision
        });
      }

      const scoreRevision = 1;
      await connection.execute(
        `INSERT INTO attempt_score_revisions
          (id, attempt_id, revision_number, scoring_state, scoring_version,
           result_json, created_by_type, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 'SYSTEM', NULL, ?)`,
        [command.scoreId, command.attemptId, scoreRevision, command.scoringResult.scoringState,
          command.scoringResult.scoringVersion, JSON.stringify(command.scoringResult), command.occurredAt]
      );
      const status = command.scoringResult.scoringState === 'FINAL' ? 'SCORED' : 'PENDING_MANUAL_SCORING';
      await connection.execute(
        `UPDATE exam_attempts
         SET status = ?, submitted_at = ?, current_score_revision = ?
         WHERE id = ? AND student_user_id = ?`,
        [status, command.occurredAt, scoreRevision, command.attemptId, command.studentUserId]
      );
      const response = {
        id: command.attemptId,
        status,
        answerRevision: attempt.answerRevision,
        submittedAt: command.occurredAt,
        scoreRevision,
        scoringResult: command.scoringResult
      };
      await insertOperation(connection, command, 'SUBMIT', response);
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ATTEMPT_SUBMITTED', 'EXAM_ATTEMPT', ?, 'SUCCESS', CAST(? AS JSON))`,
        [command.auditId, command.studentUserId, command.attemptId, JSON.stringify({
          answerRevision: attempt.answerRevision,
          scoreRevision,
          scoringState: command.scoringResult.scoringState,
          scoringVersion: command.scoringResult.scoringVersion
        })]
      );
      await connection.commit();
      return { ...response, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await selectOperation(connection, command.studentUserId, 'SUBMIT', command.idempotencyKey);
        if (existing) {
          assertOperationMatches(existing, command);
          return { ...existing.response, duplicate: true };
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async findResultOwned(id, studentUserId) {
    const snapshot = await readAttemptSnapshot(
      this.pool,
      'id = ? AND student_user_id = ?',
      [id, studentUserId],
      true
    );
    return snapshot.attempt ? snapshot : null;
  }
}
