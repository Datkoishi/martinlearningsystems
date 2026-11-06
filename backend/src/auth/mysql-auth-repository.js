const mapUser = (row, roles = []) => row && ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  passwordHash: row.password_hash,
  status: row.status,
  roles
});

export class MysqlAuthRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async rolesForUser(userId, executor = this.pool) {
    const [rows] = await executor.execute('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role', [userId]);
    return rows.map((row) => row.role);
  }

  async findUserByEmail(email) {
    const [rows] = await this.pool.execute(
      'SELECT id, email, display_name, password_hash, status FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (!rows[0]) return null;
    return mapUser(rows[0], await this.rolesForUser(rows[0].id));
  }

  async createSession(session) {
    await this.pool.execute(
      `INSERT INTO auth_sessions
        (id, user_id, token_hash, csrf_token_hash, expires_at, last_seen_at, user_agent_hash, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.id, session.userId, session.tokenHash, session.csrfTokenHash, session.expiresAt, session.lastSeenAt, session.userAgentHash, session.ipHash]
    );
    return session;
  }

  async findActiveSession(tokenHash, now) {
    const [rows] = await this.pool.execute(
      `SELECT s.id AS session_id, s.csrf_token_hash, s.expires_at,
              u.id, u.email, u.display_name, u.password_hash, u.status
       FROM auth_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
       LIMIT 1`,
      [tokenHash, now]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].session_id,
      csrfTokenHash: rows[0].csrf_token_hash,
      expiresAt: rows[0].expires_at,
      user: mapUser(rows[0], await this.rolesForUser(rows[0].id))
    };
  }

  async revokeSession(id, revokedAt) {
    await this.pool.execute('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [revokedAt, id]);
  }

  async recordAudit(event) {
    await this.pool.execute(
      `INSERT INTO audit_logs
        (id, actor_user_id, event_type, resource_type, resource_id, outcome, details_json)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      [event.id, event.actorUserId, event.eventType, event.resourceType, event.resourceId, event.outcome, JSON.stringify(event.details)]
    );
  }

  async createUser({ id, email, displayName, passwordHash, roles }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO users (id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, \'ACTIVE\')',
        [id, email, displayName, passwordHash]
      );
      for (const role of roles) {
        await connection.execute(
          'INSERT INTO user_roles (user_id, role, scope_type) VALUES (?, ?, \'GLOBAL\')',
          [id, role]
        );
      }
      await connection.commit();
      return this.findUserByEmail(email);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
