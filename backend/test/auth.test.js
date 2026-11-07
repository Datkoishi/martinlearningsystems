import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthError, AuthService, ROLE, hasAnyRole, hashToken } from '../src/auth/auth-service.js';
import { createLoginRateLimiter, parseCookies, requireRoles } from '../src/auth/http-auth.js';
import { createPasswordHash, verifyPassword } from '../src/auth/password.js';

class MemoryAuthRepository {
  constructor(users = []) {
    this.users = users;
    this.sessions = [];
    this.audit = [];
  }
  async findUserByEmail(email) { return this.users.find((user) => user.email === email) || null; }
  async createSession(session) {
    this.sessions.push({ ...session, revokedAt: null });
    return session;
  }
  async findActiveSession(tokenHashValue, now) {
    const session = this.sessions.find((item) => item.tokenHash === tokenHashValue && !item.revokedAt && item.expiresAt > now);
    if (!session) return null;
    return {
      id: session.id,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt,
      user: this.users.find((user) => user.id === session.userId)
    };
  }
  async revokeSession(id, revokedAt) {
    const session = this.sessions.find((item) => item.id === id);
    if (session) session.revokedAt = revokedAt;
  }
  async recordAudit(event) { this.audit.push(event); }
}

const activeUser = async (overrides = {}) => ({
  id: '00000000-0000-4000-8000-000000000301',
  email: 'editor@example.test',
  displayName: 'Editor DEMO',
  passwordHash: await createPasswordHash('correct-horse-battery-staple'),
  status: 'ACTIVE',
  roles: [ROLE.CONTENT_EDITOR],
  ...overrides
});

test('scrypt password hash verifies without storing the password', async () => {
  const encoded = await createPasswordHash('correct-horse-battery-staple');

  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(encoded.includes('correct-horse'), false);
  assert.equal(await verifyPassword('correct-horse-battery-staple', encoded), true);
  assert.equal(await verifyPassword('wrong-password-value', encoded), false);
});

test('login creates an opaque session, validates CSRF and logout revokes it', async () => {
  const now = new Date('2026-11-07T00:00:00Z');
  const repository = new MemoryAuthRepository([await activeUser()]);
  const service = new AuthService({ repository, now: () => now, sessionDurationMs: 60_000 });

  const login = await service.login({
    email: 'EDITOR@EXAMPLE.TEST',
    password: 'correct-horse-battery-staple',
    userAgent: 'node-test',
    ipAddress: '127.0.0.1'
  });
  const auth = await service.authenticate(login.sessionToken);

  assert.equal(login.sessionToken.length >= 40, true);
  assert.equal(repository.sessions[0].tokenHash, hashToken(login.sessionToken));
  assert.equal(repository.sessions[0].tokenHash.includes(login.sessionToken), false);
  assert.deepEqual(auth.user.roles, [ROLE.CONTENT_EDITOR]);
  assert.equal(service.validateCsrf(auth, login.csrfToken), true);
  assert.equal(service.validateCsrf(auth, 'incorrect-csrf-token'), false);
  await service.logout(auth);
  await assert.rejects(service.authenticate(login.sessionToken), (error) => error.code === 'SESSION_INVALID');
  assert.deepEqual(repository.audit.map((event) => event.eventType), ['AUTH_LOGIN', 'AUTH_LOGOUT']);
});

test('invalid credentials return a generic error and create a denied audit event', async () => {
  const repository = new MemoryAuthRepository([await activeUser()]);
  const service = new AuthService({ repository });

  await assert.rejects(
    service.login({ email: 'editor@example.test', password: 'definitely-wrong-password' }),
    (error) => error instanceof AuthError && error.code === 'INVALID_CREDENTIALS' && error.statusCode === 401
  );
  assert.equal(repository.audit[0].outcome, 'DENIED');
  assert.equal(repository.audit[0].details.reason, 'INVALID_CREDENTIALS');
});

test('role guard permits configured roles and denies unrelated roles', () => {
  const editorAuth = { user: { roles: [ROLE.CONTENT_EDITOR] } };
  const studentAuth = { user: { roles: [ROLE.STUDENT] } };
  assert.equal(hasAnyRole(editorAuth, [ROLE.CONTENT_EDITOR]), true);
  assert.equal(hasAnyRole(editorAuth, [ROLE.ACADEMIC_REVIEWER]), false);
  assert.equal(hasAnyRole(studentAuth, [ROLE.STUDENT]), true);

  let observed;
  requireRoles(ROLE.ACADEMIC_REVIEWER)({ auth: editorAuth }, {}, (error) => { observed = error; });
  assert.equal(observed.code, 'FORBIDDEN');
  assert.equal(observed.statusCode, 403);
});

test('cookie parser and login rate limiter fail closed', () => {
  assert.deepEqual(parseCookies('eduassess_session=abc; eduassess_csrf=xyz'), {
    eduassess_session: 'abc',
    eduassess_csrf: 'xyz'
  });
  let current = 1000;
  const limiter = createLoginRateLimiter({ limit: 2, windowMs: 100, now: () => current });
  const request = { ip: '127.0.0.1' };
  const calls = [];
  limiter(request, {}, (error) => calls.push(error));
  limiter(request, {}, (error) => calls.push(error));
  limiter(request, {}, (error) => calls.push(error));
  assert.equal(calls[0], undefined);
  assert.equal(calls[1], undefined);
  assert.equal(calls[2].code, 'LOGIN_RATE_LIMITED');
  current += 101;
  limiter(request, {}, (error) => calls.push(error));
  assert.equal(calls[3], undefined);
});
