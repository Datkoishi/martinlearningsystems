import mysql from 'mysql2/promise';
import { config } from './config.js';

export const db = mysql.createPool({
  ...config.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true
});

export const checkDatabase = async () => {
  const [rows] = await db.query('SELECT 1 AS connected');
  return rows[0]?.connected === 1;
};
