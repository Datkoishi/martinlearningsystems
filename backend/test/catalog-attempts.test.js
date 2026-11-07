import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttemptService } from '../src/attempts/attempt-service.js';
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
      updatedAt: attempt.startedAt
    };
    this.attempts.push(created);
    return { attempt: created, duplicate: false };
  }
}

const services = () => {
  const catalogRepository = new MemoryCatalogRepository();
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
