import crypto, { randomUUID } from 'node:crypto';
import { toStudentExam } from '../domain/exam-presentation.js';
import { assembleBlueprint, validateBlueprint, validateSeed } from './assembly-engine.js';

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};

const sha256Json = (value) => crypto.createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
const assemblyError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

const selectionManifest = (selection) => ({
  sections: selection.sections.map(({ section, units }) => ({
    sectionId: section.id,
    units: units.map((unit) => ({
      unitId: unit.id,
      selectionPolicy: unit.selectionPolicy,
      stimulusVersionId: unit.stimulus?.id || null,
      questionVersionIds: unit.questions.map((question) => question.versionId),
      sourceIds: [...new Set(unit.questions.map((question) => question.sourceId))].sort()
    }))
  }))
});

const buildSnapshots = (runId, selection, assets) => {
  let questionOrder = 0;
  const stimuli = new Map();
  const internalSections = selection.sections.map(({ section, units }) => ({
    id: section.id,
    title: section.title,
    instruction: section.instruction,
    groups: units.map((unit) => {
      if (unit.stimulus) stimuli.set(unit.stimulus.id, unit.stimulus);
      return {
        id: unit.id,
        stimulusVersionId: unit.stimulus?.id || null,
        selectionPolicy: unit.selectionPolicy,
        questions: unit.questions.map((question) => {
          questionOrder += 1;
          return { ...question, order: questionOrder };
        })
      };
    })
  }));
  const internalExam = {
    id: runId,
    versionId: runId,
    version: 1,
    mode: 'ASSEMBLED',
    purpose: selection.blueprint.purpose,
    approvalStatus: 'SNAPSHOT',
    title: selection.blueprint.title,
    description: selection.blueprint.description,
    grade: selection.blueprint.grade,
    subject: selection.blueprint.subject,
    durationMinutes: selection.blueprint.durationMinutes,
    schemaVersion: '1.0.0',
    assets,
    stimuli: [...stimuli.values()],
    sections: internalSections
  };
  return {
    studentSnapshot: toStudentExam(internalExam),
    scoringSnapshot: {
      schemaVersion: '1.0.0',
      assemblyRunId: runId,
      engineVersion: selection.engineVersion,
      questions: internalSections.flatMap((section) => section.groups.flatMap((group) => group.questions.map((question) => ({
        questionVersionId: question.versionId,
        type: question.type,
        points: question.points,
        optionIds: question.options.map((option) => option.id),
        answerKey: question.answerKey
      }))))
    }
  };
};

const assertOperationMatches = (run, requestSha256) => {
  if (run.requestSha256 !== requestSha256) {
    throw assemblyError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho blueprint hoặc seed khác.');
  }
};

const assertIntegrity = (run) => {
  const expectedSelection = sha256Json({
    blueprint: run.blueprint,
    engineVersion: run.engineVersion,
    seed: run.seed,
    selection: run.selectionManifest
  });
  const expectedSnapshot = sha256Json({
    scoringSnapshot: run.scoringSnapshot,
    studentSnapshot: run.studentSnapshot
  });
  if (expectedSelection !== run.selectionSha256 || expectedSnapshot !== run.snapshotSha256) {
    throw assemblyError('ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED', 'Assembly snapshot không còn toàn vẹn.', 500);
  }
};

const publicRun = (run, duplicate = false) => ({
  id: run.id,
  status: run.status,
  blueprint: run.blueprint,
  seed: run.seed,
  engineVersion: run.engineVersion,
  selectionSha256: run.selectionSha256,
  snapshotSha256: run.snapshotSha256,
  selection: run.selectionManifest,
  sourceDistribution: run.sourceDistribution,
  snapshot: run.studentSnapshot,
  createdAt: run.createdAt,
  duplicate
});

export class AssemblyService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  async create({ creatorUserId, idempotencyKey, blueprint, seed }) {
    const normalizedBlueprint = validateBlueprint(blueprint);
    const normalizedSeed = validateSeed(seed);
    const request = { blueprint: normalizedBlueprint, seed: normalizedSeed };
    const requestSha256 = sha256Json(request);
    const existing = await this.repository.findByIdempotency(creatorUserId, idempotencyKey);
    if (existing) {
      assertOperationMatches(existing, requestSha256);
      assertIntegrity(existing);
      return publicRun(existing, true);
    }
    const pool = await this.repository.listEligiblePool({
      grade: normalizedBlueprint.grade,
      subject: normalizedBlueprint.subject,
      curriculumVersion: normalizedBlueprint.curriculumVersion,
      acceptedOriginTypes: normalizedBlueprint.acceptedOriginTypes,
      acceptedLicenseIds: normalizedBlueprint.acceptedLicenseIds
    });
    const selection = assembleBlueprint(normalizedBlueprint, pool, normalizedSeed);
    const id = randomUUID();
    const manifest = selectionManifest(selection);
    const snapshots = buildSnapshots(id, selection, pool.assets);
    const run = {
      id,
      creatorUserId,
      idempotencyKey,
      requestSha256,
      status: 'SUCCEEDED',
      blueprint: normalizedBlueprint,
      seed: normalizedSeed,
      engineVersion: selection.engineVersion,
      selectionManifest: manifest,
      sourceDistribution: selection.sourceDistribution,
      selectionSha256: sha256Json({
        blueprint: normalizedBlueprint,
        engineVersion: selection.engineVersion,
        seed: normalizedSeed,
        selection: manifest
      }),
      studentSnapshot: snapshots.studentSnapshot,
      scoringSnapshot: snapshots.scoringSnapshot,
      snapshotSha256: sha256Json(snapshots),
      createdAt: this.now(),
      auditId: randomUUID()
    };
    const stored = await this.repository.createRun(run);
    assertOperationMatches(stored.run, requestSha256);
    assertIntegrity(stored.run);
    return publicRun(stored.run, stored.duplicate);
  }

  async getOwned(id, creatorUserId) {
    const run = await this.repository.findOwned(id, creatorUserId);
    if (!run) return null;
    assertIntegrity(run);
    return publicRun(run);
  }
}
