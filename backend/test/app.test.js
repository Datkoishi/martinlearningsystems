import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  createApp,
  getApiInfo,
  getDemoStudentExam,
  getHealthStatus,
  getLivenessStatus,
  getReadinessStatus
} from '../src/app.js';
import { demoFixedExam } from '../src/domain/demo-exam.js';
import { toStudentExam } from '../src/domain/exam-presentation.js';
import { validateRichContent } from '../src/domain/rich-content.js';

test('API identity is configured', () => {
  assert.deepEqual(getApiInfo(), {
    message: 'Martin Learning Systems API'
  });
});

test('health status reports a connected database', async () => {
  const body = await getHealthStatus(async () => true);

  assert.deepEqual(body, { status: 'ok', database: 'connected' });
});

test('health status rejects when the database is unavailable', async () => {
  await assert.rejects(
    getHealthStatus(async () => {
      throw new Error('database unavailable');
    }),
    /database unavailable/
  );
});

test('liveness is process-only while readiness fails during drain or database outage', async () => {
  assert.deepEqual(getLivenessStatus(), { status: 'ok' });
  assert.deepEqual(
    await getReadinessStatus(async () => true, () => true),
    { status: 'ready', database: 'connected' }
  );
  await assert.rejects(
    getReadinessStatus(async () => true, () => false),
    (error) => error.code === 'SERVICE_DRAINING'
  );
  await assert.rejects(
    getReadinessStatus(async () => { throw new Error('database unavailable'); }, () => true),
    /database unavailable/
  );
});

test('app applies the configured trusted proxy hop count', () => {
  const app = createApp({ importsEnabled: false, trustProxy: 1 });
  assert.equal(app.get('trust proxy'), 1);
});

test('runtime routes keep liveness up while readiness drains', async (context) => {
  let ready = true;
  const app = createApp({
    databaseCheck: async () => true,
    importsEnabled: false,
    readinessCheck: () => ready
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const live = await fetch(`${baseUrl}/api/live`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });

  const available = await fetch(`${baseUrl}/api/ready`);
  assert.equal(available.status, 200);
  assert.deepEqual(await available.json(), { status: 'ready', database: 'connected' });

  ready = false;
  const draining = await fetch(`${baseUrl}/api/ready`);
  assert.equal(draining.status, 503);
  assert.equal((await draining.json()).status, 'not_ready');

  const stillLive = await fetch(`${baseUrl}/api/live`);
  assert.equal(stillLive.status, 200);
});

test('rich content validates image, math and merged table cells', () => {
  const content = {
    schemaVersion: '1.0.0',
    nodes: [
      { type: 'paragraph', children: [{ type: 'math_inline', latex: 'a^2+b^2=c^2' }] },
      { type: 'figure', assetId: 'asset-1', alt: 'Tam giác vuông' },
      {
        type: 'table',
        rows: [[{ colspan: 2, content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Tiêu đề' }] }] }]]
      }
    ]
  };

  assert.deepEqual(validateRichContent(content), { valid: true, errors: [] });
});

test('rich content rejects unsafe links and figures without alt text', () => {
  const result = validateRichContent({
    schemaVersion: '1.0.0',
    nodes: [
      {
        type: 'paragraph',
        children: [{ type: 'link', href: 'javascript:alert(1)', children: [{ type: 'text', text: 'x' }] }]
      },
      { type: 'figure', assetId: 'asset-1', alt: '' }
    ]
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test('student exam payload preserves fixed order but never exposes answers', () => {
  const payload = toStudentExam(demoFixedExam);
  const questions = payload.sections.flatMap((section) => section.groups.flatMap((group) => group.questions));

  assert.deepEqual(questions.map((question) => question.order), [1, 2, 3]);
  assert.equal(payload.sections[0].groups[0].selectionPolicy, 'ATOMIC_ALL');
  assert.ok(payload.stimuli[0].content.nodes.some((node) => node.type === 'figure'));
  assert.ok(questions[0].content.nodes[0].children.some((node) => node.type === 'math_inline'));
  assert.ok(questions[2].content.nodes.some((node) => node.type === 'table'));
  assert.equal(JSON.stringify(payload).includes('answerKey'), false);
  assert.equal(JSON.stringify(payload).includes('explanation'), false);
});

test('exam presentation rejects a missing asset before it reaches students', () => {
  const exam = structuredClone(demoFixedExam);
  exam.assets = {};

  assert.throws(() => toStudentExam(exam), (error) => error.code === 'MISSING_ASSET');
});

test('demo exam controller returns a student-safe payload for the API route', () => {
  const payload = getDemoStudentExam();
  assert.equal(payload.mode, 'FIXED');
  assert.equal(JSON.stringify(payload).includes('correctOptionIds'), false);
});

test('attempt response, submit and result routes enforce student auth, CSRF and structured conflicts', async (context) => {
  const studentId = '00000000-0000-4000-8000-000000000501';
  const attemptId = '00000000-0000-4000-8000-000000000502';
  const questionVersionId = '00000000-0000-4000-8000-000000000503';
  const calls = [];
  const authService = {
    async authenticate(token) {
      return {
        expiresAt: new Date('2026-11-08T00:00:00Z'),
        csrfTokenHash: 'test-only',
        user: {
          id: studentId,
          roles: token === 'editor-session' ? ['CONTENT_EDITOR'] : ['STUDENT']
        }
      };
    },
    validateCsrf: (_auth, token) => token === 'csrf-token'
  };
  const attemptService = {
    async saveResponses(command) {
      calls.push(['save', command]);
      if (command.idempotencyKey === 'conflict-key-001') {
        throw Object.assign(new Error('Revision conflict.'), {
          code: 'ATTEMPT_REVISION_CONFLICT',
          statusCode: 409,
          details: { currentRevision: 2 }
        });
      }
      return { id: command.id, answerRevision: 1, responses: { [questionVersionId]: 'option-a' } };
    },
    async submit(command) {
      calls.push(['submit', command]);
      return { attempt: { id: command.id, status: 'SCORED' }, result: { scoreRevision: 1 } };
    },
    async getResult(id, ownerId) {
      calls.push(['result', { id, ownerId }]);
      return { attemptId: id, scoreRevision: 1 };
    }
  };
  const app = createApp({ authService, attemptService, importsEnabled: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const studentCookie = 'eduassess_session=student-session; eduassess_csrf=csrf-token';
  const requestBody = JSON.stringify({
    baseRevision: 0,
    responses: [{ questionVersionId, answer: 'option-a' }]
  });

  const missingCsrf = await fetch(`${baseUrl}/api/attempts/${attemptId}/responses`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: studentCookie, 'Idempotency-Key': 'save-key-0001' },
    body: requestBody
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(calls.length, 0);

  const forbiddenRole = await fetch(`${baseUrl}/api/attempts/${attemptId}/responses`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'eduassess_session=editor-session; eduassess_csrf=csrf-token',
      'X-CSRF-Token': 'csrf-token',
      'Idempotency-Key': 'save-key-0001'
    },
    body: requestBody
  });
  assert.equal(forbiddenRole.status, 403);
  assert.equal(calls.length, 0);

  const saved = await fetch(`${baseUrl}/api/attempts/${attemptId}/responses`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json', Cookie: studentCookie,
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'save-key-0001'
    },
    body: requestBody
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).answerRevision, 1);
  assert.equal(calls[0][1].studentUserId, studentId);

  const conflict = await fetch(`${baseUrl}/api/attempts/${attemptId}/responses`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json', Cookie: studentCookie,
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'conflict-key-001'
    },
    body: requestBody
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual((await conflict.json()).details, { currentRevision: 2 });

  const submitted = await fetch(`${baseUrl}/api/attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: studentCookie,
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'submit-key-001'
    },
    body: JSON.stringify({ baseRevision: 1 })
  });
  assert.equal(submitted.status, 200);
  assert.equal((await submitted.json()).attempt.status, 'SCORED');

  const result = await fetch(`${baseUrl}/api/attempts/${attemptId}/result`, {
    headers: { Cookie: studentCookie }
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).scoreRevision, 1);
  assert.deepEqual(calls.at(-1), ['result', { id: attemptId, ownerId: studentId }]);
});

test('assembly routes require Editor, CSRF, idempotency and owner-scoped reads', async (context) => {
  const editorId = '00000000-0000-4000-8000-000000000511';
  const assemblyId = '00000000-0000-4000-8000-000000000512';
  const reviewerId = '00000000-0000-4000-8000-000000000513';
  const calls = [];
  const authService = {
    async authenticate(token) {
      const role = token === 'student-session'
        ? 'STUDENT'
        : token === 'reviewer-session' ? 'ACADEMIC_REVIEWER' : 'CONTENT_EDITOR';
      return {
        expiresAt: new Date('2026-11-08T00:00:00Z'),
        csrfTokenHash: 'test-only',
        user: {
          id: role === 'ACADEMIC_REVIEWER' ? reviewerId : editorId,
          roles: [role]
        }
      };
    },
    validateCsrf: (_auth, token) => token === 'csrf-token'
  };
  const assemblyService = {
    async create(command) {
      calls.push(['create', command]);
      return { id: assemblyId, status: 'SUCCEEDED', duplicate: false };
    },
    async createRevision(command) {
      calls.push(['revision', command]);
      return { id: assemblyId, blueprintVersion: 2, status: 'SUCCEEDED', duplicate: false };
    },
    async listOwned(ownerId, filters) {
      calls.push(['owned-queue', { ownerId, filters }]);
      return { items: [{ id: assemblyId }], total: 1, page: 1, limit: 20, nextPage: null };
    },
    async listReviewQueue(reviewerUserId, filters) {
      calls.push(['review-queue', { reviewerUserId, filters }]);
      return { items: [{ id: assemblyId }], total: 1, page: 1, limit: 20, nextPage: null };
    },
    async getOwned(id, ownerId) {
      calls.push(['get', { id, ownerId }]);
      return { id, status: 'SUCCEEDED' };
    },
    async getReviewerPreview(id) {
      calls.push(['preview', { id }]);
      return { id, approvalStatus: 'NEEDS_REVIEW' };
    },
    async getReviewerAsset(id, assetId) {
      calls.push(['asset', { id, assetId }]);
      return { data: Buffer.from('reviewer-asset'), mimeType: 'image/png' };
    },
    async review(command) {
      calls.push(['review', command]);
      return { id: command.id, approvalStatus: 'APPROVED' };
    },
    async publish(command) {
      calls.push(['publish', command]);
      return { publication: { examVersionId: '00000000-0000-4000-8000-000000000514' }, duplicate: false };
    }
  };
  const app = createApp({ authService, assemblyService, importsEnabled: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const editorCookie = 'eduassess_session=editor-session; eduassess_csrf=csrf-token';
  const body = JSON.stringify({ blueprint: { schemaVersion: '1.0.0' }, seed: 'assembly-seed-001' });

  const student = await fetch(`${baseUrl}/api/assemblies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'eduassess_session=student-session; eduassess_csrf=csrf-token',
      'X-CSRF-Token': 'csrf-token',
      'Idempotency-Key': 'assembly-key-001'
    },
    body
  });
  assert.equal(student.status, 403);
  assert.equal(calls.length, 0);

  const missingCsrf = await fetch(`${baseUrl}/api/assemblies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: editorCookie, 'Idempotency-Key': 'assembly-key-001' },
    body
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(calls.length, 0);

  const missingKey = await fetch(`${baseUrl}/api/assemblies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: editorCookie, 'X-CSRF-Token': 'csrf-token' },
    body
  });
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).code, 'INVALID_IDEMPOTENCY_KEY');
  assert.equal(calls.length, 0);

  const created = await fetch(`${baseUrl}/api/assemblies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: editorCookie,
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'assembly-key-001'
    },
    body
  });
  assert.equal(created.status, 201);
  assert.equal(calls[0][1].creatorUserId, editorId);
  assert.equal(calls[0][1].idempotencyKey, 'assembly-key-001');

  const ownedQueue = await fetch(`${baseUrl}/api/assemblies?status=NEEDS_REVIEW&purpose=PRACTICE&q=demo`, {
    headers: { Cookie: editorCookie }
  });
  assert.equal(ownedQueue.status, 200);
  assert.deepEqual((await ownedQueue.json()).items, [{ id: assemblyId }]);
  assert.deepEqual(calls.at(-1), ['owned-queue', {
    ownerId: editorId,
    filters: { status: 'NEEDS_REVIEW', purpose: 'PRACTICE', query: 'demo', page: undefined, limit: undefined }
  }]);

  const revisionMissingCsrf = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/revisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: editorCookie, 'Idempotency-Key': 'assembly-revision-key-001' },
    body
  });
  assert.equal(revisionMissingCsrf.status, 403);
  const revision = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/revisions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: editorCookie,
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'assembly-revision-key-001'
    },
    body
  });
  assert.equal(revision.status, 201);
  assert.deepEqual(calls.at(-1)[0], 'revision');
  assert.equal(calls.at(-1)[1].sourceRunId, assemblyId);
  assert.equal(calls.at(-1)[1].creatorUserId, editorId);

  const restored = await fetch(`${baseUrl}/api/assemblies/${assemblyId}`, {
    headers: { Cookie: editorCookie }
  });
  assert.equal(restored.status, 200);
  assert.deepEqual(calls.at(-1), ['get', { id: assemblyId, ownerId: editorId }]);

  const editorPreview = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/reviewer-preview`, {
    headers: { Cookie: editorCookie }
  });
  assert.equal(editorPreview.status, 403);

  const reviewerCookie = 'eduassess_session=reviewer-session; eduassess_csrf=csrf-token';
  const reviewerQueue = await fetch(`${baseUrl}/api/assembly-review-queue?status=NEEDS_REVIEW&page=1&limit=25`, {
    headers: { Cookie: reviewerCookie }
  });
  assert.equal(reviewerQueue.status, 200);
  assert.deepEqual((await reviewerQueue.json()).items, [{ id: assemblyId }]);
  assert.deepEqual(calls.at(-1), ['review-queue', {
    reviewerUserId: reviewerId,
    filters: { status: 'NEEDS_REVIEW', purpose: undefined, query: undefined, page: '1', limit: '25' }
  }]);

  const editorQueueDenied = await fetch(`${baseUrl}/api/assembly-review-queue`, {
    headers: { Cookie: editorCookie }
  });
  assert.equal(editorQueueDenied.status, 403);

  const reviewerPreview = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/reviewer-preview`, {
    headers: { Cookie: reviewerCookie }
  });
  assert.equal(reviewerPreview.status, 200);
  assert.deepEqual(calls.at(-1), ['preview', { id: assemblyId }]);

  const assetId = '00000000-0000-4000-8000-000000000515';
  const reviewerAsset = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/assets/${assetId}`, {
    headers: { Cookie: reviewerCookie }
  });
  assert.equal(reviewerAsset.status, 200);
  assert.equal(await reviewerAsset.text(), 'reviewer-asset');
  assert.deepEqual(calls.at(-1), ['asset', { id: assemblyId, assetId }]);

  const reviewed = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: reviewerCookie,
      'X-CSRF-Token': 'csrf-token'
    },
    body: JSON.stringify({ decision: 'APPROVE', reason: 'Đã kiểm tra toàn bộ snapshot assembled.' })
  });
  assert.equal(reviewed.status, 201);
  assert.equal(calls.at(-1)[1].reviewerUserId, reviewerId);

  const published = await fetch(`${baseUrl}/api/assemblies/${assemblyId}/publish`, {
    method: 'POST',
    headers: { Cookie: reviewerCookie, 'X-CSRF-Token': 'csrf-token' }
  });
  assert.equal(published.status, 201);
  assert.deepEqual(calls.at(-1), ['publish', { id: assemblyId, publisherUserId: reviewerId }]);
});

test('assessment routes enforce specialist authoring, independent review and Student ownership', async (context) => {
  const specialistId = '00000000-0000-4000-8000-000000000611';
  const reviewerId = '00000000-0000-4000-8000-000000000612';
  const studentId = '00000000-0000-4000-8000-000000000613';
  const frameworkId = '00000000-0000-4000-8000-000000000614';
  const resultId = '00000000-0000-4000-8000-000000000615';
  const calls = [];
  const authService = {
    async authenticate(token) {
      const identity = token === 'specialist-session'
        ? { id: specialistId, role: 'ASSESSMENT_SPECIALIST' }
        : token === 'reviewer-session'
          ? { id: reviewerId, role: 'ACADEMIC_REVIEWER' }
          : token === 'student-session'
            ? { id: studentId, role: 'STUDENT' }
            : { id: '00000000-0000-4000-8000-000000000616', role: 'CONTENT_EDITOR' };
      return {
        expiresAt: new Date('2026-11-09T00:00:00Z'),
        csrfTokenHash: 'test-only',
        user: { id: identity.id, roles: [identity.role] }
      };
    },
    validateCsrf: (_auth, token) => token === 'csrf-token'
  };
  const assessmentService = {
    async createFramework(command) {
      calls.push(['create-framework', command]);
      return { id: frameworkId, approvalStatus: 'NEEDS_REVIEW', duplicate: false };
    },
    async listReviewQueue(userId) {
      calls.push(['framework-queue', userId]);
      return { items: [{ id: frameworkId }] };
    },
    async listAvailable() {
      calls.push(['available']);
      return { items: [{ id: frameworkId }] };
    },
    async getForReview(id) {
      calls.push(['framework-preview', id]);
      return { id, approvalStatus: 'NEEDS_REVIEW' };
    },
    async reviewFramework(command) {
      calls.push(['framework-review', command]);
      return { id: command.id, approvalStatus: 'APPROVED' };
    },
    async generate(command) {
      calls.push(['generate-assessment', command]);
      return { id: resultId, state: 'INSUFFICIENT_EVIDENCE', duplicate: false };
    },
    async getLatestOwned(id, userId) {
      calls.push(['latest-assessment', { id, userId }]);
      return { id: resultId, frameworkVersionId: id };
    },
    async getOwned(id, userId) {
      calls.push(['get-assessment', { id, userId }]);
      return { id, state: 'INSUFFICIENT_EVIDENCE' };
    }
  };
  const app = createApp({ authService, assessmentService, importsEnabled: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cookie = (session) => `eduassess_session=${session}; eduassess_csrf=csrf-token`;
  const frameworkBody = JSON.stringify({ stableKey: 'demo.math.5', framework: { schemaVersion: '1.0.0' } });

  const missingCsrf = await fetch(`${baseUrl}/api/assessment-frameworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: cookie('specialist-session'),
      'Idempotency-Key': 'framework-create-key-001'
    },
    body: frameworkBody
  });
  assert.equal(missingCsrf.status, 403);

  const studentCreate = await fetch(`${baseUrl}/api/assessment-frameworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: cookie('student-session'),
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'framework-create-key-001'
    },
    body: frameworkBody
  });
  assert.equal(studentCreate.status, 403);

  const created = await fetch(`${baseUrl}/api/assessment-frameworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: cookie('specialist-session'),
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'framework-create-key-001'
    },
    body: frameworkBody
  });
  assert.equal(created.status, 201);
  assert.equal(calls.at(-1)[1].creatorUserId, specialistId);

  const queue = await fetch(`${baseUrl}/api/assessment-frameworks/review-queue`, {
    headers: { Cookie: cookie('reviewer-session') }
  });
  assert.equal(queue.status, 200);
  assert.deepEqual((await queue.json()).items, [{ id: frameworkId }]);
  assert.deepEqual(calls.at(-1), ['framework-queue', reviewerId]);

  const preview = await fetch(`${baseUrl}/api/assessment-frameworks/${frameworkId}/reviewer-preview`, {
    headers: { Cookie: cookie('reviewer-session') }
  });
  assert.equal(preview.status, 200);

  const reviewed = await fetch(`${baseUrl}/api/assessment-frameworks/${frameworkId}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: cookie('reviewer-session'),
      'X-CSRF-Token': 'csrf-token'
    },
    body: JSON.stringify({ decision: 'APPROVE', reason: 'Đã kiểm tra toàn bộ coverage và interpretation rules.' })
  });
  assert.equal(reviewed.status, 201);
  assert.equal(calls.at(-1)[1].reviewerUserId, reviewerId);

  const available = await fetch(`${baseUrl}/api/assessment-frameworks/available`, {
    headers: { Cookie: cookie('student-session') }
  });
  assert.equal(available.status, 200);

  const generated = await fetch(`${baseUrl}/api/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: cookie('student-session'),
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'assessment-generate-key-001'
    },
    body: JSON.stringify({ frameworkVersionId: frameworkId })
  });
  assert.equal(generated.status, 201);
  assert.equal(calls.at(-1)[1].studentUserId, studentId);

  const latest = await fetch(`${baseUrl}/api/assessments/latest?frameworkVersionId=${frameworkId}`, {
    headers: { Cookie: cookie('student-session') }
  });
  assert.equal(latest.status, 200);
  assert.deepEqual(calls.at(-1), ['latest-assessment', { id: frameworkId, userId: studentId }]);

  const result = await fetch(`${baseUrl}/api/assessments/${resultId}`, {
    headers: { Cookie: cookie('student-session') }
  });
  assert.equal(result.status, 200);
  assert.deepEqual(calls.at(-1), ['get-assessment', { id: resultId, userId: studentId }]);

  const reviewerGenerate = await fetch(`${baseUrl}/api/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Cookie: cookie('reviewer-session'),
      'X-CSRF-Token': 'csrf-token', 'Idempotency-Key': 'assessment-generate-key-002'
    },
    body: JSON.stringify({ frameworkVersionId: frameworkId })
  });
  assert.equal(reviewerGenerate.status, 403);
});
