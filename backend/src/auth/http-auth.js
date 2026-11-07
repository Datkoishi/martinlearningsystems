import { AuthError, hasAnyRole } from './auth-service.js';

export const SESSION_COOKIE = 'eduassess_session';
export const CSRF_COOKIE = 'eduassess_csrf';

const decodeCookie = (value) => {
  try { return decodeURIComponent(value); } catch { return ''; }
};

export const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => {
  const index = part.indexOf('=');
  if (index === -1) return null;
  return [part.slice(0, index).trim(), decodeCookie(part.slice(index + 1).trim())];
}).filter(Boolean));

export const setAuthCookies = (response, login, secure) => {
  const maxAge = Math.max(0, login.expiresAt.getTime() - Date.now());
  const common = { secure, sameSite: 'strict', path: '/', maxAge };
  response.cookie(SESSION_COOKIE, login.sessionToken, { ...common, httpOnly: true });
  response.cookie(CSRF_COOKIE, login.csrfToken, { ...common, httpOnly: false });
};

export const clearAuthCookies = (response, secure) => {
  const options = { secure, sameSite: 'strict', path: '/' };
  response.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  response.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
};

export const createAuthenticate = (authService) => async (request, _response, next) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    request.auth = await authService.authenticate(cookies[SESSION_COOKIE]);
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRoles = (...roles) => (request, _response, next) => {
  if (!hasAnyRole(request.auth, roles)) return next(new AuthError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', 403));
  next();
};

export const createRequireCsrf = (authService) => (request, _response, next) => {
  const cookies = parseCookies(request.headers.cookie);
  const headerToken = request.get('x-csrf-token');
  if (!headerToken || headerToken !== cookies[CSRF_COOKIE] || !authService.validateCsrf(request.auth, headerToken)) {
    return next(new AuthError('CSRF_INVALID', 'CSRF token không hợp lệ.', 403));
  }
  next();
};

export const createLoginRateLimiter = ({ limit = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) => {
  const attempts = new Map();
  return (request, _response, next) => {
    const key = request.ip || request.socket?.remoteAddress || 'unknown';
    const current = now();
    const recent = (attempts.get(key) || []).filter((timestamp) => current - timestamp < windowMs);
    if (recent.length >= limit) return next(new AuthError('LOGIN_RATE_LIMITED', 'Quá nhiều lần đăng nhập. Hãy thử lại sau.', 429));
    recent.push(current);
    attempts.set(key, recent);
    next();
  };
};
