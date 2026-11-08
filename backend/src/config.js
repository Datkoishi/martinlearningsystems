import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.code = 'INVALID_CONFIGURATION';
  }
}

const integerFromEnv = (name, value, fallback, { min, max }) => {
  if (value === undefined || value === '') return fallback;
  if (!/^-?\d+$/.test(String(value))) throw new ConfigError(`${name} phải là số nguyên.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${name} phải nằm trong khoảng ${min}–${max}.`);
  }
  return parsed;
};

const booleanFromEnv = (name, value, fallback) => {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigError(`${name} chỉ nhận true hoặc false.`);
};

const originFromEnv = (value, production) => {
  let origin;
  try {
    origin = new URL(value || 'http://localhost:5173');
  } catch {
    throw new ConfigError('CLIENT_ORIGIN phải là URL hợp lệ.');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== origin.href.replace(/\/$/, '')) {
    throw new ConfigError('CLIENT_ORIGIN phải chỉ gồm scheme và host, không có path/query/hash.');
  }
  if (production && origin.protocol !== 'https:') {
    throw new ConfigError('CLIENT_ORIGIN phải dùng HTTPS khi NODE_ENV=production.');
  }
  return origin.origin;
};

export const buildConfig = (env = process.env, cwd = process.cwd()) => {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new ConfigError('NODE_ENV phải là development, test hoặc production.');
  }
  const production = nodeEnv === 'production';
  const cookieSecure = booleanFromEnv('COOKIE_SECURE', env.COOKIE_SECURE, production);
  const databasePassword = env.MYSQL_PASSWORD || '';

  if (production && !cookieSecure) {
    throw new ConfigError('COOKIE_SECURE phải là true khi NODE_ENV=production.');
  }
  if (production && (!databasePassword || /^change_me(?:_|$)/i.test(databasePassword))) {
    throw new ConfigError('MYSQL_PASSWORD production phải được cấu hình bằng secret không mặc định.');
  }

  return {
    nodeEnv,
    port: integerFromEnv('PORT', env.PORT || env.BACKEND_PORT, 3000, { min: 1, max: 65535 }),
    clientOrigin: originFromEnv(env.CLIENT_ORIGIN, production),
    importApiEnabled: booleanFromEnv('ENABLE_IMPORT_API', env.ENABLE_IMPORT_API, !production),
    importStoragePath: path.resolve(cwd, env.IMPORT_STORAGE_PATH || '.data/imports'),
    authSessionHours: integerFromEnv('AUTH_SESSION_HOURS', env.AUTH_SESSION_HOURS, 8, { min: 1, max: 168 }),
    cookieSecure,
    trustProxy: integerFromEnv('TRUST_PROXY', env.TRUST_PROXY, 0, { min: 0, max: 10 }),
    shutdownGraceMs: integerFromEnv('SHUTDOWN_GRACE_MS', env.SHUTDOWN_GRACE_MS, 10000, { min: 1000, max: 60000 }),
    migrationsPath: path.resolve(cwd, env.MIGRATIONS_PATH || '../database/init'),
    migrationLockTimeoutSeconds: integerFromEnv(
      'MIGRATION_LOCK_TIMEOUT_SECONDS',
      env.MIGRATION_LOCK_TIMEOUT_SECONDS,
      30,
      { min: 0, max: 300 }
    ),
    database: {
      host: env.MYSQL_HOST || 'localhost',
      port: integerFromEnv('MYSQL_PORT', env.MYSQL_PORT, 3306, { min: 1, max: 65535 }),
      database: env.MYSQL_DATABASE || 'mls_db',
      user: env.MYSQL_USER || 'mls_user',
      password: databasePassword
    }
  };
};

export const config = buildConfig();
