import { randomUUID } from 'node:crypto';
import { readZipEntries, sha256 } from './package-reader.js';
import { validateExamPackage } from './package-validator.js';
import { buildReviewerPreview, findPackageAsset } from './reviewer-preview.js';

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

const reviewerVisibleStatuses = new Set(['READY_FOR_REVIEW', 'TECHNICALLY_APPROVED', 'REJECTED']);

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
      reviews: await this.repository.listReviews(id)
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
    const validationReportSha256 = sha256(Buffer.from(JSON.stringify(job.report)));
    const review = await this.repository.createTechnicalReview({
      id: randomUUID(),
      importJobId,
      reviewerId,
      decision,
      reason,
      validationReportSha256,
      auditId: randomUUID()
    });
    return {
      review,
      job: publicJob(await this.repository.findById(importJobId))
    };
  }

  async listReviews(id) {
    const job = await this.repository.findById(id);
    if (!job) return null;
    return this.repository.listReviews(id);
  }
}
