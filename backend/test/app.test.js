import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getApiInfo, getDemoStudentExam, getHealthStatus } from '../src/app.js';
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
