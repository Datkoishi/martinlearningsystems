import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { checkDatabase } from './db.js';
import { config } from './config.js';
import { demoFixedExam } from './domain/demo-exam.js';
import { toStudentExam } from './domain/exam-presentation.js';
import { importService as defaultImportService } from './imports/index.js';
import { PackageReadError } from './imports/package-reader.js';

export const getApiInfo = () => ({
  message: 'Martin Learning Systems API'
});

export const getHealthStatus = async (databaseCheck = checkDatabase) => {
  await databaseCheck();
  return { status: 'ok', database: 'connected' };
};

export const getDemoStudentExam = () => toStudentExam(demoFixedExam);

const validImportId = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const validActorId = (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(value || '');

export const createApp = ({
  databaseCheck = checkDatabase,
  importService = defaultImportService,
  importsEnabled = config.importApiEnabled
} = {}) => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));

  app.post('/api/imports', express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '25mb' }), async (request, response, next) => {
    if (!importsEnabled) return response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      return response.status(415).json({ code: 'ZIP_REQUIRED', message: 'Gửi ZIP bằng Content-Type application/zip.' });
    }
    try {
      const result = await importService.stage(request.body);
      return response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api', (_request, response) => {
    response.json(getApiInfo());
  });

  app.get('/api/health', async (_request, response) => {
    try {
      response.json(await getHealthStatus(databaseCheck));
    } catch (error) {
      response.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        message: config.nodeEnv === 'development' ? error.message : undefined
      });
    }
  });

  app.get('/api/exams/demo-fixed', (_request, response) => {
    response.json(getDemoStudentExam());
  });

  app.get('/api/imports/:id', async (request, response, next) => {
    if (!importsEnabled) return response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    try {
      const job = await importService.getById(request.params.id);
      if (!job) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      return response.json(job);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/imports/:id/preview', async (request, response, next) => {
    if (!importsEnabled) return response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    try {
      const preview = await importService.getReviewerPreview(request.params.id);
      if (!preview) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      response.set('Cache-Control', 'no-store');
      return response.json(preview);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/imports/:id/assets/:assetId', async (request, response, next) => {
    if (!importsEnabled) return response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
    if (!validImportId(request.params.id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(request.params.assetId)) {
      return response.status(400).json({ code: 'INVALID_ASSET_REQUEST', message: 'Import job hoặc asset id không hợp lệ.' });
    }
    try {
      const asset = await importService.getAsset(request.params.id, request.params.assetId);
      if (!asset) return response.status(404).json({ code: 'ASSET_NOT_FOUND', message: 'Không tìm thấy asset trong package.' });
      response.set({
        'Cache-Control': 'no-store',
        'Content-Type': asset.mimeType,
        'Content-Length': String(asset.data.length),
        'Content-Disposition': 'inline'
      });
      return response.send(asset.data);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/imports/:id/reviews', async (request, response, next) => {
    if (!importsEnabled) return response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    try {
      const reviews = await importService.listReviews(request.params.id);
      if (!reviews) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      response.set('Cache-Control', 'no-store');
      return response.json({ reviews });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/imports/:id/reviews', async (request, response, next) => {
    if (!importsEnabled) return response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    const reviewerId = request.get('x-reviewer-id');
    const { decision, reason } = request.body || {};
    if (!validActorId(reviewerId)) return response.status(400).json({ code: 'INVALID_REVIEWER_ID', message: 'Development reviewer id không hợp lệ.' });
    if (!['APPROVE', 'REJECT'].includes(decision)) return response.status(400).json({ code: 'INVALID_REVIEW_DECISION', message: 'Decision phải là APPROVE hoặc REJECT.' });
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
      return response.status(400).json({ code: 'INVALID_REVIEW_REASON', message: 'Lý do review cần từ 10 đến 1000 ký tự.' });
    }
    try {
      const result = await importService.createTechnicalReview({
        importJobId: request.params.id,
        reviewerId,
        decision,
        reason: reason.trim()
      });
      if (!result) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      response.set('Cache-Control', 'no-store');
      return response.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found' });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof PackageReadError) return response.status(error.statusCode).json({ code: error.code, message: error.message });
    if (error?.type === 'entity.too.large') return response.status(413).json({ code: 'PACKAGE_TOO_LARGE', message: 'ZIP vượt quá giới hạn tải lên 25 MiB.' });
    if (error?.statusCode && error?.code) return response.status(error.statusCode).json({ code: error.code, message: error.message });
    return response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu.' });
  });

  return app;
};
