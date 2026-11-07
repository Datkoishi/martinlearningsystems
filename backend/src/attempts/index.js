import { db } from '../db.js';
import { catalogService } from '../catalog/index.js';
import { AttemptService } from './attempt-service.js';
import { MysqlAttemptRepository } from './mysql-attempt-repository.js';

export const attemptService = new AttemptService({
  repository: new MysqlAttemptRepository(db),
  catalogService
});
