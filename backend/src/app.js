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
import { catalogService as defaultCatalogService } from './catalog/index.js';
import { attemptService as defaultAttemptService } from './attempts/index.js';
import { assemblyService as defaultAssemblyService } from './assembly/index.js';
import { assessmentService as defaultAssessmentService } from './assessment/index.js';
import { ROLE } from './auth/auth-service.js';
import {
  createHttpMetricsMiddleware,
  metricsRegistry as defaultMetricsRegistry
} from './operations/metrics.js';
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

export const getLivenessStatus = () => ({ status: 'ok' });

export const getHealthStatus = async (databaseCheck = checkDatabase) => {
  await databaseCheck();
  return { status: 'ok', database: 'connected' };
};

export const getReadinessStatus = async (databaseCheck = checkDatabase, readinessCheck = () => true) => {
  if (!readinessCheck()) throw Object.assign(new Error('Service đang dừng nhận traffic.'), { code: 'SERVICE_DRAINING' });
  await databaseCheck();
  return { status: 'ready', database: 'connected' };
};

export const getDemoStudentExam = () => toStudentExam(demoFixedExam);

const validImportId = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const validUuid = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const validIdempotencyKey = (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(value || '');

export const createApp = ({
  databaseCheck = checkDatabase,
  importService = defaultImportService,
  authService = defaultAuthService,
  catalogService = defaultCatalogService,
  attemptService = defaultAttemptService,
  assemblyService = defaultAssemblyService,
  assessmentService = defaultAssessmentService,
  importsEnabled = config.importApiEnabled,
  readinessCheck = () => true,
  trustProxy = config.trustProxy,
  metricsRegistry = defaultMetricsRegistry
} = {}) => {
  const app = express();
  app.set('trust proxy', trustProxy);
  const authenticate = createAuthenticate(authService);
  const requireCsrf = createRequireCsrf(authService);
  const importEnabled = (_request, response, next) => importsEnabled
    ? next()
    : response.status(503).json({ code: 'IMPORT_API_DISABLED', message: 'Import API chưa được bật trong môi trường này.' });
  const editorOnly = requireRoles(ROLE.CONTENT_EDITOR, ROLE.SUPER_ADMIN);
  const reviewerOnly = requireRoles(ROLE.ACADEMIC_REVIEWER, ROLE.SUPER_ADMIN);
  const editorOrReviewer = requireRoles(ROLE.CONTENT_EDITOR, ROLE.ACADEMIC_REVIEWER, ROLE.SUPER_ADMIN);
  const studentOnly = requireRoles(ROLE.STUDENT);
  const assessmentSpecialistOnly = requireRoles(ROLE.ASSESSMENT_SPECIALIST, ROLE.SUPER_ADMIN);

  app.use(createHttpMetricsMiddleware(metricsRegistry));
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
      if (!readinessCheck()) throw new Error('service draining');
      response.json(await getHealthStatus(databaseCheck));
    } catch (error) {
      response.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        message: config.nodeEnv === 'development' ? error.message : undefined
      });
    }
  });

  app.get('/api/live', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json(getLivenessStatus());
  });

  app.get('/api/ready', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      const status = await getReadinessStatus(databaseCheck, readinessCheck);
      metricsRegistry.setReady(true);
      response.json(status);
    } catch (error) {
      metricsRegistry.setReady(false);
      response.status(503).json({
        status: 'not_ready',
        database: error?.code === 'SERVICE_DRAINING' ? 'unknown' : 'disconnected',
        message: config.nodeEnv === 'development' ? error.message : undefined
      });
    }
  });

  app.get('/api/exams/demo-fixed', (_request, response) => {
    response.json(getDemoStudentExam());
  });

  app.get('/api/catalog/exams', async (_request, response, next) => {
    try {
      response.set('Cache-Control', 'public, max-age=60');
      return response.json({ exams: await catalogService.listPublished() });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/catalog/exams/:id', async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_EXAM_VERSION_ID', message: 'ExamVersion id không hợp lệ.' });
    try {
      const exam = await catalogService.getPublished(request.params.id);
      if (!exam) return response.status(404).json({ code: 'EXAM_NOT_FOUND', message: 'Không tìm thấy đề đã publish.' });
      response.set('Cache-Control', 'public, max-age=60');
      return response.json(exam);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/catalog/assets/:id', async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSET_ID', message: 'Asset id không hợp lệ.' });
    try {
      const asset = await catalogService.getPublishedAsset(request.params.id);
      if (!asset) return response.status(404).json({ code: 'ASSET_NOT_FOUND', message: 'Không tìm thấy asset đã publish.' });
      response.set({
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': asset.mimeType,
        'Content-Length': String(asset.data.length),
        'Content-Disposition': 'inline'
      });
      return response.send(asset.data);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assemblies', authenticate, editorOnly, requireCsrf, async (request, response, next) => {
    const { blueprint, seed } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    try {
      const run = await assemblyService.create({
        creatorUserId: request.auth.user.id,
        idempotencyKey,
        blueprint,
        seed
      });
      response.set('Cache-Control', 'no-store');
      return response.status(run.duplicate ? 200 : 201).json(run);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assemblies', authenticate, editorOnly, async (request, response, next) => {
    try {
      const result = await assemblyService.listOwned(request.auth.user.id, {
        status: request.query.status,
        purpose: request.query.purpose,
        query: request.query.q,
        page: request.query.page,
        limit: request.query.limit
      });
      response.set('Cache-Control', 'private, no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assembly-review-queue', authenticate, reviewerOnly, async (request, response, next) => {
    try {
      const result = await assemblyService.listReviewQueue(request.auth.user.id, {
        status: request.query.status,
        purpose: request.query.purpose,
        query: request.query.q,
        page: request.query.page,
        limit: request.query.limit
      });
      response.set('Cache-Control', 'private, no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assemblies/:id', authenticate, editorOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSEMBLY_ID', message: 'Assembly id không hợp lệ.' });
    try {
      const run = await assemblyService.getOwned(request.params.id, request.auth.user.id);
      if (!run) return response.status(404).json({ code: 'ASSEMBLY_NOT_FOUND', message: 'Không tìm thấy assembly run.' });
      response.set('Cache-Control', 'no-store');
      return response.json(run);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assemblies/:id/revisions', authenticate, editorOnly, requireCsrf, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSEMBLY_ID', message: 'Assembly id không hợp lệ.' });
    const { blueprint, seed } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    try {
      const run = await assemblyService.createRevision({
        sourceRunId: request.params.id,
        creatorUserId: request.auth.user.id,
        idempotencyKey,
        blueprint,
        seed
      });
      if (!run) return response.status(404).json({ code: 'ASSEMBLY_NOT_FOUND', message: 'Không tìm thấy assembly run thuộc Editor.' });
      response.set('Cache-Control', 'private, no-store');
      return response.status(run.duplicate ? 200 : 201).json(run);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assemblies/:id/reviewer-preview', authenticate, reviewerOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSEMBLY_ID', message: 'Assembly id không hợp lệ.' });
    try {
      const run = await assemblyService.getReviewerPreview(request.params.id);
      if (!run) return response.status(404).json({ code: 'ASSEMBLY_NOT_FOUND', message: 'Không tìm thấy assembly run.' });
      response.set('Cache-Control', 'no-store');
      return response.json(run);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assemblies/:id/assets/:assetId', authenticate, reviewerOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSEMBLY_ID', message: 'Assembly id không hợp lệ.' });
    if (!validUuid(request.params.assetId)) return response.status(400).json({ code: 'INVALID_ASSET_ID', message: 'Asset id không hợp lệ.' });
    try {
      const asset = await assemblyService.getReviewerAsset(request.params.id, request.params.assetId);
      if (!asset) return response.status(404).json({ code: 'ASSET_NOT_FOUND', message: 'Asset không thuộc assembly run hoặc chưa publish.' });
      response.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': asset.mimeType,
        'Content-Length': String(asset.data.length),
        'Content-Disposition': 'inline'
      });
      return response.send(asset.data);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assessment-frameworks', authenticate, assessmentSpecialistOnly, requireCsrf, async (request, response, next) => {
    const { stableKey, framework } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    try {
      const created = await assessmentService.createFramework({
        creatorUserId: request.auth.user.id,
        idempotencyKey,
        stableKey,
        framework
      });
      response.set('Cache-Control', 'private, no-store');
      return response.status(created.duplicate ? 200 : 201).json(created);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assessment-frameworks/review-queue', authenticate, reviewerOnly, async (request, response, next) => {
    try {
      response.set('Cache-Control', 'private, no-store');
      return response.json(await assessmentService.listReviewQueue(request.auth.user.id));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assessment-frameworks/available', authenticate, studentOnly, async (_request, response, next) => {
    try {
      response.set('Cache-Control', 'private, no-store');
      return response.json(await assessmentService.listAvailable());
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assessment-frameworks/:id/reviewer-preview', authenticate, reviewerOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSESSMENT_FRAMEWORK_ID', message: 'FrameworkVersion id không hợp lệ.' });
    try {
      const framework = await assessmentService.getForReview(request.params.id);
      if (!framework) return response.status(404).json({ code: 'ASSESSMENT_FRAMEWORK_NOT_FOUND', message: 'Không tìm thấy assessment framework.' });
      response.set('Cache-Control', 'private, no-store');
      return response.json(framework);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assessment-frameworks/:id/reviews', authenticate, reviewerOnly, requireCsrf, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSESSMENT_FRAMEWORK_ID', message: 'FrameworkVersion id không hợp lệ.' });
    const { decision, reason } = request.body || {};
    try {
      const framework = await assessmentService.reviewFramework({
        id: request.params.id,
        reviewerUserId: request.auth.user.id,
        decision,
        reason
      });
      if (!framework) return response.status(404).json({ code: 'ASSESSMENT_FRAMEWORK_NOT_FOUND', message: 'Không tìm thấy assessment framework.' });
      response.set('Cache-Control', 'private, no-store');
      return response.status(201).json(framework);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assessments', authenticate, studentOnly, requireCsrf, async (request, response, next) => {
    const { frameworkVersionId } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validUuid(frameworkVersionId)) return response.status(400).json({ code: 'INVALID_ASSESSMENT_FRAMEWORK_ID', message: 'FrameworkVersion id không hợp lệ.' });
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    try {
      const result = await assessmentService.generate({
        studentUserId: request.auth.user.id,
        frameworkVersionId,
        idempotencyKey
      });
      if (!result) return response.status(404).json({ code: 'ASSESSMENT_FRAMEWORK_NOT_AVAILABLE', message: 'Framework chưa được duyệt hoặc không tồn tại.' });
      response.set('Cache-Control', 'private, no-store');
      return response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assessments/latest', authenticate, studentOnly, async (request, response, next) => {
    if (!validUuid(request.query.frameworkVersionId)) return response.status(400).json({ code: 'INVALID_ASSESSMENT_FRAMEWORK_ID', message: 'FrameworkVersion id không hợp lệ.' });
    try {
      const result = await assessmentService.getLatestOwned(request.query.frameworkVersionId, request.auth.user.id);
      if (!result) return response.status(404).json({ code: 'ASSESSMENT_RESULT_NOT_FOUND', message: 'Chưa có assessment result cho framework này.' });
      response.set('Cache-Control', 'private, no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/assessments/:id', authenticate, studentOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSESSMENT_RESULT_ID', message: 'AssessmentResult id không hợp lệ.' });
    try {
      const result = await assessmentService.getOwned(request.params.id, request.auth.user.id);
      if (!result) return response.status(404).json({ code: 'ASSESSMENT_RESULT_NOT_FOUND', message: 'Không tìm thấy assessment result.' });
      response.set('Cache-Control', 'private, no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assemblies/:id/reviews', authenticate, reviewerOnly, requireCsrf, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSEMBLY_ID', message: 'Assembly id không hợp lệ.' });
    const { decision, reason } = request.body || {};
    if (!['APPROVE', 'REJECT'].includes(decision)) return response.status(400).json({ code: 'INVALID_REVIEW_DECISION', message: 'Decision phải là APPROVE hoặc REJECT.' });
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
      return response.status(400).json({ code: 'INVALID_REVIEW_REASON', message: 'Lý do review cần từ 10 đến 1000 ký tự.' });
    }
    try {
      const run = await assemblyService.review({
        id: request.params.id,
        reviewerUserId: request.auth.user.id,
        decision,
        reason: reason.trim()
      });
      if (!run) return response.status(404).json({ code: 'ASSEMBLY_NOT_FOUND', message: 'Không tìm thấy assembly run.' });
      response.set('Cache-Control', 'no-store');
      return response.status(201).json(run);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/assemblies/:id/publish', authenticate, reviewerOnly, requireCsrf, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ASSEMBLY_ID', message: 'Assembly id không hợp lệ.' });
    try {
      const result = await assemblyService.publish({ id: request.params.id, publisherUserId: request.auth.user.id });
      if (!result) return response.status(404).json({ code: 'ASSEMBLY_NOT_FOUND', message: 'Không tìm thấy assembly run.' });
      response.set('Cache-Control', 'no-store');
      return response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/attempts', authenticate, studentOnly, requireCsrf, async (request, response, next) => {
    const { examVersionId } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validUuid(examVersionId)) return response.status(400).json({ code: 'INVALID_EXAM_VERSION_ID', message: 'ExamVersion id không hợp lệ.' });
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    try {
      const attempt = await attemptService.create({
        studentUserId: request.auth.user.id,
        examVersionId,
        idempotencyKey
      });
      if (!attempt) return response.status(404).json({ code: 'EXAM_NOT_FOUND', message: 'Không tìm thấy đề đã publish.' });
      response.set('Cache-Control', 'no-store');
      return response.status(attempt.duplicate ? 200 : 201).json(attempt);
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/attempts/:id/responses', authenticate, studentOnly, requireCsrf, async (request, response, next) => {
    const { baseRevision, responses } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ATTEMPT_ID', message: 'Attempt id không hợp lệ.' });
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    if (!Number.isInteger(baseRevision) || baseRevision < 0) return response.status(400).json({ code: 'INVALID_ANSWER_REVISION', message: 'baseRevision phải là số nguyên không âm.' });
    if (!Array.isArray(responses) || responses.length === 0 || responses.length > 500) {
      return response.status(400).json({ code: 'INVALID_RESPONSES', message: 'responses phải có từ 1 đến 500 phần tử.' });
    }
    try {
      const result = await attemptService.saveResponses({
        id: request.params.id,
        studentUserId: request.auth.user.id,
        idempotencyKey,
        baseRevision,
        responses
      });
      if (!result) return response.status(404).json({ code: 'ATTEMPT_NOT_FOUND', message: 'Không tìm thấy attempt.' });
      response.set('Cache-Control', 'no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/attempts/:id/submit', authenticate, studentOnly, requireCsrf, async (request, response, next) => {
    const { baseRevision } = request.body || {};
    const idempotencyKey = request.get('idempotency-key');
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ATTEMPT_ID', message: 'Attempt id không hợp lệ.' });
    if (!validIdempotencyKey(idempotencyKey)) return response.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key phải dài 8–100 ký tự an toàn.' });
    if (!Number.isInteger(baseRevision) || baseRevision < 0) return response.status(400).json({ code: 'INVALID_ANSWER_REVISION', message: 'baseRevision phải là số nguyên không âm.' });
    try {
      const result = await attemptService.submit({
        id: request.params.id,
        studentUserId: request.auth.user.id,
        idempotencyKey,
        baseRevision
      });
      if (!result) return response.status(404).json({ code: 'ATTEMPT_NOT_FOUND', message: 'Không tìm thấy attempt.' });
      response.set('Cache-Control', 'no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/attempts/:id/result', authenticate, studentOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ATTEMPT_ID', message: 'Attempt id không hợp lệ.' });
    try {
      const result = await attemptService.getResult(request.params.id, request.auth.user.id);
      if (!result) return response.status(404).json({ code: 'ATTEMPT_NOT_FOUND', message: 'Không tìm thấy attempt.' });
      response.set('Cache-Control', 'no-store');
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/attempts/:id', authenticate, studentOnly, async (request, response, next) => {
    if (!validUuid(request.params.id)) return response.status(400).json({ code: 'INVALID_ATTEMPT_ID', message: 'Attempt id không hợp lệ.' });
    try {
      const attempt = await attemptService.getOwned(request.params.id, request.auth.user.id);
      if (!attempt) return response.status(404).json({ code: 'ATTEMPT_NOT_FOUND', message: 'Không tìm thấy attempt.' });
      response.set('Cache-Control', 'no-store');
      return response.json(attempt);
    } catch (error) {
      return next(error);
    }
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

  app.post('/api/imports/:id/academic-reviews', importEnabled, authenticate, reviewerOnly, requireCsrf, async (request, response, next) => {
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    const { decision, reason } = request.body || {};
    if (!['APPROVE', 'REJECT'].includes(decision)) return response.status(400).json({ code: 'INVALID_REVIEW_DECISION', message: 'Decision phải là APPROVE hoặc REJECT.' });
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
      return response.status(400).json({ code: 'INVALID_REVIEW_REASON', message: 'Lý do review cần từ 10 đến 1000 ký tự.' });
    }
    try {
      const result = await importService.createAcademicReview({
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

  app.post('/api/imports/:id/publish', importEnabled, authenticate, reviewerOnly, requireCsrf, async (request, response, next) => {
    if (!validImportId(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    try {
      const result = await importService.publish(request.params.id, request.auth.user.id);
      if (!result) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      response.set('Cache-Control', 'no-store');
      return response.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found' });
  });

  app.use((error, _request, response, _next) => {
    metricsRegistry.recordError(error?.code || 'INTERNAL_ERROR');
    if (error instanceof PackageReadError) return response.status(error.statusCode).json({ code: error.code, message: error.message });
    if (error?.type === 'entity.too.large') return response.status(413).json({ code: 'PACKAGE_TOO_LARGE', message: 'ZIP vượt quá giới hạn tải lên 25 MiB.' });
    if (error?.statusCode && error?.code) return response.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    });
    return response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu.' });
  });

  return app;
};
