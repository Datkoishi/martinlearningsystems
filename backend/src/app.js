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
    if (!/^[a-f0-9-]{36}$/.test(request.params.id)) return response.status(400).json({ code: 'INVALID_IMPORT_ID', message: 'Import job id không hợp lệ.' });
    try {
      const job = await importService.getById(request.params.id);
      if (!job) return response.status(404).json({ code: 'IMPORT_NOT_FOUND', message: 'Không tìm thấy import job.' });
      return response.json(job);
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
    return response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Không thể xử lý yêu cầu.' });
  });

  return app;
};
