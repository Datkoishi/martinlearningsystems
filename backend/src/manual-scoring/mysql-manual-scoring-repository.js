const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : value;

const manualError = (code, message, statusCode = 409, details) => Object.assign(new Error(message), {
  code,
  statusCode,
  ...(details ? { details } : {})
});

const mapAssignment = (row) => row && ({
  id: row.id,
  attemptId: row.attempt_id,
  assignmentType: row.assignment_type,
  sourceScoreRevision: Number(row.source_score_revision),
  graderUserId: row.assigned_to_user_id,
  status: row.status,
  reason: row.reason,
  completedScoreRevision: row.completed_score_revision === null ? null : Number(row.completed_score_revision),
  createdAt: row.created_at,
  completedAt: row.completed_at,
  examTitle: row.exam_title || parseJson(row.student_snapshot_json)?.title,
  ...(row.source_result_json ? {
    studentSnapshot: parseJson(row.student_snapshot_json),
    scoringSnapshot: parseJson(row.scoring_snapshot_json),
    snapshotSha256: row.snapshot_sha256,
    sourceResult: parseJson(row.source_result_json),
    attemptStatus: row.attempt_status,
    currentScoreRevision: Number(row.current_score_revision)
  } : {})
});

const assignmentSelect = `
  SELECT ga.id, ga.attempt_id, ga.assignment_type, ga.source_score_revision,
         ga.assigned_to_user_id, ga.status, ga.reason, ga.completed_score_revision,
         ga.created_at, ga.completed_at, ea.status AS attempt_status,
         ea.current_score_revision, ea.student_snapshot_json, ea.scoring_snapshot_json,
         ea.snapshot_sha256,
         sr.result_json AS source_result_json
  FROM attempt_grading_assignments ga
  INNER JOIN exam_attempts ea ON ea.id = ga.attempt_id
  INNER JOIN attempt_score_revisions sr
    ON sr.attempt_id = ga.attempt_id AND sr.revision_number = ga.source_score_revision`;

const selectAssignment = async (executor, id, graderUserId = null, forUpdate = false) => {
  const [rows] = await executor.execute(
    `${assignmentSelect}
     WHERE ga.id = ?${graderUserId ? ' AND ga.assigned_to_user_id = ?' : ''}
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    graderUserId ? [id, graderUserId] : [id]
  );
  return mapAssignment(rows[0]);
};

const selectOperation = async (executor, graderUserId, idempotencyKey, forUpdate = false) => {
  const [rows] = await executor.execute(
    `SELECT assignment_id, request_sha256, response_json
     FROM manual_scoring_operations
     WHERE grader_user_id = ? AND idempotency_key = ?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [graderUserId, idempotencyKey]
  );
  return rows[0] && {
    assignmentId: rows[0].assignment_id,
    requestSha256: rows[0].request_sha256,
    response: parseJson(rows[0].response_json)
  };
};

const assertOperationMatches = (operation, command) => {
  if (operation.assignmentId !== command.assignmentId || operation.requestSha256 !== command.requestSha256) {
    throw manualError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho payload khác.');
  }
};

export class MysqlManualScoringRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createAssignment(command) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [graderRows] = await connection.execute(
        `SELECT u.id
         FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.id = ? AND u.status = 'ACTIVE' AND ur.role IN ('MANUAL_GRADER', 'SUPER_ADMIN')
         LIMIT 1`,
        [command.graderUserId]
      );
      if (!graderRows[0]) throw manualError('GRADER_NOT_ELIGIBLE', 'Người được giao không có role MANUAL_GRADER.', 400);
      const [attemptRows] = await connection.execute(
        `SELECT status, current_score_revision
         FROM exam_attempts WHERE id = ? LIMIT 1 FOR UPDATE`,
        [command.attemptId]
      );
      if (!attemptRows[0]) {
        await connection.rollback();
        return null;
      }
      const attempt = attemptRows[0];
      if (attempt.current_score_revision === null) {
        throw manualError('ATTEMPT_SCORE_MISSING', 'Attempt chưa có score revision để chấm.');
      }
      const [scoreRows] = await connection.execute(
        `SELECT scoring_state, result_json
         FROM attempt_score_revisions
         WHERE attempt_id = ? AND revision_number = ? LIMIT 1`,
        [command.attemptId, attempt.current_score_revision]
      );
      const source = scoreRows[0] && parseJson(scoreRows[0].result_json);
      if (!source) throw manualError('ATTEMPT_SCORE_MISSING', 'Không tìm thấy current score revision.', 500);
      if (command.assignmentType === 'INITIAL'
        && (attempt.status !== 'PENDING_MANUAL_SCORING' || scoreRows[0].scoring_state !== 'PENDING')) {
        throw manualError('ATTEMPT_NOT_PENDING_MANUAL', 'INITIAL chỉ áp dụng cho attempt đang chờ chấm tự luận.');
      }
      if (command.assignmentType === 'REGRADE'
        && (attempt.status !== 'SCORED' || scoreRows[0].scoring_state !== 'FINAL')) {
        throw manualError('ATTEMPT_NOT_REGRADABLE', 'REGRADE chỉ áp dụng cho attempt đã có kết quả FINAL.');
      }
      const eligibleEssays = source.questions?.filter((question) => question.type === 'ESSAY'
        && question.submittedAnswer !== null
        && (command.assignmentType === 'REGRADE' || question.outcome === 'PENDING_MANUAL')) || [];
      if (eligibleEssays.length === 0) throw manualError('NO_ESSAY_TO_GRADE', 'Attempt không có câu tự luận phù hợp để phân công.');

      await connection.execute(
        `INSERT INTO attempt_grading_assignments
          (id, attempt_id, assignment_type, source_score_revision, assigned_to_user_id,
           assigned_by_user_id, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
        [command.id, command.attemptId, command.assignmentType, attempt.current_score_revision,
          command.graderUserId, command.assignedByUserId, command.reason, command.createdAt]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'MANUAL_SCORING_ASSIGNED', 'GRADING_ASSIGNMENT', ?, 'SUCCESS', CAST(? AS JSON))`,
        [command.auditId, command.assignedByUserId, command.id, JSON.stringify({
          attemptId: command.attemptId,
          assignmentType: command.assignmentType,
          sourceScoreRevision: Number(attempt.current_score_revision),
          graderUserId: command.graderUserId
        })]
      );
      const created = await selectAssignment(connection, command.id);
      await connection.commit();
      return created;
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        throw manualError('GRADING_ASSIGNMENT_EXISTS', 'Score revision này đã có assignment cùng loại.');
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async listAssigned(graderUserId, status) {
    const [rows] = await this.pool.execute(
      `SELECT ga.id, ga.attempt_id, ga.assignment_type, ga.source_score_revision,
              ga.assigned_to_user_id, ga.status, ga.reason, ga.completed_score_revision,
              ga.created_at, ga.completed_at,
              JSON_UNQUOTE(JSON_EXTRACT(ea.student_snapshot_json, '$.title')) AS exam_title
       FROM attempt_grading_assignments ga
       INNER JOIN exam_attempts ea ON ea.id = ga.attempt_id
       WHERE ga.assigned_to_user_id = ? AND ga.status = ?
       ORDER BY ga.created_at ASC, ga.id ASC`,
      [graderUserId, status]
    );
    return rows.map(mapAssignment);
  }

  async findAssigned(id, graderUserId) {
    return selectAssignment(this.pool, id, graderUserId);
  }

  async completeAssignment(command) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existingOperation = await selectOperation(connection, command.graderUserId, command.idempotencyKey, true);
      if (existingOperation) {
        assertOperationMatches(existingOperation, command);
        await connection.commit();
        return { ...existingOperation.response, duplicate: true };
      }
      const assignment = await selectAssignment(connection, command.assignmentId, command.graderUserId, true);
      if (!assignment) {
        await connection.rollback();
        return null;
      }
      if (assignment.status !== 'OPEN') throw manualError('GRADING_ASSIGNMENT_CLOSED', 'Assignment đã hoàn thành.');
      if (assignment.currentScoreRevision !== assignment.sourceScoreRevision) {
        throw manualError('SCORE_REVISION_CONFLICT', 'Attempt đã có score revision mới hơn.', 409, {
          currentScoreRevision: assignment.currentScoreRevision
        });
      }
      const scoreRevision = assignment.sourceScoreRevision + 1;
      await connection.execute(
        `INSERT INTO attempt_score_revisions
          (id, attempt_id, revision_number, scoring_state, scoring_version,
           result_json, reason, created_by_type, created_by_user_id, created_at)
         VALUES (?, ?, ?, 'FINAL', ?, CAST(? AS JSON), ?, 'USER', ?, ?)`,
        [command.scoreId, assignment.attemptId, scoreRevision, command.result.scoringVersion,
          JSON.stringify(command.result), command.reason, command.graderUserId, command.occurredAt]
      );
      await connection.execute(
        `UPDATE exam_attempts
         SET status = 'SCORED', current_score_revision = ?
         WHERE id = ? AND current_score_revision = ?`,
        [scoreRevision, assignment.attemptId, assignment.sourceScoreRevision]
      );
      await connection.execute(
        `UPDATE attempt_grading_assignments
         SET status = 'COMPLETED', completed_score_revision = ?, completed_at = ?
         WHERE id = ? AND status = 'OPEN'`,
        [scoreRevision, command.occurredAt, command.assignmentId]
      );
      const response = {
        assignmentId: command.assignmentId,
        attemptId: assignment.attemptId,
        status: 'COMPLETED',
        scoreRevision,
        scoringState: 'FINAL',
        scoringVersion: command.result.scoringVersion,
        totals: command.result.totals,
        completedAt: command.occurredAt
      };
      await connection.execute(
        `INSERT INTO manual_scoring_operations
          (id, assignment_id, grader_user_id, idempotency_key, request_sha256, response_json, created_at)
         VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
        [command.operationId, command.assignmentId, command.graderUserId, command.idempotencyKey,
          command.requestSha256, JSON.stringify(response), command.occurredAt]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ATTEMPT_MANUALLY_SCORED', 'EXAM_ATTEMPT', ?, 'SUCCESS', CAST(? AS JSON))`,
        [command.auditId, command.graderUserId, assignment.attemptId, JSON.stringify({
          assignmentId: command.assignmentId,
          assignmentType: assignment.assignmentType,
          sourceScoreRevision: assignment.sourceScoreRevision,
          scoreRevision,
          scoringVersion: command.result.scoringVersion
        })]
      );
      await connection.commit();
      return { ...response, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await selectOperation(connection, command.graderUserId, command.idempotencyKey);
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
}
