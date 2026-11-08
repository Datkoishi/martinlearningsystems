import { randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { MysqlAuthRepository } from '../src/auth/mysql-auth-repository.js';
import { createPasswordHash } from '../src/auth/password.js';

const allowedRoles = new Set([
  'STUDENT', 'CONTENT_EDITOR', 'ACADEMIC_REVIEWER', 'ASSESSMENT_SPECIALIST', 'SUPER_ADMIN'
]);
const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};

const readPasswordFromStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
};

const main = async () => {
  if (!args.includes('--password-stdin')) throw new Error('Bắt buộc dùng --password-stdin.');
  const email = String(valueFor('--email') || '').trim().toLowerCase();
  const displayName = String(valueFor('--display-name') || '').trim();
  const roles = String(valueFor('--roles') || '').split(',').map((role) => role.trim()).filter(Boolean);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email không hợp lệ.');
  if (displayName.length < 2 || displayName.length > 255) throw new Error('Display name không hợp lệ.');
  if (roles.length === 0 || roles.some((role) => !allowedRoles.has(role))) throw new Error('Role bootstrap không hợp lệ.');
  const password = await readPasswordFromStdin();
  const repository = new MysqlAuthRepository(db);
  const user = await repository.createUser({
    id: randomUUID(),
    email,
    displayName,
    passwordHash: await createPasswordHash(password),
    roles: [...new Set(roles)]
  });
  process.stdout.write(`${JSON.stringify({ id: user.id, email: user.email, roles: user.roles })}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`Không thể tạo user: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
