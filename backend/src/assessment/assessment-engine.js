export const ASSESSMENT_ENGINE_VERSION = 'eduassess-assessment-v1';

export const ASSESSMENT_LEVELS = Object.freeze([
  'NEEDS_REINFORCEMENT',
  'DEVELOPING',
  'ACHIEVED',
  'EXCEEDED'
]);

const LEVEL_LABELS = Object.freeze({
  NEEDS_REINFORCEMENT: 'Cần củng cố',
  DEVELOPING: 'Đang phát triển',
  ACHIEVED: 'Đạt',
  EXCEEDED: 'Vượt'
});
const FRAMEWORK_PURPOSES = new Set(['CURRICULUM_LEARNING', 'GENERAL_COMPETENCY', 'EXAM_READINESS']);
const EXAM_PURPOSES = new Set(['PRACTICE', 'MOCK_EXAM', 'DIAGNOSTIC']);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const QUESTION_TYPES = new Set([
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_NUMBER', 'SHORT_TEXT', 'ESSAY'
]);
const FINAL_OUTCOMES = new Set(['CORRECT', 'PARTIAL', 'INCORRECT', 'UNANSWERED']);
const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,79}$/;

const assessmentError = (code, message, details = undefined) => Object.assign(new Error(message), {
  code,
  statusCode: 400,
  ...(details ? { details } : {})
});

const cleanString = (value, name, minimum, maximum) => {
  if (typeof value !== 'string') throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} phải là chuỗi.`);
  const cleaned = value.trim();
  if (cleaned.length < minimum || cleaned.length > maximum) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} phải dài ${minimum}–${maximum} ký tự.`);
  }
  return cleaned;
};

const integer = (value, name, minimum, maximum) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} phải là số nguyên ${minimum}–${maximum}.`);
  }
  return value;
};

const enumValue = (value, name, allowed) => {
  if (!allowed.has(value)) throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} không hợp lệ.`);
  return value;
};

const keyList = (value, name, { required = true, maximum = 20 } = {}) => {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > maximum) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} phải có ${required ? '1' : '0'}–${maximum} phần tử.`);
  }
  const normalized = value.map((item) => cleanString(item, name, 1, 160));
  if (new Set(normalized).size !== normalized.length) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} không được lặp.`);
  }
  return normalized.sort();
};

const enumList = (value, name, allowed) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > allowed.size) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} phải là danh sách không rỗng.`);
  }
  value.forEach((item) => enumValue(item, name, allowed));
  if (new Set(value).size !== value.length) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `${name} không được lặp.`);
  }
  return [...value].sort();
};

const normalizeLevels = (levels, indicatorId) => {
  if (!Array.isArray(levels) || levels.length !== ASSESSMENT_LEVELS.length) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `Indicator ${indicatorId} phải có đủ bốn mức.`);
  }
  const normalized = levels.map((entry, index) => {
    if (!entry || entry.level !== ASSESSMENT_LEVELS[index]) {
      throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `Thứ tự mức của indicator ${indicatorId} không hợp lệ.`);
    }
    if (typeof entry.minimumRatio !== 'number' || !Number.isFinite(entry.minimumRatio)
      || entry.minimumRatio < 0 || entry.minimumRatio > 1) {
      throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `minimumRatio của ${entry.level} phải nằm trong 0–1.`);
    }
    return { level: entry.level, minimumRatio: entry.minimumRatio };
  });
  if (normalized[0].minimumRatio !== 0
    || normalized.some((entry, index) => index > 0 && entry.minimumRatio <= normalized[index - 1].minimumRatio)) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `Ngưỡng indicator ${indicatorId} phải tăng nghiêm ngặt và bắt đầu từ 0.`);
  }
  return normalized;
};

const normalizeGuidance = (guidance, indicatorId) => {
  if (!guidance || typeof guidance !== 'object' || Array.isArray(guidance)) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `Guidance của indicator ${indicatorId} không hợp lệ.`);
  }
  const byLevel = {};
  ASSESSMENT_LEVELS.forEach((level) => {
    byLevel[level] = cleanString(guidance.byLevel?.[level], `guidance.byLevel.${level}`, 3, 500);
  });
  return {
    insufficientEvidence: cleanString(guidance.insufficientEvidence, 'guidance.insufficientEvidence', 3, 500),
    byLevel
  };
};

export const validateAssessmentFramework = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.schemaVersion !== '1.0.0') {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', 'Assessment framework schemaVersion phải là 1.0.0.');
  }
  const minimums = {
    completedAttempts: integer(input.minimums?.completedAttempts, 'minimums.completedAttempts', 1, 50),
    evidenceItems: integer(input.minimums?.evidenceItems, 'minimums.evidenceItems', 1, 1000)
  };
  if (!Array.isArray(input.indicators) || input.indicators.length === 0 || input.indicators.length > 30) {
    throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', 'Framework phải có 1–30 indicators.');
  }
  const indicatorIds = new Set();
  const mappedSkills = new Set();
  const indicators = input.indicators.map((indicator) => {
    const id = cleanString(indicator?.id, 'indicator.id', 2, 80);
    if (!KEY_PATTERN.test(id) || indicatorIds.has(id)) {
      throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `Indicator id ${id} không hợp lệ hoặc bị lặp.`);
    }
    indicatorIds.add(id);
    const skillKeys = keyList(indicator.evidence?.skillKeys, `indicator.${id}.skillKeys`);
    skillKeys.forEach((skillKey) => {
      if (mappedSkills.has(skillKey)) {
        throw assessmentError('INVALID_ASSESSMENT_FRAMEWORK', `skillKey ${skillKey} bị map vào nhiều indicator.`);
      }
      mappedSkills.add(skillKey);
    });
    return {
      id,
      title: cleanString(indicator.title, `indicator.${id}.title`, 2, 200),
      evidence: {
        skillKeys,
        topicKeys: keyList(indicator.evidence?.topicKeys || [], `indicator.${id}.topicKeys`, { required: false }),
        minimumItems: integer(indicator.evidence?.minimumItems, `indicator.${id}.minimumItems`, 1, 500),
        requiredDifficulties: enumList(
          indicator.evidence?.requiredDifficulties,
          `indicator.${id}.requiredDifficulties`,
          DIFFICULTIES
        ),
        requiredQuestionTypes: enumList(
          indicator.evidence?.requiredQuestionTypes,
          `indicator.${id}.requiredQuestionTypes`,
          QUESTION_TYPES
        )
      },
      levels: normalizeLevels(indicator.levels, id),
      guidance: normalizeGuidance(indicator.guidance, id)
    };
  });
  return {
    schemaVersion: '1.0.0',
    title: cleanString(input.title, 'title', 5, 300),
    description: cleanString(input.description, 'description', 5, 1500),
    grade: integer(input.grade, 'grade', 1, 12),
    subject: cleanString(input.subject, 'subject', 1, 120),
    frameworkPurpose: enumValue(input.frameworkPurpose, 'frameworkPurpose', FRAMEWORK_PURPOSES),
    sourceExamPurpose: enumValue(input.sourceExamPurpose, 'sourceExamPurpose', EXAM_PURPOSES),
    scoringQuality: {
      allowedScoringVersions: keyList(
        input.scoringQuality?.allowedScoringVersions,
        'scoringQuality.allowedScoringVersions',
        { maximum: 10 }
      )
    },
    minimums,
    reassessment: {
      additionalEvidenceItems: integer(
        input.reassessment?.additionalEvidenceItems,
        'reassessment.additionalEvidenceItems',
        1,
        100
      )
    },
    indicators
  };
};

const validScoringItem = (item, framework) => item.scoringState === 'FINAL'
  && framework.scoringQuality.allowedScoringVersions.includes(item.scoringVersion)
  && FINAL_OUTCOMES.has(item.outcome)
  && Number.isFinite(item.awardedPoints)
  && Number.isFinite(item.maxPoints)
  && item.maxPoints > 0
  && item.awardedPoints >= 0
  && item.awardedPoints <= item.maxPoints;

const missingCoverage = (indicator, items, framework) => {
  const reasons = [];
  if (items.length < indicator.evidence.minimumItems) {
    reasons.push({
      code: 'MINIMUM_ITEMS',
      required: indicator.evidence.minimumItems,
      actual: items.length
    });
  }
  const difficulties = new Set(items.map((item) => item.difficulty));
  const missingDifficulties = indicator.evidence.requiredDifficulties.filter((value) => !difficulties.has(value));
  if (missingDifficulties.length > 0) reasons.push({ code: 'DIFFICULTY_COVERAGE', missing: missingDifficulties });
  const questionTypes = new Set(items.map((item) => item.questionType));
  const missingQuestionTypes = indicator.evidence.requiredQuestionTypes.filter((value) => !questionTypes.has(value));
  if (missingQuestionTypes.length > 0) reasons.push({ code: 'TASK_TYPE_COVERAGE', missing: missingQuestionTypes });
  const invalidScoringItems = items.filter((item) => !validScoringItem(item, framework));
  if (invalidScoringItems.length > 0) {
    reasons.push({
      code: 'SCORING_QUALITY',
      invalidItems: invalidScoringItems.length,
      allowedScoringVersions: framework.scoringQuality.allowedScoringVersions
    });
  }
  return reasons;
};

const matchesIndicator = (item, indicator) => indicator.evidence.skillKeys.includes(item.skillKey)
  && (indicator.evidence.topicKeys.length === 0 || indicator.evidence.topicKeys.includes(item.topicKey));

const round = (value) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

export const assessEvidence = (framework, evidence) => {
  const mappedItems = evidence.items.filter((item) => framework.indicators.some((indicator) => (
    matchesIndicator(item, indicator)
  )));
  const globalReasons = [];
  if (evidence.completedAttemptCount < framework.minimums.completedAttempts) {
    globalReasons.push({
      code: 'MINIMUM_ATTEMPTS',
      required: framework.minimums.completedAttempts,
      actual: evidence.completedAttemptCount
    });
  }
  if (mappedItems.length < framework.minimums.evidenceItems) {
    globalReasons.push({
      code: 'MINIMUM_EVIDENCE',
      required: framework.minimums.evidenceItems,
      actual: mappedItems.length
    });
  }

  const indicators = framework.indicators.map((indicator) => {
    const items = mappedItems.filter((item) => matchesIndicator(item, indicator));
    const localReasons = missingCoverage(indicator, items, framework);
    const reasons = [...globalReasons, ...localReasons];
    const sufficient = reasons.length === 0;
    const awardedPoints = round(items.reduce((total, item) => total + item.awardedPoints, 0));
    const possiblePoints = round(items.reduce((total, item) => total + item.maxPoints, 0));
    const evidenceScoreRatio = possiblePoints > 0 ? round(awardedPoints / possiblePoints) : 0;
    const selectedLevel = sufficient
      ? [...indicator.levels].reverse().find((level) => evidenceScoreRatio >= level.minimumRatio)
      : null;
    return {
      id: indicator.id,
      title: indicator.title,
      state: sufficient ? 'CLASSIFIED' : 'INSUFFICIENT_EVIDENCE',
      evidence: {
        itemCount: items.length,
        awardedPoints,
        possiblePoints,
        difficulties: [...new Set(items.map((item) => item.difficulty))].sort(),
        questionTypes: [...new Set(items.map((item) => item.questionType))].sort()
      },
      coverage: { sufficient, missing: reasons },
      ...(selectedLevel ? {
        evidenceScoreRatio,
        level: { key: selectedLevel.level, label: LEVEL_LABELS[selectedLevel.level] },
        guidance: indicator.guidance.byLevel[selectedLevel.level]
      } : {
        level: null,
        guidance: indicator.guidance.insufficientEvidence
      })
    };
  });
  const classified = indicators.every((indicator) => indicator.state === 'CLASSIFIED');
  return {
    evidenceSnapshot: {
      schemaVersion: '1.0.0',
      completedAttemptCount: evidence.completedAttemptCount,
      items: mappedItems.map((item) => ({ ...item }))
    },
    interpretation: {
      schemaVersion: '1.0.0',
      engineVersion: ASSESSMENT_ENGINE_VERSION,
      state: classified ? 'CLASSIFIED' : 'INSUFFICIENT_EVIDENCE',
      message: classified ? 'Đủ bằng chứng theo framework đã duyệt.' : 'Chưa đủ bằng chứng',
      evidenceSummary: {
        completedAttemptCount: evidence.completedAttemptCount,
        mappedEvidenceItems: mappedItems.length,
        requiredAttempts: framework.minimums.completedAttempts,
        requiredEvidenceItems: framework.minimums.evidenceItems
      },
      indicators,
      reassessment: classified ? null : {
        additionalEvidenceItems: framework.reassessment.additionalEvidenceItems,
        message: `Thu thập thêm ít nhất ${framework.reassessment.additionalEvidenceItems} bằng chứng phù hợp rồi đánh giá lại.`
      },
      limitation: 'Tỷ lệ điểm bằng chứng chỉ là đầu vào của rule đã duyệt, không phải phần trăm năng lực.'
    }
  };
};
