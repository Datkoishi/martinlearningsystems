const parseDocument = (files, name) => JSON.parse(files.get(name).toString('utf8').replace(/^\uFEFF/, ''));

export const buildReviewerPreview = (files, importJobId) => {
  const manifest = parseDocument(files, 'manifest.json');
  const exam = parseDocument(files, 'exam.json');
  const content = parseDocument(files, 'questions.json');
  const answers = parseDocument(files, 'answers.json');
  const answersByQuestion = new Map(answers.answers.map((answer) => [answer.questionRef, answer]));
  const questionsById = new Map(content.questions.map((question) => [question.id, {
    ...question,
    ...answersByQuestion.get(question.id)
  }]));
  const groupsById = new Map(content.groups.map((group) => [group.id, group]));
  const stimuliById = new Map(content.stimuli.map((stimulus) => [stimulus.id, stimulus]));
  let questionOrder = 0;

  const assets = Object.fromEntries(manifest.files
    .filter((file) => file.path.startsWith('assets/') && file.assetId)
    .map((file) => [file.assetId, {
      id: file.assetId,
      url: `/api/imports/${importJobId}/assets/${encodeURIComponent(file.assetId)}`,
      mimeType: file.mimeType,
      altText: file.altText || ''
    }]));

  const sections = exam.sections.map((section) => ({
    id: section.id,
    title: section.title,
    instruction: section.instruction,
    groups: section.itemRefs.map((item, itemIndex) => {
      if (item.type === 'QUESTION') {
        questionOrder += 1;
        return {
          id: `direct-${section.id}-${itemIndex}`,
          selectionPolicy: 'DIRECT',
          questions: [{ ...questionsById.get(item.ref), order: questionOrder }]
        };
      }
      const group = groupsById.get(item.ref);
      return {
        ...group,
        stimulus: group.stimulusRef ? stimuliById.get(group.stimulusRef) : null,
        questions: group.questionRefs.map((questionRef) => {
          questionOrder += 1;
          return { ...questionsById.get(questionRef), order: questionOrder };
        })
      };
    })
  }));

  return {
    packageId: manifest.packageId,
    source: manifest.source,
    rights: manifest.rights,
    exam: {
      id: exam.id,
      title: exam.title,
      grade: exam.grade,
      subject: exam.subject,
      durationMinutes: exam.durationMinutes,
      mode: exam.mode,
      purpose: exam.purpose,
      sections
    },
    assets
  };
};

export const findPackageAsset = (files, assetId) => {
  const manifest = parseDocument(files, 'manifest.json');
  const record = manifest.files.find((file) => file.assetId === assetId && file.path.startsWith('assets/'));
  if (!record) return null;
  const data = files.get(record.path);
  return data ? { data, mimeType: record.mimeType, altText: record.altText || '' } : null;
};
