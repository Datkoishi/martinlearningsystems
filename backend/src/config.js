import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: numberFromEnv(process.env.PORT || process.env.BACKEND_PORT, 3000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  database: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: numberFromEnv(process.env.MYSQL_PORT, 3306),
    database: process.env.MYSQL_DATABASE || 'mls_db',
    user: process.env.MYSQL_USER || 'mls_user',
    password: process.env.MYSQL_PASSWORD || ''
  }
};
