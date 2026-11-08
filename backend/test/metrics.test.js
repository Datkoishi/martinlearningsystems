import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createMetricsServer, MetricsRegistry } from '../src/operations/metrics.js';

const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
};

test('HTTP middleware exports bounded route templates, statuses and errors', async (context) => {
  const registry = new MetricsRegistry({ startTimeSeconds: 1 });
  const app = createApp({
    metricsRegistry: registry,
    databaseCheck: async () => true,
    importsEnabled: false,
    catalogService: {
      async listPublished() {
        throw Object.assign(new Error('fixture'), { code: 'CATALOG_FAILURE' });
      }
    }
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${baseUrl}/api/ready`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/catalog/exams`)).status, 500);
  assert.equal((await fetch(`${baseUrl}/missing/00000000-0000-4000-8000-000000000001`)).status, 404);

  const output = registry.render();
  assert.match(output, /eduassess_backend_ready 1/);
  assert.match(output, /method="GET",route="\/api\/ready",status="200"/);
  assert.match(output, /method="GET",route="\/api\/catalog\/exams",status="500"/);
  assert.match(output, /method="GET",route="unmatched",status="404"/);
  assert.doesNotMatch(output, /00000000-0000-4000-8000-000000000001/);
  assert.match(output, /eduassess_errors_total\{code="CATALOG_FAILURE"\} 1/);
  assert.match(output, /eduassess_http_request_duration_seconds_bucket/);
});

test('metrics listener requires a constant-time Bearer credential and keeps health separate', async (context) => {
  const token = 'fixture-metrics-token-that-is-long-enough';
  const registry = new MetricsRegistry({ startTimeSeconds: 1 });
  registry.recordObjectRead('fallback');
  const server = createMetricsServer({ registry, bearerToken: token });
  const baseUrl = await listen(server);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/metrics`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/metrics`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const response = await fetch(`${baseUrl}/metrics`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /eduassess_published_asset_reads_total\{outcome="fallback"\} 1/);
});
