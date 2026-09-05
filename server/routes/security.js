// Item 29 — Security: role-based access, authentication, backup, audit logs, encryption.
import express from 'express'
import fs from 'fs'
import path from 'path'
import { pool } from '../db.js'
import { authenticateToken } from '../lib/auth.js'
import { requirePermission, PERMISSIONS, ROLE_DEFAULTS, PERMISSION_KEYS, getEffectivePermissions, invalidatePermissionCache } from '../lib/permissions.js'
import { recordAudit, clientIp } from '../lib/audit.js'
import { revokeSession, revokeAllForUser } from '../lib/sessions.js'

const router = express.Router()
router.use(authenticateToken)

const clampLimit = (v, def = 50, max = 500) => Math.min(max, Math.max(1, parseInt(v) || def))

// ── What the signed-in user may do ───────────────────────────────────────────
// The frontend calls this once after login so it can gate menus and buttons on
// real permissions instead of guessing from the role name.
router.get('/me/permissions', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT role, is_superadmin, is_platform_admin FROM users WHERE id = $1;', [req.user.id]
    )
    const row = r.rows[0] || {}
    res.json({
      role: row.role || req.user.role || '',
      isSuperAdmin: !!row.is_superadmin,
      isPlatformAdmin: !!row.is_platform_admin,
      permissions: await getEffectivePermissions({ ...req.user, ...row }),
    })
  } catch (err) {
    console.error('[security/me/permissions]', err.message)
    res.status(500).json({ error: 'Failed to resolve permissions.' })
  }
})

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/overview', requirePermission('security.view'), async (req, res) => {
  const t = [req.tenantId]
  try {
    const [users, sessions, logins24, failed24, auditToday, topActors, encRes] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
               SUM(CASE WHEN status='Active'   THEN 1 ELSE 0 END)::int AS active,
               SUM(CASE WHEN status='Inactive' THEN 1 ELSE 0 END)::int AS inactive,
               SUM(CASE WHEN role='Admin'      THEN 1 ELSE 0 END)::int AS admins,
               SUM(CASE WHEN role='Manager'    THEN 1 ELSE 0 END)::int AS managers,
               SUM(CASE WHEN role='Counselor'  THEN 1 ELSE 0 END)::int AS counselors,
               SUM(CASE WHEN role='Finance'    THEN 1 ELSE 0 END)::int AS finance,
               SUM(CASE WHEN is_superadmin     THEN 1 ELSE 0 END)::int AS superadmins
        FROM users WHERE tenant_id = $1;`, t),
      pool.query(`
        SELECT COUNT(*)::int AS c FROM user_sessions
        WHERE tenant_id = $1 AND revoked_at IS NULL AND expires_at > NOW();`, t),
      pool.query(`
        SELECT COUNT(*)::int AS c FROM login_events
        WHERE tenant_id = $1 AND success AND created_at > NOW() - INTERVAL '24 hours';`, t),
      pool.query(`
        SELECT COUNT(*)::int AS c FROM login_events
        WHERE tenant_id = $1 AND NOT success AND created_at > NOW() - INTERVAL '24 hours';`, t),
      pool.query(`
        SELECT COUNT(*)::int AS c FROM audit_logs
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours';`, t),
      pool.query(`
        SELECT actor_email AS email, COUNT(*)::int AS actions
        FROM audit_logs
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days' AND actor_email <> ''
        GROUP BY actor_email ORDER BY actions DESC LIMIT 8;`, t),
      // COUNT(... ) FILTER, not SUM(CASE ...): SUM over zero rows returns NULL,
      // which surfaced as "—" instead of 0 on a tenant with no stored secrets.
      // Connector credentials count too — they use the same encryption scheme.
      pool.query(`
        SELECT (SELECT COUNT(*)::int FROM integration_settings
                 WHERE tenant_id = $1 AND value <> '')
             + (SELECT COUNT(*)::int FROM integration_connectors
                 WHERE tenant_id = $1 AND auth_secret <> '') AS total,
               (SELECT COUNT(*)::int FROM integration_settings
                 WHERE tenant_id = $1 AND value LIKE 'enc:v1:%')
             + (SELECT COUNT(*)::int FROM integration_connectors
                 WHERE tenant_id = $1 AND auth_secret LIKE 'enc:v1:%') AS encrypted;`, t),
    ])

    // Repeated failures against one account in the last hour — the signal worth
    // surfacing, as opposed to a raw failure count that a few typos inflate.
    const bruteForce = await pool.query(`
      SELECT email, COUNT(*)::int AS attempts, MAX(created_at) AS last_attempt
      FROM login_events
      WHERE tenant_id = $1 AND NOT success AND created_at > NOW() - INTERVAL '1 hour'
      GROUP BY email HAVING COUNT(*) >= 5
      ORDER BY attempts DESC LIMIT 10;`, t)

    res.json({
      userStats: users.rows[0],
      activeSessions: sessions.rows[0].c,
      logins24h: logins24.rows[0].c,
      failedLogins24h: failed24.rows[0].c,
      auditEvents24h: auditToday.rows[0].c,
      topActors: topActors.rows,
      suspiciousAccounts: bruteForce.rows,
      encryption: {
        // The key is opt-in via env; without it secrets are stored as plaintext.
        keyConfigured: !!process.env.SETTINGS_ENC_KEY,
        algorithm: 'AES-256-GCM',
        secretsTotal: encRes.rows[0].total,
        secretsEncrypted: encRes.rows[0].encrypted,
        transport: process.env.NODE_ENV === 'production' ? 'TLS 1.2+ (nginx)' : 'plain HTTP (dev)',
      },
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[security/overview]', err.message)
    res.status(500).json({ error: 'Failed to build security overview.' })
  }
})

// ── Audit trail ──────────────────────────────────────────────────────────────
router.get('/audit-logs', requirePermission('audit.view'), async (req, res) => {
  const { action, entityType, actor, from, to, q } = req.query
  const limit = clampLimit(req.query.limit)
  const offset = Math.max(0, parseInt(req.query.offset) || 0)

  const where = ['tenant_id = $1']
  const params = [req.tenantId]
  const add = (clause, value) => { params.push(value); where.push(clause.replace('$?', `$${params.length}`)) }

  if (action)     add('action = $?', action)
  if (entityType) add('entity_type = $?', entityType)
  if (actor)      add('LOWER(actor_email) = LOWER($?)', actor)
  if (from)       add('created_at >= $?', from)
  if (to)         add('created_at <= $?', to)
  if (q) {
    // One bound value referenced three times — `add` only substitutes the first
    // placeholder, so this clause is built directly.
    params.push(`%${q}%`)
    const i = params.length
    where.push(`(summary ILIKE $${i} OR path ILIKE $${i} OR entity_id ILIKE $${i})`)
  }

  const sql = `FROM audit_logs WHERE ${where.join(' AND ')}`
  try {
    const [rows, count, facets] = await Promise.all([
      pool.query(
        `SELECT id, actor_email AS "actorEmail", actor_role AS "actorRole", action,
                entity_type AS "entityType", entity_id AS "entityId", summary,
                method, path, status_code AS "statusCode", changes, ip,
                user_agent AS "userAgent", created_at AS "createdAt"
         ${sql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset};`, params),
      pool.query(`SELECT COUNT(*)::int AS c ${sql};`, params),
      pool.query(`
        SELECT
          (SELECT json_agg(DISTINCT action)      FROM audit_logs WHERE tenant_id = $1) AS actions,
          (SELECT json_agg(DISTINCT entity_type) FROM audit_logs WHERE tenant_id = $1 AND entity_type <> '') AS entities;`,
        [req.tenantId]),
    ])
    res.json({
      rows: rows.rows,
      total: count.rows[0].c,
      limit, offset,
      facets: {
        actions:  (facets.rows[0].actions  || []).filter(Boolean).sort(),
        entities: (facets.rows[0].entities || []).filter(Boolean).sort(),
      },
    })
  } catch (err) {
    console.error('[security/audit-logs]', err.message)
    res.status(500).json({ error: 'Failed to read the audit trail.' })
  }
})

// ── Login activity ───────────────────────────────────────────────────────────
router.get('/login-events', requirePermission('security.view'), async (req, res) => {
  const limit = clampLimit(req.query.limit, 100)
  const only = req.query.status   // 'success' | 'failed' | undefined
  const where = ['tenant_id = $1']
  if (only === 'success') where.push('success')
  if (only === 'failed')  where.push('NOT success')
  try {
    const r = await pool.query(
      `SELECT id, email, success, reason, method, ip, user_agent AS "userAgent", created_at AS "createdAt"
       FROM login_events WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC LIMIT ${limit};`, [req.tenantId])
    res.json(r.rows)
  } catch (err) {
    console.error('[security/login-events]', err.message)
    res.status(500).json({ error: 'Failed to read login activity.' })
  }
})

// ── Sessions ─────────────────────────────────────────────────────────────────
router.get('/sessions', requirePermission('security.view'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT s.id, s.jti, s.email, s.user_id AS "userId", s.login_method AS "loginMethod",
             s.ip, s.user_agent AS "userAgent", s.created_at AS "createdAt",
             s.last_seen_at AS "lastSeenAt", s.expires_at AS "expiresAt",
             u.name, u.role
      FROM user_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.tenant_id = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
      ORDER BY s.last_seen_at DESC LIMIT 200;`, [req.tenantId])
    res.json(r.rows)
  } catch (err) {
    console.error('[security/sessions]', err.message)
    res.status(500).json({ error: 'Failed to list sessions.' })
  }
})

router.post('/sessions/:jti/revoke', requirePermission('security.manage'), async (req, res) => {
  try {
    const killed = await revokeSession({ jti: req.params.jti, tenantId: req.tenantId, revokedBy: req.user.email })
    if (!killed) return res.status(404).json({ error: 'Session not found or already revoked.' })
    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'REVOKE', entityType: 'session', entityId: req.params.jti,
      summary: `Revoked session for ${killed.email}`, ip: clientIp(req),
    })
    res.json({ ok: true, email: killed.email })
  } catch (err) {
    console.error('[security/revoke]', err.message)
    res.status(500).json({ error: 'Failed to revoke session.' })
  }
})

router.post('/users/:id/revoke-sessions', requirePermission('security.manage'), async (req, res) => {
  try {
    const n = await revokeAllForUser({ userId: parseInt(req.params.id), tenantId: req.tenantId, revokedBy: req.user.email })
    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'REVOKE', entityType: 'user', entityId: req.params.id,
      summary: `Signed out all ${n} session(s) for user #${req.params.id}`, ip: clientIp(req),
    })
    res.json({ ok: true, revoked: n })
  } catch (err) {
    console.error('[security/revoke-all]', err.message)
    res.status(500).json({ error: 'Failed to revoke sessions.' })
  }
})

// ── Roles & permissions matrix ───────────────────────────────────────────────
router.get('/permissions', requirePermission('security.view'), async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, description, permissions, is_system AS "isSystem" FROM roles ORDER BY is_system DESC, name;')
    const roles = r.rows.map(row => {
      const stored = Array.isArray(row.permissions) ? row.permissions : []
      return {
        ...row,
        // An empty list means the role predates this catalogue — show what it
        // effectively has (the built-in default) rather than an empty row that
        // wrongly implies the role can do nothing.
        permissions: stored.length ? stored : (ROLE_DEFAULTS[row.name] || []),
        usingDefaults: stored.length === 0,
      }
    })
    const counts = await pool.query(
      'SELECT role, COUNT(*)::int AS c FROM users WHERE tenant_id = $1 GROUP BY role;', [req.tenantId])
    const userCounts = Object.fromEntries(counts.rows.map(x => [x.role, x.c]))
    res.json({ catalogue: PERMISSIONS, roles: roles.map(x => ({ ...x, userCount: userCounts[x.name] || 0 })) })
  } catch (err) {
    console.error('[security/permissions]', err.message)
    res.status(500).json({ error: 'Failed to load the permission matrix.' })
  }
})

router.put('/roles/:id/permissions', requirePermission('roles.manage'), async (req, res) => {
  const incoming = Array.isArray(req.body.permissions) ? req.body.permissions : null
  if (!incoming) return res.status(400).json({ error: 'permissions must be an array.' })
  // Only keys from the catalogue (plus the '*' wildcard) are storable, so a
  // typo can't silently create a permission nothing will ever check.
  const clean = [...new Set(incoming.filter(p => p === '*' || PERMISSION_KEYS.includes(p)))]

  try {
    const before = await pool.query('SELECT name, permissions, is_system FROM roles WHERE id = $1;', [req.params.id])
    const role = before.rows[0]
    if (!role) return res.status(404).json({ error: 'Role not found.' })
    // Locking the Admin role out of '*' would leave nobody able to restore it.
    if (role.name === 'Admin' && !clean.includes('*')) {
      return res.status(400).json({ error: 'The Admin role must keep full access (*).' })
    }

    await pool.query('UPDATE roles SET permissions = $1 WHERE id = $2;', [JSON.stringify(clean), req.params.id])
    invalidatePermissionCache()
    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'UPDATE', entityType: 'role', entityId: req.params.id,
      summary: `Changed permissions for role "${role.name}"`,
      changes: { before: role.permissions, after: clean }, ip: clientIp(req),
    })
    res.json({ ok: true, permissions: clean })
  } catch (err) {
    console.error('[security/roles-permissions]', err.message)
    res.status(500).json({ error: 'Failed to save permissions.' })
  }
})

// ── Backup status ────────────────────────────────────────────────────────────
// Reports what is actually on disk / configured rather than asserting that
// backups are healthy — an unverifiable "all good" is worse than no widget.
router.get('/backups', requirePermission('security.view'), async (req, res) => {
  // backup.sh writes to /var/backups/ccrm/{db,code}; scan the root and those
  // two subdirectories rather than recursing arbitrarily deep.
  const dir = process.env.BACKUP_DIR || '/var/backups/ccrm'
  const files = []
  let dirReadable = false
  for (const sub of ['', 'db', 'code']) {
    const full = sub ? path.join(dir, sub) : dir
    try {
      for (const f of fs.readdirSync(full)) {
        if (!/\.(sql|gz|dump|tar)$/i.test(f)) continue
        const st = fs.statSync(path.join(full, f))
        files.push({ name: sub ? `${sub}/${f}` : f, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() })
      }
      dirReadable = true
    } catch { /* missing or not readable by this process */ }
  }
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  const latest = files[0] || null
  const ageHours = latest ? (Date.now() - Date.parse(latest.modifiedAt)) / 3_600_000 : null

  // Offsite copy: performS3Backup() reads its credentials from
  // integration_settings, not the environment.
  let s3Bucket = null
  try {
    const r = await pool.query(
      `SELECT key, value FROM integration_settings
       WHERE tenant_id = $1 AND key IN ('aws_s3_bucket','aws_access_key_id','aws_secret_access_key');`,
      [req.tenantId])
    const s = Object.fromEntries(r.rows.map(x => [x.key, x.value]))
    if (s.aws_s3_bucket && s.aws_access_key_id && s.aws_secret_access_key) s3Bucket = s.aws_s3_bucket
  } catch { /* fall through — reported as not configured */ }

  res.json({
    directory: dir,
    dirReadable,
    files: files.slice(0, 20),
    latest,
    ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    s3Configured: !!s3Bucket,
    s3Bucket,
    schedule: '03:00 daily (node-cron) + S3 upload',
  })
})

export default router
