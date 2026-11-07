import crypto, { randomUUID } from 'node:crypto';

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};

const snapshotHash = (studentSnapshot, scoringSnapshot) => crypto.createHash('sha256').update(JSON.stringify(canonicalJson({
  scoringSnapshot,
  studentSnapshot
}))).digest('hex');

const publicAttempt = (attempt, duplicate = false) => ({
  id: attempt.id,
  examVersionId: attempt.examVersionId,
  status: attempt.status,
  snapshot: attempt.studentSnapshot,
  snapshotSha256: attempt.snapshotSha256,
  startedAt: attempt.startedAt,
  updatedAt: attempt.updatedAt,
  duplicate
});

const integrityError = () => Object.assign(new Error('Attempt snapshot không còn toàn vẹn.'), {
  code: 'ATTEMPT_SNAPSHOT_INTEGRITY_FAILED',
  statusCode: 500
});

const idempotencyError = () => Object.assign(new Error('Idempotency-Key đã được dùng cho đề khác.'), {
  code: 'IDEMPOTENCY_KEY_REUSED',
  statusCode: 409
});

const assertIntegrity = (attempt) => {
  if (snapshotHash(attempt.studentSnapshot, attempt.scoringSnapshot) !== attempt.snapshotSha256) throw integrityError();
};

export class AttemptService {
  constructor({ repository, catalogService, now = () => new Date() }) {
    this.repository = repository;
    this.catalogService = catalogService;
    this.now = now;
  }

  async create({ studentUserId, examVersionId, idempotencyKey }) {
    const existing = await this.repository.findByIdempotency(studentUserId, idempotencyKey);
    if (existing) {
      if (existing.examVersionId !== examVersionId) throw idempotencyError();
      assertIntegrity(existing);
      return publicAttempt(existing, true);
    }
    const snapshots = await this.catalogService.getAttemptSnapshots(examVersionId);
    if (!snapshots) return null;
    const result = await this.repository.createAttempt({
      id: randomUUID(),
      studentUserId,
      examVersionId,
      idempotencyKey,
      studentSnapshot: snapshots.studentSnapshot,
      scoringSnapshot: snapshots.scoringSnapshot,
      snapshotSha256: snapshotHash(snapshots.studentSnapshot, snapshots.scoringSnapshot),
      startedAt: this.now(),
      auditId: randomUUID()
    });
    assertIntegrity(result.attempt);
    return publicAttempt(result.attempt, result.duplicate);
  }

  async getOwned(id, studentUserId) {
    const attempt = await this.repository.findOwned(id, studentUserId);
    if (!attempt) return null;
    assertIntegrity(attempt);
    return publicAttempt(attempt);
  }
}
