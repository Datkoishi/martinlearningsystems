import { sha256 } from '../imports/package-reader.js';
import { toStudentExam } from '../domain/exam-presentation.js';

const catalogError = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

export class CatalogService {
  constructor({ repository, storage }) {
    this.repository = repository;
    this.storage = storage;
  }

  async listPublishedFixed() {
    return this.repository.listPublishedFixed();
  }

  async getPublishedFixed(examVersionId) {
    const exam = await this.repository.findPublishedFixed(examVersionId);
    return exam ? toStudentExam(exam) : null;
  }

  async getAttemptSnapshots(examVersionId) {
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
    const asset = await this.repository.findPublishedAsset(assetId);
    if (!asset) return null;
    const data = await this.storage.readArchiveEntry(asset.storageKey);
    if (!data || data.length !== asset.sizeBytes || sha256(data) !== asset.sha256) {
      throw catalogError('PUBLISHED_ASSET_INTEGRITY_FAILED', 'Asset đã publish không còn khớp size/hash.', 500);
    }
    return { data, mimeType: asset.mimeType, altText: asset.altText };
  }
}
