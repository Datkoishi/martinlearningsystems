import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttemptService } from '../src/attempts/attempt-service.js';
import { normalizeAttemptResponse, scoreAttempt } from '../src/attempts/scoring-engine.js';
import { CatalogService } from '../src/catalog/catalog-service.js';
import { demoFixedExam } from '../src/domain/demo-exam.js';
import { sha256 } from '../src/imports/package-reader.js';

const EXAM_ID = '00000000-0000-4000-8000-000000000701';
const OTHER_EXAM_ID = '00000000-0000-4000-8000-000000000702';
const STUDENT_ID = '00000000-0000-4000-8000-000000000703';
const OTHER_STUDENT_ID = '00000000-0000-4000-8000-000000000704';

const publishedExam = () => {
  const exam = structuredClone(demoFixedExam);
  exam.id = EXAM_ID;
  exam.versionId = EXAM_ID;
  exam.approvalStatus = 'PUBLISHED';
  exam.assets['asset-answer-only'] = {
    id: 'asset-answer-only',
    url: '/api/catalog/assets/asset-answer-only',
    mimeType: 'image/png',
    altText: 'Hình chỉ dành cho lời giải'
  };
  exam.sections[0].groups[0].questions[0].explanation.nodes.push({
    type: 'figure',
    assetId: 'asset-answer-only',
    alt: 'Hình chỉ dành cho lời giải'
  });
  return exam;
};

class MemoryCatalogRepository {
  constructor(exam = publishedExam()) {
    this.exam = exam;
    this.assets = new Map();
  }

  async listPublishedFixed() {
    return [{ id: this.exam.versionId, title: this.exam.title, purpose: this.exam.purpose }];
  }

  async findPublishedFixed(id) {
    return id === this.exam.versionId ? structuredClone(this.exam) : null;
  }

  async findPublishedAsset(id) {
    return this.assets.get(id) || null;
  }
}

class MemoryAttemptRepository {
  constructor() {
    this.attempts = [];
    this.operations = new Map();
    this.scores = new Map();
  }

  async findOwned(id, studentUserId) {
    return this.attempts.find((attempt) => attempt.id === id && attempt.studentUserId === studentUserId) || null;
  }

  async findByIdempotency(studentUserId, idempotencyKey) {
    return this.attempts.find((attempt) => (
      attempt.studentUserId === studentUserId && attempt.idempotencyKey === idempotencyKey
    )) || null;
  }

  async createAttempt(attempt) {
    const existing = await this.findByIdempotency(attempt.studentUserId, attempt.idempotencyKey);
    if (existing) return { attempt: existing, duplicate: true };
    const created = {
      ...structuredClone(attempt),
      status: 'IN_PROGRESS',
      responses: {},
      answerRevision: 0,
      lastSavedAt: null,
      submittedAt: null,
      currentScoreRevision: null,
      updatedAt: attempt.startedAt
    };
    this.attempts.push(created);
    return { attempt: created, duplicate: false };
  }

  operationKey(command, type) {
    return `${command.studentUserId}:${type}:${command.idempotencyKey}`;
  }

  existingOperation(command, type) {
    const existing = this.operations.get(this.operationKey(command, type));
    if (!existing) return null;
    if (existing.attemptId !== command.attemptId || existing.requestSha256 !== command.requestSha256) {
      throw Object.assign(new Error('Idempotency-Key đã được dùng cho payload khác.'), {
        code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409
      });
    }
    return { ...structuredClone(existing.response), duplicate: true };
  }

  async saveResponses(command) {
    const duplicate = this.existingOperation(command, 'AUTOSAVE');
    if (duplicate) return duplicate;
    const attempt = await this.findOwned(command.attemptId, command.studentUserId);
    if (!attempt) return null;
    if (attempt.status !== 'IN_PROGRESS') {
      throw Object.assign(new Error('Attempt đã đóng.'), { code: 'ATTEMPT_NOT_EDITABLE', statusCode: 409 });
    }
    if (attempt.answerRevision !== command.baseRevision) {
      throw Object.assign(new Error('Revision conflict.'), {
        code: 'ATTEMPT_REVISION_CONFLICT', statusCode: 409, details: { currentRevision: attempt.answerRevision }
      });
    }
    command.responses.forEach(({ questionVersionId, answer }) => {
      if (answer === null) delete attempt.responses[questionVersionId];
      else attempt.responses[questionVersionId] = structuredClone(answer);
    });
    attempt.answerRevision += 1;
    attempt.lastSavedAt = command.occurredAt;
    const response = {
      id: attempt.id,
      status: attempt.status,
      responses: structuredClone(attempt.responses),
      answerRevision: attempt.answerRevision,
      lastSavedAt: attempt.lastSavedAt
    };
    this.operations.set(this.operationKey(command, 'AUTOSAVE'), {
      attemptId: command.attemptId,
      requestSha256: command.requestSha256,
      response: structuredClone(response)
    });
    return { ...response, duplicate: false };
  }

  async submitAttempt(command) {
    const duplicate = this.existingOperation(command, 'SUBMIT');
    if (duplicate) return duplicate;
    const attempt = await this.findOwned(command.attemptId, command.studentUserId);
    if (!attempt) return null;
    if (attempt.status !== 'IN_PROGRESS') {
      const score = this.scores.get(attempt.id);
      return {
        id: attempt.id,
        status: attempt.status,
        answerRevision: attempt.answerRevision,
        submittedAt: attempt.submittedAt,
        scoreRevision: 1,
        scoringResult: structuredClone(score.result),
        duplicate: true
      };
    }
    if (attempt.answerRevision !== command.baseRevision) {
      throw Object.assign(new Error('Revision conflict.'), {
        code: 'ATTEMPT_REVISION_CONFLICT', statusCode: 409, details: { currentRevision: attempt.answerRevision }
      });
    }
    attempt.status = command.scoringResult.scoringState === 'FINAL' ? 'SCORED' : 'PENDING_MANUAL_SCORING';
    attempt.submittedAt = command.occurredAt;
    attempt.currentScoreRevision = 1;
    const score = {
      revisionNumber: 1,
      scoringState: command.scoringResult.scoringState,
      scoringVersion: command.scoringResult.scoringVersion,
      result: structuredClone(command.scoringResult)
    };
    this.scores.set(attempt.id, score);
    const response = {
      id: attempt.id,
      status: attempt.status,
      answerRevision: attempt.answerRevision,
      submittedAt: attempt.submittedAt,
      scoreRevision: 1,
      scoringResult: structuredClone(command.scoringResult)
    };
    this.operations.set(this.operationKey(command, 'SUBMIT'), {
      attemptId: command.attemptId,
      requestSha256: command.requestSha256,
      response: structuredClone(response)
    });
    return { ...response, duplicate: false };
  }

  async findResultOwned(id, studentUserId) {
    const attempt = await this.findOwned(id, studentUserId);
    return attempt ? { attempt, score: this.scores.get(id) || null } : null;
  }
}

const services = (exam = publishedExam()) => {
  const catalogRepository = new MemoryCatalogRepository(exam);
  const catalogService = new CatalogService({
    repository: catalogRepository,
    storage: { readArchiveEntry: async () => null }
  });
  const attemptRepository = new MemoryAttemptRepository();
  const attemptService = new AttemptService({
    repository: attemptRepository,
    catalogService,
    now: () => new Date('2026-11-07T08:00:00.000Z')
  });
  return { catalogRepository, catalogService, attemptRepository, attemptService };
};

test('published catalog exposes fixed content but strips answers, explanations and answer-only assets', async () => {
  const { catalogService } = services();
  const exam = await catalogService.getPublishedFixed(EXAM_ID);
  const serialized = JSON.stringify(exam);

  assert.equal(exam.approvalStatus, 'PUBLISHED');
  assert.equal(serialized.includes('answerKey'), false);
  assert.equal(serialized.includes('correctOptionIds'), false);
  assert.equal(serialized.includes('explanation'), false);
  assert.ok(exam.assets['asset-demo-garden']);
  assert.equal(exam.assets['asset-answer-only'], undefined);
});

test('attempt snapshots keep student and scoring projections separate', async () => {
  const { catalogService } = services();
  const snapshots = await catalogService.getAttemptSnapshots(EXAM_ID);

  assert.equal(JSON.stringify(snapshots.studentSnapshot).includes('answerKey'), false);
  assert.deepEqual(snapshots.scoringSnapshot.questions[0].answerKey.correctOptionIds, ['perimeter-b']);
  assert.deepEqual(snapshots.scoringSnapshot.questions[0].optionIds, ['perimeter-a', 'perimeter-b', 'perimeter-c']);
  assert.equal(JSON.stringify(snapshots.scoringSnapshot).includes('explanation'), false);
});

test('attempt creation is idempotent and always returns the original immutable snapshot', async () => {
  const { catalogRepository, attemptRepository, attemptService } = services();
  const input = { studentUserId: STUDENT_ID, examVersionId: EXAM_ID, idempotencyKey: 'attempt-key-0001' };

  const first = await attemptService.create(input);
  catalogRepository.exam.title = 'Tiêu đề đã thay đổi sau lần tạo đầu';
  const second = await attemptService.create(input);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  assert.equal(second.snapshot.title, first.snapshot.title);
  assert.notEqual(second.snapshot.title, catalogRepository.exam.title);
  assert.equal(attemptRepository.attempts.length, 1);
  assert.equal(JSON.stringify(first).includes('scoringSnapshot'), false);
  assert.equal(JSON.stringify(first).includes('answerKey'), false);
  assert.ok(attemptRepository.attempts[0].scoringSnapshot.questions[0].answerKey);
});

test('idempotency keys cannot be reused for another exam', async () => {
  const { attemptService } = services();
  await attemptService.create({
    studentUserId: STUDENT_ID,
    examVersionId: EXAM_ID,
    idempotencyKey: 'attempt-key-0002'
  });

  await assert.rejects(
    attemptService.create({
      studentUserId: STUDENT_ID,
      examVersionId: OTHER_EXAM_ID,
      idempotencyKey: 'attempt-key-0002'
    }),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED' && error.statusCode === 409
  );
});

test('attempt ownership prevents IDOR and snapshot tampering fails closed', async () => {
  const { attemptRepository, attemptService } = services();
  const attempt = await attemptService.create({
    studentUserId: STUDENT_ID,
    examVersionId: EXAM_ID,
    idempotencyKey: 'attempt-key-0003'
  });

  assert.equal(await attemptService.getOwned(attempt.id, OTHER_STUDENT_ID), null);
  attemptRepository.attempts[0].scoringSnapshot.questions[0].points = 999;
  await assert.rejects(
    attemptService.getOwned(attempt.id, STUDENT_ID),
    (error) => error.code === 'ATTEMPT_SNAPSHOT_INTEGRITY_FAILED' && error.statusCode === 500
  );
});

test('scoring engine deterministically handles partial credit, true-false, number, text and manual essay', () => {
  const scoringSnapshot = {
    questions: [
      { questionVersionId: 'single', type: 'SINGLE_CHOICE', points: 1, optionIds: ['a', 'b'], answerKey: { correctOptionIds: ['b'] } },
      {
        questionVersionId: 'multiple', type: 'MULTIPLE_CHOICE', points: 2, optionIds: ['a', 'b', 'c'],
        answerKey: { correctOptionIds: ['a', 'b'], partialCredit: { mode: 'PER_OPTION_WITH_PENALTY' } }
      },
      { questionVersionId: 'tf', type: 'TRUE_FALSE', points: 2, optionIds: [], answerKey: { correctValues: [true, false] } },
      { questionVersionId: 'number', type: 'SHORT_NUMBER', points: 1, optionIds: [], answerKey: { numericValue: 10, tolerance: 0.1 } },
      { questionVersionId: 'text', type: 'SHORT_TEXT', points: 1, optionIds: [], answerKey: { acceptedValues: ['Hà Nội'] } },
      { questionVersionId: 'essay', type: 'ESSAY', points: 3, optionIds: [], answerKey: { rubric: { criteria: [{ id: 'c1' }] } } }
    ]
  };
  const result = scoreAttempt(scoringSnapshot, {
    single: 'b',
    multiple: ['a'],
    tf: [true, false],
    number: '9,95',
    text: '  HÀ   NỘI ',
    essay: 'Bài viết cần giáo viên chấm.'
  });

  assert.equal(result.scoringState, 'PENDING');
  assert.deepEqual(result.totals, {
    possiblePoints: 10,
    autoAwardedPoints: 6,
    earnedPoints: null,
    pendingManualPoints: 3,
    pendingManualCount: 1
  });
  assert.equal(result.questions.find((question) => question.questionVersionId === 'multiple').outcome, 'PARTIAL');
  assert.equal(result.questions.find((question) => question.questionVersionId === 'number').outcome, 'CORRECT');
  assert.throws(
    () => normalizeAttemptResponse(scoringSnapshot.questions[0], 'not-an-option'),
    (error) => error.code === 'INVALID_RESPONSE' && error.statusCode === 400
  );
});

test('autosave survives reload, resolves retries exactly and rejects stale revisions', async () => {
  const { attemptRepository, attemptService } = services();
  const attempt = await attemptService.create({
    studentUserId: STUDENT_ID,
    examVersionId: EXAM_ID,
    idempotencyKey: 'attempt-key-autosave'
  });
  const command = {
    id: attempt.id,
    studentUserId: STUDENT_ID,
    idempotencyKey: 'autosave-key-0001',
    baseRevision: 0,
    responses: [{ questionVersionId: 'question-perimeter-v1', answer: 'perimeter-b' }]
  };
  const first = await attemptService.saveResponses(command);
  const retry = await attemptService.saveResponses(command);
  const restored = await attemptService.getOwned(attempt.id, STUDENT_ID);

  assert.equal(first.answerRevision, 1);
  assert.equal(retry.duplicate, true);
  assert.deepEqual(restored.responses, { 'question-perimeter-v1': 'perimeter-b' });
  assert.equal(restored.answerRevision, 1);
  assert.equal(attemptRepository.operations.size, 1);
  await assert.rejects(
    attemptService.saveResponses({ ...command, idempotencyKey: 'autosave-key-0002', baseRevision: 0 }),
    (error) => error.code === 'ATTEMPT_REVISION_CONFLICT' && error.details.currentRevision === 1
  );
  await assert.rejects(
    attemptService.saveResponses({
      ...command,
      responses: [{ questionVersionId: 'question-perimeter-v1', answer: 'perimeter-a' }]
    }),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED'
  );
});

test('submit is idempotent, closes autosave and reveals answers only for final practice results', async () => {
  const { attemptRepository, attemptService } = services();
  const attempt = await attemptService.create({
    studentUserId: STUDENT_ID,
    examVersionId: EXAM_ID,
    idempotencyKey: 'attempt-key-submit'
  });
  await attemptService.saveResponses({
    id: attempt.id,
    studentUserId: STUDENT_ID,
    idempotencyKey: 'autosave-key-submit',
    baseRevision: 0,
    responses: [{ questionVersionId: 'question-perimeter-v1', answer: 'perimeter-b' }]
  });
  const command = {
    id: attempt.id,
    studentUserId: STUDENT_ID,
    idempotencyKey: 'submit-key-0001',
    baseRevision: 1
  };
  const first = await attemptService.submit(command);
  const retry = await attemptService.submit(command);
  const result = await attemptService.getResult(attempt.id, STUDENT_ID);

  assert.equal(first.attempt.status, 'SCORED');
  assert.equal(first.result.summary.earnedPoints, 1);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.result.duplicate, true);
  assert.equal(attemptRepository.scores.size, 1);
  assert.equal(result.revealPolicy.correctAnswers, true);
  assert.deepEqual(result.questions[0].correctAnswer, { correctOptionIds: ['perimeter-b'] });
  assert.equal(await attemptService.getResult(attempt.id, OTHER_STUDENT_ID), null);
  await assert.rejects(
    attemptService.saveResponses({
      id: attempt.id,
      studentUserId: STUDENT_ID,
      idempotencyKey: 'autosave-after-submit',
      baseRevision: 1,
      responses: [{ questionVersionId: 'question-area-v1', answer: 96 }]
    }),
    (error) => error.code === 'ATTEMPT_NOT_EDITABLE'
  );
});

test('answered essays remain pending manual scoring and never reveal answer payload', async () => {
  const exam = publishedExam();
  exam.sections[1].groups[0].questions.push({
    id: 'question-essay',
    versionId: 'question-essay-v1',
    order: 4,
    type: 'ESSAY',
    points: 3,
    content: { schemaVersion: '1.0.0', nodes: [{ type: 'paragraph', children: [{ type: 'text', text: 'Viết một đoạn giải thích.' }] }] },
    options: [],
    answerKey: { rubric: { criteria: [{ id: 'clarity', points: 3 }] } },
    explanation: null
  });
  const { attemptService } = services(exam);
  const attempt = await attemptService.create({
    studentUserId: STUDENT_ID,
    examVersionId: EXAM_ID,
    idempotencyKey: 'attempt-key-essay'
  });
  await attemptService.saveResponses({
    id: attempt.id,
    studentUserId: STUDENT_ID,
    idempotencyKey: 'autosave-key-essay',
    baseRevision: 0,
    responses: [{ questionVersionId: 'question-essay-v1', answer: 'Lập luận của học sinh.' }]
  });
  const submitted = await attemptService.submit({
    id: attempt.id,
    studentUserId: STUDENT_ID,
    idempotencyKey: 'submit-key-essay',
    baseRevision: 1
  });

  assert.equal(submitted.attempt.status, 'PENDING_MANUAL_SCORING');
  assert.equal(submitted.result.summary.earnedPoints, null);
  assert.equal(submitted.result.revealPolicy.correctAnswers, false);
  assert.equal('questions' in submitted.result, false);
  assert.equal(JSON.stringify(submitted).includes('rubric'), false);
});

test('mock exams return final totals without revealing correct answers', async () => {
  const exam = publishedExam();
  exam.purpose = 'MOCK_EXAM';
  const { attemptService } = services(exam);
  const attempt = await attemptService.create({
    studentUserId: STUDENT_ID,
    examVersionId: EXAM_ID,
    idempotencyKey: 'attempt-key-mock'
  });
  const submitted = await attemptService.submit({
    id: attempt.id,
    studentUserId: STUDENT_ID,
    idempotencyKey: 'submit-key-mock',
    baseRevision: 0
  });

  assert.equal(submitted.result.scoringState, 'FINAL');
  assert.equal(submitted.result.revealPolicy.correctAnswers, false);
  assert.equal(submitted.result.revealPolicy.reason, 'PURPOSE_RESTRICTED');
  assert.equal(JSON.stringify(submitted).includes('correctOptionIds'), false);
});

test('formal assessment remains locked even if a repository returns it', async () => {
  const formal = publishedExam();
  formal.purpose = 'FORMAL_ASSESSMENT';
  const service = new CatalogService({
    repository: new MemoryCatalogRepository(formal),
    storage: { readArchiveEntry: async () => null }
  });

  await assert.rejects(
    service.getAttemptSnapshots(EXAM_ID),
    (error) => error.code === 'FORMAL_ASSESSMENT_DISABLED'
  );
});

test('published asset bytes must match both stored size and sha256', async () => {
  const bytes = Buffer.from('published-asset');
  const repository = new MemoryCatalogRepository();
  repository.assets.set('asset-ok', {
    id: 'asset-ok',
    storageKey: 'job/source.zip#assets/example.png',
    mimeType: 'image/png',
    sizeBytes: bytes.length,
    sha256: sha256(bytes)
  });
  const service = new CatalogService({ repository, storage: { readArchiveEntry: async () => bytes } });

  assert.deepEqual((await service.getPublishedAsset('asset-ok')).data, bytes);
  repository.assets.get('asset-ok').sha256 = '0'.repeat(64);
  await assert.rejects(
    service.getPublishedAsset('asset-ok'),
    (error) => error.code === 'PUBLISHED_ASSET_INTEGRITY_FAILED' && error.statusCode === 500
  );
});
