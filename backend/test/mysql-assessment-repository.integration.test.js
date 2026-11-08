import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { AssessmentService } from '../src/assessment/assessment-service.js';
import { MysqlAssessmentRepository } from '../src/assessment/mysql-assessment-repository.js';

const integrationPort = process.env.MYSQL_INTEGRATION_PORT;

test('MySQL assessment repository binds approval, FINAL evidence and immutable result snapshots', {
  skip: !integrationPort,
  timeout: 30000
}, async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_INTEGRATION_HOST || '127.0.0.1',
    port: Number(integrationPort),
    database: process.env.MYSQL_INTEGRATION_DATABASE || 'mls_db',
    user: process.env.MYSQL_INTEGRATION_USER || 'mls_user',
    password: process.env.MYSQL_INTEGRATION_PASSWORD,
    connectionLimit: 3
  });
  const repository = new MysqlAssessmentRepository(pool);
  const service = new AssessmentService({ repository, now: () => new Date('2026-11-08T10:00:00Z') });
  const specialistId = randomUUID();
  const reviewerId = randomUUID();
  const studentId = randomUUID();
  const examId = randomUUID();
  const examVersionId = randomUUID();
  const questionId = randomUUID();
  const questionVersionId = randomUUID();
  const attemptId = randomUUID();
  const scoreId = randomUUID();
  let frameworkId = null;

  const framework = {
    schemaVersion: '1.0.0',
    title: '[DEMO] MySQL evidence framework',
    description: 'Integration fixture không phải kết luận học thuật chính thức.',
    grade: 5,
    subject: 'Toán',
    frameworkPurpose: 'CURRICULUM_LEARNING',
    sourceExamPurpose: 'PRACTICE',
    scoringQuality: { allowedScoringVersions: ['eduassess-scoring-v1'] },
    minimums: { completedAttempts: 1, evidenceItems: 1 },
    reassessment: { additionalEvidenceItems: 1 },
    indicators: [{
      id: 'reasoning',
      title: 'Lập luận',
      evidence: {
        skillKeys: ['reasoning'], topicKeys: [], minimumItems: 1,
        requiredDifficulties: ['EASY'], requiredQuestionTypes: ['SINGLE_CHOICE']
      },
      levels: [
        { level: 'NEEDS_REINFORCEMENT', minimumRatio: 0 },
        { level: 'DEVELOPING', minimumRatio: 0.4 },
        { level: 'ACHIEVED', minimumRatio: 0.7 },
        { level: 'EXCEEDED', minimumRatio: 0.9 }
      ],
      guidance: {
        insufficientEvidence: 'Thu thập thêm bằng chứng.',
        byLevel: {
          NEEDS_REINFORCEMENT: 'Củng cố.', DEVELOPING: 'Phát triển.',
          ACHIEVED: 'Duy trì.', EXCEEDED: 'Mở rộng.'
        }
      }
    }]
  };

  try {
    await pool.execute(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES (?, ?, 'Assessment Specialist', 'fixture'),
              (?, ?, 'Academic Reviewer', 'fixture'),
              (?, ?, 'Student Fixture', 'fixture')`,
      [specialistId, `${specialistId}@example.test`, reviewerId, `${reviewerId}@example.test`,
        studentId, `${studentId}@example.test`]
    );
    const created = await service.createFramework({
      creatorUserId: specialistId,
      idempotencyKey: 'mysql-assessment-framework-key',
      stableKey: `mysql.assessment.${specialistId}`,
      framework
    });
    frameworkId = created.id;
    assert.equal(created.approvalStatus, 'NEEDS_REVIEW');
    assert.equal((await repository.listFrameworkReviewQueue(reviewerId)).items.length, 1);
    const approved = await service.reviewFramework({
      id: frameworkId,
      reviewerUserId: reviewerId,
      decision: 'APPROVE',
      reason: 'Integration review xác nhận coverage và interpretation rules.'
    });
    assert.equal(approved.approvalStatus, 'APPROVED');

    await pool.execute(
      'INSERT INTO exams (id, source_id, stable_key) VALUES (?, NULL, ?)',
      [examId, `mysql-assessment-exam-${examId}`]
    );
    await pool.execute(
      `INSERT INTO exam_versions
        (id, exam_id, version_number, title, description, exam_mode, purpose,
         approval_status, grade, subject, duration_minutes, schema_version, published_at)
       VALUES (?, ?, 1, '[DEMO] Assessment evidence exam', 'Fixture', 'FIXED', 'PRACTICE',
               'PUBLISHED', 5, 'Toán', 10, '1.0.0', NOW(6))`,
      [examVersionId, examId]
    );
    await pool.execute(
      'INSERT INTO questions (id, stable_key) VALUES (?, ?)',
      [questionId, `mysql-assessment-question-${questionId}`]
    );
    await pool.execute(
      `INSERT INTO question_versions
        (id, question_id, version_number, question_type, content_json, answer_key_json,
         explanation_json, points, grade, subject, curriculum_version, topic_key, skill_key,
         difficulty, estimated_seconds, family_key, schema_version, approval_status)
       VALUES (?, ?, 1, 'SINGLE_CHOICE', CAST(? AS JSON), CAST(? AS JSON), NULL,
               1, 5, 'Toán', 'vn-2018', 'geometry', 'reasoning', 'EASY', 60, ?, '1.0.0', 'PUBLISHED')`,
      [questionVersionId, questionId,
        JSON.stringify({ schemaVersion: '1.0.0', nodes: [] }),
        JSON.stringify({ correctOptionIds: ['fixture-option'] }),
        `family-${questionId}`]
    );
    await pool.execute(
      `INSERT INTO exam_attempts
        (id, student_user_id, exam_version_id, status, idempotency_key,
         student_snapshot_json, scoring_snapshot_json, snapshot_sha256,
         answer_revision, current_score_revision, started_at, submitted_at)
       VALUES (?, ?, ?, 'SCORED', 'mysql-assessment-attempt-key',
               CAST(? AS JSON), CAST(? AS JSON), ?, 0, 1, NOW(6), NOW(6))`,
      [attemptId, studentId, examVersionId, JSON.stringify({}), JSON.stringify({}), 'a'.repeat(64)]
    );
    await pool.execute(
      `INSERT INTO attempt_score_revisions
        (id, attempt_id, revision_number, scoring_state, scoring_version,
         result_json, reason, created_by_type, created_by_user_id, created_at)
       VALUES (?, ?, 1, 'FINAL', 'eduassess-scoring-v1', CAST(? AS JSON), NULL, 'SYSTEM', NULL, NOW(6))`,
      [scoreId, attemptId, JSON.stringify({
        schemaVersion: '1.0.0', scoringVersion: 'eduassess-scoring-v1', scoringState: 'FINAL',
        questions: [{
          questionVersionId, type: 'SINGLE_CHOICE', outcome: 'CORRECT',
          awardedPoints: 1, maxPoints: 1,
          submittedAnswer: 'fixture-option', correctAnswer: { correctOptionIds: ['fixture-option'] }
        }]
      })]
    );

    const generated = await service.generate({
      studentUserId: studentId,
      frameworkVersionId: frameworkId,
      idempotencyKey: 'mysql-assessment-result-key'
    });
    const retry = await service.generate({
      studentUserId: studentId,
      frameworkVersionId: frameworkId,
      idempotencyKey: 'mysql-assessment-result-key'
    });
    assert.equal(generated.state, 'CLASSIFIED');
    assert.equal(generated.interpretation.indicators[0].level.key, 'EXCEEDED');
    assert.equal(retry.id, generated.id);
    assert.equal(retry.duplicate, true);
    assert.equal(JSON.stringify(generated).includes('submittedAnswer'), false);
    assert.equal(JSON.stringify(generated).includes('correctAnswer'), false);
    assert.equal((await service.getOwned(generated.id, studentId)).id, generated.id);
    assert.equal(await service.getOwned(generated.id, reviewerId), null);
  } finally {
    await pool.query('DELETE FROM audit_logs WHERE actor_user_id IN (?)', [[specialistId, reviewerId, studentId]]);
    await pool.execute('DELETE FROM assessment_results WHERE student_user_id = ?', [studentId]);
    if (frameworkId) await pool.execute('DELETE FROM assessment_framework_reviews WHERE framework_version_id = ?', [frameworkId]);
    if (frameworkId) await pool.execute('DELETE FROM assessment_framework_versions WHERE id = ?', [frameworkId]);
    await pool.execute('DELETE FROM assessment_definitions WHERE created_by_user_id = ?', [specialistId]);
    await pool.execute('DELETE FROM attempt_score_revisions WHERE id = ?', [scoreId]);
    await pool.execute('DELETE FROM exam_attempts WHERE id = ?', [attemptId]);
    await pool.execute('DELETE FROM question_versions WHERE id = ?', [questionVersionId]);
    await pool.execute('DELETE FROM questions WHERE id = ?', [questionId]);
    await pool.execute('DELETE FROM exam_versions WHERE id = ?', [examVersionId]);
    await pool.execute('DELETE FROM exams WHERE id = ?', [examId]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [[specialistId, reviewerId, studentId]]);
    await pool.end();
  }
});
