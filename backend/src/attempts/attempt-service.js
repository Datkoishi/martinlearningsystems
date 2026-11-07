import crypto, { randomUUID } from 'node:crypto';
import { normalizeAttemptResponse, scoreAttempt } from './scoring-engine.js';

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};

const sha256Json = (value) => crypto.createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');
const snapshotHash = (studentSnapshot, scoringSnapshot) => sha256Json({ scoringSnapshot, studentSnapshot });

const publicAttempt = (attempt, duplicate = false) => ({
  id: attempt.id,
  examVersionId: attempt.examVersionId,
  status: attempt.status,
  snapshot: attempt.studentSnapshot,
  snapshotSha256: attempt.snapshotSha256,
  responses: attempt.responses || {},
  answerRevision: attempt.answerRevision || 0,
  lastSavedAt: attempt.lastSavedAt || null,
  startedAt: attempt.startedAt,
  submittedAt: attempt.submittedAt || null,
  updatedAt: attempt.updatedAt,
  duplicate
});

const attemptError = (code, message, statusCode = 409, details) => Object.assign(new Error(message), {
  code,
  statusCode,
  ...(details ? { details } : {})
});

const integrityError = () => attemptError(
  'ATTEMPT_SNAPSHOT_INTEGRITY_FAILED',
  'Attempt snapshot không còn toàn vẹn.',
  500
);

const assertIntegrity = (attempt) => {
  if (snapshotHash(attempt.studentSnapshot, attempt.scoringSnapshot) !== attempt.snapshotSha256) throw integrityError();
};

const questionMap = (attempt) => new Map(attempt.scoringSnapshot.questions.map((question) => [
  question.questionVersionId,
  question
]));

const normalizeResponses = (attempt, responses) => {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw attemptError('INVALID_RESPONSES', 'responses phải là mảng không rỗng.', 400);
  }
  const questions = questionMap(attempt);
  if (responses.length > questions.size) {
    throw attemptError('INVALID_RESPONSES', 'Số response vượt quá số câu trong attempt.', 400);
  }
  const seen = new Set();
  return responses.map((response) => {
    const questionVersionId = response?.questionVersionId;
    if (typeof questionVersionId !== 'string' || !questions.has(questionVersionId) || seen.has(questionVersionId)) {
      throw attemptError('INVALID_RESPONSES', 'Response tham chiếu câu không tồn tại hoặc bị lặp.', 400);
    }
    seen.add(questionVersionId);
    return {
      questionVersionId,
      answer: normalizeAttemptResponse(questions.get(questionVersionId), response.answer)
    };
  });
};

const publicCorrectAnswer = (question) => {
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(question.type)) {
    return { correctOptionIds: question.correctAnswer.correctOptionIds };
  }
  if (question.type === 'TRUE_FALSE') return { correctValues: question.correctAnswer.correctValues };
  if (question.type === 'SHORT_NUMBER') {
    return { numericValue: question.correctAnswer.numericValue, tolerance: question.correctAnswer.tolerance };
  }
  if (question.type === 'SHORT_TEXT') return { acceptedValues: question.correctAnswer.acceptedValues };
  return null;
};

const publicResult = (attempt, score, duplicate = false) => {
  const final = score.result.scoringState === 'FINAL' && attempt.status === 'SCORED';
  const revealCorrectAnswers = final && attempt.studentSnapshot.purpose === 'PRACTICE';
  return {
    attemptId: attempt.id,
    status: attempt.status,
    scoreRevision: score.revisionNumber,
    scoringState: score.result.scoringState,
    scoringVersion: score.result.scoringVersion,
    submittedAt: attempt.submittedAt,
    summary: score.result.totals,
    revealPolicy: {
      correctAnswers: revealCorrectAnswers,
      explanations: false,
      reason: revealCorrectAnswers
        ? 'PRACTICE_FINAL'
        : score.result.scoringState !== 'FINAL' ? 'PENDING_MANUAL_SCORING' : 'PURPOSE_RESTRICTED'
    },
    ...(revealCorrectAnswers ? {
      questions: score.result.questions.map((question) => ({
        questionVersionId: question.questionVersionId,
        outcome: question.outcome,
        awardedPoints: question.awardedPoints,
        maxPoints: question.maxPoints,
        submittedAnswer: question.submittedAnswer,
        correctAnswer: publicCorrectAnswer(question)
      }))
    } : {}),
    duplicate
  };
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
      if (existing.examVersionId !== examVersionId) {
        throw attemptError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho đề khác.');
      }
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

  async saveResponses({ id, studentUserId, idempotencyKey, baseRevision, responses }) {
    const attempt = await this.repository.findOwned(id, studentUserId);
    if (!attempt) return null;
    assertIntegrity(attempt);
    const normalized = normalizeResponses(attempt, responses);
    const request = { attemptId: id, baseRevision, responses: normalized };
    return this.repository.saveResponses({
      ...request,
      studentUserId,
      idempotencyKey,
      requestSha256: sha256Json(request),
      operationId: randomUUID(),
      auditId: randomUUID(),
      occurredAt: this.now()
    });
  }

  async submit({ id, studentUserId, idempotencyKey, baseRevision }) {
    const attempt = await this.repository.findOwned(id, studentUserId);
    if (!attempt) return null;
    assertIntegrity(attempt);
    const request = { attemptId: id, baseRevision };
    const stored = await this.repository.submitAttempt({
      ...request,
      studentUserId,
      idempotencyKey,
      requestSha256: sha256Json(request),
      scoringResult: scoreAttempt(attempt.scoringSnapshot, attempt.responses),
      operationId: randomUUID(),
      scoreId: randomUUID(),
      auditId: randomUUID(),
      occurredAt: this.now()
    });
    if (!stored) return null;
    const submittedAttempt = {
      ...attempt,
      status: stored.status,
      submittedAt: stored.submittedAt,
      currentScoreRevision: stored.scoreRevision
    };
    return {
      attempt: publicAttempt(submittedAttempt, stored.duplicate),
      result: publicResult(submittedAttempt, {
        revisionNumber: stored.scoreRevision,
        result: stored.scoringResult
      }, stored.duplicate),
      duplicate: stored.duplicate
    };
  }

  async getResult(id, studentUserId) {
    const record = await this.repository.findResultOwned(id, studentUserId);
    if (!record) return null;
    assertIntegrity(record.attempt);
    if (!record.score) throw attemptError('RESULT_NOT_READY', 'Attempt chưa được nộp hoặc chưa có kết quả.');
    return publicResult(record.attempt, record.score);
  }
}
