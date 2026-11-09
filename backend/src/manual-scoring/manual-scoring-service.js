import crypto, { randomUUID } from 'node:crypto';

export const MANUAL_SCORING_VERSION = 'eduassess-manual-scoring-v1';

const manualError = (code, message, statusCode = 409, details) => Object.assign(new Error(message), {
  code,
  statusCode,
  ...(details ? { details } : {})
});

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};

const sha256Json = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalJson(value)))
  .digest('hex');

const assertAttemptIntegrity = (assignment) => {
  if (sha256Json({
    scoringSnapshot: assignment.scoringSnapshot,
    studentSnapshot: assignment.studentSnapshot
  }) !== assignment.snapshotSha256) {
    throw manualError('ATTEMPT_SNAPSHOT_INTEGRITY_FAILED', 'Attempt snapshot không còn toàn vẹn.', 500);
  }
};

const roundScore = (value) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

const assignmentSummary = (assignment, duplicate = false) => ({
  id: assignment.id,
  attemptId: assignment.attemptId,
  assignmentType: assignment.assignmentType,
  sourceScoreRevision: assignment.sourceScoreRevision,
  status: assignment.status,
  reason: assignment.reason,
  completedScoreRevision: assignment.completedScoreRevision || null,
  createdAt: assignment.createdAt,
  completedAt: assignment.completedAt || null,
  ...(assignment.examTitle ? { examTitle: assignment.examTitle } : {}),
  duplicate
});

const flattenQuestions = (snapshot) => (snapshot?.sections || []).flatMap((section) => (
  (section.groups || []).flatMap((group) => group.questions || [])
));

const targetQuestions = (assignment) => assignment.sourceResult.questions.filter((question) => (
  question.type === 'ESSAY'
    && question.submittedAnswer !== null
    && (assignment.assignmentType === 'REGRADE' || question.outcome === 'PENDING_MANUAL')
));

const normalizeGrades = (assignment, grades) => {
  if (!Array.isArray(grades) || grades.length === 0) {
    throw manualError('INVALID_MANUAL_GRADES', 'grades phải là mảng không rỗng.', 400);
  }
  const targets = targetQuestions(assignment);
  if (targets.length === 0) {
    throw manualError('NO_ESSAY_TO_GRADE', 'Score revision không có bài tự luận phù hợp để chấm.');
  }
  const targetById = new Map(targets.map((question) => [question.questionVersionId, question]));
  const seen = new Set();
  const normalized = grades.map((grade) => {
    const question = targetById.get(grade?.questionVersionId);
    if (!question || seen.has(grade.questionVersionId)) {
      throw manualError('INVALID_MANUAL_GRADES', 'Grade tham chiếu câu không được giao hoặc bị lặp.', 400);
    }
    seen.add(grade.questionVersionId);
    const awardedPoints = Number(grade.awardedPoints);
    if (!Number.isFinite(awardedPoints) || awardedPoints < 0 || awardedPoints > question.maxPoints) {
      throw manualError('INVALID_MANUAL_SCORE', 'Điểm tự luận phải nằm trong khoảng điểm của câu.', 400, {
        questionVersionId: question.questionVersionId,
        maxPoints: question.maxPoints
      });
    }
    const feedback = String(grade.feedback || '').trim();
    if (feedback.length < 3 || feedback.length > 2000) {
      throw manualError('INVALID_MANUAL_FEEDBACK', 'Nhận xét cần từ 3 đến 2000 ký tự.', 400, {
        questionVersionId: question.questionVersionId
      });
    }
    return {
      questionVersionId: question.questionVersionId,
      awardedPoints: roundScore(awardedPoints),
      feedback
    };
  });
  if (seen.size !== targets.length) {
    throw manualError('INCOMPLETE_MANUAL_GRADES', 'Phải chấm toàn bộ câu tự luận trong assignment.', 400, {
      missingQuestionVersionIds: targets.map((question) => question.questionVersionId).filter((id) => !seen.has(id))
    });
  }
  return normalized.sort((left, right) => left.questionVersionId.localeCompare(right.questionVersionId));
};

export const buildManualScoreResult = (assignment, grades) => {
  const normalized = normalizeGrades(assignment, grades);
  const gradeById = new Map(normalized.map((grade) => [grade.questionVersionId, grade]));
  const questions = assignment.sourceResult.questions.map((question) => {
    const grade = gradeById.get(question.questionVersionId);
    if (!grade) return structuredClone(question);
    return {
      ...structuredClone(question),
      awardedPoints: grade.awardedPoints,
      outcome: 'MANUALLY_SCORED',
      manualFeedback: grade.feedback
    };
  });
  const earnedPoints = roundScore(questions.reduce((total, question) => total + Number(question.awardedPoints), 0));
  const manualAwardedPoints = roundScore(questions
    .filter((question) => question.type === 'ESSAY' && question.submittedAnswer !== null)
    .reduce((total, question) => total + Number(question.awardedPoints), 0));
  return {
    schemaVersion: '1.0.0',
    scoringVersion: `${assignment.sourceResult.scoringVersion.split('+manual-')[0]}+manual-v1`,
    scoringState: 'FINAL',
    manualScoringVersion: MANUAL_SCORING_VERSION,
    sourceScoreRevision: assignment.sourceScoreRevision,
    totals: {
      possiblePoints: assignment.sourceResult.totals.possiblePoints,
      autoAwardedPoints: assignment.sourceResult.totals.autoAwardedPoints,
      manualAwardedPoints,
      earnedPoints,
      pendingManualPoints: 0,
      pendingManualCount: 0
    },
    questions
  };
};

const assignmentPreview = (assignment) => {
  const studentQuestions = new Map(flattenQuestions(assignment.studentSnapshot).map((question) => [
    question.versionId,
    question
  ]));
  return {
    ...assignmentSummary(assignment),
    exam: assignment.studentSnapshot,
    sourceScore: {
      revision: assignment.sourceScoreRevision,
      scoringState: assignment.sourceResult.scoringState,
      scoringVersion: assignment.sourceResult.scoringVersion,
      totals: assignment.sourceResult.totals
    },
    questions: targetQuestions(assignment).map((question) => ({
      question: studentQuestions.get(question.questionVersionId) || {
        versionId: question.questionVersionId,
        type: 'ESSAY',
        points: question.maxPoints
      },
      submittedAnswer: question.submittedAnswer,
      rubric: question.correctAnswer?.rubric || null,
      previousAwardedPoints: question.outcome === 'PENDING_MANUAL' ? null : question.awardedPoints,
      previousFeedback: question.manualFeedback || null,
      maxPoints: question.maxPoints
    }))
  };
};

export class ManualScoringService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  async assign({ attemptId, assignmentType, graderUserId, reason, assignedByUserId }) {
    if (!['INITIAL', 'REGRADE'].includes(assignmentType)) {
      throw manualError('INVALID_ASSIGNMENT_TYPE', 'assignmentType phải là INITIAL hoặc REGRADE.', 400);
    }
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 1000) {
      throw manualError('INVALID_ASSIGNMENT_REASON', 'Lý do phân công cần từ 10 đến 1000 ký tự.', 400);
    }
    const created = await this.repository.createAssignment({
      id: randomUUID(),
      attemptId,
      assignmentType,
      graderUserId,
      assignedByUserId,
      reason: normalizedReason,
      auditId: randomUUID(),
      createdAt: this.now()
    });
    return created ? assignmentSummary(created) : null;
  }

  async listAssigned(graderUserId, { status } = {}) {
    if (status !== undefined && !['OPEN', 'COMPLETED'].includes(status)) {
      throw manualError('INVALID_ASSIGNMENT_STATUS', 'status phải là OPEN hoặc COMPLETED.', 400);
    }
    const items = await this.repository.listAssigned(graderUserId, status || 'OPEN');
    return { items: items.map((assignment) => assignmentSummary(assignment)) };
  }

  async getAssigned(id, graderUserId) {
    const assignment = await this.repository.findAssigned(id, graderUserId);
    if (assignment) assertAttemptIntegrity(assignment);
    return assignment ? assignmentPreview(assignment) : null;
  }

  async grade({ id, graderUserId, idempotencyKey, grades }) {
    const assignment = await this.repository.findAssigned(id, graderUserId);
    if (!assignment) return null;
    assertAttemptIntegrity(assignment);
    const normalizedGrades = normalizeGrades(assignment, grades);
    const request = {
      assignmentId: id,
      sourceScoreRevision: assignment.sourceScoreRevision,
      grades: normalizedGrades
    };
    const result = buildManualScoreResult(assignment, normalizedGrades);
    return this.repository.completeAssignment({
      assignmentId: id,
      graderUserId,
      idempotencyKey,
      requestSha256: sha256Json(request),
      result,
      reason: assignment.reason,
      operationId: randomUUID(),
      scoreId: randomUUID(),
      auditId: randomUUID(),
      occurredAt: this.now()
    });
  }
}
