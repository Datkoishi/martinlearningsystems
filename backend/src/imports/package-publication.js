import crypto, { randomUUID } from 'node:crypto';

const parseDocument = (files, name) => JSON.parse(files.get(name).toString('utf8').replace(/^\uFEFF/, ''));

const boundedStableKey = (...parts) => {
  const raw = parts.join(':');
  if (raw.length <= 160) return raw;
  return `${parts[0]}:${crypto.createHash('sha256').update(raw).digest('hex')}`;
};

const safeGeneratorMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const allowedKeys = new Set(['provider', 'model', 'promptId', 'promptVersion', 'generatorVersion', 'generatedAt', 'temperature']);
  const entries = Object.entries(metadata).filter(([key, value]) => (
    allowedKeys.has(key) && ['string', 'number', 'boolean'].includes(typeof value)
  ));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const remapRichAssetIds = (content, assetIds) => {
  if (!content) return null;
  const remapped = JSON.parse(JSON.stringify(content));
  const visit = (nodes) => nodes.forEach((node) => {
    if (node.type === 'figure') node.assetId = assetIds.get(node.assetId);
    if (node.type === 'table') node.rows.forEach((row) => row.forEach((cell) => visit(cell.content)));
    if (node.type === 'list') node.items.forEach(visit);
  });
  visit(remapped.nodes || []);
  return remapped;
};

const collectFigureReferences = (content, ownerType, ownerId, rootPath) => {
  const references = [];
  const visit = (nodes, nodePath) => nodes.forEach((node, index) => {
    const currentPath = `${nodePath}[${index}]`;
    if (node.type === 'figure') {
      references.push({ assetId: node.assetId, ownerType, ownerId, jsonPath: `${currentPath}.assetId` });
    }
    if (node.type === 'table') {
      node.rows.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => {
        visit(cell.content, `${currentPath}.rows[${rowIndex}][${cellIndex}].content`);
      }));
    }
    if (node.type === 'list') {
      node.items.forEach((item, itemIndex) => visit(item, `${currentPath}.items[${itemIndex}]`));
    }
  });
  visit(content?.nodes || [], `${rootPath}.nodes`);
  return references;
};

export const buildPublicationPlan = ({ files, importJob }) => {
  const manifest = parseDocument(files, 'manifest.json');
  const examDocument = parseDocument(files, 'exam.json');
  const content = parseDocument(files, 'questions.json');
  const answersDocument = parseDocument(files, 'answers.json');
  const answersByQuestion = new Map(answersDocument.answers.map((answer) => [answer.questionRef, answer]));
  const packagePrefix = manifest.packageId;

  const assets = manifest.files
    .filter((file) => file.path.startsWith('assets/') && file.assetId)
    .map((file) => ({
      id: randomUUID(),
      externalId: file.assetId,
      storageKey: `${importJob.sourceStorageKey}#${file.path}`,
      mimeType: file.mimeType,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      altText: file.altText || '',
      metadata: {
        importJobId: importJob.id,
        packageId: manifest.packageId,
        externalAssetId: file.assetId,
        archiveEntryPath: file.path
      }
    }));
  const assetIds = new Map(assets.map((asset) => [asset.externalId, asset.id]));
  const assetReferences = [];

  const stimuli = content.stimuli.map((stimulus) => {
    const record = {
      identityId: randomUUID(),
      versionId: randomUUID(),
      externalId: stimulus.id,
      stableKey: boundedStableKey('stimulus', packagePrefix, stimulus.id),
      title: stimulus.title || null,
      content: remapRichAssetIds(stimulus.content, assetIds)
    };
    assetReferences.push(...collectFigureReferences(record.content, 'STIMULUS_VERSION', record.versionId, '$.content'));
    return record;
  });
  const stimuliByExternalId = new Map(stimuli.map((stimulus) => [stimulus.externalId, stimulus]));

  const questions = content.questions.map((question) => {
    const answer = answersByQuestion.get(question.id);
    const options = (question.options || []).map((option, index) => ({
      id: randomUUID(),
      externalId: option.id,
      optionKey: option.id,
      position: index + 1,
      content: remapRichAssetIds(option.content, assetIds)
    }));
    const optionIds = new Map(options.map((option) => [option.externalId, option.id]));
    const answerKey = JSON.parse(JSON.stringify(answer.answerKey));
    if (Array.isArray(answerKey.correctOptionIds)) {
      answerKey.correctOptionIds = answerKey.correctOptionIds.map((id) => optionIds.get(id));
    }
    const record = {
      identityId: randomUUID(),
      versionId: randomUUID(),
      externalId: question.id,
      stableKey: boundedStableKey('question', packagePrefix, question.id),
      type: question.type,
      content: remapRichAssetIds(question.content, assetIds),
      answerKey,
      explanation: remapRichAssetIds(answer.explanation, assetIds),
      points: question.points,
      grade: question.grade,
      subject: question.subject,
      options
    };
    assetReferences.push(...collectFigureReferences(record.content, 'QUESTION_VERSION', record.versionId, '$.content'));
    if (record.explanation) assetReferences.push(...collectFigureReferences(record.explanation, 'EXPLANATION', record.versionId, '$.explanation'));
    record.options.forEach((option) => {
      assetReferences.push(...collectFigureReferences(option.content, 'QUESTION_OPTION', option.id, '$.content'));
    });
    return record;
  });
  const questionsByExternalId = new Map(questions.map((question) => [question.externalId, question]));

  const groups = content.groups.map((group) => ({
    id: randomUUID(),
    externalId: group.id,
    stableKey: boundedStableKey('group', packagePrefix, group.id, importJob.packageSha256.slice(0, 16)),
    stimulusVersionId: group.stimulusRef ? stimuliByExternalId.get(group.stimulusRef).versionId : null,
    selectionPolicy: group.selectionPolicy,
    questionVersionIds: group.questionRefs.map((questionRef) => questionsByExternalId.get(questionRef).versionId)
  }));
  const groupsByExternalId = new Map(groups.map((group) => [group.externalId, group]));

  const sections = examDocument.sections.map((section, sectionIndex) => {
    const record = {
      id: randomUUID(),
      externalId: section.id,
      position: sectionIndex + 1,
      title: section.title,
      instruction: remapRichAssetIds(section.instruction || { schemaVersion: '1.0.0', nodes: [] }, assetIds),
      items: section.itemRefs.map((item, itemIndex) => ({
        id: randomUUID(),
        position: itemIndex + 1,
        questionVersionId: item.type === 'QUESTION' ? questionsByExternalId.get(item.ref).versionId : null,
        questionGroupId: item.type === 'GROUP' ? groupsByExternalId.get(item.ref).id : null
      }))
    };
    assetReferences.push(...collectFigureReferences(record.instruction, 'EXAM_SECTION', record.id, '$.instruction'));
    return record;
  });

  return {
    publicationId: randomUUID(),
    importJobId: importJob.id,
    packageId: manifest.packageId,
    packageSha256: importJob.packageSha256,
    source: {
      id: randomUUID(),
      name: manifest.source.name,
      originType: manifest.source.originType,
      generatorMetadata: safeGeneratorMetadata(manifest.source.generatorMetadata)
    },
    license: {
      id: randomUUID(),
      label: `Exam Package ${manifest.packageId}`,
      publishFixed: manifest.rights.publishFixed,
      extractReuse: manifest.rights.extractReuse,
      derivativeAssembly: manifest.rights.derivativeAssembly
    },
    assets,
    stimuli,
    questions,
    groups,
    exam: {
      identityId: randomUUID(),
      versionId: randomUUID(),
      stableKey: boundedStableKey('exam', packagePrefix, examDocument.id),
      title: examDocument.title,
      description: examDocument.description || null,
      mode: examDocument.mode,
      purpose: examDocument.purpose,
      grade: examDocument.grade,
      subject: examDocument.subject,
      durationMinutes: examDocument.durationMinutes,
      schemaVersion: examDocument.schemaVersion,
      sections
    },
    assetReferences: assetReferences.map((reference) => ({ ...reference, id: randomUUID() }))
  };
};
