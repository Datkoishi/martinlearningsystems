import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getApiInfo, getHealthStatus } from '../src/app.js';

test('API identity is configured', () => {
  assert.deepEqual(getApiInfo(), {
    message: 'Martin Learning Systems API'
  });
});

test('health status reports a connected database', async () => {
  const body = await getHealthStatus(async () => true);

  assert.deepEqual(body, { status: 'ok', database: 'connected' });
});

test('health status rejects when the database is unavailable', async () => {
  await assert.rejects(
    getHealthStatus(async () => {
      throw new Error('database unavailable');
    }),
    /database unavailable/
  );
});
