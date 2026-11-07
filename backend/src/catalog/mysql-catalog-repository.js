const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const placeholders = (values) => values.map(() => '?').join(', ');

const collectAssetIds = (content, target) => {
  const visit = (nodes) => (nodes || []).forEach((node) => {
    if (node.type === 'figure') target.add(node.assetId);
    if (node.type === 'table') node.rows.forEach((row) => row.forEach((cell) => visit(cell.content)));
    if (node.type === 'list') node.items.forEach(visit);
  });
  visit(content?.nodes);
};

const catalogError = (code, message) => Object.assign(new Error(message), { code, statusCode: 500 });

export class MysqlCatalogRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listPublishedFixed() {
    const [rows] = await this.pool.execute(
      `SELECT ev.id, ev.version_number, ev.title, ev.description, ev.grade, ev.subject,
              ev.duration_minutes, ev.purpose, ev.published_at
       FROM exam_versions ev
       WHERE ev.approval_status = 'PUBLISHED'
         AND ev.exam_mode = 'FIXED'
         AND ev.purpose <> 'FORMAL_ASSESSMENT'
       ORDER BY ev.published_at DESC, ev.created_at DESC`
    );
    return rows.map((row) => ({
      id: row.id,
      version: row.version_number,
      title: row.title,
      description: row.description,
      grade: row.grade,
      subject: row.subject,
      durationMinutes: row.duration_minutes,
      purpose: row.purpose,
      publishedAt: row.published_at
    }));
  }

  async findPublishedFixed(examVersionId) {
    const [examRows] = await this.pool.execute(
      `SELECT ev.id, ev.version_number, ev.title, ev.description, ev.exam_mode, ev.purpose,
              ev.approval_status, ev.grade, ev.subject, ev.duration_minutes, ev.schema_version
       FROM exam_versions ev
       WHERE ev.id = ?
         AND ev.approval_status = 'PUBLISHED'
         AND ev.exam_mode = 'FIXED'
         AND ev.purpose <> 'FORMAL_ASSESSMENT'
       LIMIT 1`,
      [examVersionId]
    );
    if (!examRows[0]) return null;

    const [sectionRows] = await this.pool.execute(
      `SELECT id, position, title, instruction_json
       FROM exam_sections
       WHERE exam_version_id = ?
       ORDER BY position`,
      [examVersionId]
    );
    if (sectionRows.length === 0) throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề đã publish không có section.');
    const sectionIds = sectionRows.map((row) => row.id);
    const [itemRows] = await this.pool.execute(
      `SELECT id, exam_section_id, position, question_version_id, question_group_id
       FROM exam_items
       WHERE exam_section_id IN (${placeholders(sectionIds)})
       ORDER BY exam_section_id, position`,
      sectionIds
    );
    const groupIds = [...new Set(itemRows.map((row) => row.question_group_id).filter(Boolean))];
    const directQuestionIds = itemRows.map((row) => row.question_version_id).filter(Boolean);

    const groupRows = groupIds.length > 0 ? (await this.pool.execute(
      `SELECT qg.id, qg.selection_policy, qg.stimulus_version_id,
              sv.title AS stimulus_title, sv.content_json AS stimulus_content_json
       FROM question_groups qg
       LEFT JOIN stimulus_versions sv
         ON sv.id = qg.stimulus_version_id
        AND sv.approval_status = 'PUBLISHED'
       WHERE qg.id IN (${placeholders(groupIds)})`,
      groupIds
    ))[0] : [];
    const groupItemRows = groupIds.length > 0 ? (await this.pool.execute(
      `SELECT group_id, question_version_id, position
       FROM question_group_items
       WHERE group_id IN (${placeholders(groupIds)})
       ORDER BY group_id, position`,
      groupIds
    ))[0] : [];
    const questionVersionIds = [...new Set([
      ...directQuestionIds,
      ...groupItemRows.map((row) => row.question_version_id)
    ])];
    if (questionVersionIds.length === 0) throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề đã publish không có câu hỏi.');

    const [questionRows] = await this.pool.execute(
      `SELECT id, question_type, content_json, answer_key_json, explanation_json, points
       FROM question_versions
       WHERE id IN (${placeholders(questionVersionIds)})
         AND approval_status = 'PUBLISHED'`,
      questionVersionIds
    );
    if (questionRows.length !== questionVersionIds.length) {
      throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề tham chiếu question version chưa publish.');
    }
    const [optionRows] = await this.pool.execute(
      `SELECT id, question_version_id, position, content_json
       FROM question_options
       WHERE question_version_id IN (${placeholders(questionVersionIds)})
       ORDER BY question_version_id, position`,
      questionVersionIds
    );

    const optionsByQuestion = new Map();
    optionRows.forEach((row) => {
      const options = optionsByQuestion.get(row.question_version_id) || [];
      options.push({ id: row.id, content: parseJson(row.content_json) });
      optionsByQuestion.set(row.question_version_id, options);
    });
    const questionsById = new Map(questionRows.map((row) => [row.id, {
      id: row.id,
      versionId: row.id,
      type: row.question_type,
      points: Number(row.points),
      content: parseJson(row.content_json),
      options: optionsByQuestion.get(row.id) || [],
      answerKey: parseJson(row.answer_key_json),
      explanation: parseJson(row.explanation_json)
    }]));
    const groupItems = new Map();
    groupItemRows.forEach((row) => {
      const items = groupItems.get(row.group_id) || [];
      items.push(row.question_version_id);
      groupItems.set(row.group_id, items);
    });
    if (groupRows.some((row) => (groupItems.get(row.id) || []).length === 0)) {
      throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề tham chiếu group không có câu hỏi.');
    }
    const groupsById = new Map(groupRows.map((row) => [row.id, {
      id: row.id,
      stimulusVersionId: row.stimulus_version_id,
      selectionPolicy: row.selection_policy,
      questionVersionIds: groupItems.get(row.id) || [],
      stimulus: row.stimulus_version_id ? {
        id: row.stimulus_version_id,
        title: row.stimulus_title,
        content: parseJson(row.stimulus_content_json)
      } : null
    }]));
    if (groupRows.some((row) => row.stimulus_version_id && !row.stimulus_content_json)) {
      throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề tham chiếu stimulus version chưa publish.');
    }

    const itemsBySection = new Map();
    itemRows.forEach((row) => {
      const items = itemsBySection.get(row.exam_section_id) || [];
      items.push(row);
      itemsBySection.set(row.exam_section_id, items);
    });
    let questionOrder = 0;
    const stimuliById = new Map();
    const sections = sectionRows.map((row) => ({
      id: row.id,
      title: row.title,
      instruction: parseJson(row.instruction_json),
      groups: (itemsBySection.get(row.id) || []).map((item) => {
        if (item.question_version_id) {
          questionOrder += 1;
          return {
            id: `direct-${item.id}`,
            stimulusVersionId: null,
            selectionPolicy: 'DIRECT',
            questions: [{ ...questionsById.get(item.question_version_id), order: questionOrder }]
          };
        }
        const group = groupsById.get(item.question_group_id);
        if (!group) throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề tham chiếu group không tồn tại.');
        if (group.stimulus) stimuliById.set(group.stimulus.id, group.stimulus);
        return {
          id: group.id,
          stimulusVersionId: group.stimulusVersionId,
          selectionPolicy: group.selectionPolicy,
          questions: group.questionVersionIds.map((id) => {
            questionOrder += 1;
            return { ...questionsById.get(id), order: questionOrder };
          })
        };
      })
    }));

    const assetIds = new Set();
    sections.forEach((section) => {
      collectAssetIds(section.instruction, assetIds);
      section.groups.forEach((group) => group.questions.forEach((question) => {
        collectAssetIds(question.content, assetIds);
        question.options.forEach((option) => collectAssetIds(option.content, assetIds));
        collectAssetIds(question.explanation, assetIds);
      }));
    });
    stimuliById.forEach((stimulus) => collectAssetIds(stimulus.content, assetIds));
    const assetIdList = [...assetIds];
    const assetRows = assetIdList.length > 0 ? (await this.pool.execute(
      `SELECT id, mime_type, alt_text
       FROM media_assets
       WHERE id IN (${placeholders(assetIdList)}) AND approval_status = 'PUBLISHED'`,
      assetIdList
    ))[0] : [];
    if (assetRows.length !== assetIdList.length) {
      throw catalogError('PUBLISHED_EXAM_INCOMPLETE', 'Đề tham chiếu asset chưa publish.');
    }
    const assets = Object.fromEntries(assetRows.map((row) => [row.id, {
      id: row.id,
      url: `/api/catalog/assets/${encodeURIComponent(row.id)}`,
      mimeType: row.mime_type,
      altText: row.alt_text
    }]));
    const exam = examRows[0];
    return {
      id: exam.id,
      versionId: exam.id,
      version: exam.version_number,
      mode: exam.exam_mode,
      purpose: exam.purpose,
      approvalStatus: exam.approval_status,
      title: exam.title,
      description: exam.description,
      grade: exam.grade,
      subject: exam.subject,
      durationMinutes: exam.duration_minutes,
      schemaVersion: exam.schema_version,
      assets,
      stimuli: [...stimuliById.values()],
      sections
    };
  }

  async findPublishedAsset(assetId) {
    const [rows] = await this.pool.execute(
      `SELECT ma.id, ma.storage_key, ma.mime_type, ma.sha256, ma.size_bytes, ma.alt_text
       FROM media_assets ma
       WHERE ma.id = ?
         AND ma.approval_status = 'PUBLISHED'
         AND EXISTS (
           SELECT 1
           FROM asset_references ar
           WHERE ar.asset_id = ma.id
             AND (
               (ar.owner_type = 'EXAM_SECTION' AND EXISTS (
                 SELECT 1
                 FROM exam_sections es
                 INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
                 WHERE es.id = ar.owner_id
                   AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
                   AND ev.purpose <> 'FORMAL_ASSESSMENT'
               ))
               OR (ar.owner_type = 'STIMULUS_VERSION' AND EXISTS (
                 SELECT 1
                 FROM stimulus_versions sv
                 INNER JOIN question_groups qg ON qg.stimulus_version_id = sv.id
                 INNER JOIN exam_items ei ON ei.question_group_id = qg.id
                 INNER JOIN exam_sections es ON es.id = ei.exam_section_id
                 INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
                 WHERE sv.id = ar.owner_id AND sv.approval_status = 'PUBLISHED'
                   AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
                   AND ev.purpose <> 'FORMAL_ASSESSMENT'
               ))
               OR (ar.owner_type = 'QUESTION_VERSION' AND EXISTS (
                 SELECT 1
                 FROM question_versions qv
                 WHERE qv.id = ar.owner_id AND qv.approval_status = 'PUBLISHED'
                   AND (
                     EXISTS (
                       SELECT 1
                       FROM exam_items ei
                       INNER JOIN exam_sections es ON es.id = ei.exam_section_id
                       INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
                       WHERE ei.question_version_id = qv.id
                         AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
                         AND ev.purpose <> 'FORMAL_ASSESSMENT'
                     )
                     OR EXISTS (
                       SELECT 1
                       FROM question_group_items qgi
                       INNER JOIN exam_items ei ON ei.question_group_id = qgi.group_id
                       INNER JOIN exam_sections es ON es.id = ei.exam_section_id
                       INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
                       WHERE qgi.question_version_id = qv.id
                         AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
                         AND ev.purpose <> 'FORMAL_ASSESSMENT'
                     )
                   )
               ))
               OR (ar.owner_type = 'QUESTION_OPTION' AND EXISTS (
                 SELECT 1
                 FROM question_options qo
                 INNER JOIN question_versions qv ON qv.id = qo.question_version_id
                 WHERE qo.id = ar.owner_id AND qv.approval_status = 'PUBLISHED'
                   AND (
                     EXISTS (
                       SELECT 1
                       FROM exam_items ei
                       INNER JOIN exam_sections es ON es.id = ei.exam_section_id
                       INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
                       WHERE ei.question_version_id = qv.id
                         AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
                         AND ev.purpose <> 'FORMAL_ASSESSMENT'
                     )
                     OR EXISTS (
                       SELECT 1
                       FROM question_group_items qgi
                       INNER JOIN exam_items ei ON ei.question_group_id = qgi.group_id
                       INNER JOIN exam_sections es ON es.id = ei.exam_section_id
                       INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
                       WHERE qgi.question_version_id = qv.id
                         AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
                         AND ev.purpose <> 'FORMAL_ASSESSMENT'
                     )
                   )
               ))
             )
         )
       LIMIT 1`,
      [assetId]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      storageKey: rows[0].storage_key,
      mimeType: rows[0].mime_type,
      sha256: rows[0].sha256,
      sizeBytes: Number(rows[0].size_bytes),
      altText: rows[0].alt_text
    };
  }
}
