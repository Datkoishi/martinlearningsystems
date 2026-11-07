export const SCORING_VERSION = 'eduassess-scoring-v1';

const scoringError = (code, message, details) => Object.assign(new Error(message), {
  code,
  statusCode: 400,
  ...(details ? { details } : {})
});

const roundScore = (value) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const normalizeText = (value) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

const numericValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const optionSet = (question) => new Set(question.optionIds || []);

export const normalizeAttemptResponse = (question, value) => {
  if (value === null || value === undefined) return null;
  const invalid = (message) => {
    throw scoringError('INVALID_RESPONSE', message, { questionVersionId: question.questionVersionId });
  };

  if (question.type === 'SINGLE_CHOICE') {
    if (typeof value !== 'string' || !optionSet(question).has(value)) invalid('Đáp án single choice không hợp lệ.');
    return value;
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    if (!Array.isArray(value)) invalid('Đáp án multiple choice phải là mảng.');
    if (value.length === 0) return null;
    if (value.some((id) => typeof id !== 'string' || !optionSet(question).has(id))) invalid('Đáp án multiple choice chứa option không hợp lệ.');
    if (new Set(value).size !== value.length) invalid('Đáp án multiple choice không được lặp option.');
    const positions = new Map((question.optionIds || []).map((id, index) => [id, index]));
    return [...value].sort((left, right) => positions.get(left) - positions.get(right));
  }

  if (question.type === 'TRUE_FALSE') {
    const expected = question.answerKey?.correctValues?.length || 0;
    if (expected === 1 && typeof value === 'boolean') return value;
    if (!Array.isArray(value) || value.length !== expected || value.some((item) => item !== null && typeof item !== 'boolean')) {
      invalid('Đáp án đúng/sai không đúng số mệnh đề.');
    }
    return value.every((item) => item === null) ? null : value;
  }

  if (question.type === 'SHORT_NUMBER') {
    if (value === '') return null;
    const parsed = numericValue(value);
    if (parsed === null) invalid('Đáp án số không hợp lệ.');
    return parsed;
  }

  if (question.type === 'SHORT_TEXT') {
    if (typeof value !== 'string') invalid('Đáp án ngắn phải là chuỗi.');
    if (value.trim() === '') return null;
    if (value.length > 2000) invalid('Đáp án ngắn vượt quá 2000 ký tự.');
    return value;
  }

  if (question.type === 'ESSAY') {
    if (typeof value !== 'string') invalid('Bài tự luận phải là chuỗi.');
    if (value.trim() === '') return null;
    if (value.length > 20000) invalid('Bài tự luận vượt quá 20000 ký tự.');
    return value;
  }

  invalid('Loại câu hỏi chưa được hỗ trợ.');
};

const equalSets = (left, right) => left.size === right.size && [...left].every((item) => right.has(item));

const scoreQuestion = (question, rawResponse) => {
  const response = normalizeAttemptResponse(question, rawResponse);
  const maxPoints = Number(question.points);
  const base = {
    questionVersionId: question.questionVersionId,
    type: question.type,
    maxPoints,
    submittedAnswer: response,
    correctAnswer: question.answerKey
  };
  if (response === null) return { ...base, awardedPoints: 0, outcome: 'UNANSWERED' };

  if (question.type === 'SINGLE_CHOICE') {
    const correct = question.answerKey.correctOptionIds[0] === response;
    return { ...base, awardedPoints: correct ? maxPoints : 0, outcome: correct ? 'CORRECT' : 'INCORRECT' };
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    const correctIds = new Set(question.answerKey.correctOptionIds);
    const selectedIds = new Set(response);
    if (equalSets(correctIds, selectedIds)) return { ...base, awardedPoints: maxPoints, outcome: 'CORRECT' };
    if (question.answerKey.partialCredit?.mode === 'PER_OPTION_WITH_PENALTY') {
      const correctSelected = [...selectedIds].filter((id) => correctIds.has(id)).length;
      const incorrectSelected = selectedIds.size - correctSelected;
      const fraction = Math.max(0, (correctSelected - incorrectSelected) / correctIds.size);
      const awardedPoints = roundScore(maxPoints * fraction);
      return { ...base, awardedPoints, outcome: awardedPoints > 0 ? 'PARTIAL' : 'INCORRECT' };
    }
    return { ...base, awardedPoints: 0, outcome: 'INCORRECT' };
  }

  if (question.type === 'TRUE_FALSE') {
    const correctValues = question.answerKey.correctValues;
    const submitted = Array.isArray(response) ? response : [response];
    const correctCount = submitted.filter((value, index) => value !== null && value === correctValues[index]).length;
    const awardedPoints = roundScore(maxPoints * (correctCount / correctValues.length));
    const outcome = correctCount === correctValues.length ? 'CORRECT' : awardedPoints > 0 ? 'PARTIAL' : 'INCORRECT';
    return { ...base, awardedPoints, outcome };
  }

  if (question.type === 'SHORT_NUMBER') {
    const correct = Math.abs(response - question.answerKey.numericValue) <= question.answerKey.tolerance;
    return { ...base, awardedPoints: correct ? maxPoints : 0, outcome: correct ? 'CORRECT' : 'INCORRECT' };
  }

  if (question.type === 'SHORT_TEXT') {
    const normalized = normalizeText(response);
    const correct = question.answerKey.acceptedValues.some((value) => normalizeText(value) === normalized);
    return { ...base, awardedPoints: correct ? maxPoints : 0, outcome: correct ? 'CORRECT' : 'INCORRECT' };
  }

  return { ...base, awardedPoints: 0, outcome: 'PENDING_MANUAL' };
};

export const scoreAttempt = (scoringSnapshot, responses) => {
  const questions = scoringSnapshot.questions.map((question) => scoreQuestion(question, responses[question.questionVersionId]));
  const possiblePoints = roundScore(questions.reduce((total, question) => total + question.maxPoints, 0));
  const autoAwardedPoints = roundScore(questions.reduce((total, question) => total + question.awardedPoints, 0));
  const pendingQuestions = questions.filter((question) => question.outcome === 'PENDING_MANUAL');
  const pendingManualPoints = roundScore(pendingQuestions.reduce((total, question) => total + question.maxPoints, 0));
  return {
    schemaVersion: '1.0.0',
    scoringVersion: SCORING_VERSION,
    scoringState: pendingQuestions.length > 0 ? 'PENDING' : 'FINAL',
    totals: {
      possiblePoints,
      autoAwardedPoints,
      earnedPoints: pendingQuestions.length > 0 ? null : autoAwardedPoints,
      pendingManualPoints,
      pendingManualCount: pendingQuestions.length
    },
    questions
  };
};
