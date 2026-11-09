import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import {
  buildManualScoreResult,
  ManualScoringService
} from '../src/manual-scoring/manual-scoring-service.js';

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000801';
const GRADER_ID = '00000000-0000-4000-8000-000000000802';
const ADMIN_ID = '00000000-0000-4000-8000-000000000803';
const ESSAY_ID = '00000000-0000-4000-8000-000000000804';

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  return value;
};
const snapshotHash = (studentSnapshot, scoringSnapshot) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalJson({ scoringSnapshot, studentSnapshot })))
  .digest('hex');

const sourceResult = () => ({
  schemaVersion: '1.0.0',
  scoringVersion: 'eduassess-scoring-v1',
  scoringState: 'PENDING',
  totals: {
    possiblePoints: 5,
    autoAwardedPoints: 2,
    earnedPoints: null,
    pendingManualPoints: 3,
    pendingManualCount: 1
  },
  questions: [
    {
      questionVersionId: '00000000-0000-4000-8000-000000000805',
      type: 'SINGLE_CHOICE', maxPoints: 2, awardedPoints: 2, outcome: 'CORRECT',
      submittedAnswer: 'a', correctAnswer: { correctOptionIds: ['a'] }
    },
    {
      questionVersionId: ESSAY_ID,
      type: 'ESSAY', maxPoints: 3, awardedPoints: 0, outcome: 'PENDING_MANUAL',
      submittedAnswer: 'Lập luận của học sinh.',
      correctAnswer: { rubric: { criteria: [{ id: 'reasoning', points: 3 }] } }
    }
  ]
});

const assignmentRecord = (overrides = {}) => {
  const studentSnapshot = {
    id: 'exam-v1', title: '[DEMO] Bài có tự luận', purpose: 'PRACTICE', assets: {},
    sections: [{ groups: [{ questions: [{
      id: ESSAY_ID, versionId: ESSAY_ID, order: 2, type: 'ESSAY', points: 3,
      content: { schemaVersion: '1.0.0', nodes: [{ type: 'paragraph', children: [{ type: 'text', text: 'Trình bày lời giải.' }] }] },
      options: []
    }] }] }]
  };
  const scoringSnapshot = {};
  return ({
  id: '00000000-0000-4000-8000-000000000806',
  attemptId: ATTEMPT_ID,
  assignmentType: 'INITIAL',
  sourceScoreRevision: 1,
  graderUserId: GRADER_ID,
  status: 'OPEN',
  reason: 'Chấm toàn bộ câu tự luận theo rubric đã duyệt.',
  completedScoreRevision: null,
  createdAt: new Date('2026-11-09T01:00:00Z'),
  completedAt: null,
  examTitle: '[DEMO] Bài có tự luận',
  studentSnapshot,
  scoringSnapshot,
  snapshotSha256: snapshotHash(studentSnapshot, scoringSnapshot),
  sourceResult: sourceResult(),
  attemptStatus: 'PENDING_MANUAL_SCORING',
  currentScoreRevision: 1,
  ...overrides
  });
};

class MemoryManualScoringRepository {
  constructor() {
    this.assignments = [];
    this.operations = new Map();
  }

  async createAssignment(command) {
    const record = assignmentRecord({
      id: command.id,
      attemptId: command.attemptId,
      assignmentType: command.assignmentType,
      graderUserId: command.graderUserId,
      reason: command.reason,
      createdAt: command.createdAt
    });
    this.assignments.push(record);
    return record;
  }

  async listAssigned(graderUserId, status) {
    return this.assignments.filter((item) => item.graderUserId === graderUserId && item.status === status);
  }

  async findAssigned(id, graderUserId) {
    return this.assignments.find((item) => item.id === id && item.graderUserId === graderUserId) || null;
  }

  async completeAssignment(command) {
    const key = `${command.graderUserId}:${command.idempotencyKey}`;
    const existing = this.operations.get(key);
    if (existing) {
      if (existing.assignmentId !== command.assignmentId || existing.requestSha256 !== command.requestSha256) {
        throw Object.assign(new Error('key reused'), { code: 'IDEMPOTENCY_KEY_REUSED' });
      }
      return { ...existing.response, duplicate: true };
    }
    const assignment = await this.findAssigned(command.assignmentId, command.graderUserId);
    const response = {
      assignmentId: assignment.id,
      attemptId: assignment.attemptId,
      status: 'COMPLETED',
      scoreRevision: assignment.sourceScoreRevision + 1,
      scoringState: 'FINAL',
      scoringVersion: command.result.scoringVersion,
      totals: command.result.totals,
      completedAt: command.occurredAt
    };
    assignment.status = 'COMPLETED';
    assignment.completedScoreRevision = response.scoreRevision;
    this.operations.set(key, {
      assignmentId: command.assignmentId,
      requestSha256: command.requestSha256,
      response
    });
    return { ...response, duplicate: false };
  }
}

test('manual scoring finalizes all pending essays without changing automatic question scores', () => {
  const result = buildManualScoreResult(assignmentRecord(), [{
    questionVersionId: ESSAY_ID,
    awardedPoints: 2.5,
    feedback: 'Lập luận đúng, cần nêu rõ bước kết luận.'
  }]);

  assert.equal(result.scoringState, 'FINAL');
  assert.equal(result.scoringVersion, 'eduassess-scoring-v1+manual-v1');
  assert.deepEqual(result.totals, {
    possiblePoints: 5,
    autoAwardedPoints: 2,
    manualAwardedPoints: 2.5,
    earnedPoints: 4.5,
    pendingManualPoints: 0,
    pendingManualCount: 0
  });
  assert.equal(result.questions[0].awardedPoints, 2);
  assert.equal(result.questions[1].outcome, 'MANUALLY_SCORED');
  assert.equal(result.questions[1].manualFeedback, 'Lập luận đúng, cần nêu rõ bước kết luận.');
});

test('manual scoring rejects incomplete, duplicate and out-of-range grades', () => {
  const twoEssays = assignmentRecord();
  twoEssays.sourceResult.questions.push({
    ...structuredClone(twoEssays.sourceResult.questions[1]),
    questionVersionId: '00000000-0000-4000-8000-000000000807'
  });
  assert.throws(() => buildManualScoreResult(twoEssays, [{
    questionVersionId: ESSAY_ID, awardedPoints: 2, feedback: 'Đạt yêu cầu.'
  }]), (error) => error.code === 'INCOMPLETE_MANUAL_GRADES');
  assert.throws(() => buildManualScoreResult(assignmentRecord(), [{
    questionVersionId: ESSAY_ID, awardedPoints: 4, feedback: 'Vượt điểm tối đa.'
  }]), (error) => error.code === 'INVALID_MANUAL_SCORE');
  assert.throws(() => buildManualScoreResult(assignmentRecord(), [
    { questionVersionId: ESSAY_ID, awardedPoints: 2, feedback: 'Bản ghi thứ nhất.' },
    { questionVersionId: ESSAY_ID, awardedPoints: 2, feedback: 'Bản ghi bị lặp.' }
  ]), (error) => error.code === 'INVALID_MANUAL_GRADES');
});

test('assigned grader sees only assigned essay projection and exact retry is idempotent', async () => {
  const repository = new MemoryManualScoringRepository();
  const service = new ManualScoringService({ repository, now: () => new Date('2026-11-09T02:00:00Z') });
  const assigned = await service.assign({
    attemptId: ATTEMPT_ID,
    assignmentType: 'INITIAL',
    graderUserId: GRADER_ID,
    assignedByUserId: ADMIN_ID,
    reason: 'Chấm toàn bộ câu tự luận theo rubric đã duyệt.'
  });
  assert.equal(assigned.status, 'OPEN');
  assert.equal((await service.listAssigned(GRADER_ID)).items.length, 1);
  assert.equal((await service.listAssigned('00000000-0000-4000-8000-000000000899')).items.length, 0);

  const preview = await service.getAssigned(assigned.id, GRADER_ID);
  assert.equal(preview.questions.length, 1);
  assert.equal(preview.questions[0].submittedAnswer, 'Lập luận của học sinh.');
  assert.deepEqual(preview.questions[0].rubric, { criteria: [{ id: 'reasoning', points: 3 }] });
  assert.equal(JSON.stringify(preview).includes('studentUserId'), false);
  assert.equal(JSON.stringify(preview).includes('correctOptionIds'), false);

  const command = {
    id: assigned.id,
    graderUserId: GRADER_ID,
    idempotencyKey: 'manual-grade-key-001',
    grades: [{ questionVersionId: ESSAY_ID, awardedPoints: 2, feedback: 'Đúng hướng và đủ ý chính.' }]
  };
  const first = await service.grade(command);
  const retry = await service.grade(command);
  assert.equal(first.scoreRevision, 2);
  assert.equal(first.duplicate, false);
  assert.equal(retry.scoreRevision, 2);
  assert.equal(retry.duplicate, true);
});

test('regrade replaces only essay score and keeps the previous revision as source', () => {
  const initial = buildManualScoreResult(assignmentRecord(), [{
    questionVersionId: ESSAY_ID, awardedPoints: 2, feedback: 'Chấm lần đầu.'
  }]);
  const regradeAssignment = assignmentRecord({
    assignmentType: 'REGRADE',
    sourceScoreRevision: 2,
    sourceResult: initial,
    attemptStatus: 'SCORED',
    currentScoreRevision: 2
  });
  const regraded = buildManualScoreResult(regradeAssignment, [{
    questionVersionId: ESSAY_ID, awardedPoints: 3, feedback: 'Chấm lại: đáp ứng đầy đủ rubric.'
  }]);
  assert.equal(regraded.sourceScoreRevision, 2);
  assert.equal(regraded.totals.earnedPoints, 5);
  assert.equal(regraded.questions[0].awardedPoints, 2);
  assert.equal(regraded.questions[1].awardedPoints, 3);
});

test('grader preview fails closed when either attempt snapshot is tampered', async () => {
  const repository = new MemoryManualScoringRepository();
  const record = assignmentRecord();
  repository.assignments.push(record);
  const service = new ManualScoringService({ repository });
  record.studentSnapshot.title = 'Nội dung đã bị sửa sau khi tạo attempt';

  await assert.rejects(
    service.getAssigned(record.id, GRADER_ID),
    (error) => error.code === 'ATTEMPT_SNAPSHOT_INTEGRITY_FAILED' && error.statusCode === 500
  );
});
