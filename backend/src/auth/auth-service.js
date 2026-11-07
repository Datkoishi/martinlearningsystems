import crypto, { randomUUID } from 'node:crypto';
import { createPasswordHash, verifyPassword } from './password.js';

export const ROLE = Object.freeze({
  STUDENT: 'STUDENT',
  CONTENT_EDITOR: 'CONTENT_EDITOR',
  ACADEMIC_REVIEWER: 'ACADEMIC_REVIEWER',
  SUPER_ADMIN: 'SUPER_ADMIN'
});

export class AuthError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const token = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');
const publicUser = (user) => ({ id: user.id, email: user.email, displayName: user.displayName, roles: user.roles });

export const hasAnyRole = (auth, allowedRoles) => auth?.user?.roles?.some((role) => allowedRoles.includes(role)) === true;

export class AuthService {
  constructor({ repository, sessionDurationMs = 8 * 60 * 60 * 1000, now = () => new Date() }) {
    this.repository = repository;
    this.sessionDurationMs = sessionDurationMs;
    this.now = now;
    this.dummyHash = createPasswordHash('not-a-real-password-credential');
  }

  async login({ email, password, userAgent, ipAddress }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await this.repository.findUserByEmail(normalizedEmail);
    const hash = user?.passwordHash || await this.dummyHash;
    const passwordValid = await verifyPassword(String(password || ''), hash);
    if (!user || !passwordValid || user.status !== 'ACTIVE') {
      await this.repository.recordAudit({
        id: randomUUID(),
        actorUserId: user?.id || null,
        eventType: 'AUTH_LOGIN',
        resourceType: 'AUTH_SESSION',
        resourceId: null,
        outcome: 'DENIED',
        details: { reason: 'INVALID_CREDENTIALS' }
      });
      throw new AuthError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.', 401);
    }

    const sessionToken = token();
    const csrfToken = token();
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.sessionDurationMs);
    const session = await this.repository.createSession({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt,
      lastSeenAt: createdAt,
      userAgentHash: userAgent ? hashToken(userAgent) : null,
      ipHash: ipAddress ? hashToken(ipAddress) : null
    });
    await this.repository.recordAudit({
      id: randomUUID(),
      actorUserId: user.id,
      eventType: 'AUTH_LOGIN',
      resourceType: 'AUTH_SESSION',
      resourceId: session.id,
      outcome: 'SUCCESS',
      details: null
    });
    return { user: publicUser(user), sessionToken, csrfToken, expiresAt };
  }

  async authenticate(sessionToken) {
    if (!sessionToken) throw new AuthError('AUTH_REQUIRED', 'Cần đăng nhập.', 401);
    const session = await this.repository.findActiveSession(hashToken(sessionToken), this.now());
    if (!session || session.user.status !== 'ACTIVE') throw new AuthError('SESSION_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401);
    return {
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt,
      user: publicUser(session.user)
    };
  }

  validateCsrf(auth, csrfToken) {
    if (!csrfToken || !auth?.csrfTokenHash) return false;
    const actual = Buffer.from(hashToken(csrfToken), 'hex');
    const expected = Buffer.from(auth.csrfTokenHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  async logout(auth) {
    await this.repository.revokeSession(auth.sessionId, this.now());
    await this.repository.recordAudit({
      id: randomUUID(),
      actorUserId: auth.user.id,
      eventType: 'AUTH_LOGOUT',
      resourceType: 'AUTH_SESSION',
      resourceId: auth.sessionId,
      outcome: 'SUCCESS',
      details: null
    });
  }
}
