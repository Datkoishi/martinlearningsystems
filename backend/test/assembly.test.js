import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleBlueprint, validateBlueprint } from '../src/assembly/assembly-engine.js';
import { AssemblyService } from '../src/assembly/assembly-service.js';

const rich = (text = '') => ({
  schemaVersion: '1.0.0',
  nodes: text ? [{ type: 'paragraph', children: [{ type: 'text', text }] }] : []
});

const question = ({ id, type, topicKey, skillKey, difficulty, sourceId, answerKey, options = [] }) => ({
  id,
  versionId: id,
  type,
  points: 1,
  grade: 5,
  subject: 'Toán',
  curriculumVersion: 'vn-2018',
  topicKey,
  skillKey,
  difficulty,
  estimatedSeconds: 60,
  familyKey: `family-${id}`,
  sourceId,
  licenseId: `license-${sourceId}`,
  originType: 'HUMAN_AUTHORED',
  content: rich(`Nội dung ${id}`),
  explanation: rich(`Lời giải ${id}`),
  answerKey,
  options
});

const choice = (id, topicKey, skillKey, difficulty, sourceId) => {
  const options = [
    { id: `${id}-a`, content: rich('A') },
    { id: `${id}-b`, content: rich('B') }
  ];
  return question({
    id,
    type: 'SINGLE_CHOICE',
    topicKey,
    skillKey,
    difficulty,
    sourceId,
    options,
    answerKey: { correctOptionIds: [`${id}-a`] }
  });
};

const numeric = (id, topicKey, skillKey, difficulty, sourceId) => question({
  id,
  type: 'SHORT_NUMBER',
  topicKey,
  skillKey,
  difficulty,
  sourceId,
  answerKey: { numericValue: 4, tolerance: 0 }
});

const eligiblePool = () => ({
  assets: {},
  units: [
    {
      id: 'group-atomic-geometry',
      selectionPolicy: 'ATOMIC_ALL',
      stimulus: { id: 'stimulus-geometry', title: 'Dữ kiện hình học', content: rich('Dùng chung cho hai câu.') },
      questions: [
        choice('q-geometry-choice', 'geometry', 'reasoning', 'EASY', 'source-a'),
        numeric('q-geometry-number', 'geometry', 'reasoning', 'EASY', 'source-a')
      ]
    },
    {
      id: 'question-arithmetic-choice',
      selectionPolicy: 'DIRECT',
      stimulus: null,
      questions: [choice('q-arithmetic-choice', 'arithmetic', 'calculation', 'MEDIUM', 'source-b')]
    },
    {
      id: 'question-arithmetic-number',
      selectionPolicy: 'DIRECT',
      stimulus: null,
      questions: [numeric('q-arithmetic-number', 'arithmetic', 'calculation', 'MEDIUM', 'source-c')]
    }
  ]
});

const blueprint = () => ({
  schemaVersion: '1.0.0',
  title: '[DEMO] Blueprint Toán 5',
  description: 'Fixture kỹ thuật.',
  grade: 5,
  subject: 'Toán',
  curriculumVersion: 'vn-2018',
  purpose: 'PRACTICE',
  durationMinutes: 10,
  pointRange: { min: 4, max: 4 },
  sourceDiversity: { minSources: 3, maxQuestionsPerSource: 2 },
  acceptedOriginTypes: ['HUMAN_AUTHORED'],
  sections: [{
    id: 'section-1',
    title: 'Phần I',
    count: 4,
    quotas: {
      questionTypes: { SINGLE_CHOICE: 2, SHORT_NUMBER: 2 },
      topics: { geometry: 2, arithmetic: 2 },
      skills: { reasoning: 2, calculation: 2 },
      difficulties: { EASY: 2, MEDIUM: 2 }
    }
  }]
});

class MemoryAssemblyRepository {
  constructor(pool = eligiblePool()) {
    this.pool = pool;
    this.runs = [];
  }
  async findByIdempotency(creatorUserId, idempotencyKey) {
    return this.runs.find((run) => run.creatorUserId === creatorUserId && run.idempotencyKey === idempotencyKey) || null;
  }
  async findOwned(id, creatorUserId) {
    return this.runs.find((run) => run.id === id && run.creatorUserId === creatorUserId) || null;
  }
  async listEligiblePool() { return structuredClone(this.pool); }
  async createRun(run) {
    const existing = await this.findByIdempotency(run.creatorUserId, run.idempotencyKey);
    if (existing) return { run: existing, duplicate: true };
    const created = structuredClone(run);
    this.runs.push(created);
    return { run: created, duplicate: false };
  }
}

test('blueprint validation rejects broken quotas and formal assessment', () => {
  const broken = blueprint();
  broken.sections[0].quotas.topics.geometry = 1;
  assert.throws(() => validateBlueprint(broken), (error) => (
    error.code === 'INCOMPATIBLE_BLUEPRINT' && error.details.actual === 3
  ));
  const formal = blueprint();
  formal.purpose = 'FORMAL_ASSESSMENT';
  assert.throws(() => validateBlueprint(formal), (error) => (
    error.code === 'FORMAL_ASSESSMENT_DISABLED' && error.statusCode === 409
  ));
  assert.throws(
    () => assembleBlueprint(blueprint(), eligiblePool(), 12345678),
    (error) => error.code === 'INVALID_ASSEMBLY_SEED'
  );
});

test('same seed deterministically satisfies quotas, source diversity and atomic groups', () => {
  const first = assembleBlueprint(blueprint(), eligiblePool(), 'deterministic-seed-001');
  const reversed = eligiblePool();
  reversed.units.reverse();
  const second = assembleBlueprint(blueprint(), reversed, 'deterministic-seed-001');
  const selected = (result) => result.sections.flatMap((section) => section.units.map((unit) => unit.id));

  assert.deepEqual(selected(first), selected(second));
  assert.deepEqual(first.sourceDistribution, { 'source-a': 2, 'source-b': 1, 'source-c': 1 });
  assert.equal(first.totalPoints, 4);
  assert.ok(selected(first).includes('group-atomic-geometry'));
  assert.equal(new Set(first.sections.flatMap((section) => section.units.flatMap((unit) => unit.questions.map((item) => item.versionId)))).size, 4);
});

test('insufficient pool fails with structured evidence instead of relaxing quotas', () => {
  const pool = eligiblePool();
  pool.units.pop();
  assert.throws(() => assembleBlueprint(blueprint(), pool, 'deterministic-seed-001'), (error) => (
    error.code === 'INSUFFICIENT_POOL'
    && error.statusCode === 409
    && error.details.requiredQuestions === 4
    && error.details.compatibleQuestions === 3
  ));
});

test('split groups keep their published stimulus in the student snapshot', async () => {
  const splitStimulus = {
    id: 'stimulus-reading-1',
    title: 'Dữ kiện dùng chung',
    content: rich('Đọc dữ kiện này trước khi trả lời.')
  };
  const pool = {
    assets: {},
    units: [
      {
        id: 'group:reading:question:q-reading-choice',
        selectionPolicy: 'SPLIT_WITH_STIMULUS',
        stimulus: splitStimulus,
        questions: [choice('q-reading-choice', 'reading', 'comprehension', 'EASY', 'source-a')]
      },
      {
        id: 'question:q-arithmetic-number',
        selectionPolicy: 'DIRECT',
        stimulus: null,
        questions: [numeric('q-arithmetic-number', 'arithmetic', 'calculation', 'MEDIUM', 'source-b')]
      }
    ]
  };
  const splitBlueprint = {
    ...blueprint(),
    title: '[DEMO] Blueprint split stimulus',
    pointRange: { min: 2, max: 2 },
    sourceDiversity: { minSources: 2, maxQuestionsPerSource: 1 },
    sections: [{
      id: 'section-split',
      title: 'Phần split',
      count: 2,
      quotas: {
        questionTypes: { SINGLE_CHOICE: 1, SHORT_NUMBER: 1 },
        topics: { reading: 1, arithmetic: 1 },
        skills: { comprehension: 1, calculation: 1 },
        difficulties: { EASY: 1, MEDIUM: 1 }
      }
    }]
  };
  const repository = new MemoryAssemblyRepository(pool);
  const service = new AssemblyService({ repository, now: () => new Date('2026-11-07T07:00:00Z') });
  const run = await service.create({
    creatorUserId: 'editor-1',
    idempotencyKey: 'assembly-key-split-001',
    blueprint: splitBlueprint,
    seed: 'split-stimulus-seed-001'
  });

  assert.deepEqual(run.snapshot.stimuli, [splitStimulus]);
  const splitUnit = run.selection.sections[0].units.find((unit) => unit.selectionPolicy === 'SPLIT_WITH_STIMULUS');
  assert.equal(splitUnit?.stimulusVersionId, splitStimulus.id);
  assert.equal(JSON.stringify(run.snapshot).includes('answerKey'), false);
});

test('assembly service persists an immutable student-safe snapshot with exact idempotency', async () => {
  const repository = new MemoryAssemblyRepository();
  const service = new AssemblyService({ repository, now: () => new Date('2026-11-07T07:00:00Z') });
  const command = {
    creatorUserId: 'editor-1',
    idempotencyKey: 'assembly-key-001',
    blueprint: blueprint(),
    seed: 'deterministic-seed-001'
  };
  const first = await service.create(command);
  const retry = await service.create(command);
  const restored = await service.getOwned(first.id, 'editor-1');

  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.id, first.id);
  assert.equal(restored.selectionSha256, first.selectionSha256);
  assert.equal(JSON.stringify(first).includes('answerKey'), false);
  assert.equal(JSON.stringify(first).includes('correctOptionIds'), false);
  assert.equal(repository.runs[0].scoringSnapshot.questions.length, 4);
  assert.ok(repository.runs[0].scoringSnapshot.questions[0].answerKey);
  assert.equal(await service.getOwned(first.id, 'editor-2'), null);

  const changed = blueprint();
  changed.title = '[DEMO] Blueprint khác';
  await assert.rejects(
    service.create({ ...command, blueprint: changed }),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED'
  );
  repository.runs[0].studentSnapshot.title = 'tampered';
  await assert.rejects(
    service.getOwned(first.id, 'editor-1'),
    (error) => error.code === 'ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED'
  );
});
