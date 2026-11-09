import { db } from '../db.js';
import { ManualScoringService } from './manual-scoring-service.js';
import { MysqlManualScoringRepository } from './mysql-manual-scoring-repository.js';

export const manualScoringService = new ManualScoringService({
  repository: new MysqlManualScoringRepository(db)
});
