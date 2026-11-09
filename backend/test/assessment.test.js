import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessEvidence,
  validateAssessmentFramework
} from '../src/assessment/assessment-engine.js';
import { AssessmentService } from '../src/assessment/assessment-service.js';

const frameworkFixture = () => ({
  schemaVersion: '1.0.0',
  title: '[DEMO] Khung bằng chứng Toán 5',
  description: 'Fixture kỹ thuật, không phải kết luận năng lực chính thức.',
  grade: 5,
  subject: 'Toán',
  frameworkPurpose: 'CURRICULUM_LEARNING',
  sourceExamPurpose: 'PRACTICE',
  scoringQuality: { allowedScoringVersions: ['eduassess-scoring-v1'] },
  minimums: { completedAttempts: 2, evidenceItems: 4 },
  reassessment: { additionalEvidenceItems: 2 },
  indicators: [{
    id: 'reasoning',
    title: 'Lập luận toán học',
    evidence: {
      skillKeys: ['reasoning'],
      topicKeys: [],
      minimumItems: 4,
      requiredDifficulties: ['EASY', 'MEDIUM'],
      requiredQuestionTypes: ['SHORT_NUMBER', 'SINGLE_CHOICE']
    },
    levels: [
      { level: 'NEEDS_REINFORCEMENT', minimumRatio: 0 },
      { level: 'DEVELOPING', minimumRatio: 0.4 },
      { level: 'ACHIEVED', minimumRatio: 0.7 },
      { level: 'EXCEEDED', minimumRatio: 0.9 }
    ],
    guidance: {
      insufficientEvidence: 'Hoàn thành thêm câu lập luận ở đủ loại nhiệm vụ.',
      byLevel: {
        NEEDS_REINFORCEMENT: 'Ôn lại dữ kiện và các bước lập luận cơ bản.',
        DEVELOPING: 'Luyện thêm bài có nhiều bước suy luận.',
        ACHIEVED: 'Duy trì luyện tập và giải thích rõ từng bước.',
        EXCEEDED: 'Thử bài mở rộng và so sánh nhiều cách giải.'
      }
    }
  }]
});

const evidenceItem = (overrides = {}) => ({
  attemptId: 'attempt-1',
  examVersionId: 'exam-1',
  scoreRevisionId: 'score-1',
  scoringState: 'FINAL',
  scoringVersion: 'eduassess-scoring-v1',
  scoredAt: new Date('2026-11-08T08:00:00Z'),
  questionVersionId: 'question-1',
  questionType: 'SINGLE_CHOICE',
  topicKey: 'geometry',
  skillKey: 'reasoning',
  difficulty: 'EASY',
  outcome: 'CORRECT',
  awardedPoints: 1,
  maxPoints: 1,
  ...overrides
});

class MemoryAssessmentRepository {
  constructor(evidence) {
    this.frameworks = [];
    this.results = [];
    this.evidence = evidence;
  }
  async findFrameworkByIdempotency(creatorUserId, idempotencyKey) {
    return this.frameworks.find((item) => item.creator.id === creatorUserId && item.idempotencyKey === idempotencyKey) || null;
  }
  async createFramework(input) {
    const stored = {
      id: input.id,
      definitionId: input.definitionId,
      stableKey: input.stableKey,
      version: 1,
      config: structuredClone(input.config),
      configSha256: input.configSha256,
      approvalStatus: 'NEEDS_REVIEW',
      requestSha256: input.requestSha256,
      idempotencyKey: input.idempotencyKey,
      creator: { id: input.creatorUserId, displayName: input.creatorUserId },
      review: null,
      createdAt: input.createdAt
    };
    this.frameworks.push(stored);
    return { framework: stored, duplicate: false };
  }
  async listFrameworkReviewQueue(reviewerUserId) {
    return { items: this.frameworks.filter((item) => item.creator.id !== reviewerUserId && item.approvalStatus === 'NEEDS_REVIEW') };
  }
  async findFrameworkForReview(id) {
    return this.frameworks.find((item) => item.id === id) || null;
  }
  async createFrameworkReview(review) {
    const framework = await this.findFrameworkForReview(review.frameworkVersionId);
    if (framework.creator.id === review.reviewerUserId) {
      throw Object.assign(new Error('self review'), { code: 'SELF_REVIEW_FORBIDDEN', statusCode: 409 });
    }
    if (framework.review || framework.approvalStatus !== 'NEEDS_REVIEW') {
      throw Object.assign(new Error('reviewed'), { code: 'ASSESSMENT_FRAMEWORK_NOT_REVIEWABLE', statusCode: 409 });
    }
    framework.review = { ...review };
    framework.approvalStatus = review.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    return framework;
  }
  async listApprovedFrameworks() {
    return { items: this.frameworks.filter((item) => item.approvalStatus === 'APPROVED') };
  }
  async findApprovedFramework(id) {
    return this.frameworks.find((item) => item.id === id && item.approvalStatus === 'APPROVED') || null;
  }
  async listFinalEvidence() { return structuredClone(this.evidence); }
  async findResultByIdempotency(studentUserId, idempotencyKey) {
    return this.results.find((item) => item.studentUserId === studentUserId && item.idempotencyKey === idempotencyKey) || null;
  }
  async createResult(input) {
    const framework = await this.findApprovedFramework(input.frameworkVersionId);
    const stored = {
      ...structuredClone(input),
      framework: {
        id: framework.id,
        title: framework.config.title,
        grade: framework.config.grade,
        subject: framework.config.subject,
        frameworkPurpose: framework.config.frameworkPurpose,
        sourceExamPurpose: framework.config.sourceExamPurpose,
        version: framework.version
      }
    };
    this.results.push(stored);
    return { result: stored, duplicate: false };
  }
  async findResultOwned(id, studentUserId) {
    return this.results.find((item) => item.id === id && item.studentUserId === studentUserId) || null;
  }
  async findLatestResultOwned(frameworkVersionId, studentUserId) {
    return [...this.results].reverse().find((item) => (
      item.frameworkVersionId === frameworkVersionId && item.studentUserId === studentUserId
    )) || null;
  }
}

test('assessment framework validation keeps thresholds versioned and rejects ambiguous mappings', () => {
  const normalized = validateAssessmentFramework(frameworkFixture());
  assert.equal(normalized.indicators[0].levels[2].minimumRatio, 0.7);
  assert.deepEqual(normalized.indicators[0].evidence.requiredQuestionTypes, ['SHORT_NUMBER', 'SINGLE_CHOICE']);

  const overlapping = frameworkFixture();
  overlapping.indicators.push({
    ...structuredClone(overlapping.indicators[0]),
    id: 'reasoning-duplicate',
    title: 'Trùng mapping'
  });
  assert.throws(
    () => validateAssessmentFramework(overlapping),
    (error) => error.code === 'INVALID_ASSESSMENT_FRAMEWORK' && error.message.includes('nhiều indicator')
  );
  const formal = frameworkFixture();
  formal.sourceExamPurpose = 'FORMAL_ASSESSMENT';
  assert.throws(
    () => validateAssessmentFramework(formal),
    (error) => error.code === 'INVALID_ASSESSMENT_FRAMEWORK'
  );
});

test('insufficient coverage returns Chưa đủ bằng chứng without forcing a level', () => {
  const framework = validateAssessmentFramework(frameworkFixture());
  const assessed = assessEvidence(framework, {
    completedAttemptCount: 1,
    items: [evidenceItem()]
  });

  assert.equal(assessed.interpretation.state, 'INSUFFICIENT_EVIDENCE');
  assert.equal(assessed.interpretation.message, 'Chưa đủ bằng chứng');
  assert.equal(assessed.interpretation.indicators[0].level, null);
  assert.deepEqual(
    assessed.interpretation.indicators[0].coverage.missing.map((item) => item.code),
    ['MINIMUM_ATTEMPTS', 'MINIMUM_EVIDENCE', 'MINIMUM_ITEMS', 'DIFFICULTY_COVERAGE', 'TASK_TYPE_COVERAGE']
  );
});

test('approved framework rules classify only after evidence, difficulty and task coverage pass', () => {
  const framework = validateAssessmentFramework(frameworkFixture());
  const assessed = assessEvidence(framework, {
    completedAttemptCount: 2,
    items: [
      evidenceItem({ questionVersionId: 'q1', attemptId: 'a1' }),
      evidenceItem({ questionVersionId: 'q2', attemptId: 'a1', questionType: 'SHORT_NUMBER', difficulty: 'MEDIUM' }),
      evidenceItem({ questionVersionId: 'q3', attemptId: 'a2' }),
      evidenceItem({ questionVersionId: 'q4', attemptId: 'a2', questionType: 'SHORT_NUMBER', difficulty: 'MEDIUM', awardedPoints: 0 })
    ]
  });

  assert.equal(assessed.interpretation.state, 'CLASSIFIED');
  assert.equal(assessed.interpretation.indicators[0].evidenceScoreRatio, 0.75);
  assert.deepEqual(assessed.interpretation.indicators[0].level, { key: 'ACHIEVED', label: 'Đạt' });
  assert.match(assessed.interpretation.limitation, /không phải phần trăm năng lực/);
});

test('scoring quality blocks classification for unapproved versions or invalid points', () => {
  const framework = validateAssessmentFramework(frameworkFixture());
  const assessed = assessEvidence(framework, {
    completedAttemptCount: 2,
    items: [
      evidenceItem({ questionVersionId: 'q1', attemptId: 'a1' }),
      evidenceItem({ questionVersionId: 'q2', attemptId: 'a1', questionType: 'SHORT_NUMBER', difficulty: 'MEDIUM' }),
      evidenceItem({ questionVersionId: 'q3', attemptId: 'a2', scoringVersion: 'unapproved-v2' }),
      evidenceItem({ questionVersionId: 'q4', attemptId: 'a2', questionType: 'SHORT_NUMBER', difficulty: 'MEDIUM', awardedPoints: 2 })
    ]
  });

  assert.equal(assessed.interpretation.state, 'INSUFFICIENT_EVIDENCE');
  assert.equal(assessed.interpretation.indicators[0].level, null);
  assert.deepEqual(
    assessed.interpretation.indicators[0].coverage.missing.map((item) => item.code),
    ['SCORING_QUALITY']
  );
});

test('framework approval and student assessment are independent, idempotent and owner scoped', async () => {
  const repository = new MemoryAssessmentRepository({
    completedAttemptCount: 1,
    items: [evidenceItem()]
  });
  const service = new AssessmentService({ repository, now: () => new Date('2026-11-08T09:00:00Z') });
  const created = await service.createFramework({
    creatorUserId: 'specialist-1',
    idempotencyKey: 'framework-create-key-001',
    stableKey: 'demo.math.5.curriculum',
    framework: frameworkFixture()
  });
  assert.equal(created.approvalStatus, 'NEEDS_REVIEW');
  await assert.rejects(
    service.reviewFramework({
      id: created.id,
      reviewerUserId: 'specialist-1',
      decision: 'APPROVE',
      reason: 'Không được tự duyệt framework do chính mình tạo.'
    }),
    (error) => error.code === 'SELF_REVIEW_FORBIDDEN'
  );
  const approved = await service.reviewFramework({
    id: created.id,
    reviewerUserId: 'reviewer-1',
    decision: 'APPROVE',
    reason: 'Đã kiểm tra mapping, coverage gate và interpretation rules.'
  });
  assert.equal(approved.approvalStatus, 'APPROVED');

  const command = {
    studentUserId: 'student-1',
    frameworkVersionId: created.id,
    idempotencyKey: 'assessment-generate-key-001'
  };
  const first = await service.generate(command);
  const retry = await service.generate(command);
  assert.equal(first.state, 'INSUFFICIENT_EVIDENCE');
  assert.equal(first.interpretation.message, 'Chưa đủ bằng chứng');
  assert.equal(retry.id, first.id);
  assert.equal(retry.duplicate, true);
  assert.equal(JSON.stringify(first).includes('correctAnswer'), false);
  assert.equal(JSON.stringify(first).includes('submittedAnswer'), false);
  assert.equal(JSON.stringify(first).includes('evidenceSnapshot'), false);
  assert.equal((await service.getOwned(first.id, 'student-1')).id, first.id);
  assert.equal(await service.getOwned(first.id, 'student-2'), null);
});
