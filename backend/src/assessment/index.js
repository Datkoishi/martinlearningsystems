import { db } from '../db.js';
import { AssessmentService } from './assessment-service.js';
import { MysqlAssessmentRepository } from './mysql-assessment-repository.js';

export const assessmentService = new AssessmentService({
  repository: new MysqlAssessmentRepository(db)
});
