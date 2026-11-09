const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};
const placeholders = (values) => values.map(() => '?').join(', ');
const domainError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

const mapFramework = (row) => row && ({
  id: row.id,
  definitionId: row.assessment_definition_id,
  stableKey: row.stable_key,
  version: Number(row.version_number),
  config: parseJson(row.config_json),
  configSha256: row.config_sha256,
  approvalStatus: row.approval_status,
  requestSha256: row.request_sha256,
  idempotencyKey: row.idempotency_key,
  creator: { id: row.created_by_user_id, displayName: row.creator_display_name },
  review: row.review_id ? {
    id: row.review_id,
    reviewerUserId: row.reviewer_user_id,
    reviewerDisplayName: row.reviewer_display_name,
    decision: row.review_decision,
    reason: row.review_reason,
    configSha256: row.review_config_sha256,
    createdAt: row.reviewed_at
  } : null,
  createdAt: row.created_at
});

const frameworkSelect = `SELECT afv.id, afv.assessment_definition_id, ad.stable_key,
        afv.version_number, afv.config_json, afv.config_sha256, afv.approval_status,
        afv.request_sha256, afv.idempotency_key, afv.created_by_user_id, afv.created_at,
        creator.display_name AS creator_display_name,
        afr.id AS review_id, afr.reviewer_user_id, reviewer.display_name AS reviewer_display_name,
        afr.decision AS review_decision, afr.reason AS review_reason,
        afr.config_sha256 AS review_config_sha256, afr.created_at AS reviewed_at
 FROM assessment_framework_versions afv
 INNER JOIN assessment_definitions ad ON ad.id = afv.assessment_definition_id
 INNER JOIN users creator ON creator.id = afv.created_by_user_id
 LEFT JOIN assessment_framework_reviews afr ON afr.framework_version_id = afv.id
 LEFT JOIN users reviewer ON reviewer.id = afr.reviewer_user_id`;

const selectFramework = async (executor, whereSql, values, forUpdate = false) => {
  const [rows] = await executor.execute(
    `${frameworkSelect} WHERE ${whereSql} LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    values
  );
  return mapFramework(rows[0]);
};

const mapResult = (row) => row && {
  id: row.id,
  studentUserId: row.student_user_id,
  frameworkVersionId: row.framework_version_id,
  requestSha256: row.request_sha256,
  state: row.result_state,
  evidenceSnapshot: parseJson(row.evidence_snapshot_json),
  interpretation: parseJson(row.interpretation_json),
  snapshotSha256: row.snapshot_sha256,
  generatedAt: row.generated_at,
  framework: {
    id: row.framework_version_id,
    title: row.framework_title,
    grade: Number(row.framework_grade),
    subject: row.framework_subject,
    frameworkPurpose: row.framework_purpose,
    sourceExamPurpose: row.source_exam_purpose,
    version: Number(row.framework_version_number)
  }
};

const resultSelect = `SELECT ar.id, ar.student_user_id, ar.framework_version_id,
        ar.request_sha256, ar.result_state, ar.evidence_snapshot_json,
        ar.interpretation_json, ar.snapshot_sha256, ar.generated_at,
        JSON_UNQUOTE(JSON_EXTRACT(afv.config_json, '$.title')) AS framework_title,
        afv.grade AS framework_grade, afv.subject AS framework_subject,
        afv.framework_purpose, afv.source_exam_purpose,
        afv.version_number AS framework_version_number
 FROM assessment_results ar
 INNER JOIN assessment_framework_versions afv ON afv.id = ar.framework_version_id`;

const selectResult = async (executor, whereSql, values) => {
  const [rows] = await executor.execute(
    `${resultSelect} WHERE ${whereSql} ORDER BY ar.generated_at DESC, ar.id DESC LIMIT 1`,
    values
  );
  return mapResult(rows[0]);
};

const readFramework = async (pool, whereSql, values) => selectFramework(pool, whereSql, values);
const readResult = async (pool, whereSql, values) => selectResult(pool, whereSql, values);

export class MysqlAssessmentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findFrameworkByIdempotency(creatorUserId, idempotencyKey) {
    return readFramework(
      this.pool,
      'afv.created_by_user_id = ? AND afv.idempotency_key = ?',
      [creatorUserId, idempotencyKey]
    );
  }

  async createFramework(framework) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectFramework(
        connection,
        'afv.created_by_user_id = ? AND afv.idempotency_key = ?',
        [framework.creatorUserId, framework.idempotencyKey],
        true
      );
      if (existing) {
        if (existing.requestSha256 !== framework.requestSha256) {
          throw domainError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho framework khác.');
        }
        await connection.commit();
        return { framework: existing, duplicate: true };
      }
      await connection.execute(
        `INSERT INTO assessment_definitions
          (id, stable_key, created_by_user_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [framework.definitionId, framework.stableKey, framework.creatorUserId, framework.createdAt]
      );
      await connection.execute(
        `INSERT INTO assessment_framework_versions
          (id, assessment_definition_id, version_number, schema_version,
           framework_purpose, grade, subject, source_exam_purpose,
           config_json, config_sha256, approval_status, created_by_user_id,
           idempotency_key, request_sha256, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, 'NEEDS_REVIEW', ?, ?, ?, ?)`,
        [framework.id, framework.definitionId, framework.config.schemaVersion,
          framework.config.frameworkPurpose, framework.config.grade, framework.config.subject,
          framework.config.sourceExamPurpose, JSON.stringify(framework.config), framework.configSha256,
          framework.creatorUserId, framework.idempotencyKey, framework.requestSha256, framework.createdAt]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ASSESSMENT_FRAMEWORK_CREATED', 'ASSESSMENT_FRAMEWORK_VERSION', ?, 'SUCCESS', CAST(? AS JSON))`,
        [framework.auditId, framework.creatorUserId, framework.id,
          JSON.stringify({ stableKey: framework.stableKey, version: 1, configSha256: framework.configSha256 })]
      );
      const created = await selectFramework(connection, 'afv.id = ?', [framework.id]);
      await connection.commit();
      return { framework: created, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await selectFramework(
          connection,
          'afv.created_by_user_id = ? AND afv.idempotency_key = ?',
          [framework.creatorUserId, framework.idempotencyKey]
        );
        if (existing) {
          if (existing.requestSha256 !== framework.requestSha256) {
            throw domainError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho framework khác.');
          }
          return { framework: existing, duplicate: true };
        }
        throw domainError('ASSESSMENT_STABLE_KEY_EXISTS', 'stableKey assessment đã tồn tại.');
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async listFrameworkReviewQueue(reviewerUserId) {
    const [rows] = await this.pool.execute(
      `${frameworkSelect}
       WHERE afv.approval_status = 'NEEDS_REVIEW' AND afv.created_by_user_id <> ?
       ORDER BY afv.created_at ASC, afv.id ASC
       LIMIT 100`,
      [reviewerUserId]
    );
    return {
      items: rows.map((row) => {
        const framework = mapFramework(row);
        return {
          id: framework.id,
          stableKey: framework.stableKey,
          version: framework.version,
          title: framework.config.title,
          grade: framework.config.grade,
          subject: framework.config.subject,
          frameworkPurpose: framework.config.frameworkPurpose,
          sourceExamPurpose: framework.config.sourceExamPurpose,
          approvalStatus: framework.approvalStatus,
          configSha256: framework.configSha256,
          creator: framework.creator,
          createdAt: framework.createdAt
        };
      })
    };
  }

  async findFrameworkForReview(id) {
    return readFramework(this.pool, 'afv.id = ?', [id]);
  }

  async createFrameworkReview(review) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const framework = await selectFramework(connection, 'afv.id = ?', [review.frameworkVersionId], true);
      if (!framework) {
        await connection.rollback();
        return null;
      }
      if (framework.creator.id === review.reviewerUserId) {
        throw domainError('SELF_REVIEW_FORBIDDEN', 'Người tạo framework không được tự duyệt.');
      }
      if (framework.review || framework.approvalStatus !== 'NEEDS_REVIEW') {
        throw domainError('ASSESSMENT_FRAMEWORK_NOT_REVIEWABLE', 'Framework không còn ở trạng thái chờ duyệt.');
      }
      if (framework.configSha256 !== review.configSha256) {
        throw domainError('ASSESSMENT_FRAMEWORK_BINDING_MISMATCH', 'Framework không còn khớp hash đã gửi duyệt.');
      }
      await connection.execute(
        `INSERT INTO assessment_framework_reviews
          (id, framework_version_id, reviewer_user_id, decision, reason, config_sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [review.id, review.frameworkVersionId, review.reviewerUserId, review.decision,
          review.reason, review.configSha256, review.createdAt]
      );
      await connection.execute(
        `UPDATE assessment_framework_versions
         SET approval_status = ? WHERE id = ?`,
        [review.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', review.frameworkVersionId]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ASSESSMENT_FRAMEWORK_REVIEWED', 'ASSESSMENT_FRAMEWORK_VERSION', ?, 'SUCCESS', CAST(? AS JSON))`,
        [review.auditId, review.reviewerUserId, review.frameworkVersionId,
          JSON.stringify({ decision: review.decision, configSha256: review.configSha256 })]
      );
      const stored = await selectFramework(connection, 'afv.id = ?', [review.frameworkVersionId]);
      await connection.commit();
      return stored;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listApprovedFrameworks() {
    const [rows] = await this.pool.execute(
      `SELECT afv.id, afv.version_number, afv.framework_purpose, afv.grade,
              afv.subject, afv.source_exam_purpose, afv.config_sha256,
              JSON_UNQUOTE(JSON_EXTRACT(afv.config_json, '$.title')) AS title,
              JSON_UNQUOTE(JSON_EXTRACT(afv.config_json, '$.description')) AS description
       FROM assessment_framework_versions afv
       WHERE afv.approval_status = 'APPROVED'
       ORDER BY afv.grade, afv.subject, afv.framework_purpose, afv.created_at DESC`,
      []
    );
    return { items: rows.map((row) => ({
      id: row.id,
      version: Number(row.version_number),
      title: row.title,
      description: row.description,
      grade: Number(row.grade),
      subject: row.subject,
      frameworkPurpose: row.framework_purpose,
      sourceExamPurpose: row.source_exam_purpose,
      configSha256: row.config_sha256
    })) };
  }

  async findApprovedFramework(id) {
    return readFramework(this.pool, "afv.id = ? AND afv.approval_status = 'APPROVED'", [id]);
  }

  async listFinalEvidence({ studentUserId, framework }) {
    const [scoreRows] = await this.pool.execute(
      `SELECT ea.id AS attempt_id, ea.exam_version_id, sr.id AS score_revision_id,
              sr.scoring_state, sr.scoring_version, sr.result_json, sr.created_at AS scored_at
       FROM exam_attempts ea
       INNER JOIN exam_versions ev ON ev.id = ea.exam_version_id
       INNER JOIN attempt_score_revisions sr
         ON sr.attempt_id = ea.id AND sr.revision_number = ea.current_score_revision
       WHERE ea.student_user_id = ? AND ea.status = 'SCORED'
         AND sr.scoring_state = 'FINAL'
         AND ev.grade = ? AND ev.subject = ? AND ev.purpose = ?
       ORDER BY sr.created_at, ea.id`,
      [studentUserId, framework.grade, framework.subject, framework.sourceExamPurpose]
    );
    const scoreQuestions = scoreRows.flatMap((row) => {
      const result = parseJson(row.result_json);
      return (result?.questions || []).map((question) => ({ row, question }));
    });
    const questionIds = [...new Set(scoreQuestions.map(({ question }) => question.questionVersionId))];
    if (questionIds.length === 0) return { completedAttemptCount: scoreRows.length, items: [] };
    const [metadataRows] = await this.pool.execute(
      `SELECT id, question_type, topic_key, skill_key, difficulty
       FROM question_versions
       WHERE id IN (${placeholders(questionIds)})`,
      questionIds
    );
    const metadata = new Map(metadataRows.map((row) => [row.id, row]));
    return {
      completedAttemptCount: scoreRows.length,
      items: scoreQuestions.map(({ row, question }) => {
        const item = metadata.get(question.questionVersionId) || {};
        return {
          attemptId: row.attempt_id,
          examVersionId: row.exam_version_id,
          scoreRevisionId: row.score_revision_id,
          scoringState: row.scoring_state,
          scoringVersion: row.scoring_version,
          scoredAt: row.scored_at,
          questionVersionId: question.questionVersionId,
          questionType: item.question_type || question.type,
          topicKey: item.topic_key || null,
          skillKey: item.skill_key || null,
          difficulty: item.difficulty || null,
          outcome: question.outcome,
          awardedPoints: Number(question.awardedPoints),
          maxPoints: Number(question.maxPoints)
        };
      })
    };
  }

  async findResultByIdempotency(studentUserId, idempotencyKey) {
    return readResult(
      this.pool,
      'ar.student_user_id = ? AND ar.idempotency_key = ?',
      [studentUserId, idempotencyKey]
    );
  }

  async createResult(result) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectResult(
        connection,
        'ar.student_user_id = ? AND ar.idempotency_key = ?',
        [result.studentUserId, result.idempotencyKey]
      );
      if (existing) {
        if (existing.requestSha256 !== result.requestSha256) {
          throw domainError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho assessment khác.');
        }
        await connection.commit();
        return { result: existing, duplicate: true };
      }
      const framework = await selectFramework(
        connection,
        "afv.id = ? AND afv.approval_status = 'APPROVED'",
        [result.frameworkVersionId],
        true
      );
      if (!framework) throw domainError('ASSESSMENT_FRAMEWORK_NOT_AVAILABLE', 'Framework chưa được duyệt.');
      await connection.execute(
        `INSERT INTO assessment_results
          (id, student_user_id, framework_version_id, idempotency_key, request_sha256,
           result_state, evidence_snapshot_json, interpretation_json, snapshot_sha256, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?)`,
        [result.id, result.studentUserId, result.frameworkVersionId, result.idempotencyKey,
          result.requestSha256, result.state, JSON.stringify(result.evidenceSnapshot),
          JSON.stringify(result.interpretation), result.snapshotSha256, result.generatedAt]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ASSESSMENT_RESULT_GENERATED', 'ASSESSMENT_RESULT', ?, 'SUCCESS', CAST(? AS JSON))`,
        [result.auditId, result.studentUserId, result.id,
          JSON.stringify({
            frameworkVersionId: result.frameworkVersionId,
            state: result.state,
            snapshotSha256: result.snapshotSha256
          })]
      );
      const created = await selectResult(connection, 'ar.id = ?', [result.id]);
      await connection.commit();
      return { result: created, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await selectResult(
          connection,
          'ar.student_user_id = ? AND ar.idempotency_key = ?',
          [result.studentUserId, result.idempotencyKey]
        );
        if (existing) {
          if (existing.requestSha256 !== result.requestSha256) {
            throw domainError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho assessment khác.');
          }
          return { result: existing, duplicate: true };
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async findResultOwned(id, studentUserId) {
    return readResult(this.pool, 'ar.id = ? AND ar.student_user_id = ?', [id, studentUserId]);
  }

  async findLatestResultOwned(frameworkVersionId, studentUserId) {
    return readResult(
      this.pool,
      'ar.framework_version_id = ? AND ar.student_user_id = ?',
      [frameworkVersionId, studentUserId]
    );
  }
}
