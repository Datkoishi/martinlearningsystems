import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { MigrationError, MigrationRunner } from '../src/operations/migration-runner.js';

const allowedArguments = new Set(['--status', '--adopt-existing', '--include-demo']);
const argumentsList = process.argv.slice(2);
const unknown = argumentsList.filter((argument) => !allowedArguments.has(argument));
if (unknown.length > 0) {
  console.error(JSON.stringify({ code: 'MIGRATION_ARGUMENT_INVALID', message: `Argument không hỗ trợ: ${unknown.join(', ')}` }));
  process.exit(2);
}

const connection = await mysql.createConnection({
  ...config.database,
  multipleStatements: true
});

try {
  const runner = new MigrationRunner({
    connection,
    database: config.database.database,
    migrationsPath: config.migrationsPath,
    actor: process.env.MIGRATION_ACTOR || 'eduassess-migrator',
    lockTimeoutSeconds: config.migrationLockTimeoutSeconds
  });
  const result = argumentsList.includes('--status')
    ? await runner.status()
    : await runner.migrate({
      adoptExisting: argumentsList.includes('--adopt-existing'),
      includeDemo: argumentsList.includes('--include-demo')
    });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const known = error instanceof MigrationError;
  console.error(JSON.stringify({
    code: known ? error.code : 'MIGRATION_UNEXPECTED_ERROR',
    message: known ? error.message : 'Migration không thể hoàn tất.',
    ...(known && error.details ? { details: error.details } : {})
  }));
  process.exitCode = 1;
} finally {
  await connection.end();
}
