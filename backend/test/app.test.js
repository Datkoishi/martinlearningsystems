import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp, getApiInfo, getDemoStudentExam, getHealthStatus } from '../src/app.js';
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
