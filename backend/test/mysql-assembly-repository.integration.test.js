import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { MysqlAssemblyRepository } from '../src/assembly/mysql-assembly-repository.js';

const integrationPort = process.env.MYSQL_INTEGRATION_PORT;

test('MySQL repository serializes Blueprint revisions and returns safe governance queues', {
  skip: !integrationPort,
  timeout: 30000
}, async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_INTEGRATION_HOST || '127.0.0.1',
    port: Number(integrationPort),
    database: process.env.MYSQL_INTEGRATION_DATABASE || 'mls_db',
    user: process.env.MYSQL_INTEGRATION_USER || 'mls_user',
    password: process.env.MYSQL_INTEGRATION_PASSWORD,
    connectionLimit: 2
  });
  const repository = new MysqlAssemblyRepository(pool);
  const editorId = randomUUID();
  const reviewerId = randomUUID();
  const blueprintId = randomUUID();
  const createdIds = [];
  const versionIds = [];
  const auditIds = [];
  const fixedHash = (character) => character.repeat(64);
  const blueprint = (title) => ({
    schemaVersion: '1.0.0', title, grade: 5, subject: 'Toán', purpose: 'PRACTICE'
  });
  const runFixture = ({ versionTitle, revisionOfBlueprintVersionId = null, createdAt }) => {
    const id = randomUUID();
    const blueprintVersionId = randomUUID();
    const auditId = randomUUID();
    createdIds.push(id);
    versionIds.push(blueprintVersionId);
    auditIds.push(auditId);
    return {
      id,
      blueprintId,
      blueprintVersionId,
      blueprintVersion: revisionOfBlueprintVersionId ? null : 1,
      blueprintVersionSnapshot: blueprint(versionTitle),
      blueprint: blueprint(versionTitle),
      blueprintStableKey: `mysql-integration:${blueprintId}`,
      revisionOfBlueprintVersionId,
      creatorUserId: editorId,
      idempotencyKey: `mysql-integration-${id}`,
      requestSha256: fixedHash(revisionOfBlueprintVersionId ? 'b' : 'a'),
      status: 'SUCCEEDED',
      seed: `seed-${id}`,
      engineVersion: 'integration-test',
      selectionSha256: fixedHash('c'),
      selectionManifest: { sections: [] },
      sourceDistribution: {},
      studentSnapshot: { schemaVersion: '1.0.0', sections: [] },
      scoringSnapshot: { schemaVersion: '1.0.0', questions: [] },
      snapshotSha256: fixedHash('d'),
      auditId,
      createdAt
    };
  };

  try {
    await pool.execute(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES (?, ?, 'Integration Editor', 'fixture'), (?, ?, 'Integration Reviewer', 'fixture')`,
      [editorId, `${editorId}@example.test`, reviewerId, `${reviewerId}@example.test`]
    );
    const firstFixture = runFixture({
      versionTitle: 'Blueprint MySQL revision v1',
      createdAt: new Date('2026-11-08T08:00:00Z')
    });
    const first = await repository.createRun(firstFixture);
    assert.equal(first.run.blueprintVersion, 1);
    assert.equal(first.run.blueprintId, blueprintId);
    await pool.execute(
      "UPDATE exam_blueprint_versions SET approval_status = 'REJECTED' WHERE id = ?",
      [first.run.blueprintVersionId]
    );

    const secondFixture = runFixture({
      versionTitle: 'Blueprint MySQL revision v2',
      revisionOfBlueprintVersionId: first.run.blueprintVersionId,
      createdAt: new Date('2026-11-08T08:01:00Z')
    });
    const second = await repository.createRun(secondFixture);
    const retry = await repository.createRun(secondFixture);
    assert.equal(second.run.blueprintVersion, 2);
    assert.equal(second.run.blueprintId, blueprintId);
    assert.equal(retry.duplicate, true);
    assert.equal(retry.run.id, second.run.id);

    const owned = await repository.listOwnedQueue({
      creatorUserId: editorId,
      status: 'NEEDS_REVIEW',
      purpose: 'PRACTICE',
      query: 'revision v2',
      page: 1,
      limit: 10
    });
    assert.equal(owned.total, 1);
    assert.equal(owned.items[0].blueprintVersion, 2);
    assert.equal(owned.items[0].creator.displayName, 'Integration Editor');
    assert.equal(JSON.stringify(owned).includes('scoringSnapshot'), false);
    assert.equal(JSON.stringify(owned).includes('studentSnapshot'), false);

    const reviewQueue = await repository.listReviewQueue({
      reviewerUserId: reviewerId,
      status: 'NEEDS_REVIEW',
      purpose: null,
      query: '',
      page: 1,
      limit: 10
    });
    assert.equal(reviewQueue.total, 1);
    assert.equal(reviewQueue.items[0].id, second.run.id);

    const staleFixture = runFixture({
      versionTitle: 'Blueprint stale revision',
      revisionOfBlueprintVersionId: first.run.blueprintVersionId,
      createdAt: new Date('2026-11-08T08:02:00Z')
    });
    await assert.rejects(
      repository.createRun(staleFixture),
      (error) => error.code === 'BLUEPRINT_REVISION_STALE'
    );
    const blockedFixture = runFixture({
      versionTitle: 'Blueprint blocked revision',
      revisionOfBlueprintVersionId: second.run.blueprintVersionId,
      createdAt: new Date('2026-11-08T08:03:00Z')
    });
    await assert.rejects(
      repository.createRun(blockedFixture),
      (error) => error.code === 'BLUEPRINT_REVISION_BLOCKED'
    );
  } finally {
    if (auditIds.length > 0) await pool.query('DELETE FROM audit_logs WHERE id IN (?)', [auditIds]);
    if (createdIds.length > 0) await pool.query('DELETE FROM assembly_runs WHERE id IN (?)', [createdIds]);
    if (versionIds.length > 0) await pool.query('DELETE FROM exam_blueprint_versions WHERE id IN (?)', [versionIds]);
    await pool.execute('DELETE FROM exam_blueprints WHERE id = ?', [blueprintId]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [[editorId, reviewerId]]);
    await pool.end();
  }
});
