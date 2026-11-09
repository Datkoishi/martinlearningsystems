import crypto from 'node:crypto';
import { sha256 } from '../imports/package-reader.js';
import { toStudentExam } from '../domain/exam-presentation.js';

const catalogError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};
const snapshotHash = (studentSnapshot, scoringSnapshot) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalJson({ scoringSnapshot, studentSnapshot })))
  .digest('hex');

const assertAssembledIntegrity = (record) => {
  if (snapshotHash(record.studentSnapshot, record.scoringSnapshot) !== record.snapshotSha256
    || record.studentSnapshot.id !== record.id
    || record.studentSnapshot.versionId !== record.id
    || record.studentSnapshot.mode !== 'ASSEMBLED'
    || record.studentSnapshot.approvalStatus !== 'PUBLISHED'
    || record.studentSnapshot.purpose !== record.purpose
    || record.studentSnapshot.title !== record.title
    || record.scoringSnapshot.examVersionId !== record.id) {
    throw catalogError('PUBLISHED_ASSEMBLY_INTEGRITY_FAILED', 'Published assembly snapshot không còn toàn vẹn.', 500);
  }
};

export class CatalogService {
  constructor({ repository, storage }) {
    this.repository = repository;
    this.storage = storage;
  }

  async listPublished() {
    return this.repository.listPublished();
  }

  async listPublishedFixed() {
    return this.repository.listPublishedFixed();
  }

  async getPublished(examVersionId) {
    const mode = await this.repository.findPublishedMode(examVersionId);
    if (mode === 'ASSEMBLED') {
      const record = await this.repository.findPublishedAssembled(examVersionId);
      if (!record) return null;
      assertAssembledIntegrity(record);
      return structuredClone(record.studentSnapshot);
    }
    if (mode !== 'FIXED') return null;
    const exam = await this.repository.findPublishedFixed(examVersionId);
    return exam ? toStudentExam(exam) : null;
  }

  async getPublishedFixed(examVersionId) {
    const exam = await this.repository.findPublishedFixed(examVersionId);
    return exam ? toStudentExam(exam) : null;
  }

  async getAttemptSnapshots(examVersionId) {
    const mode = await this.repository.findPublishedMode(examVersionId);
    if (mode === 'ASSEMBLED') {
      const record = await this.repository.findPublishedAssembled(examVersionId);
      if (!record) return null;
      assertAssembledIntegrity(record);
      return {
        studentSnapshot: structuredClone(record.studentSnapshot),
        scoringSnapshot: structuredClone(record.scoringSnapshot)
      };
    }
    if (mode !== 'FIXED') return null;
    const exam = await this.repository.findPublishedFixed(examVersionId);
    if (!exam) return null;
    if (exam.purpose === 'FORMAL_ASSESSMENT') {
      throw catalogError('FORMAL_ASSESSMENT_DISABLED', 'Không thể tạo attempt cho formal assessment chưa có policy.');
    }
    const studentSnapshot = toStudentExam(exam);
    const scoringSnapshot = {
      schemaVersion: '1.0.0',
      examVersionId: exam.versionId,
      questions: exam.sections.flatMap((section) => section.groups.flatMap((group) => (
        group.questions.map((question) => ({
          questionVersionId: question.versionId,
          type: question.type,
          points: question.points,
          optionIds: question.options.map((option) => option.id),
          answerKey: question.answerKey
        }))
      )))
    };
    return { studentSnapshot, scoringSnapshot };
  }

  async getPublishedAsset(assetId) {
    const fixedAsset = await this.repository.findPublishedAsset(assetId);
    if (fixedAsset) return this.readAsset(fixedAsset);
    const assembled = await this.repository.findPublishedAssembledAsset(assetId);
    if (!assembled) return null;
    assertAssembledIntegrity(assembled.publication);
    return this.readAsset(assembled.asset);
  }

  async getProtectedPublishedAsset(assetId) {
    const asset = await this.repository.findAnyPublishedAsset(assetId);
    return this.readAsset(asset);
  }

  async readAsset(asset) {
    if (!asset) return null;
    const data = this.storage.readPublishedAsset
      ? await this.storage.readPublishedAsset(asset)
      : await this.storage.readArchiveEntry(asset.storageKey);
    if (!data || data.length !== asset.sizeBytes || sha256(data) !== asset.sha256) {
      throw catalogError('PUBLISHED_ASSET_INTEGRITY_FAILED', 'Asset đã publish không còn khớp size/hash.', 500);
    }
    return { data, mimeType: asset.mimeType, altText: asset.altText };
  }
}
