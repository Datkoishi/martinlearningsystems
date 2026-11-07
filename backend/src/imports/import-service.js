import { randomUUID } from 'node:crypto';
import { readZipEntries, sha256 } from './package-reader.js';
import { validateExamPackage } from './package-validator.js';
import { buildReviewerPreview, findPackageAsset } from './reviewer-preview.js';
import { buildPublicationPlan } from './package-publication.js';

const publicJob = (job, duplicate = false) => ({
  id: job.id,
  packageId: job.packageId,
  packageSha256: job.packageSha256,
  status: job.status,
  schemaVersion: job.schemaVersion,
  createdByUserId: job.createdByUserId,
  duplicate,
  report: job.report,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt
});

const reviewerVisibleStatuses = new Set([
  'READY_FOR_REVIEW',
  'TECHNICALLY_APPROVED',
  'ACADEMICALLY_APPROVED',
  'ACADEMICALLY_REJECTED',
  'REJECTED',
  'PUBLISHED'
]);

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};

export const hashValidationReport = (report) => sha256(Buffer.from(JSON.stringify(canonicalJson(report))));

const importError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

export class ImportService {
  constructor({ repository, storage }) {
    this.repository = repository;
    this.storage = storage;
  }

  async stage(zipBuffer, actor = null) {
    const packageSha256 = sha256(zipBuffer);
    const files = await readZipEntries(zipBuffer);
    const report = validateExamPackage(files, packageSha256);
    const existing = await this.repository.findByPackageHash(report.packageId, packageSha256);
    if (existing) return publicJob(existing, true);

    const id = randomUUID();
    const sourceStorageKey = await this.storage.storeOriginal(id, zipBuffer);
    await this.storage.storeReport(id, report);
    try {
      const created = await this.repository.create({
        id,
        packageId: report.packageId,
        packageSha256,
        status: report.status,
        schemaVersion: report.schemaVersion,
        sourceStorageKey,
        createdByUserId: actor?.user?.id || null,
        auditId: randomUUID(),
        report
      });
      return publicJob(created);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        const duplicate = await this.repository.findByPackageHash(report.packageId, packageSha256);
        if (duplicate) return publicJob(duplicate, true);
      }
      throw error;
    }
  }

  async getById(id) {
    const job = await this.repository.findById(id);
    return job ? publicJob(job) : null;
  }

  async getReviewerPreview(id) {
    const job = await this.repository.findById(id);
    if (!job) return null;
    if (!reviewerVisibleStatuses.has(job.status) || job.report?.errors?.length) {
      const error = new Error('Gói đề chưa qua kiểm tra kỹ thuật nên không thể preview.');
      error.code = 'IMPORT_NOT_PREVIEWABLE';
      error.statusCode = 409;
      throw error;
    }
    const files = await readZipEntries(await this.storage.readOriginal(id));
    return {
      job: publicJob(job),
      preview: buildReviewerPreview(files, id),
      reviews: await this.repository.listReviews(id),
      publication: this.repository.findPublicationByJob ? await this.repository.findPublicationByJob(id) : null
    };
  }

  async getAsset(id, assetId) {
    const job = await this.repository.findById(id);
    if (!job || !reviewerVisibleStatuses.has(job.status) || job.report?.errors?.length) return null;
    const files = await readZipEntries(await this.storage.readOriginal(id));
    return findPackageAsset(files, assetId);
  }

  async createTechnicalReview({ importJobId, reviewerId, decision, reason }) {
    const job = await this.repository.findById(importJobId);
    if (!job) return null;
    const validationReportSha256 = hashValidationReport(job.report);
    const review = await this.repository.createTechnicalReview({
      id: randomUUID(),
      importJobId,
      reviewerId,
      decision,
      reason,
      validationReportSha256,
      packageSha256: job.packageSha256,
      auditId: randomUUID()
    });
    return {
      review,
      job: publicJob(await this.repository.findById(importJobId))
    };
  }

  async createAcademicReview({ importJobId, reviewerId, decision, reason }) {
    const job = await this.repository.findById(importJobId);
    if (!job) return null;
    const review = await this.repository.createAcademicReview({
      id: randomUUID(),
      importJobId,
      reviewerId,
      decision,
      reason,
      validationReportSha256: hashValidationReport(job.report),
      packageSha256: job.packageSha256,
      auditId: randomUUID()
    });
    return {
      review,
      job: publicJob(await this.repository.findById(importJobId))
    };
  }

  async publish(importJobId, publisherId) {
    const job = await this.repository.findById(importJobId);
    if (!job) return null;
    const source = await this.storage.readOriginal(importJobId);
    const actualPackageSha256 = sha256(source);
    if (actualPackageSha256 !== job.packageSha256) {
      throw importError('PACKAGE_HASH_CHANGED', 'Source ZIP không còn khớp hash đã review.');
    }
    const files = await readZipEntries(source);
    const report = validateExamPackage(files, actualPackageSha256);
    if (report.errors.length > 0) {
      throw importError('PACKAGE_REVALIDATION_FAILED', 'Package không còn vượt qua validation trước publish.');
    }
    const validationReportSha256 = hashValidationReport(report);
    if (validationReportSha256 !== hashValidationReport(job.report)) {
      throw importError('VALIDATION_REPORT_CHANGED', 'Validation report đã thay đổi sau approval.');
    }
    const plan = buildPublicationPlan({ files, importJob: job });
    if (plan.exam.purpose === 'FORMAL_ASSESSMENT') {
      throw importError('FORMAL_ASSESSMENT_DISABLED', 'Publish FORMAL_ASSESSMENT đang bị khóa cho đến khi có formal approval policy.');
    }
    const result = await this.repository.publishImport({
      plan,
      publisherId,
      validationReportSha256,
      auditId: randomUUID(),
      publishedAt: new Date()
    });
    return {
      ...result,
      job: publicJob(await this.repository.findById(importJobId))
    };
  }

  async listReviews(id) {
    const job = await this.repository.findById(id);
    if (!job) return null;
    return this.repository.listReviews(id);
  }
}
