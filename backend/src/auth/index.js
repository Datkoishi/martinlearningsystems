import { config } from '../config.js';
import { db } from '../db.js';
import { AuthService } from './auth-service.js';
import { MysqlAuthRepository } from './mysql-auth-repository.js';

export const authService = new AuthService({
  repository: new MysqlAuthRepository(db),
  sessionDurationMs: config.authSessionHours * 60 * 60 * 1000
});
