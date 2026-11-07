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

const collectContentAssetIds = (content, target) => {
  const visit = (nodes) => (nodes || []).forEach((node) => {
    if (node.type === 'figure') target.add(node.assetId);
    if (node.type === 'table') node.rows.forEach((row) => row.forEach((cell) => visit(cell.content)));
    if (node.type === 'list') node.items.forEach(visit);
  });
  visit(content?.nodes);
};

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
    assets: {},
    stimuli: [...stimuli.values()],
    sections: internalSections
  };
  const selectedAssetIds = new Set();
  internalExam.stimuli.forEach((stimulus) => collectContentAssetIds(stimulus.content, selectedAssetIds));
  internalSections.forEach((section) => {
    collectContentAssetIds(section.instruction, selectedAssetIds);
    section.groups.forEach((group) => group.questions.forEach((question) => {
      collectContentAssetIds(question.content, selectedAssetIds);
      collectContentAssetIds(question.explanation, selectedAssetIds);
      question.options.forEach((option) => collectContentAssetIds(option.content, selectedAssetIds));
    }));
  });
  const selectedAssets = Object.fromEntries([...selectedAssetIds].map((id) => [id, assets[id]]));
  internalExam.assets = selectedAssets;
  return {
    studentSnapshot: toStudentExam(internalExam),
    scoringSnapshot: {
      schemaVersion: '1.0.0',
      assemblyRunId: runId,
      engineVersion: selection.engineVersion,
      reviewPayloadVersion: '1.0.0',
      assets: selectedAssets,
      questions: internalSections.flatMap((section) => section.groups.flatMap((group) => group.questions.map((question) => ({
        questionVersionId: question.versionId,
        type: question.type,
        points: question.points,
        optionIds: question.options.map((option) => option.id),
        answerKey: question.answerKey,
        explanation: question.explanation
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
  const blueprintVersionMatches = !run.blueprintVersionSnapshot
    || sha256Json(run.blueprintVersionSnapshot) === sha256Json(run.blueprint);
  if (!blueprintVersionMatches || expectedSelection !== run.selectionSha256 || expectedSnapshot !== run.snapshotSha256) {
    throw assemblyError('ASSEMBLY_SNAPSHOT_INTEGRITY_FAILED', 'Assembly snapshot không còn toàn vẹn.', 500);
  }
};

const publicRun = (run, duplicate = false) => ({
  id: run.id,
  blueprintVersionId: run.blueprintVersionId,
  blueprintVersion: run.blueprintVersion,
  approvalStatus: run.approvalStatus,
  status: run.status,
  blueprint: run.blueprint,
  seed: run.seed,
  engineVersion: run.engineVersion,
  selectionSha256: run.selectionSha256,
  snapshotSha256: run.snapshotSha256,
  selection: run.selectionManifest,
  sourceDistribution: run.sourceDistribution,
  snapshot: run.studentSnapshot,
  review: run.review || null,
  publication: run.publication || null,
  createdAt: run.createdAt,
  duplicate
});

const reviewerSnapshot = (run) => {
  const scoringByQuestion = new Map(run.scoringSnapshot.questions.map((question) => [
    question.questionVersionId,
    question
  ]));
  return {
    ...structuredClone(run.studentSnapshot),
    assets: Object.fromEntries(Object.entries(run.scoringSnapshot.assets || run.studentSnapshot.assets).map(([id, asset]) => [
      id,
      { ...structuredClone(asset), url: `/api/assemblies/${encodeURIComponent(run.id)}/assets/${encodeURIComponent(id)}` }
    ])),
    sections: run.studentSnapshot.sections.map((section) => ({
      ...structuredClone(section),
      groups: section.groups.map((group) => ({
        ...structuredClone(group),
        questions: group.questions.map((question) => {
          const scoring = scoringByQuestion.get(question.versionId);
          return {
            ...structuredClone(question),
            answerKey: structuredClone(scoring?.answerKey),
            explanation: structuredClone(scoring?.explanation)
          };
        })
      }))
    }))
  };
};

const governedRun = (run) => ({
  ...publicRun(run),
  creatorUserId: run.creatorUserId,
  preview: reviewerSnapshot(run)
});

const publicationSnapshots = (run, examVersionId) => {
  const studentSnapshot = {
    ...structuredClone(run.studentSnapshot),
    id: examVersionId,
    versionId: examVersionId,
    version: 1,
    mode: 'ASSEMBLED',
    approvalStatus: 'PUBLISHED'
  };
  const scoringSnapshot = {
    ...structuredClone(run.scoringSnapshot),
    examVersionId
  };
  return {
    studentSnapshot,
    scoringSnapshot,
    snapshotSha256: sha256Json({ scoringSnapshot, studentSnapshot })
  };
};

export class AssemblyService {
  constructor({ repository, assetService = null, now = () => new Date() }) {
    this.repository = repository;
    this.assetService = assetService;
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
    const blueprintId = randomUUID();
    const blueprintVersionId = randomUUID();
    const manifest = selectionManifest(selection);
    const snapshots = buildSnapshots(id, selection, pool.assets);
    const run = {
      id,
      blueprintId,
      blueprintVersionId,
      blueprintVersion: 1,
      blueprintVersionSnapshot: normalizedBlueprint,
      blueprintStableKey: `assembly-run:${id}`,
      approvalStatus: 'NEEDS_REVIEW',
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

  async getReviewerPreview(id) {
    const run = await this.repository.findForReview(id);
    if (!run) return null;
    assertIntegrity(run);
    return governedRun(run);
  }

  async getReviewerAsset(id, assetId) {
    const run = await this.repository.findForReview(id);
    if (!run) return null;
    assertIntegrity(run);
    if (!run.scoringSnapshot.assets?.[assetId]) return null;
    if (!this.assetService) throw assemblyError('ASSEMBLY_ASSET_SERVICE_UNAVAILABLE', 'Asset service chưa sẵn sàng.', 500);
    return this.assetService.getProtectedPublishedAsset(assetId);
  }

  async review({ id, reviewerUserId, decision, reason }) {
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw assemblyError('INVALID_REVIEW_DECISION', 'Decision phải là APPROVE hoặc REJECT.', 400);
    }
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
      throw assemblyError('INVALID_REVIEW_REASON', 'Lý do review cần từ 10 đến 1000 ký tự.', 400);
    }
    const run = await this.repository.findForReview(id);
    if (!run) return null;
    assertIntegrity(run);
    if (run.scoringSnapshot.reviewPayloadVersion !== '1.0.0') {
      throw assemblyError('ASSEMBLY_REVIEW_PAYLOAD_INCOMPLETE', 'Run cũ thiếu reviewer payload; cần tạo assembly run mới.');
    }
    if (run.creatorUserId === reviewerUserId) {
      throw assemblyError('SELF_REVIEW_FORBIDDEN', 'Người tạo assembly run không được tự duyệt run đó.');
    }
    const stored = await this.repository.createReview({
      id: randomUUID(),
      assemblyRunId: id,
      blueprintVersionId: run.blueprintVersionId,
      reviewerUserId,
      decision,
      reason: reason.trim(),
      selectionSha256: run.selectionSha256,
      snapshotSha256: run.snapshotSha256,
      createdAt: this.now(),
      auditId: randomUUID()
    });
    assertIntegrity(stored);
    return governedRun(stored);
  }

  async publish({ id, publisherUserId }) {
    const run = await this.repository.findForReview(id);
    if (!run) return null;
    assertIntegrity(run);
    if (run.blueprint.purpose === 'FORMAL_ASSESSMENT') {
      throw assemblyError('FORMAL_ASSESSMENT_DISABLED', 'Formal assessment chưa có approval policy riêng.');
    }
    const existing = run.publication;
    if (existing) return { run: governedRun(run), publication: existing, duplicate: true };
    const examId = randomUUID();
    const examVersionId = randomUUID();
    const snapshots = publicationSnapshots(run, examVersionId);
    const stored = await this.repository.publish({
      id: randomUUID(),
      assemblyRunId: run.id,
      blueprintVersionId: run.blueprintVersionId,
      examId,
      examStableKey: `assembled:${run.id}`,
      examVersionId,
      publisherUserId,
      selectionSha256: run.selectionSha256,
      sourceSnapshotSha256: run.snapshotSha256,
      studentSnapshot: snapshots.studentSnapshot,
      scoringSnapshot: snapshots.scoringSnapshot,
      snapshotSha256: snapshots.snapshotSha256,
      publishedAt: this.now(),
      auditId: randomUUID()
    });
    assertIntegrity(stored.run);
    return { run: governedRun(stored.run), publication: stored.publication, duplicate: stored.duplicate };
  }
}
