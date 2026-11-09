import crypto, { randomUUID } from 'node:crypto';
import { assessEvidence, validateAssessmentFramework } from './assessment-engine.js';

const canonicalJson = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};
const sha256Json = (value) => crypto.createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
const assessmentError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{2,159}$/;

const assertFrameworkIntegrity = (framework) => {
  if (sha256Json(framework.config) !== framework.configSha256) {
    throw assessmentError('ASSESSMENT_FRAMEWORK_INTEGRITY_FAILED', 'Assessment framework không còn toàn vẹn.', 500);
  }
};

const assertResultIntegrity = (result) => {
  const expected = sha256Json({
    evidenceSnapshot: result.evidenceSnapshot,
    interpretation: result.interpretation
  });
  if (expected !== result.snapshotSha256) {
    throw assessmentError('ASSESSMENT_RESULT_INTEGRITY_FAILED', 'Assessment result không còn toàn vẹn.', 500);
  }
};

const publicFramework = (framework) => ({
  id: framework.id,
  definitionId: framework.definitionId,
  stableKey: framework.stableKey,
  version: framework.version,
  approvalStatus: framework.approvalStatus,
  configSha256: framework.configSha256,
  config: framework.config,
  creator: framework.creator,
  review: framework.review || null,
  createdAt: framework.createdAt
});

const publicResult = (result, duplicate = false) => ({
  id: result.id,
  frameworkVersionId: result.frameworkVersionId,
  framework: result.framework,
  state: result.state,
  interpretation: result.interpretation,
  snapshotSha256: result.snapshotSha256,
  generatedAt: result.generatedAt,
  duplicate
});

export class AssessmentService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  async createFramework({ creatorUserId, idempotencyKey, stableKey, framework }) {
    if (typeof stableKey !== 'string' || !STABLE_KEY.test(stableKey)) {
      throw assessmentError(
        'INVALID_ASSESSMENT_STABLE_KEY',
        'stableKey phải dài 3–160 ký tự và chỉ gồm chữ thường, số, dấu . _ : -.',
        400
      );
    }
    const config = validateAssessmentFramework(framework);
    const requestSha256 = sha256Json({ stableKey, config });
    const existing = await this.repository.findFrameworkByIdempotency(creatorUserId, idempotencyKey);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw assessmentError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho framework khác.');
      }
      assertFrameworkIntegrity(existing);
      return { ...publicFramework(existing), duplicate: true };
    }
    const stored = await this.repository.createFramework({
      id: randomUUID(),
      definitionId: randomUUID(),
      stableKey,
      version: 1,
      config,
      configSha256: sha256Json(config),
      requestSha256,
      idempotencyKey,
      creatorUserId,
      createdAt: this.now(),
      auditId: randomUUID()
    });
    assertFrameworkIntegrity(stored.framework);
    return { ...publicFramework(stored.framework), duplicate: stored.duplicate };
  }

  async listReviewQueue(reviewerUserId) {
    return this.repository.listFrameworkReviewQueue(reviewerUserId);
  }

  async getForReview(id) {
    const framework = await this.repository.findFrameworkForReview(id);
    if (!framework) return null;
    assertFrameworkIntegrity(framework);
    return publicFramework(framework);
  }

  async reviewFramework({ id, reviewerUserId, decision, reason }) {
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw assessmentError('INVALID_REVIEW_DECISION', 'Decision phải là APPROVE hoặc REJECT.', 400);
    }
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
      throw assessmentError('INVALID_REVIEW_REASON', 'Lý do review cần từ 10 đến 1000 ký tự.', 400);
    }
    const framework = await this.repository.findFrameworkForReview(id);
    if (!framework) return null;
    assertFrameworkIntegrity(framework);
    if (framework.creator.id === reviewerUserId) {
      throw assessmentError('SELF_REVIEW_FORBIDDEN', 'Người tạo framework không được tự duyệt.');
    }
    const stored = await this.repository.createFrameworkReview({
      id: randomUUID(),
      frameworkVersionId: id,
      reviewerUserId,
      decision,
      reason: reason.trim(),
      configSha256: framework.configSha256,
      createdAt: this.now(),
      auditId: randomUUID()
    });
    assertFrameworkIntegrity(stored);
    return publicFramework(stored);
  }

  async listAvailable() {
    return this.repository.listApprovedFrameworks();
  }

  async generate({ studentUserId, frameworkVersionId, idempotencyKey }) {
    const requestSha256 = sha256Json({ frameworkVersionId });
    const existing = await this.repository.findResultByIdempotency(studentUserId, idempotencyKey);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw assessmentError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho assessment khác.');
      }
      assertResultIntegrity(existing);
      return publicResult(existing, true);
    }
    const framework = await this.repository.findApprovedFramework(frameworkVersionId);
    if (!framework) return null;
    assertFrameworkIntegrity(framework);
    const evidence = await this.repository.listFinalEvidence({ studentUserId, framework: framework.config });
    const assessed = assessEvidence(framework.config, evidence);
    const evidenceSnapshot = {
      ...assessed.evidenceSnapshot,
      frameworkVersionId: framework.id,
      frameworkConfigSha256: framework.configSha256
    };
    const snapshotSha256 = sha256Json({
      evidenceSnapshot,
      interpretation: assessed.interpretation
    });
    const stored = await this.repository.createResult({
      id: randomUUID(),
      studentUserId,
      frameworkVersionId,
      idempotencyKey,
      requestSha256,
      state: assessed.interpretation.state,
      evidenceSnapshot,
      interpretation: assessed.interpretation,
      snapshotSha256,
      generatedAt: this.now(),
      auditId: randomUUID()
    });
    assertResultIntegrity(stored.result);
    return publicResult(stored.result, stored.duplicate);
  }

  async getOwned(id, studentUserId) {
    const result = await this.repository.findResultOwned(id, studentUserId);
    if (!result) return null;
    assertResultIntegrity(result);
    return publicResult(result);
  }

  async getLatestOwned(frameworkVersionId, studentUserId) {
    const result = await this.repository.findLatestResultOwned(frameworkVersionId, studentUserId);
    if (!result) return null;
    assertResultIntegrity(result);
    return publicResult(result);
  }
}
