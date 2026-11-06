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

const buildValidPackage = async ({ corruptChecksum = false, unsafeSvg = false } = {}) => {
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
    purpose: 'PRACTICE',
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
    source: { name: 'Dữ liệu DEMO kiểm thử', originType: 'HUMAN_AUTHORED' },
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
    const job = await this.findById(review.importJobId);
    if (job.status !== 'READY_FOR_REVIEW' || this.reviews.some((item) => item.importJobId === review.importJobId)) {
      const error = new Error('Import job không còn ở trạng thái chờ review.');
      error.code = 'IMPORT_NOT_REVIEWABLE';
      error.statusCode = 409;
      throw error;
    }
    const created = {
      ...review,
      scope: 'TECHNICAL',
      actorSource: 'DEVELOPMENT_HEADER',
      status: review.decision === 'APPROVE' ? 'TECHNICALLY_APPROVED' : 'REJECTED',
      createdAt: new Date('2026-11-07T00:00:00Z')
    };
    this.reviews.push(created);
    job.status = created.status;
    job.updatedAt = new Date('2026-11-07T00:01:00Z');
    return created;
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
