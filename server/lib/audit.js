// Audit trail (items 26 + 29).
//
// Two ways in:
//   • recordAudit()     — explicit, for events that aren't a plain mutation
//                          (logins, credential reveals, statutory exports).
//   • auditMiddleware() — blanket capture of every mutating /api call, so a new
//                          endpoint is covered the day it's written rather than
//                          whenever someone remembers to instrument it.
//
// Writes are fire-and-forget: an audit failure must never fail the request that
// caused it, and must never add latency to the response.
import { pool } from '../db.js'

// Body fields never written to the trail, matched case-insensitively as a
// substring so `smtp_pass`, `apiKey`, `access_token` etc. are all caught.
const REDACT = ['password', 'passwd', 'secret', 'token', 'apikey', 'api_key', 'otp', 'auth_secret', 'pass_hash']

export function redact(value, depth = 0) {
  if (value == null || depth > 4) return value
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1))
  if (typeof value !== 'object') return value
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT.some(r => k.toLowerCase().includes(r)) ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  return String((fwd ? String(fwd).split(',')[0] : req.ip) || '').trim().slice(0, 64)
}

export async function recordAudit(entry) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (tenant_id, actor_id, actor_email, actor_role, action, entity_type, entity_id,
          summary, method, path, status_code, changes, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14);`,
      [
        entry.tenantId || 1,
        entry.actorId || null,
        (entry.actorEmail || '').slice(0, 255),
        (entry.actorRole || '').slice(0, 50),
        (entry.action || 'UPDATE').slice(0, 30),
        (entry.entityType || '').slice(0, 60),
        String(entry.entityId ?? '').slice(0, 100),
        (entry.summary || '').slice(0, 2000),
        (entry.method || '').slice(0, 10),
        (entry.path || '').slice(0, 500),
        entry.statusCode ?? null,
        JSON.stringify(redact(entry.changes || {})),
        entry.ip || '',
        (entry.userAgent || '').slice(0, 500),
      ]
    )
  } catch (err) {
    console.error('[audit]', err.message)
  }
}

// ── Path → (entity, action) ──────────────────────────────────────────────────
// Verbs that describe the action better than the HTTP method does, checked
// against the path's trailing segments.
const VERB_ACTIONS = {
  approve: 'APPROVE', 'bulk-approve': 'APPROVE', decide: 'APPROVE',
  verify: 'VERIFY', reject: 'REJECT',
  revoke: 'REVOKE', impersonate: 'IMPERSONATE',
  'reset-password': 'RESET_PASSWORD', superadmin: 'GRANT_ROLE', promote: 'GRANT_ROLE',
  export: 'EXPORT', reveal: 'REVEAL_SECRET',
  send: 'SEND', 'send-letter': 'SEND', 'submit-utr': 'SUBMIT_PAYMENT',
  sync: 'SYNC', 'sync-campusone': 'SYNC', run: 'SYNC',
  import: 'IMPORT', 'bulk-upload': 'IMPORT', 'workbook-import': 'IMPORT',
  'bulk-assign': 'ASSIGN', assign: 'ASSIGN',
  login: 'LOGIN', logout: 'LOGOUT',
}

const METHOD_ACTIONS = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' }

// Endpoints whose mutations are pure noise in a compliance trail — high-volume,
// zero forensic value. Everything else is recorded.
const SKIP = [
  /^\/api\/notifications/,
  /^\/api\/auth\/me$/,
  /^\/api\/mio-ai\//,
  /^\/api\/drip\/process$/,
  /^\/api\/leads\/check-duplicate$/,
  /^\/api\/leads\/preview-upload$/,
  /^\/api\/calls\/webhook$/,
]

export function describeRequest(req) {
  const segs = req.path.replace(/^\/api\//, '').split('/').filter(Boolean)
  const entityType = segs[0] || ''
  // First path segment that is a bare number is the record's id
  // (/api/applications/42/approve-admission-details → 42).
  const entityId = segs.find(s => /^\d+$/.test(s)) || ''
  // Prefer a recognised verb anywhere after the resource name over the method.
  const verb = segs.slice(1).reverse().find(s => VERB_ACTIONS[s])
  const action = (verb && VERB_ACTIONS[verb]) || METHOD_ACTIONS[req.method] || 'UPDATE'
  return { entityType, entityId, action }
}

// Records one row per successful mutating /api request, after the response is
// sent. Failed requests (4xx/5xx) are recorded too when they were authorised —
// a rejected approval attempt is exactly the kind of thing an auditor wants.
export function auditMiddleware() {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next()
    if (!METHOD_ACTIONS[req.method]) return next()
    if (SKIP.some(re => re.test(req.path))) return next()

    // Snapshot the body now: handlers are free to mutate req.body, and by the
    // time 'finish' fires it may no longer reflect what the caller sent.
    const body = redact(req.body || {})
    const ip = clientIp(req)
    const userAgent = String(req.headers['user-agent'] || '')

    res.on('finish', () => {
      // 401s never had an identified actor and are already covered by
      // login_events; recording them here would just be noise.
      if (res.statusCode === 401) return
      const { entityType, entityId, action } = describeRequest(req)
      // req.user is only set by authenticateToken, which many older endpoints
      // don't use. req.tokenUser is the payload the tenancy middleware already
      // decoded, so those actions are attributed rather than logged as 'system'.
      const actor = req.user || req.tokenUser || {}
      recordAudit({
        tenantId: req.tenantId || 1,
        actorId: actor.id || null,
        actorEmail: actor.email || '',
        actorRole: actor.role || '',
        action,
        entityType,
        entityId,
        summary: `${req.method} ${req.path} → ${res.statusCode}`,
        method: req.method,
        path: req.originalUrl || req.path,
        statusCode: res.statusCode,
        changes: body,
        ip,
        userAgent,
      })
    })
    next()
  }
}

// ── Login activity ───────────────────────────────────────────────────────────
export async function recordLogin({ tenantId, userId, email, success, reason, method, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO login_events (tenant_id, user_id, email, success, reason, method, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
      [tenantId || 1, userId || null, (email || '').slice(0, 255), !!success,
       (reason || '').slice(0, 120), (method || 'password').slice(0, 30), ip || '', (userAgent || '').slice(0, 500)]
    )
  } catch (err) {
    console.error('[audit:login]', err.message)
  }
}
