import crypto from 'node:crypto';
import { validateRichContent } from '../domain/rich-content.js';

export const ASSEMBLY_ENGINE_VERSION = 'eduassess-assembly-v1';

const QUESTION_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_NUMBER', 'SHORT_TEXT', 'ESSAY']);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const PURPOSES = new Set(['PRACTICE', 'MOCK_EXAM', 'DIAGNOSTIC']);
const ORIGIN_TYPES = new Set(['AI_GENERATED', 'OFFICIAL_IMPORTED', 'HUMAN_AUTHORED', 'PARTNER_PROVIDED']);
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const seedPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const roundNumber = (value) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

const assemblyError = (code, message, statusCode = 400, details) => Object.assign(new Error(message), {
  code,
  statusCode,
  ...(details ? { details } : {})
});

const quotaDefinitions = {
  questionTypes: { values: QUESTION_TYPES, questionValue: (question) => question.type },
  topics: { questionValue: (question) => question.topicKey },
  skills: { questionValue: (question) => question.skillKey },
  difficulties: { values: DIFFICULTIES, questionValue: (question) => question.difficulty }
};

const normalizeQuota = (value, dimension, count, sectionPath) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.quotas.${dimension} phải là object không rỗng.`);
  }
  const definition = quotaDefinitions[dimension];
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    if (!keyPattern.test(key) || (definition.values && !definition.values.has(key))) {
      throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.quotas.${dimension} chứa key không hợp lệ: ${key}.`);
    }
    if (!Number.isInteger(value[key]) || value[key] <= 0) {
      throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.quotas.${dimension}.${key} phải là số nguyên dương.`);
    }
    normalized[key] = value[key];
  }
  const sum = Object.values(normalized).reduce((total, item) => total + item, 0);
  if (sum !== count) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.quotas.${dimension} phải có tổng bằng count.`, 400, {
      expected: count,
      actual: sum
    });
  }
  return normalized;
};

export const validateBlueprint = (blueprint) => {
  if (!blueprint || typeof blueprint !== 'object' || Array.isArray(blueprint)) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'blueprint phải là object.');
  }
  if (blueprint.schemaVersion !== '1.0.0') {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'Chỉ hỗ trợ blueprint schemaVersion 1.0.0.');
  }
  const title = typeof blueprint.title === 'string' ? blueprint.title.trim() : '';
  const description = blueprint.description === undefined ? '' : blueprint.description;
  const subject = typeof blueprint.subject === 'string' ? blueprint.subject.trim() : '';
  const curriculumVersion = typeof blueprint.curriculumVersion === 'string' ? blueprint.curriculumVersion.trim() : '';
  if (title.length < 3 || title.length > 500) throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'title phải dài 3–500 ký tự.');
  if (typeof description !== 'string' || description.trim().length > 2000) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'description phải là chuỗi tối đa 2000 ký tự.');
  }
  if (!Number.isInteger(blueprint.grade) || blueprint.grade < 1 || blueprint.grade > 12) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'grade phải từ 1 đến 12.');
  }
  if (subject.length === 0 || subject.length > 120) throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'subject không hợp lệ.');
  if (!keyPattern.test(curriculumVersion) || curriculumVersion.length > 80) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'curriculumVersion không hợp lệ.');
  }
  if (!PURPOSES.has(blueprint.purpose)) {
    throw assemblyError(
      blueprint.purpose === 'FORMAL_ASSESSMENT' ? 'FORMAL_ASSESSMENT_DISABLED' : 'INCOMPATIBLE_BLUEPRINT',
      blueprint.purpose === 'FORMAL_ASSESSMENT'
        ? 'Formal assessment không được tạo qua assembly hiện tại.'
        : 'purpose không hợp lệ.',
      blueprint.purpose === 'FORMAL_ASSESSMENT' ? 409 : 400
    );
  }
  if (!Number.isInteger(blueprint.durationMinutes) || blueprint.durationMinutes < 1 || blueprint.durationMinutes > 600) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'durationMinutes phải từ 1 đến 600.');
  }
  if (!Array.isArray(blueprint.sections) || blueprint.sections.length === 0 || blueprint.sections.length > 20) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'sections phải có từ 1 đến 20 phần.');
  }
  const sectionIds = new Set();
  const sections = blueprint.sections.map((section, index) => {
    const sectionPath = `sections[${index}]`;
    if (typeof section?.id !== 'string' || !keyPattern.test(section.id) || sectionIds.has(section.id)) {
      throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.id thiếu, sai hoặc bị lặp.`);
    }
    sectionIds.add(section.id);
    const sectionTitle = typeof section.title === 'string' ? section.title.trim() : '';
    if (sectionTitle.length === 0 || sectionTitle.length > 500) {
      throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.title không hợp lệ.`);
    }
    if (!Number.isInteger(section.count) || section.count < 1 || section.count > 50) {
      throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.count phải từ 1 đến 50.`);
    }
    const instruction = section.instruction || { schemaVersion: '1.0.0', nodes: [] };
    const instructionValidation = validateRichContent(instruction);
    if (!instructionValidation.valid) {
      throw assemblyError('INCOMPATIBLE_BLUEPRINT', `${sectionPath}.instruction không phải rich content hợp lệ.`, 400, {
        errors: instructionValidation.errors
      });
    }
    return {
      id: section.id,
      title: sectionTitle,
      count: section.count,
      instruction,
      quotas: Object.fromEntries(Object.keys(quotaDefinitions).map((dimension) => [
        dimension,
        normalizeQuota(section.quotas?.[dimension], dimension, section.count, sectionPath)
      ]))
    };
  });
  const totalCount = sections.reduce((total, section) => total + section.count, 0);
  if (totalCount > 100) throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'Tổng số câu không được vượt quá 100.');

  const sourceDiversity = blueprint.sourceDiversity;
  if (!sourceDiversity || !Number.isInteger(sourceDiversity.minSources)
    || sourceDiversity.minSources < 2 || sourceDiversity.minSources > totalCount) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'sourceDiversity.minSources phải từ 2 đến tổng số câu.');
  }
  if (!Number.isInteger(sourceDiversity.maxQuestionsPerSource)
    || sourceDiversity.maxQuestionsPerSource < 1 || sourceDiversity.maxQuestionsPerSource > totalCount) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'sourceDiversity.maxQuestionsPerSource không hợp lệ.');
  }
  const pointRange = blueprint.pointRange;
  if (!pointRange || !Number.isFinite(pointRange.min) || !Number.isFinite(pointRange.max)
    || pointRange.min <= 0 || pointRange.max < pointRange.min) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'pointRange cần min/max hợp lệ.');
  }
  const acceptedOriginTypes = blueprint.acceptedOriginTypes === undefined
    ? [...ORIGIN_TYPES]
    : blueprint.acceptedOriginTypes;
  if (!Array.isArray(acceptedOriginTypes) || acceptedOriginTypes.length === 0
    || acceptedOriginTypes.some((value) => !ORIGIN_TYPES.has(value))) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'acceptedOriginTypes không hợp lệ.');
  }
  const acceptedLicenseIds = blueprint.acceptedLicenseIds || [];
  if (!Array.isArray(acceptedLicenseIds)
    || acceptedLicenseIds.some((value) => typeof value !== 'string' || !keyPattern.test(value))) {
    throw assemblyError('INCOMPATIBLE_BLUEPRINT', 'acceptedLicenseIds không hợp lệ.');
  }
  return {
    schemaVersion: '1.0.0',
    title,
    description: description.trim(),
    grade: blueprint.grade,
    subject,
    curriculumVersion,
    purpose: blueprint.purpose,
    durationMinutes: blueprint.durationMinutes,
    sections,
    sourceDiversity: {
      minSources: sourceDiversity.minSources,
      maxQuestionsPerSource: sourceDiversity.maxQuestionsPerSource
    },
    pointRange: { min: Number(pointRange.min), max: Number(pointRange.max) },
    acceptedOriginTypes: [...new Set(acceptedOriginTypes)].sort(),
    acceptedLicenseIds: [...new Set(acceptedLicenseIds)].sort()
  };
};

export const validateSeed = (seed) => {
  if (typeof seed !== 'string' || !seedPattern.test(seed)) {
    throw assemblyError('INVALID_ASSEMBLY_SEED', 'seed phải dài 8–128 ký tự an toàn.');
  }
  return seed;
};

const rank = (seed, sectionId, unitId) => crypto.createHash('sha256').update(`${seed}\u0000${sectionId}\u0000${unitId}`).digest('hex');

const questionCounts = (unit, dimension) => {
  const valueFor = quotaDefinitions[dimension].questionValue;
  return unit.questions.reduce((counts, question) => {
    const value = valueFor(question);
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
};

const unitMetrics = (unit) => ({
  count: unit.questions.length,
  points: roundNumber(unit.questions.reduce((total, question) => total + Number(question.points), 0)),
  seconds: unit.questions.reduce((total, question) => total + Number(question.estimatedSeconds), 0),
  quotaCounts: Object.fromEntries(Object.keys(quotaDefinitions).map((dimension) => [dimension, questionCounts(unit, dimension)]))
});

const fitsSection = (state, section, metrics) => {
  if (state.count + metrics.count > section.count) return false;
  return Object.keys(quotaDefinitions).every((dimension) => Object.entries(metrics.quotaCounts[dimension]).every(([key, count]) => (
    section.quotas[dimension][key] !== undefined
    && (state.quotaCounts[dimension][key] || 0) + count <= section.quotas[dimension][key]
  )));
};

const addCounts = (target, additions, direction) => {
  Object.entries(additions).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + direction * value;
    if (target[key] === 0) delete target[key];
  });
};

export const assembleBlueprint = (blueprint, pool, seed, { searchLimit = 100_000 } = {}) => {
  const normalized = validateBlueprint(blueprint);
  validateSeed(seed);
  const compatibleUnits = (pool.units || []).filter((unit) => unit.questions.every((question) => (
    question.grade === normalized.grade
    && question.subject === normalized.subject
    && question.curriculumVersion === normalized.curriculumVersion
    && normalized.acceptedOriginTypes.includes(question.originType)
    && (normalized.acceptedLicenseIds.length === 0 || normalized.acceptedLicenseIds.includes(question.licenseId))
  ))).map((unit) => ({ ...unit, metrics: unitMetrics(unit) }));
  const orderedBySection = new Map(normalized.sections.map((section) => [section.id, [...compatibleUnits].sort((left, right) => (
    rank(seed, section.id, left.id).localeCompare(rank(seed, section.id, right.id)) || left.id.localeCompare(right.id)
  ))]));

  const selectedQuestionIds = new Set();
  const selectedFamilyKeys = new Set();
  const selectedUnitIds = new Set();
  const sourceCounts = new Map();
  const selectedSections = normalized.sections.map((section) => ({ section, units: [] }));
  let totalPoints = 0;
  let totalSeconds = 0;
  let visited = 0;

  const choose = (sectionIndex, candidateStart) => {
    visited += 1;
    if (visited > searchLimit) {
      throw assemblyError('ASSEMBLY_SEARCH_LIMIT', 'Blueprint vượt giới hạn tìm kiếm deterministic.', 409, { searchLimit });
    }
    if (sectionIndex === selectedSections.length) {
      return totalPoints + Number.EPSILON >= normalized.pointRange.min
        && totalPoints <= normalized.pointRange.max + Number.EPSILON
        && totalSeconds <= normalized.durationMinutes * 60
        && sourceCounts.size >= normalized.sourceDiversity.minSources;
    }
    const selectedSection = selectedSections[sectionIndex];
    const { section } = selectedSection;
    const state = {
      count: selectedSection.units.reduce((total, unit) => total + unit.metrics.count, 0),
      quotaCounts: Object.fromEntries(Object.keys(quotaDefinitions).map((dimension) => [dimension, {}]))
    };
    selectedSection.units.forEach((unit) => Object.keys(quotaDefinitions).forEach((dimension) => (
      addCounts(state.quotaCounts[dimension], unit.metrics.quotaCounts[dimension], 1)
    )));
    if (state.count === section.count) return choose(sectionIndex + 1, 0);

    const candidates = orderedBySection.get(section.id);
    for (let index = candidateStart; index < candidates.length; index += 1) {
      const unit = candidates[index];
      if (selectedUnitIds.has(unit.id) || !fitsSection(state, section, unit.metrics)) continue;
      const unitFamilies = unit.questions.map((question) => question.familyKey).filter(Boolean);
      if (new Set(unitFamilies).size !== unitFamilies.length) continue;
      if (unit.questions.some((question) => selectedQuestionIds.has(question.versionId)
        || (question.familyKey && selectedFamilyKeys.has(question.familyKey)))) continue;
      if (roundNumber(totalPoints + unit.metrics.points) > normalized.pointRange.max + Number.EPSILON
        || totalSeconds + unit.metrics.seconds > normalized.durationMinutes * 60) continue;
      const addedSources = unit.questions.reduce((counts, question) => {
        counts.set(question.sourceId, (counts.get(question.sourceId) || 0) + 1);
        return counts;
      }, new Map());
      const sourceAllowed = [...addedSources].every(([sourceId, count]) => (
        (sourceCounts.get(sourceId) || 0) + count <= normalized.sourceDiversity.maxQuestionsPerSource
      ));
      if (!sourceAllowed) continue;

      selectedSection.units.push(unit);
      selectedUnitIds.add(unit.id);
      unit.questions.forEach((question) => {
        selectedQuestionIds.add(question.versionId);
        if (question.familyKey) selectedFamilyKeys.add(question.familyKey);
      });
      addedSources.forEach((count, sourceId) => sourceCounts.set(sourceId, (sourceCounts.get(sourceId) || 0) + count));
      totalPoints = roundNumber(totalPoints + unit.metrics.points);
      totalSeconds += unit.metrics.seconds;
      if (choose(sectionIndex, index + 1)) return true;
      totalPoints = roundNumber(totalPoints - unit.metrics.points);
      totalSeconds -= unit.metrics.seconds;
      addedSources.forEach((count, sourceId) => {
        const next = sourceCounts.get(sourceId) - count;
        if (next === 0) sourceCounts.delete(sourceId); else sourceCounts.set(sourceId, next);
      });
      unit.questions.forEach((question) => {
        selectedQuestionIds.delete(question.versionId);
        if (question.familyKey) selectedFamilyKeys.delete(question.familyKey);
      });
      selectedUnitIds.delete(unit.id);
      selectedSection.units.pop();
    }
    return false;
  };

  if (!choose(0, 0)) {
    throw assemblyError('INSUFFICIENT_POOL', 'Không có tổ hợp câu hỏi đáp ứng toàn bộ blueprint.', 409, {
      compatibleUnits: compatibleUnits.length,
      compatibleQuestions: new Set(compatibleUnits.flatMap((unit) => unit.questions.map((question) => question.versionId))).size,
      requiredQuestions: normalized.sections.reduce((total, section) => total + section.count, 0),
      minSources: normalized.sourceDiversity.minSources
    });
  }
  return {
    blueprint: normalized,
    seed,
    engineVersion: ASSEMBLY_ENGINE_VERSION,
    sections: selectedSections.map(({ section, units }) => ({ section, units })),
    totalPoints,
    estimatedSeconds: totalSeconds,
    sourceDistribution: Object.fromEntries([...sourceCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    visitedNodes: visited
  };
};
