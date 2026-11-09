import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { AttemptService } from '../src/attempts/attempt-service.js';
import { MysqlAttemptRepository } from '../src/attempts/mysql-attempt-repository.js';
import { ManualScoringService } from '../src/manual-scoring/manual-scoring-service.js';
import { MysqlManualScoringRepository } from '../src/manual-scoring/mysql-manual-scoring-repository.js';

const integrationPort = process.env.MYSQL_INTEGRATION_PORT;

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  return value;
};
const snapshotHash = (studentSnapshot, scoringSnapshot) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalJson({ scoringSnapshot, studentSnapshot })))
  .digest('hex');

test('MySQL manual scoring assignment creates immutable initial and regrade score revisions', {
  skip: !integrationPort,
  timeout: 30000
}, async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_INTEGRATION_HOST || '127.0.0.1',
    port: Number(integrationPort),
    database: process.env.MYSQL_INTEGRATION_DATABASE || 'mls_db',
    user: process.env.MYSQL_INTEGRATION_USER || 'mls_user',
    password: process.env.MYSQL_INTEGRATION_PASSWORD_FILE
      ? fs.readFileSync(process.env.MYSQL_INTEGRATION_PASSWORD_FILE, 'utf8').trim()
      : process.env.MYSQL_INTEGRATION_PASSWORD,
    connectionLimit: 3
  });
  const repository = new MysqlManualScoringRepository(pool);
  const service = new ManualScoringService({ repository, now: () => new Date('2026-11-09T03:00:00Z') });
  const attemptService = new AttemptService({
    repository: new MysqlAttemptRepository(pool),
    catalogService: {},
    now: () => new Date('2026-11-09T03:00:00Z')
  });
  const adminId = randomUUID();
  const graderId = randomUUID();
  const studentId = randomUUID();
  const examId = randomUUID();
  const examVersionId = randomUUID();
  const questionId = randomUUID();
  const questionVersionId = randomUUID();
  const attemptId = randomUUID();
  const scoreId = randomUUID();
  let initialAssignmentId = null;
  let regradeAssignmentId = null;

  const content = {
    schemaVersion: '1.0.0',
    nodes: [{ type: 'paragraph', children: [{ type: 'text', text: 'Trình bày lập luận.' }] }]
  };
  const rubric = { criteria: [{ id: 'reasoning', description: 'Lập luận hợp lý', points: 3 }] };
  const studentSnapshot = {
    id: examVersionId,
    versionId: examVersionId,
    title: '[DEMO] Manual scoring MySQL',
    purpose: 'PRACTICE',
    assets: {},
    sections: [{ id: randomUUID(), title: 'Tự luận', groups: [{ id: randomUUID(), questions: [{
      id: questionVersionId,
      versionId: questionVersionId,
      order: 1,
      type: 'ESSAY',
      points: 3,
      content,
      options: []
    }] }] }]
  };
  const scoringSnapshot = {
    schemaVersion: '1.0.0',
    examVersionId,
    questions: [{
      questionVersionId,
      type: 'ESSAY',
      points: 3,
      optionIds: [],
      answerKey: { rubric }
    }]
  };
  const pendingResult = {
    schemaVersion: '1.0.0',
    scoringVersion: 'eduassess-scoring-v1',
    scoringState: 'PENDING',
    totals: {
      possiblePoints: 3, autoAwardedPoints: 0, earnedPoints: null,
      pendingManualPoints: 3, pendingManualCount: 1
    },
    questions: [{
      questionVersionId,
      type: 'ESSAY',
      maxPoints: 3,
      awardedPoints: 0,
      outcome: 'PENDING_MANUAL',
      submittedAnswer: 'Học sinh trình bày một lập luận có căn cứ.',
      correctAnswer: { rubric }
    }]
  };

  try {
    await pool.execute(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES (?, ?, 'Super Admin Fixture', 'fixture'),
              (?, ?, 'Manual Grader Fixture', 'fixture'),
              (?, ?, 'Student Fixture', 'fixture')`,
      [adminId, `${adminId}@example.test`, graderId, `${graderId}@example.test`, studentId, `${studentId}@example.test`]
    );
    await pool.execute(
      `INSERT INTO user_roles (user_id, role, scope_type)
       VALUES (?, 'SUPER_ADMIN', 'GLOBAL'), (?, 'MANUAL_GRADER', 'GLOBAL'), (?, 'STUDENT', 'GLOBAL')`,
      [adminId, graderId, studentId]
    );
    await pool.execute('INSERT INTO exams (id, source_id, stable_key) VALUES (?, NULL, ?)', [examId, `manual-score-${examId}`]);
    await pool.execute(
      `INSERT INTO exam_versions
        (id, exam_id, version_number, title, description, exam_mode, purpose,
         approval_status, grade, subject, duration_minutes, schema_version, published_at)
       VALUES (?, ?, 1, '[DEMO] Manual scoring MySQL', 'Fixture', 'FIXED', 'PRACTICE',
               'PUBLISHED', 5, 'Ngữ văn', 20, '1.0.0', NOW(6))`,
      [examVersionId, examId]
    );
    await pool.execute('INSERT INTO questions (id, stable_key) VALUES (?, ?)', [questionId, `manual-question-${questionId}`]);
    await pool.execute(
      `INSERT INTO question_versions
        (id, question_id, version_number, question_type, content_json, answer_key_json,
         explanation_json, points, grade, subject, schema_version, approval_status)
       VALUES (?, ?, 1, 'ESSAY', CAST(? AS JSON), CAST(? AS JSON), NULL,
               3, 5, 'Ngữ văn', '1.0.0', 'PUBLISHED')`,
      [questionVersionId, questionId, JSON.stringify(content), JSON.stringify({ rubric })]
    );
    await pool.execute(
      `INSERT INTO exam_attempts
        (id, student_user_id, exam_version_id, status, idempotency_key,
         student_snapshot_json, scoring_snapshot_json, snapshot_sha256,
         answer_revision, current_score_revision, started_at, submitted_at)
       VALUES (?, ?, ?, 'PENDING_MANUAL_SCORING', 'mysql-manual-attempt-key',
               CAST(? AS JSON), CAST(? AS JSON), ?, 1, 1, NOW(6), NOW(6))`,
      [attemptId, studentId, examVersionId, JSON.stringify(studentSnapshot), JSON.stringify(scoringSnapshot),
        snapshotHash(studentSnapshot, scoringSnapshot)]
    );
    await pool.execute(
      `INSERT INTO attempt_score_revisions
        (id, attempt_id, revision_number, scoring_state, scoring_version,
         result_json, created_by_type, created_by_user_id, created_at)
       VALUES (?, ?, 1, 'PENDING', 'eduassess-scoring-v1', CAST(? AS JSON), 'SYSTEM', NULL, NOW(6))`,
      [scoreId, attemptId, JSON.stringify(pendingResult)]
    );

    const assigned = await service.assign({
      attemptId,
      assignmentType: 'INITIAL',
      graderUserId: graderId,
      assignedByUserId: adminId,
      reason: 'Chấm lần đầu theo rubric integration đã duyệt.'
    });
    initialAssignmentId = assigned.id;
    assert.equal((await service.listAssigned(graderId)).items.length, 1);
    assert.equal((await service.listAssigned(studentId)).items.length, 0);
    const preview = await service.getAssigned(initialAssignmentId, graderId);
    assert.equal(preview.questions.length, 1);
    assert.equal(JSON.stringify(preview).includes('studentUserId'), false);
    assert.equal(JSON.stringify(preview).includes('correctOptionIds'), false);

    const gradeCommand = {
      id: initialAssignmentId,
      graderUserId: graderId,
      idempotencyKey: 'mysql-manual-grade-key',
      grades: [{ questionVersionId, awardedPoints: 2.5, feedback: 'Lập luận đúng, cần làm rõ kết luận.' }]
    };
    const graded = await service.grade(gradeCommand);
    const retry = await service.grade(gradeCommand);
    assert.equal(graded.scoreRevision, 2);
    assert.equal(retry.scoreRevision, 2);
    assert.equal(retry.duplicate, true);

    const publicResult = await attemptService.getResult(attemptId, studentId);
    assert.equal(publicResult.scoringState, 'FINAL');
    assert.equal(publicResult.summary.earnedPoints, 2.5);
    assert.equal(publicResult.questions[0].manualFeedback, 'Lập luận đúng, cần làm rõ kết luận.');
    assert.equal(JSON.stringify(publicResult).includes('rubric'), false);

    const regrade = await service.assign({
      attemptId,
      assignmentType: 'REGRADE',
      graderUserId: graderId,
      assignedByUserId: adminId,
      reason: 'Chấm lại sau khi rà soát rubric và phản hồi.'
    });
    regradeAssignmentId = regrade.id;
    const regraded = await service.grade({
      id: regradeAssignmentId,
      graderUserId: graderId,
      idempotencyKey: 'mysql-manual-regrade-key',
      grades: [{ questionVersionId, awardedPoints: 3, feedback: 'Chấm lại: bài đáp ứng đầy đủ rubric.' }]
    });
    assert.equal(regraded.scoreRevision, 3);
    assert.equal(regraded.totals.earnedPoints, 3);

    const [attemptRows] = await pool.execute('SELECT status, current_score_revision FROM exam_attempts WHERE id = ?', [attemptId]);
    const [scoreRows] = await pool.execute('SELECT revision_number, scoring_state FROM attempt_score_revisions WHERE attempt_id = ? ORDER BY revision_number', [attemptId]);
    const [auditRows] = await pool.execute(
      `SELECT event_type FROM audit_logs
       WHERE resource_id IN (?, ?, ?) ORDER BY created_at`,
      [attemptId, initialAssignmentId, regradeAssignmentId]
    );
    assert.deepEqual(attemptRows[0], { status: 'SCORED', current_score_revision: 3 });
    assert.deepEqual(scoreRows.map((row) => [Number(row.revision_number), row.scoring_state]), [[1, 'PENDING'], [2, 'FINAL'], [3, 'FINAL']]);
    assert.equal(auditRows.filter((row) => row.event_type === 'MANUAL_SCORING_ASSIGNED').length, 2);
    assert.equal(auditRows.filter((row) => row.event_type === 'ATTEMPT_MANUALLY_SCORED').length, 2);
  } finally {
    await pool.query('DELETE FROM audit_logs WHERE actor_user_id IN (?)', [[adminId, graderId, studentId]]);
    await pool.execute('DELETE FROM manual_scoring_operations WHERE grader_user_id = ?', [graderId]);
    await pool.execute('DELETE FROM attempt_grading_assignments WHERE attempt_id = ?', [attemptId]);
    await pool.execute('DELETE FROM attempt_score_revisions WHERE attempt_id = ?', [attemptId]);
    await pool.execute('DELETE FROM exam_attempts WHERE id = ?', [attemptId]);
    await pool.execute('DELETE FROM question_versions WHERE id = ?', [questionVersionId]);
    await pool.execute('DELETE FROM questions WHERE id = ?', [questionId]);
    await pool.execute('DELETE FROM exam_versions WHERE id = ?', [examVersionId]);
    await pool.execute('DELETE FROM exams WHERE id = ?', [examId]);
    await pool.query('DELETE FROM user_roles WHERE user_id IN (?)', [[adminId, graderId, studentId]]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [[adminId, graderId, studentId]]);
    await pool.end();
  }
});
