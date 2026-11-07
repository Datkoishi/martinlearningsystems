const mapRow = (row) => row && ({
  id: row.id,
  packageId: row.package_id,
  packageSha256: row.package_sha256,
  status: row.status,
  schemaVersion: row.schema_version,
  sourceStorageKey: row.source_storage_key,
  createdByUserId: row.created_by_user_id,
  report: typeof row.validation_report_json === 'string' ? JSON.parse(row.validation_report_json) : row.validation_report_json,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapPublication = (row) => row && ({
  id: row.id,
  importJobId: row.import_job_id,
  examVersionId: row.exam_version_id,
  publishedByUserId: row.published_by_user_id,
  packageSha256: row.package_sha256,
  validationReportSha256: row.validation_report_sha256,
  publishedAt: row.published_at
});

const domainError = (code, message, statusCode) => Object.assign(new Error(message), { code, statusCode });

const findPublication = async (executor, importJobId) => {
  const [rows] = await executor.execute(
    `SELECT id, import_job_id, exam_version_id, published_by_user_id,
            package_sha256, validation_report_sha256, published_at
     FROM import_publications
     WHERE import_job_id = ?
     LIMIT 1`,
    [importJobId]
  );
  return mapPublication(rows[0]);
};

const ensureExam = async (connection, exam, sourceId) => {
  await connection.execute(
    `INSERT INTO exams (id, source_id, stable_key)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE stable_key = VALUES(stable_key)`,
    [exam.identityId, sourceId, exam.stableKey]
  );
  const [rows] = await connection.execute('SELECT id FROM exams WHERE stable_key = ? FOR UPDATE', [exam.stableKey]);
  return rows[0].id;
};

const ensureQuestion = async (connection, question) => {
  await connection.execute(
    `INSERT INTO questions (id, stable_key)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE stable_key = VALUES(stable_key)`,
    [question.identityId, question.stableKey]
  );
  const [rows] = await connection.execute('SELECT id FROM questions WHERE stable_key = ? FOR UPDATE', [question.stableKey]);
  return rows[0].id;
};

const ensureStimulus = async (connection, stimulus) => {
  await connection.execute(
    `INSERT INTO stimuli (id, stable_key)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE stable_key = VALUES(stable_key)`,
    [stimulus.identityId, stimulus.stableKey]
  );
  const [rows] = await connection.execute('SELECT id FROM stimuli WHERE stable_key = ? FOR UPDATE', [stimulus.stableKey]);
  return rows[0].id;
};

const nextVersionNumber = async (connection, table, identityColumn, identityId) => {
  const allowed = new Set(['exam_versions:exam_id', 'question_versions:question_id', 'stimulus_versions:stimulus_id']);
  if (!allowed.has(`${table}:${identityColumn}`)) throw new Error('Version target không hợp lệ.');
  const [rows] = await connection.execute(
    `SELECT version_number FROM ${table} WHERE ${identityColumn} = ? ORDER BY version_number DESC LIMIT 1 FOR UPDATE`,
    [identityId]
  );
  return (rows[0]?.version_number || 0) + 1;
};

export class MysqlImportRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findByPackageHash(packageId, packageSha256) {
    const [rows] = await this.pool.execute(
      `SELECT id, package_id, package_sha256, status, schema_version, source_storage_key, created_by_user_id,
              validation_report_json, created_at, updated_at
       FROM import_jobs
       WHERE package_id = ? AND package_sha256 = ?
       LIMIT 1`,
      [packageId, packageSha256]
    );
    return mapRow(rows[0]);
  }

  async findById(id) {
    const [rows] = await this.pool.execute(
      `SELECT id, package_id, package_sha256, status, schema_version, source_storage_key, created_by_user_id,
              validation_report_json, created_at, updated_at
       FROM import_jobs
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return mapRow(rows[0]);
  }

  async create(job) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO import_jobs
          (id, package_id, package_sha256, status, schema_version, source_storage_key,
           created_by_user_id, validation_report_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
        [job.id, job.packageId, job.packageSha256, job.status, job.schemaVersion, job.sourceStorageKey, job.createdByUserId, JSON.stringify(job.report)]
      );
      if (job.createdByUserId) {
        await connection.execute(
          `INSERT INTO audit_logs
            (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
           VALUES (?, ?, 'IMPORT_STAGED', 'IMPORT_JOB', ?, 'SUCCESS', CAST(? AS JSON))`,
          [job.auditId, job.createdByUserId, job.id, JSON.stringify({ packageId: job.packageId, status: job.status })]
        );
      }
      await connection.commit();
      return this.findById(job.id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listReviews(importJobId) {
    const [rows] = await this.pool.execute(
      `SELECT id, import_job_id, reviewer_id, review_scope, decision, reason,
              validation_report_sha256, package_sha256, actor_source, created_at
       FROM import_reviews
       WHERE import_job_id = ?
       ORDER BY created_at ASC`,
      [importJobId]
    );
    return rows.map((row) => ({
      id: row.id,
      importJobId: row.import_job_id,
      reviewerId: row.reviewer_id,
      scope: row.review_scope,
      decision: row.decision,
      reason: row.reason,
      validationReportSha256: row.validation_report_sha256,
      packageSha256: row.package_sha256,
      actorSource: row.actor_source,
      createdAt: row.created_at
    }));
  }

  async createTechnicalReview(review) {
    return this.createReview(review, {
      scope: 'TECHNICAL',
      expectedStatus: 'READY_FOR_REVIEW',
      approvedStatus: 'TECHNICALLY_APPROVED',
      rejectedStatus: 'REJECTED',
      eventType: 'IMPORT_TECHNICAL_REVIEW'
    });
  }

  async createAcademicReview(review) {
    return this.createReview(review, {
      scope: 'ACADEMIC',
      expectedStatus: 'TECHNICALLY_APPROVED',
      approvedStatus: 'ACADEMICALLY_APPROVED',
      rejectedStatus: 'ACADEMICALLY_REJECTED',
      eventType: 'IMPORT_ACADEMIC_REVIEW'
    });
  }

  async createReview(review, policy) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT status, created_by_user_id, package_sha256 FROM import_jobs WHERE id = ? FOR UPDATE',
        [review.importJobId]
      );
      if (!rows[0]) {
        throw domainError('IMPORT_NOT_FOUND', 'Không tìm thấy import job.', 404);
      }
      if (rows[0].status !== policy.expectedStatus) {
        throw domainError('IMPORT_NOT_REVIEWABLE', `Import job không ở trạng thái ${policy.expectedStatus}.`, 409);
      }
      if (rows[0].created_by_user_id && rows[0].created_by_user_id === review.reviewerId) {
        throw domainError('SELF_REVIEW_FORBIDDEN', 'Người nhập package không được tự review package đó.', 409);
      }
      if (rows[0].package_sha256 !== review.packageSha256) throw domainError('PACKAGE_HASH_CHANGED', 'Hash package không khớp review.', 409);
      await connection.execute(
        `INSERT INTO import_reviews
          (id, import_job_id, reviewer_id, review_scope, decision, reason,
           validation_report_sha256, package_sha256, actor_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AUTHENTICATED_USER')`,
        [review.id, review.importJobId, review.reviewerId, policy.scope, review.decision, review.reason,
          review.validationReportSha256, review.packageSha256]
      );
      const nextStatus = review.decision === 'APPROVE' ? policy.approvedStatus : policy.rejectedStatus;
      await connection.execute('UPDATE import_jobs SET status = ? WHERE id = ?', [nextStatus, review.importJobId]);
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, ?, 'IMPORT_JOB', ?, 'SUCCESS', CAST(? AS JSON))`,
        [review.auditId, review.reviewerId, policy.eventType, review.importJobId,
          JSON.stringify({ scope: policy.scope, decision: review.decision, status: nextStatus })]
      );
      await connection.commit();
      return { ...review, scope: policy.scope, actorSource: 'AUTHENTICATED_USER', status: nextStatus };
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        throw domainError('REVIEW_ALREADY_RECORDED', `Import job đã có quyết định ${policy.scope} bất biến.`, 409);
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async findPublicationByJob(importJobId) {
    return findPublication(this.pool, importJobId);
  }

  async publishImport({ plan, publisherId, validationReportSha256, auditId, publishedAt }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [jobRows] = await connection.execute(
        `SELECT status, package_sha256, validation_report_json
         FROM import_jobs
         WHERE id = ?
         FOR UPDATE`,
        [plan.importJobId]
      );
      if (!jobRows[0]) throw domainError('IMPORT_NOT_FOUND', 'Không tìm thấy import job.', 404);
      if (jobRows[0].status === 'PUBLISHED') {
        const existing = await findPublication(connection, plan.importJobId);
        await connection.commit();
        return { publication: existing, duplicate: true };
      }
      if (jobRows[0].status !== 'ACADEMICALLY_APPROVED') {
        throw domainError('IMPORT_NOT_PUBLISHABLE', 'Package chưa được phê duyệt học thuật.', 409);
      }
      if (jobRows[0].package_sha256 !== plan.packageSha256) {
        throw domainError('PACKAGE_HASH_CHANGED', 'Source package đã thay đổi sau review.', 409);
      }
      const [approvalRows] = await connection.execute(
        `SELECT id FROM import_reviews
         WHERE import_job_id = ? AND review_scope = 'ACADEMIC' AND decision = 'APPROVE'
           AND package_sha256 = ? AND validation_report_sha256 = ?
         FOR UPDATE`,
        [plan.importJobId, plan.packageSha256, validationReportSha256]
      );
      if (!approvalRows[0]) throw domainError('ACADEMIC_APPROVAL_MISMATCH', 'Academic approval không khớp package/report hiện tại.', 409);

      await connection.execute(
        `INSERT INTO content_sources (id, name, origin_type, generator_metadata)
         VALUES (?, ?, ?, CAST(? AS JSON))`,
        [plan.source.id, plan.source.name, plan.source.originType, JSON.stringify(plan.source.generatorMetadata)]
      );
      await connection.execute(
        `INSERT INTO usage_licenses
          (id, source_id, label, publish_fixed, extract_reuse, derivative_assembly)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [plan.license.id, plan.source.id, plan.license.label, plan.license.publishFixed,
          plan.license.extractReuse, plan.license.derivativeAssembly]
      );

      for (const asset of plan.assets) {
        await connection.execute(
          `INSERT INTO media_assets
            (id, storage_key, mime_type, sha256, size_bytes, alt_text, approval_status, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, 'PUBLISHED', CAST(? AS JSON))`,
          [asset.id, asset.storageKey, asset.mimeType, asset.sha256, asset.sizeBytes, asset.altText, JSON.stringify(asset.metadata)]
        );
      }

      for (const stimulus of plan.stimuli) {
        const stimulusId = await ensureStimulus(connection, stimulus);
        const versionNumber = await nextVersionNumber(connection, 'stimulus_versions', 'stimulus_id', stimulusId);
        await connection.execute(
          `INSERT INTO stimulus_versions
            (id, stimulus_id, version_number, title, content_json, schema_version, approval_status)
           VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, 'PUBLISHED')`,
          [stimulus.versionId, stimulusId, versionNumber, stimulus.title, JSON.stringify(stimulus.content), stimulus.content.schemaVersion]
        );
      }

      for (const question of plan.questions) {
        const questionId = await ensureQuestion(connection, question);
        const versionNumber = await nextVersionNumber(connection, 'question_versions', 'question_id', questionId);
        await connection.execute(
          `INSERT INTO question_versions
            (id, question_id, version_number, question_type, content_json, answer_key_json,
             explanation_json, points, grade, subject, curriculum_version, topic_key, skill_key,
             difficulty, estimated_seconds, family_key, schema_version, approval_status)
           VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')`,
          [question.versionId, questionId, versionNumber, question.type, JSON.stringify(question.content),
            JSON.stringify(question.answerKey), JSON.stringify(question.explanation), question.points,
            question.grade, question.subject, question.curriculumVersion, question.topicKey,
            question.skillKey, question.difficulty, question.estimatedSeconds, question.familyKey,
            question.content.schemaVersion]
        );
        for (const option of question.options) {
          await connection.execute(
            `INSERT INTO question_options
              (id, question_version_id, option_key, position, content_json)
             VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
            [option.id, question.versionId, option.optionKey, option.position, JSON.stringify(option.content)]
          );
        }
        await connection.execute(
          `INSERT INTO source_provenance (question_version_id, source_id, license_id, relation_type)
           VALUES (?, ?, ?, 'PRIMARY')`,
          [question.versionId, plan.source.id, plan.license.id]
        );
      }

      for (const group of plan.groups) {
        await connection.execute(
          `INSERT INTO question_groups
            (id, stable_key, stimulus_version_id, selection_policy)
           VALUES (?, ?, ?, ?)`,
          [group.id, group.stableKey, group.stimulusVersionId, group.selectionPolicy]
        );
        for (const [index, questionVersionId] of group.questionVersionIds.entries()) {
          await connection.execute(
            `INSERT INTO question_group_items (group_id, question_version_id, position)
             VALUES (?, ?, ?)`,
            [group.id, questionVersionId, index + 1]
          );
        }
      }

      const examId = await ensureExam(connection, plan.exam, plan.source.id);
      const examVersionNumber = await nextVersionNumber(connection, 'exam_versions', 'exam_id', examId);
      await connection.execute(
        `INSERT INTO exam_versions
          (id, exam_id, version_number, title, description, exam_mode, purpose, approval_status,
           grade, subject, duration_minutes, schema_version, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?)`,
        [plan.exam.versionId, examId, examVersionNumber, plan.exam.title, plan.exam.description,
          plan.exam.mode, plan.exam.purpose, plan.exam.grade, plan.exam.subject,
          plan.exam.durationMinutes, plan.exam.schemaVersion, publishedAt]
      );
      for (const section of plan.exam.sections) {
        await connection.execute(
          `INSERT INTO exam_sections
            (id, exam_version_id, position, title, instruction_json)
           VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
          [section.id, plan.exam.versionId, section.position, section.title, JSON.stringify(section.instruction)]
        );
        for (const item of section.items) {
          await connection.execute(
            `INSERT INTO exam_items
              (id, exam_section_id, position, question_version_id, question_group_id)
             VALUES (?, ?, ?, ?, ?)`,
            [item.id, section.id, item.position, item.questionVersionId, item.questionGroupId]
          );
        }
      }

      for (const reference of plan.assetReferences) {
        await connection.execute(
          `INSERT INTO asset_references
            (asset_id, owner_type, owner_id, json_path)
           VALUES (?, ?, ?, ?)`,
          [reference.assetId, reference.ownerType, reference.ownerId, reference.jsonPath]
        );
      }

      await connection.execute(
        `INSERT INTO import_publications
          (id, import_job_id, exam_version_id, published_by_user_id,
           package_sha256, validation_report_sha256, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [plan.publicationId, plan.importJobId, plan.exam.versionId, publisherId,
          plan.packageSha256, validationReportSha256, publishedAt]
      );
      await connection.execute('UPDATE import_jobs SET status = \'PUBLISHED\' WHERE id = ?', [plan.importJobId]);
      await connection.execute(
        `INSERT INTO audit_logs
          (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
         VALUES (?, ?, 'IMPORT_PUBLISHED', 'IMPORT_JOB', ?, 'SUCCESS', CAST(? AS JSON))`,
        [auditId, publisherId, plan.importJobId, JSON.stringify({
          examVersionId: plan.exam.versionId,
          packageSha256: plan.packageSha256,
          versionNumber: examVersionNumber
        })]
      );
      await connection.commit();
      return { publication: await findPublication(this.pool, plan.importJobId), duplicate: false };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
