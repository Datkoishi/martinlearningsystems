import { detectMimeType, isSafeSvg, sha256 } from './package-reader.js';
import { validateRichContent } from '../domain/rich-content.js';

const REQUIRED_DOCUMENTS = ['exam.json', 'questions.json', 'answers.json'];
const ORIGIN_TYPES = new Set(['AI_GENERATED', 'OFFICIAL_IMPORTED', 'HUMAN_AUTHORED', 'PARTNER_PROVIDED']);
const EXAM_MODES = new Set(['FIXED', 'ASSEMBLED']);
const PURPOSES = new Set(['PRACTICE', 'MOCK_EXAM', 'DIAGNOSTIC', 'FORMAL_ASSESSMENT']);
const QUESTION_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_NUMBER', 'SHORT_TEXT', 'ESSAY']);
const GROUP_POLICIES = new Set(['ATOMIC_ALL', 'SPLIT_WITH_STIMULUS']);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const shaPattern = /^[a-f0-9]{64}$/;

const issue = (code, path, message) => ({ code, path, message });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const parseJson = (files, fileName, errors) => {
  const buffer = files.get(fileName);
  if (!buffer) {
    errors.push(issue('MISSING_FILE', fileName, `Thiếu tệp bắt buộc ${fileName}.`));
    return null;
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return JSON.parse(decoder.decode(buffer).replace(/^\uFEFF/, ''));
  } catch {
    errors.push(issue('INVALID_JSON', fileName, `${fileName} không phải JSON UTF-8 hợp lệ.`));
    return null;
  }
};

const validateDocumentVersion = (document, path, errors) => {
  if (!isObject(document)) {
    errors.push(issue('INVALID_DOCUMENT', path, `${path} phải là object.`));
    return false;
  }
  if (document.schemaVersion !== '1.0.0') {
    errors.push(issue('UNSUPPORTED_SCHEMA', `${path}.schemaVersion`, 'Chỉ hỗ trợ schemaVersion 1.0.0.'));
  }
  return true;
};

const validateRich = (content, path, errors, assetIds) => {
  const result = validateRichContent(content);
  result.errors.forEach((item) => errors.push(issue('INVALID_RICH_CONTENT', `${path}${item.path.slice(1)}`, item.message)));
  if (!result.valid) return;

  const visit = (nodes, nodePath) => nodes.forEach((node, index) => {
    const currentPath = `${nodePath}[${index}]`;
    if (node.type === 'figure' && !assetIds.has(node.assetId)) {
      errors.push(issue('MISSING_ASSET_REFERENCE', `${currentPath}.assetId`, `Không tìm thấy assetId ${node.assetId} trong manifest.`));
    }
    if (node.type === 'table') node.rows.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => visit(cell.content, `${currentPath}.rows[${rowIndex}][${cellIndex}].content`)));
    if (node.type === 'list') node.items.forEach((item, itemIndex) => visit(item, `${currentPath}.items[${itemIndex}]`));
  });
  visit(content.nodes, `${path}.nodes`);
};

const validateManifest = (manifest, files, errors, warnings) => {
  if (!validateDocumentVersion(manifest, 'manifest.json', errors)) return { packageId: null, assetIds: new Set() };
  if (!idPattern.test(manifest.packageId || '')) errors.push(issue('INVALID_PACKAGE_ID', 'manifest.json.packageId', 'packageId không hợp lệ.'));
  if (!isObject(manifest.source) || typeof manifest.source.name !== 'string' || !ORIGIN_TYPES.has(manifest.source.originType)) {
    errors.push(issue('INVALID_SOURCE', 'manifest.json.source', 'Nguồn phải có name và originType hợp lệ.'));
  }
  if (!isObject(manifest.rights) || ['publishFixed', 'extractReuse', 'derivativeAssembly'].some((key) => typeof manifest.rights[key] !== 'boolean')) {
    errors.push(issue('INVALID_RIGHTS', 'manifest.json.rights', 'Ba quyền sử dụng phải là boolean tách biệt.'));
  }
  if (!Array.isArray(manifest.files)) {
    errors.push(issue('INVALID_FILE_LIST', 'manifest.json.files', 'files phải là mảng.'));
    return { packageId: manifest.packageId, assetIds: new Set() };
  }

  const declaredPaths = new Set();
  const assetIds = new Set();
  for (const [index, file] of manifest.files.entries()) {
    const itemPath = `manifest.json.files[${index}]`;
    if (!isObject(file) || typeof file.path !== 'string' || file.path === 'manifest.json') {
      errors.push(issue('INVALID_FILE_RECORD', itemPath, 'File record hoặc path không hợp lệ.'));
      continue;
    }
    if (declaredPaths.has(file.path)) errors.push(issue('DUPLICATE_FILE_RECORD', `${itemPath}.path`, `Path ${file.path} bị khai báo lặp.`));
    declaredPaths.add(file.path);
    const data = files.get(file.path);
    if (!data) {
      errors.push(issue('DECLARED_FILE_MISSING', `${itemPath}.path`, `ZIP thiếu tệp đã khai báo ${file.path}.`));
      continue;
    }
    if (!shaPattern.test(file.sha256 || '') || sha256(data) !== file.sha256) {
      errors.push(issue('CHECKSUM_MISMATCH', `${itemPath}.sha256`, `SHA-256 không khớp cho ${file.path}.`));
    }
    if (!Number.isInteger(file.sizeBytes) || file.sizeBytes !== data.length) {
      errors.push(issue('SIZE_MISMATCH', `${itemPath}.sizeBytes`, `Kích thước không khớp cho ${file.path}.`));
    }
    const detectedMime = detectMimeType(file.path, data);
    if (file.mimeType !== detectedMime) {
      errors.push(issue('MIME_MISMATCH', `${itemPath}.mimeType`, `MIME khai báo ${file.mimeType || '(trống)'} khác ${detectedMime}.`));
    }
    if (detectedMime === 'application/octet-stream') {
      errors.push(issue('UNSUPPORTED_MEDIA', itemPath, `Không hỗ trợ loại tệp ${file.path}.`));
    }
    if (detectedMime === 'image/svg+xml' && !isSafeSvg(data)) {
      errors.push(issue('UNSAFE_SVG', itemPath, `SVG ${file.path} chứa thành phần không an toàn.`));
    }
    if (file.path.startsWith('assets/')) {
      if (!idPattern.test(file.assetId || '')) errors.push(issue('MISSING_ASSET_ID', `${itemPath}.assetId`, 'Asset phải có assetId hợp lệ.'));
      else if (assetIds.has(file.assetId)) errors.push(issue('DUPLICATE_ASSET_ID', `${itemPath}.assetId`, `assetId ${file.assetId} bị lặp.`));
      else assetIds.add(file.assetId);
      if (typeof file.altText !== 'string' || file.altText.trim() === '') warnings.push(issue('MISSING_ASSET_ALT', `${itemPath}.altText`, 'Asset nên có altText trong manifest.'));
    }
  }
  for (const filePath of files.keys()) {
    if (filePath !== 'manifest.json' && !declaredPaths.has(filePath)) {
      errors.push(issue('UNDECLARED_FILE', filePath, `Tệp ${filePath} không được khai báo trong manifest.`));
    }
  }
  return { packageId: manifest.packageId, assetIds };
};

const validateQuestions = (document, answersDocument, assetIds, errors) => {
  if (!validateDocumentVersion(document, 'questions.json', errors)) return { questionIds: new Set(), groupIds: new Set() };
  const stimuli = Array.isArray(document.stimuli) ? document.stimuli : [];
  const groups = Array.isArray(document.groups) ? document.groups : [];
  const questions = Array.isArray(document.questions) ? document.questions : [];
  if (!Array.isArray(document.questions)) errors.push(issue('INVALID_QUESTIONS', 'questions.json.questions', 'questions phải là mảng.'));

  const stimulusIds = new Set();
  stimuli.forEach((stimulus, index) => {
    const base = `questions.json.stimuli[${index}]`;
    if (!idPattern.test(stimulus?.id || '') || stimulusIds.has(stimulus.id)) errors.push(issue('INVALID_STIMULUS_ID', `${base}.id`, 'Stimulus id thiếu, sai hoặc bị lặp.'));
    else stimulusIds.add(stimulus.id);
    validateRich(stimulus?.content, `${base}.content`, errors, assetIds);
  });

  const questionIds = new Set();
  const optionIdsByQuestion = new Map();
  const questionTypeById = new Map();
  questions.forEach((question, index) => {
    const base = `questions.json.questions[${index}]`;
    if (!idPattern.test(question?.id || '') || questionIds.has(question.id)) errors.push(issue('INVALID_QUESTION_ID', `${base}.id`, 'Question id thiếu, sai hoặc bị lặp.'));
    else questionIds.add(question.id);
    if (!QUESTION_TYPES.has(question?.type)) errors.push(issue('INVALID_QUESTION_TYPE', `${base}.type`, 'Loại câu hỏi không được hỗ trợ.'));
    if (typeof question?.points !== 'number' || question.points <= 0) errors.push(issue('INVALID_POINTS', `${base}.points`, 'Điểm phải lớn hơn 0.'));
    if (!Number.isInteger(question?.grade) || question.grade < 1 || question.grade > 12) errors.push(issue('INVALID_QUESTION_GRADE', `${base}.grade`, 'Lớp của câu phải từ 1 đến 12.'));
    if (typeof question?.subject !== 'string' || question.subject.trim() === '') errors.push(issue('INVALID_QUESTION_SUBJECT', `${base}.subject`, 'Câu hỏi phải có môn học.'));
    const assemblyFields = ['curriculumVersion', 'topicKey', 'skillKey', 'difficulty', 'estimatedSeconds'];
    const providedAssemblyFields = assemblyFields.filter((field) => question?.[field] !== undefined && question[field] !== null);
    if (providedAssemblyFields.length > 0 && providedAssemblyFields.length !== assemblyFields.length) {
      errors.push(issue('INCOMPLETE_ASSEMBLY_METADATA', base, 'Metadata assembly phải có đủ curriculumVersion, topicKey, skillKey, difficulty và estimatedSeconds.'));
    } else if (providedAssemblyFields.length === assemblyFields.length) {
      if (typeof question.curriculumVersion !== 'string'
        || !idPattern.test(question.curriculumVersion) || question.curriculumVersion.length > 80) {
        errors.push(issue('INVALID_CURRICULUM_VERSION', `${base}.curriculumVersion`, 'curriculumVersion không hợp lệ.'));
      }
      if (typeof question.topicKey !== 'string' || !idPattern.test(question.topicKey)) {
        errors.push(issue('INVALID_TOPIC_KEY', `${base}.topicKey`, 'topicKey không hợp lệ.'));
      }
      if (typeof question.skillKey !== 'string' || !idPattern.test(question.skillKey)) {
        errors.push(issue('INVALID_SKILL_KEY', `${base}.skillKey`, 'skillKey không hợp lệ.'));
      }
      if (!DIFFICULTIES.has(question.difficulty)) errors.push(issue('INVALID_DIFFICULTY', `${base}.difficulty`, 'difficulty phải là EASY, MEDIUM hoặc HARD.'));
      if (!Number.isInteger(question.estimatedSeconds) || question.estimatedSeconds < 1 || question.estimatedSeconds > 7200) {
        errors.push(issue('INVALID_ESTIMATED_SECONDS', `${base}.estimatedSeconds`, 'estimatedSeconds phải từ 1 đến 7200.'));
      }
    }
    if (question?.familyKey !== undefined && question.familyKey !== null
      && (typeof question.familyKey !== 'string' || !idPattern.test(question.familyKey))) {
      errors.push(issue('INVALID_FAMILY_KEY', `${base}.familyKey`, 'familyKey không hợp lệ.'));
    }
    validateRich(question?.content, `${base}.content`, errors, assetIds);
    const optionIds = new Set();
    const options = Array.isArray(question?.options) ? question.options : [];
    options.forEach((option, optionIndex) => {
      const optionBase = `${base}.options[${optionIndex}]`;
      if (!idPattern.test(option?.id || '') || optionIds.has(option.id)) errors.push(issue('INVALID_OPTION_ID', `${optionBase}.id`, 'Option id thiếu, sai hoặc bị lặp trong câu.'));
      else optionIds.add(option.id);
      validateRich(option?.content, `${optionBase}.content`, errors, assetIds);
    });
    optionIdsByQuestion.set(question?.id, optionIds);
    questionTypeById.set(question?.id, question?.type);
  });

  const groupIds = new Set();
  groups.forEach((group, index) => {
    const base = `questions.json.groups[${index}]`;
    if (!idPattern.test(group?.id || '') || groupIds.has(group.id)) errors.push(issue('INVALID_GROUP_ID', `${base}.id`, 'Group id thiếu, sai hoặc bị lặp.'));
    else groupIds.add(group.id);
    if (!GROUP_POLICIES.has(group?.selectionPolicy)) errors.push(issue('INVALID_GROUP_POLICY', `${base}.selectionPolicy`, 'selectionPolicy không hợp lệ.'));
    if (group?.stimulusRef && !stimulusIds.has(group.stimulusRef)) errors.push(issue('MISSING_STIMULUS', `${base}.stimulusRef`, 'Không tìm thấy stimulusRef.'));
    if (!Array.isArray(group?.questionRefs) || group.questionRefs.length === 0) errors.push(issue('EMPTY_GROUP', `${base}.questionRefs`, 'Nhóm phải có câu hỏi.'));
    else group.questionRefs.forEach((ref, refIndex) => {
      if (!questionIds.has(ref)) errors.push(issue('MISSING_GROUP_QUESTION', `${base}.questionRefs[${refIndex}]`, `Không tìm thấy câu ${ref}.`));
    });
  });

  if (validateDocumentVersion(answersDocument, 'answers.json', errors)) {
    const answers = Array.isArray(answersDocument.answers) ? answersDocument.answers : [];
    if (!Array.isArray(answersDocument.answers)) errors.push(issue('INVALID_ANSWERS', 'answers.json.answers', 'answers phải là mảng.'));
    const answered = new Set();
    answers.forEach((answer, index) => {
      const base = `answers.json.answers[${index}]`;
      if (!questionIds.has(answer?.questionRef)) errors.push(issue('UNKNOWN_ANSWER_QUESTION', `${base}.questionRef`, 'Answer tham chiếu câu không tồn tại.'));
      if (answered.has(answer?.questionRef)) errors.push(issue('DUPLICATE_ANSWER', `${base}.questionRef`, 'Một câu có nhiều answer record.'));
      answered.add(answer?.questionRef);
      const optionIds = optionIdsByQuestion.get(answer?.questionRef) || new Set();
      const correctIds = answer?.answerKey?.correctOptionIds;
      const questionType = questionTypeById.get(answer?.questionRef);
      if (!isObject(answer?.answerKey)) {
        errors.push(issue('MISSING_ANSWER_KEY', `${base}.answerKey`, 'Thiếu answerKey có cấu trúc.'));
      } else if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(questionType)) {
        if (!Array.isArray(correctIds) || correctIds.length === 0 || correctIds.some((id) => !optionIds.has(id))) {
          errors.push(issue('INVALID_CORRECT_OPTION', `${base}.answerKey.correctOptionIds`, 'Đáp án phải tham chiếu option tồn tại.'));
        } else if (questionType === 'SINGLE_CHOICE' && correctIds.length !== 1) {
          errors.push(issue('INVALID_SINGLE_ANSWER', `${base}.answerKey.correctOptionIds`, 'Single choice phải có đúng một đáp án.'));
        }
        if (questionType === 'MULTIPLE_CHOICE' && answer.answerKey.partialCredit !== undefined
          && answer.answerKey.partialCredit?.mode !== 'PER_OPTION_WITH_PENALTY') {
          errors.push(issue('INVALID_PARTIAL_CREDIT', `${base}.answerKey.partialCredit`, 'Partial credit chỉ hỗ trợ mode PER_OPTION_WITH_PENALTY.'));
        }
      } else if (questionType === 'SHORT_NUMBER') {
        if (!Number.isFinite(answer.answerKey.numericValue) || !Number.isFinite(answer.answerKey.tolerance) || answer.answerKey.tolerance < 0) {
          errors.push(issue('INVALID_NUMERIC_ANSWER', `${base}.answerKey`, 'Đáp án số cần numericValue và tolerance không âm.'));
        }
      } else if (questionType === 'SHORT_TEXT') {
        if (!Array.isArray(answer.answerKey.acceptedValues) || answer.answerKey.acceptedValues.length === 0 || answer.answerKey.acceptedValues.some((value) => typeof value !== 'string')) {
          errors.push(issue('INVALID_TEXT_ANSWER', `${base}.answerKey.acceptedValues`, 'Đáp án text cần acceptedValues không rỗng.'));
        }
      } else if (questionType === 'TRUE_FALSE') {
        if (!Array.isArray(answer.answerKey.correctValues) || answer.answerKey.correctValues.length === 0 || answer.answerKey.correctValues.some((value) => typeof value !== 'boolean')) {
          errors.push(issue('INVALID_TRUE_FALSE_ANSWER', `${base}.answerKey.correctValues`, 'Đáp án đúng/sai cần correctValues boolean.'));
        }
      } else if (questionType === 'ESSAY') {
        if (!isObject(answer.answerKey.rubric) || !Array.isArray(answer.answerKey.rubric.criteria) || answer.answerKey.rubric.criteria.length === 0) {
          errors.push(issue('INVALID_ESSAY_RUBRIC', `${base}.answerKey.rubric`, 'Tự luận phải có rubric criteria để reviewer kiểm tra.'));
        }
      }
      if (answer?.explanation) validateRich(answer.explanation, `${base}.explanation`, errors, assetIds);
    });
    questionIds.forEach((id) => {
      if (!answered.has(id)) errors.push(issue('MISSING_ANSWER', 'answers.json.answers', `Thiếu answer key cho câu ${id}.`));
    });
  }
  return { questionIds, groupIds };
};

const validateExam = (exam, rights, references, assetIds, errors) => {
  if (!validateDocumentVersion(exam, 'exam.json', errors)) return;
  if (!idPattern.test(exam.id || '')) errors.push(issue('INVALID_EXAM_ID', 'exam.json.id', 'Exam id không hợp lệ.'));
  if (typeof exam.title !== 'string' || exam.title.trim() === '') errors.push(issue('INVALID_TITLE', 'exam.json.title', 'Đề phải có tiêu đề.'));
  if (!Number.isInteger(exam.grade) || exam.grade < 1 || exam.grade > 12) errors.push(issue('INVALID_GRADE', 'exam.json.grade', 'Lớp phải từ 1 đến 12.'));
  if (typeof exam.subject !== 'string' || exam.subject.trim() === '') errors.push(issue('INVALID_SUBJECT', 'exam.json.subject', 'Đề phải có môn học.'));
  if (!Number.isInteger(exam.durationMinutes) || exam.durationMinutes <= 0) errors.push(issue('INVALID_DURATION', 'exam.json.durationMinutes', 'Thời lượng phải là số nguyên dương.'));
  if (!EXAM_MODES.has(exam.mode)) errors.push(issue('INVALID_EXAM_MODE', 'exam.json.mode', 'exam mode không hợp lệ.'));
  if (!PURPOSES.has(exam.purpose)) errors.push(issue('INVALID_PURPOSE', 'exam.json.purpose', 'purpose không hợp lệ.'));
  if (exam.mode === 'FIXED' && rights?.publishFixed !== true) errors.push(issue('LICENSE_NOT_ALLOWED', 'manifest.json.rights.publishFixed', 'Nguồn không cho phép công bố đề FIXED.'));
  if (exam.mode === 'ASSEMBLED' && rights?.derivativeAssembly !== true) errors.push(issue('LICENSE_NOT_ALLOWED', 'manifest.json.rights.derivativeAssembly', 'Nguồn không cho phép đề ASSEMBLED.'));
  if (!Array.isArray(exam.sections) || exam.sections.length === 0) {
    errors.push(issue('EMPTY_EXAM', 'exam.json.sections', 'Đề phải có ít nhất một section.'));
    return;
  }
  const seenItems = new Set();
  exam.sections.forEach((section, sectionIndex) => {
    const base = `exam.json.sections[${sectionIndex}]`;
    if (section?.instruction) validateRich(section.instruction, `${base}.instruction`, errors, assetIds);
    if (!Array.isArray(section?.itemRefs) || section.itemRefs.length === 0) errors.push(issue('EMPTY_SECTION', `${base}.itemRefs`, 'Section phải có itemRefs.'));
    else section.itemRefs.forEach((item, itemIndex) => {
      const itemPath = `${base}.itemRefs[${itemIndex}]`;
      const collection = item?.type === 'GROUP' ? references.groupIds : references.questionIds;
      if (!['GROUP', 'QUESTION'].includes(item?.type) || !collection.has(item?.ref)) errors.push(issue('INVALID_EXAM_ITEM', itemPath, 'Exam item tham chiếu group/question không tồn tại.'));
      const key = `${item?.type}:${item?.ref}`;
      if (seenItems.has(key)) errors.push(issue('DUPLICATE_EXAM_ITEM', itemPath, 'Exam item bị lặp trong đề FIXED.'));
      seenItems.add(key);
    });
  });
};

export const validateExamPackage = (files, packageSha256) => {
  const errors = [];
  const warnings = [];
  const manifest = parseJson(files, 'manifest.json', errors);
  const exam = parseJson(files, 'exam.json', errors);
  const questions = parseJson(files, 'questions.json', errors);
  const answers = parseJson(files, 'answers.json', errors);
  const { packageId, assetIds } = validateManifest(manifest, files, errors, warnings);
  REQUIRED_DOCUMENTS.forEach((name) => {
    if (manifest?.files && !manifest.files.some((file) => file.path === name)) errors.push(issue('DOCUMENT_NOT_DECLARED', `manifest.json.files`, `${name} chưa được khai báo.`));
  });
  const references = validateQuestions(questions, answers, assetIds, errors);
  validateExam(exam, manifest?.rights, references, assetIds, errors);

  if (manifest?.counts) {
    const actualQuestionCount = Array.isArray(questions?.questions) ? questions.questions.length : 0;
    if (manifest.counts.questions !== actualQuestionCount) errors.push(issue('COUNT_MISMATCH', 'manifest.json.counts.questions', 'Số câu trong manifest không khớp.'));
  }

  return {
    packageId: idPattern.test(packageId || '') ? packageId : `invalid-${packageSha256.slice(0, 24)}`,
    schemaVersion: manifest?.schemaVersion || 'unknown',
    status: errors.length === 0 ? 'READY_FOR_REVIEW' : 'INVALID',
    summary: {
      files: files.size,
      questions: Array.isArray(questions?.questions) ? questions.questions.length : 0,
      stimuli: Array.isArray(questions?.stimuli) ? questions.stimuli.length : 0,
      groups: Array.isArray(questions?.groups) ? questions.groups.length : 0
    },
    errors,
    warnings
  };
};
