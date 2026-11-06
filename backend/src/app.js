import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { checkDatabase } from './db.js';
import { config } from './config.js';
import { demoFixedExam } from './domain/demo-exam.js';
import { toStudentExam } from './domain/exam-presentation.js';
import { importService as defaultImportService } from './imports/index.js';
import { PackageReadError } from './imports/package-reader.js';
import { authService as defaultAuthService } from './auth/index.js';
import { ROLE } from './auth/auth-service.js';
import {
  clearAuthCookies,
  createAuthenticate,
  createLoginRateLimiter,
  createRequireCsrf,
  requireRoles,
  setAuthCookies
} from './auth/http-auth.js';

export const getApiInfo = () => ({
  message: 'Martin Learning Systems API'
});

export const getHealthStatus = async (databaseCheck = checkDatabase) => {
  await databaseCheck();
  return { status: 'ok', database: 'connected' };
};

export const getDemoStudentExam = () => toStudentExam(demoFixedExam);

const validImportId = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);

export const createApp = ({
  databaseCheck = checkDatabase,
  importService = defaultImportService,
  authService = defaultAuthService,
  importsEnabled = config.importApiEnabled
} = {}) => {
  const app = express();
  const authenticate = createAuthenticate(authService);
  const requireCsrf = createRequireCsrf(authService);
  const importEnabled = (_request, response, next) => importsEnabled
    ? next()
    : response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
  const editorOnly = requireRoles(ROLE.CONTENT_EDITOR, ROLE.SUPER_ADMIN);
  const reviewerOnly = requireRoles(ROLE.ACADEMIC_REVIEWER, ROLE.SUPER_ADMIN);
  const editorOrReviewer = requireRoles(ROLE.CONTENT_EDITOR, ROLE.ACADEMIC_REVIEWER, ROLE.SUPER_ADMIN);

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));

  app.post('/api/imports', importEnabled, authenticate, editorOnly, requireCsrf, express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '25mb' }), async (request, response, next) => {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      return response.status(415).json({ code: 'ZIP_REQUIRED', message: 'Gửi ZIP bằng Content-Type application/zip.' });
    }
    try {
      const result = await importService.stage(request.body, request.auth);
      return response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/auth/login', createLoginRateLimiter(), async (request, response, next) => {
    const { email, password } = request.body || {};
    if (typeof email !== 'string' || email.length > 320 || typeof password !== 'string' || password.length > 256) {
      return response.status(400).json({ code: 'INVALID_LOGIN_INPUT', message: 'Email hoặc mật khẩu không hợp lệ.' });
    }
    try {
      const login = await authService.login({
        email,
        password,
        userAgent: request.get('user-agent'),
        ipAddress: request.ip
      });
      setAuthCookies(response, login, config.cookieSecure);
      response.set('Cache-Control', 'no-store');
      return response.json({ user: login.user, expiresAt: login.expiresAt });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', authenticate, (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ user: request.auth.user, expiresAt: request.auth.expiresAt });
  });

  app.post('/api/auth/logout', authenticate, requireCsrf, async (request, response, next) => {
    try {
      await authService.logout(request.auth);
      clearAuthCookies(response, config.cookieSecure);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

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

  app.get('/api/imports/:id', importEnabled, authenticate, editorOrReviewer, async (request, response, next) => {
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    try {
      const job = await importService.getById(request.params.id);
      if (!job) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      return response.json(job);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/imports/:id/preview', importEnabled, authenticate, reviewerOnly, async (request, response, next) => {
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

  app.get('/api/imports/:id/assets/:assetId', importEnabled, authenticate, reviewerOnly, async (request, response, next) => {
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

  app.get('/api/imports/:id/reviews', importEnabled, authenticate, reviewerOnly, async (request, response, next) => {
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

  app.post('/api/imports/:id/reviews', importEnabled, authenticate, reviewerOnly, requireCsrf, async (request, response, next) => {
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    const { decision, reason } = request.body || {};
    if (!['APPROVE', 'REJECT'].includes(decision)) return response.status(400).json({ code: 'INVALID_REVIEW_DECISION', message: 'Decision phải là APPROVE hoặc REJECT.' });
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
      return response.status(400).json({ code: 'INVALID_REVIEW_REASON', message: 'Lý do review cần từ 10 đến 1000 ký tự.' });
    }
    try {
      const result = await importService.createTechnicalReview({
        importJobId: request.params.id,
        reviewerId: request.auth.user.id,
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
