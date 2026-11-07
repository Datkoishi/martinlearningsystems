import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMETERS = { N: 16384, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 };

const validPassword = (password) => typeof password === 'string' && Buffer.byteLength(password, 'utf8') >= 12 && Buffer.byteLength(password, 'utf8') <= 128;

export const createPasswordHash = async (password) => {
  if (!validPassword(password)) throw new Error('Mật khẩu phải dài từ 12 đến 128 bytes.');
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, PARAMETERS.keyLength, PARAMETERS);
  return `scrypt$${PARAMETERS.N}$${PARAMETERS.r}$${PARAMETERS.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
};

export const verifyPassword = async (password, encodedHash) => {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = String(encodedHash).split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length !== PARAMETERS.keyLength) return false;
    const derived = await scrypt(String(password), Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMETERS.maxmem
    });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
};
