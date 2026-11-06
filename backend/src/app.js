import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { checkDatabase } from './db.js';
import { config } from './config.js';
import { demoFixedExam } from './domain/demo-exam.js';
import { toStudentExam } from './domain/exam-presentation.js';

export const getApiInfo = () => ({
  message: 'Martin Learning Systems API'
});

export const getHealthStatus = async (databaseCheck = checkDatabase) => {
  await databaseCheck();
  return { status: 'ok', database: 'connected' };
};

export const getDemoStudentExam = () => toStudentExam(demoFixedExam);

export const createApp = ({ databaseCheck = checkDatabase } = {}) => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
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

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found' });
  });

  return app;
};
