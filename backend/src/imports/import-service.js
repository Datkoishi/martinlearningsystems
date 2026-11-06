import { randomUUID } from 'node:crypto';
import { readZipEntries, sha256 } from './package-reader.js';
import { validateExamPackage } from './package-validator.js';

const publicJob = (job, duplicate = false) => ({
  id: job.id,
  packageId: job.packageId,
  packageSha256: job.packageSha256,
  status: job.status,
  schemaVersion: job.schemaVersion,
  duplicate,
  report: job.report,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt
});

export class ImportService {
  constructor({ repository, storage }) {
    this.repository = repository;
    this.storage = storage;
  }

  async stage(zipBuffer) {
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
}
