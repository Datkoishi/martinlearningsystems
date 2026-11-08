import crypto from 'node:crypto';
import http from 'node:http';

const HISTOGRAM_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const OBJECT_READ_OUTCOMES = new Set(['archive', 'object', 'fallback', 'failure']);

const escapeLabel = (value) => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const labels = (values) => `{${Object.entries(values).map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
const increment = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const boundedMethod = (method) => HTTP_METHODS.has(method) ? method : 'OTHER';
const boundedStatus = (status) => Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : '000';
const boundedErrorCode = (code) => /^[A-Z][A-Z0-9_]{0,63}$/.test(code || '') ? code : 'INTERNAL_ERROR';

const routeTemplate = (request) => {
  const route = request.route?.path;
  if (typeof route !== 'string' || !route.startsWith('/')) return 'unmatched';
  return `${request.baseUrl || ''}${route}`;
};

export class MetricsRegistry {
  constructor({ startTimeSeconds = Date.now() / 1000 } = {}) {
    this.startTimeSeconds = startTimeSeconds;
    this.requests = new Map();
    this.durations = new Map();
    this.errors = new Map();
    this.objectReads = new Map();
    this.ready = 0;
  }

  recordHttp({ method, route, statusCode, durationSeconds }) {
    const safeMethod = boundedMethod(method);
    const safeRoute = typeof route === 'string' && (route === 'unmatched' || route.startsWith('/'))
      && route.length <= 160 ? route : 'unmatched';
    const safeStatus = boundedStatus(statusCode);
    increment(this.requests, JSON.stringify([safeMethod, safeRoute, safeStatus]));

    const durationKey = JSON.stringify([safeMethod, safeRoute]);
    const observation = this.durations.get(durationKey) || {
      buckets: HISTOGRAM_BUCKETS.map(() => 0),
      count: 0,
      sum: 0
    };
    const duration = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0;
    observation.count += 1;
    observation.sum += duration;
    HISTOGRAM_BUCKETS.forEach((bucket, index) => {
      if (duration <= bucket) observation.buckets[index] += 1;
    });
    this.durations.set(durationKey, observation);
  }

  recordError(code) {
    increment(this.errors, boundedErrorCode(code));
  }

  recordObjectRead(outcome) {
    increment(this.objectReads, OBJECT_READ_OUTCOMES.has(outcome) ? outcome : 'failure');
  }

  setReady(value) {
    this.ready = value ? 1 : 0;
  }

  render() {
    const lines = [
      '# HELP eduassess_process_start_time_seconds Unix timestamp when the backend metrics registry started.',
      '# TYPE eduassess_process_start_time_seconds gauge',
      `eduassess_process_start_time_seconds ${this.startTimeSeconds}`,
      '# HELP eduassess_backend_ready Whether the most recent readiness check passed.',
      '# TYPE eduassess_backend_ready gauge',
      `eduassess_backend_ready ${this.ready}`,
      '# HELP eduassess_http_requests_total Completed backend HTTP requests.',
      '# TYPE eduassess_http_requests_total counter'
    ];

    for (const [key, value] of [...this.requests].sort()) {
      const [method, route, status] = JSON.parse(key);
      lines.push(`eduassess_http_requests_total${labels({ method, route, status })} ${value}`);
    }
    lines.push(
      '# HELP eduassess_http_request_duration_seconds Backend HTTP request duration.',
      '# TYPE eduassess_http_request_duration_seconds histogram'
    );
    for (const [key, observation] of [...this.durations].sort()) {
      const [method, route] = JSON.parse(key);
      HISTOGRAM_BUCKETS.forEach((bucket, index) => {
        lines.push(`eduassess_http_request_duration_seconds_bucket${labels({ method, route, le: bucket })} ${observation.buckets[index]}`);
      });
      lines.push(`eduassess_http_request_duration_seconds_bucket${labels({ method, route, le: '+Inf' })} ${observation.count}`);
      lines.push(`eduassess_http_request_duration_seconds_sum${labels({ method, route })} ${observation.sum}`);
      lines.push(`eduassess_http_request_duration_seconds_count${labels({ method, route })} ${observation.count}`);
    }
    lines.push(
      '# HELP eduassess_errors_total Structured errors handled by the backend.',
      '# TYPE eduassess_errors_total counter'
    );
    for (const [code, value] of [...this.errors].sort()) {
      lines.push(`eduassess_errors_total${labels({ code })} ${value}`);
    }
    lines.push(
      '# HELP eduassess_published_asset_reads_total Published asset read outcomes.',
      '# TYPE eduassess_published_asset_reads_total counter'
    );
    for (const [outcome, value] of [...this.objectReads].sort()) {
      lines.push(`eduassess_published_asset_reads_total${labels({ outcome })} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

export const metricsRegistry = new MetricsRegistry();

export const createHttpMetricsMiddleware = (registry = metricsRegistry) => (request, response, next) => {
  const started = process.hrtime.bigint();
  response.once('finish', () => {
    registry.recordHttp({
      method: request.method,
      route: routeTemplate(request),
      statusCode: response.statusCode,
      durationSeconds: Number(process.hrtime.bigint() - started) / 1e9
    });
  });
  next();
};

const tokenMatches = (authorization, expectedToken) => {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

export const createMetricsServer = ({ registry = metricsRegistry, bearerToken }) => http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('ok\n');
  }
  if (request.url !== '/metrics' || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('not found\n');
  }
  if (!tokenMatches(request.headers.authorization, bearerToken)) {
    response.writeHead(401, {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Bearer realm="metrics"'
    });
    return response.end('unauthorized\n');
  }
  const body = registry.render();
  response.writeHead(200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  return response.end(request.method === 'HEAD' ? undefined : body);
});
