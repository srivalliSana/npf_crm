// Revocable sessions (item 29 — authentication).
//
// The app signs a stateless 7-day JWT, which means a compromised or shared
// token stays valid for a week with no way to withdraw it. Every token now
// carries a `jti` backed by a user_sessions row, and authenticateToken rejects
// tokens whose jti has been revoked — so "Sign out everywhere" and an admin
// killing one suspicious session both actually work.
//
// The revoked set is cached in memory and refreshed on a timer rather than
// queried per request: this sits on the hot path for every authenticated call,
// and a few seconds of lag on a revoke is an acceptable trade for not adding a
// round-trip to every request. Local revokes apply instantly.
import crypto from 'crypto'
import { pool } from '../db.js'

const REFRESH_MS = 30_000
let _revoked = new Set()
let _lastRefresh = 0
let _refreshing = null

export const newJti = () => crypto.randomBytes(16).toString('hex')

async function refreshRevoked(force = false) {
  if (!force && Date.now() - _lastRefresh < REFRESH_MS) return
  if (_refreshing) return _refreshing
  _refreshing = (async () => {
    try {
      // Only live-but-revoked tokens matter; an expired one is rejected by jwt
      // itself, so there's no reason to carry it in memory forever.
      const r = await pool.query(
        `SELECT jti FROM user_sessions
         WHERE revoked_at IS NOT NULL AND (expires_at IS NULL OR expires_at > NOW());`
      )
      _revoked = new Set(r.rows.map(x => x.jti))
      _lastRefresh = Date.now()
    } catch (err) {
      console.error('[sessions:refresh]', err.message)
    } finally {
      _refreshing = null
    }
  })()
  return _refreshing
}

// Called synchronously from the auth middleware. Kicks off a background
// refresh when the cache is stale but answers from the current set — never
// blocking the request on a query.
export function isRevoked(jti) {
  if (!jti) return false
  if (Date.now() - _lastRefresh >= REFRESH_MS) refreshRevoked()
  return _revoked.has(jti)
}

export async function issueSession({ tenantId, userId, email, jti, method, ip, userAgent, ttlDays = 7 }) {
  try {
    await pool.query(
      `INSERT INTO user_sessions (tenant_id, user_id, email, jti, login_method, ip, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + ($8 || ' days')::interval)
       ON CONFLICT (jti) DO NOTHING;`,
      [tenantId || 1, userId || null, (email || '').slice(0, 255), jti,
       (method || 'password').slice(0, 30), (ip || '').slice(0, 64),
       (userAgent || '').slice(0, 500), String(ttlDays)]
    )
  } catch (err) {
    console.error('[sessions:issue]', err.message)
  }
}

// Throttled per-jti so an active user doesn't generate an UPDATE per request.
const _touched = new Map()
const TOUCH_MS = 5 * 60_000
export function touchSession(jti) {
  if (!jti) return
  const last = _touched.get(jti) || 0
  if (Date.now() - last < TOUCH_MS) return
  _touched.set(jti, Date.now())
  // Bound the map: without this it grows one entry per token ever seen.
  if (_touched.size > 5000) {
    const cutoff = Date.now() - TOUCH_MS
    for (const [k, v] of _touched) if (v < cutoff) _touched.delete(k)
  }
  pool.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE jti = $1;', [jti])
    .catch(() => {})
}

export async function revokeSession({ jti, tenantId, revokedBy }) {
  const r = await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW(), revoked_by = $1
     WHERE jti = $2 AND tenant_id = $3 AND revoked_at IS NULL
     RETURNING id, email;`,
    [(revokedBy || '').slice(0, 255), jti, tenantId || 1]
  )
  if (r.rows[0]) _revoked.add(jti)
  return r.rows[0] || null
}

export async function revokeAllForUser({ userId, tenantId, revokedBy, exceptJti = null }) {
  const r = await pool.query(
    `UPDATE user_sessions SET revoked_at = NOW(), revoked_by = $1
     WHERE user_id = $2 AND tenant_id = $3 AND revoked_at IS NULL
       AND ($4::text IS NULL OR jti <> $4)
     RETURNING jti;`,
    [(revokedBy || '').slice(0, 255), userId, tenantId || 1, exceptJti]
  )
  for (const row of r.rows) _revoked.add(row.jti)
  return r.rows.length
}

// Prime the cache at boot so revocations made while the process was down are
// honoured from the first request.
export const primeSessionCache = () => refreshRevoked(true)
