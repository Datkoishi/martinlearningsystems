import { assertValidRichContent } from './rich-content.js';

const visitBlocks = (nodes, visitor) => {
  for (const node of nodes) {
    visitor(node);
    if (node.type === 'table') {
      node.rows.flat().forEach((cell) => visitBlocks(cell.content, visitor));
    }
    if (node.type === 'list') node.items.forEach((item) => visitBlocks(item, visitor));
  }
};

const validateAssets = (content, assets, label) => {
  visitBlocks(content.nodes, (node) => {
    if (node.type === 'figure' && !assets[node.assetId]) {
      const error = new Error(`${label} tham chiếu asset không tồn tại: ${node.assetId}`);
      error.code = 'MISSING_ASSET';
      throw error;
    }
  });
};

const validateAnswerKey = (question) => {
  const optionIds = new Set(question.options.map((option) => option.id));
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(question.type)) {
    const correctIds = question.answerKey?.correctOptionIds;
    if (!Array.isArray(correctIds) || correctIds.length === 0 || correctIds.some((id) => !optionIds.has(id))) {
      throw new Error(`Answer key không khớp option của ${question.versionId}.`);
    }
    if (question.type === 'SINGLE_CHOICE' && correctIds.length !== 1) {
      throw new Error(`Câu single choice ${question.versionId} phải có đúng một đáp án.`);
    }
  }
  if (question.type === 'SHORT_NUMBER') {
    if (!Number.isFinite(question.answerKey?.numericValue) || !Number.isFinite(question.answerKey?.tolerance) || question.answerKey.tolerance < 0) {
      throw new Error(`Answer key số của ${question.versionId} không hợp lệ.`);
    }
  }
};

const validateExamContent = (exam) => {
  for (const stimulus of exam.stimuli) {
    assertValidRichContent(stimulus.content, `stimulus ${stimulus.id}`);
    validateAssets(stimulus.content, exam.assets, `stimulus ${stimulus.id}`);
  }
  for (const section of exam.sections) {
    assertValidRichContent(section.instruction, `section ${section.id}`);
    validateAssets(section.instruction, exam.assets, `section ${section.id}`);
    for (const group of section.groups) {
      for (const question of group.questions) {
        assertValidRichContent(question.content, `question ${question.versionId}`);
        validateAssets(question.content, exam.assets, `question ${question.versionId}`);
        question.options.forEach((option) => {
          assertValidRichContent(option.content, `option ${option.id}`);
          validateAssets(option.content, exam.assets, `option ${option.id}`);
        });
        if (question.explanation) {
          assertValidRichContent(question.explanation, `explanation ${question.versionId}`);
          validateAssets(question.explanation, exam.assets, `explanation ${question.versionId}`);
        }
        validateAnswerKey(question);
      }
    }
  }
};

const studentQuestion = ({ answerKey: _answerKey, explanation: _explanation, ...question }) => question;

export const toStudentExam = (exam) => {
  validateExamContent(exam);
  return {
    ...exam,
    sections: exam.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        questions: group.questions.map(studentQuestion)
      }))
    }))
  };
};
