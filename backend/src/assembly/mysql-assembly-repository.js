const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};
const placeholders = (values) => values.map(() => '?').join(', ');
const domainError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

const mapRun = (row) => row && ({
  id: row.id,
  creatorUserId: row.created_by_user_id,
  idempotencyKey: row.idempotency_key,
  requestSha256: row.request_sha256,
  status: row.status,
  blueprint: parseJson(row.blueprint_json),
  seed: row.seed,
  engineVersion: row.engine_version,
  selectionSha256: row.selection_sha256,
  selectionManifest: parseJson(row.selection_manifest_json),
  sourceDistribution: parseJson(row.source_distribution_json),
  studentSnapshot: parseJson(row.student_snapshot_json),
  scoringSnapshot: parseJson(row.scoring_snapshot_json),
  snapshotSha256: row.snapshot_sha256,
  createdAt: row.created_at
});

const selectRun = async (executor, whereSql, values, forUpdate = false) => {
  const [rows] = await executor.execute(
    `SELECT id, created_by_user_id, idempotency_key, request_sha256, status,
            blueprint_json, seed, engine_version, selection_sha256,
            selection_manifest_json, source_distribution_json,
            student_snapshot_json, scoring_snapshot_json, snapshot_sha256, created_at
     FROM assembly_runs
     WHERE ${whereSql}
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    values
  );
  return mapRun(rows[0]);
};

const readRunSnapshot = async (pool, whereSql, values) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const run = await selectRun(connection, whereSql, values);
    await connection.commit();
    return run;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const collectAssetIds = (content, target) => {
  const visit = (nodes) => (nodes || []).forEach((node) => {
    if (node.type === 'figure') target.add(node.assetId);
    if (node.type === 'table') node.rows.forEach((row) => row.forEach((cell) => visit(cell.content)));
    if (node.type === 'list') node.items.forEach(visit);
  });
  visit(content?.nodes);
};

export class MysqlAssemblyRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findByIdempotency(creatorUserId, idempotencyKey) {
    return readRunSnapshot(this.pool, 'created_by_user_id = ? AND idempotency_key = ?', [creatorUserId, idempotencyKey]);
  }

  async findOwned(id, creatorUserId) {
    return readRunSnapshot(this.pool, 'id = ? AND created_by_user_id = ?', [id, creatorUserId]);
  }

  async listEligiblePool(filters) {
    const originPlaceholders = placeholders(filters.acceptedOriginTypes);
    const licenseFilter = filters.acceptedLicenseIds.length > 0
      ? `AND ul.id IN (${placeholders(filters.acceptedLicenseIds)})`
      : '';
    const values = [
      filters.grade,
      filters.subject,
      filters.curriculumVersion,
      ...filters.acceptedOriginTypes,
      ...filters.acceptedLicenseIds
    ];
    const [rows] = await this.pool.execute(
      `SELECT qv.id, qv.question_id, qv.question_type, qv.content_json, qv.answer_key_json,
              qv.explanation_json, qv.points, qv.grade, qv.subject, qv.curriculum_version,
              qv.topic_key, qv.skill_key, qv.difficulty, qv.estimated_seconds, qv.family_key,
              sp.source_id, sp.license_id, sp.relation_type, cs.origin_type
       FROM question_versions qv
       INNER JOIN source_provenance sp ON sp.question_version_id = qv.id
       INNER JOIN content_sources cs ON cs.id = sp.source_id
       INNER JOIN usage_licenses ul ON ul.id = sp.license_id AND ul.source_id = sp.source_id
       WHERE qv.approval_status = 'PUBLISHED'
         AND qv.grade = ? AND qv.subject = ? AND qv.curriculum_version = ?
         AND qv.topic_key IS NOT NULL AND qv.skill_key IS NOT NULL
         AND qv.difficulty IS NOT NULL AND qv.estimated_seconds IS NOT NULL
         AND ul.derivative_assembly = TRUE
         AND (ul.valid_from IS NULL OR ul.valid_from <= CURRENT_TIMESTAMP)
         AND (ul.valid_until IS NULL OR ul.valid_until >= CURRENT_TIMESTAMP)
         AND cs.origin_type IN (${originPlaceholders})
         ${licenseFilter}
         AND (
           EXISTS (
             SELECT 1 FROM exam_items ei
             INNER JOIN exam_sections es ON es.id = ei.exam_section_id
             INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
             WHERE ei.question_version_id = qv.id
               AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
               AND ev.purpose <> 'FORMAL_ASSESSMENT'
           )
           OR EXISTS (
             SELECT 1 FROM question_group_items qgi
             INNER JOIN exam_items ei ON ei.question_group_id = qgi.group_id
             INNER JOIN exam_sections es ON es.id = ei.exam_section_id
             INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
             WHERE qgi.question_version_id = qv.id
               AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
               AND ev.purpose <> 'FORMAL_ASSESSMENT'
           )
         )
       ORDER BY qv.id, sp.relation_type = 'PRIMARY' DESC, sp.source_id, sp.license_id`,
      values
    );
    const questions = new Map();
    rows.forEach((row) => {
      const current = questions.get(row.id) || {
        id: row.id,
        versionId: row.id,
        questionIdentityId: row.question_id,
        type: row.question_type,
        content: parseJson(row.content_json),
        answerKey: parseJson(row.answer_key_json),
        explanation: parseJson(row.explanation_json),
        points: Number(row.points),
        grade: Number(row.grade),
        subject: row.subject,
        curriculumVersion: row.curriculum_version,
        topicKey: row.topic_key,
        skillKey: row.skill_key,
        difficulty: row.difficulty,
        estimatedSeconds: Number(row.estimated_seconds),
        familyKey: row.family_key || row.question_id,
        options: [],
        provenance: []
      };
      current.provenance.push({
        sourceId: row.source_id,
        licenseId: row.license_id,
        relationType: row.relation_type,
        originType: row.origin_type
      });
      questions.set(row.id, current);
    });
    questions.forEach((question) => {
      const primary = question.provenance.find((item) => item.relationType === 'PRIMARY') || question.provenance[0];
      question.sourceId = primary.sourceId;
      question.licenseId = primary.licenseId;
      question.originType = primary.originType;
      delete question.provenance;
    });
    const questionIds = [...questions.keys()];
    if (questionIds.length === 0) return { units: [], assets: {} };

    const [optionRows] = await this.pool.execute(
      `SELECT id, question_version_id, position, content_json
       FROM question_options
       WHERE question_version_id IN (${placeholders(questionIds)})
       ORDER BY question_version_id, position`,
      questionIds
    );
    optionRows.forEach((row) => questions.get(row.question_version_id).options.push({
      id: row.id,
      content: parseJson(row.content_json)
    }));

    const [groupRows] = await this.pool.execute(
      `SELECT qg.id, qg.selection_policy, qg.stimulus_version_id,
              qgi.question_version_id, qgi.position,
              sv.id AS stimulus_id, sv.title AS stimulus_title, sv.content_json AS stimulus_content_json
       FROM question_groups qg
       INNER JOIN question_group_items qgi ON qgi.group_id = qg.id
       LEFT JOIN stimulus_versions sv
         ON sv.id = qg.stimulus_version_id AND sv.approval_status = 'PUBLISHED'
       WHERE qg.id IN (
         SELECT DISTINCT group_id FROM question_group_items
         WHERE question_version_id IN (${placeholders(questionIds)})
       )
         AND EXISTS (
           SELECT 1 FROM exam_items ei
           INNER JOIN exam_sections es ON es.id = ei.exam_section_id
           INNER JOIN exam_versions ev ON ev.id = es.exam_version_id
           WHERE ei.question_group_id = qg.id
             AND ev.approval_status = 'PUBLISHED' AND ev.exam_mode = 'FIXED'
             AND ev.purpose <> 'FORMAL_ASSESSMENT'
         )
       ORDER BY qg.id, qgi.position`,
      questionIds
    );
    const groups = new Map();
    const membership = new Set();
    groupRows.forEach((row) => {
      const group = groups.get(row.id) || {
        id: row.id,
        selectionPolicy: row.selection_policy,
        stimulusVersionId: row.stimulus_version_id,
        stimulus: row.stimulus_id ? {
          id: row.stimulus_id,
          title: row.stimulus_title,
          content: parseJson(row.stimulus_content_json)
        } : null,
        questionVersionIds: []
      };
      group.questionVersionIds.push(row.question_version_id);
      groups.set(row.id, group);
      if (questions.has(row.question_version_id)) membership.add(row.question_version_id);
    });

    const units = [];
    groups.forEach((group) => {
      if (group.selectionPolicy === 'ATOMIC_ALL') {
        if (group.questionVersionIds.every((id) => questions.has(id))
          && (!group.stimulusVersionId || group.stimulus)) {
          units.push({
            id: `group:${group.id}`,
            selectionPolicy: 'ATOMIC_ALL',
            stimulus: group.stimulus,
            questions: group.questionVersionIds.map((id) => questions.get(id))
          });
        }
        return;
      }
      if (group.selectionPolicy === 'SPLIT_WITH_STIMULUS' && group.stimulus) {
        group.questionVersionIds.filter((id) => questions.has(id)).forEach((id) => units.push({
          id: `group:${group.id}:question:${id}`,
          selectionPolicy: 'SPLIT_WITH_STIMULUS',
          stimulus: group.stimulus,
          questions: [questions.get(id)]
        }));
      }
    });
    questions.forEach((question) => {
      if (!membership.has(question.versionId)) units.push({
        id: `question:${question.versionId}`,
        selectionPolicy: 'DIRECT',
        stimulus: null,
        questions: [question]
      });
    });

    const assetIds = new Set();
    units.forEach((unit) => {
      collectAssetIds(unit.stimulus?.content, assetIds);
      unit.questions.forEach((question) => {
        collectAssetIds(question.content, assetIds);
        collectAssetIds(question.explanation, assetIds);
        question.options.forEach((option) => collectAssetIds(option.content, assetIds));
      });
    });
    const assetIdList = [...assetIds];
    const assetRows = assetIdList.length > 0 ? (await this.pool.execute(
      `SELECT id, mime_type, alt_text FROM media_assets
       WHERE id IN (${placeholders(assetIdList)}) AND approval_status = 'PUBLISHED'`,
      assetIdList
    ))[0] : [];
    if (assetRows.length !== assetIdList.length) {
      throw domainError('MISSING_ASSETS', 'Pool assembly tham chiếu asset thiếu hoặc chưa publish.', 409);
    }
    return {
      units,
      assets: Object.fromEntries(assetRows.map((row) => [row.id, {
        id: row.id,
        url: `/api/catalog/assets/${encodeURIComponent(row.id)}`,
        mimeType: row.mime_type,
        altText: row.alt_text
      }]))
    };
  }

  async createRun(run) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectRun(
        connection,
        'created_by_user_id = ? AND idempotency_key = ?',
        [run.creatorUserId, run.idempotencyKey],
        true
      );
      if (existing) {
        if (existing.requestSha256 !== run.requestSha256) {
          throw domainError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho blueprint hoặc seed khác.');
        }
        await connection.commit();
        return { run: existing, duplicate: true };
      }
      await connection.execute(
        `INSERT INTO assembly_runs
          (id, created_by_user_id, idempotency_key, request_sha256, status,
           blueprint_json, seed, engine_version, selection_sha256,
           selection_manifest_json, source_distribution_json,
           student_snapshot_json, scoring_snapshot_json, snapshot_sha256, created_at)
         VALUES (?, ?, ?, ?, 'SUCCEEDED', CAST(? AS JSON), ?, ?, ?,
                 CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?)`,
        [run.id, run.creatorUserId, run.idempotencyKey, run.requestSha256,
          JSON.stringify(run.blueprint), run.seed, run.engineVersion, run.selectionSha256,
          JSON.stringify(run.selectionManifest), JSON.stringify(run.sourceDistribution),
          JSON.stringify(run.studentSnapshot), JSON.stringify(run.scoringSnapshot),
          run.snapshotSha256, run.createdAt]
      );
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'ASSEMBLY_CREATED', 'ASSEMBLY_RUN', ?, 'SUCCESS', CAST(? AS JSON))`,
        [run.auditId, run.creatorUserId, run.id, JSON.stringify({
          engineVersion: run.engineVersion,
          selectionSha256: run.selectionSha256,
          sourceDistribution: run.sourceDistribution
        })]
      );
      const created = await selectRun(connection, 'id = ? AND created_by_user_id = ?', [run.id, run.creatorUserId]);
      await connection.commit();
      return { run: created, duplicate: false };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const existing = await selectRun(
          connection,
          'created_by_user_id = ? AND idempotency_key = ?',
          [run.creatorUserId, run.idempotencyKey]
        );
        if (existing) {
          if (existing.requestSha256 !== run.requestSha256) {
            throw domainError('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key đã được dùng cho blueprint hoặc seed khác.');
          }
          return { run: existing, duplicate: true };
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}
