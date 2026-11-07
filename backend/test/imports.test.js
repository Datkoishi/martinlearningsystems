import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import yazl from 'yazl';
import { ImportService } from '../src/imports/import-service.js';
import { LocalImportStorage } from '../src/imports/local-import-storage.js';
import { PackageReadError, readZipEntries, sha256 } from '../src/imports/package-reader.js';
import { validateExamPackage } from '../src/imports/package-validator.js';

const jsonBuffer = (value) => Buffer.from(JSON.stringify(value));

const createZip = (files) => new Promise((resolve, reject) => {
  const zip = new yazl.ZipFile();
  const chunks = [];
  zip.outputStream.on('data', (chunk) => chunks.push(chunk));
  zip.outputStream.on('error', reject);
  zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  Object.entries(files).forEach(([name, data]) => zip.addBuffer(data, name, { mtime: new Date('2026-01-01T00:00:00Z') }));
  zip.end();
});

const buildValidPackage = async ({ corruptChecksum = false, unsafeSvg = false, purpose = 'PRACTICE', generatorMetadata } = {}) => {
  const rich = (...nodes) => ({ schemaVersion: '1.0.0', nodes });
  const paragraph = (value) => ({ type: 'paragraph', children: [{ type: 'text', text: value }] });
  const asset = unsafeSvg
    ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    : Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
  const exam = jsonBuffer({
    schemaVersion: '1.0.0',
    id: 'exam-demo-import',
    title: '[DEMO] Gói đề kiểm thử',
    grade: 5,
    subject: 'Toán',
    durationMinutes: 20,
    mode: 'FIXED',
    purpose,
    sections: [{ id: 'section-1', title: 'Phần I', instruction: rich(paragraph('Chọn đáp án đúng.')), itemRefs: [{ type: 'GROUP', ref: 'group-1' }] }]
  });
  const questions = jsonBuffer({
    schemaVersion: '1.0.0',
    stimuli: [{ id: 'stimulus-1', title: 'Hình chung', content: rich({ type: 'figure', assetId: 'asset-shape', alt: 'Hình vuông' }) }],
    groups: [{ id: 'group-1', stimulusRef: 'stimulus-1', selectionPolicy: 'ATOMIC_ALL', questionRefs: ['question-1'] }],
    questions: [{
      id: 'question-1',
      type: 'SINGLE_CHOICE',
      points: 1,
      grade: 5,
      subject: 'Toán',
      content: rich(paragraph('Đây là hình gì?')),
      options: [
        { id: 'option-a', content: rich(paragraph('Hình vuông')) },
        { id: 'option-b', content: rich(paragraph('Hình tròn')) }
      ]
    }]
  });
  const answers = jsonBuffer({
    schemaVersion: '1.0.0',
    answers: [{ questionRef: 'question-1', answerKey: { correctOptionIds: ['option-a'] }, explanation: rich(paragraph('Bốn cạnh bằng nhau.')) }]
  });
  const payloadFiles = {
    'exam.json': exam,
    'questions.json': questions,
    'answers.json': answers,
    'assets/shape.svg': asset
  };
  const manifest = {
    schemaVersion: '1.0.0',
    packageId: 'pkg-demo-import-001',
    source: {
      name: 'Dữ liệu DEMO kiểm thử',
      originType: 'HUMAN_AUTHORED',
      ...(generatorMetadata ? { generatorMetadata } : {})
    },
    rights: { publishFixed: true, extractReuse: true, derivativeAssembly: true },
    counts: { questions: 1 },
    files: Object.entries(payloadFiles).map(([filePath, data]) => ({
      path: filePath,
      sha256: corruptChecksum && filePath === 'questions.json' ? '0'.repeat(64) : sha256(data),
      sizeBytes: data.length,
      mimeType: filePath.endsWith('.json') ? 'application/json' : 'image/svg+xml',
      ...(filePath.startsWith('assets/') ? { assetId: 'asset-shape', altText: 'Hình vuông' } : {})
    }))
  };
  return createZip({ 'manifest.json': jsonBuffer(manifest), ...payloadFiles });
};

class MemoryImportRepository {
  constructor() {
    this.jobs = [];
    this.reviews = [];
    this.publications = [];
    this.publishedPlans = [];
  }
  async findByPackageHash(packageId, packageSha256) {
    return this.jobs.find((job) => job.packageId === packageId && job.packageSha256 === packageSha256) || null;
  }
  async findById(id) { return this.jobs.find((job) => job.id === id) || null; }
  async create(job) {
    const created = { ...job, createdAt: new Date('2026-11-07T00:00:00Z'), updatedAt: new Date('2026-11-07T00:00:00Z') };
    this.jobs.push(created);
    return created;
  }
  async listReviews(importJobId) { return this.reviews.filter((review) => review.importJobId === importJobId); }
  async createTechnicalReview(review) {
    return this.createReview(review, 'TECHNICAL');
  }
  async createAcademicReview(review) {
    return this.createReview(review, 'ACADEMIC');
  }
  async createReview(review, scope) {
    const job = await this.findById(review.importJobId);
    if (job.createdByUserId && job.createdByUserId === review.reviewerId) {
      const error = new Error('Người nhập package không được tự review package đó.');
      error.code = 'SELF_REVIEW_FORBIDDEN';
      error.statusCode = 409;
      throw error;
    }
    const expectedStatus = scope === 'TECHNICAL' ? 'READY_FOR_REVIEW' : 'TECHNICALLY_APPROVED';
    if (job.status !== expectedStatus || this.reviews.some((item) => item.importJobId === review.importJobId && item.scope === scope)) {
      const error = new Error('Import job không còn ở trạng thái chờ review.');
      error.code = 'IMPORT_NOT_REVIEWABLE';
      error.statusCode = 409;
      throw error;
    }
    const created = {
      ...review,
      scope,
      actorSource: 'AUTHENTICATED_USER',
      status: review.decision === 'APPROVE'
        ? (scope === 'TECHNICAL' ? 'TECHNICALLY_APPROVED' : 'ACADEMICALLY_APPROVED')
        : (scope === 'TECHNICAL' ? 'REJECTED' : 'ACADEMICALLY_REJECTED'),
      createdAt: new Date('2026-11-07T00:00:00Z')
    };
    this.reviews.push(created);
    job.status = created.status;
    job.updatedAt = new Date('2026-11-07T00:01:00Z');
    return created;
  }
  async findPublicationByJob(importJobId) {
    return this.publications.find((item) => item.importJobId === importJobId) || null;
  }
  async publishImport({ plan, publisherId, validationReportSha256, publishedAt }) {
    const job = await this.findById(plan.importJobId);
    if (job.status === 'PUBLISHED') {
      return { publication: this.publications.find((item) => item.importJobId === plan.importJobId), duplicate: true };
    }
    if (job.status !== 'ACADEMICALLY_APPROVED') {
      const error = new Error('Package chưa được phê duyệt học thuật.');
      error.code = 'IMPORT_NOT_PUBLISHABLE';
      error.statusCode = 409;
      throw error;
    }
    const academicApproval = this.reviews.find((item) => (
      item.importJobId === plan.importJobId && item.scope === 'ACADEMIC' && item.decision === 'APPROVE'
      && item.packageSha256 === plan.packageSha256 && item.validationReportSha256 === validationReportSha256
    ));
    if (!academicApproval) {
      const error = new Error('Academic approval không khớp package/report hiện tại.');
      error.code = 'ACADEMIC_APPROVAL_MISMATCH';
      error.statusCode = 409;
      throw error;
    }
    const publication = {
      id: plan.publicationId,
      importJobId: plan.importJobId,
      examVersionId: plan.exam.versionId,
      publishedByUserId: publisherId,
      packageSha256: plan.packageSha256,
      validationReportSha256,
      publishedAt
    };
    this.publishedPlans.push(plan);
    this.publications.push(publication);
    job.status = 'PUBLISHED';
    return { publication, duplicate: false };
  }
}

test('valid Exam Package passes checksum, reference, rich content and rights validation', async () => {
  const zip = await buildValidPackage();
  const files = await readZipEntries(zip);
  const report = validateExamPackage(files, sha256(zip));

  assert.equal(report.status, 'READY_FOR_REVIEW');
  assert.equal(report.errors.length, 0);
  assert.deepEqual(report.summary, { files: 5, questions: 1, stimuli: 1, groups: 1 });
});

test('checksum mismatch makes the staged package invalid', async () => {
  const zip = await buildValidPackage({ corruptChecksum: true });
  const report = validateExamPackage(await readZipEntries(zip), sha256(zip));

  assert.equal(report.status, 'INVALID');
  assert.ok(report.errors.some((error) => error.code === 'CHECKSUM_MISMATCH' && error.path.includes('sha256')));
});

test('unsafe SVG is rejected even when its checksum is correct', async () => {
  const zip = await buildValidPackage({ unsafeSvg: true });
  const report = validateExamPackage(await readZipEntries(zip), sha256(zip));

  assert.equal(report.status, 'INVALID');
  assert.ok(report.errors.some((error) => error.code === 'UNSAFE_SVG'));
});

test('missing structured answer key is reported with its exact field path', async () => {
  const zip = await buildValidPackage();
  const files = await readZipEntries(zip);
  const answers = JSON.parse(files.get('answers.json').toString('utf8'));
  delete answers.answers[0].answerKey;
  files.set('answers.json', jsonBuffer(answers));
  const report = validateExamPackage(files, sha256(zip));

  assert.equal(report.status, 'INVALID');
  assert.ok(report.errors.some((error) => error.code === 'MISSING_ANSWER_KEY' && error.path === 'answers.json.answers[0].answerKey'));
});

test('invalid binary is rejected before staging', async () => {
  await assert.rejects(readZipEntries(Buffer.from('not a zip')), (error) => (
    error instanceof PackageReadError && error.code === 'INVALID_ZIP'
  ));
});

test('import service stores the original once and returns the existing id for an identical package', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-import-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const zip = await buildValidPackage();

  const first = await service.stage(zip);
  const second = await service.stage(zip);
  const stored = await fs.readFile(path.join(root, first.id, 'source.zip'));
  const report = JSON.parse(await fs.readFile(path.join(root, first.id, 'validation-report.json'), 'utf8'));

  assert.equal(first.status, 'READY_FOR_REVIEW');
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  assert.equal(repository.jobs.length, 1);
  assert.equal(sha256(stored), sha256(zip));
  assert.equal(report.packageId, 'pkg-demo-import-001');
});

test('reviewer preview is rebuilt from the stored package with assets and answer keys', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-preview-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = new ImportService({ repository: new MemoryImportRepository(), storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage());

  const result = await service.getReviewerPreview(staged.id);
  const question = result.preview.exam.sections[0].groups[0].questions[0];
  const asset = await service.getAsset(staged.id, 'asset-shape');

  assert.equal(result.preview.packageId, 'pkg-demo-import-001');
  assert.equal(result.preview.exam.mode, 'FIXED');
  assert.deepEqual(question.answerKey.correctOptionIds, ['option-a']);
  assert.equal(question.explanation.schemaVersion, '1.0.0');
  assert.match(result.preview.assets['asset-shape'].url, new RegExp(staged.id));
  assert.equal(asset.mimeType, 'image/svg+xml');
  assert.match(asset.data.toString('utf8'), /<svg/);
});

test('technical review binds the report hash, changes status without publishing and is immutable', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage());

  const result = await service.createTechnicalReview({
    importJobId: staged.id,
    reviewerId: 'reviewer-demo-01',
    decision: 'APPROVE',
    reason: 'Đã đối chiếu cấu trúc, asset và đáp án trong gói DEMO.'
  });

  assert.equal(result.review.scope, 'TECHNICAL');
  assert.match(result.review.validationReportSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.job.status, 'TECHNICALLY_APPROVED');
  assert.notEqual(result.job.status, 'PUBLISHED');
  assert.equal((await service.listReviews(staged.id)).length, 1);
  await assert.rejects(
    service.createTechnicalReview({
      importJobId: staged.id,
      reviewerId: 'reviewer-demo-02',
      decision: 'REJECT',
      reason: 'Không được phép ghi đè quyết định review đã tồn tại.'
    }),
    (error) => error.code === 'IMPORT_NOT_REVIEWABLE' && error.statusCode === 409
  );
});

test('invalid package cannot expose reviewer preview or answers', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-invalid-preview-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = new ImportService({ repository: new MemoryImportRepository(), storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage({ corruptChecksum: true }));

  await assert.rejects(
    service.getReviewerPreview(staged.id),
    (error) => error.code === 'IMPORT_NOT_PREVIEWABLE' && error.statusCode === 409
  );
});

test('authenticated editor cannot technically review the package they staged', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-self-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const actor = { user: { id: '00000000-0000-4000-8000-000000000201' } };
  const staged = await service.stage(await buildValidPackage(), actor);

  assert.equal(staged.createdByUserId, actor.user.id);
  await assert.rejects(
    service.createTechnicalReview({
      importJobId: staged.id,
      reviewerId: actor.user.id,
      decision: 'APPROVE',
      reason: 'Không được tự review package do chính mình nhập.'
    }),
    (error) => error.code === 'SELF_REVIEW_FORBIDDEN' && error.statusCode === 409
  );
});

test('academic approval is a separate immutable gate before publish', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-academic-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage(), {
    user: { id: '00000000-0000-4000-8000-000000000401' }
  });

  await assert.rejects(
    service.createAcademicReview({
      importJobId: staged.id,
      reviewerId: '00000000-0000-4000-8000-000000000402',
      decision: 'APPROVE',
      reason: 'Chưa thể duyệt học thuật trước technical review.'
    }),
    (error) => error.code === 'IMPORT_NOT_REVIEWABLE'
  );
  await service.createTechnicalReview({
    importJobId: staged.id,
    reviewerId: '00000000-0000-4000-8000-000000000402',
    decision: 'APPROVE',
    reason: 'Đã đối chiếu cấu trúc, asset và answer key.'
  });
  const academic = await service.createAcademicReview({
    importJobId: staged.id,
    reviewerId: '00000000-0000-4000-8000-000000000402',
    decision: 'APPROVE',
    reason: 'Đã duyệt tính chính xác học thuật, đáp án và lời giải.'
  });

  assert.equal(academic.review.scope, 'ACADEMIC');
  assert.equal(academic.job.status, 'ACADEMICALLY_APPROVED');
  assert.equal(repository.publications.length, 0);
  await assert.rejects(
    service.createAcademicReview({
      importJobId: staged.id,
      reviewerId: '00000000-0000-4000-8000-000000000403',
      decision: 'REJECT',
      reason: 'Không được ghi đè academic approval đã có.'
    }),
    (error) => error.code === 'IMPORT_NOT_REVIEWABLE'
  );
});

test('publish normalizes the approved package atomically and retry is idempotent', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-publish-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage({
    generatorMetadata: { provider: 'DEMO', model: 'fixture-v1', apiKey: 'must-not-be-published' }
  }), {
    user: { id: '00000000-0000-4000-8000-000000000411' }
  });
  const reviewerId = '00000000-0000-4000-8000-000000000412';
  await service.createTechnicalReview({
    importJobId: staged.id,
    reviewerId,
    decision: 'APPROVE',
    reason: 'Đã kiểm tra toàn bộ cấu trúc package.'
  });
  await service.createAcademicReview({
    importJobId: staged.id,
    reviewerId,
    decision: 'APPROVE',
    reason: 'Đã kiểm tra nội dung, đáp án, lời giải và quyền.'
  });

  const first = await service.publish(staged.id, reviewerId);
  const second = await service.publish(staged.id, reviewerId);
  const plan = repository.publishedPlans[0];

  assert.equal(first.duplicate, false);
  assert.equal(first.job.status, 'PUBLISHED');
  assert.equal(second.duplicate, true);
  assert.equal(second.publication.id, first.publication.id);
  assert.equal(repository.publications.length, 1);
  assert.equal(plan.assets.length, 1);
  assert.deepEqual(plan.source.generatorMetadata, { provider: 'DEMO', model: 'fixture-v1' });
  assert.equal(plan.stimuli.length, 1);
  assert.equal(plan.questions.length, 1);
  assert.deepEqual(plan.questions[0].answerKey.correctOptionIds, [plan.questions[0].options[0].id]);
  assert.equal(plan.stimuli[0].content.nodes[0].assetId, plan.assets[0].id);
  assert.equal(plan.groups[0].questionVersionIds[0], plan.questions[0].versionId);
  assert.equal(plan.exam.sections[0].items[0].questionGroupId, plan.groups[0].id);
  assert.ok(plan.assetReferences.some((reference) => reference.ownerType === 'STIMULUS_VERSION'));
});

test('publish fails closed when source bytes change after approval', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-publish-tamper-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage());
  const reviewerId = '00000000-0000-4000-8000-000000000422';
  await service.createTechnicalReview({ importJobId: staged.id, reviewerId, decision: 'APPROVE', reason: 'Technical review hợp lệ.' });
  await service.createAcademicReview({ importJobId: staged.id, reviewerId, decision: 'APPROVE', reason: 'Academic review hợp lệ.' });
  await fs.writeFile(path.join(root, staged.id, 'source.zip'), Buffer.from('tampered'));

  await assert.rejects(service.publish(staged.id, reviewerId), (error) => error.code === 'PACKAGE_HASH_CHANGED');
  assert.equal(repository.publications.length, 0);
  assert.equal((await service.getById(staged.id)).status, 'ACADEMICALLY_APPROVED');
});

test('formal assessment remains disabled even after academic approval', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eduassess-formal-gate-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = new MemoryImportRepository();
  const service = new ImportService({ repository, storage: new LocalImportStorage(root) });
  const staged = await service.stage(await buildValidPackage({ purpose: 'FORMAL_ASSESSMENT' }));
  const reviewerId = '00000000-0000-4000-8000-000000000432';
  await service.createTechnicalReview({ importJobId: staged.id, reviewerId, decision: 'APPROVE', reason: 'Technical review hợp lệ.' });
  await service.createAcademicReview({ importJobId: staged.id, reviewerId, decision: 'APPROVE', reason: 'Academic review hợp lệ.' });

  await assert.rejects(service.publish(staged.id, reviewerId), (error) => error.code === 'FORMAL_ASSESSMENT_DISABLED');
  assert.equal(repository.publications.length, 0);
});
