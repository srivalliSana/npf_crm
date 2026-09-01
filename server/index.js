import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import XLSXPkg from 'xlsx'
const XLSX = XLSXPkg.default ?? XLSXPkg
import { fileURLToPath } from 'url'
import { pool, initDb, initTenancy } from './db.js'
import cron from 'node-cron'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { promisify } from 'util'
import { exec } from 'child_process'
import axios from 'axios'
const execAsync = promisify(exec)

// Import webhook handlers
import gtechWebhook from './webhooks/gttech.js'
import ftlWebhook from './webhooks/ftl.js'
import gtibWebhook from './webhooks/gtib.js'
import esseWebhook from './webhooks/esse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET || 'ccrm-jwt-secret-key-2026'

// Disable Express ETags globally — hashed asset filenames handle cache-busting
app.set('etag', false)

// Restrict browser cross-origin calls to our own origins (override via CORS_ORIGINS env).
// Server-to-server callers (webhooks, curl) ignore CORS; this blocks malicious sites.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://crm.cutmap.ac.in,https://pay.cutmap.ac.in').split(',').map(s => s.trim())
app.use(cors({
  origin(origin, cb) { cb(null, !origin || CORS_ORIGINS.includes(origin)) },
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// ── Multi-tenant: resolve req.tenantId on every request (non-blocking) ──────────
// Priority: 1) custom domain → tenant_id  2) JWT tenant_id  3) default to Centurion (1)
app.use(async (req, _res, next) => {
  let tid = 1
  req.authValid = false
  try {
    const hostname = req.hostname || ''
    // Check if hostname matches a tenant's custom_domain
    if (hostname && hostname !== 'localhost' && !hostname.startsWith('127.')) {
      try {
        const domainRes = await pool.query(
          'SELECT id FROM tenants WHERE custom_domain = $1 LIMIT 1',
          [hostname]
        )
        if (domainRes.rows.length > 0) {
          tid = domainRes.rows[0].id
        }
      } catch { /* domain lookup failed, fall through to JWT */ }
    }
    // Check JWT (can override domain if explicitly set in token)
    const token = (req.headers['authorization'] || '').split(' ')[1]
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET)
      if (decoded) {
        req.authValid = true
        // JWT tenant_id takes precedence over domain (user logged into specific tenant)
        if (decoded.tenant_id) tid = decoded.tenant_id
      }
    }
  } catch { /* invalid/expired token → use domain or default */ }
  req.tenantId = tid
  next()
})

// ── Lightweight in-memory rate limiter (no extra deps) ──────────────────────────
const rateBuckets = new Map()
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const k = `${req.ip}:${req.baseUrl || req.path}`
    const now = Date.now()
    let b = rateBuckets.get(k)
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; rateBuckets.set(k, b) }
    b.count++
    if (b.count > max) return res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' })
    next()
  }
}
// Prune expired buckets every 10 min so the Map can't grow unbounded
const _rlPrune = setInterval(() => { const now = Date.now(); for (const [k, b] of rateBuckets) if (now > b.reset) rateBuckets.delete(k) }, 600000)
if (_rlPrune.unref) _rlPrune.unref()

// Brute-force protection on auth; generous cap on inbound webhooks
app.use('/api/auth', rateLimit({ windowMs: 60000, max: 30 }))
app.use('/api/webhooks', rateLimit({ windowMs: 60000, max: 300 }))

// ── Global auth gate: every /api route needs a valid JWT except this public allowlist
const PUBLIC_API = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/google$/,
  /^\/api\/webhooks\//,          // all inbound webhooks (Meta, Google, GT forms, rcssms…)
  /^\/api\/public\//,            // public inquiry form
  /^\/api\/student\//,           // student portal login/status
  /^\/api\/tenant\/public$/,     // login/landing branding
  /^\/api\/calls\/webhook$/,     // telephony callback
]
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()          // static / SPA assets
  if (PUBLIC_API.some(re => re.test(req.path))) return next()
  if (!req.authValid) return res.status(401).json({ error: 'Authentication required.' })
  next()
})

// Setup Static and Upload Folders
const uploadDirs = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads', 'avatars'),
  path.join(__dirname, 'uploads', 'documents')
]
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Multer Storage Configuration
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads', 'avatars')),
  filename: (req, file, cb) => cb(null, `avatar_${Date.now()}${path.extname(file.originalname)}`)
})
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads', 'documents')),
  filename: (req, file, cb) => cb(null, `doc_${Date.now()}${path.extname(file.originalname)}`)
})

// Dedicated multer for bulk CSV/Excel uploads — saved to /uploads/bulk-temp
const bulkTempDir = path.join(__dirname, 'uploads', 'bulk-temp')
if (!fs.existsSync(bulkTempDir)) fs.mkdirSync(bulkTempDir, { recursive: true })

const bulkStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, bulkTempDir),
  filename: (req, file, cb) => cb(null, `bulk_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
})
const uploadBulk = multer({
  storage: bulkStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname)
    if (!ok) return cb(new Error('Only CSV and Excel files (.csv, .xlsx, .xls) are allowed.'))
    cb(null, true)
  }
})

const uploadAvatar = multer({ storage: avatarStorage })
const uploadDoc = multer({ storage: docStorage })

// --- JWT AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Access token missing.' })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' })
    req.user = user
    req.tenantId = user.tenant_id || 1   // multi-tenant scope (Phase 1: defaults to Centurion)
    next()
  })
}

// Admin-only middleware (verify JWT then check role from DB)
async function adminOnly(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Access token missing.' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const userRes = await pool.query('SELECT role FROM users WHERE id = $1;', [decoded.id])
    if (!userRes.rows[0] || userRes.rows[0].role !== 'Admin') {
      return res.status(403).json({ error: 'Admin access required.' })
    }
    req.user = decoded
    next()
  } catch {
    res.status(403).json({ error: 'Invalid or expired token.' })
  }
}

// === EASYGO IVR PROVIDER CLASS ===
// Module-level token cache so it persists across the per-request provider
// instances created in /api/calls/initiate. EasyGoIVR tokens last ~1 hour,
// so we cache for 55 min and regenerate (with retry) when one is rejected.
let _easygoToken = { token: null, expiry: 0, key: null }

class EasyGoIVRProvider {
  constructor(email, passwordHash) {
    this.email = email
    this.passwordHash = passwordHash
  }

  // Does a response/error body indicate the token was rejected?
  // Covers EasyGoIVR wordings like "invalid token access" and "Access token missing".
  static isTokenError(data) {
    if (!data) return false
    const s = (typeof data === 'string' ? data : JSON.stringify(data)).toLowerCase()
    return s.includes('invalid token') || s.includes('token expired') ||
           s.includes('token invalid') || s.includes('expired token') ||
           s.includes('access token') || s.includes('token missing') ||
           s.includes('invalid or expired') || s.includes('unauthorized')
  }

  async getToken({ forceRefresh = false } = {}) {
    const key = this.email
    if (!forceRefresh && _easygoToken.token && _easygoToken.key === key && Date.now() < _easygoToken.expiry) {
      return _easygoToken.token
    }
    try {
      const response = await axios.post(
        'https://client.easygoivr.com/masterapiJwt/gentoken',
        {},
        { auth: { username: this.email, password: this.passwordHash } }
      )
      const token = response.data.API_TOKEN || response.data.token
      if (!token) throw new Error('gentoken returned no token')
      // Tokens are valid ~1h; cache for 55 min to refresh before expiry.
      _easygoToken = { token, expiry: Date.now() + 55 * 60 * 1000, key }
      console.log('[EasyGoIVR] New token generated (valid ~1h)')
      return token
    } catch (err) {
      // If the stored credential is itself a JWT, fall back to using it directly.
      // (Best practice: store the account PASSWORD so tokens can auto-refresh.)
      if (this.passwordHash && this.passwordHash.startsWith('eyJ')) {
        console.warn('[EasyGoIVR] gentoken failed; using stored JWT directly. Store the account PASSWORD (not a token) so it can auto-refresh hourly.')
        return this.passwordHash
      }
      console.error('[EasyGoIVR] Token generation failed:', err.response?.data || err.message)
      throw new Error(`EasyGoIVR token generation failed: ${err.response?.data?.msg || err.message}`)
    }
  }

  async initiateCall(extension, phoneNumber, did) {
    console.log('[EasyGoIVR] Call params:', { exten: extension, number: phoneNumber, did })
    const dial = (token) => axios.post(
      'https://client.easygoivr.com/easygoapiJwt/request/dial',
      { exten: extension, number: phoneNumber, did },
      { headers: { 'Content-Type': 'application/json', 'API_TOKEN': token } }
    )

    let token = await this.getToken()
    let response
    try {
      response = await dial(token)
      // Some endpoints return HTTP 200 with an error body for a bad token.
      if (EasyGoIVRProvider.isTokenError(response.data)) {
        console.warn('[EasyGoIVR] Token rejected in body — regenerating and retrying')
        token = await this.getToken({ forceRefresh: true })
        response = await dial(token)
      }
    } catch (err) {
      const status = err.response?.status
      if (EasyGoIVRProvider.isTokenError(err.response?.data) || status === 401 || status === 403) {
        console.warn('[EasyGoIVR] Token rejected — regenerating and retrying once')
        token = await this.getToken({ forceRefresh: true })
        response = await dial(token)
      } else {
        console.error('[EasyGoIVR] Call failed:', err.response?.data || err.message)
        throw new Error(`Failed to initiate call: ${err.response?.data?.msg || err.message}`)
      }
    }

    console.log('[EasyGoIVR] Call response:', response.data)
    return {
      success: true,
      callId: response.data.call_id || response.data.id || `${Date.now()}`,
      timestamp: new Date(),
      data: response.data
    }
  }
}

// ── CLEAN JUNK LEADS — remove rows where name is a course / invalid ─────────
// GET = dry-run preview (count + sample). POST = actually delete.
const JUNK_LEAD_SQL = `
  FROM leads
  WHERE
    -- name looks like a course/program rather than a person
    name ~* '^(m\\.?\\s?sc|b\\.?\\s?sc|b\\.?\\s?tech|m\\.?\\s?tech|mba|bba|bca|mca|b\\.?\\s?com|m\\.?\\s?com|ph\\.?d|diploma|llb|llm|pharm|nursing|genetics|genomics)'
    -- or name is empty / placeholder
    OR name IS NULL OR TRIM(name) = '' OR LOWER(name) IN ('unnamed','unnamed lead','na','n/a')
    -- or name has fewer than 3 letters
    OR LENGTH(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g')) < 3
    -- or mobile is invalid
    OR mobile IS NULL OR LENGTH(REGEXP_REPLACE(mobile, '[^0-9]', '', 'g')) < 10
`

app.get('/api/admin/clean-junk-leads', adminOnly, async (req, res) => {
  try {
    const countRes  = await pool.query(`SELECT COUNT(*)::int AS c ${JUNK_LEAD_SQL};`)
    const sampleRes = await pool.query(`SELECT id, name, mobile, course, owner ${JUNK_LEAD_SQL} LIMIT 15;`)
    res.json({ count: countRes.rows[0].c, sample: sampleRes.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/admin/clean-junk-leads', adminOnly, async (req, res) => {
  const { confirmPhrase } = req.body
  if (confirmPhrase !== 'DELETE JUNK') {
    return res.status(400).json({ error: 'Send { confirmPhrase: "DELETE JUNK" }' })
  }
  try {
    const r = await pool.query(`DELETE ${JUNK_LEAD_SQL} RETURNING id;`)
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
      [`Cleaned up ${r.rowCount} junk leads (course-as-name / invalid mobile)`, 'Just now'])
    res.json({ ok: true, deleted: r.rowCount })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PER-MODULE RESET — wipe one module's data (admin only) ──────────────────
app.post('/api/admin/reset-module', adminOnly, async (req, res) => {
  const { module: mod, confirmPhrase } = req.body
  if (confirmPhrase !== 'RESET MODULE') {
    return res.status(400).json({ error: 'Send { module, confirmPhrase: "RESET MODULE" }' })
  }

  // Whitelist of module → tables to truncate
  const MODULE_TABLES = {
    campaigns:   ['campaigns'],
    payments:    ['payments'],
    documents:   ['documents'],
    notifications: ['notifications'],
    email_logs:    ['email_logs'],
    whatsapp_logs: ['whatsapp_logs'],
    call_logs:     ['call_logs'],
    tasks:         ['tasks'],
    events:        ['events'],
    queries:       ['queries'],
    drip_sequences:['drip_sequences'],
  }
  const tables = MODULE_TABLES[mod]
  if (!tables) return res.status(400).json({ error: `Unknown module: ${mod}. Allowed: ${Object.keys(MODULE_TABLES).join(', ')}` })

  try {
    const counts = {}
    for (const t of tables) {
      try {
        const c = await pool.query(`SELECT COUNT(*) FROM ${t};`)
        counts[t] = parseInt(c.rows[0].count)
        await pool.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE;`)
      } catch (e) {
        console.warn(`[reset-module] skip ${t}: ${e.message}`)
      }
    }
    res.json({ ok: true, module: mod, wiped: counts })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PRODUCTION DATA RESET — wipes operational data, keeps users/settings ────
app.post('/api/admin/reset-production', adminOnly, async (req, res) => {
  const { confirmPhrase } = req.body
  if (confirmPhrase !== 'RESET FOR PRODUCTION') {
    return res.status(400).json({
      error: 'Confirmation phrase mismatch. Send { confirmPhrase: "RESET FOR PRODUCTION" } exactly.'
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Wipe operational tables (CASCADE handles foreign keys)
    const tables = [
      'email_logs', 'email_campaigns', 'whatsapp_logs', 'call_logs',
      'drip_sequences', 'documents', 'queries', 'tasks', 'events',
      'notifications', 'payments', 'applications', 'leads'
    ]
    const counts = {}
    for (const t of tables) {
      try {
        const c = await client.query(`SELECT COUNT(*) FROM ${t};`)
        counts[t] = parseInt(c.rows[0].count)
        await client.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE;`)
      } catch (e) {
        console.warn(`[Reset] Skip ${t}: ${e.message}`)
      }
    }

    // Reset application-number sequence
    await client.query(`SELECT setval('cueeap_seq', 1, false);`).catch(() => {})

    // Reset round-robin assignment counters (keep rows)
    await client.query(`UPDATE lead_assignment_counter SET assignment_count = 0, last_assigned = NULL;`)

    await client.query('COMMIT')

    res.json({
      success: true,
      message: 'Production reset complete.',
      wiped: counts,
      kept: ['users', 'integration_settings', 'admission_targets', 'lead_assignment_counter (counts reset)'],
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[Reset Production]', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// --- SMTP ALERT MAILER SENDER ---
// ── Nodemailer transporter — lazy-loaded so missing package won't crash server ─
async function createMailTransporter(tenantId = 1) {
  const host     = await getIntegrationSetting('smtp_host', tenantId)      || process.env.SMTP_HOST     || ''
  const port     = parseInt(await getIntegrationSetting('smtp_port', tenantId) || process.env.SMTP_PORT || '587')
  const user     = await getIntegrationSetting('smtp_user', tenantId)      || process.env.SMTP_USER     || ''
  const pass     = await getIntegrationSetting('smtp_pass', tenantId)      || process.env.SMTP_PASS     || ''
  const fromName = await getIntegrationSetting('smtp_from_name', tenantId) || 'CUTM Admissions'

  // Return specific missing-field info so errors are actionable
  const missing = []
  if (!host) missing.push('SMTP Host (smtp.gmail.com)')
  if (!user) missing.push('Gmail Address')
  if (!pass) missing.push('App Password')
  if (missing.length > 0) {
    const msg = `Missing SMTP fields: ${missing.join(', ')} — go to Integrations → Gmail/SMTP Email and re-save`
    console.warn('[Mail]', msg)
    return { error: msg }
  }

  let nodemailer
  try {
    nodemailer = (await import('nodemailer')).default
  } catch {
    return { error: 'nodemailer not installed on server — run: cd /var/www/ccrm/server && npm install' }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  })
  return { transporter, from: `"${fromName}" <${user}>`, error: null }
}

// Fire-and-forget alert email (counselor notifications, OTPs, etc.)
async function sendSystemMailAlert(recipient, subject, messageBody, tenantId = 1) {
  console.log(`[Mail] To: ${recipient} | Sub: ${subject}`)
  try {
    const cfg = await createMailTransporter(tenantId)
    if (cfg.error) { console.warn('[Mail] Skipped —', cfg.error); return }
    await cfg.transporter.sendMail({ from: cfg.from, to: recipient, subject, text: messageBody })
    console.log(`[Mail] Sent to ${recipient}`)
  } catch (e) {
    console.error(`[Mail] Failed for ${recipient}:`, e.message)
  }
}

// Tracked campaign send — writes result to email_logs
async function sendTrackedMail(recipient, recipientName, subject, messageBody, campaignId, campaignName, tenantId = 1) {
  const logErr = async (err) => pool.query(
    'INSERT INTO email_logs (campaign_id, campaign_name, recipient_email, recipient_name, status, error_message, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [campaignId, campaignName, recipient, recipientName, 'Failed', err, tenantId]
  ).catch(() => {})

  try {
    const cfg = await createMailTransporter(tenantId)
    if (cfg.error) {
      await logErr(cfg.error)
      return { success: false, error: cfg.error }
    }
    await cfg.transporter.sendMail({ from: cfg.from, to: recipient, subject, text: messageBody })
    await pool.query(
      'INSERT INTO email_logs (campaign_id, campaign_name, recipient_email, recipient_name, status, error_message, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [campaignId, campaignName, recipient, recipientName, 'Sent', '', tenantId]
    ).catch(() => {})
    return { success: true, error: '' }
  } catch (e) {
    const errMsg = e.message.substring(0, 500)
    console.error(`[Tracked Mail] Failed for ${recipient}:`, errMsg)
    await logErr(errMsg)
    return { success: false, error: errMsg }
  }
}

// --- NOTIFICATION & ALERT HELPERS ---

// Create a per-user in-app notification (userEmail=null → visible to all admins)
async function createNotification(userEmail, title, text, type = 'info', leadId = null, tenantId = 1) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_email, title, text, type, lead_id, time, unread, created_at, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), $7);',
      [userEmail || null, (title || text || '').substring(0, 255), text, type, leadId, 'Just now', tenantId]
    )
  } catch (err) {
    console.error('[createNotification]', err.message)
  }
}

// Fetch a single integration setting from DB (per-tenant; defaults to Centurion=1)
async function getIntegrationSetting(key, tenantId = 1) {
  try {
    const r = await pool.query('SELECT value FROM integration_settings WHERE key = $1 AND tenant_id = $2;', [key, tenantId])
    return decryptSecret(r.rows[0]?.value) || null
  } catch { return null }
}

// Alert a counselor via in-app notification + email + WhatsApp when a lead is assigned
async function alertCounselor(assigneeName, leadName, course, source, leadId, tenantId = 1) {
  if (!assigneeName || assigneeName === 'Unassigned') return
  try {
    // Look up counselor's email + mobile
    const userRes = await pool.query('SELECT email, mobile FROM users WHERE name = $1 AND tenant_id = $2 LIMIT 1;', [assigneeName, tenantId])
    const counselor = userRes.rows[0]
    if (!counselor) return

    const title = `New lead assigned: ${leadName}`
    const text = `${leadName} (${course}) — Source: ${source}`

    // 1. In-app notification (targeted to counselor)
    await createNotification(counselor.email, title, text, 'lead_assigned', leadId, tenantId)

    // 2. Email alert via SMTP/msmtp
    sendSystemMailAlert(
      counselor.email,
      `[CCRM] New Lead Assigned: ${leadName}`,
      `Hello ${assigneeName},\n\nA new lead has been assigned to you in CCRM:\n\nName: ${leadName}\nCourse: ${course}\nSource: ${source}\n\nPlease log in to follow up:\nhttps://crm.cutmap.ac.in/leads\n\nBest regards,\nCCRM Admissions System`,
      tenantId
    )

    // 3. WhatsApp alert to counselor's mobile (if WA API configured + counselor has mobile)
    const waToken = await getIntegrationSetting('whatsapp_access_token', tenantId)
    const waPhoneId = await getIntegrationSetting('whatsapp_phone_number_id', tenantId)
    if (waToken && waPhoneId && counselor.mobile) {
      const mobile = counselor.mobile.replace(/\D/g, '')
      if (mobile.length >= 10) {
        fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: mobile.startsWith('91') ? mobile : `91${mobile}`,
            type: 'text',
            text: { body: `🎓 *CCRM Alert*\n\nNew lead assigned to you:\n*${leadName}*\nCourse: ${course}\nSource: ${source}\n\nLog in: https://crm.cutmap.ac.in` }
          })
        }).catch(e => console.error('[WA Counselor Alert]', e.message))
      }
    }
  } catch (err) {
    console.error('[alertCounselor]', err.message)
  }
}

// --- AUTH ROUTERS ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password, tenantSlug } = req.body
  try {
    // Email is unique per tenant, not globally — resolve which tenant this
    // URL belongs to (defaults to Centurion when no slug) and look up the
    // account within that tenant specifically, so the same email can have
    // a fully separate account in a different tenant.
    const lookupTenantId = await resolveSlugTenant(tenantSlug)
    let userRes = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2;',
      [email, lookupTenantId]
    )
    if (userRes.rows.length === 0 && tenantSlug) {
      // No account in *this* tenant — but a platform admin's own account
      // (whichever tenant it actually belongs to) may still sign in through
      // any tenant's URL, so they can reach every tenant's portal.
      userRes = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_platform_admin = TRUE LIMIT 1;',
        [email]
      )
    }
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' })
    }

    const user = userRes.rows[0]
    if (user.password !== password) {
      return res.status(400).json({ error: 'Invalid email or password.' })
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Account is inactive. Please contact administrator.' })
    }
    const tStat = await pool.query('SELECT status FROM tenants WHERE id = $1;', [user.tenant_id || 1])
    if (tStat.rows[0] && tStat.rows[0].status !== 'Active') {
      return res.status(403).json({ error: 'This organization is suspended. Please contact support.' })
    }

    const lastLoginStr = new Date().toLocaleString('en-IN', { hour12: true })
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2;', [lastLoginStr, user.id])
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id || 1, is_platform_admin: !!user.is_platform_admin }, JWT_SECRET, { expiresIn: '7d' })
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        picture: user.picture,
        status: user.status,
        mobile_number: user.mobile_number,
        entities: user.entities || 'CUTM',
        isSuperAdmin: !!user.is_superadmin,
        isPlatformAdmin: !!user.is_platform_admin,
        lastLogin: lastLoginStr
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Database authentication failed.' })
  }
})

// --- GOOGLE OAUTH SIGN-IN / UPSERT ---
app.post('/api/auth/google', async (req, res) => {
  const { email, name, picture, tenantSlug } = req.body
  if (!email) return res.status(400).json({ error: 'Email required.' })
  try {
    const lastLoginStr = new Date().toLocaleString('en-IN', { hour12: true })
    // Email is unique per tenant, not globally — resolve which tenant this
    // URL belongs to (defaults to Centurion when no slug) and look up/create
    // the account within that tenant specifically, so the same email can
    // have a fully separate account in a different tenant.
    const lookupTenantId = await resolveSlugTenant(tenantSlug)

    let existing = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2;',
      [email, lookupTenantId]
    )
    if (existing.rows.length === 0 && tenantSlug) {
      // No account in *this* tenant — but a platform admin's own account
      // (whichever tenant it actually belongs to) may still sign in through
      // any tenant's URL, so they can reach every tenant's portal.
      existing = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_platform_admin = TRUE LIMIT 1;',
        [email]
      )
    }

    let user
    if (existing.rows.length > 0) {
      // Update last_login and picture; preserve role/team/status
      const u = existing.rows[0]
      if (u.status !== 'Active') {
        return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' })
      }
      const tStat = await pool.query('SELECT status FROM tenants WHERE id = $1;', [u.tenant_id || 1])
      if (tStat.rows[0] && tStat.rows[0].status !== 'Active') {
        return res.status(403).json({ error: 'This organization is suspended. Please contact support.' })
      }
      await pool.query(
        'UPDATE users SET last_login = $1, picture = COALESCE(NULLIF($2,\'\'), picture) WHERE id = $3;',
        [lastLoginStr, picture || '', u.id]
      )
      user = { ...u, last_login: lastLoginStr, picture: picture || u.picture }
    } else {
      // New Google user for THIS tenant specifically (even if the same email
      // already has an account in a different tenant) — only routed in if
      // this tenant's own allowed_domains include the email's domain.
      const domain = (email.split('@')[1] || '').toLowerCase()
      const tRes = await pool.query(
        "SELECT id FROM tenants WHERE id = $1 AND status = 'Active' AND (',' || lower(replace(allowed_domains, ' ', '')) || ',') LIKE ('%,' || $2 || ',%') LIMIT 1;",
        [lookupTenantId, domain]
      )
      const newTenantId = tRes.rows[0]?.id
      if (!newTenantId) {
        return res.status(403).json({ error: 'Your email domain is not authorized to sign in. Contact your administrator.' })
      }
      const insert = await pool.query(`
        INSERT INTO users (name, email, password, role, team, status, last_login, picture, tenant_id)
        VALUES ($1, $2, $3, 'Counselor', 'Sales', 'Active', $4, $5, $6)
        RETURNING *;
      `, [name || email.split('@')[0], email, `google_${Date.now()}`, lastLoginStr, picture || '', newTenantId])
      user = insert.rows[0]

      // Add to round-robin assignment counter
      await pool.query(
        'INSERT INTO lead_assignment_counter (counselor_name, counselor_email, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (counselor_name) DO NOTHING;',
        [user.name, user.email, newTenantId]
      )
      await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
        [`New user registered via Google: ${user.name} (${user.email}) — role: Counselor`, 'Just now', newTenantId])
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id || 1, is_platform_admin: !!user.is_platform_admin }, JWT_SECRET, { expiresIn: '7d' })
    res.json({
      token,
      user: {
        id:        user.id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        team:      user.team,
        picture:   user.picture,
        status:    user.status,
        entities:  user.entities || 'CUTM',
        isSuperAdmin: !!user.is_superadmin,
        isPlatformAdmin: !!user.is_platform_admin,
        lastLogin: lastLoginStr
      }
    })
  } catch (err) {
    console.error('[Google Auth]', err)
    res.status(500).json({ error: 'Google sign-in failed.' })
  }
})

// --- FORGOT PASSWORD (OTP-based reset) ---
const otpStore = {} // { "tenantId:email": { otp, expires } } — in-memory for simplicity

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, tenantSlug } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required.' })
  try {
    // Email is unique per tenant, not globally — scope the lookup (and the
    // OTP itself) to this URL's tenant, so a same-email account elsewhere
    // is never affected.
    const lookupTenantId = await resolveSlugTenant(tenantSlug)
    const otpKey = `${lookupTenantId}:${email.toLowerCase()}`
    const userRes = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2;', [email, lookupTenantId])
    if (userRes.rows.length === 0) {
      // Return success even if not found (security: don't reveal account existence)
      return res.json({ message: 'If the email exists, a reset OTP has been sent.' })
    }
    const user = userRes.rows[0]
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[otpKey] = { otp, expires: Date.now() + 10 * 60 * 1000 } // 10 min

    // Send OTP via SMTP mail
    sendSystemMailAlert(
      email,
      'CCRM Password Reset OTP',
      `Hello ${user.name},\n\nYour CCRM password reset OTP is: ${otp}\n\nThis OTP is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nCCRM Admin`
    )
    console.log(`[ForgotPassword] OTP for ${email}: ${otp}`) // Dev only
    res.json({ message: 'If the email exists, a reset OTP has been sent.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to process forgot password request.' })
  }
})

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword, tenantSlug } = req.body
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields required.' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' })

  const lookupTenantId = await resolveSlugTenant(tenantSlug)
  const otpKey = `${lookupTenantId}:${email.toLowerCase()}`
  const stored = otpStore[otpKey]
  if (!stored) return res.status(400).json({ error: 'No OTP requested for this email.' })
  if (Date.now() > stored.expires) {
    delete otpStore[otpKey]
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' })
  }
  if (stored.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' })
  }

  try {
    const updateRes = await pool.query('UPDATE users SET password = $1 WHERE LOWER(email) = LOWER($2) AND tenant_id = $3 RETURNING id;', [newPassword, email, lookupTenantId])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Account not found.' })
    delete otpStore[otpKey]
    res.json({ message: 'Password reset successfully. You can now log in.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reset password.' })
  }
})

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT id, name, email, role, team, status, picture, entities, is_superadmin AS "isSuperAdmin", is_platform_admin AS "isPlatformAdmin", last_login AS "lastLogin" FROM users WHERE id = $1 AND tenant_id = $2;', [req.user.id, req.tenantId])
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User profile not found.' })
    res.json(userRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile.' })
  }
})

// --- LEADS ROUTERS ---
app.get('/api/leads', authenticateToken, async (req, res) => {
  try {
    // ── Server-side pagination + search + filters + role scoping ──────────────
    // Loading the whole table into the browser freezes at scale (1cr rows),
    // so we always page. Returns { rows, total, page, limit }.
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const { search, stage, owner, state, source, unassigned, website_code, domain, requesterRole, requesterName, dateFrom, dateTo } = req.query

    const where = []
    const params = []
    const add = (clause, value) => { params.push(value); where.push(clause.replace('$$', `$${params.length}`)) }

    // Tenant scoping (multi-tenant) — always first
    add('tenant_id = $$', req.tenantId)

    // Role scoping: counsellors only see their own; admin/manager see all
    if (requesterRole && !['Admin', 'Manager'].includes(requesterRole) && requesterName) {
      add('LOWER(owner) = LOWER($$)', requesterName)
    }
    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email ILIKE ${p} OR mobile ILIKE ${p})`)
    }
    if (unassigned === 'true') {
      where.push('(owner IS NULL OR owner = \'\' OR owner = \'Unassigned\')')
    } else {
      if (stage)  add('stage  = $$', stage)
      if (owner)  add('owner  = $$', owner)
    }
    if (state)  add('state  = $$', state)
    if (source) add('source = $$', source)
    // Date range on created_at (dateTo is inclusive of the whole day)
    if (dateFrom) add('created_at >= $$', dateFrom)
    if (dateTo)   add("created_at < ($$::date + INTERVAL '1 day')", dateTo)
    // Website filter: match against lead_source field (e.g., "Website (ftl)", "Website (esse)")
    if (website_code) add('LOWER(lead_source) LIKE LOWER($$)', `%${website_code}%`)

    // Domain filter: leads owned by a counselor whose email is on that domain.
    // Use a subquery (not a JOIN) so column names stay unambiguous with `users`.
    // Match owner→user by stripping ALL non-alphanumerics + lowercasing, so
    // punctuation/spacing/title differences ("Dr.Mohanababu Chappa" vs
    // "Dr. Mohanababu Chappa") still match.
    const nameNorm = (col) => `LOWER(regexp_replace(${col}, '[^a-zA-Z0-9]', '', 'g'))`
    if (domain === 'cutm') {
      add(`${nameNorm('owner')} IN (SELECT ${nameNorm('name')} FROM users WHERE email ILIKE $$)`, '%@cutm.ac.in')
    } else if (domain === 'cutmap') {
      add(`${nameNorm('owner')} IN (SELECT ${nameNorm('name')} FROM users WHERE email ILIKE $$)`, '%@cutmap.ac.in')
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email, mobile, state, city, course, source, source_type AS "sourceType",
              owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor",
              not_interested_reason AS "notInterestedReason"
       FROM leads ${whereSql}
       ORDER BY id DESC
       LIMIT ${limit} OFFSET ${offset};`,
      params
    )
    console.log(`[GET /api/leads] page=${page}, limit=${limit}, offset=${offset}, returned=${rowsRes.rows.length} rows, total=${total}`)
    res.json({ rows: rowsRes.rows, total, page, limit })
  } catch (err) {
    console.error('[GET /api/leads]', err.message)
    res.status(500).json({ error: 'Failed to fetch leads.' })
  }
})

// Single lead by numeric id — used by detail page so it never needs the full list
app.get('/api/leads/:id(\\d+)', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email, mobile, state, city, course, source, source_type AS "sourceType",
              owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor",
              not_interested_reason AS "notInterestedReason", lead_details AS "leadDetails"
       FROM leads WHERE id = $1 AND tenant_id = $2;`, [req.params.id, req.tenantId])
    if (!r.rows.length) return res.status(404).json({ error: 'Lead not found.' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lead.' })
  }
})

// === SEPARATE ENDPOINTS FOR WEBSITE FORMS ===

// GET /api/gttech-leads — GTTECH inquiry leads
app.get('/api/gttech-leads', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []
    params.push(req.tenantId); where.push(`tenant_id = $${params.length}`)

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(full_name ILIKE ${p} OR email ILIKE ${p} OR phone ILIKE ${p} OR organization_name ILIKE ${p})`)
    }

    const reqRole = req.query.requesterRole || ''
    const reqName = req.query.requesterName || ''
    const owner = req.query.owner || ''
    if (reqRole && !['Admin', 'Manager'].includes(reqRole)) {
      // Counsellor: only the GT leads assigned to them (tolerant of case/whitespace)
      params.push(reqName || '___none___'); where.push(`LOWER(TRIM(owner)) = LOWER(TRIM($${params.length}))`)
    } else if (owner === 'Unassigned') where.push(`(owner IS NULL OR owner = '')`)
    else if (owner === '!Unassigned') where.push(`(owner IS NOT NULL AND owner <> '')`)
    else if (owner) { params.push(owner); where.push(`owner = $${params.length}`) }

    const status = req.query.status || ''
    if (status) { params.push(status); where.push(`status = $${params.length}`) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    // "Select all N matching leads" (across every page) — just the ids, no cap
    if (req.query.idsOnly === '1') {
      const idsRes = await pool.query(`SELECT id FROM gttech_leads ${whereSql};`, params)
      return res.json({ ids: idsRes.rows.map(r => r.id), total: idsRes.rows.length })
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM gttech_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, full_name, organization_name, designation, industry_sector, interested_in, email, phone, owner, created_at, status
       FROM gttech_leads ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset};`,
      params
    )

    res.json({ rows: rowsRes.rows, total, page, limit })
  } catch (err) {
    console.error('[GET /api/gttech-leads]', err.message)
    res.status(500).json({ error: 'Failed to fetch GTTECH leads.' })
  }
})

// GET /api/ftl-leads — FTL inquiry leads
app.get('/api/ftl-leads', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []
    params.push(req.tenantId); where.push(`tenant_id = $${params.length}`)

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email_id ILIKE ${p} OR phone ILIKE ${p})`)
    }

    const reqRole = req.query.requesterRole || ''
    const reqName = req.query.requesterName || ''
    const owner = req.query.owner || ''
    if (reqRole && !['Admin', 'Manager'].includes(reqRole)) {
      // Counsellor: only the GT leads assigned to them (tolerant of case/whitespace)
      params.push(reqName || '___none___'); where.push(`LOWER(TRIM(owner)) = LOWER(TRIM($${params.length}))`)
    } else if (owner === 'Unassigned') where.push(`(owner IS NULL OR owner = '')`)
    else if (owner === '!Unassigned') where.push(`(owner IS NOT NULL AND owner <> '')`)
    else if (owner) { params.push(owner); where.push(`owner = $${params.length}`) }

    const status = req.query.status || ''
    if (status) { params.push(status); where.push(`status = $${params.length}`) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    if (req.query.idsOnly === '1') {
      const idsRes = await pool.query(`SELECT id FROM ftl_leads ${whereSql};`, params)
      return res.json({ ids: idsRes.rows.map(r => r.id), total: idsRes.rows.length })
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM ftl_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email_id, phone, looking_for, owner, created_at, status
       FROM ftl_leads ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset};`,
      params
    )

    res.json({ rows: rowsRes.rows, total, page, limit })
  } catch (err) {
    console.error('[GET /api/ftl-leads]', err.message)
    res.status(500).json({ error: 'Failed to fetch FTL leads.' })
  }
})

// GET /api/gtib-leads — GTIB inquiry leads
app.get('/api/gtib-leads', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []
    params.push(req.tenantId); where.push(`tenant_id = $${params.length}`)

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email_id ILIKE ${p} OR phone ILIKE ${p})`)
    }

    const reqRole = req.query.requesterRole || ''
    const reqName = req.query.requesterName || ''
    const owner = req.query.owner || ''
    if (reqRole && !['Admin', 'Manager'].includes(reqRole)) {
      // Counsellor: only the GT leads assigned to them (tolerant of case/whitespace)
      params.push(reqName || '___none___'); where.push(`LOWER(TRIM(owner)) = LOWER(TRIM($${params.length}))`)
    } else if (owner === 'Unassigned') where.push(`(owner IS NULL OR owner = '')`)
    else if (owner === '!Unassigned') where.push(`(owner IS NOT NULL AND owner <> '')`)
    else if (owner) { params.push(owner); where.push(`owner = $${params.length}`) }

    const status = req.query.status || ''
    if (status) { params.push(status); where.push(`status = $${params.length}`) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    if (req.query.idsOnly === '1') {
      const idsRes = await pool.query(`SELECT id FROM gtib_leads ${whereSql};`, params)
      return res.json({ ids: idsRes.rows.map(r => r.id), total: idsRes.rows.length })
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM gtib_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email_id, phone, looking_for, owner, created_at, status
       FROM gtib_leads ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset};`,
      params
    )

    res.json({ rows: rowsRes.rows, total, page, limit })
  } catch (err) {
    console.error('[GET /api/gtib-leads]', err.message)
    res.status(500).json({ error: 'Failed to fetch GTIB leads.' })
  }
})

// GET /api/esse-leads — ESSE inquiry leads
app.get('/api/esse-leads', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []
    params.push(req.tenantId); where.push(`tenant_id = $${params.length}`)

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email_id ILIKE ${p} OR phone ILIKE ${p})`)
    }

    const reqRole = req.query.requesterRole || ''
    const reqName = req.query.requesterName || ''
    const owner = req.query.owner || ''
    if (reqRole && !['Admin', 'Manager'].includes(reqRole)) {
      // Counsellor: only the GT leads assigned to them (tolerant of case/whitespace)
      params.push(reqName || '___none___'); where.push(`LOWER(TRIM(owner)) = LOWER(TRIM($${params.length}))`)
    } else if (owner === 'Unassigned') where.push(`(owner IS NULL OR owner = '')`)
    else if (owner === '!Unassigned') where.push(`(owner IS NOT NULL AND owner <> '')`)
    else if (owner) { params.push(owner); where.push(`owner = $${params.length}`) }

    const status = req.query.status || ''
    if (status) { params.push(status); where.push(`status = $${params.length}`) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    if (req.query.idsOnly === '1') {
      const idsRes = await pool.query(`SELECT id FROM esse_leads ${whereSql};`, params)
      return res.json({ ids: idsRes.rows.map(r => r.id), total: idsRes.rows.length })
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM esse_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email_id, phone, looking_for, owner, created_at, status
       FROM esse_leads ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset};`,
      params
    )

    res.json({ rows: rowsRes.rows, total, page, limit })
  } catch (err) {
    console.error('[GET /api/esse-leads]', err.message)
    res.status(500).json({ error: 'Failed to fetch ESSE leads.' })
  }
})

// --- AUTO-ASSIGN unassigned leads (Admin only) ---
app.post('/api/bulk-assign-unassigned', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin/Manager only.' })
    }

    const { includeGT = true, includeRegular = true } = req.body
    const results = {}

    // Auto-assign regular leads
    if (includeRegular) {
      const unassigned = await pool.query(
        `SELECT id FROM leads WHERE (owner IS NULL OR owner = '' OR owner = 'Unassigned') AND tenant_id = $1;`,
        [req.tenantId]
      )

      let assigned = 0
      for (const lead of unassigned.rows) {
        const counselor = await getNextAssignee(req.tenantId)
        if (counselor && counselor !== 'Unassigned') {
          await pool.query(`UPDATE leads SET owner = $1 WHERE id = $2 AND tenant_id = $3;`, [counselor, lead.id, req.tenantId])
          assigned++
        }
      }

      results['Regular Leads'] = { total: unassigned.rows.length, assigned }
    }

    // Auto-assign GT entity leads
    if (includeGT) {
      const entities = ['GTIB', 'FTL', 'GTTECH', 'ESSE']
      for (const entity of entities) {
        const table = `${entity.toLowerCase()}_leads`
        const unassigned = await pool.query(
          `SELECT id FROM ${table} WHERE (owner IS NULL OR owner = '' OR owner = 'Unassigned') AND tenant_id = $1;`,
          [req.tenantId]
        )

        let assigned = 0
        for (const lead of unassigned.rows) {
          const counselor = await getNextAssignee(req.tenantId)
          if (counselor && counselor !== 'Unassigned') {
            await pool.query(`UPDATE ${table} SET owner = $1 WHERE id = $2 AND tenant_id = $3;`, [counselor, lead.id, req.tenantId])
            assigned++
          }
        }

        results[entity] = { total: unassigned.rows.length, assigned }
      }
    }

    res.json({ success: true, results })
  } catch (err) {
    console.error('[Bulk Assign]', err.message)
    res.status(500).json({ error: 'Auto-assign failed.' })
  }
})

// --- BULK IMPORT for GT website leads (FTL / GTIB / GTTECH / ESSE) ---
app.post('/api/website-leads/import', authenticateToken, uploadDoc.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const website = String(req.body.website || '').toLowerCase()
  if (!['ftl', 'gtib', 'gttech', 'esse'].includes(website)) {
    return res.status(400).json({ error: 'Invalid website. Use ftl, gtib, gttech, or esse.' })
  }
  const filePath = req.file.path
  // Pick a value from a row by trying several normalised header aliases
  const pick = (row, aliases) => {
    for (const k of Object.keys(row)) {
      if (aliases.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) return String(row[k] ?? '').trim()
    }
    return ''
  }
  try {
    const workbook = XLSX.readFile(filePath)
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
    if (!rawData || rawData.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty or invalid.' })

    const table = `${website}_leads`  // website is whitelisted above
    // Introspect the live table so the insert adapts to whatever the schema is
    const colRes = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns WHERE table_name = $1`, [table]
    )
    if (colRes.rows.length === 0) return res.status(400).json({ error: `Table ${table} not found.` })
    const cols = {}
    colRes.rows.forEach(r => { cols[r.column_name] = r })
    const isJson = (c) => cols[c] && (cols[c].data_type === 'json' || cols[c].data_type === 'jsonb')

    let inserted = 0, skipped = 0
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const row of rawData) {
        const phone = pick(row, ['phone', 'mobile', 'mobileno', 'mobilenumber', 'phonenumber', 'contact']).replace(/\D/g, '')
        if (phone.length < 10) { skipped++; continue }

        // Field → value map per entity (gttech has its own shape)
        const fields = website === 'gttech' ? {
          full_name: pick(row, ['fullname', 'name']) || 'Unnamed',
          organization_name: pick(row, ['organizationname', 'organization', 'company', 'companyname']),
          designation: pick(row, ['designation', 'title', 'role']),
          industry_sector: pick(row, ['industrysector', 'industry', 'sector']),
          interested_in: pick(row, ['interestedin', 'interest', 'lookingfor', 'course']),
          email: pick(row, ['email', 'emailid', 'emailaddress']),
          phone,
          website_code: website,
        } : {
          name: pick(row, ['name', 'fullname', 'studentname']) || 'Unnamed',
          email_id: pick(row, ['emailid', 'email', 'emailaddress']),
          phone,
          looking_for: pick(row, ['lookingfor', 'interest', 'interestedin', 'course', 'program']),
          website_code: website,
        }

        // Tag the tenant (multi-tenant)
        if (cols.tenant_id) fields.tenant_id = req.tenantId
        // Only insert columns that actually exist in the table
        const useCols = Object.keys(fields).filter(c => cols[c])
        // Satisfy any NOT NULL json/jsonb column (no default) we aren't already setting → '{}'
        for (const [colName, meta] of Object.entries(cols)) {
          if (!useCols.includes(colName) && (meta.data_type === 'json' || meta.data_type === 'jsonb')
              && meta.is_nullable === 'NO' && !meta.column_default) {
            fields[colName] = {}
            useCols.push(colName)
          }
        }
        const values = useCols.map(c => {
          if (isJson(c)) return JSON.stringify(fields[c] ?? '')
          let v = fields[c]
          const maxLen = cols[c].character_maximum_length
          if (typeof v === 'string' && maxLen && v.length > maxLen) v = v.substring(0, maxLen)
          return v
        })
        const placeholders = useCols.map((_, i) => `$${i + 1}`).join(',')
        await client.query(`INSERT INTO ${table} (${useCols.join(',')}) VALUES (${placeholders});`, values)
        inserted++
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK'); throw e
    } finally {
      client.release()
    }
    fs.unlink(filePath, () => {})
    console.log(`[Website Leads Import] ${website}: ${inserted} inserted, ${skipped} skipped`)
    res.json({ success: true, inserted, skipped, total: rawData.length, website })
  } catch (err) {
    console.error('[Website Leads Import]', err.message)
    res.status(500).json({ error: 'Import failed: ' + err.message })
  }
})

// --- ASSIGN GT website leads to a faculty/counsellor (Admin/Manager) ---
app.post('/api/website-leads/assign', authenticateToken, async (req, res) => {
  if (!['Admin', 'Manager'].includes(req.user?.role)) return res.status(403).json({ error: 'Admin/Manager only.' })
  const website = String(req.body.website || '').toLowerCase()
  const { ids, owner } = req.body
  if (!['ftl', 'gtib', 'gttech', 'esse'].includes(website)) return res.status(400).json({ error: 'Invalid website.' })
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No leads selected.' })
  if (owner === undefined || owner === null) return res.status(400).json({ error: 'Faculty/owner required.' })
  try {
    const r = await pool.query(
      `UPDATE ${website}_leads SET owner = $1 WHERE id = ANY($2::int[]) AND tenant_id = $3;`,
      [String(owner).trim().substring(0, 120), ids.map(Number).filter(Boolean), req.tenantId]
    )
    console.log(`[Website Leads Assign] ${website}: ${r.rowCount} → ${owner} by ${req.user.email}`)
    // Auto-email the faculty (skip when clearing the owner)
    if (owner && String(owner).trim()) {
      try {
        const u = await pool.query('SELECT email FROM users WHERE name = $1 AND tenant_id = $2 LIMIT 1;', [String(owner).trim(), req.tenantId])
        const email = u.rows[0]?.email
        if (email) {
          await createNotification(email, `${r.rowCount} ${website.toUpperCase()} lead(s) assigned`, `${r.rowCount} ${website.toUpperCase()} lead(s) have been assigned to you.`, 'lead_assigned', null, req.tenantId)
          sendSystemMailAlert(email, `[CCRM] ${r.rowCount} ${website.toUpperCase()} Lead(s) Assigned`,
            `Hello ${owner},\n\n${r.rowCount} ${website.toUpperCase()} lead(s) have been assigned to you in CCRM.\n\nLog in: https://crm.cutmap.ac.in/${website}-leads\n\nBest regards,\nCCRM`)
        }
      } catch (e) { console.error('[GT Assign Email]', e.message) }
    }
    res.json({ success: true, assigned: r.rowCount, owner })
  } catch (err) {
    console.error('[Website Leads Assign]', err.message)
    res.status(500).json({ error: 'Assign failed: ' + err.message })
  }
})

// --- UPDATE status on GT website leads (Admin/Manager: any; counsellor: own only) ---
app.post('/api/website-leads/status', authenticateToken, async (req, res) => {
  const website = String(req.body.website || '').toLowerCase()
  const { ids, status } = req.body
  if (!['ftl', 'gtib', 'gttech', 'esse'].includes(website)) return res.status(400).json({ error: 'Invalid website.' })
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No leads selected.' })
  if (!status || !String(status).trim()) return res.status(400).json({ error: 'Status required.' })
  try {
    const params = [String(status).trim().substring(0, 50), ids.map(Number).filter(Boolean)]
    let ownerGuard = ''
    // Counsellors may only update the status of GT leads assigned to them
    if (!['Admin', 'Manager'].includes(req.user?.role)) {
      const ur = await pool.query('SELECT name FROM users WHERE (id = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [req.user?.id || 0, req.user?.email || '', req.tenantId])
      params.push(ur.rows[0]?.name || '___none___')
      ownerGuard = ` AND owner = $${params.length}`
    }
    params.push(req.tenantId)
    const tenantGuard = ` AND tenant_id = $${params.length}`
    const r = await pool.query(
      `UPDATE ${website}_leads SET status = $1 WHERE id = ANY($2::int[])${ownerGuard}${tenantGuard};`,
      params
    )
    console.log(`[Website Leads Status] ${website}: ${r.rowCount} → ${status} by ${req.user.email}`)
    res.json({ success: true, updated: r.rowCount, status })
  } catch (err) {
    console.error('[Website Leads Status]', err.message)
    res.status(500).json({ error: 'Status update failed: ' + err.message })
  }
})

// --- Does this user have any GT leads assigned? (drives sidebar visibility) ---
app.get('/api/website-leads/my-count', authenticateToken, async (req, res) => {
  const owner = String(req.query.owner || '').trim()
  if (!owner) return res.json({ total: 0 })
  try {
    let total = 0
    for (const t of ['ftl_leads', 'gtib_leads', 'gttech_leads', 'esse_leads']) {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t} WHERE LOWER(TRIM(owner)) = LOWER(TRIM($1)) AND tenant_id = $2;`, [owner, req.tenantId]).catch(() => ({ rows: [{ c: 0 }] }))
      total += r.rows[0].c
    }
    res.json({ total })
  } catch {
    res.json({ total: 0 })
  }
})

app.post('/api/leads', authenticateToken, async (req, res) => {
  const { name, email, mobile, state, city, course, source, owner: requestOwner, regDate, score, stage, stageColor } = req.body
  const finalRegDate = regDate || new Date().toLocaleString('en-IN', { hour12: true })
  try {
    // Resolve who is creating the lead (role from token; name from users table)
    const requesterRole = req.user?.role || ''
    let requesterName = ''
    try {
      const ur = await pool.query('SELECT name FROM users WHERE (id = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [req.user?.id || 0, req.user?.email || '', req.tenantId])
      requesterName = ur.rows[0]?.name || ''
    } catch { /* ignore */ }

    // Assignment rules:
    //  • Counsellor adds  → the lead is theirs.
    //  • Admin/Manager adds → use the owner they picked, else auto-assign (round-robin).
    //  • Social-media inbound leads come through the webhook routes (already auto-assigned).
    const isCounsellor = requesterRole && !['Admin', 'Manager'].includes(requesterRole)
    let owner
    if (isCounsellor && requesterName) {
      owner = requesterName
      console.log(`[Lead Create] Counsellor ${requesterName} → assigned to self`)
    } else if (requestOwner && requestOwner !== 'Unassigned') {
      owner = requestOwner
    } else {
      owner = await getNextAssignee(req.tenantId)
      console.log(`[Lead Create] Admin/Manager add → auto-assigned to ${owner}`)
    }

    const insertRes = await pool.query(`
      INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, name, email, mobile, state, city, course, source, owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor";
    `, [name, email, mobile, state, city, course, source, owner, finalRegDate, score || 0, stage || 'Untouched', stageColor || 'red', req.tenantId])

    const newLead = insertRes.rows[0]

    // Alert assigned counselor if not unassigned
    if (owner !== 'Unassigned') {
      await alertCounselor(owner, name, course, source || 'Manual', newLead.id, req.tenantId)
    }

    res.status(201).json(newLead)
  } catch (err) {
    console.error('[Lead Create] Error:', err.message)
    res.status(500).json({ error: 'Failed to register lead.' })
  }
})

app.put('/api/leads/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  const { name, email, mobile, state, city, course, program, source, owner, score, stage, stageColor, not_interested_reason, leadDetails } = req.body
  try {
    // First, get the current lead to check if stage is changing to "Interested"
    const leadRes = await pool.query('SELECT * FROM leads WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    const currentLead = leadRes.rows[0]
    if (!currentLead) return res.status(404).json({ error: 'Lead not found.' })

    const updateRes = await pool.query(`
      UPDATE leads
      SET
        name                   = COALESCE($1,  name),
        email                  = COALESCE($2,  email),
        mobile                 = COALESCE($3,  mobile),
        state                  = COALESCE($4,  state),
        city                   = COALESCE($5,  city),
        course                 = COALESCE($6,  course),
        source                 = COALESCE($7,  source),
        owner                  = COALESCE($8,  owner),
        score                  = COALESCE($9,  score),
        stage                  = COALESCE($10, stage),
        stage_color            = COALESCE($11, stage_color),
        not_interested_reason  = COALESCE($12, not_interested_reason),
        lead_details           = COALESCE($13::jsonb, lead_details)
      WHERE id = $14 AND tenant_id = $15
      RETURNING id, name, email, mobile, state, city, course, source, owner,
                reg_date AS "regDate", score, stage, stage_color AS "stageColor",
                not_interested_reason AS "notInterestedReason",
                lead_details AS "leadDetails";
    `, [
      name                    ?? null,
      email                   ?? null,
      mobile                  ?? null,
      state                   ?? null,
      city                    ?? null,
      course                  ?? null,
      source                  ?? null,
      owner                   ?? null,
      score                   ?? null,
      stage                   ?? null,
      stageColor              ?? null,
      not_interested_reason   ?? null,
      leadDetails ? JSON.stringify(leadDetails) : null,
      id,
      req.tenantId
    ])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found.' })

    const updatedLead = updateRes.rows[0]
    const newStage = stage || currentLead.stage

    // If stage is changed to "Interested", create an application record if it doesn't exist
    if (newStage === 'Interested') {
      const appCheckRes = await pool.query(
        'SELECT id FROM applications WHERE (email = $1 OR mobile = $2) AND tenant_id = $3 LIMIT 1;',
        [email || currentLead.email, mobile || currentLead.mobile, req.tenantId]
      )

      if (appCheckRes.rows.length === 0) {
        // Create new application from lead details
        const appName = name || currentLead.name
        const appEmail = email || currentLead.email
        const appMobile = mobile || currentLead.mobile
        // Use program if provided (cuedu), otherwise use course
        const appCourse = program || course || currentLead.program || currentLead.course
        const appCampus = currentLead.campus || ''

        // Generate app_no using sequence or random number
        let appNo
        try {
          const r = await pool.query(`SELECT lpad(nextval('cueeap_seq')::text, 4, '0') AS num;`)
          appNo = `CUEEAP26${r.rows[0].num}`
        } catch {
          appNo = `CUEEAP26${String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0')}`
        }

        await pool.query(`
          INSERT INTO applications (name, app_no, email, mobile, course, campus, stage, owner, tenant_id, date)
          VALUES ($1, $2, $3, $4, $5, $6, 'Interested', $7, $8, NOW());
        `, [appName, appNo, appEmail, appMobile, appCourse, appCampus, owner || currentLead.owner, req.tenantId])
      }
    }

    res.json(updatedLead)
  } catch (err) {
    console.error('[PUT /api/leads/:id]', err.message)
    res.status(500).json({ error: 'Failed to update lead details.' })
  }
})

// POST /api/leads/bulk-assign — assign many leads to one counselor at once (Admin/Manager)
app.post('/api/leads/bulk-assign', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin/Manager only.' })
    }
    const { leadIds, owner } = req.body
    if (!Array.isArray(leadIds) || leadIds.length === 0 || !owner) {
      return res.status(400).json({ error: 'leadIds (array) and owner are required.' })
    }
    const placeholders = leadIds.map((_, i) => `$${i + 2}`).join(',')
    const tenantParam = `$${leadIds.length + 2}`
    const r = await pool.query(`UPDATE leads SET owner = $1 WHERE id IN (${placeholders}) AND tenant_id = ${tenantParam};`, [owner, ...leadIds, req.tenantId])
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
      [`${r.rowCount} lead(s) assigned to ${owner}`, 'Just now', req.tenantId])
    // Auto-email the counsellor a single summary (not one per lead)
    try {
      const u = await pool.query('SELECT email FROM users WHERE name = $1 AND tenant_id = $2 LIMIT 1;', [owner, req.tenantId])
      const email = u.rows[0]?.email
      if (email) {
        await createNotification(email, `${r.rowCount} new lead(s) assigned`, `${r.rowCount} lead(s) have been assigned to you.`, 'lead_assigned', null, req.tenantId)
        sendSystemMailAlert(email, `[CCRM] ${r.rowCount} New Lead(s) Assigned`,
          `Hello ${owner},\n\n${r.rowCount} lead(s) have been assigned to you in CCRM.\n\nLog in to follow up:\nhttps://crm.cutmap.ac.in/leads\n\nBest regards,\nCCRM Admissions System`)
      }
    } catch (e) { console.error('[Bulk Assign Email]', e.message) }
    res.json({ success: true, assigned: r.rowCount })
  } catch (err) {
    console.error('[Bulk Assign]', err.message)
    res.status(500).json({ error: 'Bulk assign failed.' })
  }
})

// POST /api/leads/delete-by-owner — delete ALL leads owned by a counsellor (Admin only)
app.post('/api/leads/delete-by-owner', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' })
    const { owner } = req.body
    if (!owner) return res.status(400).json({ error: 'owner required.' })
    const r = await pool.query('DELETE FROM leads WHERE owner = $1 AND tenant_id = $2;', [owner, req.tenantId])
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
      [`${r.rowCount} lead(s) deleted (owner: ${owner}) by ${req.user.email}`, 'Just now', req.tenantId])
    console.log(`[Delete by owner] ${r.rowCount} leads deleted for owner="${owner}" by ${req.user.email}`)
    res.json({ success: true, deleted: r.rowCount })
  } catch (err) {
    console.error('[Delete by owner]', err.message)
    res.status(500).json({ error: 'Failed to delete leads.' })
  }
})

app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params
  // requesterRole + requesterName sent by the client so we can enforce rules server-side
  const requesterRole = req.body?.requesterRole || req.query.requesterRole || ''
  const requesterName = req.body?.requesterName || req.query.requesterName || ''

  try {
    const leadRes = await pool.query('SELECT id, owner, stage, name FROM leads WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found.' })
    const lead = leadRes.rows[0]

    // Admin / Manager can delete anything
    const isAdmin = ['Admin', 'Manager'].includes(requesterRole)
    if (!isAdmin) {
      // Counsellor rules:
      // 1. Can only delete their OWN leads
      const ownsIt = lead.owner === requesterName || lead.owner?.split(' ')[0] === requesterName?.split(' ')[0]
      if (!ownsIt) {
        return res.status(403).json({ error: 'You can only delete leads assigned to you.' })
      }
      // 2. Can only delete while still Untouched
      if (lead.stage !== 'Untouched') {
        return res.status(403).json({ error: `Cannot delete — this lead is already in "${lead.stage}" stage. Only Untouched leads can be deleted.` })
      }
    }

    await pool.query('DELETE FROM leads WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    res.json({ message: 'Lead deleted successfully.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead.' })
  }
})

// --- APPLICATIONS ROUTERS ---
// Generate next Application ID — type='sm' → CUEESM26XXXX, else → CUEEAP26XXXX
app.get('/api/applications/next-app-id', async (req, res) => {
  const isSM = req.query.type === 'sm'
  const seq  = isSM ? 'cueesm_seq' : 'cueeap_seq'
  const pfx  = isSM ? 'CUEESM26'   : 'CUEEAP26'
  try {
    const r = await pool.query(`SELECT lpad(nextval('${seq}')::text, 4, '0') AS num;`)
    res.json({ appNo: `${pfx}${r.rows[0].num}` })
  } catch {
    res.json({ appNo: `${pfx}${String(Math.floor(1 + Math.random() * 9999)).padStart(4,'0')}` })
  }
})

app.get('/api/applications', authenticateToken, async (req, res) => {
  try {
    const appsRes = await pool.query('SELECT id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date, admission_details AS "admissionDetails", admission_letter_sent_at AS "admissionLetterSentAt", school_dept AS "schoolDept", email_verified AS "emailVerified", semester_fee_status AS "semesterFeeStatus", erp_access_granted AS "erpAccessGranted", erp_access_granted_at AS "erpAccessGrantedAt" FROM applications WHERE tenant_id = $1 ORDER BY id DESC;', [req.tenantId])
    res.json(appsRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applications.' })
  }
})

app.post('/api/applications', async (req, res) => {
  const { name, appNo, email, mobile, formStatus, payStatus, payMethod, campus, course, stage, owner, date } = req.body
  // Use provided appNo, or generate CUEEAP26XXXX format
  let finalAppNo = appNo
  if (!finalAppNo) {
    try {
      const r = await pool.query(`SELECT lpad(nextval('cueeap_seq')::text, 4, '0') AS num;`)
      finalAppNo = `CUEEAP26${r.rows[0].num}`
    } catch {
      finalAppNo = `CUEEAP26${String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0')}`
    }
  }
  const finalDate = date || new Date().toLocaleDateString('en-IN')
  try {
    // Pull existing lead_details to seed application's admission_details (counsellor already filled them)
    const leadRes = await pool.query(
      `SELECT lead_details FROM leads WHERE ((LOWER(email) = LOWER($1) AND email != '' AND email IS NOT NULL) OR mobile = $2) AND tenant_id = $3 ORDER BY id DESC LIMIT 1;`,
      [email || '', mobile || '', req.tenantId]
    ).catch(() => ({ rows: [] }))
    const seededDetails = (leadRes.rows[0]?.lead_details) || {}

    const insertRes = await pool.query(`
      INSERT INTO applications (name, app_no, email, mobile, form_status, pay_status, pay_method, campus, course, stage, owner, date, admission_details, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
      RETURNING id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date, admission_details AS "admissionDetails";
    `, [name, finalAppNo, email, mobile, formStatus || 'Incomplete', payStatus || 'Payment Pending', payMethod || '', campus || 'Bhubaneswar', course, stage || 'Application Started', owner || 'Unassigned', finalDate, JSON.stringify(seededDetails), req.tenantId])

    // Auto-create notification
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`Application submitted: ${name} (${finalAppNo})`, 'Just now', req.tenantId])

    // Auto-create payment entry
    const payIdRes = await pool.query('SELECT COUNT(*) FROM payments WHERE app_no = $1 AND tenant_id = $2;', [finalAppNo, req.tenantId])
    if (parseInt(payIdRes.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO payments (name, app_no, amount, method, status, date, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [name, finalAppNo, 25000, payMethod || '', payStatus === 'Approved' ? 'Approved' : 'Pending', payStatus === 'Approved' ? finalDate : '', req.tenantId])
    }

    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create application.' })
  }
})

app.put('/api/applications/:id', async (req, res) => {
  const { id } = req.params
  const { name, appNo, email, mobile, formStatus, payStatus, payMethod, campus, course, stage, owner, date, leadDetails } = req.body
  try {
    const updateRes = await pool.query(`
      UPDATE applications
      SET name        = COALESCE($1,  name),
          app_no      = COALESCE($2,  app_no),
          email       = COALESCE($3,  email),
          mobile      = COALESCE($4,  mobile),
          form_status = COALESCE($5,  form_status),
          pay_status  = COALESCE($6,  pay_status),
          pay_method  = COALESCE($7,  pay_method),
          campus      = COALESCE($8,  campus),
          course      = COALESCE($9,  course),
          stage       = COALESCE($10, stage),
          owner       = COALESCE($11, owner),
          date        = COALESCE($12, date),
          admission_details = COALESCE($13::jsonb, admission_details)
      WHERE id = $14 AND tenant_id = $15
      RETURNING id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date;
    `, [name ?? null, appNo ?? null, email ?? null, mobile ?? null, formStatus ?? null, payStatus ?? null, payMethod ?? null, campus ?? null, course ?? null, stage ?? null, owner ?? null, date ?? null, leadDetails ? JSON.stringify(leadDetails) : null, id, req.tenantId])

    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Application not found.' })

    // Sync to payments if application payStatus changes
    if (payStatus) {
      const isApproved = payStatus === 'Approved' || payStatus === 'Payment Approved'
      await pool.query(`
        UPDATE payments
        SET status = $1, date = $2, txn_id = CASE WHEN txn_id = '' AND $3 = TRUE THEN $4 ELSE txn_id END
        WHERE app_no = $5 AND tenant_id = $6;
      `, [
        isApproved ? 'Approved' : (payStatus === 'Failed' ? 'Failed' : 'Pending'),
        isApproved ? new Date().toLocaleDateString('en-IN') : '',
        isApproved,
        `TXN${Math.floor(100000 + Math.random() * 900000)}`,
        appNo,
        req.tenantId
      ])

      if (isApproved) {
        await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`Payment approved: ₹25,000 received for ${appNo}`, 'Just now', req.tenantId])
        // Dispatches secure SMTP receipt mail alert
        sendSystemMailAlert(email, 'CUEE Admission Payment Approved', `Hello ${name},\n\nWe have successfully received and approved your payment of ₹25,000 for CUEE Registration application: ${appNo}.\n\nBest regards,\nAdmissions Office`)
      }
    }

    res.json(updateRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update application.' })
  }
})

// Ameyo endpoint removed (use /api/calls/initiate for EasyGoIVR instead)

// ── ADMISSION DETAILS — save full KYC + academic info before payment ──────
app.put('/api/applications/:id/admission-details', async (req, res) => {
  const { id } = req.params
  const details = req.body || {}
  try {
    const r = await pool.query(`
      UPDATE applications
      SET admission_details = $1::jsonb,
          school_dept       = COALESCE($2, school_dept)
      WHERE id = $3 AND tenant_id = $4
      RETURNING id, app_no AS "appNo", admission_details AS "admissionDetails", school_dept AS "schoolDept";
    `, [JSON.stringify(details), details.schoolDept ?? null, id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Application not found.' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('[Save admission details]', err.message)
    res.status(500).json({ error: 'Failed to save admission details.' })
  }
})

// ── PROVISIONAL ADMISSION LETTER — generate PDF + email ───────────────────
async function generateAdmissionLetterPDF(app, details) {
  let PDFDocument
  try { PDFDocument = (await import('pdfkit')).default }
  catch { throw new Error('pdfkit not installed. Run: cd /var/www/ccrm/server && npm install pdfkit') }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const date          = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
    const studentName   = details.studentName || app.name || 'Student'
    const studentEmail  = details.studentEmail || app.email || ''
    const parentName    = details.parentName || ''
    const refId         = app.app_no || app.appNo
    const program       = details.joiningCourse || app.course || 'Bachelor Program'
    const schoolDept    = app.school_dept || details.schoolDept || 'School of Studies'
    const campus        = app.campus || 'Bhubaneswar'
    const counsellor    = app.owner || 'Admissions Team'
    const seatBookAmt   = details.seatBookingAmount || '10000'

    // ── PAGE 1: Provisional Admission Letter ────────────────────────────────
    doc.rect(40, 40, 515, 760).strokeColor('#bbb').stroke()

    doc.fillColor('#000').fontSize(16).font('Helvetica-Bold').text('Centurion University', 0, 80, { align: 'center' })
    doc.fontSize(9).font('Helvetica-Oblique').text('Shaping Lives, Empowering Communities', 0, 100, { align: 'center' })

    doc.moveDown(2)
    doc.fontSize(14).font('Helvetica-Bold').text('Provisional Admission Letter', 0, 150, { align: 'center', underline: true })

    doc.moveDown(2).fontSize(10).font('Helvetica')
    doc.text(`Date: ${date}`, 60, 200)
    doc.text(`Student Name: ${studentName}`, 60)
    doc.text(`Email: ${studentEmail}`, 60)
    doc.text(`Parent Name: ${parentName}`, 60)
    doc.text(`Reference ID: ${refId}`, 60)

    doc.moveDown(1.5).font('Helvetica-Bold').text(
      `Sub: Provisional Admission (${refId}) to ${schoolDept}, ${program}, ${campus}`,
      { align: 'left' }
    )

    doc.moveDown(1.5).font('Helvetica').text(`Dear ${studentName},`)
    doc.moveDown(0.5).text('Congratulations.')

    doc.moveDown(0.8).text(
      `I am pleased to offer you Provisional admission in "${program}" for the 2026-2027 session at "${schoolDept}" under ${campus} Campus.`,
      { align: 'justify' }
    )

    doc.moveDown(0.5).text(
      'Your admission will remain provisional until the prescribed fees and associated conditions are fulfilled. Please refer to Appendix 1 attached with this letter.',
      { align: 'justify' }
    )

    doc.moveDown(0.5).text('I wish you success and invite you to explore your campus and its many facilities.', { align: 'justify' })

    doc.moveDown(0.5).text(
      `Please feel free to contact ${counsellor}${app.owner_mobile ? `, ${app.owner_mobile}` : ''}${app.owner_email ? `, ${app.owner_email}` : ''} if you have any queries.`,
      { align: 'justify' }
    )

    // Signature block
    doc.moveDown(3).text('Yours sincerely,')
    doc.font('Helvetica-Bold').text('Sukanta Parida')
    doc.font('Helvetica').text('Director - Admissions & Marketing')
    doc.text('Centurion University of Technology and Management')
    doc.text('Odisha and Andhra Pradesh')
    doc.text('Email: sukanta.parida@cutm.ac.in')

    // ── PAGE 2: Appendix I — Fee Structure ──────────────────────────────────
    doc.addPage()
    doc.rect(40, 40, 515, 760).strokeColor('#bbb').stroke()

    doc.fillColor('#000').fontSize(14).font('Helvetica-Bold').text('Appendix I', 0, 70, { align: 'center' })
    doc.fontSize(10).font('Helvetica').text('(Fee Structure and Related Details)', 0, 90, { align: 'center' })

    doc.moveDown(2).fontSize(10).font('Helvetica-Bold')
    doc.text(`Student Name: `, 60, 130, { continued: true }).font('Helvetica').text(studentName)
    doc.font('Helvetica-Bold').text(`Email: `, 60, undefined, { continued: true }).font('Helvetica').text(studentEmail)
    doc.font('Helvetica-Bold').text(`Parent Name: `, 60, undefined, { continued: true }).font('Helvetica').text(parentName)
    doc.font('Helvetica-Bold').text(`Reference ID: `, 60, undefined, { continued: true }).font('Helvetica').text(refId)
    doc.font('Helvetica-Bold').text(`Program: `, 60, undefined, { continued: true }).font('Helvetica').text(program)
    doc.font('Helvetica-Bold').text(`Campus: `, 60, undefined, { continued: true }).font('Helvetica').text(schoolDept)

    // Marks table
    doc.moveDown(1.5).fontSize(9).font('Helvetica-Bold')
    const tx = 60
    let ty = doc.y + 10
    doc.rect(tx, ty, 480, 24).stroke()
    doc.text('STUDENT NAME', tx + 5, ty + 8, { width: 120 })
    doc.text('10TH %', tx + 130, ty + 8, { width: 60 })
    doc.text('12TH %', tx + 200, ty + 8, { width: 60 })
    doc.text('SELECTION', tx + 270, ty + 8, { width: 100 })
    doc.text('ENTRANCE EXAM', tx + 380, ty + 8, { width: 100 })
    ty += 24
    doc.rect(tx, ty, 480, 22).stroke()
    doc.font('Helvetica').text(studentName, tx + 5, ty + 7, { width: 120 })
    doc.text(details.tenthPercentage || '—', tx + 130, ty + 7, { width: 60 })
    doc.text(details.twelfthPercentage || '—', tx + 200, ty + 7, { width: 60 })
    doc.text('Merit', tx + 270, ty + 7, { width: 100 })
    doc.text('CUEE / Direct', tx + 380, ty + 7, { width: 100 })

    // Fee table
    ty += 50
    doc.font('Helvetica-Bold').fontSize(9).text('Fee Structure (₹)', 60, ty)
    ty += 20
    const cols = [60, 170, 240, 310, 380, 450]
    const headers = ['FEES DETAILS', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']
    headers.forEach((h, i) => doc.rect(cols[i], ty, (cols[i+1] || 540) - cols[i], 22).stroke().text(h, cols[i] + 4, ty + 7))
    ty += 22
    const rows = [
      ['TUITION',  '1,20,000', '1,20,000', '1,20,000', '1,20,000', 'NIL'],
      ['OTHER FEE','25,000',   'NIL',      'NIL',      'NIL',      'NIL'],
      ['EXAM FEE', 'NIL',      '7,000',    '7,000',    '7,000',    'NIL'],
    ]
    doc.font('Helvetica').fontSize(9)
    rows.forEach(r => {
      r.forEach((cell, i) => doc.rect(cols[i], ty, (cols[i+1] || 540) - cols[i], 22).stroke().text(cell, cols[i] + 4, ty + 7))
      ty += 22
    })

    ty += 15
    doc.fontSize(8).font('Helvetica-Oblique').text(
      '*Other Fee includes Medical Insurance ₹2,500, Exam Fee ₹7,000, Counselling Fee ₹3,000, Registration Fee ₹2,500, Sports Fee ₹500, Bag pack with bottle ₹2,000 & Caution Money ₹7,500 (refundable on course completion).',
      60, ty, { width: 480, align: 'left' }
    )

    ty = doc.y + 15
    doc.font('Helvetica-Bold').fontSize(10).text(`Provisional Seat Booking Amount Received - ₹${seatBookAmt}`, 60, ty)
    if (details.utrNumber) {
      doc.font('Helvetica').fontSize(9).text(`UTR / Reference No: ${details.utrNumber}`, 60)
    }

    ty = doc.y + 15
    doc.font('Helvetica-Bold').fontSize(10).text('Documents to submit at reporting:', 60, ty)
    doc.font('Helvetica').fontSize(9).list([
      '10th, 12th Certificate & Mark sheet',
      'Transfer Certificate',
      'Caste Certificate',
      'Study and Conduct Certificate',
      'Migration Certificate',
      'Aadhar Card',
      'Passport size photos (8)'
    ], 60, undefined, { bulletRadius: 2 })

    doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(8).text('NOTE: Please bring 4 copies of the above-mentioned certificates.', 60)

    doc.end()
  })
}

app.post('/api/applications/:id/send-letter', async (req, res) => {
  const { id } = req.params
  try {
    const r = await pool.query(`
      SELECT a.id, a.name, a.app_no, a.email, a.mobile, a.campus, a.course, a.owner, a.admission_details, a.school_dept,
             u.email AS owner_email, u.mobile AS owner_mobile
      FROM applications a
      LEFT JOIN users u ON u.name = a.owner AND u.tenant_id = a.tenant_id
      WHERE a.id = $1 AND a.tenant_id = $2;
    `, [id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Application not found.' })
    const app = r.rows[0]
    const details = app.admission_details || {}
    const toEmail = details.studentEmail || app.email
    if (!toEmail || toEmail.includes('noemail')) {
      return res.status(400).json({ error: 'No valid student email on file. Fill Admission Details first.' })
    }

    // Generate PDF
    const pdfBuffer = await generateAdmissionLetterPDF(app, details)

    // Send email with PDF attachment
    const cfg = await createMailTransporter()
    if (cfg.error) return res.status(400).json({ error: cfg.error })

    await cfg.transporter.sendMail({
      from: cfg.from,
      to: toEmail,
      cc: details.parentEmail ? [details.parentEmail] : [],
      subject: `Provisional Admission (${app.app_no}) — ${app.course || 'CUTM Program'}`,
      text: `Dear ${details.studentName || app.name},\n\nCongratulations! Please find your Provisional Admission Letter attached.\n\nReference ID: ${app.app_no}\nProgram: ${app.course}\nCampus: ${app.campus}\n\nFor any queries, contact ${app.owner || 'CUTM Admissions'}.\n\nBest regards,\nCUTM Admissions Team`,
      attachments: [{
        filename: `Provisional_Letter_${app.app_no}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    })

    // Mark as sent
    await pool.query(`UPDATE applications SET admission_letter_sent_at = NOW() WHERE id = $1 AND tenant_id = $2;`, [id, req.tenantId])

    res.json({ success: true, sentTo: toEmail, ccTo: details.parentEmail || null })
  } catch (err) {
    console.error('[Send Letter]', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/applications/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleteRes = await pool.query('DELETE FROM applications WHERE id = $1 AND tenant_id = $2 RETURNING id, app_no AS "appNo";', [id, req.tenantId])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'Application not found.' })
    res.json({ message: 'Application deleted.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete application.' })
  }
})

// --- TASKS ROUTERS ---
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const tasksRes = await pool.query('SELECT id, title, type, priority, due, status, assignee, lead FROM tasks WHERE tenant_id = $1 ORDER BY id DESC;', [req.tenantId])
    res.json(tasksRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks.' })
  }
})

app.post('/api/tasks', async (req, res) => {
  const { title, type, priority, due, status, assignee, lead } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO tasks (title, type, priority, due, status, assignee, lead, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, title, type, priority, due, status, assignee, lead;
    `, [title, type || 'Call', priority || 'Medium', due, status || 'Pending', assignee, lead, req.tenantId])

    // Sync automatic event calendar entry
    const eventDate = due ? due.split(' ')[0].split('/').reverse().join('-') : new Date().toISOString().split('T')[0]
    const eventTime = due ? due.split(' ')[1] + ' ' + due.split(' ')[2] : '10:00 AM'
    await pool.query(`
      INSERT INTO events (title, date, time, type, venue, participants, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [title, eventDate, eventTime, type || 'Task', 'Online / Call', 1, req.tenantId])

    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`Task scheduled: ${title} (Due: ${due || 'Soon'})`, 'Just now', req.tenantId])

    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create task.' })
  }
})

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    const updateRes = await pool.query('UPDATE tasks SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, status;', [status, id, req.tenantId])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Task not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle task completion.' })
  }
})

// --- PAYMENTS ROUTERS ---
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { requesterRole, requesterName } = req.query
    // Admin/Manager/Finance see all; counsellors only their assigned leads' payments (matched by name)
    const isCounsellor = requesterRole && !['Admin', 'Manager', 'Finance'].includes(requesterRole) && requesterName
    let sql = 'SELECT id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId", utr_number AS "utrNumber", pay_mode AS "payMode", fee_type AS "feeType" FROM payments WHERE tenant_id = $1'
    const params = [req.tenantId]
    if (isCounsellor) {
      params.push(requesterName)
      sql += ` AND LOWER(name) IN (SELECT LOWER(name) FROM leads WHERE LOWER(owner) = LOWER($${params.length}) AND tenant_id = $1)`
    }
    sql += ' ORDER BY id DESC;'
    const payRes = await pool.query(sql, params)
    res.json(payRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments ledger.' })
  }
})

app.post('/api/payments', async (req, res) => {
  const { name, appNo, amount, method, status, date } = req.body
  const finalDate = date || new Date().toLocaleDateString('en-IN')
  try {
    const insertRes = await pool.query(`
      INSERT INTO payments (name, app_no, amount, method, status, date, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId";
    `, [name, appNo, amount || 25000, method || '', status || 'Pending', finalDate, req.tenantId])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create payment transaction.' })
  }
})

app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    const isApproved = status === 'Approved'
    const updateRes = await pool.query(`
      UPDATE payments
      SET status = $1, date = CASE WHEN status <> 'Approved' AND $2 = TRUE THEN $3 ELSE date END, txn_id = CASE WHEN txn_id = '' AND $4 = TRUE THEN $5 ELSE txn_id END
      WHERE id = $6 AND tenant_id = $7
      RETURNING id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId";
    `, [status, isApproved, new Date().toLocaleDateString('en-IN'), isApproved, `TXN${Math.floor(100000 + Math.random() * 900000)}`, id, req.tenantId])

    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Payment record not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payment status.' })
  }
})

// Submit UTR / offline ref number — sets status = 'Payment Done'
// Helper — auto-fire admission letter when payment is recorded
async function autoSendAdmissionLetter(appNo, utrNumber, tenantId = 1) {
  try {
    const r = await pool.query(`
      SELECT a.id, a.name, a.app_no, a.email, a.campus, a.course, a.owner, a.admission_details, a.school_dept,
             u.email AS owner_email, u.mobile AS owner_mobile
      FROM applications a
      LEFT JOIN users u ON u.name = a.owner AND u.tenant_id = a.tenant_id
      WHERE a.app_no = $1 AND a.tenant_id = $2;
    `, [appNo, tenantId])
    if (!r.rows[0]) return
    const app = r.rows[0]
    const details = { ...(app.admission_details || {}), utrNumber }
    const toEmail = details.studentEmail || app.email
    if (!toEmail || toEmail.includes('noemail')) {
      console.warn(`[Auto-Letter] No valid email for ${appNo}, skipping`)
      return
    }
    const cfg = await createMailTransporter()
    if (cfg.error) { console.warn(`[Auto-Letter] SMTP not ready: ${cfg.error}`); return }
    const pdfBuffer = await generateAdmissionLetterPDF(app, details)
    await cfg.transporter.sendMail({
      from: cfg.from,
      to: toEmail,
      cc: details.parentEmail ? [details.parentEmail] : [],
      subject: `Provisional Admission (${appNo}) — ${app.course || 'CUTM Program'}`,
      text: `Dear ${details.studentName || app.name},\n\nCongratulations! Your payment has been received and your Provisional Admission Letter is attached.\n\nReference ID: ${appNo}\nUTR: ${utrNumber}\nProgram: ${app.course}\nCampus: ${app.campus}\n\nBest regards,\nCUTM Admissions Team`,
      attachments: [{ filename: `Provisional_Letter_${appNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
    })
    await pool.query(`UPDATE applications SET admission_letter_sent_at = NOW() WHERE app_no = $1 AND tenant_id = $2;`, [appNo, tenantId])
    console.log(`[Auto-Letter] Sent for ${appNo} → ${toEmail}`)
  } catch (e) {
    console.error(`[Auto-Letter] Failed for ${appNo}:`, e.message)
  }
}

// Helper — after the *application* fee is approved, gate the student behind
// email OTP verification before they get the document-upload link.
async function sendApplicationEmailOtp(appNo, tenantId = 1) {
  try {
    const r = await pool.query('SELECT id, name, email FROM applications WHERE app_no = $1 AND tenant_id = $2;', [appNo, tenantId])
    if (!r.rows[0] || !r.rows[0].email) { console.warn(`[Email Verify] No email on file for ${appNo}, skipping OTP`); return }
    const app = r.rows[0]
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    await pool.query(
      `UPDATE applications SET email_otp = $1, email_otp_expires_at = NOW() + INTERVAL '30 minutes' WHERE id = $2;`,
      [otp, app.id]
    )
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email/${appNo}`
    await sendSystemMailAlert(
      app.email,
      `Verify your email — Admission ${appNo}`,
      `Dear ${app.name},\n\nYour application fee payment has been received. Please verify your email to continue your admission process.\n\nYour verification OTP: ${otp}\n\nVerify here: ${verifyUrl}\n\nThis OTP is valid for 30 minutes. Your Admission Reference is ${appNo}.\n\nBest regards,\nCUTM Admissions Team`,
      tenantId
    )
    console.log(`[Email Verify] OTP sent for ${appNo}`)
  } catch (e) {
    console.error(`[Email Verify] Failed to send OTP for ${appNo}:`, e.message)
  }
}

// Helper — 1st semester fee approved → grant ERP access, notify the student.
// There's no ERP system inside this CRM (see LMS/ERP integration roadmap);
// this just flips the tracked status and tells the student what to use as
// their login ID until a permanent Student ID is issued.
async function grantErpAccess(appNo, tenantId = 1) {
  try {
    const r = await pool.query('SELECT name, email FROM applications WHERE app_no = $1 AND tenant_id = $2;', [appNo, tenantId])
    if (!r.rows[0] || !r.rows[0].email) return
    const app = r.rows[0]
    await sendSystemMailAlert(
      app.email,
      `ERP Access Granted — ${appNo}`,
      `Dear ${app.name},\n\nYour 1st semester fee payment has been received and you now have access to the Student ERP.\n\nUse your Admission Number as your login ID until your permanent Student ID is issued: ${appNo}\n\nWelcome aboard!\n\nBest regards,\nCUTM Admissions Team`,
      tenantId
    )
    console.log(`[ERP Access] Granted + notified for ${appNo}`)
  } catch (e) {
    console.error(`[ERP Access] Failed for ${appNo}:`, e.message)
  }
}

app.post('/api/payments/:id/submit-utr', async (req, res) => {
  const { id } = req.params
  const { utrNumber, payMode } = req.body
  if (!utrNumber) return res.status(400).json({ error: 'UTR/Reference number required.' })
  try {
    const r = await pool.query(`
      UPDATE payments
      SET status = 'Payment Done', utr_number = $1, pay_mode = $2,
          date = $3
      WHERE id = $4 AND tenant_id = $5
      RETURNING id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId", utr_number AS "utrNumber", pay_mode AS "payMode", fee_type AS "feeType";
    `, [utrNumber, payMode || 'offline', new Date().toLocaleDateString('en-IN'), id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Payment not found.' })

    if (r.rows[0].feeType === 'Semester') {
      await pool.query(`UPDATE applications SET semester_fee_status = 'Payment Done' WHERE app_no = $1 AND tenant_id = $2;`, [r.rows[0].appNo, req.tenantId])
    } else {
      // Also update linked application pay status
      await pool.query(`UPDATE applications SET pay_status = 'Payment Done' WHERE app_no = $1 AND tenant_id = $2;`, [r.rows[0].appNo, req.tenantId])
      // Auto-send provisional letter (non-blocking)
      autoSendAdmissionLetter(r.rows[0].appNo, utrNumber, req.tenantId).catch(() => {})
    }

    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Approve payment (Accounts/Admin) — Payment Done → Paid
app.post('/api/payments/:id/approve', async (req, res) => {
  const { id } = req.params
  try {
    const r = await pool.query(`
      UPDATE payments SET status = 'Paid'
      WHERE id = $1 AND status = 'Payment Done' AND tenant_id = $2
      RETURNING id, name, app_no AS "appNo", amount, status, utr_number AS "utrNumber", fee_type AS "feeType";
    `, [id, req.tenantId])
    if (!r.rows[0]) return res.status(400).json({ error: 'Payment not found or not in Payment Done status.' })

    if (r.rows[0].feeType === 'Semester') {
      await pool.query(`UPDATE applications SET semester_fee_status = 'Paid', erp_access_granted = true, erp_access_granted_at = NOW() WHERE app_no = $1 AND tenant_id = $2;`, [r.rows[0].appNo, req.tenantId])
      await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1,$2,$3);',
        [`1st semester fee paid — ERP access granted: ${r.rows[0].appNo} (${r.rows[0].name})`, 'Just now', req.tenantId])
      grantErpAccess(r.rows[0].appNo, req.tenantId).catch(() => {})
    } else {
      await pool.query(`UPDATE applications SET pay_status = 'Paid' WHERE app_no = $1 AND tenant_id = $2;`, [r.rows[0].appNo, req.tenantId])
      await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1,$2,$3);',
        [`Payment approved: ₹25,000 — ${r.rows[0].appNo} (${r.rows[0].name})`, 'Just now', req.tenantId])
      // Auto-send provisional letter (non-blocking)
      autoSendAdmissionLetter(r.rows[0].appNo, r.rows[0].utrNumber || 'N/A', req.tenantId).catch(() => {})
      // Gate next step behind email OTP verification (non-blocking)
      sendApplicationEmailOtp(r.rows[0].appNo, req.tenantId).catch(() => {})
    }

    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Admin/Manager unlocks the 1st semester fee once required documents are verified
app.post('/api/applications/:id/unlock-semester-fee', authenticateToken, async (req, res) => {
  if (!['Admin', 'Manager'].includes(req.user.role) && !req.user.isSuperAdmin) {
    return res.status(403).json({ error: 'Only Admin/Manager can unlock the semester fee.' })
  }
  try {
    const r = await pool.query(
      `UPDATE applications SET semester_fee_status = 'Pending'
       WHERE id = $1 AND tenant_id = $2 AND semester_fee_status = 'Locked'
       RETURNING id, app_no AS "appNo", name, semester_fee_status AS "semesterFeeStatus";`,
      [req.params.id, req.tenantId]
    )
    if (!r.rows[0]) return res.status(400).json({ error: 'Semester fee is already unlocked, or the application was not found.' })
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1,$2,$3);',
      [`Semester fee unlocked for ${r.rows[0].appNo} (${r.rows[0].name})`, 'Just now', req.tenantId])
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Create the semester-fee payment record (separate row from the application fee,
// same app_no) once it's unlocked — the existing Razorpay/offline UI then targets it by id.
app.post('/api/applications/:id/generate-semester-fee', authenticateToken, async (req, res) => {
  try {
    const appRes = await pool.query('SELECT * FROM applications WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])
    if (!appRes.rows[0]) return res.status(404).json({ error: 'Application not found.' })
    const app = appRes.rows[0]
    if (app.semester_fee_status !== 'Pending') {
      return res.status(400).json({ error: `Semester fee isn't unlocked yet (status: ${app.semester_fee_status}). Verify required documents first.` })
    }
    const amount = parseInt(req.body.amount) || 45000
    const insertRes = await pool.query(`
      INSERT INTO payments (name, app_no, amount, method, status, date, fee_type, tenant_id)
      VALUES ($1, $2, $3, $4, 'Pending', '', 'Semester', $5)
      RETURNING id, name, app_no AS "appNo", amount, method, status, fee_type AS "feeType";
    `, [app.name, app.app_no, amount, req.body.method || '', req.tenantId])
    res.json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Public — resend the application-fee-stage email OTP (student lost/didn't get it)
app.post('/api/public/resend-email-otp', async (req, res) => {
  const { appNo } = req.body
  if (!appNo) return res.status(400).json({ error: 'Application number required.' })
  try {
    const r = await pool.query('SELECT tenant_id FROM applications WHERE app_no = $1;', [appNo])
    if (!r.rows[0]) return res.status(404).json({ error: 'Application not found.' })
    await sendApplicationEmailOtp(appNo, r.rows[0].tenant_id)
    res.json({ message: 'OTP resent — please check your email.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Public — verify the email OTP; on success, issue a document-upload link and email it
app.post('/api/public/verify-email-otp', async (req, res) => {
  const { appNo, otp } = req.body
  if (!appNo || !otp) return res.status(400).json({ error: 'Application number and OTP are required.' })
  try {
    const r = await pool.query('SELECT * FROM applications WHERE app_no = $1;', [appNo])
    if (!r.rows[0]) return res.status(404).json({ error: 'Application not found.' })
    const app = r.rows[0]

    if (app.email_verified) return res.json({ success: true, alreadyVerified: true })
    if (!app.email_otp || !app.email_otp_expires_at) return res.status(400).json({ error: 'No OTP requested. Please request a new one.' })
    if (new Date(app.email_otp_expires_at) < new Date()) return res.status(400).json({ error: 'OTP has expired. Please request a new one.' })
    if (String(app.email_otp).trim() !== String(otp).trim()) return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' })

    await pool.query(`UPDATE applications SET email_verified = true, email_otp = NULL, email_otp_expires_at = NULL WHERE id = $1;`, [app.id])

    // Reuse the existing document-upload-link infrastructure (document_links + /document-upload/:token)
    // by matching this application back to its originating lead on email/mobile.
    let shareUrl = null
    const leadRes = await pool.query(
      `SELECT id FROM leads WHERE tenant_id = $1 AND (LOWER(email) = LOWER($2) OR mobile = $3) LIMIT 1;`,
      [app.tenant_id, app.email, app.mobile]
    )
    if (leadRes.rows[0]) {
      const token = require('crypto').randomBytes(16).toString('hex')
      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      await pool.query(
        `INSERT INTO document_links (lead_id, token, created_by, expiry_date) VALUES ($1, $2, $3, $4);`,
        [leadRes.rows[0].id, token, 'System (Email Verification)', expiryDate]
      )
      await pool.query(`UPDATE applications SET doc_upload_token = $1 WHERE id = $2;`, [token, app.id])
      shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/document-upload/${token}`
      await sendSystemMailAlert(
        app.email,
        `Upload your documents — Admission ${appNo}`,
        `Dear ${app.name},\n\nYour email has been verified. Please upload your required documents using the secure link below:\n\n${shareUrl}\n\nThis link is valid for 30 days.\n\nAdmission Reference: ${appNo}\n\nBest regards,\nCUTM Admissions Team`,
        app.tenant_id
      )
    } else {
      console.warn(`[Email Verify] No matching lead for application ${appNo} — document-upload link not sent`)
    }

    res.json({ success: true, docUploadLinkSent: !!shareUrl })
  } catch (err) {
    console.error('[Email Verify]', err)
    res.status(500).json({ error: err.message })
  }
})

// Bulk approve payments via Excel/CSV — accepts UTR list, marks each as Paid
app.post('/api/payments/bulk-approve', (req, res, next) => {
  uploadBulk.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const filePath = req.file.path
  try {
    let workbook
    try { workbook = XLSX.readFile(filePath, { cellDates: true, raw: false }) }
    catch (e) { return res.status(400).json({ error: `Cannot read file: ${e.message}` }) }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
    if (!rows.length) return res.status(400).json({ error: 'File is empty.' })

    let approved = 0, skipped = 0, errors = []
    for (const [i, row] of rows.entries()) {
      const rowNum = i + 2
      const appNo = String(row['App ID'] || row['AppNo'] || row['Application ID'] || row.appNo || '').trim()
      const utr   = String(row['UTR'] || row['UTR Number'] || row['Reference'] || row.utrNumber || '').trim()
      if (!appNo) { errors.push(`Row ${rowNum}: missing App ID`); skipped++; continue }

      try {
        // Approve any payment that matches appNo and is in Payment Done OR has matching UTR
        const result = await pool.query(`
          UPDATE payments SET status = 'Paid'
          WHERE app_no = $1 AND status IN ('Payment Done','Pending')
          RETURNING id, name, app_no AS "appNo", utr_number AS "utrNumber";
        `, [appNo])

        if (result.rows.length === 0) {
          errors.push(`Row ${rowNum} (${appNo}): no pending payment found`)
          skipped++; continue
        }

        // If UTR provided in the CSV and not already set, save it
        if (utr) {
          await pool.query('UPDATE payments SET utr_number = COALESCE(NULLIF(utr_number,\'\'), $1) WHERE app_no = $2;', [utr, appNo])
        }

        // Sync application
        await pool.query(`UPDATE applications SET pay_status = 'Paid' WHERE app_no = $1;`, [appNo])
        approved++
      } catch (e) {
        errors.push(`Row ${rowNum} (${appNo}): ${e.message}`)
        skipped++
      }
    }

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
      [`Bulk payment approval: ${approved} marked as Paid, ${skipped} skipped`, 'Just now'])
    res.json({ success: true, approved, skipped, total: rows.length, errors: errors.slice(0, 10) })
  } catch (err) {
    console.error('[Bulk Approve]', err)
    res.status(500).json({ error: err.message })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

// --- QUERIES/TICKETS ROUTERS ---
app.get('/api/queries', async (req, res) => {
  try {
    const queriesRes = await pool.query('SELECT id, student, subject, category, priority, status, assignee, created FROM queries ORDER BY id DESC;')
    res.json(queriesRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickets.' })
  }
})

app.post('/api/queries', async (req, res) => {
  const { student, subject, category, priority, status, assignee } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO queries (student, subject, category, priority, status, assignee, created)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, student, subject, category, priority, status, assignee, created;
    `, [student, subject, category || 'Admission', priority || 'Medium', status || 'Open', assignee, new Date().toLocaleDateString('en-IN')])
    
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`New support ticket raised by student: ${subject}`, 'Just now'])
    
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to open ticket.' })
  }
})

app.put('/api/queries/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    const updateRes = await pool.query('UPDATE queries SET status = $1 WHERE id = $2 RETURNING id, status;', [status, id])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Ticket not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to modify ticket status.' })
  }
})

// --- DOCUMENTS ROUTERS ---
app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { requesterRole, requesterName } = req.query
    // Admin/Manager/Finance see all; counsellors only their assigned leads' documents (matched by student name)
    const isCounsellor = requesterRole && !['Admin', 'Manager', 'Finance'].includes(requesterRole) && requesterName
    let sql = 'SELECT id, student, type, status, upload_date AS "uploadDate", file_url AS "fileUrl" FROM documents WHERE tenant_id = $1'
    const params = [req.tenantId]
    if (isCounsellor) {
      params.push(requesterName)
      sql += ` AND LOWER(student) IN (SELECT LOWER(name) FROM leads WHERE LOWER(owner) = LOWER($${params.length}) AND tenant_id = $1)`
    }
    sql += ' ORDER BY id DESC;'
    const docsRes = await pool.query(sql, params)
    res.json(docsRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents.' })
  }
})

app.post('/api/documents', async (req, res) => {
  const { student, type, status, fileUrl } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO documents (student, type, status, upload_date, file_url, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, student, type, status, upload_date AS "uploadDate", file_url AS "fileUrl";
    `, [student, type, status || 'Pending', new Date().toLocaleDateString('en-IN'), fileUrl || '', req.tenantId])

    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`Student uploaded document for verification: ${type}`, 'Just now', req.tenantId])

    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to register document upload.' })
  }
})

app.put('/api/documents/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    const updateRes = await pool.query('UPDATE documents SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, status;', [status, id, req.tenantId])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Document not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify/reject document.' })
  }
})

app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleteRes = await pool.query('DELETE FROM documents WHERE id = $1 AND tenant_id = $2 RETURNING id;', [id, req.tenantId])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'Document not found.' })
    res.json({ message: 'Document deleted.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document.' })
  }
})

// --- EVENTS ROUTERS ---
app.get('/api/events', authenticateToken, async (req, res) => {
  try {
    const evRes = await pool.query('SELECT id, title, date, time, type, venue, participants FROM events WHERE tenant_id = $1 ORDER BY id DESC;', [req.tenantId])
    res.json(evRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events.' })
  }
})

app.post('/api/events', async (req, res) => {
  const { title, date, time, type, venue, participants } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO events (title, date, time, type, venue, participants, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, title, date, time, type, venue, participants;
    `, [title, date, time, type, venue, participants || 1, req.tenantId])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to schedule calendar event.' })
  }
})

// --- CAMPAIGNS ROUTERS ---
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const campRes = await pool.query('SELECT id, name, channel, status, budget, spent, leads, conversions, start_date AS "startDate", end_date AS "endDate" FROM campaigns WHERE tenant_id = $1 ORDER BY id DESC;', [req.tenantId])
    res.json(campRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch campaigns.' })
  }
})

app.post('/api/campaigns', async (req, res) => {
  const { name, channel, status, budget } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO campaigns (name, channel, status, budget, spent, leads, conversions, start_date, tenant_id)
      VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6)
      RETURNING id, name, channel, status, budget, spent, leads, conversions, start_date AS "startDate";
    `, [name, channel, status || 'Active', budget || 0, new Date().toLocaleDateString('en-IN'), req.tenantId])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create marketing campaign.' })
  }
})

app.put('/api/campaigns/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    const updateRes = await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, status;', [status, id, req.tenantId])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle campaign status.' })
  }
})

// --- COUNSELORS (derived from users + live lead/app/payment stats) ---
app.get('/api/counselors', authenticateToken, async (req, res) => {
  try {
    const tnt = req.tenantId
    const usersRes = await pool.query(
      "SELECT id, name, email FROM users WHERE status = 'Active' AND tenant_id = $1 ORDER BY name;",
      [tnt]
    )
    const counselors = []
    for (const u of usersRes.rows) {
      const simplName = u.name.split(' ')[0]

      const leadsRes = await pool.query(
        "SELECT COUNT(*) FROM leads WHERE (owner = $1 OR owner LIKE $2) AND tenant_id = $3;",
        [u.name, `${simplName}%`, tnt]
      )
      const untouchedRes = await pool.query(
        "SELECT COUNT(*) FROM leads WHERE (owner = $1 OR owner LIKE $2) AND stage = 'Untouched' AND tenant_id = $3;",
        [u.name, `${simplName}%`, tnt]
      )
      const appsRes = await pool.query(
        "SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND tenant_id = $3;",
        [u.name, `${simplName}%`, tnt]
      )
      const payRes = await pool.query(
        "SELECT COUNT(*) FROM payments p JOIN applications a ON p.app_no = a.app_no WHERE (a.owner = $1 OR a.owner LIKE $2) AND (p.status = 'Approved' OR p.status = 'Payment Approved') AND a.tenant_id = $3;",
        [u.name, `${simplName}%`, tnt]
      )
      const submittedRes = await pool.query(
        "SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND stage = 'Application Submitted' AND tenant_id = $3;",
        [u.name, `${simplName}%`, tnt]
      )
      const enrolledRes = await pool.query(
        "SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND (stage = 'Enrolment' OR stage = 'Enrolments') AND tenant_id = $3;",
        [u.name, `${simplName}%`, tnt]
      )

      // Telephony — call_logs by counsellor
      let callsMade = 0, callsConnected = 0, avgCallDuration = '0:00', connectRate = '0%'
      try {
        const cRes = await pool.query(
          "SELECT COUNT(*)::int AS total, SUM(CASE WHEN outcome='Connected' THEN 1 ELSE 0 END)::int AS connected FROM call_logs WHERE counselor = $1 OR counselor LIKE $2;",
          [u.name, `${simplName}%`]
        )
        callsMade = cRes.rows[0].total || 0
        callsConnected = cRes.rows[0].connected || 0
        if (callsMade > 0) connectRate = Math.round((callsConnected / callsMade) * 100) + '%'
      } catch {}

      // Queries — by assignee
      let queriesTotal = 0, queriesOpen = 0, queriesResolved = 0
      try {
        const qRes = await pool.query(
          "SELECT COUNT(*)::int AS total, SUM(CASE WHEN status='Open' THEN 1 ELSE 0 END)::int AS open, SUM(CASE WHEN status IN ('Resolved','Closed') THEN 1 ELSE 0 END)::int AS resolved FROM queries WHERE assignee = $1 OR assignee LIKE $2;",
          [u.name, `${simplName}%`]
        )
        queriesTotal = qRes.rows[0].total || 0
        queriesOpen = qRes.rows[0].open || 0
        queriesResolved = qRes.rows[0].resolved || 0
      } catch {}

      // Effort — WA + Email + SMS sent counts where this user was sender (best-effort)
      let waSent = 0, emailsSent = 0, smsSent = 0
      try {
        const wRes = await pool.query("SELECT COALESCE(SUM(recipient_count),0)::int AS c FROM whatsapp_logs WHERE status = 'Sent';")
        waSent = wRes.rows[0].c || 0
      } catch {}
      const totalTouches = callsMade + waSent + emailsSent + smsSent

      const leads = parseInt(leadsRes.rows[0].count)
      const untouched = parseInt(untouchedRes.rows[0].count)
      counselors.push({
        name:       u.name,
        email:      u.email,
        leads,
        apps:       parseInt(appsRes.rows[0].count),
        engaged:    leads - untouched,
        untouched,
        payApproved: parseInt(payRes.rows[0].count),
        submitted:  parseInt(submittedRes.rows[0].count),
        enrolled:   parseInt(enrolledRes.rows[0].count),
        // Telephony
        callsMade, callsConnected, avgCallDuration, connectRate,
        // Queries
        queriesTotal, queriesOpen, queriesResolved, avgResolutionHours: '—',
        // Effort
        totalTouches, waSent, emailsSent, smsSent,
      })
    }
    res.json(counselors)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch counselor stats.' })
  }
})


// ── ADMIN — Manual Backup Trigger ────────────────────────────────────────────
app.post('/api/admin/backup-now', async (req, res) => {
  try {
    const { exec } = await import('child_process')
    const script = '/usr/local/bin/ccrm-backup.sh'
    exec(script, { timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: err.message, stderr })
      res.json({ ok: true, output: stdout })
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Server version + uptime info (called by Navbar version chip if needed)
app.get('/api/admin/version', (req, res) => {
  res.json({
    version: '1.4.0',
    released: '2026-06-01',
    node: process.version,
    uptimeSec: Math.floor(process.uptime())
  })
})

// ── ADMIN — Server Health & Security Overview ────────────────────────────────
// ── DASHBOARD STATS — all aggregation in SQL (scales to 1cr+ rows) ──────────
// Optional ?owner=Name (counsellor) or ?manager=Name (their team) to scope.
const dashboardCache = new Map()   // key → { ts, data }; short TTL to absorb repeat loads
const DASHBOARD_TTL_MS = 60000

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const { owner, manager, campus } = req.query

    // Serve a recent cached result (dashboard tolerates ~60s staleness; avoids
    // re-scanning the whole leads table on every page load / poll).
    const cacheKey = JSON.stringify({ t: req.tenantId, owner: owner || '', manager: manager || '', campus: campus || '' })
    const hit = dashboardCache.get(cacheKey)
    if (hit && (Date.now() - hit.ts) < DASHBOARD_TTL_MS) return res.json(hit.data)

    // Build filters (parameterised) for role-scoped dashboards.
    // $1 is always the tenant (multi-tenant) — every query below is scoped to it.
    let ownerWhere = ''
    const params = [req.tenantId]
    const whereConditions = ['l.tenant_id = $1']

    // Campus filter (if not "All")
    if (campus && campus !== 'All') {
      params.push(campus)
      whereConditions.push(`l.campus = $${params.length}`)
    }

    // Owner/Manager scope
    if (owner) {
      params.push(owner)
      whereConditions.push(`l.owner = $${params.length}`)
    } else if (manager) {
      params.push(manager)
      params.push(manager)
      whereConditions.push(`(l.owner = $${params.length - 1} OR l.owner IN (SELECT name FROM users WHERE reports_to = $${params.length} AND tenant_id = $1))`)
    }

    ownerWhere = 'WHERE ' + whereConditions.join(' AND ')

    // Scope the visible counsellors the same way as the KPI (own / team / all)
    let userScope = 'AND u.tenant_id = $1'
    const userParams = [req.tenantId]
    if (owner) {
      userParams.push(owner)
      userScope += ` AND u.name = $${userParams.length}`
    } else if (manager) {
      userParams.push(manager)
      userScope += ` AND (u.name = $${userParams.length} OR u.reports_to = $${userParams.length})`
    }
    const tp = [req.tenantId]

    // All independent aggregates run concurrently (was ~4s sequential → ~slowest query)
    const [kpi, appTotal, enrolTotal, revTotal, perCounsellor, domainRes, matrixRes, sourceRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS "totalLeads",
          SUM(CASE WHEN owner IS NULL OR owner = '' OR owner = 'Unassigned' THEN 1 ELSE 0 END)::int AS unassigned,
          SUM(CASE WHEN stage='Untouched'      THEN 1 ELSE 0 END)::int AS untouched,
          SUM(CASE WHEN stage='Contacted'      THEN 1 ELSE 0 END)::int AS contacted,
          SUM(CASE WHEN stage='Follow Up'      THEN 1 ELSE 0 END)::int AS "followUp",
          SUM(CASE WHEN stage='Interested'     THEN 1 ELSE 0 END)::int AS interested,
          SUM(CASE WHEN stage='Qualified Leads' THEN 1 ELSE 0 END)::int AS qualified,
          SUM(CASE WHEN stage='Process for Payment' THEN 1 ELSE 0 END)::int AS "processForPayment",
          SUM(CASE WHEN stage='Payment Success' THEN 1 ELSE 0 END)::int AS "paymentSuccess",
          SUM(CASE WHEN stage='Not Interested' THEN 1 ELSE 0 END)::int AS "notInterested",
          SUM(CASE WHEN stage='Converted'      THEN 1 ELSE 0 END)::int AS converted
        FROM leads l ${ownerWhere};`, params),
      pool.query('SELECT COUNT(*)::int AS c FROM applications WHERE tenant_id = $1;', tp),
      pool.query("SELECT COUNT(*)::int AS c FROM applications WHERE stage IN ('Enrolment','Enrolments') AND tenant_id = $1;", tp),
      pool.query("SELECT COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE status IN ('Approved','Payment Approved','Paid') AND utr_number IS NOT NULL AND TRIM(utr_number) <> '' AND tenant_id = $1;", tp),
      pool.query(`
        SELECT
          u.name, u.email,
          COUNT(l.id)::int AS leads,
          SUM(CASE WHEN l.owner IS NULL OR l.owner = '' OR l.owner = 'Unassigned' THEN 1 ELSE 0 END)::int AS unassigned,
          SUM(CASE WHEN l.stage='Untouched' THEN 1 ELSE 0 END)::int AS untouched,
          SUM(CASE WHEN l.stage='Contacted' THEN 1 ELSE 0 END)::int AS contacted,
          SUM(CASE WHEN l.stage='Follow Up' THEN 1 ELSE 0 END)::int AS "followUp",
          SUM(CASE WHEN l.stage='Interested' THEN 1 ELSE 0 END)::int AS interested,
          SUM(CASE WHEN l.stage='Not Interested' THEN 1 ELSE 0 END)::int AS "notInterested",
          SUM(CASE WHEN l.stage='Qualified Leads' THEN 1 ELSE 0 END)::int AS qualified,
          SUM(CASE WHEN l.stage='Converted' THEN 1 ELSE 0 END)::int AS converted
        FROM users u
        LEFT JOIN leads l ON LOWER(l.owner) = LOWER(u.name) AND l.tenant_id = u.tenant_id
        WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ${userScope}
        GROUP BY u.name, u.email
        HAVING COUNT(l.id) > 0
        ORDER BY leads DESC
        LIMIT 50;`, userParams),
      pool.query(`
        SELECT
          CASE WHEN u.email ILIKE '%@cutmap.ac.in' THEN 'cutmap'
               WHEN u.email ILIKE '%@cutm.ac.in'   THEN 'cutm'
               ELSE 'other' END AS domain,
          l.stage AS stage, COUNT(*)::int AS count
        FROM leads l
        JOIN users u ON LOWER(regexp_replace(l.owner,'[^a-zA-Z0-9]','','g')) = LOWER(regexp_replace(u.name,'[^a-zA-Z0-9]','','g')) AND u.tenant_id = l.tenant_id
        ${ownerWhere}
        GROUP BY domain, l.stage;`, params),
      pool.query(`
        SELECT u.name AS counsellor, u.email AS email, l.stage AS stage, COUNT(l.id)::int AS count
        FROM users u
        JOIN leads l ON LOWER(regexp_replace(l.owner,'[^a-zA-Z0-9]','','g')) = LOWER(regexp_replace(u.name,'[^a-zA-Z0-9]','','g')) AND l.tenant_id = u.tenant_id
        WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ${userScope}
        GROUP BY u.name, u.email, l.stage;`, userParams),
      pool.query(`
        SELECT COALESCE(NULLIF(source,''),'Unknown') AS source, COUNT(*)::int AS leads
        FROM leads l ${ownerWhere} GROUP BY 1 ORDER BY leads DESC LIMIT 12;`, params),
    ])

    const byCounsellor = perCounsellor.rows.map(r => ({
      ...r,
      domain: (r.email || '').includes('@cutmap.ac.in') ? 'cutmap'
            : (r.email || '').includes('@cutm.ac.in') ? 'cutm' : 'other'
    }))

    // CUTM vs CUTMAP split — per-stage counts, by the owning counselor's email domain
    // CUTM and CUTMAP only — GT Entities are a separate business (own dashboard)
    const byDomain = { cutm: { total: 0, stages: {} }, cutmap: { total: 0, stages: {} } }
    for (const row of domainRes.rows) {
      if (row.domain === 'cutm' || row.domain === 'cutmap') {
        const stg = row.stage || 'Unknown'
        byDomain[row.domain].stages[stg] = (byDomain[row.domain].stages[stg] || 0) + row.count
        byDomain[row.domain].total += row.count
      }
    }
    // Reconcile to the grand total: everything not owned by a CUTM/CUTMAP counsellor
    // (unassigned, GT-owned, or owner not matching a user) so cutm+cutmap+other = total.
    byDomain.other = { total: Math.max(0, (kpi.rows[0]?.totalLeads || 0) - byDomain.cutm.total - byDomain.cutmap.total), stages: {} }

    // Counsellor × stage matrix (role-scoped) for the Stage Summary — matrixRes was
    // fetched in the Promise.all above.
    const matrixMap = {}
    for (const row of matrixRes.rows) {
      if (!matrixMap[row.counsellor]) {
        const domain = (row.email || '').includes('@cutmap.ac.in') ? 'cutmap'
                     : (row.email || '').includes('@cutm.ac.in') ? 'cutm' : 'other'
        matrixMap[row.counsellor] = { counsellor: row.counsellor, domain, stages: {}, total: 0 }
      }
      matrixMap[row.counsellor].stages[row.stage || 'Unknown'] = row.count
      matrixMap[row.counsellor].total += row.count
    }
    const byCounsellorStages = Object.values(matrixMap).sort((a, b) => b.total - a.total)

    // For a counsellor: their own GT-entity leads across the entities they're granted
    let gtEntities = []
    if (owner) {
      const uent = await pool.query('SELECT entities FROM users WHERE name = $1 AND tenant_id = $2 LIMIT 1;', [owner, req.tenantId])
      const granted = String(uent.rows[0]?.entities || 'CUTM').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      for (const code of ['FTL', 'GTIB', 'GTTECH', 'ESSE']) {
        if (!granted.includes(code)) continue
        const t = `${code.toLowerCase()}_leads`
        const g = await pool.query(
          `SELECT COUNT(*)::int AS total, SUM(CASE WHEN status='Not Contacted' THEN 1 ELSE 0 END)::int AS untouched
           FROM ${t} WHERE LOWER(TRIM(owner)) = LOWER(TRIM($1)) AND tenant_id = $2;`, [owner, req.tenantId]
        ).catch(() => ({ rows: [{ total: 0, untouched: 0 }] }))
        gtEntities.push({ entity: code, total: g.rows[0].total || 0, untouched: g.rows[0].untouched || 0 })
      }
    }

    const payload = {
      kpi: kpi.rows[0],
      applications: appTotal.rows[0].c,
      enrolments:   enrolTotal.rows[0].c,
      revenue:      Number(revTotal.rows[0].s),
      byCounsellor,
      byDomain,
      byCounsellorStages,
      gtEntities,
      bySource: sourceRes.rows,
    }
    dashboardCache.set(cacheKey, { ts: Date.now(), data: payload })
    res.json(payload)
  } catch (err) {
    console.error('[dashboard/stats]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── REPORTS OVERVIEW — all aggregates computed in SQL (scales to millions) ───
app.get('/api/reports/overview', authenticateToken, async (req, res) => {
  try {
    const range = req.query.range || 'all'
    const now = new Date()
    let cutoff = null
    if (range === '7')        { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7) }
    else if (range === '30')  { cutoff = new Date(now); cutoff.setDate(now.getDate() - 30) }
    else if (range === '90')  { cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3) }
    else if (range === 'year'){ cutoff = new Date(now.getFullYear(), 0, 1) }
    const cutoffISO = cutoff ? cutoff.toISOString().slice(0, 10) : null

    // Safe text→date for 'DD/MM/YYYY[, ...]' columns (NULL when unparseable)
    const dExpr = (col) =>
      `CASE WHEN ${col} ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' ` +
      `THEN to_date(substring(${col} from '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}'),'DD/MM/YYYY') END`
    // Date predicate: keep rows in range OR with no parseable date (matches client)
    const datePred = (col, idx) => cutoffISO ? `(${dExpr(col)} IS NULL OR ${dExpr(col)} >= $${idx}::date)` : 'TRUE'
    // tenant_id is appended last so the date predicate's $1 index stays valid
    const lp = cutoffISO ? [cutoffISO, req.tenantId] : [req.tenantId]
    const tIdx = lp.length
    const lw = `WHERE tenant_id = $${tIdx} AND ${datePred('reg_date', 1)}`
    const aw = `WHERE tenant_id = $${tIdx} AND ${datePred('date', 1)}`
    const pw = `WHERE tenant_id = $${tIdx} AND ${datePred('date', 1)}`

    // KPI + funnel from leads
    const leadAgg = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalLeads",
        SUM(CASE WHEN stage <> 'Untouched' THEN 1 ELSE 0 END)::int AS contacted,
        SUM(CASE WHEN stage IN ('Interested','Qualified Leads') THEN 1 ELSE 0 END)::int AS interested
      FROM leads ${lw};`, lp)

    const sourceData = await pool.query(`
      SELECT COALESCE(NULLIF(source,''),'Unknown') AS source, COUNT(*)::int AS leads
      FROM leads ${lw} GROUP BY 1 ORDER BY leads DESC LIMIT 12;`, lp)

    // Applications
    const appAgg = await pool.query(`
      SELECT COUNT(*)::int AS "totalApps",
             SUM(CASE WHEN stage IN ('Enrolment','Enrolments') THEN 1 ELSE 0 END)::int AS enrolled
      FROM applications ${aw};`, lp)

    const courseData = await pool.query(`
      SELECT COALESCE(NULLIF(course,''),'Unspecified') AS course,
             COUNT(*)::int AS apps,
             SUM(CASE WHEN stage IN ('Enrolment','Enrolments') THEN 1 ELSE 0 END)::int AS enrolled
      FROM applications ${aw} GROUP BY 1 ORDER BY apps DESC LIMIT 12;`, lp)

    // Payments — revenue counts only verified (Paid/Approved) with a UTR
    const payAgg = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('Approved','Payment Approved','Paid') AND utr_number IS NOT NULL AND TRIM(utr_number) <> '' THEN amount ELSE 0 END),0)::bigint AS revenue,
        SUM(CASE WHEN status IN ('Approved','Payment Approved','Paid') AND utr_number IS NOT NULL AND TRIM(utr_number) <> '' THEN 1 ELSE 0 END)::int AS paid,
        SUM(CASE WHEN status IN ('Pending','Payment Done') THEN 1 ELSE 0 END)::int AS pending,
        SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END)::int AS failed,
        SUM(CASE WHEN status IN ('Pending','Payment Done') THEN amount ELSE 0 END)::bigint AS "pendingAmount",
        SUM(CASE WHEN method = 'Online'  THEN 1 ELSE 0 END)::int AS "onlineCount",
        SUM(CASE WHEN method = 'Offline' THEN 1 ELSE 0 END)::int AS "offlineCount"
      FROM payments ${pw};`, lp)

    // Monthly trend (last 6 months) — leads + apps + enrolled
    const leadsByMonth = await pool.query(`
      SELECT to_char(d,'YYYY-MM') AS ym, COUNT(*)::int AS c FROM (
        SELECT ${dExpr('reg_date')} AS d FROM leads ${lw}
      ) t WHERE d IS NOT NULL GROUP BY 1;`, lp)
    const appsByMonth = await pool.query(`
      SELECT to_char(d,'YYYY-MM') AS ym,
             COUNT(*)::int AS c,
             SUM(CASE WHEN stg IN ('Enrolment','Enrolments') THEN 1 ELSE 0 END)::int AS e FROM (
        SELECT ${dExpr('date')} AS d, stage AS stg FROM applications ${aw}
      ) t WHERE d IS NOT NULL GROUP BY 1;`, lp)

    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const lm = Object.fromEntries(leadsByMonth.rows.map(r => [r.ym, r.c]))
    const amCount = Object.fromEntries(appsByMonth.rows.map(r => [r.ym, r.c]))
    const amEnr = Object.fromEntries(appsByMonth.rows.map(r => [r.ym, r.e]))
    const monthly = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthly.push({ month: MONTH_LABELS[d.getMonth()], leads: lm[ym] || 0, apps: amCount[ym] || 0, enrolled: amEnr[ym] || 0 })
    }

    const la = leadAgg.rows[0], pa = payAgg.rows[0], aa = appAgg.rows[0]
    const totalLeads = la.totalLeads || 0
    res.json({
      kpi: { totalLeads, totalApps: aa.totalApps || 0, enrolled: aa.enrolled || 0, revenue: Number(pa.revenue) },
      sourceData: sourceData.rows.map(s => ({ source: s.source, leads: s.leads, pct: Math.round((s.leads / (totalLeads || 1)) * 100) })),
      funnel: { totalLeads, contacted: la.contacted || 0, interested: la.interested || 0, started: aa.totalApps || 0, paid: pa.paid || 0, enrolled: aa.enrolled || 0 },
      courseData: courseData.rows,
      payments: {
        paid: pa.paid || 0, pending: pa.pending || 0, failed: pa.failed || 0,
        revenue: Number(pa.revenue), pendingAmount: Number(pa.pendingAmount),
        onlineCount: pa.onlineCount || 0, offlineCount: pa.offlineCount || 0,
      },
      monthly,
    })
  } catch (err) {
    console.error('[reports/overview]', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/admin/server-health', async (req, res) => {
  try {
    const os = await import('os')
    const startedAt = process.uptime()
    const mem = process.memoryUsage()
    const totalMem = os.totalmem()
    const freeMem  = os.freemem()

    let dbStatus = 'down', dbLatencyMs = null, dbTime = null
    try {
      const t0 = Date.now()
      const r = await pool.query('SELECT NOW() as now, version() as version')
      dbLatencyMs = Date.now() - t0
      dbStatus = 'up'
      dbTime = r.rows[0].now
    } catch (e) {
      dbStatus = `error: ${e.message}`
    }

    // Table row counts (privacy-safe)
    const tableCounts = {}
    try {
      const tables = ['leads','applications','payments','users','tasks','queries','documents','email_logs','whatsapp_logs','call_logs','notifications']
      for (const t of tables) {
        try {
          const r = await pool.query(`SELECT COUNT(*) as count FROM ${t}`)
          tableCounts[t] = parseInt(r.rows[0].count)
        } catch { tableCounts[t] = 0 }
      }
    } catch {}

    res.json({
      server: {
        status: 'up',
        uptimeSec: Math.floor(startedAt),
        nodeVersion: process.version,
        platform: process.platform,
        hostname: os.hostname(),
        loadAvg1m: os.loadavg()[0].toFixed(2),
        cpuCount: os.cpus().length,
      },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        systemTotalGB: (totalMem / 1024 / 1024 / 1024).toFixed(2),
        systemFreeGB: (freeMem / 1024 / 1024 / 1024).toFixed(2),
        systemUsedPct: Math.round((1 - freeMem / totalMem) * 100),
      },
      database: { status: dbStatus, latencyMs: dbLatencyMs, time: dbTime },
      counts: tableCounts,
      checkedAt: new Date().toISOString()
    })
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message })
  }
})

// ── ADMIN — Security & User Access Overview ───────────────────────────────────
app.get('/api/admin/security-overview', async (req, res) => {
  try {
    const userStats = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status='Active'   THEN 1 ELSE 0 END)::int AS active,
        SUM(CASE WHEN status='Inactive' THEN 1 ELSE 0 END)::int AS inactive,
        SUM(CASE WHEN role='Admin'      THEN 1 ELSE 0 END)::int AS admins,
        SUM(CASE WHEN role='Manager'    THEN 1 ELSE 0 END)::int AS managers,
        SUM(CASE WHEN role='Counselor'  THEN 1 ELSE 0 END)::int AS counselors,
        SUM(CASE WHEN role='Finance'    THEN 1 ELSE 0 END)::int AS finance
      FROM users;
    `)

    // Recent logins (top 8 most recent active users)
    const recentLogins = await pool.query(`
      SELECT name, email, role, last_login AS "lastLogin"
      FROM users
      WHERE last_login IS NOT NULL AND last_login <> ''
      ORDER BY id DESC LIMIT 8;
    `)

    // Failed payment attempts in last 24h (proxy for suspicious activity)
    let failedPayments = 0
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM payments WHERE status = 'Failed';`)
      failedPayments = r.rows[0].c
    } catch {}

    // SSL / SMTP / Telephony config checks
    const checks = []
    const intRes = await pool.query('SELECT key, value FROM integration_settings;')
    const settings = Object.fromEntries(intRes.rows.map(r => [r.key, r.value]))

    checks.push({ label: 'SMTP Email',     ok: !!(settings.smtp_host && settings.smtp_user && settings.smtp_pass) })
    checks.push({ label: 'WhatsApp API',   ok: !!settings.whatsapp_access_token })
    checks.push({ label: 'SMS Gateway',    ok: !!settings.sms_api_key })
    checks.push({ label: 'Payment Gateway',ok: !!(settings.razorpay_key_id || settings.payu_merchant_key) })
    checks.push({ label: 'Telephony (EasyGoIVR)', ok: !!(settings.easygo_email && settings.easygo_password_hash && settings.easygo_did) })

    res.json({
      userStats: userStats.rows[0],
      recentLogins: recentLogins.rows,
      failedPayments,
      integrationChecks: checks,
      checkedAt: new Date().toISOString()
    })
  } catch (err) {
    console.error('[security-overview]', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT id, name, email, role, team, status, picture, mobile, reports_to AS "reportsTo", exclude_from_assignment AS "excludeFromAssignment", entities, is_superadmin AS "isSuperAdmin", last_login AS "lastLogin" FROM users WHERE tenant_id = $1 ORDER BY id DESC;', [req.tenantId])
    res.json(usersRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user accounts.' })
  }
})

app.post('/api/users', async (req, res) => {
  const { name, email, password, role, team, status, mobile, reportsTo } = req.body
  try {
    // Email is unique per tenant, not globally — the same email is fine as a
    // different tenant's user, but must be rejected within this tenant.
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND tenant_id = $2;', [email, req.tenantId])
    if (dup.rows.length) {
      return res.status(409).json({ error: 'A user with this email already exists in your organization.' })
    }
    const insertRes = await pool.query(`
      INSERT INTO users (name, email, password, role, team, status, mobile, reports_to, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, email, role, team, status, picture, mobile, reports_to AS "reportsTo", last_login AS "lastLogin";
    `, [name, email, password || 'User@123', role || 'Counselor', team || 'Sales', status || 'Active', mobile || '', reportsTo || '', req.tenantId])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    console.error(err)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists in your organization.' })
    }
    res.status(500).json({ error: 'Failed to create user account.' })
  }
})

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params
  const { name, email, role, team, status, picture, password, mobile, mobile_number, reportsTo, excludeFromAssignment, entities } = req.body
  try {
    const entStr = Array.isArray(entities) ? entities.join(',') : (typeof entities === 'string' ? entities : null)
    let queryStr = 'UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), team = COALESCE($3, team), status = COALESCE($4, status), picture = COALESCE($5, picture), mobile = COALESCE($6, mobile), reports_to = COALESCE($7, reports_to), mobile_number = COALESCE($8, mobile_number), exclude_from_assignment = COALESCE($9, exclude_from_assignment), entities = COALESCE($10, entities)'
    const params = [name, role, team, status, picture, mobile ?? null, reportsTo ?? null, mobile_number ?? null, (typeof excludeFromAssignment === 'boolean' ? excludeFromAssignment : null), entStr]

    if (password) {
      queryStr += ', password = $11 WHERE id = $12 AND tenant_id = $13'
      params.push(password, id, req.tenantId)
    } else {
      queryStr += ' WHERE id = $11 AND tenant_id = $12'
      params.push(id, req.tenantId)
    }

    queryStr += ' RETURNING id, name, email, role, team, status, picture, mobile, mobile_number, reports_to AS "reportsTo", exclude_from_assignment AS "excludeFromAssignment", entities, last_login AS "lastLogin";'

    const updateRes = await pool.query(queryStr, params)
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update user profile details.' })
  }
})

// Bulk-set entity access for multiple users (Admin only)
app.post('/api/users/bulk-entities', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' })
  const { ids, entities } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No users selected.' })
  const ent = Array.isArray(entities) ? entities.join(',') : String(entities || '')
  try {
    const r = await pool.query('UPDATE users SET entities = $1 WHERE id = ANY($2::int[]) AND tenant_id = $3;', [ent, ids.map(Number).filter(Boolean), req.tenantId])
    res.json({ success: true, updated: r.rowCount, entities: ent })
  } catch (err) {
    console.error('[Bulk Entities]', err.message)
    res.status(500).json({ error: 'Failed to set entities.' })
  }
})

// ── LEAD TRANSFERS — request + admin approve/reject ──────────────────────────
app.post('/api/lead-transfers', async (req, res) => {
  const { leadId, fromOwner, toOwner, remark } = req.body
  if (!leadId || !toOwner) return res.status(400).json({ error: 'leadId and toOwner required' })
  try {
    const r = await pool.query(`
      INSERT INTO lead_transfers (lead_id, from_owner, to_owner, remark, requested_by, status, tenant_id)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      RETURNING id, lead_id AS "leadId", from_owner AS "fromOwner", to_owner AS "toOwner", remark, status, requested_at AS "requestedAt";
    `, [leadId, fromOwner || '', toOwner, remark || '', fromOwner || '', req.tenantId])
    // Notify admin
    await pool.query('INSERT INTO notifications (text, time, type, tenant_id) VALUES ($1, $2, $3, $4);',
      [`🔄 Transfer request: ${fromOwner} → ${toOwner} (Lead #${leadId}). Awaiting approval.`, 'Just now', 'transfer_request', req.tenantId])
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/lead-transfers', async (req, res) => {
  const { status } = req.query
  try {
    let q = `
      SELECT t.id, t.lead_id AS "leadId", t.from_owner AS "fromOwner", t.to_owner AS "toOwner",
             t.remark, t.status, t.requested_at AS "requestedAt", t.decided_at AS "decidedAt",
             t.decided_by AS "decidedBy", t.requested_by AS "requestedBy",
             l.name AS "leadName", l.email AS "leadEmail", l.mobile AS "leadMobile"
      FROM lead_transfers t
      LEFT JOIN leads l ON l.id = t.lead_id AND l.tenant_id = t.tenant_id
    `
    const params = [req.tenantId]
    q += ' WHERE t.tenant_id = $1'
    if (status) { q += ' AND t.status = $2'; params.push(status) }
    q += ' ORDER BY t.requested_at DESC LIMIT 100;'
    const r = await pool.query(q, params)
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/lead-transfers/:id/decide', async (req, res) => {
  const { decision, decidedBy } = req.body   // 'approved' | 'rejected'
  if (!['approved','rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' })
  try {
    const t = await pool.query('SELECT * FROM lead_transfers WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])
    if (!t.rows[0]) return res.status(404).json({ error: 'Transfer not found' })
    if (t.rows[0].status !== 'pending') return res.status(400).json({ error: 'Already decided' })

    const r = await pool.query(`
      UPDATE lead_transfers
      SET status = $1, decided_at = NOW(), decided_by = $2
      WHERE id = $3 AND tenant_id = $4
      RETURNING *;
    `, [decision, decidedBy || 'Admin', req.params.id, req.tenantId])

    // If approved, actually reassign the lead
    if (decision === 'approved') {
      await pool.query('UPDATE leads SET owner = $1 WHERE id = $2 AND tenant_id = $3;', [r.rows[0].to_owner, r.rows[0].lead_id, req.tenantId])
    }

    await pool.query('INSERT INTO notifications (text, time, type, tenant_id) VALUES ($1, $2, $3, $4);',
      [`Transfer #${req.params.id} ${decision}: ${r.rows[0].from_owner} → ${r.rows[0].to_owner}`, 'Just now', 'transfer_decision', req.tenantId])
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── TEAMS — CRUD ──────────────────────────────────────────────────────────────
app.get('/api/teams', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT t.id, t.name, t.description, t.created_at AS "createdAt",
             COUNT(u.id)::int AS "memberCount"
      FROM teams t
      LEFT JOIN users u ON u.team = t.name AND u.tenant_id = t.tenant_id
      WHERE t.tenant_id = $1
      GROUP BY t.id, t.name, t.description, t.created_at
      ORDER BY t.id;
    `, [req.tenantId])
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/teams', async (req, res) => {
  const { name, description } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
  try {
    const r = await pool.query(
      `INSERT INTO teams (name, description, tenant_id) VALUES ($1, $2, $3) RETURNING id, name, description;`,
      [name.trim(), description || '', req.tenantId]
    )
    res.json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A team with this name already exists' })
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/teams/:id', async (req, res) => {
  const { name, description } = req.body
  try {
    const r = await pool.query(
      `UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND tenant_id = $4 RETURNING *;`,
      [name?.trim() || null, description ?? null, req.params.id, req.tenantId]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Team not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/teams/:id', async (req, res) => {
  try {
    // Check team isn't in use
    const u = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $2 AND team = (SELECT name FROM teams WHERE id = $1 AND tenant_id = $2);', [req.params.id, req.tenantId])
    if (u.rows[0].c > 0) return res.status(400).json({ error: `Cannot delete — ${u.rows[0].c} user(s) are in this team. Reassign them first.` })
    await pool.query('DELETE FROM teams WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── ROLES — CRUD ──────────────────────────────────────────────────────────────
app.get('/api/roles', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT r.id, r.name, r.description, r.permissions, r.is_system AS "isSystem",
             r.created_at AS "createdAt",
             COUNT(u.id)::int AS "memberCount"
      FROM roles r
      LEFT JOIN users u ON u.role = r.name
      GROUP BY r.id, r.name, r.description, r.permissions, r.is_system, r.created_at
      ORDER BY r.is_system DESC, r.id;
    `)
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/roles', async (req, res) => {
  const { name, description, permissions } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
  try {
    const r = await pool.query(
      `INSERT INTO roles (name, description, permissions, is_system) VALUES ($1, $2, $3, FALSE) RETURNING *;`,
      [name.trim(), description || '', JSON.stringify(permissions || [])]
    )
    res.json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A role with this name already exists' })
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/roles/:id', async (req, res) => {
  const { name, description, permissions } = req.body
  try {
    const check = await pool.query('SELECT is_system FROM roles WHERE id = $1;', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Role not found' })
    if (check.rows[0].is_system && name) {
      return res.status(400).json({ error: 'Cannot rename a system role' })
    }
    const r = await pool.query(
      `UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description),
                        permissions = COALESCE($3::jsonb, permissions) WHERE id = $4 RETURNING *;`,
      [name?.trim() || null, description ?? null, permissions ? JSON.stringify(permissions) : null, req.params.id]
    )
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/roles/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT is_system, name FROM roles WHERE id = $1;', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Role not found' })
    if (check.rows[0].is_system) return res.status(400).json({ error: 'Cannot delete a system role' })
    const u = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE role = $1;', [check.rows[0].name])
    if (u.rows[0].c > 0) return res.status(400).json({ error: `Cannot delete — ${u.rows[0].c} user(s) hold this role. Reassign them first.` })
    await pool.query('DELETE FROM roles WHERE id = $1;', [req.params.id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Admin-triggered password reset (generates temp password, returns it once)
app.post('/api/users/:id/reset-password', async (req, res) => {
  const { id } = req.params
  try {
    // Generate friendly temporary password e.g. "Sun#4827"
    const words = ['Sun','Sky','Lake','Wave','Star','Moon','Leaf','Wind']
    const tempPwd = `${words[Math.floor(Math.random()*words.length)]}#${Math.floor(1000 + Math.random()*9000)}`

    const r = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, name, email;',
      [tempPwd, id, req.tenantId]
    )
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found.' })

    // Email the temp password (best-effort)
    try {
      await sendSystemMailAlert(
        r.rows[0].email,
        'CCRM — Your password has been reset',
        `Hello ${r.rows[0].name},\n\nAn administrator has reset your CCRM password.\n\nTemporary password: ${tempPwd}\n\nPlease log in at https://crm.cutmap.ac.in/login and change this immediately from Settings → Security.\n\nBest regards,\nCCRM Admin`
      )
    } catch {}

    res.json({
      success: true,
      tempPassword: tempPwd,
      sentTo: r.rows[0].email,
      message: `Password reset. Temp password emailed to ${r.rows[0].email}`
    })
  } catch (err) {
    console.error('[reset-password]', err)
    res.status(500).json({ error: err.message })
  }
})

// Bulk status toggle (activate/deactivate multiple users at once)
app.post('/api/users/bulk-status', async (req, res) => {
  const { ids, status } = req.body
  if (!ids?.length || !status) return res.status(400).json({ error: 'ids and status required.' })
  try {
    await pool.query('UPDATE users SET status = $1 WHERE id = ANY($2::int[]) AND tenant_id = $3;', [status, ids, req.tenantId])
    res.json({ success: true, updated: ids.length, status })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// User activity feed — last logins, role changes, recent actions
app.get('/api/users/activity', async (req, res) => {
  try {
    // Recent logins
    const logins = await pool.query(`
      SELECT name, email, role, last_login AS "lastLogin", status
      FROM users
      WHERE last_login IS NOT NULL AND last_login <> '' AND tenant_id = $1
      ORDER BY id DESC LIMIT 20;
    `, [req.tenantId])

    // Recent lead assignment notifications (proxy for activity)
    const notifs = await pool.query(`
      SELECT text, time, type, created_at AS "createdAt"
      FROM notifications
      WHERE (type IN ('lead_assigned','info') OR text ILIKE '%user%' OR text ILIKE '%registered%') AND tenant_id = $1
      ORDER BY id DESC LIMIT 20;
    `, [req.tenantId])

    res.json({ recentLogins: logins.rows, activity: notifs.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// --- BULK USER UPLOAD ---
app.post('/api/users/bulk-upload', (req, res, next) => {
  uploadBulk.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'File upload failed.' })
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const filePath = req.file.path
  try {
    let workbook
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true, raw: false })
    } catch (e) {
      return res.status(400).json({ error: `Cannot read file: ${e.message}` })
    }
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
    if (!rawData.length) return res.status(400).json({ error: 'File is empty.' })

    const VALID_ROLES  = ['Admin','Manager','Counselor','Finance']
    const VALID_TEAMS  = ['Management','Admissions','Sales','Marketing','Finance']

    let inserted = 0, skipped = 0, errors = []

    for (const [i, row] of rawData.entries()) {
      const rowNum = i + 2 // 1-based + header row
      const name     = String(row.Name  || row.name  || '').trim()
      const email    = String(row.Email || row.email || '').trim().toLowerCase()
      const mobile   = String(row.Mobile || row.mobile || row['Mobile Number'] || '').replace(/\D/g, '').slice(-10)
      const role     = VALID_ROLES.includes(row.Role  || row.role)  ? (row.Role  || row.role)  : 'Counselor'
      const team     = VALID_TEAMS.includes(row.Team  || row.team)  ? (row.Team  || row.team)  : 'Admissions'
      const password = String(row.Password || row.password || 'CUTM@2026').trim()
      const status   = (row.Status || row.status || 'Active') === 'Inactive' ? 'Inactive' : 'Active'

      if (!name)  { errors.push(`Row ${rowNum}: Name is required.`);  skipped++; continue }
      if (!email || !email.includes('@')) { errors.push(`Row ${rowNum}: Valid email required.`); skipped++; continue }

      // Skip if email already exists in this tenant (a different tenant may legitimately have it)
      const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND tenant_id = $2;', [email, req.tenantId])
      if (exists.rows.length > 0) { skipped++; continue }

      try {
        const newUser = await pool.query(`
          INSERT INTO users (name, email, mobile, password, role, team, status, tenant_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, name;
        `, [name, email, mobile || null, password, role, team, status, req.tenantId])

        // Add to round-robin counter if counselor/manager
        if (['Counselor','Manager'].includes(role)) {
          await pool.query(
            'INSERT INTO lead_assignment_counter (counselor_name, counselor_email, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;',
            [name, email, req.tenantId]
          )
        }
        inserted++
      } catch (e) {
        errors.push(`Row ${rowNum} (${email}): ${e.message}`)
        skipped++
      }
    }

    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
      [`Bulk user upload: ${inserted} created, ${skipped} skipped`, 'Just now', req.tenantId])

    res.json({ success: true, inserted, skipped, total: rawData.length, errors: errors.slice(0, 10) })
  } catch (err) {
    console.error('[User Bulk Upload]', err)
    res.status(500).json({ error: err.message || 'Bulk user upload failed.' })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  try {
    // Resolve requester (super admin?) and target role
    const meRes = await pool.query('SELECT is_superadmin FROM users WHERE (id = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [req.user?.id || 0, req.user?.email || '', req.tenantId])
    const iAmSuper = !!meRes.rows[0]?.is_superadmin
    const tgtRes = await pool.query('SELECT role, is_superadmin FROM users WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    if (tgtRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    const target = tgtRes.rows[0]
    // Only a super admin can delete an Admin or another super admin
    if ((target.role === 'Admin' || target.is_superadmin) && !iAmSuper) {
      return res.status(403).json({ error: 'Only a Super Admin can delete an admin account.' })
    }
    const deleteRes = await pool.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id;', [id, req.tenantId])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json({ message: 'User deleted successfully.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user account.' })
  }
})

// Promote/demote a user as Super Admin — only a Super Admin may do this
app.post('/api/users/:id/superadmin', authenticateToken, async (req, res) => {
  const { id } = req.params
  const { isSuperAdmin } = req.body
  try {
    const meRes = await pool.query('SELECT is_superadmin, is_platform_admin FROM users WHERE (id = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [req.user?.id || 0, req.user?.email || '', req.tenantId])
    if (!meRes.rows[0]?.is_superadmin && !meRes.rows[0]?.is_platform_admin) return res.status(403).json({ error: 'Only a Super Admin can change Super Admin status.' })
    const r = await pool.query(
      'UPDATE users SET is_superadmin = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, name, role, is_superadmin AS "isSuperAdmin";',
      [!!isSuperAdmin, id, req.tenantId]
    )
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json({ success: true, user: r.rows[0] })
  } catch (err) {
    console.error('[Set SuperAdmin]', err.message)
    res.status(500).json({ error: 'Failed to update Super Admin status.' })
  }
})

// --- NOTIFICATIONS ROUTERS ---

// GET notifications — per-user (Counselors see only their own; Admin/Manager see all)
app.get('/api/notifications', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return res.json([])

    let user
    try { user = jwt.verify(token, JWT_SECRET) } catch { return res.json([]) }

    let rows
    if (user.role === 'Admin' || user.role === 'Manager') {
      // Admins/Managers see all notifications
      const r = await pool.query(`
        SELECT id, user_email AS "userEmail", title, text, type, lead_id AS "leadId", time, unread, created_at AS "createdAt"
        FROM notifications WHERE tenant_id = $1 ORDER BY id DESC LIMIT 100;
      `, [req.tenantId])
      rows = r.rows
    } else {
      // Counselors see only their own + broadcasts (user_email IS NULL)
      const r = await pool.query(`
        SELECT id, user_email AS "userEmail", title, text, type, lead_id AS "leadId", time, unread, created_at AS "createdAt"
        FROM notifications WHERE (user_email = $1 OR user_email IS NULL) AND tenant_id = $2 ORDER BY id DESC LIMIT 50;
      `, [user.email, req.tenantId])
      rows = r.rows
    }
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.' })
  }
})

// Mark all read for current user
app.put('/api/notifications/read-all', async (req, res) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  let userEmail = null
  try { const u = jwt.verify(token, JWT_SECRET); userEmail = u.email } catch {}
  try {
    if (userEmail) {
      await pool.query('UPDATE notifications SET unread = FALSE WHERE (user_email = $1 OR user_email IS NULL) AND tenant_id = $2;', [userEmail, req.tenantId])
    } else {
      await pool.query('UPDATE notifications SET unread = FALSE WHERE tenant_id = $1;', [req.tenantId])
    }
    res.json({ message: 'All notifications marked as read.' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read.' })
  }
})

// Mark single notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('UPDATE notifications SET unread = FALSE WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    res.json({ message: 'Notification marked as read.' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read.' })
  }
})

// Legacy PUT (kept for compatibility)
app.put('/api/notifications', async (req, res) => {
  const { id, unread } = req.body
  try {
    if (id) {
      const updateRes = await pool.query('UPDATE notifications SET unread = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, unread;', [unread, id, req.tenantId])
      res.json(updateRes.rows[0])
    } else {
      await pool.query('UPDATE notifications SET unread = FALSE WHERE tenant_id = $1;', [req.tenantId])
      res.json({ message: 'All notifications marked as read.' })
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle notification unread status.' })
  }
})

// --- INTEGRATION SETTINGS ---
// Secret-looking keys are never returned in plaintext — only a masked sentinel,
// so the settings endpoint can't be used to exfiltrate credentials.
const SETTINGS_MASK = '••••••'
const isSecretKey = (k) => /(pass|secret|token|api_key|access_key|salt|hash)/i.test(k) || /_key$/i.test(k)

// Secrets-at-rest encryption (opt-in via SETTINGS_ENC_KEY env). Backward-compatible:
// legacy plaintext values still read fine; new secret writes are AES-256-GCM encrypted.
const _encKey = process.env.SETTINGS_ENC_KEY ? crypto.scryptSync(process.env.SETTINGS_ENC_KEY, 'ccrm-settings', 32) : null
function encryptSecret(plain) {
  if (!_encKey || plain == null || plain === '') return plain
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', _encKey, iv)
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}
function decryptSecret(stored) {
  if (!_encKey || typeof stored !== 'string' || !stored.startsWith('enc:v1:')) return stored
  try {
    const raw = Buffer.from(stored.slice(7), 'base64')
    const d = crypto.createDecipheriv('aes-256-gcm', _encKey, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch { return stored }
}

app.get('/api/integration-settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT key, value FROM integration_settings WHERE tenant_id = $1 ORDER BY key;', [req.tenantId])
    const settings = {}
    for (const row of r.rows) {
      settings[row.key] = isSecretKey(row.key) ? (row.value ? SETTINGS_MASK : '') : row.value
    }
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch integration settings.' })
  }
})

// Decrypt and return ONE saved secret's real value, on demand — the bulk GET
// above deliberately never does this (it would leak every secret on every
// page load). Admin-only, and logged since it's a real credential exposure.
app.get('/api/integration-settings/:key/reveal', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' })
  try {
    const r = await pool.query('SELECT value FROM integration_settings WHERE key = $1 AND tenant_id = $2;', [req.params.key, req.tenantId])
    if (!r.rows[0] || !r.rows[0].value) return res.status(404).json({ error: 'Setting not found.' })
    console.log(`[Integration Settings] REVEAL key=${req.params.key} tenant=${req.tenantId} by=${req.user.email}`)
    res.json({ key: req.params.key, value: decryptSecret(r.rows[0].value) })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reveal setting.' })
  }
})

app.post('/api/integration-settings', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' })
  const settings = req.body
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Invalid settings object.' })
  try {
    let saved = 0
    for (const [key, value] of Object.entries(settings)) {
      if (!key || typeof key !== 'string') continue
      const v = String(value ?? '').trim()               // trim stray copy-paste whitespace
      if (v === SETTINGS_MASK) continue                  // unchanged masked secret — keep existing
      if (isSecretKey(key) && v === '') continue         // never blank-out a secret
      const stored = isSecretKey(key) ? encryptSecret(v) : v   // encrypt secrets at rest (if key set)
      await pool.query(
        'INSERT INTO integration_settings (key, value, updated_at, tenant_id) VALUES ($1, $2, NOW(), $3) ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2, updated_at = NOW();',
        [key.substring(0, 100), stored, req.tenantId]
      )
      saved++
    }
    res.json({ message: 'Integration settings saved.', count: saved })
  } catch (err) {
    console.error('[Integration Settings]', err)
    res.status(500).json({ error: 'Failed to save integration settings.' })
  }
})

// ── PHASE 3: per-tenant config (branding / entities / lead stages) ──────────
const GENERIC_ENTITIES = [{ code: 'LEADS', label: 'Leads', kind: 'main' }]
const GENERIC_STAGES = ['New', 'Contacted', 'Follow Up', 'Interested', 'Not Interested', 'Converted']

function tenantConfigFromRow(t) {
  const branding = (t.branding && Object.keys(t.branding).length) ? t.branding : {
    name: t.name,
    shortName: (t.name || 'CRM').slice(0, 6).toUpperCase(),
    logoText: (t.name || 'C').charAt(0).toUpperCase(),
    appTitle: `${t.name} CRM`,
    primaryColor: '#4f46e5',
    tagline: 'CRM'
  }
  const entities = (Array.isArray(t.entities) && t.entities.length) ? t.entities : GENERIC_ENTITIES
  const stages = (Array.isArray(t.stages) && t.stages.length) ? t.stages : GENERIC_STAGES
  return {
    id: t.id, name: t.name, slug: t.slug, status: t.status, plan: t.plan,
    allowedDomains: (t.allowed_domains || '').split(',').map(s => s.trim()).filter(Boolean),
    customDomain: t.custom_domain || null,
    assignmentMethod: t.assignment_method || 'random',
    branding, entities, stages
  }
}

// Current tenant's full config (loaded by the app after login)
app.get('/api/tenant/config', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM tenants WHERE id = $1;', [req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Tenant not found.' })
    res.json(tenantConfigFromRow(r.rows[0]))
  } catch (e) { res.status(500).json({ error: 'Failed to load tenant config.' }) }
})

// Public config for the login/landing page — branding + allowed domains only (no auth)
app.get('/api/tenant/public', async (req, res) => {
  try {
    const slug = req.query.slug || (req.headers.host || '').split('.')[0]
    let r = slug ? await pool.query("SELECT * FROM tenants WHERE slug = $1 AND status = 'Active' LIMIT 1;", [slug]) : { rows: [] }
    if (!r.rows[0]) r = await pool.query('SELECT * FROM tenants WHERE id = 1;')   // fallback Centurion
    const cfg = tenantConfigFromRow(r.rows[0])
    res.json({ name: cfg.name, slug: cfg.slug, branding: cfg.branding, allowedDomains: cfg.allowedDomains })
  } catch (e) { res.status(500).json({ error: 'Failed to load public config.' }) }
})

// Update the current tenant's config (tenant Admin only)
app.put('/api/tenant/config', authenticateToken, async (req, res) => {
  if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only.' })
  const { branding, entities, stages, allowedDomains, customDomain, name, assignmentMethod } = req.body
  try {
    const sets = [], params = []
    if (branding !== undefined)       { params.push(JSON.stringify(branding)); sets.push(`branding = $${params.length}::jsonb`) }
    if (entities !== undefined)       { params.push(JSON.stringify(entities)); sets.push(`entities = $${params.length}::jsonb`) }
    if (stages !== undefined)         { params.push(JSON.stringify(stages));   sets.push(`stages = $${params.length}::jsonb`) }
    if (allowedDomains !== undefined) { params.push(Array.isArray(allowedDomains) ? allowedDomains.join(',') : String(allowedDomains || '')); sets.push(`allowed_domains = $${params.length}`) }
    if (customDomain !== undefined)   { params.push(customDomain || null); sets.push(`custom_domain = $${params.length}`) }
    if (name !== undefined)           { params.push(String(name)); sets.push(`name = $${params.length}`) }
    if (assignmentMethod !== undefined) { params.push(String(assignmentMethod || 'random')); sets.push(`assignment_method = $${params.length}`) }
    if (!sets.length) return res.json({ message: 'Nothing to update.' })
    params.push(req.tenantId)
    const r = await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *;`, params)
    res.json(tenantConfigFromRow(r.rows[0]))
  } catch (e) { console.error('[tenant/config PUT]', e.message); res.status(500).json({ error: 'Failed to save tenant config.' }) }
})

// ── PHASE 4: platform admin (manages tenants — above per-tenant admins) ─────
async function platformAdminOnly(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Access token missing.' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const r = await pool.query('SELECT is_platform_admin FROM users WHERE id = $1;', [decoded.id])
    if (!r.rows[0]?.is_platform_admin) return res.status(403).json({ error: 'Platform admin only.' })
    req.user = decoded
    next()
  } catch { return res.status(403).json({ error: 'Invalid or expired token.' }) }
}

// Every platform-admin action (tenant edits, admin creation/promotion,
// impersonation) gets a row here for later investigation. Never logs
// passwords — only whether one was changed.
async function logAudit(actor, action, { targetTenantId = null, targetType = '', targetId = '', details = {} } = {}) {
  try {
    await pool.query(
      `INSERT INTO platform_audit_logs (actor_user_id, actor_email, action, target_tenant_id, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [actor?.id || null, actor?.email || '', action, targetTenantId, targetType, String(targetId ?? ''), JSON.stringify(details)]
    )
  } catch (e) { console.error('[audit log]', e.message) }
}

// List all tenants (+ basic counts)
app.get('/api/platform/tenants', platformAdminOnly, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT t.id, t.name, t.slug, t.status, t.plan, t.allowed_domains AS "allowedDomains", t.created_at AS "createdAt",
             t.lead_id_prefix AS "leadIdPrefix",
             (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id) AS users,
             (SELECT COUNT(*)::int FROM leads l WHERE l.tenant_id = t.id) AS leads
      FROM tenants t ORDER BY t.id;
    `)
    res.json(r.rows)
  } catch (e) { console.error('[platform/tenants GET]', e.message); res.status(500).json({ error: 'Failed to list tenants.' }) }
})

// Create a tenant + its first admin (one click)
// Mirrors ccrm/src/tenantSlug.js's RESERVED_SLUGS — every top-level frontend
// route path. A tenant slug matching one of these would collide with a real
// app route once used as a React Router basename, so it's rejected here.
const RESERVED_TENANT_SLUGS = [
  'login', 'apply', 'student-portal', 'student', 'leads', 'call-outcomes',
  'websites-dashboard', 'ftl-leads', 'gtib-leads', 'gttech-leads', 'esse-leads',
  'applications', 'dashboard', 'platform-tenants', 'reports', 'productivity',
  'analytics', 'logs', 'call-activity', 'workbook-import', 'social-comments',
  'server-health', 'security', 'org-settings', 'campaigns', 'tasks',
  'payments', 'documents', 'calendar', 'settings', 'integrations',
  'integration-settings', 'leaderboard', 'email-campaigns', 'drip-workflows',
  'comms-report', 'help', 'profile', 'transfer-approvals', 'users', 'api',
]

app.post('/api/platform/tenants', platformAdminOnly, async (req, res) => {
  const { name, slug, adminName, adminEmail, adminPassword, allowedDomains } = req.body
  if (!name || !slug || !adminEmail) return res.status(400).json({ error: 'name, slug and adminEmail are required.' })
  const cleanSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!cleanSlug) return res.status(400).json({ error: 'slug must be alphanumeric.' })
  if (RESERVED_TENANT_SLUGS.includes(cleanSlug)) {
    return res.status(400).json({ error: `"${cleanSlug}" is a reserved word and can't be used as a tenant slug.` })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const dupSlug = await client.query('SELECT id FROM tenants WHERE slug = $1;', [cleanSlug])
    if (dupSlug.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'That slug is already taken.' }) }
    // No email-duplicate check here — email is unique per tenant, not globally,
    // so reusing an email as a different tenant's first admin is expected.

    const tRes = await client.query(
      `INSERT INTO tenants (name, slug, allowed_domains, status, plan, branding, entities, stages)
       VALUES ($1, $2, $3, 'Active', 'standard', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb) RETURNING id;`,
      [name, cleanSlug, Array.isArray(allowedDomains) ? allowedDomains.join(',') : String(allowedDomains || '')]
    )
    const tenantId = tRes.rows[0].id
    const uRes = await client.query(
      `INSERT INTO users (name, email, password, role, status, entities, is_superadmin, tenant_id)
       VALUES ($1, $2, $3, 'Admin', 'Active', 'LEADS', TRUE, $4) RETURNING id, name, email;`,
      [adminName || `${name} Admin`, adminEmail, adminPassword || 'ChangeMe@123', tenantId]
    )
    await client.query('COMMIT')
    logAudit(req.user, 'tenant.create', { targetTenantId: tenantId, targetType: 'tenant', targetId: tenantId, details: { name, slug: cleanSlug, adminEmail } })
    res.status(201).json({ success: true, tenant: { id: tenantId, name, slug: cleanSlug }, admin: uRes.rows[0], tempPassword: adminPassword || 'ChangeMe@123' })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[platform/tenants POST]', e.message)
    res.status(500).json({ error: 'Failed to create tenant.' })
  } finally { client.release() }
})

// Suspend / activate / rename a tenant
app.patch('/api/platform/tenants/:id', platformAdminOnly, async (req, res) => {
  const { status, name, allowedDomains, plan, leadIdPrefix } = req.body
  if (Number(req.params.id) === 1 && status && status !== 'Active') {
    return res.status(400).json({ error: 'The primary tenant cannot be suspended.' })
  }
  try {
    const sets = [], params = []
    if (status !== undefined)         { params.push(status); sets.push(`status = $${params.length}`) }
    if (name !== undefined)           { params.push(name); sets.push(`name = $${params.length}`) }
    if (plan !== undefined)           { params.push(plan); sets.push(`plan = $${params.length}`) }
    if (allowedDomains !== undefined) { params.push(Array.isArray(allowedDomains) ? allowedDomains.join(',') : String(allowedDomains || '')); sets.push(`allowed_domains = $${params.length}`) }
    if (leadIdPrefix !== undefined)   { params.push(String(leadIdPrefix || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20)); sets.push(`lead_id_prefix = $${params.length}`) }
    if (!sets.length) return res.json({ message: 'Nothing to update.' })
    params.push(req.params.id)
    const r = await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, slug, status, plan, allowed_domains AS "allowedDomains", lead_id_prefix AS "leadIdPrefix";`, params)
    if (!r.rows[0]) return res.status(404).json({ error: 'Tenant not found.' })
    logAudit(req.user, 'tenant.update', { targetTenantId: req.params.id, targetType: 'tenant', targetId: req.params.id, details: { status, name, plan, allowedDomains, leadIdPrefix } })
    res.json(r.rows[0])
  } catch (e) { console.error('[platform/tenants PATCH]', e.message); res.status(500).json({ error: 'Failed to update tenant.' }) }
})

// List a tenant's admin accounts (platform admin only) — used by the Edit Organization modal
app.get('/api/platform/tenants/:id/admins', platformAdminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email FROM users WHERE tenant_id = $1 AND role = 'Admin' ORDER BY id;`,
      [req.params.id]
    )
    res.json(r.rows)
  } catch (e) { console.error('[platform/tenants admins GET]', e.message); res.status(500).json({ error: 'Failed to load admins.' }) }
})

// Update one admin's name/email/password (platform admin only)
app.patch('/api/platform/tenants/:id/admins/:userId', platformAdminOnly, async (req, res) => {
  const { name, email, password } = req.body
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND tenant_id = $2;', [req.params.userId, req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Admin not found for this tenant.' })

    if (email !== undefined) {
      const dup = await pool.query('SELECT id FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND id != $3;', [req.params.id, email, req.params.userId])
      if (dup.rows.length) return res.status(409).json({ error: 'That email is already used by another user in this tenant.' })
    }

    const sets = [], params = []
    if (name !== undefined)  { params.push(name);  sets.push(`name = $${params.length}`) }
    if (email !== undefined) { params.push(email); sets.push(`email = $${params.length}`) }
    if (password)             { params.push(password); sets.push(`password = $${params.length}`) }
    if (!sets.length) return res.json({ message: 'Nothing to update.' })
    params.push(req.params.userId)
    const r = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, email;`, params)
    logAudit(req.user, 'tenant.admin.update', { targetTenantId: req.params.id, targetType: 'user', targetId: req.params.userId, details: { name, email, passwordChanged: !!password } })
    res.json(r.rows[0])
  } catch (e) { console.error('[platform/tenants admin PATCH]', e.message); res.status(500).json({ error: 'Failed to update admin.' }) }
})

// Create a brand-new admin for an existing tenant (platform admin only)
app.post('/api/platform/tenants/:id/admins', platformAdminOnly, async (req, res) => {
  const { name, email, password } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required.' })
  try {
    const dup = await pool.query('SELECT id FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2);', [req.params.id, email])
    if (dup.rows.length) return res.status(409).json({ error: 'That email is already used by another user in this tenant.' })
    const r = await pool.query(
      `INSERT INTO users (name, email, password, role, status, entities, is_superadmin, tenant_id)
       VALUES ($1, $2, $3, 'Admin', 'Active', 'LEADS', FALSE, $4) RETURNING id, name, email;`,
      [name || email.split('@')[0], email, password || 'ChangeMe@123', req.params.id]
    )
    logAudit(req.user, 'tenant.admin.create', { targetTenantId: req.params.id, targetType: 'user', targetId: r.rows[0].id, details: { name: r.rows[0].name, email: r.rows[0].email } })
    res.status(201).json(r.rows[0])
  } catch (e) { console.error('[platform/tenants admin POST]', e.message); res.status(500).json({ error: 'Failed to create admin.' }) }
})

// List every user in a tenant (platform admin only) — used to pick who to promote to Admin
app.get('/api/platform/tenants/:id/users', platformAdminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email, role FROM users WHERE tenant_id = $1 ORDER BY name;`,
      [req.params.id]
    )
    res.json(r.rows)
  } catch (e) { console.error('[platform/tenants users GET]', e.message); res.status(500).json({ error: 'Failed to load users.' }) }
})

// Promote an existing tenant user to Admin (platform admin only)
app.post('/api/platform/tenants/:id/admins/:userId/promote', platformAdminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE users SET role = 'Admin' WHERE id = $1 AND tenant_id = $2 RETURNING id, name, email;`,
      [req.params.userId, req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found for this tenant.' })
    logAudit(req.user, 'tenant.admin.promote', { targetTenantId: req.params.id, targetType: 'user', targetId: r.rows[0].id, details: { name: r.rows[0].name, email: r.rows[0].email } })
    res.json(r.rows[0])
  } catch (e) { console.error('[platform/tenants promote POST]', e.message); res.status(500).json({ error: 'Failed to promote user.' }) }
})

// Impersonate a tenant's admin account (platform admin only) — issues a
// short-lived (2h) token scoped to that tenant so the platform admin can
// view/manage its data exactly as that tenant's own admin would. The
// impersonated session is fully logged; frontend keeps the platform admin's
// original token stashed locally so they can return to it afterward.
app.post('/api/platform/tenants/:id/impersonate', platformAdminOnly, async (req, res) => {
  try {
    const tRes = await pool.query('SELECT id, name, slug, status FROM tenants WHERE id = $1;', [req.params.id])
    const tenant = tRes.rows[0]
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' })
    if (tenant.status !== 'Active') return res.status(400).json({ error: 'This tenant is suspended.' })

    const aRes = await pool.query(
      `SELECT * FROM users WHERE tenant_id = $1 AND role = 'Admin' AND status = 'Active' ORDER BY id LIMIT 1;`,
      [tenant.id]
    )
    const admin = aRes.rows[0]
    if (!admin) return res.status(400).json({ error: 'This tenant has no active admin account yet — use "Add New Admin" first.' })

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, tenant_id: tenant.id, is_platform_admin: true, impersonated_by: req.user.id },
      JWT_SECRET, { expiresIn: '2h' }
    )
    logAudit(req.user, 'tenant.impersonate', { targetTenantId: tenant.id, targetType: 'tenant', targetId: tenant.id, details: { asUserId: admin.id, asEmail: admin.email } })

    res.json({
      token,
      tenantSlug: tenant.id === 1 ? null : tenant.slug,
      user: {
        id: admin.id, name: admin.name, email: admin.email, role: admin.role,
        team: admin.team, picture: admin.picture, status: admin.status,
        mobile_number: admin.mobile_number, entities: admin.entities || 'CUTM',
        isSuperAdmin: !!admin.is_superadmin, isPlatformAdmin: !!admin.is_platform_admin,
        lastLogin: admin.last_login
      }
    })
  } catch (e) { console.error('[platform/tenants impersonate POST]', e.message); res.status(500).json({ error: 'Failed to view tenant.' }) }
})

// Read the audit trail (platform admin only) — optionally filtered to one tenant
app.get('/api/platform/audit-logs', platformAdminOnly, async (req, res) => {
  try {
    const { tenantId, limit = 200 } = req.query
    const params = []
    let where = ''
    if (tenantId) { params.push(tenantId); where = `WHERE target_tenant_id = $${params.length}` }
    params.push(Math.min(Number(limit) || 200, 1000))
    const r = await pool.query(
      `SELECT al.*, t.name AS tenant_name FROM platform_audit_logs al
       LEFT JOIN tenants t ON t.id = al.target_tenant_id
       ${where} ORDER BY al.created_at DESC LIMIT $${params.length};`,
      params
    )
    res.json(r.rows)
  } catch (e) { console.error('[platform/audit-logs GET]', e.message); res.status(500).json({ error: 'Failed to load audit logs.' }) }
})

// --- FILE UPLOAD ENDPOINTS ---
app.post('/api/upload/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' })
  const fileUrl = `/uploads/avatars/${req.file.filename}`
  res.json({ fileUrl })
})

app.post('/api/upload/document', uploadDoc.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No document file uploaded.' })
  const fileUrl = `/uploads/documents/${req.file.filename}`
  res.json({ fileUrl })
})

// --- BULK UPLOAD LEADS (100,000+ ROWS HIGH PERFORMANCE) ---
app.post('/api/leads/bulk-upload', authenticateToken, uploadDoc.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })

  const filePath = req.file.path

  try {
    // 1. Read Workbook using SheetJS
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON array of objects
    const rawData = XLSX.utils.sheet_to_json(worksheet)
    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ error: 'Spreadsheet is empty or invalid.' })
    }

    console.log(`[Bulk Upload] Parsed ${rawData.length} rows. Initiating database batch insert...`)

    // Social media sources that should stay unassigned
    const socialMediaSources = ['meta', 'facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'telegram']

    // 2. Perform batched SQL multi-row insert transactions (2000 rows/query to stay safe under PostgreSQL 65,535 parameters limit)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const batchSize = 2000
      let rowIdx = 0

      while (rowIdx < rawData.length) {
        const batchRows = rawData.slice(rowIdx, rowIdx + batchSize)
        const valuePlaceholders = []
        const queryParams = []
        let paramIdx = 1

        for (const row of batchRows) {
          const name = String(row.Name || row.name || row['Student Name'] || 'Unnamed Lead').substring(0, 100)
          const email = String(row.Email || row.email || `lead_${Date.now()}_${Math.floor(Math.random()*100000)}@cutm.ac.in`).substring(0, 100)
          const mobile = String(row.Mobile || row.mobile || row['Mobile Number'] || '0000000000').substring(0, 50)
          const state = String(row.State || row.state || 'Odisha').substring(0, 100)
          const city = String(row.City || row.city || 'Bhubaneswar').substring(0, 100)
          const course = String(row.Course || row.course || 'B.Tech CSE').substring(0, 100)
          const source = String(row.Source || row.source || 'Website').substring(0, 100)

          // Check if from social media → keep unassigned
          const isFromSocialMedia = socialMediaSources.some(sm => source.toLowerCase().includes(sm))
          let owner = isFromSocialMedia ? 'Unassigned' : 'Unassigned'
          owner = String(owner).substring(0, 100)

          const regDate = String(row.regDate || row.reg_date || row['Registration Date'] || new Date().toLocaleString('en-IN', { hour12: true })).substring(0, 100)
          
          let score = Number(row.Score || row.score || 0)
          if (isNaN(score)) score = 0
          
          let stage = String(row.Stage || row.stage || 'Untouched').substring(0, 50)
          let stageColor = String(row.stageColor || row.stage_color || 'red').substring(0, 50)
          
          // Map stage to styling colors
          if (stage === 'Qualified Leads' || stage === 'Converted') stageColor = 'green'
          else if (stage === 'Unqualified Leads') stageColor = 'orange'
          else if (stage === 'Contacted' || stage === 'Follow Up') stageColor = 'blue'
          
          valuePlaceholders.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8}, $${paramIdx+9}, $${paramIdx+10}, $${paramIdx+11})`)
          queryParams.push(name, email, mobile, state, city, course, source, owner, regDate, score, stage, stageColor)
          paramIdx += 12
        }
        
        const bulkQuery = `
          INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
          VALUES ${valuePlaceholders.join(', ')}
          RETURNING id;
        `
        
        await client.query(bulkQuery, queryParams)
        rowIdx += batchSize
        console.log(`[Bulk Upload] Successfully bulk inserted batch up to index ${rowIdx}`)
      }
      
      // Post success uploader system notification
      await client.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Bulk upload complete: ${rawData.length} leads imported successfully.`, 'Just now'])
      
      await client.query('COMMIT')
      res.json({ success: true, count: rawData.length })
    } catch (dbErr) {
      await client.query('ROLLBACK')
      console.error('Database bulk insert transaction failed, rolling back:', dbErr)
      throw dbErr
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('Bulk upload handler failed:', err)
    res.status(500).json({ error: err.message || 'Failed to process bulk upload spreadsheet.' })
  } finally {
    // 3. Clean up the temp file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (err) {
        console.warn('Failed to delete temp bulk upload file:', err)
      }
    }
  }
})

// ============================================================
// =================== NEW FEATURES BLOCK ====================
// ============================================================

// --- FEATURE 1: LEAD DEDUPLICATION CHECK ---
app.post('/api/leads/check-duplicate', async (req, res) => {
  const { mobile, email } = req.body
  try {
    const r = await pool.query(
      'SELECT id, name, mobile, email, stage, source FROM leads WHERE (mobile = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 5;',
      [mobile, email, req.tenantId]
    )
    res.json({ duplicates: r.rows, hasDuplicate: r.rows.length > 0 })
  } catch (err) {
    res.status(500).json({ error: 'Deduplication check failed.' })
  }
})

// --- FEATURE 2: LEAD AUTO-ASSIGNMENT (round-robin / load-based) ---
// Shared picker: returns the active counsellor/manager with the fewest leads and
// bumps their counter. Returns 'Unassigned' if there are no eligible users.
// (function declaration → hoisted, so inbound routes above can call it.)
async function getNextAssignee(tenantId = 1) {
  try {
    // Eligible = any active user who isn't an Admin/Finance role. This is tolerant of
    // custom role names (Counsellor / Faculty / Telecaller / etc.), not just the exact
    // 'Counselor'/'Manager' strings — otherwise auto-assign silently finds nobody.
    const usersRes = await pool.query("SELECT name, email FROM users WHERE status = 'Active' AND role NOT IN ('Admin', 'Finance') AND COALESCE(exclude_from_assignment, FALSE) = FALSE AND tenant_id = $1 ORDER BY name;", [tenantId])
    if (usersRes.rows.length === 0) return 'Unassigned'

    // Get tenant's assignment method (default: random)
    const tenantRes = await pool.query('SELECT assignment_method FROM tenants WHERE id = $1;', [tenantId])
    const method = tenantRes.rows[0]?.assignment_method || 'random'

    // Ensure every active user has a counter row
    for (const u of usersRes.rows) {
      await pool.query(
        'INSERT INTO lead_assignment_counter (counselor_name, counselor_email, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (counselor_name) DO NOTHING;',
        [u.name, u.email, tenantId]
      )
    }

    let assignee
    if (method === 'random') {
      // Random: pick a random counselor
      assignee = usersRes.rows[Math.floor(Math.random() * usersRes.rows.length)].name
    } else if (method === 'roundrobin') {
      // Round-robin: pick the last assigned + 1
      const counterRes = await pool.query(`
        SELECT lac.counselor_name
        FROM lead_assignment_counter lac
        JOIN users u ON u.name = lac.counselor_name AND u.tenant_id = $1
        WHERE u.status = 'Active' AND u.role NOT IN ('Admin', 'Finance') AND COALESCE(u.exclude_from_assignment, FALSE) = FALSE AND lac.tenant_id = $1
        ORDER BY lac.last_assigned ASC, lac.assignment_count ASC
        LIMIT 1;
      `, [tenantId])
      assignee = counterRes.rows[0]?.counselor_name || usersRes.rows[0].name
    } else {
      // Load-based (default): pick the counsellor with the least assignments
      const counterRes = await pool.query(`
        SELECT lac.counselor_name
        FROM lead_assignment_counter lac
        JOIN users u ON u.name = lac.counselor_name AND u.tenant_id = $1
        WHERE u.status = 'Active' AND u.role NOT IN ('Admin', 'Finance') AND COALESCE(u.exclude_from_assignment, FALSE) = FALSE AND lac.tenant_id = $1
        ORDER BY lac.assignment_count ASC, lac.last_assigned ASC
        LIMIT 1;
      `, [tenantId])
      assignee = counterRes.rows[0]?.counselor_name || usersRes.rows[0].name
    }

    await pool.query(
      'UPDATE lead_assignment_counter SET assignment_count = assignment_count + 1, last_assigned = NOW() WHERE counselor_name = $1 AND tenant_id = $2;',
      [assignee, tenantId]
    )
    return assignee
  } catch (err) {
    console.error('[getNextAssignee]', err.message)
    return 'Unassigned'
  }
}

app.get('/api/leads/next-assignee', async (req, res) => {
  const assignee = await getNextAssignee(req.tenantId)
  if (assignee === 'Unassigned') return res.status(500).json({ error: 'Auto-assignment failed.', assignee })
  res.json({ assignee })
})

// === FEATURE B: UNASSIGNED LEADS WITH SOURCE TRACKING ===
app.get('/api/leads/unassigned', async (req, res) => {
  try {
    const unassignedRes = await pool.query(`
      SELECT COUNT(*) as total FROM leads WHERE (owner IS NULL OR owner = '') AND tenant_id = $1;
    `, [req.tenantId])
    const sourceRes = await pool.query(`
      SELECT
        lead_source,
        COUNT(*) as count
      FROM leads
      WHERE (owner IS NULL OR owner = '') AND tenant_id = $1
      GROUP BY lead_source
      ORDER BY count DESC;
    `, [req.tenantId])
    const leadsRes = await pool.query(`
      SELECT id, name, email, mobile, lead_source, created_at
      FROM leads
      WHERE (owner IS NULL OR owner = '') AND tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 100;
    `, [req.tenantId])
    res.json({
      total: parseInt(unassignedRes.rows[0]?.total || 0),
      bySource: sourceRes.rows.map(r => ({ source: r.lead_source, count: parseInt(r.count) })),
      leads: leadsRes.rows
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch unassigned leads.' })
  }
})

// === FEATURE C: COUNSELOR MOBILE NUMBER PROFILE UPDATE ===
app.put('/api/users/:id/profile', authenticateToken, async (req, res) => {
  try {
    const { mobile_number } = req.body
    if (!mobile_number || mobile_number.trim() === '') {
      return res.status(400).json({ error: 'Mobile number is required.' })
    }
    if (!/^(\+91|0)?[6-9]\d{9}$/.test(mobile_number.replace(/[^\d]/g, ''))) {
      return res.status(400).json({ error: 'Invalid mobile number format.' })
    }
    const updateRes = await pool.query(
      'UPDATE users SET mobile_number = $1 WHERE id = $2 RETURNING id, name, email, mobile_number;',
      [mobile_number, req.params.id]
    )
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }
    res.json({ success: true, user: updateRes.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

app.get('/api/users/:id/profile', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query(
      'SELECT id, name, email, mobile_number, role FROM users WHERE id = $1;',
      [req.params.id]
    )
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }
    res.json(userRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch profile.' })
  }
})

// === FEATURE D: DOCUMENT UPLOAD - LINK GENERATION ===
app.post('/api/leads/:id/documents/generate-link', authenticateToken, async (req, res) => {
  try {
    const leadId = req.params.id
    const token = require('crypto').randomBytes(16).toString('hex')
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

    await pool.query(
      `INSERT INTO document_links (lead_id, token, created_by, expiry_date)
       VALUES ($1, $2, $3, $4);`,
      [leadId, token, req.user.name, expiryDate]
    )
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/document-upload/${token}`
    res.json({ token, shareUrl, expiryDate })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate document link.' })
  }
})

// === FEATURE D: DOCUMENT UPLOAD - DIRECT UPLOAD ===
app.post('/api/leads/:id/documents/upload', authenticateToken, uploadDoc.single('file'), async (req, res) => {
  try {
    const leadId = req.params.id
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' })
    }
    const fileUrl = `/uploads/documents/${req.file.filename}`
    const docType = req.body.docType || 'General'

    const docRes = await pool.query(
      `INSERT INTO documents (student, type, file_url, status, upload_date)
       VALUES ((SELECT name FROM leads WHERE id = $1), $2, $3, 'Uploaded', NOW())
       RETURNING id, file_url;`,
      [leadId, docType, fileUrl]
    )
    res.json({ success: true, document: docRes.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Document upload failed.' })
  }
})

app.get('/api/leads/:id/documents', async (req, res) => {
  try {
    const docsRes = await pool.query(
      `SELECT id, type, file_url, status, upload_date FROM documents
       WHERE student = (SELECT name FROM leads WHERE id = $1)
       ORDER BY upload_date DESC;`,
      [req.params.id]
    )
    res.json(docsRes.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch documents.' })
  }
})

// === FEATURE D: PUBLIC DOCUMENT UPLOAD VIA SHARED LINK ===
app.get('/api/document-upload/:token', async (req, res) => {
  try {
    const linkRes = await pool.query(
      `SELECT dl.*, l.name, l.email FROM document_links dl
       JOIN leads l ON dl.lead_id = l.id
       WHERE dl.token = $1 AND (dl.expiry_date IS NULL OR dl.expiry_date > NOW());`,
      [req.params.token]
    )
    if (linkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Link expired or invalid.' })
    }
    const link = linkRes.rows[0]
    await pool.query('UPDATE document_links SET views_count = views_count + 1 WHERE token = $1;', [req.params.token])
    res.json({ lead_id: link.lead_id, lead_name: link.name, lead_email: link.email })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Invalid document link.' })
  }
})

app.post('/api/document-upload/:token', uploadDoc.single('file'), async (req, res) => {
  try {
    const linkRes = await pool.query(
      `SELECT lead_id FROM document_links
       WHERE token = $1 AND (expiry_date IS NULL OR expiry_date > NOW());`,
      [req.params.token]
    )
    if (linkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Link expired or invalid.' })
    }
    const leadId = linkRes.rows[0].lead_id
    const fileUrl = `/uploads/documents/${req.file.filename}`

    await pool.query(
      `INSERT INTO documents (student, type, file_url, status, upload_date)
       VALUES ((SELECT name FROM leads WHERE id = $1), $2, $3, 'Uploaded', NOW());`,
      [leadId, req.body.type || 'Candidate Upload', fileUrl]
    )
    res.json({ success: true, message: 'Document uploaded successfully.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Upload failed.' })
  }
})

// === EXTERNAL WEBSITE INQUIRY FORM WEBHOOK ===
app.post('/api/webhooks/inquiry-form', async (req, res) => {
  try {
    const { name, email, phone, enquiry_about, website_code } = req.body

    // Validate required fields
    if (!name || !email || !phone || !enquiry_about || !website_code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, email, phone, enquiry_about, website_code'
      })
    }

    // Validate phone number format
    const cleanPhone = phone.replace(/[^\d]/g, '')
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number. Must be at least 10 digits.'
      })
    }

    // Check for duplicate
    const dupCheck = await pool.query(
      'SELECT id FROM leads WHERE LOWER(email) = LOWER($1) OR mobile = $2 LIMIT 1;',
      [email, cleanPhone]
    )

    if (dupCheck.rows.length > 0) {
      return res.status(200).json({
        success: false,
        message: 'Lead already exists in CRM',
        leadId: dupCheck.rows[0].id
      })
    }

    // Create new lead
    const leadRes = await pool.query(
      `INSERT INTO leads (name, email, mobile, course, source, owner, stage, stage_color, reg_date, lead_source, score)
       VALUES ($1, $2, $3, $4, $5, 'Unassigned', 'Untouched', 'red', NOW(), $6, 0)
       RETURNING id, name, email, mobile;`,
      [name, email, cleanPhone, enquiry_about, `Website (${website_code})`, `website_${website_code}`]
    )

    const lead = leadRes.rows[0]

    // Create notification for admins
    await pool.query(
      `INSERT INTO notifications (text, time, type, lead_id)
       VALUES ($1, NOW(), $2, $3);`,
      [`New inquiry from ${website_code} website: ${name} — ${enquiry_about}`, 'lead_website_inquiry', lead.id]
    )

    console.log(`[Website Webhook] New lead created: ${lead.name} (${lead.email}) from ${website_code}`)

    res.status(201).json({
      success: true,
      message: 'Inquiry received successfully',
      leadId: lead.id,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.mobile
      }
    })
  } catch (err) {
    console.error('[Website Webhook Error]', err.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process inquiry. Please try again later.'
    })
  }
})

// === GTTECH INQUIRY FORM WEBHOOK ===
app.post('/api/webhooks/gttech-form', (req, res) => gtechWebhook(req, res, pool))

// === FTL INQUIRY FORM WEBHOOK ===
app.post('/api/webhooks/ftl-form', (req, res) => ftlWebhook(req, res, pool))

// === GTIB INQUIRY FORM WEBHOOK ===
app.post('/api/webhooks/gtib-form', (req, res) => gtibWebhook(req, res, pool))

// === ESSE INQUIRY FORM WEBHOOK ===
app.post('/api/webhooks/esse-form', (req, res) => esseWebhook(req, res, pool))

// === EASYGO IVR: CLICK-TO-CALL ENDPOINTS ===

// POST /api/calls/initiate — Click-to-call from lead detail
app.post('/api/calls/initiate', authenticateToken, async (req, res) => {
  try {
    const { leadId, phoneNumber, counselorExtension } = req.body
    console.log('[API] Call initiate request:', { leadId, phoneNumber, counselorExtension })

    if (!leadId || !phoneNumber || !counselorExtension) {
      return res.status(400).json({ error: 'Missing leadId, phoneNumber, or counselorExtension.' })
    }

    // Fetch EasyGoIVR credentials from integration_settings
    console.log('[API] Fetching EasyGoIVR credentials...')
    const emailRes = await getIntegrationSetting('easygo_email')
    const hashRes = await getIntegrationSetting('easygo_password_hash')
    const didRes = await getIntegrationSetting('easygo_did')

    console.log('[API] Credentials retrieved:', {
      email: emailRes ? 'YES' : 'NO',
      password: hashRes ? 'YES' : 'NO',
      did: didRes ? 'YES' : 'NO'
    })

    if (!emailRes || !hashRes || !didRes) {
      return res.status(400).json({ error: 'EasyGoIVR not configured. Contact admin.' })
    }

    // Initiate call via EasyGoIVR
    console.log('[API] Creating EasyGoIVRProvider and initiating call...')
    const provider = new EasyGoIVRProvider(emailRes, hashRes)
    const callResult = await provider.initiateCall(counselorExtension, phoneNumber, didRes)
    console.log('[API] Call initiated successfully:', callResult)

    // Log call in database — never let a logging failure fail the call itself,
    // since EasyGoIVR has already dialed successfully at this point.
    try {
      const leadRes = await pool.query('SELECT name, email FROM leads WHERE id = $1;', [leadId])
      const leadName = leadRes.rows[0]?.name || 'Unknown'
      // JWT only carries id/email/role — resolve a display name, fall back to email.
      const userRes = await pool.query('SELECT name FROM users WHERE id = $1;', [req.user.id])
      const initiatedBy = userRes.rows[0]?.name || req.user.email || 'Unknown'

      await pool.query(
        `INSERT INTO calls (lead_id, lead_name, phone_number, caller_extension, status, call_duration, initiated_by, initiated_at, provider)
         VALUES ($1, $2, $3, $4, 'initiated', 0, $5, NOW(), 'easygoivr')
         RETURNING id;`,
        [leadId, leadName, phoneNumber, counselorExtension, initiatedBy]
      )
      console.log('[API] Call logged to database successfully')
    } catch (logErr) {
      console.error('[API] Call dialed but DB logging failed:', logErr.message)
    }

    res.json({ success: true, message: 'Call initiated.', callData: callResult })
  } catch (err) {
    console.error('[Call Initiate] ERROR:', err.message)
    console.error('[Call Initiate] Full error:', err)
    res.status(500).json({ error: err.message || 'Failed to initiate call.' })
  }
})

// GET /api/calls/history/:leadId — Call history for a lead
app.get('/api/calls/history/:leadId', authenticateToken, async (req, res) => {
  try {
    const { leadId } = req.params
    const callsRes = await pool.query(
      `SELECT id, phone_number, caller_extension, status, call_duration, initiated_by, initiated_at, completed_at
       FROM calls
       WHERE lead_id = $1
       ORDER BY initiated_at DESC
       LIMIT 50;`,
      [leadId]
    )

    res.json(callsRes.rows)
  } catch (err) {
    console.error('[Call History]', err)
    res.status(500).json({ error: 'Failed to fetch call history.' })
  }
})

// POST /api/calls/webhook — Receive call status updates from EasyGoIVR
app.post('/api/calls/webhook', async (req, res) => {
  try {
    const { callId, status, duration, completedAt } = req.body
    if (!callId) {
      return res.status(400).json({ error: 'Missing callId in webhook body.' })
    }

    await pool.query(
      `UPDATE calls SET status = $1, call_duration = $2, completed_at = $3 WHERE id = $4;`,
      [status || 'completed', duration || 0, completedAt || new Date(), callId]
    )

    res.json({ success: true })
  } catch (err) {
    console.error('[Call Webhook]', err)
    res.status(500).json({ error: 'Webhook processing failed.' })
  }
})

// POST /api/integrations/messaging-provider — Configure EasyGoIVR provider
app.post('/api/integrations/messaging-provider', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Admin only.' })
    }

    const { provider, config } = req.body
    if (provider !== 'easygoivr') {
      return res.status(400).json({ error: 'Only easygoivr supported currently.' })
    }

    const { email, passwordHash, did } = config
    if (!email || !passwordHash || !did) {
      return res.status(400).json({ error: 'Missing email, passwordHash, or did.' })
    }

    // Test the credentials by getting a token
    try {
      const testProvider = new EasyGoIVRProvider(email, passwordHash)
      await testProvider.getToken()
    } catch (testErr) {
      return res.status(400).json({ error: `EasyGoIVR credentials invalid: ${testErr.message}` })
    }

    // Save credentials
    await pool.query(
      `INSERT INTO integration_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();`,
      ['easygo_email', email]
    )
    await pool.query(
      `INSERT INTO integration_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();`,
      ['easygo_password_hash', passwordHash]
    )
    await pool.query(
      `INSERT INTO integration_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();`,
      ['easygo_did', did]
    )

    res.json({ success: true, message: 'EasyGoIVR configured and tested.' })
  } catch (err) {
    console.error('[Provider Config]', err)
    res.status(500).json({ error: 'Failed to configure provider.' })
  }
})

// GET /api/integrations/messaging-provider/:channel — Get current provider config
app.get('/api/integrations/messaging-provider/:channel', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Admin only.' })
    }

    if (req.params.channel !== 'calling') {
      return res.status(400).json({ error: 'Only calling channel supported.' })
    }

    const emailRes = await getIntegrationSetting('easygo_email')
    const didRes = await getIntegrationSetting('easygo_did')

    res.json({
      provider: 'easygoivr',
      configured: !!(emailRes && didRes),
      email: emailRes ? emailRes.substring(0, 3) + '***' : null,
      did: didRes
    })
  } catch (err) {
    console.error('[Provider Get]', err)
    res.status(500).json({ error: 'Failed to fetch provider config.' })
  }
})

// --- FEATURE 3 & 4: META LEAD ADS WEBHOOK ---
// Resolve a webhook URL's :tenantSlug → tenant id (defaults to Centurion = 1).
// Lets each tenant use its own inbound URL (…/meta-leads/acme) without a JWT.
async function resolveSlugTenant(slug) {
  if (!slug) return 1
  try {
    const r = await pool.query("SELECT id FROM tenants WHERE slug = $1 AND status = 'Active' LIMIT 1;", [slug])
    return r.rows[0]?.id || 1
  } catch { return 1 }
}

// Optional :tenantSlug → base path stays Centurion; /…/<slug> routes to that tenant.
app.get('/api/webhooks/meta-leads/:tenantSlug?', async (req, res) => {
  // Facebook webhook verification — verify token is per-tenant (falls back to env)
  const tid = await resolveSlugTenant(req.params.tenantSlug)
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const VERIFY_TOKEN = (await getIntegrationSetting('meta_verify_token', tid)) || process.env.META_VERIFY_TOKEN || 'ccrm_meta_verify_2026'
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log(`[Meta Webhook] Verification successful (tenant ${tid}).`)
    return res.status(200).send(challenge)
  }
  res.status(403).json({ error: 'Verification failed.' })
})

// Capture an FB/IG comment: log it + create one auto-assigned lead per commenter.
// Comments carry no phone/email, so we use a per-commenter pseudo-email for dedupe.
async function captureSocialComment({ platform, postId, commentId, commenterId, commenterName, text, permalink, tenantId = 1 }) {
  if (!commentId) return
  try {
    const exists = await pool.query('SELECT id FROM social_comments WHERE comment_id = $1 AND tenant_id = $2 LIMIT 1;', [commentId, tenantId])
    if (exists.rows.length > 0) return   // already captured

    const sourceLabel = platform === 'instagram' ? 'Instagram Comment' : 'Facebook Comment'
    const name = (commenterName || 'Social Commenter').substring(0, 100)
    const pseudoEmail = `${platform}_${(commenterId || commentId)}@comment.noemail`.substring(0, 100)

    let leadId = null
    const dup = await pool.query('SELECT id FROM leads WHERE LOWER(email) = LOWER($1) AND tenant_id = $2 LIMIT 1;', [pseudoEmail, tenantId])
    if (dup.rows.length > 0) {
      leadId = dup.rows[0].id
    } else {
      const owner = await getNextAssignee(tenantId)
      const score = calculateLeadScore({ source: sourceLabel, stage: 'Untouched', mobile: '', email: pseudoEmail, course: '' })
      const ins = await pool.query(
        `INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color, lead_details, tenant_id)
         VALUES ($1, $2, '', '', $3, $4, $5, $6, 'Untouched', 'red', $7, $8) RETURNING id;`,
        [name, pseudoEmail, sourceLabel, owner, new Date().toLocaleString('en-IN', { hour12: true }), score, JSON.stringify({ comment: text || '', platform, permalink: permalink || '', postId: postId || '' }), tenantId]
      )
      leadId = ins.rows[0].id
      if (owner && owner !== 'Unassigned') await alertCounselor(owner, name, 'Comment', sourceLabel, leadId, tenantId)
    }

    await pool.query(
      `INSERT INTO social_comments (platform, post_id, comment_id, commenter_id, commenter_name, text, permalink, lead_id, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (comment_id) DO NOTHING;`,
      [platform, postId || '', commentId, commenterId || '', name, text || '', permalink || '', leadId, tenantId]
    )
    console.log(`[Social Comment] ${platform} comment captured from ${name}`)
  } catch (e) {
    console.error('[captureSocialComment]', e.message)
  }
}

app.post('/api/webhooks/meta-leads/:tenantSlug?', async (req, res) => {
  try {
    req.tenantId = await resolveSlugTenant(req.params.tenantSlug)
    const body = req.body
    if (body.object === 'page') {
      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          if (change.field === 'leadgen') {
            const leadgenId = change.value?.leadgen_id
            const leadData = change.value

            // Default values from webhook payload
            let name = leadData.field_data?.find(f => f.name === 'full_name')?.values?.[0] || 'Meta Lead'
            let email = leadData.field_data?.find(f => f.name === 'email')?.values?.[0] || `meta_${Date.now()}@noemail.com`
            let mobile = leadData.field_data?.find(f => f.name === 'phone_number')?.values?.[0] || '0000000000'
            let course = leadData.field_data?.find(f => f.name === 'course')?.values?.[0] || 'B.Tech CSE'
            let state = leadData.field_data?.find(f => f.name === 'state')?.values?.[0] || ''
            let city = leadData.field_data?.find(f => f.name === 'city')?.values?.[0] || ''

            // Fetch full lead data from Meta Graph API if Page Access Token is stored
            if (leadgenId) {
              const metaToken = await getIntegrationSetting('meta_page_access_token')
              if (metaToken) {
                try {
                  const graphRes = await fetch(`https://graph.facebook.com/v19.0/${leadgenId}?access_token=${metaToken}&fields=field_data,created_time,ad_name,campaign_name`)
                  if (graphRes.ok) {
                    const graphData = await graphRes.json()
                    const fd = graphData.field_data || []
                    name = fd.find(f => f.name === 'full_name')?.values?.[0] || fd.find(f => f.name === 'name')?.values?.[0] || name
                    email = fd.find(f => f.name === 'email')?.values?.[0] || email
                    mobile = fd.find(f => f.name === 'phone_number')?.values?.[0] || fd.find(f => f.name === 'phone')?.values?.[0] || mobile
                    course = fd.find(f => f.name === 'course')?.values?.[0] || fd.find(f => f.name === 'which_course_are_you_interested_in')?.values?.[0] || course
                    state = fd.find(f => f.name === 'state')?.values?.[0] || state
                    city = fd.find(f => f.name === 'city')?.values?.[0] || city
                    console.log(`[Meta Graph API] Fetched lead ${leadgenId}: ${name}, ${email}, ${mobile}`)
                  } else {
                    const errBody = await graphRes.json().catch(() => ({}))
                    console.error(`[Meta Graph API] Failed to fetch leadgen ${leadgenId} (HTTP ${graphRes.status}):`, JSON.stringify(errBody?.error || errBody))
                  }
                } catch (gErr) {
                  console.error('[Meta Graph API Error]', gErr.message)
                }
              } else {
                console.warn(`[Meta Webhook] leadgen ${leadgenId} received but no meta_page_access_token configured — cannot fetch lead data. Set it in Integrations → Facebook Lead Ads.`)
              }
            }

            // Guard: if we couldn't resolve a real phone, the Page Access Token is
            // missing/expired or lacks leads_retrieval — don't create a junk lead.
            if (String(mobile).replace(/\D/g, '').length < 10) {
              console.warn(`[Meta Webhook] No usable phone for leadgen ${leadgenId} — check meta_page_access_token / leads_retrieval permission. Skipping.`)
              await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
                [`Meta lead received but could not be fetched (leadgen ${leadgenId}). Check Facebook Lead Ads token in Integrations.`, 'Just now', 'lead_unassigned']).catch(() => {})
              continue
            }

            // Dedup check
            const dupCheck = await pool.query('SELECT id FROM leads WHERE (mobile = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [mobile, email, req.tenantId])
            if (dupCheck.rows.length === 0) {
              // Meta (Facebook/Instagram lead ads) → auto-assign round-robin
              const score = calculateLeadScore({ source: 'Meta', stage: 'Untouched', mobile, email, course })
              const assignee = await getNextAssignee(req.tenantId)
              const newLead = await pool.query(`
                INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color, tenant_id)
                VALUES ($1, $2, $3, $4, $5, $6, 'Meta', $9, $7, $8, 'Untouched', 'red', $10)
                RETURNING id;
              `, [name, email, mobile, state, city, course, new Date().toLocaleString('en-IN', { hour12: true }), score, assignee, req.tenantId])

              if (assignee && assignee !== 'Unassigned') {
                await alertCounselor(assignee, name, course, 'Meta', newLead.rows[0].id, req.tenantId)
                console.log(`[Meta Webhook] New lead auto-assigned to ${assignee}: ${name}`)
              } else {
                await pool.query('INSERT INTO notifications (text, time, type, tenant_id) VALUES ($1, $2, $3, $4);',
                  [`New Meta lead (unassigned): ${name} — assign from Lead Manager`, 'Just now', 'lead_unassigned', req.tenantId])
                console.log(`[Meta Webhook] New lead imported UNASSIGNED (no eligible counsellor): ${name}`)
              }
            } else {
              console.log(`[Meta Webhook] Duplicate lead skipped: ${mobile} / ${email}`)
            }
          }
          // Facebook Page post comments
          if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {
            const v = change.value
            await captureSocialComment({
              platform: 'facebook',
              postId: v.post_id,
              commentId: v.comment_id,
              commenterId: v.from?.id,
              commenterName: v.from?.name,
              text: v.message,
              permalink: v.post_id ? `https://www.facebook.com/${v.post_id}` : '',
              tenantId: req.tenantId
            })
          }
        }
      }
    }
    // Instagram comments (object='instagram')
    if (body.object === 'instagram') {
      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          if (change.field === 'comments') {
            const v = change.value || {}
            await captureSocialComment({
              platform: 'instagram',
              postId: v.media?.id,
              commentId: v.id,
              commenterId: v.from?.id,
              commenterName: v.from?.username,
              text: v.text,
              permalink: '',
              tenantId: req.tenantId
            })
          }
        }
      }
    }
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[Meta Webhook Error]', err)
    res.status(500).json({ error: 'Webhook processing failed.' })
  }
})

// List captured FB/Instagram comments
app.get('/api/social-comments', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const platform = req.query.platform || ''
    const where = []; const params = []
    params.push(req.tenantId); where.push(`tenant_id = $${params.length}`)
    if (platform) { params.push(platform); where.push(`platform = $${params.length}`) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM social_comments ${whereSql};`, params)
    const rowsRes = await pool.query(
      `SELECT id, platform, post_id, commenter_name, text, permalink, lead_id, created_at
       FROM social_comments ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset};`, params
    )
    res.json({ rows: rowsRes.rows, total: countRes.rows[0].total, page, limit })
  } catch (err) {
    console.error('[GET social-comments]', err.message)
    res.status(500).json({ error: 'Failed to fetch comments.' })
  }
})

// Google Ads Lead Form Webhook
app.post('/api/webhooks/google-leads/:tenantSlug?', async (req, res) => {
  try {
    req.tenantId = await resolveSlugTenant(req.params.tenantSlug)
    const lead = req.body
    const name = lead.user_column_data?.find(f => f.column_name === 'FULL_NAME')?.string_value || lead.full_name || 'Google Lead'
    const email = lead.user_column_data?.find(f => f.column_name === 'EMAIL')?.string_value || lead.email || `google_${Date.now()}@noemail.com`
    const mobile = lead.user_column_data?.find(f => f.column_name === 'PHONE_NUMBER')?.string_value || lead.phone_number || '0000000000'
    const course = lead.user_column_data?.find(f => f.column_name === 'COURSE')?.string_value || 'B.Tech CSE'

    const dupCheck = await pool.query('SELECT id FROM leads WHERE (mobile = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [mobile, email, req.tenantId])
    if (dupCheck.rows.length === 0) {
      // Inbound leads land UNASSIGNED — admin/manager distributes manually
      const score = calculateLeadScore({ source: 'Google Ads', stage: 'Untouched', mobile, email, course })
      await pool.query(`
        INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color, tenant_id)
        VALUES ($1, $2, $3, $4, 'Google Ads', 'Unassigned', $5, $6, 'Untouched', 'red', $7)
        RETURNING id;
      `, [name, email, mobile, course, new Date().toLocaleString('en-IN', { hour12: true }), score, req.tenantId])
      await pool.query('INSERT INTO notifications (text, time, type, tenant_id) VALUES ($1, $2, $3, $4);',
        [`New Google Ads lead (unassigned): ${name} — assign from Lead Manager`, 'Just now', 'lead_unassigned', req.tenantId])
    }
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[Google Webhook Error]', err)
    res.status(500).json({ error: 'Webhook processing failed.' })
  }
})

// WhatsApp Chatbot Webhook (Feature 19)
app.get('/api/webhooks/whatsapp-bot', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'ccrm_wa_verify_2026'
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge)
  res.status(403).json({ error: 'Verification failed.' })
})

app.post('/api/webhooks/whatsapp-bot', async (req, res) => {
  try {
    const body = req.body
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages || []
    for (const msg of messages) {
      const from = msg.from // phone number
      const text = msg.text?.body || ''
      // Simple keyword-based chatbot to capture name and course interest
      const course = detectCourseInterest(text)
      if (course) {
        const dupCheck = await pool.query('SELECT id FROM leads WHERE mobile = $1 LIMIT 1;', [from])
        if (dupCheck.rows.length === 0) {
          const score = calculateLeadScore({ source: 'WhatsApp', stage: 'Untouched', mobile: from, email: `wa_${from}@noemail.com`, course })
          // Social media (WhatsApp) → auto-assign round-robin
          const waLeadName = `WhatsApp Lead (${from.slice(-4)})`
          const assignee = await getNextAssignee()
          const waLead = await pool.query(`
            INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color)
            VALUES ($1, $2, $3, $4, 'WhatsApp', $7, $5, $6, 'Untouched', 'red')
            RETURNING id;
          `, [waLeadName, `wa_${from}@noemail.com`, from, course, new Date().toLocaleString('en-IN', { hour12: true }), score, assignee])
          if (assignee && assignee !== 'Unassigned') {
            await alertCounselor(assignee, waLeadName, course, 'WhatsApp', waLead.rows[0].id)
          } else {
            await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
              [`New WhatsApp lead (unassigned): ${waLeadName} — assign from Lead Manager`, 'Just now', 'lead_unassigned'])
          }
        }
      }
    }
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[WA Bot Error]', err)
    res.status(200).json({ received: true })
  }
})

function detectCourseInterest(text) {
  const t = text.toLowerCase()
  if (t.includes('btech') || t.includes('b.tech') || t.includes('cse') || t.includes('computer')) return 'B.Tech CSE'
  if (t.includes('mba')) return 'MBA'
  if (t.includes('bca')) return 'BCA'
  if (t.includes('bba')) return 'BBA'
  if (t.includes('mtech') || t.includes('m.tech')) return 'M.Tech'
  if (t.includes('msc') || t.includes('agriculture')) return 'M.Sc Agriculture'
  if (t.includes('bcom') || t.includes('b.com')) return 'B.Com'
  if (t.includes('ece') || t.includes('electronics')) return 'B.Tech ECE'
  if (t.includes('civil')) return 'B.Tech Civil'
  if (t.includes('mech')) return 'B.Tech Mech'
  return null
}

// --- FEATURE 9: PREDICTIVE LEAD SCORING ---
function calculateLeadScore({ source, stage, mobile, email, course, state }) {
  let score = 0
  // Source quality
  const sourceScores = { 'Referral': 30, 'Walk-in': 28, 'Education Fair': 25, 'Google Ads': 20, 'Meta': 18, 'Facebook Ads': 18, 'LinkedIn': 22, 'Website': 15, 'WhatsApp': 12, 'SMS Campaign': 10 }
  score += sourceScores[source] || 10
  // Email completeness (not noemail.com)
  if (email && !email.includes('noemail')) score += 15
  // Mobile completeness
  if (mobile && mobile !== '0000000000' && mobile.length >= 10) score += 15
  // Course specificity
  const premiumCourses = ['MBA', 'M.Tech', 'B.Tech CSE', 'B.Tech ECE']
  if (premiumCourses.includes(course)) score += 15
  // Stage bonus
  const stageBonus = { 'Qualified Leads': 20, 'Interested': 15, 'Follow Up': 10, 'Contacted': 5, 'Untouched': 0 }
  score += stageBonus[stage] || 0
  return Math.min(score, 100)
}

app.post('/api/leads/recalculate-score/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  try {
    const r = await pool.query('SELECT * FROM leads WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Lead not found.' })
    const lead = r.rows[0]
    const score = calculateLeadScore({ source: lead.source, stage: lead.stage, mobile: lead.mobile, email: lead.email, course: lead.course })
    await pool.query('UPDATE leads SET score = $1 WHERE id = $2 AND tenant_id = $3;', [score, id, req.tenantId])
    res.json({ score })
  } catch (err) {
    res.status(500).json({ error: 'Score recalculation failed.' })
  }
})

// --- FEATURE 5: WHATSAPP BULK MESSAGING ---
app.post('/api/leads/bulk-whatsapp', authenticateToken, async (req, res) => {
  const { leadIds, message, templateName, sentBy } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    // Read WhatsApp config from DB integration_settings (the source of truth)
    const waToken = await getIntegrationSetting('whatsapp_access_token', req.tenantId)
    const waPhone = await getIntegrationSetting('whatsapp_phone_number_id', req.tenantId)
    const waApiUrl = 'https://graph.facebook.com/v21.0'
    const isConfigured = !!(waToken && waPhone)

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders}) AND tenant_id = $${leadIds.length + 1};`, [...leadIds, req.tenantId])
    const leads = leadsRes.rows

    let sentCount = 0, failed = 0
    for (const lead of leads) {
      if (!isConfigured) {
        failed++  // can't actually send — not configured
        continue
      }
      try {
        const personalizedMsg = message.replace(/\{name\}/g, lead.name).replace(/\{mobile\}/g, lead.mobile)
        const waRes = await fetch(`${waApiUrl}/${waPhone}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: `91${lead.mobile.replace(/\D/g, '').slice(-10)}`,
            type: 'text',
            text: { body: personalizedMsg }
          })
        })
        if (waRes.ok) sentCount++
        else { failed++; console.error(`[WA] ${lead.mobile}:`, await waRes.text()) }
      } catch (e) {
        failed++; console.error(`[WA] Failed ${lead.mobile}:`, e.message)
      }
    }

    // Honest status: 'Sent' only if actually delivered to the API,
    // 'Not Configured' if WhatsApp isn't set up, 'Failed' if API rejected
    const status = !isConfigured ? 'Not Configured'
                 : sentCount === 0 ? 'Failed'
                 : failed > 0 ? 'Partial'
                 : 'Sent'

    await pool.query(
      'INSERT INTO whatsapp_logs (campaign_name, message_template, recipient_count, status, sent_by, channel, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7);',
      [templateName || 'Bulk Outreach', message.substring(0, 255), sentCount, status, sentBy || 'Unknown', 'whatsapp', req.tenantId]
    )

    if (!isConfigured) {
      return res.json({ success: false, sent: 0, total: leads.length,
        error: 'WhatsApp Business API is NOT configured. Go to Integrations → WhatsApp Business API and add your Access Token + Phone Number ID. No messages were actually sent.' })
    }

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
      [`WhatsApp by ${sentBy || 'a user'}: ${sentCount} sent, ${failed} failed`, 'Just now'])
    res.json({ success: true, sent: sentCount, failed, total: leads.length })
  } catch (err) {
    console.error('[WA Bulk]', err)
    res.status(500).json({ error: 'Bulk WhatsApp failed.', sent: 0 })
  }
})

// ── SMS provider dispatch — supports MSG91, Twilio, Plivo, TextLocal, Gupshup, Kaleyra, Karix ─
async function sendSmsViaProvider({ provider, apiKey, apiSid, senderId, fromNumber, templateId, mobile, message }) {
  const m91 = mobile  // 91XXXXXXXXXX format
  const tenDigit = mobile.slice(-10)
  const e164 = `+${mobile}`

  switch ((provider || 'msg91').toLowerCase()) {
    case 'twilio': {
      // POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
      // Basic auth: SID:AuthToken | body: From, To, Body
      if (!apiSid) throw new Error('Twilio requires Account SID in sms_api_sid')
      const url = `https://api.twilio.com/2010-04-01/Accounts/${apiSid}/Messages.json`
      const basic = Buffer.from(`${apiSid}:${apiKey}`).toString('base64')
      const body = new URLSearchParams({ From: fromNumber || senderId, To: e164, Body: message })
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      return r.ok
    }
    case 'plivo': {
      // POST https://api.plivo.com/v1/Account/{AUTH_ID}/Message/
      if (!apiSid) throw new Error('Plivo requires Auth ID in sms_api_sid')
      const url = `https://api.plivo.com/v1/Account/${apiSid}/Message/`
      const basic = Buffer.from(`${apiSid}:${apiKey}`).toString('base64')
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: fromNumber || senderId, dst: e164, text: message })
      })
      return r.ok
    }
    case 'textlocal': {
      // POST https://api.textlocal.in/send/
      const url = 'https://api.textlocal.in/send/'
      const body = new URLSearchParams({ apikey: apiKey, numbers: tenDigit, message, sender: senderId || 'TXTLCL' })
      const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      return r.ok
    }
    case 'gupshup': {
      // POST https://enterprise.smsgupshup.com/GatewayAPI/rest
      const url = 'https://enterprise.smsgupshup.com/GatewayAPI/rest?' + new URLSearchParams({
        method: 'sendMessage', userid: apiSid || '', password: apiKey,
        send_to: m91, msg: message, msg_type: 'TEXT', auth_scheme: 'plain', format: 'json'
      })
      const r = await fetch(url)
      return r.ok
    }
    case 'kaleyra': {
      // POST https://api.kaleyra.io/v1/{SID}/messages
      if (!apiSid) throw new Error('Kaleyra requires Account SID in sms_api_sid')
      const url = `https://api.kaleyra.io/v1/${apiSid}/messages`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ to: e164, type: 'OTP', sender: senderId, body: message, template_id: templateId || '' })
      })
      return r.ok
    }
    case 'karix': {
      // POST https://api.karix.io/message/
      const url = 'https://api.karix.io/message/'
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: senderId, destination: [m91], content: { text: message } })
      })
      return r.ok
    }
    case 'msg91':
    default: {
      // MSG91 send flow
      const r = await fetch('https://api.msg91.com/api/sendhttp.php?' + new URLSearchParams({
        authkey: apiKey, mobiles: m91, message, sender: senderId || 'CUTMAD',
        route: '4', country: '91',
      }))
      return r.ok
    }
  }
}

app.post('/api/leads/bulk-sms', authenticateToken, async (req, res) => {
  const { leadIds, message } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    const provider    = await getIntegrationSetting('sms_provider', req.tenantId)
    const apiKey      = await getIntegrationSetting('sms_api_key', req.tenantId)
    const apiSid      = await getIntegrationSetting('sms_api_sid', req.tenantId)
    const senderId    = await getIntegrationSetting('sms_sender_id', req.tenantId)
    const fromNumber  = await getIntegrationSetting('sms_from_number', req.tenantId)
    const templateId  = await getIntegrationSetting('sms_template_id', req.tenantId)

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders}) AND tenant_id = $${leadIds.length + 1};`, [...leadIds, req.tenantId])
    const leads = leadsRes.rows

    let sentCount = 0, failed = 0
    for (const lead of leads) {
      const mobile = `91${lead.mobile.replace(/\D/g, '').slice(-10)}`
      const personalizedMsg = message.replace(/\{name\}/g, lead.name)

      if (!apiKey) {
        console.log(`[SMS] Simulating ${provider || 'msg91'} to ${lead.name} (${mobile})`)
        sentCount++
        continue
      }

      try {
        const ok = await sendSmsViaProvider({ provider, apiKey, apiSid, senderId, fromNumber, templateId, mobile, message: personalizedMsg })
        ok ? sentCount++ : failed++
      } catch (e) {
        console.error(`[SMS:${provider}] Failed for ${mobile}:`, e.message)
        failed++
      }
    }

    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`SMS bulk via ${provider || 'msg91'}: ${sentCount} sent, ${failed} failed`, 'Just now', req.tenantId])
    res.json({ success: true, sent: sentCount, failed, total: leads.length, provider: provider || 'msg91' })
  } catch (err) {
    console.error('[SMS Bulk]', err)
    res.status(500).json({ error: 'Bulk SMS failed.', sent: 0 })
  }
})

// ── RCS (rcssms.in) — bearer token generation + error-code mapping ──────────
// Per "JSON RCS API" doc: POST Basic base64(username:client_secret) to
// /api/rcs/accesstoken → returns a token valid 24h. We cache it and refresh
// 5 min before expiry (mirrors the EasyGoIVRProvider pattern).
let _rcsTokenCache = { token: null, expiry: 0 }

async function getRcsToken(username, clientSecret) {
  if (!username || !clientSecret) return null
  // Reuse cached token if still valid (5-min buffer)
  if (_rcsTokenCache.token && Date.now() < _rcsTokenCache.expiry - 5 * 60 * 1000) {
    return _rcsTokenCache.token
  }
  const basic = Buffer.from(`${username}:${clientSecret}`).toString('base64')
  const r = await fetch('https://web.rcssms.in/api/rcs/accesstoken', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/json' }
  })
  const text = await r.text()
  let data = {}
  try { data = JSON.parse(text) } catch {}
  const token = data.token || data.access_token || data.accesstoken || data.API_TOKEN
  if (!token) {
    console.error('[RCS] Token generation failed:', data || text)
    throw new Error('rcssms: token generation failed — check username/client secret')
  }
  _rcsTokenCache = { token, expiry: Date.now() + 24 * 60 * 60 * 1000 }
  console.log('[RCS] Access token generated successfully')
  return token
}

// Map rcssms.in numeric error codes (from the JSON RCS API doc) to readable text
function mapRcsError(code) {
  const map = {
    10: 'Missing username, password, type or msisdn field',
    13: 'Invalid JSON packet',
    15: 'Account validity expired',
    18: 'Template ID not found',
    21: 'Username does not exist or is invalid',
    22: 'Incorrect username/password or token',
    23: 'Insufficient credit',
    24: 'Incorrect number list',
    30: 'Token validity expired',
  }
  return map[parseInt(code)] || `RCS error code ${code}`
}

// ── RCS Business Messaging — Gupshup / Karix / Sinch / Google RBM ───────────
// Returns { ok: boolean, msgid?: string, error?: string } for every provider.
async function sendRcsViaProvider({ provider, apiKey, clientSecret, agentId, senderId, mobile, message,
                                   variables, username, password, rcsid, templateId, rcsType }) {
  switch ((provider || 'gupshup').toLowerCase()) {
    case 'rcssms': {
      // web.rcssms.in — METHOD 1 (preferred): variables as array of one object {var1, var2, ...}
      // POST https://web.rcssms.in/rcsapi/jsonapi.jsp?apitype=1
      // Auth order: client secret → generated 24h bearer; else static bearer (apiKey); else password in body.
      if (!rcsid)      throw new Error('rcssms: rcsid (Bot ID) required — set rcs_rcsid')
      if (!templateId) throw new Error('rcssms: templateid required — set rcs_template_id')
      if (!username)   throw new Error('rcssms: username required — set rcs_username')

      // Build the variables object. Accept either a ready object {var1,...} or a plain string.
      let varsObj
      if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
        varsObj = variables
      } else if (Array.isArray(variables)) {
        varsObj = {}; variables.forEach((v, i) => { varsObj[`var${i + 1}`] = v })
      } else {
        varsObj = { var1: message ?? '' }
      }

      // Resolve bearer token
      let bearer = null
      if (clientSecret) bearer = await getRcsToken(username, clientSecret)
      else if (apiKey)  bearer = apiKey
      if (!bearer && !password) throw new Error('rcssms: provide client secret, bearer token, or password')

      const url = 'https://web.rcssms.in/rcsapi/jsonapi.jsp?apitype=1'
      const body = {
        username,
        rcstype: (rcsType || 'BASIC').toUpperCase(),
        rcsid,
        msisdn: mobile,                        // 91XXXXXXXXXX (comma-separated for bulk)
        variables: [varsObj],
        templateid: templateId,
      }
      if (!bearer) body.password = password    // password mode

      const headers = { 'Content-Type': 'application/json' }
      if (bearer) headers.Authorization = `Bearer ${bearer}`

      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      const text = await r.text()
      let data = {}
      try { data = JSON.parse(text) } catch {}
      // Success → { data: [{ msgid, msisdn }] }
      // Failure formats seen: { errorcode } | { error } | { Error: { ErrorCode, ErrorDesc } }
      const code    = data.errorcode ?? data.error ?? data.code ?? data?.Error?.ErrorCode
      const errDesc = data?.Error?.ErrorDesc
      const succeeded = r.ok && Array.isArray(data.data) && data.data.length > 0
      if (!succeeded) {
        const errText = errDesc || (code != null ? mapRcsError(code) : (text || 'unknown error'))
        console.error('[RCS:rcssms]', errText, data || text)
        return { ok: false, error: errText }
      }
      return { ok: true, msgid: data.data[0]?.msgid }
    }
    case 'gupshup': {
      const url = 'https://api.gupshup.io/sm/api/v1/msg'
      const r = await fetch(url, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          channel: 'rcs', source: senderId || agentId, destination: mobile,
          'src.name': senderId, message: JSON.stringify({ type: 'text', text: message })
        })
      })
      return { ok: r.ok }
    }
    case 'karix': {
      const url = 'https://api.karix.io/message/'
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: agentId, destination: [mobile], channel: 'rcs', content: { text: message } })
      })
      return { ok: r.ok }
    }
    case 'sinch': {
      const url = `https://us.rcs.api.sinch.com/v1/projects/${agentId}/messages:send`
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_message: { agent_message: { text_message: { text: message } } }, recipient: { contact: { phone_number: `+${mobile}` } } })
      })
      return { ok: r.ok }
    }
    case 'google-rbm':
    case 'rbm': {
      const url = `https://rcsbusinessmessaging.googleapis.com/v1/phones/%2B${mobile}/agentMessages`
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentMessage: { text: message } })
      })
      return { ok: r.ok }
    }
    default: throw new Error(`Unknown RCS provider: ${provider}`)
  }
}

// ── RCS Templates — list, add, delete + webhook from rcssms.in ──────────
app.get('/api/rcs/templates', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, template_id AS "templateId", name, rcs_type AS "rcsType", status,
              provider, variables, preview, created_at AS "createdAt", approved_at AS "approvedAt"
       FROM rcs_templates WHERE tenant_id = $1 ORDER BY status DESC, created_at DESC;`,
      [req.tenantId]
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/rcs/templates', async (req, res) => {
  const { templateId, name, rcsType, status, provider, variables, preview } = req.body
  if (!templateId) return res.status(400).json({ error: 'templateId required.' })
  try {
    const r = await pool.query(`
      INSERT INTO rcs_templates (template_id, name, rcs_type, status, provider, variables, preview, approved_at, tenant_id)
      VALUES ($1, $2, $3, $4::text, $5, $6::jsonb, $7, CASE WHEN $4::text = 'APPROVED' THEN NOW() ELSE NULL END, $8)
      ON CONFLICT (template_id) DO UPDATE
        SET name      = EXCLUDED.name,
            rcs_type  = EXCLUDED.rcs_type,
            status    = EXCLUDED.status,
            provider  = EXCLUDED.provider,
            variables = EXCLUDED.variables,
            preview   = EXCLUDED.preview,
            approved_at = CASE WHEN EXCLUDED.status = 'APPROVED' AND rcs_templates.status != 'APPROVED' THEN NOW() ELSE rcs_templates.approved_at END
      RETURNING id, template_id AS "templateId", name, rcs_type AS "rcsType", status, provider, variables, preview;
    `, [templateId, name || templateId, (rcsType || 'BASIC').toUpperCase(), (status || 'PENDING').toUpperCase(), provider || 'rcssms', JSON.stringify(variables || []), preview || '', req.tenantId])
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/rcs/templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM rcs_templates WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Webhook for rcssms.in to push approval status:
// They POST { templateid, status } when admin approves/rejects in their dashboard.
// Configure this URL with rcssms support: https://crm.cutmap.ac.in/api/webhooks/rcssms-template
app.post('/api/webhooks/rcssms-template', async (req, res) => {
  const { templateid, status } = req.body || {}
  if (!templateid) return res.status(400).json({ error: 'templateid required' })
  try {
    const upStatus = (status || 'APPROVED').toUpperCase()
    await pool.query(`
      INSERT INTO rcs_templates (template_id, status, provider, approved_at)
      VALUES ($1, $2::text, 'rcssms', CASE WHEN $2::text = 'APPROVED' THEN NOW() ELSE NULL END)
      ON CONFLICT (template_id) DO UPDATE
        SET status = EXCLUDED.status,
            approved_at = CASE WHEN EXCLUDED.status = 'APPROVED' AND rcs_templates.status != 'APPROVED' THEN NOW() ELSE rcs_templates.approved_at END;
    `, [templateid, upStatus])
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
      [`RCS template ${templateid}: ${upStatus} (via rcssms webhook)`, 'Just now'])
    console.log(`[RCS webhook] ${templateid} → ${upStatus}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[RCS webhook]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/leads/:id/send-rcs — send an approved RCS template to a single lead
app.post('/api/leads/:id/send-rcs', authenticateToken, async (req, res) => {
  const leadId = req.params.id
  const { templateId: reqTemplateId, rcsType: reqRcsType, variables } = req.body || {}
  try {
    const leadRes = await pool.query('SELECT id, name, mobile FROM leads WHERE id = $1;', [leadId])
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found.' })
    const lead = leadRes.rows[0]
    const mobile = `91${(lead.mobile || '').replace(/\D/g, '').slice(-10)}`
    if (mobile.length !== 12) return res.status(400).json({ error: 'Lead has no valid mobile number.' })

    const provider     = await getIntegrationSetting('rcs_provider')
    const apiKey       = await getIntegrationSetting('rcs_api_key')
    const clientSecret = await getIntegrationSetting('rcs_client_secret')
    const agentId      = await getIntegrationSetting('rcs_agent_id')
    const senderId     = await getIntegrationSetting('rcs_sender_id')
    const username     = await getIntegrationSetting('rcs_username')
    const password     = await getIntegrationSetting('rcs_password')
    const rcsid        = await getIntegrationSetting('rcs_rcsid')
    const templateId   = reqTemplateId || await getIntegrationSetting('rcs_template_id')
    const rcsType      = reqRcsType    || await getIntegrationSetting('rcs_type')

    if (!templateId) return res.status(400).json({ error: 'No template selected (and no default configured).' })

    const result = await sendRcsViaProvider({
      provider, apiKey, clientSecret, agentId, senderId,
      mobile, message: '', variables: variables || {},
      username, password, rcsid, templateId, rcsType
    })

    // Resolve a display name for sent_by; JWT only carries id/email/role.
    let sentBy = req.user.email || 'Unknown'
    try {
      const u = await pool.query('SELECT name FROM users WHERE id = $1;', [req.user.id])
      if (u.rows[0]?.name) sentBy = u.rows[0].name
    } catch {}

    // Log to rcs_messages — never let a logging failure fail a sent message.
    try {
      await pool.query(
        `INSERT INTO rcs_messages (lead_id, lead_name, mobile, template_id, rcs_type, variables, status, msgid, error_code, sent_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10);`,
        [lead.id, lead.name, mobile, templateId, (rcsType || 'BASIC').toUpperCase(),
         JSON.stringify(variables || {}), result.ok ? 'sent' : 'failed',
         result.msgid || '', result.ok ? '' : (result.error || ''), sentBy]
      )
    } catch (logErr) {
      console.error('[RCS single] sent but DB logging failed:', logErr.message)
    }

    if (!result.ok) return res.status(502).json({ error: result.error || 'RCS send failed.' })
    res.json({ success: true, msgid: result.msgid, status: 'sent' })
  } catch (err) {
    console.error('[RCS single]', err)
    res.status(500).json({ error: err.message || 'Failed to send RCS.' })
  }
})

// GET /api/leads/:id/rcs-history — recent RCS messages for a lead
app.get('/api/leads/:id/rcs-history', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, mobile, template_id AS "templateId", rcs_type AS "rcsType", variables,
              status, msgid, error_code AS "errorCode", sent_by AS "sentBy",
              created_at AS "createdAt", delivered_at AS "deliveredAt"
       FROM rcs_messages WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50;`,
      [req.params.id]
    )
    res.json(r.rows)
  } catch (err) {
    console.error('[RCS history]', err)
    res.status(500).json({ error: 'Failed to fetch RCS history.' })
  }
})

// POST /api/webhooks/rcssms-dlr — delivery reports pushed by rcssms.in
// Share this URL with rcssms support: https://crm.cutmap.ac.in/api/webhooks/rcssms-dlr
app.post('/api/webhooks/rcssms-dlr', async (req, res) => {
  const { msgid, status } = req.body || {}
  console.log('[Webhook rcssms-dlr]', req.body)
  if (!msgid) return res.status(400).json({ error: 'msgid required' })
  try {
    await pool.query(
      `UPDATE rcs_messages
         SET status = $2,
             delivered_at = CASE WHEN UPPER($2) IN ('DELIVERED','READ') THEN NOW() ELSE delivered_at END
       WHERE msgid = $1;`,
      [msgid, (status || 'DELIVERED').toLowerCase()]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[Webhook rcssms-dlr]', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/leads/bulk-rcs', authenticateToken, async (req, res) => {
  const { leadIds, message, templateId: requestedTemplateId, rcsType: requestedRcsType } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    const tid = req.tenantId
    const provider     = await getIntegrationSetting('rcs_provider', tid)
    const apiKey       = await getIntegrationSetting('rcs_api_key', tid)
    const clientSecret = await getIntegrationSetting('rcs_client_secret', tid)
    const agentId      = await getIntegrationSetting('rcs_agent_id', tid)
    const senderId     = await getIntegrationSetting('rcs_sender_id', tid)
    const username     = await getIntegrationSetting('rcs_username', tid)
    const password     = await getIntegrationSetting('rcs_password', tid)
    const rcsid        = await getIntegrationSetting('rcs_rcsid', tid)
    // Per-call template override > saved default
    const templateId = requestedTemplateId || await getIntegrationSetting('rcs_template_id', tid)
    const rcsType    = requestedRcsType    || await getIntegrationSetting('rcs_type', tid)

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders}) AND tenant_id = $${leadIds.length + 1};`, [...leadIds, tid])
    const leads = leadsRes.rows

    // For rcssms, batch send up to 500 numbers in one call (msisdn supports comma-separated)
    const isRcssms = (provider || '').toLowerCase() === 'rcssms'
    const hasAuth  = apiKey || password || clientSecret

    if (!hasAuth) {
      // Simulation mode (no credentials)
      console.log(`[RCS] Simulating ${provider || 'gupshup'} bulk send to ${leads.length} numbers`)
      return res.json({ success: true, sent: leads.length, failed: 0, total: leads.length, provider: provider || 'gupshup', simulated: true })
    }

    let sentCount = 0, failed = 0

    // If the message uses {name}, send per-recipient so each lead's name is filled in.
    const personalize = /\{name\}/.test(message || '')

    if (isRcssms && (rcsType || 'BASIC').toUpperCase() === 'BASIC' && !personalize) {
      // BASIC template — same message for all → send in one batch (comma-separated msisdn)
      const allMobiles = leads.map(l => `91${l.mobile.replace(/\D/g, '').slice(-10)}`).join(',')
      try {
        const result = await sendRcsViaProvider({
          provider, apiKey, clientSecret, agentId, senderId,
          mobile: allMobiles, message,
          username, password, rcsid, templateId, rcsType
        })
        if (result.ok) sentCount = leads.length
        else           failed = leads.length
      } catch (e) {
        console.error(`[RCS:rcssms] Batch failed:`, e.message)
        failed = leads.length
      }
    } else {
      // One per recipient (allows {name} personalization)
      for (const lead of leads) {
        const mobile = `91${lead.mobile.replace(/\D/g, '').slice(-10)}`
        const personalizedMsg = message.replace(/\{name\}/g, lead.name)
        try {
          const result = await sendRcsViaProvider({
            provider, apiKey, clientSecret, agentId, senderId, mobile, message: personalizedMsg,
            username, password, rcsid, templateId, rcsType
          })
          result.ok ? sentCount++ : failed++
        } catch (e) {
          console.error(`[RCS:${provider}] Failed:`, e.message); failed++
        }
      }
    }

    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`RCS bulk via ${provider || 'gupshup'}: ${sentCount} sent, ${failed} failed`, 'Just now', req.tenantId])
    res.json({ success: true, sent: sentCount, failed, total: leads.length, provider: provider || 'gupshup' })
  } catch (err) {
    console.error('[RCS Bulk]', err)
    res.status(500).json({ error: 'Bulk RCS failed.', sent: 0 })
  }
})

// --- BULK EMAIL to leads (per-lead {name} personalization, via configured SMTP) ---
app.post('/api/leads/bulk-email', authenticateToken, async (req, res) => {
  const { leadIds, subject, message } = req.body
  if (!Array.isArray(leadIds) || leadIds.length === 0) return res.status(400).json({ error: 'No leads selected.' })
  if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Subject is required.' })
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required.' })
  try {
    const cfg = await createMailTransporter(req.tenantId)
    if (cfg.error) return res.status(400).json({ error: cfg.error })

    const ids = leadIds.map(Number).filter(Boolean)
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, email FROM leads WHERE id IN (${placeholders}) AND tenant_id = $${ids.length + 1};`, [...ids, req.tenantId])

    let sent = 0, failed = 0, skipped = 0
    for (const lead of leadsRes.rows) {
      const email = (lead.email || '').trim()
      if (!/^\S+@\S+\.\S+$/.test(email) || /noemail|no-email/i.test(email)) { skipped++; continue }
      const name = lead.name || 'there'
      const subj = String(subject).replace(/\{name\}/g, name)
      const body = String(message).replace(/\{name\}/g, name)
      try {
        await cfg.transporter.sendMail({ from: cfg.from, to: email, subject: subj, text: body })
        sent++
      } catch (e) { failed++; console.error('[Bulk Email]', email, e.message) }
    }
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
      [`Bulk email by ${req.user?.email || 'user'}: ${sent} sent · ${failed} failed · ${skipped} no-email`, 'Just now', req.tenantId]).catch(() => {})
    res.json({ success: true, sent, failed, skipped, total: leadsRes.rows.length })
  } catch (err) {
    console.error('[Bulk Email]', err.message)
    res.status(500).json({ error: 'Bulk email failed: ' + err.message })
  }
})

// --- FEATURE 6: AUTOMATED DRIP SEQUENCES ---
app.post('/api/drip/enroll', async (req, res) => {
  const { leadId, leadName, leadEmail, leadMobile, sequenceName } = req.body
  try {
    // Check if already enrolled
    const existing = await pool.query('SELECT id FROM drip_sequences WHERE lead_id = $1 AND status = $2 AND tenant_id = $3;', [leadId, 'Active', req.tenantId])
    if (existing.rows.length > 0) return res.json({ message: 'Already enrolled in drip sequence.' })

    const nextActionAt = new Date()
    const insertRes = await pool.query(`
      INSERT INTO drip_sequences (lead_id, lead_name, lead_email, lead_mobile, sequence_name, current_step, status, next_action_at, tenant_id)
      VALUES ($1, $2, $3, $4, $5, 0, 'Active', $6, $7)
      RETURNING *;
    `, [leadId, leadName, leadEmail, leadMobile, sequenceName || 'Standard Admission', nextActionAt, req.tenantId])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to enroll in drip sequence.' })
  }
})

app.get('/api/drip', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM drip_sequences WHERE tenant_id = $1 ORDER BY id DESC LIMIT 100;', [req.tenantId])
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drip sequences.' })
  }
})

// Process pending drip actions (called by cron or manually)
app.post('/api/drip/process', async (req, res) => {
  try {
    const now = new Date()
    const pending = await pool.query(
      "SELECT * FROM drip_sequences WHERE status = 'Active' AND next_action_at <= $1 LIMIT 50;",
      [now]
    )
    const DRIP_STEPS = [
      { day: 0, type: 'WhatsApp', message: 'Hi {name}, thank you for your interest in CUTM! 🎓 We offer world-class programs in {course}. Reply YES to know more.' },
      { day: 1, type: 'Email', message: 'Dear {name}, explore our CUTM campus and course brochure. Seats are limited for 2026 batch!' },
      { day: 3, type: 'SMS', message: 'CUTM: {name}, last few seats for {course}. Apply today: https://cutm.ac.in' },
      { day: 7, type: 'Task', message: 'Call follow-up: {name} has not responded in 7 days.' },
    ]

    let processed = 0
    for (const seq of pending.rows) {
      const step = DRIP_STEPS[seq.current_step]
      if (!step) {
        // Sequence complete
        await pool.query("UPDATE drip_sequences SET status = 'Completed' WHERE id = $1;", [seq.id])
        continue
      }

      // Log the action (tagged to the sequence's tenant)
      await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
        [`[Drip] ${step.type} → ${seq.lead_name}: ${step.message.replace('{name}', seq.lead_name).substring(0, 80)}`, 'Just now', seq.tenant_id || 1])

      if (step.type === 'Task') {
        await pool.query(`INSERT INTO tasks (title, type, priority, due, status, assignee, lead, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
          [step.message.replace('{name}', seq.lead_name), 'Call', 'High', new Date().toLocaleString('en-IN', { hour12: true }), 'Pending', 'Unassigned', seq.lead_name, seq.tenant_id || 1])
      }

      // Advance to next step
      const nextStep = seq.current_step + 1
      const nextStepDef = DRIP_STEPS[nextStep]
      const nextActionAt = nextStepDef
        ? new Date(Date.now() + nextStepDef.day * 24 * 60 * 60 * 1000)
        : null

      await pool.query(`
        UPDATE drip_sequences
        SET current_step = $1, next_action_at = $2, status = CASE WHEN $3 = TRUE THEN 'Completed' ELSE status END
        WHERE id = $4;
      `, [nextStep, nextActionAt, !nextStepDef, seq.id])
      processed++
    }
    res.json({ processed })
  } catch (err) {
    console.error('[Drip Process]', err)
    res.status(500).json({ error: 'Drip processing failed.' })
  }
})

// --- FEATURE 7: SOURCE-TO-ENROLLMENT FUNNEL ---
app.get('/api/reports/funnel', authenticateToken, async (req, res) => {
  try {
    const { source, campaign } = req.query
    const tnt = parseInt(req.tenantId) || 1   // trusted integer → safe to interpolate
    const srcCond = source ? ` AND source = '${source.replace(/'/g,"''")}'` : ''

    const leads = await pool.query(`SELECT COUNT(*) FROM leads WHERE tenant_id = ${tnt}${srcCond};`)
    const contacted = await pool.query(`SELECT COUNT(*) FROM leads WHERE tenant_id = ${tnt}${srcCond} AND stage IN ('Contacted', 'Follow Up', 'Interested', 'Qualified Leads', 'Converted');`)
    const apps = await pool.query(`SELECT COUNT(*) FROM applications WHERE tenant_id = ${tnt};`)
    const payments = await pool.query(`SELECT COUNT(*) FROM payments WHERE status = 'Approved' AND tenant_id = ${tnt};`)
    const enrolled = await pool.query(`SELECT COUNT(*) FROM applications WHERE stage IN ('Enrolment', 'Enrolments') AND tenant_id = ${tnt};`)
    const sourceBreakdown = await pool.query(`SELECT source, COUNT(*) as count FROM leads WHERE tenant_id = ${tnt} GROUP BY source ORDER BY count DESC;`)

    res.json({
      funnel: [
        { stage: 'Total Leads', count: parseInt(leads.rows[0].count) },
        { stage: 'Contacted', count: parseInt(contacted.rows[0].count) },
        { stage: 'Applications', count: parseInt(apps.rows[0].count) },
        { stage: 'Payment Approved', count: parseInt(payments.rows[0].count) },
        { stage: 'Enrolled', count: parseInt(enrolled.rows[0].count) },
      ],
      sourceBreakdown: sourceBreakdown.rows
    })
  } catch (err) {
    res.status(500).json({ error: 'Funnel report failed.' })
  }
})

// --- FEATURE 8: COUNSELOR LEADERBOARD ---
app.get('/api/reports/leaderboard', authenticateToken, async (req, res) => {
  try {
    const usersRes = await pool.query("SELECT id, name, email FROM users WHERE status = 'Active' AND tenant_id = $1 ORDER BY name;", [req.tenantId])
    const leaderboard = []
    const tnt = req.tenantId
    for (const u of usersRes.rows) {
      const simplName = u.name.split(' ')[0]
      const q = (sql, params) => pool.query(sql, params).then(r => parseInt(r.rows[0].count))
      const leadsTotal = await q("SELECT COUNT(*) FROM leads WHERE (owner = $1 OR owner LIKE $2) AND tenant_id = $3;", [u.name, `${simplName}%`, tnt])
      const converted = await q("SELECT COUNT(*) FROM leads WHERE (owner = $1 OR owner LIKE $2) AND stage IN ('Qualified Leads','Converted') AND tenant_id = $3;", [u.name, `${simplName}%`, tnt])
      const enrolled = await q("SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND stage IN ('Enrolment','Enrolments') AND tenant_id = $3;", [u.name, `${simplName}%`, tnt])
      const payApproved = await q("SELECT COUNT(*) FROM payments p JOIN applications a ON p.app_no = a.app_no WHERE (a.owner = $1 OR a.owner LIKE $2) AND p.status = 'Approved' AND a.tenant_id = $3;", [u.name, `${simplName}%`, tnt])
      const callsCount = await q("SELECT COUNT(*) FROM call_logs WHERE (counselor = $1 OR counselor LIKE $2) AND tenant_id = $3;", [u.name, `${simplName}%`, tnt])
      const convRate = leadsTotal > 0 ? ((converted / leadsTotal) * 100).toFixed(1) : '0.0'
      leaderboard.push({ name: u.name, email: u.email, leads: leadsTotal, converted, enrolled, payApproved, calls: callsCount, convRate: parseFloat(convRate) })
    }
    leaderboard.sort((a, b) => b.enrolled - a.enrolled || b.converted - a.converted)
    res.json(leaderboard)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Leaderboard query failed.' })
  }
})

// --- FEATURE 10: PUBLIC INQUIRY FORM ---
app.post('/api/public/inquiry/:tenantSlug?', async (req, res) => {
  const { name, email, mobile, state, city, course, source, prefix } = req.body
  console.log(`[Public Inquiry] HIT tenantSlug=${req.params.tenantSlug || '(default)'} name=${name || '?'} mobile=${mobile || '?'} email=${email || '(none)'} source=${source || '(none)'}`)
  if (!name || !mobile) {
    console.log(`[Public Inquiry] REJECTED 400 — missing name and/or mobile`)
    return res.status(400).json({ error: 'Name and mobile are required.' })
  }
  // Caller may supply their own leadId prefix (e.g. "CUEDU26"); sanitized to
  // letters/digits only and capped so it can't blow up the padded ID format.
  const cleanPrefix = prefix ? String(prefix).trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20) : ''
  try {
    const tenantId = await resolveSlugTenant(req.params.tenantSlug || req.query.tenant)
    // Dedup check
    const dup = await pool.query('SELECT id FROM leads WHERE (mobile = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [mobile, email || '', tenantId])
    if (dup.rows.length > 0) {
      console.log(`[Public Inquiry] DUPLICATE — mobile=${mobile} already exists in tenant=${tenantId}`)
      return res.status(200).json({ message: 'Your inquiry was already received. Our team will contact you shortly.', duplicate: true })
    }

    // Auto-assign all new leads via round-robin to active counselors
    const score = calculateLeadScore({ source: source || 'Website', stage: 'Untouched', mobile, email, course })
    const leadSource = source?.toLowerCase().includes('facebook') ? 'facebook' : 'form'
    // Same social-vs-direct classification used everywhere else in the app —
    // drives which default prefix (CULDSM26 / CULDAI26) this lead's reference
    // ID gets, unless this tenant has its own configured prefix (set from the
    // Edit Organization modal), or the caller passed one directly in `prefix`.
    const socialList = ['meta', 'facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'telegram', 'social media']
    const sourceType = socialList.includes((source || '').toLowerCase()) ? 'sm' : 'ai'
    const tenantRow = await pool.query('SELECT lead_id_prefix FROM tenants WHERE id = $1;', [tenantId])
    const tenantPrefix = tenantRow.rows[0]?.lead_id_prefix || ''
    const refPrefix = cleanPrefix || tenantPrefix || (sourceType === 'sm' ? 'CULDSM26' : 'CULDAI26')
    const owner = await getNextAssignee(tenantId)
    const insertRes = await pool.query(`
      INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color, lead_source, source_type, lead_ref_prefix, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $12, $8, $9, 'Untouched', 'red', $10, $11, $13, $14)
      RETURNING id, name, email, course;
    `, [name, email || `pub_${Date.now()}@noemail.com`, mobile, state || '', city || '', course || 'B.Tech CSE', source || 'Website', new Date().toLocaleString('en-IN', { hour12: true }), score, leadSource, sourceType, owner, refPrefix, tenantId])

    const pubLead = insertRes.rows[0]
    if (owner && owner !== 'Unassigned') {
      await alertCounselor(owner, name, course || 'B.Tech CSE', source || 'Website', pubLead.id, tenantId)
    } else {
      // Notify admins a new unassigned lead arrived from the landing page
      await pool.query('INSERT INTO notifications (text, time, type, tenant_id) VALUES ($1, $2, $3, $4);',
        [`New ${source || 'Website'} lead (unassigned): ${name} — assign from Lead Manager`, 'Just now', 'lead_unassigned', tenantId])
    }

    // Reference ID the caller can quote — either their own supplied prefix,
    // or the same CULDAI26/CULDSM26 format shown in the CRM's own Lead
    // Manager table. The raw numeric `id` alone isn't recognizable to anyone
    // looking at the CRM UI, so this is included either way.
    const leadIdFormatted = `${refPrefix}${String(pubLead.id).padStart(4, '0')}`

    // CU EDU's integration also needs the email echoed back; other tenants keep the original field set.
    const respLead = (req.params.tenantSlug || '').toLowerCase() === 'cuedu'
      ? { ...pubLead, leadId: leadIdFormatted }
      : { id: pubLead.id, leadId: leadIdFormatted, name: pubLead.name, course: pubLead.course }

    console.log(`[Public Inquiry] SUCCESS 201 — created leadId=${leadIdFormatted} (id=${pubLead.id}) in tenant=${tenantId}`)
    res.status(201).json({ message: 'Thank you! Our admissions team will contact you within 24 hours.', lead: respLead })
  } catch (err) {
    console.error('[Public Inquiry]', err)
    res.status(500).json({ error: 'Failed to submit inquiry.' })
  }
})

// Shared-secret key for the lookup endpoint below — this route returns real
// PII (name/email/phone/stage) given only a guessable identifier, so unlike
// the create-inquiry endpoint it must not be left open. Override via the
// LOOKUP_API_KEY env var in production; this value is only the dev fallback.
const LOOKUP_API_KEY = process.env.LOOKUP_API_KEY || '6JJeV4blCJIfHzrVFBxpdkN3rtIGTTAU'

// Look up a lead by mobile, email, or the formatted leadId (CULDAI26.../CULDSM26...)
// — scoped to one tenant, so results only ever come from that tenant's own leads.
// Pass exactly one of ?mobile=, ?email=, ?leadId=. Requires header: X-API-Key.
app.get('/api/public/inquiry/:tenantSlug/lookup', async (req, res) => {
  console.log(`[Public Inquiry Lookup] HIT tenantSlug=${req.params.tenantSlug} mobile=${req.query.mobile || '(none)'} email=${req.query.email || '(none)'} leadId=${req.query.leadId || '(none)'} keyProvided=${!!req.headers['x-api-key']}`)
  if (req.headers['x-api-key'] !== LOOKUP_API_KEY) {
    console.log(`[Public Inquiry Lookup] REJECTED 401 — bad or missing X-API-Key`)
    return res.status(401).json({ error: 'Missing or invalid X-API-Key.' })
  }
  const { mobile, email, leadId } = req.query
  if (!mobile && !email && !leadId) {
    return res.status(400).json({ error: 'Provide one of: mobile, email, leadId.' })
  }
  try {
    const tenantId = await resolveSlugTenant(req.params.tenantSlug)
    let row
    if (leadId) {
      // Prefix is caller-defined and can vary, so just take the trailing
      // digit run as the numeric id — works for any prefix scheme.
      const m = String(leadId).match(/(\d+)$/)
      if (!m) return res.status(400).json({ error: 'leadId must end in the numeric lead id, e.g. CULDAI26000123.' })
      const r = await pool.query('SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1;', [parseInt(m[1], 10), tenantId])
      row = r.rows[0]
    } else if (mobile) {
      const r = await pool.query('SELECT * FROM leads WHERE mobile = $1 AND tenant_id = $2 LIMIT 1;', [mobile, tenantId])
      row = r.rows[0]
    } else {
      const r = await pool.query('SELECT * FROM leads WHERE LOWER(email) = LOWER($1) AND tenant_id = $2 LIMIT 1;', [email, tenantId])
      row = r.rows[0]
    }
    if (!row) {
      console.log(`[Public Inquiry Lookup] NOT FOUND 404 — tenant=${tenantId}`)
      return res.status(404).json({ error: 'No matching lead found.' })
    }

    const refPrefix = row.lead_ref_prefix || (row.source_type === 'sm' ? 'CULDSM26' : 'CULDAI26')
    console.log(`[Public Inquiry Lookup] SUCCESS 200 — found lead id=${row.id} in tenant=${tenantId}`)
    res.json({
      lead: {
        id: row.id,
        leadId: `${refPrefix}${String(row.id).padStart(4, '0')}`,
        name: row.name,
        email: row.email,
        mobile: row.mobile,
        state: row.state,
        city: row.city,
        course: row.course,
        source: row.source,
        stage: row.stage,
        score: row.score,
        owner: row.owner,
        regDate: row.reg_date,
      }
    })
  } catch (err) {
    console.error('[Public Inquiry Lookup]', err)
    res.status(500).json({ error: 'Lookup failed.' })
  }
})

// Shared-secret key for the payment-status webhook below — this mutates real
// payment/application records (can mark someone as Paid), so unlike the
// create-inquiry endpoint it is never left open. Override via PAYMENT_API_KEY.
const PAYMENT_API_KEY = process.env.PAYMENT_API_KEY || 'k8iCUeu-kLVMgaHXdxtpU7LzBIZICQUh'

// Common external-gateway status strings -> this CRM's own vocabulary.
// Unrecognized values are passed through as-is (still recorded, just not normalized).
const PAY_STATUS_MAP = {
  success: 'Paid', successful: 'Paid', completed: 'Paid', paid: 'Paid', captured: 'Paid', approved: 'Paid',
  failed: 'Failed', failure: 'Failed', declined: 'Failed', cancelled: 'Failed', canceled: 'Failed',
  pending: 'Payment Pending', initiated: 'Payment Pending', processing: 'Payment Pending', created: 'Payment Pending',
}

// Record/update a payment for an application found by mobile number, and
// reflect its status onto the application's overall pay_status. Multiple
// payments per application are supported by design (the `payments` table has
// no uniqueness constraint on app_no) — each distinct paymentId is its own
// row; resubmitting the same paymentId updates that row instead of
// duplicating it (safe for webhook retries). Requires header: X-API-Key.
app.post('/api/public/payments/:tenantSlug?/status', async (req, res) => {
  console.log(`[Public Payment Status] HIT tenantSlug=${req.params.tenantSlug || '(default)'} mobile=${req.body?.mobile || '?'} paymentId=${req.body?.paymentId || '?'} status=${req.body?.status || '?'} amount=${req.body?.amount ?? '?'} keyProvided=${!!req.headers['x-api-key']}`)
  if (req.headers['x-api-key'] !== PAYMENT_API_KEY) {
    console.log(`[Public Payment Status] REJECTED 401 — bad or missing X-API-Key`)
    return res.status(401).json({ error: 'Missing or invalid X-API-Key.' })
  }
  const { mobile, paymentId, status, amount } = req.body
  if (!mobile || !paymentId || !status) {
    return res.status(400).json({ error: 'mobile, paymentId, and status are required.' })
  }
  const normalizedStatus = PAY_STATUS_MAP[String(status).toLowerCase().trim()] || String(status).trim()
  try {
    const tenantId = await resolveSlugTenant(req.params.tenantSlug)
    const appRes = await pool.query(
      'SELECT id, app_no, name FROM applications WHERE mobile = $1 AND tenant_id = $2 ORDER BY id DESC LIMIT 1;',
      [mobile, tenantId]
    )
    const app = appRes.rows[0]
    if (!app) {
      console.log(`[Public Payment Status] NOT FOUND 404 — no application for mobile=${mobile} in tenant=${tenantId}`)
      return res.status(404).json({ error: 'No application found for this mobile number in this tenant.' })
    }

    const amt = amount !== undefined ? (parseInt(amount, 10) || 0) : 0
    const dateStr = new Date().toLocaleDateString('en-IN')

    const existing = await pool.query(
      'SELECT id FROM payments WHERE txn_id = $1 AND app_no = $2 AND tenant_id = $3 LIMIT 1;',
      [paymentId, app.app_no, tenantId]
    )
    let paymentRow
    if (existing.rows[0]) {
      const r = await pool.query(`
        UPDATE payments SET status = $1, amount = $2, date = $3
        WHERE id = $4 AND tenant_id = $5
        RETURNING id, name, app_no AS "appNo", amount, status, date, txn_id AS "txnId";
      `, [normalizedStatus, amt, dateStr, existing.rows[0].id, tenantId])
      paymentRow = r.rows[0]
    } else {
      const r = await pool.query(`
        INSERT INTO payments (name, app_no, amount, method, status, date, txn_id, tenant_id)
        VALUES ($1, $2, $3, 'Online', $4, $5, $6, $7)
        RETURNING id, name, app_no AS "appNo", amount, status, date, txn_id AS "txnId";
      `, [app.name, app.app_no, amt, normalizedStatus, dateStr, paymentId, tenantId])
      paymentRow = r.rows[0]
    }

    // Overall application status always reflects this latest payment update.
    await pool.query('UPDATE applications SET pay_status = $1 WHERE app_no = $2 AND tenant_id = $3;', [normalizedStatus, app.app_no, tenantId])

    if (normalizedStatus === 'Paid') {
      // Also flip the lead's own stage to "Payment Success" — this is what
      // actually drives the badge/stage shown in Lead Manager, Lead Journey,
      // and the Dashboard's Payment Success count; pay_status on the
      // application alone doesn't touch any of those.
      await pool.query(
        `UPDATE leads SET stage = 'Payment Success', stage_color = 'emerald' WHERE mobile = $1 AND tenant_id = $2;`,
        [mobile, tenantId]
      )
      await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1,$2,$3);',
        [`Payment received: ₹${amt.toLocaleString('en-IN')} — ${app.app_no} (${app.name})`, 'Just now', tenantId]).catch(() => {})
    }

    console.log(`[Public Payment Status] SUCCESS 200 — appNo=${app.app_no} status=${normalizedStatus} amount=${amt} tenant=${tenantId}`)
    res.json({ message: 'Payment status updated.', payment: paymentRow, overallPayStatus: normalizedStatus })
  } catch (err) {
    console.error('[Public Payment Status]', err)
    res.status(500).json({ error: 'Failed to update payment status.' })
  }
})

// --- FEATURE 11: PAYMENT LINK GENERATOR ---
app.post('/api/payments/generate-link', async (req, res) => {
  const { appNo, name, email, mobile, amount, method, paymentId } = req.body
  if (!appNo) return res.status(400).json({ error: 'Application number required.' })

  try {
    const integCfg = req.body.razorpayConfig || {}
    const keyId = integCfg.keyId || process.env.RAZORPAY_KEY_ID
    const keySecret = integCfg.keySecret || process.env.RAZORPAY_KEY_SECRET

    let paymentLink = null
    if (keyId && keySecret) {
      // Create Razorpay payment link
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
      const rpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: (amount || 25000) * 100, // paise
          currency: 'INR',
          description: `CUTM Admission Fee — ${appNo}`,
          customer: { name, email, contact: mobile },
          notify: { sms: true, email: true },
          reference_id: appNo,
          expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 // 7 days
        })
      })
      if (rpRes.ok) {
        const rpData = await rpRes.json()
        paymentLink = rpData.short_url
      }
    }

    // Fallback: generate a demo link
    if (!paymentLink) {
      paymentLink = `https://pay.cutmap.ac.in/${appNo}?amount=${amount || 25000}&name=${encodeURIComponent(name || '')}`
    }

    // Update payment record — scope by id when given, since one app_no can
    // now carry two payment rows (application fee + semester fee)
    if (paymentId) {
      await pool.query("UPDATE payments SET method = $1, status = 'Link Sent' WHERE id = $2;", [method || 'Online', paymentId])
    } else {
      await pool.query("UPDATE payments SET method = $1, status = 'Link Sent' WHERE app_no = $2;", [method || 'Online', appNo])
    }
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Payment link generated for ${appNo}: ₹${(amount || 25000).toLocaleString('en-IN')}`, 'Just now'])

    res.json({ success: true, paymentLink, appNo, amount: amount || 25000 })
  } catch (err) {
    console.error('[Pay Link]', err)
    res.status(500).json({ error: 'Failed to generate payment link.' })
  }
})

// --- FEATURE 12 & 13: EXCEL PREVIEW / COLUMN MAPPER + DUPLICATE DETECTION ---
app.post('/api/leads/preview-upload', authenticateToken, (req, res, next) => {
  uploadBulk.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Preview Upload] Multer error:', err.message)
      return res.status(400).json({ error: err.message || 'File upload failed.' })
    }
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Make sure you are sending a CSV or Excel file.' })
  const filePath = req.file.path
  try {
    let workbook
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true, raw: false })
    } catch (xlsxErr) {
      console.error('[Preview Upload] XLSX parse error:', xlsxErr.message, '| file:', filePath)
      return res.status(400).json({ error: `Could not read file: ${xlsxErr.message}. Ensure it is a valid .csv, .xlsx, or .xls file.` })
    }

    const sheetName = workbook.SheetNames[0]
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
    if (!rawData || rawData.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty or has no data rows.' })

    const headers = Object.keys(rawData[0])
    const preview = rawData.slice(0, 5)

    // Auto-detect column mapping
    const autoMap = {}
    const fieldPatterns = {
      name:   /name|student|full.?name/i,
      email:  /email|mail/i,
      mobile: /mobile|phone|contact|number|mob|msisdn|cell|whatsapp/i,
      state:  /state|province/i,
      city:   /city|district|town|location/i,
      course: /course|program|stream/i,
      source: /source|channel|medium/i,
    }
    for (const h of headers) {
      for (const [field, pattern] of Object.entries(fieldPatterns)) {
        if (pattern.test(h) && !autoMap[field]) autoMap[field] = h
      }
    }

    // Duplicate detection (sample first 20 rows)
    const mobileCol = autoMap.mobile || headers.find(h => /mobile|phone|mob|msisdn|cell|contact|whatsapp/i.test(h))
    const sampleMobiles = rawData.slice(0, 20)
      .map(r => String(r[mobileCol] || '').replace(/\D/g, ''))
      .filter(m => m.length >= 10)

    let duplicateCount = 0
    if (sampleMobiles.length > 0) {
      const placeholders = sampleMobiles.map((_, i) => `$${i+1}`).join(',')
      const dupRes = await pool.query(`SELECT COUNT(*) FROM leads WHERE mobile IN (${placeholders});`, sampleMobiles)
      duplicateCount = parseInt(dupRes.rows[0].count)
    }
    const estimatedDupRate = rawData.length > 0
      ? ((duplicateCount / Math.min(20, rawData.length)) * 100).toFixed(0)
      : 0

    res.json({ headers, preview, totalRows: rawData.length, autoMap, duplicateCount, estimatedDupRate: parseFloat(estimatedDupRate) })
  } catch (err) {
    console.error('[Preview Upload] Unexpected error:', err)
    res.status(500).json({ error: `Server error: ${err.message}` })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

// Enhanced bulk upload with column mapping + skip/update duplicates
app.post('/api/leads/bulk-upload-mapped', authenticateToken, (req, res, next) => {
  uploadBulk.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Bulk Upload] Multer error:', err.message)
      return res.status(400).json({ error: err.message || 'File upload failed.' })
    }
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const filePath = req.file.path
  let columnMap = {}
  try { columnMap = JSON.parse(req.body.columnMap || '{}') } catch {}
  const dupHandling = req.body.dupHandling || 'skip'

  try {
    let workbook
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true, raw: false })
    } catch (xlsxErr) {
      console.error('[Bulk Upload] XLSX parse error:', xlsxErr.message)
      return res.status(400).json({ error: `Could not read file: ${xlsxErr.message}` })
    }
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })

    // Who is uploading?
    const uploaderRole = req.body.uploaderRole || 'Admin'
    const uploaderName = req.body.uploaderName || ''
    // Anyone who isn't Admin/Manager is a restricted user who claims their own
    // uploads (matches the lead-visibility scoping in GET /api/leads). This is
    // robust to role-name variants like 'Counsellor'/'Telecaller'/case diffs.
    const isCounselor  = !['Admin', 'Manager'].includes(uploaderRole) && !!uploaderName

    // Admin's choice: 'round_robin' (default) or 'specific'
    const assignMode    = (req.body.assignMode || 'round_robin').toLowerCase()
    const assignedTo    = req.body.assignedTo || ''  // counselor name when assignMode = 'specific'

    // Whether this upload has an explicit owner to assign every row to:
    //  - a counselor uploading claims their own leads, OR
    //  - an admin explicitly chose "assign to specific counselor".
    const explicitAssignee = isCounselor
      ? (uploaderName || '')
      : (assignMode === 'specific' && assignedTo ? assignedTo : '')

    const getNextOwner = async () => {
      // Counsellor uploading → their leads; admin "specific" → chosen counselor.
      if (explicitAssignee) return explicitAssignee
      // Admin round-robin → auto-assign to next counselor
      if (assignMode === 'round_robin') {
        return await getNextAssignee(req.tenantId)
      }
      // Default → stay Unassigned
      return 'Unassigned'
    }
    // Keep the original anonymous fn signature for backward compat below
    const SM_SOURCES = ['facebook', 'google ads', 'linkedin', 'instagram', 'whatsapp', 'sm', 'social']

    const client = await pool.connect()
    let imported = 0, skipped = 0, updated = 0
    const assignmentCounts = {}
    const skipReasons = []   // sample of why rows were skipped (max 5)
    try {
      await client.query('BEGIN')
      for (let rowNum = 0; rowNum < rawData.length; rowNum++) {
        const row = rawData[rowNum]
        const name   = String(row[columnMap.name]   || row.Name   || row.name   || '').trim().substring(0, 100)
        const email  = String(row[columnMap.email]  || row.Email  || row.email  || `lead_${Date.now()}@noemail.com`).substring(0, 100)
        const mobile = String(row[columnMap.mobile] || row.Mobile || row.mobile || '').replace(/\D/g, '').substring(0, 50)
        const state  = String(row[columnMap.state]  || row.State  || row.state  || '').substring(0, 100)
        const city   = String(row[columnMap.city]   || row.City   || row.city   || '').substring(0, 100)
        const course = String(row[columnMap.course] || row.Course || row.course || '').substring(0, 100)

        // ── VALIDATION — reject junk rows (course-as-name, no mobile, etc.) ──
        const validMobile = mobile.length >= 10
        const COURSE_RX = /^(m\.?\s?sc|b\.?\s?sc|b\.?\s?tech|m\.?\s?tech|mba|bba|bca|mca|b\.?\s?com|m\.?\s?com|ph\.?d|diploma|b\.?\s?a\b|m\.?\s?a\b|llb|llm|b\.?pharm|pharm|nursing|genetics|genomics)/i
        const nameLooksLikeCourse = COURSE_RX.test(name)
        const nameTooShort = name.replace(/[^a-zA-Z]/g, '').length < 3
        const nameMissing = !name || name.toLowerCase() === 'unnamed' || name.toLowerCase() === 'na'

        if (nameMissing || nameTooShort || nameLooksLikeCourse || !validMobile) {
          skipped++
          if (skipReasons.length < 8) {
            let why = []
            if (nameMissing)        why.push('name is empty')
            if (nameTooShort && !nameMissing) why.push('name too short')
            if (nameLooksLikeCourse) why.push(`"${name}" looks like a course, not a person`)
            if (!validMobile)       why.push('mobile is missing/invalid (<10 digits)')
            skipReasons.push(`Row ${rowNum + 2}: ${why.join(' · ')}`)
          }
          continue
        }
        // Source: 'SM' → Social Media, 'AI'/blank → Admin Import, anything else is
        // kept as-is so real labels (Meta, Google Ads, Website…) survive the import.
        const rawSrc = String(row[columnMap.source] || row.Source || row.source || 'AI').trim()
        const upperSrc = rawSrc.toUpperCase()
        const source = upperSrc === 'SM' ? 'Social Media'
                     : (upperSrc === 'AI' || rawSrc === '') ? 'Admin Import'
                     : rawSrc
        const socialList = ['meta', 'facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'telegram', 'social media']
        const sourceType = (upperSrc === 'SM' || socialList.includes(source.toLowerCase())) ? 'sm' : 'ai'
        const score  = calculateLeadScore({ source, stage: 'Untouched', mobile, email, course })
        const owner  = await getNextOwner()
        assignmentCounts[owner] = (assignmentCounts[owner] || 0) + 1

        const dup = await client.query('SELECT id, name, mobile, email FROM leads WHERE (mobile = $1 OR LOWER(email) = LOWER($2)) AND tenant_id = $3 LIMIT 1;', [mobile, email, req.tenantId])
        if (dup.rows.length > 0) {
          if (dupHandling === 'skip') {
            // "Specific Counsellor" (or a counselor self-upload) promises to assign
            // ALL rows in this file to that person — so reassign the matched lead's
            // owner even under Skip (owner only; don't touch other fields).
            if (explicitAssignee) {
              await client.query('UPDATE leads SET owner=$1 WHERE id=$2 AND tenant_id=$3;', [explicitAssignee, dup.rows[0].id, req.tenantId])
              updated++
              continue
            }
            skipped++
            // Capture reason for first 5 skipped rows so user knows what happened
            if (skipReasons.length < 5) {
              const matchedOn = dup.rows[0].mobile === mobile ? `mobile ${mobile}` : `email ${email}`
              skipReasons.push(`Row ${rowNum + 1}: "${name}" matches existing lead #${dup.rows[0].id} ("${dup.rows[0].name}") on ${matchedOn}`)
            }
            continue
          }
          if (dupHandling === 'update') {
            if (explicitAssignee) {
              // Counselor self-claim, or admin's chosen counselor → reassign the matched lead
              await client.query('UPDATE leads SET name=$1, course=$2, source=$3, score=$4, source_type=$5, owner=$6 WHERE id=$7 AND tenant_id=$8;',
                [name, course, source, score, sourceType, explicitAssignee, dup.rows[0].id, req.tenantId])
            } else {
              // Admin round-robin/default → update fields but keep existing owner (don't unassign)
              await client.query('UPDATE leads SET name=$1, course=$2, source=$3, score=$4, source_type=$5 WHERE id=$6 AND tenant_id=$7;',
                [name, course, source, score, sourceType, dup.rows[0].id, req.tenantId])
            }
            updated++; continue
          }
        }
        const leadSource = isCounselor ? 'counselor_upload' : (source?.toLowerCase().includes('facebook') ? 'facebook' : 'form')
        await client.query(`
          INSERT INTO leads (name, email, mobile, state, city, course, source, source_type, owner, reg_date, score, stage, stage_color, lead_source, tenant_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Untouched','red',$12,$13);
        `, [name, email, mobile, state, city, course, source, sourceType, owner,
            new Date().toLocaleString('en-IN', { hour12: true }), score, leadSource, req.tenantId])
        imported++
      }
      await client.query('COMMIT')

      // NO AUTO-ASSIGN: Don't update assignment counters or send emails
      // Leads stay Unassigned until manually assigned by admin/manager

      // Notify admins about the import
      const assignNote = explicitAssignee
        ? `assigned to ${explicitAssignee}`
        : 'remain Unassigned (manual assignment required)'
      await pool.query('INSERT INTO notifications (text, time) VALUES ($1,$2);',
        [`Bulk upload by ${uploaderName || 'Unknown'}: ${imported} imported · ${skipped} skipped · ${updated} updated · leads ${assignNote}`, 'Just now'])

      // Audit log — who uploaded, when, and the outcome (no PII beyond names already in CRM)
      try {
        await pool.query(
          `INSERT INTO upload_logs (uploader_name, uploader_role, file_name, total_rows, imported, skipped, updated, dup_handling, assign_mode, assigned_to)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
          [uploaderName || 'Unknown', uploaderRole || '', req.file?.originalname || '', rawData.length,
           imported, skipped, updated, dupHandling, assignMode, explicitAssignee || '']
        )
      } catch (logErr) {
        console.error('[Upload Log] failed to record audit row:', logErr.message)
      }
      // Generate a helpful hint if everything was skipped
      let hint = null
      if (skipped === rawData.length && imported === 0) {
        hint = '⚠️ All rows skipped because they match existing leads. Either:\n' +
               '  • The file contains leads already in CRM, OR\n' +
               '  • Choose "Update existing" or "Import all" on the duplicate-handling option, OR\n' +
               '  • Admin can wipe leads via Settings → Production Reset before re-importing'
      } else if (skipped > rawData.length * 0.5) {
        hint = `Over 50% of rows skipped (${skipped}/${rawData.length}). Consider switching duplicate handling to "Update existing" if these are intentional re-uploads.`
      }
      res.json({ success: true, imported, skipped, updated, total: rawData.length, assignments: assignmentCounts, skipReasons, hint })
    } catch (dbErr) {
      await client.query('ROLLBACK')
      throw dbErr
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[Bulk Mapped]', err)
    res.status(500).json({ error: err.message || 'Bulk upload failed.' })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

// GET /api/upload-logs — bulk-upload audit trail (Admin/Manager only)
app.get('/api/upload-logs', authenticateToken, async (req, res) => {
  try {
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin/Manager only.' })
    }
    const r = await pool.query(`
      SELECT id, uploader_name AS "uploaderName", uploader_role AS "uploaderRole",
             file_name AS "fileName", total_rows AS "totalRows", imported, skipped, updated,
             dup_handling AS "dupHandling", assign_mode AS "assignMode",
             assigned_to AS "assignedTo", created_at AS "createdAt"
      FROM upload_logs ORDER BY created_at DESC LIMIT 200;
    `)
    res.json(r.rows)
  } catch (err) {
    console.error('[Upload Logs]', err.message)
    res.status(500).json({ error: 'Failed to fetch upload logs.' })
  }
})

// Shared: map a free-text call status (with the sheet's typos) → canonical stage.
// Order matters — more specific phrases first.
function mapCallStatus(s) {
  const x = String(s || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!x) return null
  if (x.includes('admission') || x.includes('confirmed') || x.includes('enrol') || x.includes('paymentsuccess')) return 'Payment Success'
  if ((x.includes('campus') || x.includes('visit')) && x.includes('complet'))    return 'Campus Visit Completed'
  if (x.includes('campus') || x.includes('visit'))                 return 'Campus Visit Scheduled'
  if (x.includes('notcalled'))                                     return 'Untouched'       // Not Called
  if (x.includes('wrongnumber') || x.includes('invalidnumber'))    return 'Invalid Number'  // Wrong Number
  if (x.includes('notinter'))                                      return 'Not Interested'  // Not Interested / Not Internsted
  if (x.includes('furthertalk') || x.includes('followup') || x.includes('callback')) return 'Follow Up'
  if (x.includes('notreachable') || x.includes('noanswer') || x.includes('noresponse') ||
      x.includes('notconnected') || x.includes('notlifting') ||
      x.includes('busy') || x.includes('switchedoff'))             return 'No Response'     // Not Reachable / not lifting
  if (x.includes('paymentsuccess'))                                return 'Payment Success'
  if (x.includes('processforpayment') || x.includes('payment'))    return 'Process for Payment'
  if (x.includes('contacted'))                                     return 'Contacted'
  if (x.includes('inter'))                                         return 'Interested'      // Interested / Intersted (after notinter)
  return null
}
const CALL_STAGE_COLOR = {
  'Contacted':'blue','No Response':'gray','Not Interested':'red','Follow Up':'purple',
  'Interested':'green','Campus Visit Scheduled':'cyan','Campus Visit Completed':'cyan',
  'Process for Payment':'orange','Payment Success':'emerald','Admission Confirmed':'emerald',
  'Invalid Number':'red','Untouched':'red'
}

// Strict mobile validation/normalisation. Returns a clean 10-digit number or
// null. Rejects malformed/placeholder numbers (wrong length, not starting 6-9,
// or 6+ repeated digits like 9304000000 / 9999999999).
function normalizeMobile(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  let ten
  if (d.length === 10) ten = d
  else if (d.length === 11 && d.startsWith('0')) ten = d.slice(1)
  else if (d.length === 12 && d.startsWith('91')) ten = d.slice(2)
  else return null                       // wrong length
  if (!/^[6-9]\d{9}$/.test(ten)) return null   // must start 6-9, be 10 digits
  if (/(\d)\1{5,}/.test(ten)) return null      // 6+ repeated digits → fake/placeholder
  return ten
}

// POST /api/leads/call-outcomes-upload — counselor end-of-day call results.
// Excel/CSV with Name, Mobile, Status columns. Matches by mobile → updates the
// lead's stage if it exists, else creates a new lead with that stage.
app.post('/api/leads/call-outcomes-upload', (req, res, next) => {
  uploadBulk.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'File upload failed.' })
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const filePath = req.file.path
  try {
    let workbook
    try { workbook = XLSX.readFile(filePath, { cellDates: true, raw: false }) }
    catch (e) { return res.status(400).json({ error: `Could not read file: ${e.message}` }) }
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
    if (!rawData.length) return res.status(400).json({ error: 'File is empty.' })

    const uploaderRole = req.body.uploaderRole || 'Admin'
    const uploaderName = req.body.uploaderName || ''
    const isCounselor  = !['Admin', 'Manager'].includes(uploaderRole) && !!uploaderName

    const mapStatus = mapCallStatus
    const stageColor = CALL_STAGE_COLOR

    // Auto-detect columns (statusCol must not grab the REMARKS column)
    const headers = Object.keys(rawData[0])
    const find = (re) => headers.find(h => re.test(h))
    const nameCol      = find(/name/i)
    const mobileCol    = find(/mobile|phone|mob|contact|number/i)
    const statusCol    = find(/status|outcome|disposition|result/i)
    const facultyCol   = find(/faculty|staff|called|caller/i)   // "FACULTY/STAFF NAME WHO CALLED" → owner
    const followDateCol= find(/follow.*date|next.*date|reminder|callback.*date/i)
    if (!mobileCol || !statusCol) {
      return res.status(400).json({ error: 'File must include a Mobile column and a Status column.' })
    }

    const client = await pool.connect()
    let updated = 0, created = 0, skipped = 0
    const skipReasons = [], warnings = []
    try {
      await client.query('BEGIN')
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i]
        const name    = String(row[nameCol] || '').trim().substring(0, 100)
        const mobile  = normalizeMobile(row[mobileCol])
        const stage   = mapStatus(row[statusCol])
        // Faculty who called → becomes the owner (drives CUTM/CUTMAP via their email domain)
        const faculty = facultyCol ? String(row[facultyCol] || '').trim().substring(0, 100) : ''
        // Follow-up date only relevant when stage is Follow Up
        const fuRaw   = followDateCol ? String(row[followDateCol] || '').trim() : ''
        const fuDate  = stage === 'Follow Up' ? fuRaw : ''

        if (!mobile) {
          skipped++; if (skipReasons.length < 8) skipReasons.push(`Row ${i + 2}: invalid mobile "${row[mobileCol]}"`); continue
        }
        if (!stage) {
          skipped++; if (skipReasons.length < 8) skipReasons.push(`Row ${i + 2}: unrecognized status "${row[statusCol]}"`); continue
        }
        if (stage === 'Follow Up' && !fuRaw && warnings.length < 8) {
          warnings.push(`Row ${i + 2}: Follow Up has no follow-up date`)
        }
        const color = stageColor[stage] || 'blue'
        // Resolve the owner this row should land on (faculty wins; else counselor self)
        const targetOwner = faculty || (isCounselor ? uploaderName : '')

        const dup = await client.query('SELECT id, owner FROM leads WHERE mobile = $1 OR mobile = $2 LIMIT 1;', [mobile, `91${mobile}`])
        if (dup.rows.length > 0) {
          // Reassign owner only when we have one; otherwise keep the existing owner.
          await client.query(
            'UPDATE leads SET stage=$1, stage_color=$2, owner=COALESCE($3, owner), follow_up_date=$4 WHERE id=$5;',
            [stage, color, targetOwner || null, fuDate, dup.rows[0].id]
          )
          updated++
        } else {
          await client.query(
            `INSERT INTO leads (name, email, mobile, source, source_type, owner, reg_date, score, stage, stage_color, lead_source, follow_up_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);`,
            [name || 'Unknown', `lead_${Date.now()}_${i}@noemail.com`, mobile, 'Call Upload', 'ai',
             targetOwner || 'Unassigned', new Date().toLocaleString('en-IN', { hour12: true }), 10, stage, color,
             isCounselor ? 'counselor_upload' : 'call_upload', fuDate]
          )
          created++
        }

        // Follow Up with a date → create a task/reminder for the counselor
        if (stage === 'Follow Up' && fuRaw) {
          await client.query(
            `INSERT INTO tasks (title, type, priority, due, status, assignee, lead) VALUES ($1,$2,$3,$4,$5,$6,$7);`,
            [`Follow up with ${name || mobile}`, 'Call', 'Medium', fuRaw, 'Pending', targetOwner || uploaderName || 'Unassigned', name || mobile]
          )
        }
      }
      await client.query('COMMIT')
    } catch (dbErr) {
      await client.query('ROLLBACK'); throw dbErr
    } finally {
      client.release()
    }

    // Audit + notify
    try {
      await pool.query(
        `INSERT INTO upload_logs (uploader_name, uploader_role, file_name, total_rows, imported, skipped, updated, dup_handling, assign_mode, assigned_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
        [uploaderName || 'Unknown', uploaderRole || '', req.file?.originalname || '', rawData.length,
         created, skipped, updated, 'call-outcomes', facultyCol ? 'by-faculty' : (isCounselor ? 'self' : ''), '']
      )
    } catch (e) { console.error('[Call Outcomes] audit log failed:', e.message) }
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1,$2);',
      [`Call outcomes upload by ${uploaderName || 'Unknown'}: ${updated} updated · ${created} created · ${skipped} skipped`, 'Just now'])

    res.json({ success: true, updated, created, skipped, total: rawData.length, skipReasons, warnings,
               ownerFromFaculty: !!facultyCol, followDateDetected: !!followDateCol })
  } catch (err) {
    console.error('[Call Outcomes]', err)
    res.status(500).json({ error: err.message || 'Call outcomes upload failed.' })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

// POST /api/leads/workbook-import — ingest the whole Admission Dashboard workbook.
// Each SHEET = a program (course). Per row: owner = faculty who called, stage =
// mapped STATUS, source = Lead Source. Match by mobile → update, else create.
app.post('/api/leads/workbook-import', authenticateToken, (req, res, next) => {
  uploadBulk.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'File upload failed.' })
    next()
  })
}, async (req, res) => {
  if (!['Admin', 'Manager'].includes(req.user.role)) return res.status(403).json({ error: 'Admin/Manager only.' })
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
  const filePath = req.file.path
  try {
    let workbook
    try { workbook = XLSX.readFile(filePath, { cellDates: true, raw: false }) }
    catch (e) { return res.status(400).json({ error: `Could not read file: ${e.message}` }) }

    const client = await pool.connect()
    let totalUpdated = 0, totalCreated = 0, totalSkipped = 0
    const perSheet = []
    try {
      await client.query('BEGIN')
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
        if (!rows.length) { perSheet.push({ program: sheetName, updated: 0, created: 0, skipped: 0, empty: true }); continue }
        const headers = Object.keys(rows[0])
        const find = (re) => headers.find(h => re.test(h))
        const nameCol   = find(/full.?name|name/i)
        const mobileCol = find(/mobile|phone|mob|contact|number/i)
        const statusCol = find(/^status$|status|outcome|disposition/i)
        const facultyCol= find(/faculty.*name|staff.*name|who.*called|caller/i)
        const sourceCol = find(/lead.?source|source/i)
        let u = 0, c = 0, s = 0
        if (!mobileCol || !statusCol) { perSheet.push({ program: sheetName, updated: 0, created: 0, skipped: rows.length, error: 'no mobile/status column' }); totalSkipped += rows.length; continue }

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const name    = String(row[nameCol] || '').trim().substring(0, 100)
          const mobile  = normalizeMobile(row[mobileCol])
          const stage   = mapCallStatus(row[statusCol])
          const faculty = facultyCol ? String(row[facultyCol] || '').trim().substring(0, 100) : ''
          const source  = sourceCol ? String(row[sourceCol] || '').trim().substring(0, 100) : 'Admission Workbook'
          if (!mobile || !stage) { s++; continue }
          const color = CALL_STAGE_COLOR[stage] || 'blue'
          // Skip faculty values that are clearly not names (e.g. date serials from a misaligned sheet)
          const owner = (faculty && !/^\d+(\.\d+)?$/.test(faculty)) ? faculty : null

          const dup = await client.query('SELECT id FROM leads WHERE mobile = $1 OR mobile = $2 LIMIT 1;', [mobile, `91${mobile}`])
          if (dup.rows.length > 0) {
            await client.query(
              'UPDATE leads SET stage=$1, stage_color=$2, owner=COALESCE($3, owner), program=$4, source=COALESCE($5, source) WHERE id=$6;',
              [stage, color, owner, sheetName, source || null, dup.rows[0].id]
            )
            u++
          } else {
            await client.query(
              `INSERT INTO leads (name, email, mobile, source, source_type, owner, reg_date, score, stage, stage_color, lead_source, program)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);`,
              [name || 'Unknown', `lead_${Date.now()}_${i}@noemail.com`, mobile, source || 'Admission Workbook', 'ai',
               owner || 'Unassigned', new Date().toLocaleString('en-IN', { hour12: true }), 10, stage, color, 'workbook_import', sheetName]
            )
            c++
          }
        }
        perSheet.push({ program: sheetName, updated: u, created: c, skipped: s })
        totalUpdated += u; totalCreated += c; totalSkipped += s
      }
      await client.query('COMMIT')
    } catch (dbErr) {
      await client.query('ROLLBACK'); throw dbErr
    } finally {
      client.release()
    }

    try {
      await pool.query(
        `INSERT INTO upload_logs (uploader_name, uploader_role, file_name, total_rows, imported, skipped, updated, dup_handling, assign_mode, assigned_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
        [req.user.email || 'Unknown', req.user.role || '', req.file?.originalname || '', totalUpdated + totalCreated + totalSkipped,
         totalCreated, totalSkipped, totalUpdated, 'workbook', 'by-faculty', '']
      )
    } catch (e) { console.error('[Workbook] audit failed:', e.message) }
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1,$2);',
      [`Admission workbook imported: ${totalUpdated} updated · ${totalCreated} created · ${totalSkipped} skipped across ${perSheet.length} programs`, 'Just now'])

    res.json({ success: true, updated: totalUpdated, created: totalCreated, skipped: totalSkipped, perSheet })
  } catch (err) {
    console.error('[Workbook Import]', err)
    res.status(500).json({ error: err.message || 'Workbook import failed.' })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

// GET /api/reports/call-activity — per-counselor lead counts by stage (Admin/Manager).
// Clickable in the UI → drills into the leads behind each count.
app.get('/api/reports/call-activity', authenticateToken, async (req, res) => {
  if (!['Admin', 'Manager'].includes(req.user.role)) return res.status(403).json({ error: 'Admin/Manager only.' })
  const byProgram = (req.query.groupBy === 'program')
  try {
    // Group either by counselor (owner) or by program (sheet/school).
    const r = byProgram
      ? await pool.query(`
          SELECT program AS key, stage, COUNT(*)::int AS count
          FROM leads
          WHERE program IS NOT NULL AND program <> '' AND tenant_id = $1
          GROUP BY program, stage ORDER BY program;`, [req.tenantId])
      : await pool.query(`
          SELECT owner AS key, stage, COUNT(*)::int AS count
          FROM leads
          WHERE owner IS NOT NULL AND owner <> '' AND owner <> 'Unassigned' AND tenant_id = $1
          GROUP BY owner, stage ORDER BY owner;`, [req.tenantId])
    const map = {}
    for (const row of r.rows) {
      if (!map[row.key]) map[row.key] = { key: row.key, stages: {}, total: 0 }
      map[row.key].stages[row.stage] = row.count
      map[row.key].total += row.count
    }
    res.json(Object.values(map).sort((a, b) => b.total - a.total))
  } catch (err) {
    console.error('[Call Activity]', err.message)
    res.status(500).json({ error: 'Failed to build call activity report.' })
  }
})

// GET /api/reports/call-activity/leads?key=&stage=&groupBy= — drill-down for one cell
app.get('/api/reports/call-activity/leads', authenticateToken, async (req, res) => {
  if (!['Admin', 'Manager'].includes(req.user.role)) return res.status(403).json({ error: 'Admin/Manager only.' })
  const { key, owner, stage } = req.query
  const val = key || owner   // backward-compatible with old ?owner=
  const byProgram = (req.query.groupBy === 'program')
  if (!val || !stage) return res.status(400).json({ error: 'key and stage are required.' })
  try {
    const col = byProgram ? 'program' : 'owner'
    const r = await pool.query(`
      SELECT id, name, mobile, owner, program, stage, follow_up_date AS "followUpDate", reg_date AS "regDate"
      FROM leads WHERE ${col} = $1 AND stage = $2 AND tenant_id = $3
      ORDER BY id DESC LIMIT 500;
    `, [val, stage, req.tenantId])
    res.json(r.rows)
  } catch (err) {
    console.error('[Call Activity drill]', err.message)
    res.status(500).json({ error: 'Failed to fetch leads.' })
  }
})

// --- FEATURE 14: GOOGLE SHEETS AUTO-SYNC ---
// Shared sync routine — used by the manual endpoint and the 5-min cron.
// New leads are auto-assigned (round-robin) and the counsellor is alerted.
async function syncGoogleSheet({ sheetId, apiKey, autoAssign = true, tenantId = 1 } = {}) {
  const id  = String(sheetId || '').trim()
  const key = String(apiKey || process.env.GOOGLE_SHEETS_API_KEY || '').trim()
  if (!id)  return { error: 'Google Sheet ID required.' }
  if (!key) return { error: 'Google Sheets API key not configured.' }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/Sheet1!A1:Z1000?key=${encodeURIComponent(key)}`
  const sheetsRes = await fetch(url)
  if (!sheetsRes.ok) {
    const errText = await sheetsRes.text()
    return { error: `Google Sheets API error: ${errText.substring(0, 200)}` }
  }
  const sheetsData = await sheetsRes.json()
  const values = sheetsData.values || []
  if (values.length < 2) return { synced: 0, skipped: 0, total: 0, message: 'No data rows found.' }

  const headers = values[0].map(h => String(h).toLowerCase().trim())
  const rows = values.slice(1)
  let synced = 0, skipped = 0
  for (const row of rows) {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    const name = obj.name || obj['student name'] || obj['full name'] || 'Unnamed'
    const email = obj.email || obj['email id'] || `sheet_${Date.now()}@noemail.com`
    const mobile = (obj.mobile || obj.phone || obj['phone number'] || '0000000000').replace(/\D/g, '') || '0000000000'
    const course = obj.course || obj.program || 'B.Tech CSE'
    const source = obj.source || 'Google Sheets'

    if (mobile.length < 10) { skipped++; continue }
    const dup = await pool.query('SELECT id FROM leads WHERE mobile = $1 AND tenant_id = $2 LIMIT 1;', [mobile, tenantId])
    if (dup.rows.length > 0) { skipped++; continue }

    const score = calculateLeadScore({ source, stage: 'Untouched', mobile, email, course })
    const owner = autoAssign ? await getNextAssignee(tenantId) : 'Unassigned'
    const ins = await pool.query(
      `INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Untouched','red',$9) RETURNING id;`,
      [name.substring(0, 100), email.substring(0, 100), mobile.substring(0, 50), course.substring(0, 100), source.substring(0, 100), owner, new Date().toLocaleString('en-IN', { hour12: true }), score, tenantId]
    )
    if (autoAssign && owner && owner !== 'Unassigned') {
      await alertCounselor(owner, name, course, source, ins.rows[0].id, tenantId)
    }
    synced++
  }
  if (synced > 0) {
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);', [`Google Sheets sync: ${synced} new leads imported, ${skipped} skipped`, 'Just now', tenantId]).catch(() => {})
  }
  return { synced, skipped, total: rows.length }
}

app.post('/api/integrations/sheets-sync', async (req, res) => {
  // Ignore the masked placeholder coming from the UI — always fall back to the real stored key
  const bodySheet = (req.body.sheetId && req.body.sheetId !== SETTINGS_MASK) ? req.body.sheetId : null
  const bodyKey   = (req.body.apiKey  && req.body.apiKey  !== SETTINGS_MASK) ? req.body.apiKey  : null
  const sheetId = bodySheet || await getIntegrationSetting('sheets_spreadsheet_id')
  const apiKey  = bodyKey   || await getIntegrationSetting('sheets_api_key')
  if (!sheetId) return res.status(400).json({ error: 'Google Sheet ID required.' })
  try {
    const result = await syncGoogleSheet({ sheetId, apiKey, autoAssign: true, tenantId: req.tenantId })
    if (result.error) return res.status(400).json({ error: result.error })
    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[Sheets Sync]', err)
    res.status(500).json({ error: 'Google Sheets sync failed.' })
  }
})

// --- FEATURE 15: STUDENT APPLICATION PORTAL ---
app.post('/api/student/login', async (req, res) => {
  const { mobile, appNo } = req.body
  if (!mobile && !appNo) return res.status(400).json({ error: 'Mobile number or application number required.' })
  try {
    let appRes
    if (appNo) {
      appRes = await pool.query('SELECT id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", stage, course, campus, date FROM applications WHERE app_no = $1;', [appNo])
    } else {
      appRes = await pool.query('SELECT id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", stage, course, campus, date FROM applications WHERE mobile = $1;', [mobile])
    }
    if (appRes.rows.length === 0) return res.status(404).json({ error: 'No application found. Please check your details.' })
    const app = appRes.rows[0]
    // Get payment status
    const payRes = await pool.query('SELECT status, txn_id AS "txnId", amount, method, date FROM payments WHERE app_no = $1;', [app.appNo])
    // Get documents
    const docsRes = await pool.query('SELECT type, status, upload_date AS "uploadDate" FROM documents WHERE student = $1;', [app.name])
    res.json({ application: app, payment: payRes.rows[0] || null, documents: docsRes.rows })
  } catch (err) {
    console.error('[Student Login]', err)
    res.status(500).json({ error: 'Failed to retrieve application status.' })
  }
})

// --- FEATURE 16: CALL LOGS ---
app.get('/api/calls', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, lead_name AS "leadName", lead_mobile AS "leadMobile", counselor, duration, outcome, notes, called_at AS "calledAt" FROM call_logs WHERE tenant_id = $1 ORDER BY id DESC LIMIT 200;', [req.tenantId])
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch call logs.' })
  }
})

app.post('/api/calls', async (req, res) => {
  const { leadName, leadMobile, counselor, duration, outcome, notes } = req.body
  if (!leadMobile) return res.status(400).json({ error: 'Lead mobile required.' })
  try {
    const insertRes = await pool.query(`
      INSERT INTO call_logs (lead_name, lead_mobile, counselor, duration, outcome, notes, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, lead_name AS "leadName", lead_mobile AS "leadMobile", counselor, duration, outcome, notes, called_at AS "calledAt";
    `, [leadName, leadMobile, counselor, duration || '0:00', outcome || 'Called', notes || '', req.tenantId])

    // Update lead stage if connected
    if (outcome && outcome !== 'No Answer' && leadName) {
      await pool.query("UPDATE leads SET stage = CASE WHEN stage = 'Untouched' THEN 'Contacted' ELSE stage END, stage_color = CASE WHEN stage = 'Untouched' THEN 'blue' ELSE stage_color END WHERE name = $1 AND tenant_id = $2;", [leadName, req.tenantId])
    }

    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    console.error('[Call Log]', err)
    res.status(500).json({ error: 'Failed to log call.' })
  }
})

// --- FEATURE 17: MULTI-CAMPUS FILTER (stats by campus) ---
app.get('/api/campus/stats', async (req, res) => {
  try {
    const campusStats = await pool.query(`
      SELECT campus,
        COUNT(*) AS applications,
        SUM(CASE WHEN stage IN ('Enrolment', 'Enrolments') THEN 1 ELSE 0 END) AS enrolled,
        SUM(CASE WHEN pay_status = 'Payment Approved' OR pay_status = 'Approved' THEN 1 ELSE 0 END) AS paid
      FROM applications
      WHERE tenant_id = $1
      GROUP BY campus ORDER BY applications DESC;
    `, [req.tenantId])
    const CAMPUSES = ['Bhubaneswar', 'Vizianagaram', 'Paralakhemundi', 'Balasore']
    const result = CAMPUSES.map(name => {
      const row = campusStats.rows.find(r => r.campus === name) || {}
      return { campus: name, applications: parseInt(row.applications || 0), enrolled: parseInt(row.enrolled || 0), paid: parseInt(row.paid || 0) }
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Campus stats failed.' })
  }
})

// --- FEATURE 18: ADMISSION TARGET TRACKER ---
app.get('/api/targets', async (req, res) => {
  try {
    const targets = await pool.query('SELECT * FROM admission_targets ORDER BY year DESC, id DESC;')
    res.json(targets.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch targets.' })
  }
})

app.post('/api/targets', async (req, res) => {
  const { month, year, campus, targetLeads, targetApplications, targetEnrollments } = req.body
  if (!month || !year) return res.status(400).json({ error: 'Month and year required.' })
  try {
    const upsertRes = await pool.query(`
      INSERT INTO admission_targets (month, year, campus, target_leads, target_applications, target_enrollments)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (month, year, campus) DO UPDATE
      SET target_leads = $4, target_applications = $5, target_enrollments = $6
      RETURNING *;
    `, [month, parseInt(year), campus || 'All', targetLeads || 0, targetApplications || 0, targetEnrollments || 0])
    res.status(201).json(upsertRes.rows[0])
  } catch (err) {
    console.error('[Targets]', err)
    res.status(500).json({ error: 'Failed to save target.' })
  }
})

// Get current achievement vs target
app.get('/api/targets/achievement', async (req, res) => {
  try {
    const { month, year, campus } = req.query
    const m = month || new Date().toLocaleString('en-IN', { month: 'long' })
    const y = parseInt(year) || new Date().getFullYear()

    const targetRes = await pool.query('SELECT * FROM admission_targets WHERE month = $1 AND year = $2 AND campus = $3 LIMIT 1;', [m, y, campus || 'All'])
    const target = targetRes.rows[0] || { target_leads: 0, target_applications: 0, target_enrollments: 0 }

    const leadsCount = await pool.query('SELECT COUNT(*) FROM leads;')
    const appsCount = await pool.query('SELECT COUNT(*) FROM applications;')
    const enrolledCount = await pool.query("SELECT COUNT(*) FROM applications WHERE stage IN ('Enrolment','Enrolments');")

    res.json({
      month: m, year: y, campus: campus || 'All',
      targets: { leads: parseInt(target.target_leads), applications: parseInt(target.target_applications), enrollments: parseInt(target.target_enrollments) },
      achieved: { leads: parseInt(leadsCount.rows[0].count), applications: parseInt(appsCount.rows[0].count), enrollments: parseInt(enrolledCount.rows[0].count) }
    })
  } catch (err) {
    res.status(500).json({ error: 'Achievement query failed.' })
  }
})

// --- FEATURE 20: EMAIL CAMPAIGN BUILDER ---
app.get('/api/email-campaigns', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, subject, segment, status, sent_count AS "sentCount", open_count AS "openCount", click_count AS "clickCount", created_at AS "createdAt", sent_at AS "sentAt" FROM email_campaigns WHERE tenant_id = $1 ORDER BY id DESC;', [req.tenantId])
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email campaigns.' })
  }
})

app.post('/api/email-campaigns', async (req, res) => {
  const { name, subject, template, segment } = req.body
  if (!name || !subject) return res.status(400).json({ error: 'Campaign name and subject required.' })
  try {
    const insertRes = await pool.query(`
      INSERT INTO email_campaigns (name, subject, template, segment, status, tenant_id)
      VALUES ($1, $2, $3, $4, 'Draft', $5)
      RETURNING id, name, subject, segment, status, sent_count AS "sentCount", open_count AS "openCount", click_count AS "clickCount", created_at AS "createdAt";
    `, [name, subject, template || '', segment || 'All Leads', req.tenantId])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create email campaign.' })
  }
})

app.post('/api/email-campaigns/:id/send', async (req, res) => {
  const { id } = req.params
  try {
    const campRes = await pool.query('SELECT * FROM email_campaigns WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    if (!campRes.rows[0]) return res.status(404).json({ error: 'Campaign not found.' })
    const camp = campRes.rows[0]
    const segment = camp.segment || 'All Leads'

    // Build segment-aware query
    let segWhere = "email NOT LIKE '%noemail%' AND email != '' AND email IS NOT NULL"
    if (segment === 'Untouched Leads')      segWhere += " AND stage = 'Untouched'"
    else if (segment === 'Follow Up' || segment === 'Follow Up') segWhere += " AND stage = 'Follow Up'"
    else if (segment === 'Interested')      segWhere += " AND stage = 'Interested'"
    else if (segment === 'Not Interested')  segWhere += " AND stage = 'Not Interested'"
    // 'Process for Payment' segment matches both new and legacy 'Qualified Leads' rows
    else if (segment === 'Process for Payment' || segment === 'Qualified Leads')
                                            segWhere += " AND stage IN ('Process for Payment','Qualified Leads')"
    else if (segment === 'Payment Success' || segment === 'Converted')
                                            segWhere += " AND stage IN ('Payment Success','Converted')"
    else if (segment === 'Application Started') segWhere += " AND stage IN ('Application Started','Contacted','Follow Up')"
    else if (segment === 'Payment Pending') segWhere += " AND stage IN ('Payment Pending','Application Submitted','Payment Approved')"
    else if (segment === 'Hot Leads')       segWhere += " AND score >= 75"

    const leadsRes = await pool.query(`SELECT email, name FROM leads WHERE ${segWhere} AND tenant_id = $1;`, [req.tenantId])
    const recipients = leadsRes.rows
    let sentCount = 0, failedCount = 0

    // Delete previous logs for this campaign (re-send scenario)
    await pool.query('DELETE FROM email_logs WHERE campaign_id = $1 AND tenant_id = $2;', [id, req.tenantId])

    for (const lead of recipients) {
      const personalizedSubject = camp.subject.replace(/\{name\}/g, lead.name)
      const personalizedBody    = camp.template.replace(/\{name\}/g, lead.name)
      const result = await sendTrackedMail(lead.email, lead.name, personalizedSubject, personalizedBody, id, camp.name, req.tenantId)
      if (result.success) sentCount++
      else failedCount++
    }

    await pool.query(
      `UPDATE email_campaigns SET status = 'Sent', sent_count = $1, sent_at = NOW() WHERE id = $2 AND tenant_id = $3;`,
      [sentCount, id, req.tenantId]
    )
    await pool.query('INSERT INTO notifications (text, time, tenant_id) VALUES ($1, $2, $3);',
      [`Email campaign "${camp.name}": ${sentCount} sent, ${failedCount} failed (${segment})`, 'Just now', req.tenantId])
    res.json({ success: true, sent: sentCount, failed: failedCount, total: recipients.length, segment })
  } catch (err) {
    console.error('[Email Campaign Send]', err)
    res.status(500).json({ error: 'Failed to send campaign.' })
  }
})

// ── COMMUNICATION REPORTS ────────────────────────────────────────────────────

// Email logs for a specific campaign
app.get('/api/reports/email-logs/:campaignId', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, recipient_email AS "email", recipient_name AS "name", status, error_message AS "error", sent_at AS "sentAt"
       FROM email_logs WHERE campaign_id = $1 AND tenant_id = $2 ORDER BY sent_at DESC;`,
      [req.params.campaignId, req.tenantId]
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// All email logs summary
app.get('/api/reports/email-logs', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT el.campaign_id AS "campaignId", el.campaign_name AS "campaignName",
              COUNT(*) AS "total",
              SUM(CASE WHEN el.status = 'Sent' THEN 1 ELSE 0 END) AS "sent",
              SUM(CASE WHEN el.status = 'Failed' THEN 1 ELSE 0 END) AS "failed",
              MAX(el.sent_at) AS "lastSentAt"
       FROM email_logs el WHERE el.tenant_id = $1 GROUP BY el.campaign_id, el.campaign_name ORDER BY MAX(el.sent_at) DESC;`,
      [req.tenantId]
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// WhatsApp bulk send history
app.get('/api/reports/whatsapp-logs', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, campaign_name AS "campaignName", message_template AS "template",
              recipient_count AS "recipientCount", status, sent_by AS "sentBy",
              channel, sent_at AS "sentAt"
       FROM whatsapp_logs WHERE tenant_id = $1 ORDER BY sent_at DESC LIMIT 200;`,
      [req.tenantId]
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Call logs with outcome stats
app.get('/api/reports/call-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await pool.query(
      `SELECT id, lead_name AS "leadName", lead_mobile AS "mobile", counselor,
              duration, outcome, notes, called_at AS "calledAt"
       FROM call_logs WHERE tenant_id = $1 ORDER BY called_at DESC LIMIT 500;`,
      [req.tenantId]
    )
    const stats = await pool.query(
      `SELECT outcome, COUNT(*) AS count FROM call_logs WHERE tenant_id = $1 GROUP BY outcome ORDER BY count DESC;`,
      [req.tenantId]
    )
    const byCounselor = await pool.query(
      `SELECT counselor, COUNT(*) AS total,
              SUM(CASE WHEN outcome = 'Connected' THEN 1 ELSE 0 END) AS connected
       FROM call_logs WHERE tenant_id = $1 GROUP BY counselor ORDER BY total DESC;`,
      [req.tenantId]
    )
    res.json({ logs: logs.rows, outcomeStats: stats.rows, byCounselor: byCounselor.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Test SMTP connection — called from Integrations page
app.post('/api/integration-settings/test-smtp', async (req, res) => {
  try {
    const cfg = await createMailTransporter(req.tenantId)
    if (cfg.error) return res.status(400).json({ ok: false, error: cfg.error })
    // Send a test email to the configured address itself
    const user = await getIntegrationSetting('smtp_user', req.tenantId) || ''
    await cfg.transporter.verify()
    res.json({ ok: true, message: `SMTP connection verified (${user}) — credentials are correct!` })
  } catch (e) {
    res.status(400).json({ ok: false, error: `Connection failed: ${e.message}` })
  }
})

app.put('/api/email-campaigns/:id', async (req, res) => {
  const { id } = req.params
  const { name, subject, template, segment, status } = req.body
  try {
    // COALESCE keeps existing value when a field is not sent — supports partial updates (e.g. Disable toggle)
    const r = await pool.query(`
      UPDATE email_campaigns
      SET name     = COALESCE($1, name),
          subject  = COALESCE($2, subject),
          template = COALESCE($3, template),
          segment  = COALESCE($4, segment),
          status   = COALESCE($5, status)
      WHERE id = $6 AND tenant_id = $7
      RETURNING id, name, subject, segment, status, template;
    `, [name ?? null, subject ?? null, template ?? null, segment ?? null, status ?? null, id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found.' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('[PUT email-campaigns]', err.message)
    res.status(500).json({ error: 'Update failed.' })
  }
})

app.delete('/api/email-campaigns/:id', async (req, res) => {
  const { id } = req.params
  try {
    await pool.query('DELETE FROM email_campaigns WHERE id = $1 AND tenant_id = $2;', [id, req.tenantId])
    res.json({ message: 'Campaign deleted.' })
  } catch (err) {
    res.status(500).json({ error: 'Delete failed.' })
  }
})

// ============================================================
// =========== ASK CU AI — real data, real answers ============
// ============================================================
// The assistant only ever states numbers that come back from
// runCrmMetric() below (a real SQL query against this request's own
// tenant/role scope) — it never estimates or invents a figure.

async function getAnthropicClient(tenantId = 1) {
  const apiKey = await getIntegrationSetting('anthropic_api_key', tenantId) || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'Ask CU AI isn\'t configured yet — add an Anthropic API key under Integrations.' }
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    return { client: new Anthropic({ apiKey }) }
  } catch {
    return { error: '@anthropic-ai/sdk not installed on server — run: cd server && npm install' }
  }
}

const MIO_AI_METRICS = [
  'lead_count', 'leads_by_source', 'pending_followups', 'untouched_leads',
  'not_interested_reasons', 'conversion_by_counsellor', 'payment_pending',
  'total_revenue', 'top_campaigns', 'enrollments', 'applications_by_stage',
  'documents_pending', 'recent_leads'
]

// Every query is scoped to req.tenantId, and further scoped to the asking
// counsellor's own leads/applications so nobody sees another counsellor's
// book through the chat widget (same visibility rule as the Dashboard).
async function runCrmMetric(metric, range, tenantId, currentUser) {
  const isCounsellor = currentUser?.role === 'Counselor'
  const ownerClause = isCounsellor ? ' AND owner = $2' : ''
  const ownerParam = isCounsellor ? [currentUser.name] : []
  const rangeCutoff = { today: "NOW() - INTERVAL '1 day'", week: "NOW() - INTERVAL '7 days'", month: "NOW() - INTERVAL '30 days'" }[range] || null

  switch (metric) {
    case 'lead_count': {
      const dateClause = rangeCutoff ? ` AND created_at >= ${rangeCutoff}` : ''
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = $1${ownerClause}${dateClause};`, [tenantId, ...ownerParam])
      return { count: r.rows[0].c, range: range || 'all-time' }
    }
    case 'leads_by_source': {
      const dateClause = rangeCutoff ? ` AND created_at >= ${rangeCutoff}` : ''
      const r = await pool.query(`SELECT source, COUNT(*)::int AS c FROM leads WHERE tenant_id = $1${ownerClause}${dateClause} GROUP BY source ORDER BY c DESC LIMIT 8;`, [tenantId, ...ownerParam])
      return { bySource: r.rows, range: range || 'all-time' }
    }
    case 'pending_followups': {
      const r = await pool.query(`SELECT name, follow_up_date FROM leads WHERE tenant_id = $1 AND stage = 'Follow Up'${ownerClause} ORDER BY id DESC LIMIT 5;`, [tenantId, ...ownerParam])
      const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = $1 AND stage = 'Follow Up'${ownerClause};`, [tenantId, ...ownerParam])
      return { count: countRes.rows[0].c, sample: r.rows }
    }
    case 'untouched_leads': {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM leads WHERE tenant_id = $1 AND stage = 'Untouched'${ownerClause};`, [tenantId, ...ownerParam])
      return { count: r.rows[0].c }
    }
    case 'not_interested_reasons': {
      const r = await pool.query(`SELECT COALESCE(NULLIF(not_interested_reason,''),'Unspecified') AS reason, COUNT(*)::int AS c FROM leads WHERE tenant_id = $1 AND stage = 'Not Interested'${ownerClause} GROUP BY reason ORDER BY c DESC LIMIT 8;`, [tenantId, ...ownerParam])
      return { reasons: r.rows }
    }
    case 'conversion_by_counsellor': {
      const r = await pool.query(`
        SELECT owner, COUNT(*)::int AS total,
          SUM(CASE WHEN stage IN ('Payment Success','Converted') THEN 1 ELSE 0 END)::int AS converted
        FROM leads WHERE tenant_id = $1 AND owner IS NOT NULL AND owner <> '' AND owner <> 'Unassigned'${ownerClause}
        GROUP BY owner ORDER BY converted DESC LIMIT 10;`, [tenantId, ...ownerParam])
      return { counsellors: r.rows.map(row => ({ ...row, rate: row.total ? +(100 * row.converted / row.total).toFixed(1) : 0 })) }
    }
    case 'payment_pending': {
      const appOwnerClause = isCounsellor ? ' AND a.owner = $2' : ''
      const r = await pool.query(`
        SELECT p.name, p.amount, p.date, p.app_no AS "appNo"
        FROM payments p JOIN applications a ON a.app_no = p.app_no AND a.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.status = 'Pending'${appOwnerClause}
        ORDER BY p.id ASC LIMIT 5;`, [tenantId, ...ownerParam])
      const sumRes = await pool.query(`
        SELECT COUNT(*)::int AS c, COALESCE(SUM(p.amount),0)::bigint AS total
        FROM payments p JOIN applications a ON a.app_no = p.app_no AND a.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.status = 'Pending'${appOwnerClause};`, [tenantId, ...ownerParam])
      return { count: sumRes.rows[0].c, totalAmount: Number(sumRes.rows[0].total), oldestFew: r.rows }
    }
    case 'total_revenue': {
      const appOwnerClause = isCounsellor ? ' AND a.owner = $2' : ''
      const r = await pool.query(`
        SELECT COALESCE(SUM(p.amount),0)::bigint AS total, COUNT(*)::int AS c
        FROM payments p JOIN applications a ON a.app_no = p.app_no AND a.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.status IN ('Paid','Approved','Payment Approved') AND p.utr_number IS NOT NULL AND TRIM(p.utr_number) <> ''${appOwnerClause};`, [tenantId, ...ownerParam])
      return { totalAmount: Number(r.rows[0].total), paymentCount: r.rows[0].c }
    }
    case 'top_campaigns': {
      const r = await pool.query(`SELECT name, channel, status, budget, spent, leads, conversions FROM campaigns WHERE tenant_id = $1 ORDER BY leads DESC LIMIT 5;`, [tenantId])
      return { campaigns: r.rows }
    }
    case 'enrollments': {
      const appOwnerClause = isCounsellor ? ' AND owner = $2' : ''
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM applications WHERE tenant_id = $1 AND stage IN ('Enrolment','Enrolments')${appOwnerClause};`, [tenantId, ...ownerParam])
      return { count: r.rows[0].c }
    }
    case 'applications_by_stage': {
      const appOwnerClause = isCounsellor ? ' AND owner = $2' : ''
      const r = await pool.query(`SELECT stage, COUNT(*)::int AS c FROM applications WHERE tenant_id = $1${appOwnerClause} GROUP BY stage ORDER BY c DESC;`, [tenantId, ...ownerParam])
      return { byStage: r.rows }
    }
    case 'documents_pending': {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM documents WHERE tenant_id = $1 AND status = 'Pending';`, [tenantId])
      return { count: r.rows[0].c }
    }
    case 'recent_leads': {
      const r = await pool.query(`SELECT name, source, stage, created_at AS "createdAt" FROM leads WHERE tenant_id = $1${ownerClause} ORDER BY created_at DESC LIMIT 5;`, [tenantId, ...ownerParam])
      return { leads: r.rows }
    }
    default:
      return { error: `Unknown metric: ${metric}` }
  }
}

app.post('/api/mio-ai/ask', authenticateToken, async (req, res) => {
  const question = (req.body?.question || '').trim()
  if (!question) return res.status(400).json({ error: 'Question required.' })

  const { client, error: clientError } = await getAnthropicClient(req.tenantId)
  if (clientError) return res.status(400).json({ error: clientError })

  const tools = [{
    name: 'query_crm_data',
    description: 'Query live, real-time data from this CRM\'s database — leads, applications, payments, campaigns, counsellor performance, or documents. Always call this before stating any number or fact about the CRM\'s data; never estimate or recall a figure from memory.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: MIO_AI_METRICS, description: 'Which figure to pull.' },
        range: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: 'Time window for lead-count/source metrics. Defaults to all-time. Ignored by metrics that don\'t support it.' }
      },
      required: ['metric']
    }
  }]

  const systemPrompt = `You are CU AI, the assistant embedded in CUTM's admissions CRM (CCRM). You answer questions about this organisation's own live leads, applications, payments, campaigns, and counsellor performance using the query_crm_data tool — never guess, estimate, or recall a number from earlier in the conversation; call the tool again if you need current data. You're talking to ${currentUserRoleLabel(req.user)}, so only discuss data already scoped to them by the tool. Keep answers short (2-4 sentences), lead with the number, use **bold** for key figures, and use ₹ with Indian comma grouping for money. If a question isn't about this CRM's data, answer briefly and steer back to what you can help with.`

  const messages = [{ role: 'user', content: question }]
  let finalText = ''
  try {
    for (let i = 0; i < 6; i++) {
      const response = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages
      })

      if (response.stop_reason !== 'tool_use') {
        finalText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        break
      }

      messages.push({ role: 'assistant', content: response.content })
      const toolResults = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        let result
        try {
          result = await runCrmMetric(block.input.metric, block.input.range, req.tenantId, req.user)
        } catch (e) {
          result = { error: e.message }
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
      }
      messages.push({ role: 'user', content: toolResults })
    }
    res.json({ answer: finalText || 'I ran out of steps answering that — try rephrasing your question.' })
  } catch (err) {
    console.error('[Ask CU AI]', err.message)
    res.status(500).json({ error: err.status === 401 ? 'Invalid Anthropic API key — check Integrations.' : 'Ask CU AI failed to respond. Please try again.' })
  }
})

function currentUserRoleLabel(user) {
  if (user?.role === 'Counselor') return `${user.name}, a Counselor (their own leads/applications only)`
  return `${user?.name || 'a user'}, ${user?.role || 'staff'} (organisation-wide data)`
}

// ============================================================
// =================== END NEW FEATURES ======================
// ============================================================

// --- SERVE REACT FRONTEND (production) ---
// Must be placed AFTER all /api routes so API routes take priority
const distPath = path.join(__dirname, '..', 'ccrm', 'dist')
if (fs.existsSync(distPath)) {
  // Serve hashed static assets (JS/CSS) with long-term cache — safe because filenames change on rebuild
  app.use(express.static(distPath, { etag: true, maxAge: '1y', index: false }))

  // Root → cutm16 marketing landing page (dist/landing/index.html) if present.
  // Falls back to the React app so nothing breaks if the landing build is missing.
  const landingIndex = path.join(distPath, 'landing', 'index.html')
  app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    if (fs.existsSync(landingIndex)) return res.sendFile(landingIndex, { etag: false, lastModified: false })
    res.sendFile(path.join(distPath, 'index.html'), { etag: false, lastModified: false })
  })

  // Catch-all: always serve the React index.html fresh — NO etag/cache so browser never gets a stale 304
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.sendFile(path.join(distPath, 'index.html'), { etag: false, lastModified: false })
  })
  console.log(`[Static] Serving React build from: ${distPath}`)
} else {
  console.warn(`[Static] dist folder not found at ${distPath}. Run: cd ccrm && npm run build`)
  app.get('*', (req, res) => {
    res.status(503).send('Frontend not built. Run: cd ccrm && npm run build')
  })
}

// --- DAILY CRON JOBS: Email Report + S3 Backup ---
async function sendProductivityEmailReport() {
  const tenantsRes = await pool.query("SELECT id FROM tenants WHERE status='Active';").catch(() => ({ rows: [{ id: 1 }] }))
  for (const tnt of tenantsRes.rows) {
   const tid = tnt.id
   try {
    const recipients = await getIntegrationSetting('report_email_recipients', tid)
    if (!recipients) {
      console.log(`[Cron] Report recipients not set for tenant ${tid} — skipping`)
      continue
    }

    const emails = recipients.split(',').map(e => e.trim()).filter(e => e)
    if (emails.length === 0) continue

    // Fetch dashboard stats (tenant-scoped)
    const statsRes = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalLeads",
        SUM(CASE WHEN stage='Untouched'           THEN 1 ELSE 0 END)::int AS untouched,
        SUM(CASE WHEN stage='Contacted'           THEN 1 ELSE 0 END)::int AS contacted,
        SUM(CASE WHEN stage='Follow Up'        THEN 1 ELSE 0 END)::int AS "followUp",
        SUM(CASE WHEN stage='Interested'          THEN 1 ELSE 0 END)::int AS interested,
        SUM(CASE WHEN stage IN ('Process for Payment','Qualified Leads') THEN 1 ELSE 0 END)::int AS "processPay",
        SUM(CASE WHEN stage IN ('Payment Success','Converted') THEN 1 ELSE 0 END)::int AS "paymentSuccess"
      FROM leads WHERE tenant_id = ${tid};
    `)
    const kpi = statsRes.rows[0]

    const appRes = await pool.query(`SELECT COUNT(*)::int AS c FROM applications WHERE tenant_id = ${tid};`)
    const applications = appRes.rows[0].c

    const enrRes = await pool.query(`SELECT COUNT(*)::int AS c FROM applications WHERE stage IN ('Enrolment','Enrolments') AND tenant_id = ${tid};`)
    const enrolments = enrRes.rows[0].c

    const revRes = await pool.query(`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE status IN ('Approved','Payment Approved','Paid') AND utr_number IS NOT NULL AND TRIM(utr_number) <> '' AND tenant_id = ${tid};`)
    const revenue = Number(revRes.rows[0].s)

    // Fetch per-counsellor stats (tenant-scoped)
    const counselRes = await pool.query(`
      SELECT
        u.name, u.email,
        COUNT(l.id)::int AS leads,
        SUM(CASE WHEN l.stage='Untouched'  THEN 1 ELSE 0 END)::int AS untouched,
        SUM(CASE WHEN l.stage='Interested' THEN 1 ELSE 0 END)::int AS interested,
        SUM(CASE WHEN l.stage IN ('Process for Payment','Qualified Leads') THEN 1 ELSE 0 END)::int AS "processPay",
        SUM(CASE WHEN l.stage IN ('Payment Success','Converted') THEN 1 ELSE 0 END)::int AS "paymentSuccess"
      FROM users u
      LEFT JOIN leads l ON l.owner = u.name AND l.tenant_id = u.tenant_id
      WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') AND u.tenant_id = ${tid}
      GROUP BY u.name, u.email
      HAVING COUNT(l.id) > 0
      ORDER BY leads DESC
      LIMIT 50;
    `)

    // Build HTML email
    const dateStr = new Date().toLocaleDateString('en-IN')
    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h2>Productivity Report — ${dateStr}</h2>
          <p>Daily counselor-wise lead and application metrics.</p>

          <h3>KPI Summary</h3>
          <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
            <tr style="background-color: #f0f0f0;">
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Leads</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>${(kpi.totalLeads || 0).toLocaleString()}</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Untouched</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>${(kpi.untouched || 0).toLocaleString()}</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Interested</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>${(kpi.interested || 0).toLocaleString()}</strong></td>
            </tr>
            <tr style="background-color: #f9f9f9;">
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Applications</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>${(applications || 0).toLocaleString()}</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Enrolments</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>${(enrolments || 0).toLocaleString()}</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>Revenue (₹)</strong></td>
              <td style="border: 1px solid #ddd; padding: 8px;"><strong>₹${(revenue / 100000).toFixed(2)}L</strong></td>
            </tr>
          </table>

          <h3>Counselor-wise Breakdown</h3>
          <table style="border-collapse: collapse; width: 100%;">
            <tr style="background-color: #0066cc; color: white;">
              <th style="border: 1px solid #ddd; padding: 8px;">Counselor Name</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Leads</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Untouched</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Interested</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Process for Pay</th>
              <th style="border: 1px solid #ddd; padding: 8px;">Payment Success</th>
            </tr>
            ${counselRes.rows.map(r => `
              <tr style="background-color: ${counselRes.rows.indexOf(r) % 2 === 0 ? '#f9f9f9' : 'white'};">
                <td style="border: 1px solid #ddd; padding: 8px;">${r.name}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(r.leads || 0).toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(r.untouched || 0).toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(r.interested || 0).toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(r.processPay || 0).toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${(r.paymentSuccess || 0).toLocaleString()}</td>
              </tr>
            `).join('')}
          </table>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">Sent automatically at 3:00 AM IST</p>
        </body>
      </html>
    `

    // Send emails (per-tenant SMTP)
    const cfg = await createMailTransporter(tid)
    if (cfg.error) {
      console.error(`[Cron] SMTP not configured for tenant ${tid}:`, cfg.error)
      continue
    }

    for (const email of emails) {
      await cfg.transporter.sendMail({
        from: cfg.from,
        to: email,
        subject: `Productivity Report — ${dateStr}`,
        html: htmlBody
      })
    }

    console.log(`[Cron] Email report (tenant ${tid}) sent to ${emails.length} recipient(s)`)
   } catch (e) {
    console.error(`[Cron] Email report failed (tenant ${tid}):`, e.message)
   }
  }
}

async function performS3Backup() {
  try {
    const accessKeyId = await getIntegrationSetting('aws_access_key_id')
    const secretAccessKey = await getIntegrationSetting('aws_secret_access_key')
    const bucket = await getIntegrationSetting('aws_s3_bucket')
    const region = await getIntegrationSetting('aws_region') || 'ap-south-1'

    if (!accessKeyId || !secretAccessKey || !bucket) {
      console.warn('[Backup] S3 credentials not configured — skipping backup')
      return
    }

    // Trim credentials to remove any accidental spaces
    const trimmedAccessKeyId = accessKeyId.trim()
    const trimmedSecretAccessKey = secretAccessKey.trim()
    const trimmedBucket = bucket.trim()

    console.log(`[Backup] Starting S3 backup to: s3://${trimmedBucket}/backups/...`)
    console.log(`[Backup] Using region: ${region}`)
    console.log(`[Backup] Access Key ID: ${trimmedAccessKeyId.substring(0, 10)}...`)

    const s3 = new S3Client({ region, credentials: { accessKeyId: trimmedAccessKeyId, secretAccessKey: trimmedSecretAccessKey } })
    const dateStr = new Date().toISOString().split('T')[0]
    const keyPrefix = `backups/${dateStr}`
    const finalBucket = trimmedBucket

    // 1. Database dump
    try {
      console.log('[Backup] Creating database dump...')
      const pgPass = (process.env.DB_PASS || 'ccrm@123').trim()
      const dbCommand = `PGPASSWORD='${pgPass}' pg_dump -h localhost -U ccrm_user ccrm_db 2>&1 | gzip`
      const { stdout: dbBuffer, stderr } = await execAsync(dbCommand, { maxBuffer: 100 * 1024 * 1024 })

      if (!dbBuffer || dbBuffer.length === 0) {
        throw new Error('Database dump is empty - pg_dump may have failed')
      }
      console.log(`[Backup] Database dump created (${(dbBuffer.length / 1024 / 1024).toFixed(2)} MB)`)

      await s3.send(new PutObjectCommand({
        Bucket: finalBucket,
        Key: `${keyPrefix}/db.sql.gz`,
        Body: Buffer.from(dbBuffer, 'binary')
      }))
      console.log('[Backup] ✓ Database uploaded to S3')
    } catch (err) {
      console.error('[Backup] ✗ Database backup failed:', err.message)
      if (err.message.includes('PGPASSWORD')) {
        console.error('[Backup] Hint: Check database password in environment or code')
      }
    }

    // 2. Uploads directory tar
    const uploadsDir = path.join(__dirname, 'uploads')
    if (fs.existsSync(uploadsDir)) {
      try {
        console.log('[Backup] Creating uploads tar...')
        const { stdout: uploadsBuffer } = await execAsync(`tar -czf - -C "${__dirname}" uploads 2>&1`, { maxBuffer: 100 * 1024 * 1024 })
        console.log(`[Backup] Uploads tar created (${(uploadsBuffer.length / 1024 / 1024).toFixed(2)} MB)`)

        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `${keyPrefix}/uploads.tar.gz`,
          Body: Buffer.from(uploadsBuffer, 'binary')
        }))
        console.log('[Backup] ✓ Uploads directory uploaded to S3')
      } catch (err) {
        console.error('[Backup] ✗ Uploads backup failed:', err.message)
        if (err.message.includes('maxBuffer')) {
          console.error('[Backup] Hint: Uploads directory is too large, increase maxBuffer limit')
        }
      }
    } else {
      console.log('[Backup] ⚠️  Uploads directory not found, skipping')
    }

    // 3. Server logs (last 24 hours)
    try {
      console.log('[Backup] Fetching server logs...')
      const { stdout: logsBuffer } = await execAsync(`journalctl -u ccrm-backend --since "24 hours ago" 2>&1 | gzip`, { maxBuffer: 50 * 1024 * 1024 })
      console.log(`[Backup] Logs created (${(logsBuffer.length / 1024 / 1024).toFixed(2)} MB)`)

      await s3.send(new PutObjectCommand({
        Bucket: finalBucket,
        Key: `${keyPrefix}/server.log.gz`,
        Body: Buffer.from(logsBuffer, 'binary')
      }))
      console.log('[Backup] ✓ Server logs uploaded to S3')
    } catch (err) {
      console.warn('[Backup] ⚠️  Could not fetch/upload journalctl logs:', err.message)
    }

    // 4. Source code backup (server + frontend)
    try {
      console.log('[Backup] Creating source code backup...')
      const codeDir = path.join(__dirname, '..')  // Go up to project root
      const { stdout: codeBuffer } = await execAsync(`tar -czf - -C "${codeDir}" server ccrm/dist --exclude=node_modules --exclude=.git 2>&1`, { maxBuffer: 200 * 1024 * 1024 })
      console.log(`[Backup] Source code created (${(codeBuffer.length / 1024 / 1024).toFixed(2)} MB)`)

      await s3.send(new PutObjectCommand({
        Bucket: finalBucket,
        Key: `${keyPrefix}/source-code.tar.gz`,
        Body: Buffer.from(codeBuffer, 'binary')
      }))
      console.log('[Backup] ✓ Source code uploaded to S3')
    } catch (err) {
      console.error('[Backup] ✗ Source code backup failed:', err.message)
      if (err.message.includes('maxBuffer')) {
        console.error('[Backup] Hint: Source code is too large, increase maxBuffer limit or exclude more directories')
      }
    }

    // Update last backup timestamp
    await pool.query('INSERT INTO integration_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();',
      ['s3_last_backup_at', new Date().toISOString()])

    console.log(`[Backup] ✅ S3 backup complete: s3://${finalBucket}/${keyPrefix}/`)
  } catch (e) {
    console.error('[Backup] ❌ S3 backup failed:', e.message)
    console.error('[Backup] Stack:', e.stack)
  }
}

// --- MORNING REMINDER: email each counsellor their untouched leads ---
async function sendMorningUntouchedEmails() {
  let totalSent = 0
  try {
    // Per-tenant: scope counts to each tenant and send with that tenant's SMTP
    const tenants = await pool.query("SELECT id FROM tenants WHERE status = 'Active';").catch(() => ({ rows: [{ id: 1 }] }))
    for (const t of tenants.rows) {
      const r = await pool.query(`
        SELECT u.name, u.email, COUNT(l.id)::int AS untouched
        FROM users u
        JOIN leads l ON LOWER(l.owner) = LOWER(u.name) AND l.tenant_id = u.tenant_id
        WHERE u.status = 'Active' AND u.role NOT IN ('Admin', 'Finance')
          AND l.stage = 'Untouched' AND u.email IS NOT NULL AND u.email <> ''
          AND u.tenant_id = $1
        GROUP BY u.name, u.email
        HAVING COUNT(l.id) > 0;
      `, [t.id])
      for (const row of r.rows) {
        sendSystemMailAlert(
          row.email,
          `[CCRM] ${row.untouched} untouched lead(s) awaiting your follow-up`,
          `Good morning ${row.name},\n\nYou have ${row.untouched} untouched lead(s) in CCRM that need your attention today.\n\nPlease log in and start following up:\nhttps://crm.cutmap.ac.in/leads\n\nBest regards,\nCCRM Admissions System`,
          t.id
        )
      }
      totalSent += r.rows.length
    }
    console.log(`[Morning Untouched] Reminders sent to ${totalSent} counsellor(s)`)
    return totalSent
  } catch (e) {
    console.error('[Morning Untouched]', e.message)
    return 0
  }
}

// --- SERVER LAUNCH BOOTSTRAP ---
let cronJobRunning = false  // Prevent duplicate execution

async function startServer() {
  await initDb()
  await initTenancy()   // multi-tenant foundation (Phase 1)

  // Schedule daily cron jobs at 3:00 AM IST
  cron.schedule('0 3 * * *', async () => {
    // Prevent duplicate execution if cron triggers twice
    if (cronJobRunning) {
      console.warn('[Cron] ⚠️  Job already running, skipping duplicate execution')
      return
    }

    cronJobRunning = true
    console.log('[Cron] Starting 3am daily tasks...')
    try {
      await sendProductivityEmailReport()
      await performS3Backup()
      console.log('[Cron] ✅ Daily tasks completed successfully')
    } catch (e) {
      console.error('[Cron] ❌ Daily tasks failed:', e.message)
    } finally {
      cronJobRunning = false
    }
  }, { timezone: 'Asia/Kolkata' })

  // Morning reminder: untouched-leads email to each counsellor at 9:00 AM IST
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Sending morning untouched-leads reminders...')
    await sendMorningUntouchedEmails()
  }, { timezone: 'Asia/Kolkata' })

  // Google Sheets auto-pull every 5 minutes — imports new rows + auto-assigns them
  let sheetsSyncRunning = false
  cron.schedule('*/5 * * * *', async () => {
    if (sheetsSyncRunning) return
    sheetsSyncRunning = true
    try {
      // Per-tenant: each active tenant pulls from its own configured sheet
      const tenants = await pool.query("SELECT id FROM tenants WHERE status = 'Active';").catch(() => ({ rows: [{ id: 1 }] }))
      for (const t of tenants.rows) {
        const sheetId = await getIntegrationSetting('sheets_spreadsheet_id', t.id)
        const apiKey  = await getIntegrationSetting('sheets_api_key', t.id)
        if (!sheetId || !apiKey) continue   // not configured for this tenant — skip
        const r = await syncGoogleSheet({ sheetId, apiKey, autoAssign: true, tenantId: t.id })
        if (r.error) console.error(`[Sheets Cron] tenant ${t.id}:`, r.error)
        else if (r.synced) console.log(`[Sheets Cron] tenant ${t.id}: ${r.synced} new lead(s) imported & assigned, ${r.skipped} skipped`)
      }
    } catch (e) {
      console.error('[Sheets Cron]', e.message)
    } finally {
      sheetsSyncRunning = false
    }
  })

  // Test endpoint to manually trigger the morning untouched-leads email
  app.post('/api/admin/test-morning-email', authenticateToken, async (req, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' })
    const count = await sendMorningUntouchedEmails()
    res.json({ success: true, counsellorsEmailed: count })
  })

  // Test endpoint to manually trigger daily report
  app.post('/api/admin/test-daily-report', authenticateToken, async (req, res) => {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Admin only' })
    }
    try {
      await sendProductivityEmailReport()
      await performS3Backup()
      res.json({ status: 'Email and backup triggered successfully' })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // --- SCHEDULED AUTO-ASSIGN: Every hour, assign all unassigned leads (regular + GT) ---
  cron.schedule('0 * * * *', async () => {
    try {
      const tenants = await pool.query('SELECT id FROM tenants')
      for (const { id: tenantId } of tenants.rows) {
        // Auto-assign regular leads
        const unassigned = await pool.query(
          'SELECT id FROM leads WHERE (owner IS NULL OR owner = \'\' OR owner = \'Unassigned\') AND tenant_id = $1',
          [tenantId]
        )
        for (const { id } of unassigned.rows) {
          const counselor = await getNextAssignee(tenantId)
          if (counselor && counselor !== 'Unassigned') {
            await pool.query('UPDATE leads SET owner = $1 WHERE id = $2 AND tenant_id = $3', [counselor, id, tenantId])
          }
        }

        // Auto-assign GT entity leads
        for (const entity of ['GTIB', 'FTL', 'GTTECH', 'ESSE']) {
          const table = `${entity.toLowerCase()}_leads`
          const gtUnassigned = await pool.query(
            `SELECT id FROM ${table} WHERE (owner IS NULL OR owner = '' OR owner = 'Unassigned') AND tenant_id = $1`,
            [tenantId]
          )
          for (const { id } of gtUnassigned.rows) {
            const counselor = await getNextAssignee(tenantId)
            if (counselor && counselor !== 'Unassigned') {
              await pool.query(`UPDATE ${table} SET owner = $1 WHERE id = $2 AND tenant_id = $3`, [counselor, id, tenantId])
            }
          }
        }
      }
      console.log(`[Cron] Auto-assigned unassigned leads at ${new Date().toISOString()}`)
    } catch (err) {
      console.error('[Cron Auto-Assign]', err.message)
    }
  })

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`)
    console.log(`CCRM Backend Server is successfully running!`)
    console.log(`Access on: http://localhost:${PORT}`)
    console.log(`Production: https://crm.cutmap.ac.in`)
    console.log(`====================================================`)
  })
}

startServer()
