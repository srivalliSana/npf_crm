import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import XLSXPkg from 'xlsx'
const XLSX = XLSXPkg.default ?? XLSXPkg
import { fileURLToPath } from 'url'
import { pool, initDb } from './db.js'
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

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

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
  static isTokenError(data) {
    if (!data) return false
    const s = (typeof data === 'string' ? data : JSON.stringify(data)).toLowerCase()
    return s.includes('invalid token') || s.includes('token expired') ||
           s.includes('token invalid') || s.includes('expired token') ||
           s.includes('unauthorized')
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
async function createMailTransporter() {
  const host     = await getIntegrationSetting('smtp_host')      || process.env.SMTP_HOST     || ''
  const port     = parseInt(await getIntegrationSetting('smtp_port') || process.env.SMTP_PORT || '587')
  const user     = await getIntegrationSetting('smtp_user')      || process.env.SMTP_USER     || ''
  const pass     = await getIntegrationSetting('smtp_pass')      || process.env.SMTP_PASS     || ''
  const fromName = await getIntegrationSetting('smtp_from_name') || 'CUTM Admissions'

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
async function sendSystemMailAlert(recipient, subject, messageBody) {
  console.log(`[Mail] To: ${recipient} | Sub: ${subject}`)
  try {
    const cfg = await createMailTransporter()
    if (cfg.error) { console.warn('[Mail] Skipped —', cfg.error); return }
    await cfg.transporter.sendMail({ from: cfg.from, to: recipient, subject, text: messageBody })
    console.log(`[Mail] Sent to ${recipient}`)
  } catch (e) {
    console.error(`[Mail] Failed for ${recipient}:`, e.message)
  }
}

// Tracked campaign send — writes result to email_logs
async function sendTrackedMail(recipient, recipientName, subject, messageBody, campaignId, campaignName) {
  const logErr = async (err) => pool.query(
    'INSERT INTO email_logs (campaign_id, campaign_name, recipient_email, recipient_name, status, error_message) VALUES ($1,$2,$3,$4,$5,$6)',
    [campaignId, campaignName, recipient, recipientName, 'Failed', err]
  ).catch(() => {})

  try {
    const cfg = await createMailTransporter()
    if (cfg.error) {
      await logErr(cfg.error)
      return { success: false, error: cfg.error }
    }
    await cfg.transporter.sendMail({ from: cfg.from, to: recipient, subject, text: messageBody })
    await pool.query(
      'INSERT INTO email_logs (campaign_id, campaign_name, recipient_email, recipient_name, status, error_message) VALUES ($1,$2,$3,$4,$5,$6)',
      [campaignId, campaignName, recipient, recipientName, 'Sent', '']
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
async function createNotification(userEmail, title, text, type = 'info', leadId = null) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_email, title, text, type, lead_id, time, unread, created_at) VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW());',
      [userEmail || null, (title || text || '').substring(0, 255), text, type, leadId, 'Just now']
    )
  } catch (err) {
    console.error('[createNotification]', err.message)
  }
}

// Fetch a single integration setting from DB
async function getIntegrationSetting(key) {
  try {
    const r = await pool.query('SELECT value FROM integration_settings WHERE key = $1;', [key])
    return r.rows[0]?.value || null
  } catch { return null }
}

// Alert a counselor via in-app notification + email + WhatsApp when a lead is assigned
async function alertCounselor(assigneeName, leadName, course, source, leadId) {
  if (!assigneeName || assigneeName === 'Unassigned') return
  try {
    // Look up counselor's email + mobile
    const userRes = await pool.query('SELECT email, mobile FROM users WHERE name = $1 LIMIT 1;', [assigneeName])
    const counselor = userRes.rows[0]
    if (!counselor) return

    const title = `New lead assigned: ${leadName}`
    const text = `${leadName} (${course}) — Source: ${source}`

    // 1. In-app notification (targeted to counselor)
    await createNotification(counselor.email, title, text, 'lead_assigned', leadId)

    // 2. Email alert via SMTP/msmtp
    sendSystemMailAlert(
      counselor.email,
      `[CCRM] New Lead Assigned: ${leadName}`,
      `Hello ${assigneeName},\n\nA new lead has been assigned to you in CCRM:\n\nName: ${leadName}\nCourse: ${course}\nSource: ${source}\n\nPlease log in to follow up:\nhttps://crm.cutmap.ac.in/leads\n\nBest regards,\nCCRM Admissions System`
    )

    // 3. WhatsApp alert to counselor's mobile (if WA API configured + counselor has mobile)
    const waToken = await getIntegrationSetting('whatsapp_access_token')
    const waPhoneId = await getIntegrationSetting('whatsapp_phone_number_id')
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
  const { email, password } = req.body
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1);', [email])
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

    const lastLoginStr = new Date().toLocaleString('en-IN', { hour12: true })
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2;', [lastLoginStr, user.id])
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' })
    
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
  const { email, name, picture } = req.body
  if (!email) return res.status(400).json({ error: 'Email required.' })
  try {
    const lastLoginStr = new Date().toLocaleString('en-IN', { hour12: true })

    // Check if user already exists
    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1);', [email])

    let user
    if (existing.rows.length > 0) {
      // Update last_login and picture; preserve role/team/status
      const u = existing.rows[0]
      if (u.status !== 'Active') {
        return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' })
      }
      await pool.query(
        'UPDATE users SET last_login = $1, picture = COALESCE(NULLIF($2,\'\'), picture) WHERE id = $3;',
        [lastLoginStr, picture || '', u.id]
      )
      user = { ...u, last_login: lastLoginStr, picture: picture || u.picture }
    } else {
      // New Google user — create as Counselor (Admin can promote later)
      const insert = await pool.query(`
        INSERT INTO users (name, email, password, role, team, status, last_login, picture)
        VALUES ($1, $2, $3, 'Counselor', 'Sales', 'Active', $4, $5)
        RETURNING *;
      `, [name || email.split('@')[0], email, `google_${Date.now()}`, lastLoginStr, picture || ''])
      user = insert.rows[0]

      // Add to round-robin assignment counter
      await pool.query(
        'INSERT INTO lead_assignment_counter (counselor_name, counselor_email) VALUES ($1, $2) ON CONFLICT (counselor_name) DO NOTHING;',
        [user.name, user.email]
      )
      await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
        [`New user registered via Google: ${user.name} (${user.email}) — role: Counselor`, 'Just now'])
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' })
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
        lastLogin: lastLoginStr
      }
    })
  } catch (err) {
    console.error('[Google Auth]', err)
    res.status(500).json({ error: 'Google sign-in failed.' })
  }
})

// --- FORGOT PASSWORD (OTP-based reset) ---
const otpStore = {} // { email: { otp, expires } } — in-memory for simplicity

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required.' })
  try {
    const userRes = await pool.query('SELECT id, name FROM users WHERE LOWER(email) = LOWER($1);', [email])
    if (userRes.rows.length === 0) {
      // Return success even if not found (security: don't reveal account existence)
      return res.json({ message: 'If the email exists, a reset OTP has been sent.' })
    }
    const user = userRes.rows[0]
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    otpStore[email.toLowerCase()] = { otp, expires: Date.now() + 10 * 60 * 1000 } // 10 min

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
  const { email, otp, newPassword } = req.body
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields required.' })
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' })

  const stored = otpStore[email.toLowerCase()]
  if (!stored) return res.status(400).json({ error: 'No OTP requested for this email.' })
  if (Date.now() > stored.expires) {
    delete otpStore[email.toLowerCase()]
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' })
  }
  if (stored.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' })
  }

  try {
    const updateRes = await pool.query('UPDATE users SET password = $1 WHERE LOWER(email) = LOWER($2) RETURNING id;', [newPassword, email])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Account not found.' })
    delete otpStore[email.toLowerCase()]
    res.json({ message: 'Password reset successfully. You can now log in.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to reset password.' })
  }
})

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await pool.query('SELECT id, name, email, role, team, status, picture, last_login AS "lastLogin" FROM users WHERE id = $1;', [req.user.id])
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User profile not found.' })
    res.json(userRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile.' })
  }
})

// --- LEADS ROUTERS ---
app.get('/api/leads', async (req, res) => {
  try {
    // ── Server-side pagination + search + filters + role scoping ──────────────
    // Loading the whole table into the browser freezes at scale (1cr rows),
    // so we always page. Returns { rows, total, page, limit }.
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit

    const { search, stage, owner, state, source, unassigned, website_code, domain, requesterRole, requesterName } = req.query

    const where = []
    const params = []
    const add = (clause, value) => { params.push(value); where.push(clause.replace('$$', `$${params.length}`)) }

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
app.get('/api/leads/:id(\\d+)', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email, mobile, state, city, course, source, source_type AS "sourceType",
              owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor",
              not_interested_reason AS "notInterestedReason", lead_details AS "leadDetails"
       FROM leads WHERE id = $1;`, [req.params.id])
    if (!r.rows.length) return res.status(404).json({ error: 'Lead not found.' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lead.' })
  }
})

// === SEPARATE ENDPOINTS FOR WEBSITE FORMS ===

// GET /api/gttech-leads — GTTECH inquiry leads
app.get('/api/gttech-leads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(full_name ILIKE ${p} OR email ILIKE ${p} OR phone ILIKE ${p} OR organization_name ILIKE ${p})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM gttech_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, full_name, organization_name, designation, industry_sector, interested_in, email, phone, created_at, status
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
app.get('/api/ftl-leads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email_id ILIKE ${p} OR phone ILIKE ${p})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM ftl_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email_id, phone, looking_for, created_at, status
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
app.get('/api/gtib-leads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email_id ILIKE ${p} OR phone ILIKE ${p})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM gtib_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email_id, phone, looking_for, created_at, status
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
app.get('/api/esse-leads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
    const offset = (page - 1) * limit
    const search = req.query.search || ''

    const where = []
    const params = []

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(name ILIKE ${p} OR email_id ILIKE ${p} OR phone ILIKE ${p})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM esse_leads ${whereSql};`, params)
    const total = countRes.rows[0].total

    const rowsRes = await pool.query(
      `SELECT id, name, email_id, phone, looking_for, created_at, status
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

app.post('/api/leads', authenticateToken, async (req, res) => {
  const { name, email, mobile, state, city, course, source, owner: requestOwner, regDate, score, stage, stageColor } = req.body
  const finalRegDate = regDate || new Date().toLocaleString('en-IN', { hour12: true })
  try {
    // Social media leads always unassigned
    const socialMediaSources = ['facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'telegram']
    const isFromSocialMedia = source && socialMediaSources.some(sm => source.toLowerCase().includes(sm))

    let owner = requestOwner || 'Unassigned'
    if (isFromSocialMedia) {
      owner = 'Unassigned'
      console.log(`[Lead Create] Social media source (${source}) → keeping unassigned`)
    }

    const insertRes = await pool.query(`
      INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name, email, mobile, state, city, course, source, owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor";
    `, [name, email, mobile, state, city, course, source, owner, finalRegDate, score || 0, stage || 'Untouched', stageColor || 'red'])

    const newLead = insertRes.rows[0]

    // Alert assigned counselor if not unassigned
    if (owner !== 'Unassigned') {
      await alertCounselor(owner, name, course, source || 'Manual', newLead.id)
    }

    res.status(201).json(newLead)
  } catch (err) {
    console.error('[Lead Create] Error:', err.message)
    res.status(500).json({ error: 'Failed to register lead.' })
  }
})

app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params
  const { name, email, mobile, state, city, course, source, owner, score, stage, stageColor, not_interested_reason, leadDetails } = req.body
  try {
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
      WHERE id = $14
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
      id
    ])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    console.error('[PUT /api/leads/:id]', err.message)
    res.status(500).json({ error: 'Failed to update lead details.' })
  }
})

app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params
  // requesterRole + requesterName sent by the client so we can enforce rules server-side
  const requesterRole = req.body?.requesterRole || req.query.requesterRole || ''
  const requesterName = req.body?.requesterName || req.query.requesterName || ''

  try {
    const leadRes = await pool.query('SELECT id, owner, stage, name FROM leads WHERE id = $1;', [id])
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

    await pool.query('DELETE FROM leads WHERE id = $1;', [id])
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

app.get('/api/applications', async (req, res) => {
  try {
    const appsRes = await pool.query('SELECT id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date, admission_details AS "admissionDetails", admission_letter_sent_at AS "admissionLetterSentAt", school_dept AS "schoolDept" FROM applications ORDER BY id DESC;')
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
      `SELECT lead_details FROM leads WHERE (LOWER(email) = LOWER($1) AND email != '' AND email IS NOT NULL) OR mobile = $2 ORDER BY id DESC LIMIT 1;`,
      [email || '', mobile || '']
    ).catch(() => ({ rows: [] }))
    const seededDetails = (leadRes.rows[0]?.lead_details) || {}

    const insertRes = await pool.query(`
      INSERT INTO applications (name, app_no, email, mobile, form_status, pay_status, pay_method, campus, course, stage, owner, date, admission_details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date, admission_details AS "admissionDetails";
    `, [name, finalAppNo, email, mobile, formStatus || 'Incomplete', payStatus || 'Payment Pending', payMethod || '', campus || 'Bhubaneswar', course, stage || 'Application Started', owner || 'Unassigned', finalDate, JSON.stringify(seededDetails)])

    // Auto-create notification
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Application submitted: ${name} (${finalAppNo})`, 'Just now'])
    
    // Auto-create payment entry
    const payIdRes = await pool.query('SELECT COUNT(*) FROM payments WHERE app_no = $1;', [finalAppNo])
    if (parseInt(payIdRes.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO payments (name, app_no, amount, method, status, date)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [name, finalAppNo, 25000, payMethod || '', payStatus === 'Approved' ? 'Approved' : 'Pending', payStatus === 'Approved' ? finalDate : ''])
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
      WHERE id = $14
      RETURNING id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date;
    `, [name ?? null, appNo ?? null, email ?? null, mobile ?? null, formStatus ?? null, payStatus ?? null, payMethod ?? null, campus ?? null, course ?? null, stage ?? null, owner ?? null, date ?? null, leadDetails ? JSON.stringify(leadDetails) : null, id])

    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Application not found.' })

    // Sync to payments if application payStatus changes
    if (payStatus) {
      const isApproved = payStatus === 'Approved' || payStatus === 'Payment Approved'
      await pool.query(`
        UPDATE payments
        SET status = $1, date = $2, txn_id = CASE WHEN txn_id = '' AND $3 = TRUE THEN $4 ELSE txn_id END
        WHERE app_no = $5;
      `, [
        isApproved ? 'Approved' : (payStatus === 'Failed' ? 'Failed' : 'Pending'),
        isApproved ? new Date().toLocaleDateString('en-IN') : '',
        isApproved,
        `TXN${Math.floor(100000 + Math.random() * 900000)}`,
        appNo
      ])

      if (isApproved) {
        await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Payment approved: ₹25,000 received for ${appNo}`, 'Just now'])
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

// --- TELEPHONY CLICK-TO-CALL (Exotel + Ameyo) ---
app.post('/api/ameyo/click2call', async (req, res) => {
  const { phone, agentNumber } = req.body
  if (!phone) return res.status(400).json({ error: 'Phone number required.' })

  try {
    const apiUrl         = await getIntegrationSetting('ameyo_api_url')
    const username       = await getIntegrationSetting('ameyo_username')
    const password       = await getIntegrationSetting('ameyo_password')
    const virtualNumber  = await getIntegrationSetting('ameyo_virtual_number')
    const agentNum       = agentNumber || await getIntegrationSetting('ameyo_agent_number')
    const campaignId     = await getIntegrationSetting('ameyo_campaign_id')

    if (!apiUrl || !username || !password) {
      return res.status(400).json({ error: 'Telephony not configured. Set API URL, Account SID/username, and Auth Token/password in Integrations → Telephony.' })
    }

    const customerMobile = phone.replace(/\D/g, '').slice(-10)
    const isExotel = apiUrl.toLowerCase().includes('exotel')

    let callRes, callData

    if (isExotel) {
      // ── Exotel Click-to-Call ────────────────────────────────────────────────
      // POST https://api.exotel.com/v1/Accounts/{SID}/Calls/connect.json
      // Auth: Basic base64(SID:AuthToken)
      // Body (form): From=<agent_number>&To=<customer>&CallerId=<virtual_number>
      if (!virtualNumber) {
        return res.status(400).json({ error: 'Exotel Virtual Number not configured. Add it in Integrations → Telephony → Virtual Number.' })
      }
      if (!agentNum) {
        return res.status(400).json({ error: 'Agent Number not configured. Add the counselor\'s mobile in Integrations → Telephony → Agent Number.' })
      }

      const exotelUrl = `https://api.exotel.com/v1/Accounts/${username}/Calls/connect.json`
      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64')

      const body = new URLSearchParams({
        From:     agentNum.replace(/\D/g, '').slice(-10),
        To:       customerMobile,
        CallerId: virtualNumber.replace(/\D/g, '').slice(-10),
      })

      callRes  = await fetch(exotelUrl, {
        method:  'POST',
        headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString()
      })
      const text = await callRes.text()
      try { callData = JSON.parse(text) } catch { callData = { raw: text } }

      if (!callRes.ok) {
        console.error('[Exotel click2call] HTTP', callRes.status, callData)
        return res.status(502).json({ error: callData?.RestException?.Message || callData.raw || `Exotel error ${callRes.status}`, details: callData })
      }

      console.log(`[Exotel] Call: agent ${agentNum} → customer ${customerMobile} via ${virtualNumber}`)
      return res.json({ success: true, provider: 'exotel', phone: customerMobile, response: callData })

    } else {
      // ── Ameyo Click-to-Call ─────────────────────────────────────────────────
      // GET {apiUrl}/rest/api/agent/click2call?userId=X&password=Y&phone=Z&cmpId=W
      const url = new URL(`${apiUrl.replace(/\/$/, '')}/rest/api/agent/click2call`)
      url.searchParams.set('userId',   username)
      url.searchParams.set('password', password)
      url.searchParams.set('phone',    `91${customerMobile}`)
      if (campaignId) url.searchParams.set('cmpId', campaignId)

      callRes  = await fetch(url.toString(), { method: 'GET' })
      const text = await callRes.text()
      try { callData = JSON.parse(text) } catch { callData = { raw: text } }

      if (!callRes.ok || (callData.status && String(callData.status).toLowerCase().includes('error'))) {
        console.error('[Ameyo click2call] Error:', callData)
        return res.status(502).json({ error: callData.message || callData.raw || 'Ameyo returned an error.', details: callData })
      }

      console.log(`[Ameyo] Call initiated to 91${customerMobile}`)
      return res.json({ success: true, provider: 'ameyo', phone: customerMobile, response: callData })
    }

  } catch (err) {
    console.error('[click2call]', err.message)
    res.status(500).json({ error: `Telephony server unreachable: ${err.message}` })
  }
})

// ── ADMISSION DETAILS — save full KYC + academic info before payment ──────
app.put('/api/applications/:id/admission-details', async (req, res) => {
  const { id } = req.params
  const details = req.body || {}
  try {
    const r = await pool.query(`
      UPDATE applications
      SET admission_details = $1::jsonb,
          school_dept       = COALESCE($2, school_dept)
      WHERE id = $3
      RETURNING id, app_no AS "appNo", admission_details AS "admissionDetails", school_dept AS "schoolDept";
    `, [JSON.stringify(details), details.schoolDept ?? null, id])
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
      LEFT JOIN users u ON u.name = a.owner
      WHERE a.id = $1;
    `, [id])
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
    await pool.query(`UPDATE applications SET admission_letter_sent_at = NOW() WHERE id = $1;`, [id])

    res.json({ success: true, sentTo: toEmail, ccTo: details.parentEmail || null })
  } catch (err) {
    console.error('[Send Letter]', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/applications/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleteRes = await pool.query('DELETE FROM applications WHERE id = $1 RETURNING id, app_no AS "appNo";', [id])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'Application not found.' })
    res.json({ message: 'Application deleted.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete application.' })
  }
})

// --- TASKS ROUTERS ---
app.get('/api/tasks', async (req, res) => {
  try {
    const tasksRes = await pool.query('SELECT id, title, type, priority, due, status, assignee, lead FROM tasks ORDER BY id DESC;')
    res.json(tasksRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks.' })
  }
})

app.post('/api/tasks', async (req, res) => {
  const { title, type, priority, due, status, assignee, lead } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO tasks (title, type, priority, due, status, assignee, lead)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, title, type, priority, due, status, assignee, lead;
    `, [title, type || 'Call', priority || 'Medium', due, status || 'Pending', assignee, lead])

    // Sync automatic event calendar entry
    const eventDate = due ? due.split(' ')[0].split('/').reverse().join('-') : new Date().toISOString().split('T')[0]
    const eventTime = due ? due.split(' ')[1] + ' ' + due.split(' ')[2] : '10:00 AM'
    await pool.query(`
      INSERT INTO events (title, date, time, type, venue, participants)
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [title, eventDate, eventTime, type || 'Task', 'Online / Call', 1])

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Task scheduled: ${title} (Due: ${due || 'Soon'})`, 'Just now'])

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
    const updateRes = await pool.query('UPDATE tasks SET status = $1 WHERE id = $2 RETURNING id, status;', [status, id])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Task not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle task completion.' })
  }
})

// --- PAYMENTS ROUTERS ---
app.get('/api/payments', async (req, res) => {
  try {
    const payRes = await pool.query('SELECT id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId", utr_number AS "utrNumber", pay_mode AS "payMode" FROM payments ORDER BY id DESC;')
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
      INSERT INTO payments (name, app_no, amount, method, status, date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId";
    `, [name, appNo, amount || 25000, method || '', status || 'Pending', finalDate])
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
      WHERE id = $6
      RETURNING id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId";
    `, [status, isApproved, new Date().toLocaleDateString('en-IN'), isApproved, `TXN${Math.floor(100000 + Math.random() * 900000)}`, id])

    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Payment record not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payment status.' })
  }
})

// Submit UTR / offline ref number — sets status = 'Payment Done'
// Helper — auto-fire admission letter when payment is recorded
async function autoSendAdmissionLetter(appNo, utrNumber) {
  try {
    const r = await pool.query(`
      SELECT a.id, a.name, a.app_no, a.email, a.campus, a.course, a.owner, a.admission_details, a.school_dept,
             u.email AS owner_email, u.mobile AS owner_mobile
      FROM applications a
      LEFT JOIN users u ON u.name = a.owner
      WHERE a.app_no = $1;
    `, [appNo])
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
    await pool.query(`UPDATE applications SET admission_letter_sent_at = NOW() WHERE app_no = $1;`, [appNo])
    console.log(`[Auto-Letter] Sent for ${appNo} → ${toEmail}`)
  } catch (e) {
    console.error(`[Auto-Letter] Failed for ${appNo}:`, e.message)
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
      WHERE id = $4
      RETURNING id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId", utr_number AS "utrNumber", pay_mode AS "payMode";
    `, [utrNumber, payMode || 'offline', new Date().toLocaleDateString('en-IN'), id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Payment not found.' })

    // Also update linked application pay status
    await pool.query(`UPDATE applications SET pay_status = 'Payment Done' WHERE app_no = $1;`, [r.rows[0].appNo])

    // Auto-send provisional letter (non-blocking)
    autoSendAdmissionLetter(r.rows[0].appNo, utrNumber).catch(() => {})

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
      WHERE id = $1 AND status = 'Payment Done'
      RETURNING id, name, app_no AS "appNo", amount, status, utr_number AS "utrNumber";
    `, [id])
    if (!r.rows[0]) return res.status(400).json({ error: 'Payment not found or not in Payment Done status.' })
    await pool.query(`UPDATE applications SET pay_status = 'Paid' WHERE app_no = $1;`, [r.rows[0].appNo])
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1,$2);',
      [`Payment approved: ₹25,000 — ${r.rows[0].appNo} (${r.rows[0].name})`, 'Just now'])
    // Auto-send provisional letter (non-blocking)
    autoSendAdmissionLetter(r.rows[0].appNo, r.rows[0].utrNumber || 'N/A').catch(() => {})
    res.json(r.rows[0])
  } catch (err) {
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
app.get('/api/documents', async (req, res) => {
  try {
    const docsRes = await pool.query('SELECT id, student, type, status, upload_date AS "uploadDate", file_url AS "fileUrl" FROM documents ORDER BY id DESC;')
    res.json(docsRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents.' })
  }
})

app.post('/api/documents', async (req, res) => {
  const { student, type, status, fileUrl } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO documents (student, type, status, upload_date, file_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, student, type, status, upload_date AS "uploadDate", file_url AS "fileUrl";
    `, [student, type, status || 'Pending', new Date().toLocaleDateString('en-IN'), fileUrl || ''])

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Student uploaded document for verification: ${type}`, 'Just now'])

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
    const updateRes = await pool.query('UPDATE documents SET status = $1 WHERE id = $2 RETURNING id, status;', [status, id])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Document not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify/reject document.' })
  }
})

app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleteRes = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING id;', [id])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'Document not found.' })
    res.json({ message: 'Document deleted.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document.' })
  }
})

// --- EVENTS ROUTERS ---
app.get('/api/events', async (req, res) => {
  try {
    const evRes = await pool.query('SELECT id, title, date, time, type, venue, participants FROM events ORDER BY id DESC;')
    res.json(evRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events.' })
  }
})

app.post('/api/events', async (req, res) => {
  const { title, date, time, type, venue, participants } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO events (title, date, time, type, venue, participants)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, date, time, type, venue, participants;
    `, [title, date, time, type, venue, participants || 1])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to schedule calendar event.' })
  }
})

// --- CAMPAIGNS ROUTERS ---
app.get('/api/campaigns', async (req, res) => {
  try {
    const campRes = await pool.query('SELECT id, name, channel, status, budget, spent, leads, conversions, start_date AS "startDate", end_date AS "endDate" FROM campaigns ORDER BY id DESC;')
    res.json(campRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch campaigns.' })
  }
})

app.post('/api/campaigns', async (req, res) => {
  const { name, channel, status, budget } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO campaigns (name, channel, status, budget, spent, leads, conversions, start_date)
      VALUES ($1, $2, $3, $4, 0, 0, 0, $5)
      RETURNING id, name, channel, status, budget, spent, leads, conversions, start_date AS "startDate";
    `, [name, channel, status || 'Active', budget || 0, new Date().toLocaleDateString('en-IN')])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create marketing campaign.' })
  }
})

app.put('/api/campaigns/:id', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  try {
    const updateRes = await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2 RETURNING id, status;', [status, id])
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle campaign status.' })
  }
})

// --- COUNSELORS (derived from users + live lead/app/payment stats) ---
app.get('/api/counselors', async (req, res) => {
  try {
    const usersRes = await pool.query(
      "SELECT id, name, email FROM users WHERE status = 'Active' ORDER BY name;"
    )
    const counselors = []
    for (const u of usersRes.rows) {
      const simplName = u.name.split(' ')[0]

      const leadsRes = await pool.query(
        "SELECT COUNT(*) FROM leads WHERE owner = $1 OR owner LIKE $2;",
        [u.name, `${simplName}%`]
      )
      const untouchedRes = await pool.query(
        "SELECT COUNT(*) FROM leads WHERE (owner = $1 OR owner LIKE $2) AND stage = 'Untouched';",
        [u.name, `${simplName}%`]
      )
      const appsRes = await pool.query(
        "SELECT COUNT(*) FROM applications WHERE owner = $1 OR owner LIKE $2;",
        [u.name, `${simplName}%`]
      )
      const payRes = await pool.query(
        "SELECT COUNT(*) FROM payments p JOIN applications a ON p.app_no = a.app_no WHERE (a.owner = $1 OR a.owner LIKE $2) AND (p.status = 'Approved' OR p.status = 'Payment Approved');",
        [u.name, `${simplName}%`]
      )
      const submittedRes = await pool.query(
        "SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND stage = 'Application Submitted';",
        [u.name, `${simplName}%`]
      )
      const enrolledRes = await pool.query(
        "SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND (stage = 'Enrolment' OR stage = 'Enrolments');",
        [u.name, `${simplName}%`]
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
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { owner, manager, campus } = req.query

    // Build filters (parameterised) for role-scoped dashboards
    let ownerWhere = ''
    const params = []
    const whereConditions = []

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
      whereConditions.push(`(l.owner = $${params.length - 1} OR l.owner IN (SELECT name FROM users WHERE reports_to = $${params.length}))`)
    }

    ownerWhere = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

    // 1. Overall KPI counts (single scan)
    const kpi = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalLeads",
        SUM(CASE WHEN owner IS NULL OR owner = '' OR owner = 'Unassigned' THEN 1 ELSE 0 END)::int AS unassigned,
        SUM(CASE WHEN stage='Untouched'           THEN 1 ELSE 0 END)::int AS untouched,
        SUM(CASE WHEN stage='Follow Up'           THEN 1 ELSE 0 END)::int AS "followUp",
        SUM(CASE WHEN stage='Interested'          THEN 1 ELSE 0 END)::int AS interested,
        SUM(CASE WHEN not_interested_reason IS NOT NULL AND TRIM(not_interested_reason) <> '' THEN 1 ELSE 0 END)::int AS "notInterested"
      FROM leads l ${ownerWhere};
    `, params)

    // 2. Application + payment totals
    const appTotal  = await pool.query('SELECT COUNT(*)::int AS c FROM applications;')
    const enrolTotal = await pool.query("SELECT COUNT(*)::int AS c FROM applications WHERE stage IN ('Enrolment','Enrolments');")
    // Revenue counts ONLY admin-verified payments that have a UTR/reference on
    // record — i.e. UTR entered AND verified. 'Payment Done' (UTR submitted but
    // not yet approved) and any row without a UTR are excluded.
    const revTotal  = await pool.query("SELECT COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE status IN ('Approved','Payment Approved','Paid') AND utr_number IS NOT NULL AND TRIM(utr_number) <> '';")

    // 3. Per-counsellor stage breakdown — ONE GROUP BY, joined to users for domain
    // Scope the visible counsellors the same way as the KPI (own / team / all)
    let userScope = ''
    const userParams = []
    if (owner) {
      userParams.push(owner)
      userScope = `AND u.name = $${userParams.length}`
    } else if (manager) {
      userParams.push(manager)
      userScope = `AND (u.name = $${userParams.length} OR u.reports_to = $${userParams.length})`
    }
    const perCounsellor = await pool.query(`
      SELECT
        u.name, u.email,
        COUNT(l.id)::int AS leads,
        SUM(CASE WHEN l.owner IS NULL OR l.owner = '' OR l.owner = 'Unassigned' THEN 1 ELSE 0 END)::int AS unassigned,
        SUM(CASE WHEN l.stage='Untouched' THEN 1 ELSE 0 END)::int AS untouched,
        SUM(CASE WHEN l.stage='Contacted' THEN 1 ELSE 0 END)::int AS contacted,
        SUM(CASE WHEN l.stage='Follow Up' THEN 1 ELSE 0 END)::int AS "followUp",
        SUM(CASE WHEN l.stage='Interested' THEN 1 ELSE 0 END)::int AS interested,
        SUM(CASE WHEN l.not_interested_reason IS NOT NULL AND TRIM(l.not_interested_reason) <> '' THEN 1 ELSE 0 END)::int AS "notInterested",
        SUM(CASE WHEN l.stage='Qualified Leads' THEN 1 ELSE 0 END)::int AS qualified,
        SUM(CASE WHEN l.stage='Converted' THEN 1 ELSE 0 END)::int AS converted
      FROM users u
      LEFT JOIN leads l ON LOWER(l.owner) = LOWER(u.name)
      WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ${userScope}
      GROUP BY u.name, u.email
      HAVING COUNT(l.id) > 0
      ORDER BY leads DESC
      LIMIT 50;
    `, userParams)

    const byCounsellor = perCounsellor.rows.map(r => ({
      ...r,
      domain: (r.email || '').includes('@cutmap.ac.in') ? 'cutmap'
            : (r.email || '').includes('@cutm.ac.in') ? 'cutm' : 'other'
    }))

    res.json({
      kpi: kpi.rows[0],
      applications: appTotal.rows[0].c,
      enrolments:   enrolTotal.rows[0].c,
      revenue:      Number(revTotal.rows[0].s),
      byCounsellor,
    })
  } catch (err) {
    console.error('[dashboard/stats]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── REPORTS OVERVIEW — all aggregates computed in SQL (scales to millions) ───
app.get('/api/reports/overview', async (req, res) => {
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
    const lp = cutoffISO ? [cutoffISO] : []   // leads params
    const lw = `WHERE ${datePred('reg_date', 1)}`
    const aw = `WHERE ${datePred('date', 1)}`
    const pw = `WHERE ${datePred('date', 1)}`

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
    checks.push({ label: 'Telephony',      ok: !!(settings.ameyo_api_url && settings.ameyo_username) })

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

app.get('/api/users', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT id, name, email, role, team, status, picture, mobile, reports_to AS "reportsTo", last_login AS "lastLogin" FROM users ORDER BY id DESC;')
    res.json(usersRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user accounts.' })
  }
})

app.post('/api/users', async (req, res) => {
  const { name, email, password, role, team, status, mobile, reportsTo } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO users (name, email, password, role, team, status, mobile, reports_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, email, role, team, status, picture, mobile, reports_to AS "reportsTo", last_login AS "lastLogin";
    `, [name, email, password || 'User@123', role || 'Counselor', team || 'Sales', status || 'Active', mobile || '', reportsTo || ''])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create user account.' })
  }
})

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params
  const { name, email, role, team, status, picture, password, mobile, mobile_number, reportsTo } = req.body
  try {
    let queryStr = 'UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), team = COALESCE($3, team), status = COALESCE($4, status), picture = COALESCE($5, picture), mobile = COALESCE($6, mobile), reports_to = COALESCE($7, reports_to), mobile_number = COALESCE($8, mobile_number)'
    const params = [name, role, team, status, picture, mobile ?? null, reportsTo ?? null, mobile_number ?? null]

    if (password) {
      queryStr += ', password = $9 WHERE id = $10'
      params.push(password, id)
    } else {
      queryStr += ' WHERE id = $9'
      params.push(id)
    }

    queryStr += ' RETURNING id, name, email, role, team, status, picture, mobile, mobile_number, reports_to AS "reportsTo", last_login AS "lastLogin";'

    const updateRes = await pool.query(queryStr, params)
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update user profile details.' })
  }
})

// ── LEAD TRANSFERS — request + admin approve/reject ──────────────────────────
app.post('/api/lead-transfers', async (req, res) => {
  const { leadId, fromOwner, toOwner, remark } = req.body
  if (!leadId || !toOwner) return res.status(400).json({ error: 'leadId and toOwner required' })
  try {
    const r = await pool.query(`
      INSERT INTO lead_transfers (lead_id, from_owner, to_owner, remark, requested_by, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, lead_id AS "leadId", from_owner AS "fromOwner", to_owner AS "toOwner", remark, status, requested_at AS "requestedAt";
    `, [leadId, fromOwner || '', toOwner, remark || '', fromOwner || ''])
    // Notify admin
    await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
      [`🔄 Transfer request: ${fromOwner} → ${toOwner} (Lead #${leadId}). Awaiting approval.`, 'Just now', 'transfer_request'])
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
      LEFT JOIN leads l ON l.id = t.lead_id
    `
    const params = []
    if (status) { q += ' WHERE t.status = $1'; params.push(status) }
    q += ' ORDER BY t.requested_at DESC LIMIT 100;'
    const r = await pool.query(q, params)
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/lead-transfers/:id/decide', async (req, res) => {
  const { decision, decidedBy } = req.body   // 'approved' | 'rejected'
  if (!['approved','rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' })
  try {
    const t = await pool.query('SELECT * FROM lead_transfers WHERE id = $1;', [req.params.id])
    if (!t.rows[0]) return res.status(404).json({ error: 'Transfer not found' })
    if (t.rows[0].status !== 'pending') return res.status(400).json({ error: 'Already decided' })

    const r = await pool.query(`
      UPDATE lead_transfers
      SET status = $1, decided_at = NOW(), decided_by = $2
      WHERE id = $3
      RETURNING *;
    `, [decision, decidedBy || 'Admin', req.params.id])

    // If approved, actually reassign the lead
    if (decision === 'approved') {
      await pool.query('UPDATE leads SET owner = $1 WHERE id = $2;', [r.rows[0].to_owner, r.rows[0].lead_id])
    }

    await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
      [`Transfer #${req.params.id} ${decision}: ${r.rows[0].from_owner} → ${r.rows[0].to_owner}`, 'Just now', 'transfer_decision'])
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
      LEFT JOIN users u ON u.team = t.name
      GROUP BY t.id, t.name, t.description, t.created_at
      ORDER BY t.id;
    `)
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/teams', async (req, res) => {
  const { name, description } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
  try {
    const r = await pool.query(
      `INSERT INTO teams (name, description) VALUES ($1, $2) RETURNING id, name, description;`,
      [name.trim(), description || '']
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
      `UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *;`,
      [name?.trim() || null, description ?? null, req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Team not found' })
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/teams/:id', async (req, res) => {
  try {
    // Check team isn't in use
    const u = await pool.query('SELECT COUNT(*)::int AS c FROM users WHERE team = (SELECT name FROM teams WHERE id = $1);', [req.params.id])
    if (u.rows[0].c > 0) return res.status(400).json({ error: `Cannot delete — ${u.rows[0].c} user(s) are in this team. Reassign them first.` })
    await pool.query('DELETE FROM teams WHERE id = $1;', [req.params.id])
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
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, name, email;',
      [tempPwd, id]
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
    await pool.query('UPDATE users SET status = $1 WHERE id = ANY($2::int[]);', [status, ids])
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
      WHERE last_login IS NOT NULL AND last_login <> ''
      ORDER BY id DESC LIMIT 20;
    `)

    // Recent lead assignment notifications (proxy for activity)
    const notifs = await pool.query(`
      SELECT text, time, type, created_at AS "createdAt"
      FROM notifications
      WHERE type IN ('lead_assigned','info') OR text ILIKE '%user%' OR text ILIKE '%registered%'
      ORDER BY id DESC LIMIT 20;
    `)

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

      // Skip if email already exists
      const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1;', [email])
      if (exists.rows.length > 0) { skipped++; continue }

      try {
        const newUser = await pool.query(`
          INSERT INTO users (name, email, mobile, password, role, team, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, name;
        `, [name, email, mobile || null, password, role, team, status])

        // Add to round-robin counter if counselor/manager
        if (['Counselor','Manager'].includes(role)) {
          await pool.query(
            'INSERT INTO lead_assignment_counter (counselor_name, counselor_email) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
            [name, email]
          )
        }
        inserted++
      } catch (e) {
        errors.push(`Row ${rowNum} (${email}): ${e.message}`)
        skipped++
      }
    }

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
      [`Bulk user upload: ${inserted} created, ${skipped} skipped`, 'Just now'])

    res.json({ success: true, inserted, skipped, total: rawData.length, errors: errors.slice(0, 10) })
  } catch (err) {
    console.error('[User Bulk Upload]', err)
    res.status(500).json({ error: err.message || 'Bulk user upload failed.' })
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }
})

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleteRes = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id;', [id])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json({ message: 'User deleted successfully.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user account.' })
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
        FROM notifications ORDER BY id DESC LIMIT 100;
      `)
      rows = r.rows
    } else {
      // Counselors see only their own + broadcasts (user_email IS NULL)
      const r = await pool.query(`
        SELECT id, user_email AS "userEmail", title, text, type, lead_id AS "leadId", time, unread, created_at AS "createdAt"
        FROM notifications WHERE user_email = $1 OR user_email IS NULL ORDER BY id DESC LIMIT 50;
      `, [user.email])
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
      await pool.query('UPDATE notifications SET unread = FALSE WHERE user_email = $1 OR user_email IS NULL;', [userEmail])
    } else {
      await pool.query('UPDATE notifications SET unread = FALSE;')
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
    await pool.query('UPDATE notifications SET unread = FALSE WHERE id = $1;', [id])
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
      const updateRes = await pool.query('UPDATE notifications SET unread = $1 WHERE id = $2 RETURNING id, unread;', [unread, id])
      res.json(updateRes.rows[0])
    } else {
      await pool.query('UPDATE notifications SET unread = FALSE;')
      res.json({ message: 'All notifications marked as read.' })
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle notification unread status.' })
  }
})

// --- INTEGRATION SETTINGS ---
app.get('/api/integration-settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT key, value FROM integration_settings ORDER BY key;')
    const settings = {}
    for (const row of r.rows) settings[row.key] = row.value
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch integration settings.' })
  }
})

app.post('/api/integration-settings', async (req, res) => {
  const settings = req.body
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Invalid settings object.' })
  try {
    for (const [key, value] of Object.entries(settings)) {
      if (!key || typeof key !== 'string') continue
      await pool.query(
        'INSERT INTO integration_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW();',
        [key.substring(0, 100), String(value || '')]
      )
    }
    res.json({ message: 'Integration settings saved.', count: Object.keys(settings).length })
  } catch (err) {
    console.error('[Integration Settings]', err)
    res.status(500).json({ error: 'Failed to save integration settings.' })
  }
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
    const socialMediaSources = ['facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'telegram']

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
      'SELECT id, name, mobile, email, stage, source FROM leads WHERE mobile = $1 OR LOWER(email) = LOWER($2) LIMIT 5;',
      [mobile, email]
    )
    res.json({ duplicates: r.rows, hasDuplicate: r.rows.length > 0 })
  } catch (err) {
    res.status(500).json({ error: 'Deduplication check failed.' })
  }
})

// --- FEATURE 2: LEAD AUTO-ASSIGNMENT (round-robin) ---
app.get('/api/leads/next-assignee', async (req, res) => {
  try {
    // Get active counselors
    const usersRes = await pool.query("SELECT name, email FROM users WHERE status = 'Active' AND role IN ('Counselor', 'Manager') ORDER BY name;")
    if (usersRes.rows.length === 0) return res.json({ assignee: 'Unassigned' })

    // Get or init counters
    for (const u of usersRes.rows) {
      await pool.query(
        'INSERT INTO lead_assignment_counter (counselor_name, counselor_email) VALUES ($1, $2) ON CONFLICT (counselor_name) DO NOTHING;',
        [u.name, u.email]
      )
    }

    // Pick counselor with least assignments (load-based)
    const counterRes = await pool.query(`
      SELECT lac.counselor_name, lac.assignment_count
      FROM lead_assignment_counter lac
      JOIN users u ON u.name = lac.counselor_name
      WHERE u.status = 'Active' AND u.role IN ('Counselor', 'Manager')
      ORDER BY lac.assignment_count ASC, lac.last_assigned ASC
      LIMIT 1;
    `)
    if (counterRes.rows.length === 0) return res.json({ assignee: usersRes.rows[0].name })

    const assignee = counterRes.rows[0].counselor_name
    await pool.query(
      'UPDATE lead_assignment_counter SET assignment_count = assignment_count + 1, last_assigned = NOW() WHERE counselor_name = $1;',
      [assignee]
    )
    res.json({ assignee })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Auto-assignment failed.', assignee: 'Unassigned' })
  }
})

// === FEATURE B: UNASSIGNED LEADS WITH SOURCE TRACKING ===
app.get('/api/leads/unassigned', async (req, res) => {
  try {
    const unassignedRes = await pool.query(`
      SELECT COUNT(*) as total FROM leads WHERE owner IS NULL OR owner = '';
    `)
    const sourceRes = await pool.query(`
      SELECT
        lead_source,
        COUNT(*) as count
      FROM leads
      WHERE owner IS NULL OR owner = ''
      GROUP BY lead_source
      ORDER BY count DESC;
    `)
    const leadsRes = await pool.query(`
      SELECT id, name, email, mobile, lead_source, created_at
      FROM leads
      WHERE owner IS NULL OR owner = ''
      ORDER BY created_at DESC
      LIMIT 100;
    `)
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
       VALUES ((SELECT name FROM leads WHERE id = $1), 'Candidate Upload', $2, 'Uploaded', NOW());`,
      [leadId, fileUrl]
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
app.get('/api/webhooks/meta-leads', (req, res) => {
  // Facebook webhook verification
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'ccrm_meta_verify_2026'
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verification successful.')
    return res.status(200).send(challenge)
  }
  res.status(403).json({ error: 'Verification failed.' })
})

app.post('/api/webhooks/meta-leads', async (req, res) => {
  try {
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
                  }
                } catch (gErr) {
                  console.error('[Meta Graph API Error]', gErr.message)
                }
              }
            }

            // Dedup check
            const dupCheck = await pool.query('SELECT id FROM leads WHERE mobile = $1 OR LOWER(email) = LOWER($2) LIMIT 1;', [mobile, email])
            if (dupCheck.rows.length === 0) {
              // Inbound leads land UNASSIGNED — admin/manager distributes manually
              const score = calculateLeadScore({ source: 'Facebook Ads', stage: 'Untouched', mobile, email, course })
              const newLead = await pool.query(`
                INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
                VALUES ($1, $2, $3, $4, $5, $6, 'Facebook Ads', 'Unassigned', $7, $8, 'Untouched', 'red')
                RETURNING id;
              `, [name, email, mobile, state, city, course, new Date().toLocaleString('en-IN', { hour12: true }), score])

              // Notify admins a new unassigned lead arrived
              await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
                [`New Facebook Ads lead (unassigned): ${name} — assign from Lead Manager`, 'Just now', 'lead_unassigned'])
              console.log(`[Meta Webhook] New lead imported UNASSIGNED: ${name}`)
            } else {
              console.log(`[Meta Webhook] Duplicate lead skipped: ${mobile} / ${email}`)
            }
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

// Google Ads Lead Form Webhook
app.post('/api/webhooks/google-leads', async (req, res) => {
  try {
    const lead = req.body
    const name = lead.user_column_data?.find(f => f.column_name === 'FULL_NAME')?.string_value || lead.full_name || 'Google Lead'
    const email = lead.user_column_data?.find(f => f.column_name === 'EMAIL')?.string_value || lead.email || `google_${Date.now()}@noemail.com`
    const mobile = lead.user_column_data?.find(f => f.column_name === 'PHONE_NUMBER')?.string_value || lead.phone_number || '0000000000'
    const course = lead.user_column_data?.find(f => f.column_name === 'COURSE')?.string_value || 'B.Tech CSE'

    const dupCheck = await pool.query('SELECT id FROM leads WHERE mobile = $1 OR LOWER(email) = LOWER($2) LIMIT 1;', [mobile, email])
    if (dupCheck.rows.length === 0) {
      // Inbound leads land UNASSIGNED — admin/manager distributes manually
      const score = calculateLeadScore({ source: 'Google Ads', stage: 'Untouched', mobile, email, course })
      await pool.query(`
        INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color)
        VALUES ($1, $2, $3, $4, 'Google Ads', 'Unassigned', $5, $6, 'Untouched', 'red')
        RETURNING id;
      `, [name, email, mobile, course, new Date().toLocaleString('en-IN', { hour12: true }), score])
      await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
        [`New Google Ads lead (unassigned): ${name} — assign from Lead Manager`, 'Just now', 'lead_unassigned'])
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
          // Inbound leads land UNASSIGNED — admin/manager distributes manually
          const waLeadName = `WhatsApp Lead (${from.slice(-4)})`
          await pool.query(`
            INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color)
            VALUES ($1, $2, $3, $4, 'WhatsApp', 'Unassigned', $5, $6, 'Untouched', 'red')
            RETURNING id;
          `, [waLeadName, `wa_${from}@noemail.com`, from, course, new Date().toLocaleString('en-IN', { hour12: true }), score])
          await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
            [`New WhatsApp lead (unassigned): ${waLeadName} — assign from Lead Manager`, 'Just now', 'lead_unassigned'])
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
  const sourceScores = { 'Referral': 30, 'Walk-in': 28, 'Education Fair': 25, 'Google Ads': 20, 'Facebook Ads': 18, 'LinkedIn': 22, 'Website': 15, 'WhatsApp': 12, 'SMS Campaign': 10 }
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

app.post('/api/leads/recalculate-score/:id', async (req, res) => {
  const { id } = req.params
  try {
    const r = await pool.query('SELECT * FROM leads WHERE id = $1;', [id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Lead not found.' })
    const lead = r.rows[0]
    const score = calculateLeadScore({ source: lead.source, stage: lead.stage, mobile: lead.mobile, email: lead.email, course: lead.course })
    await pool.query('UPDATE leads SET score = $1 WHERE id = $2;', [score, id])
    res.json({ score })
  } catch (err) {
    res.status(500).json({ error: 'Score recalculation failed.' })
  }
})

// --- FEATURE 5: WHATSAPP BULK MESSAGING ---
app.post('/api/leads/bulk-whatsapp', async (req, res) => {
  const { leadIds, message, templateName, sentBy } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    // Read WhatsApp config from DB integration_settings (the source of truth)
    const waToken = await getIntegrationSetting('whatsapp_access_token')
    const waPhone = await getIntegrationSetting('whatsapp_phone_number_id')
    const waApiUrl = 'https://graph.facebook.com/v21.0'
    const isConfigured = !!(waToken && waPhone)

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders});`, leadIds)
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
      'INSERT INTO whatsapp_logs (campaign_name, message_template, recipient_count, status, sent_by, channel) VALUES ($1, $2, $3, $4, $5, $6);',
      [templateName || 'Bulk Outreach', message.substring(0, 255), sentCount, status, sentBy || 'Unknown', 'whatsapp']
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

app.post('/api/leads/bulk-sms', async (req, res) => {
  const { leadIds, message } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    const provider    = await getIntegrationSetting('sms_provider')
    const apiKey      = await getIntegrationSetting('sms_api_key')
    const apiSid      = await getIntegrationSetting('sms_api_sid')
    const senderId    = await getIntegrationSetting('sms_sender_id')
    const fromNumber  = await getIntegrationSetting('sms_from_number')
    const templateId  = await getIntegrationSetting('sms_template_id')

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders});`, leadIds)
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

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`SMS bulk via ${provider || 'msg91'}: ${sentCount} sent, ${failed} failed`, 'Just now'])
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
       FROM rcs_templates ORDER BY status DESC, created_at DESC;`
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/rcs/templates', async (req, res) => {
  const { templateId, name, rcsType, status, provider, variables, preview } = req.body
  if (!templateId) return res.status(400).json({ error: 'templateId required.' })
  try {
    const r = await pool.query(`
      INSERT INTO rcs_templates (template_id, name, rcs_type, status, provider, variables, preview, approved_at)
      VALUES ($1, $2, $3, $4::text, $5, $6::jsonb, $7, CASE WHEN $4::text = 'APPROVED' THEN NOW() ELSE NULL END)
      ON CONFLICT (template_id) DO UPDATE
        SET name      = EXCLUDED.name,
            rcs_type  = EXCLUDED.rcs_type,
            status    = EXCLUDED.status,
            provider  = EXCLUDED.provider,
            variables = EXCLUDED.variables,
            preview   = EXCLUDED.preview,
            approved_at = CASE WHEN EXCLUDED.status = 'APPROVED' AND rcs_templates.status != 'APPROVED' THEN NOW() ELSE rcs_templates.approved_at END
      RETURNING id, template_id AS "templateId", name, rcs_type AS "rcsType", status, provider, variables, preview;
    `, [templateId, name || templateId, (rcsType || 'BASIC').toUpperCase(), (status || 'PENDING').toUpperCase(), provider || 'rcssms', JSON.stringify(variables || []), preview || ''])
    res.json(r.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/rcs/templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM rcs_templates WHERE id = $1;', [req.params.id])
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

app.post('/api/leads/bulk-rcs', async (req, res) => {
  const { leadIds, message, templateId: requestedTemplateId, rcsType: requestedRcsType } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    const provider     = await getIntegrationSetting('rcs_provider')
    const apiKey       = await getIntegrationSetting('rcs_api_key')
    const clientSecret = await getIntegrationSetting('rcs_client_secret')
    const agentId      = await getIntegrationSetting('rcs_agent_id')
    const senderId     = await getIntegrationSetting('rcs_sender_id')
    const username     = await getIntegrationSetting('rcs_username')
    const password     = await getIntegrationSetting('rcs_password')
    const rcsid        = await getIntegrationSetting('rcs_rcsid')
    // Per-call template override > saved default
    const templateId = requestedTemplateId || await getIntegrationSetting('rcs_template_id')
    const rcsType    = requestedRcsType    || await getIntegrationSetting('rcs_type')

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders});`, leadIds)
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

    if (isRcssms && (rcsType || 'BASIC').toUpperCase() === 'BASIC') {
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

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`RCS bulk via ${provider || 'gupshup'}: ${sentCount} sent, ${failed} failed`, 'Just now'])
    res.json({ success: true, sent: sentCount, failed, total: leads.length, provider: provider || 'gupshup' })
  } catch (err) {
    console.error('[RCS Bulk]', err)
    res.status(500).json({ error: 'Bulk RCS failed.', sent: 0 })
  }
})

// --- FEATURE 6: AUTOMATED DRIP SEQUENCES ---
app.post('/api/drip/enroll', async (req, res) => {
  const { leadId, leadName, leadEmail, leadMobile, sequenceName } = req.body
  try {
    // Check if already enrolled
    const existing = await pool.query('SELECT id FROM drip_sequences WHERE lead_id = $1 AND status = $2;', [leadId, 'Active'])
    if (existing.rows.length > 0) return res.json({ message: 'Already enrolled in drip sequence.' })

    const nextActionAt = new Date()
    const insertRes = await pool.query(`
      INSERT INTO drip_sequences (lead_id, lead_name, lead_email, lead_mobile, sequence_name, current_step, status, next_action_at)
      VALUES ($1, $2, $3, $4, $5, 0, 'Active', $6)
      RETURNING *;
    `, [leadId, leadName, leadEmail, leadMobile, sequenceName || 'Standard Admission', nextActionAt])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to enroll in drip sequence.' })
  }
})

app.get('/api/drip', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM drip_sequences ORDER BY id DESC LIMIT 100;')
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

      // Log the action
      await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
        [`[Drip] ${step.type} → ${seq.lead_name}: ${step.message.replace('{name}', seq.lead_name).substring(0, 80)}`, 'Just now'])

      if (step.type === 'Task') {
        await pool.query(`INSERT INTO tasks (title, type, priority, due, status, assignee, lead) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [step.message.replace('{name}', seq.lead_name), 'Call', 'High', new Date().toLocaleString('en-IN', { hour12: true }), 'Pending', 'Unassigned', seq.lead_name])
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
app.get('/api/reports/funnel', async (req, res) => {
  try {
    const { source, campaign } = req.query
    const whereClause = source ? `WHERE l.source = '${source.replace(/'/g,"''")}' ` : ''

    const leads = await pool.query(`SELECT COUNT(*) FROM leads ${whereClause};`)
    const contacted = await pool.query(`SELECT COUNT(*) FROM leads ${whereClause ? whereClause + "AND " : "WHERE "} stage IN ('Contacted', 'Follow Up', 'Interested', 'Qualified Leads', 'Converted');`)
    const apps = await pool.query(`SELECT COUNT(*) FROM applications;`)
    const payments = await pool.query(`SELECT COUNT(*) FROM payments WHERE status = 'Approved';`)
    const enrolled = await pool.query(`SELECT COUNT(*) FROM applications WHERE stage IN ('Enrolment', 'Enrolments');`)
    const sourceBreakdown = await pool.query(`SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC;`)

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
app.get('/api/reports/leaderboard', async (req, res) => {
  try {
    const usersRes = await pool.query("SELECT id, name, email FROM users WHERE status = 'Active' ORDER BY name;")
    const leaderboard = []
    for (const u of usersRes.rows) {
      const simplName = u.name.split(' ')[0]
      const q = (sql, params) => pool.query(sql, params).then(r => parseInt(r.rows[0].count))
      const leadsTotal = await q("SELECT COUNT(*) FROM leads WHERE owner = $1 OR owner LIKE $2;", [u.name, `${simplName}%`])
      const converted = await q("SELECT COUNT(*) FROM leads WHERE (owner = $1 OR owner LIKE $2) AND stage IN ('Qualified Leads','Converted');", [u.name, `${simplName}%`])
      const enrolled = await q("SELECT COUNT(*) FROM applications WHERE (owner = $1 OR owner LIKE $2) AND stage IN ('Enrolment','Enrolments');", [u.name, `${simplName}%`])
      const payApproved = await q("SELECT COUNT(*) FROM payments p JOIN applications a ON p.app_no = a.app_no WHERE (a.owner = $1 OR a.owner LIKE $2) AND p.status = 'Approved';", [u.name, `${simplName}%`])
      const callsCount = await q("SELECT COUNT(*) FROM call_logs WHERE counselor = $1 OR counselor LIKE $2;", [u.name, `${simplName}%`])
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
app.post('/api/public/inquiry', async (req, res) => {
  const { name, email, mobile, state, city, course, source } = req.body
  if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile are required.' })
  try {
    // Dedup check
    const dup = await pool.query('SELECT id FROM leads WHERE mobile = $1 OR LOWER(email) = LOWER($2) LIMIT 1;', [mobile, email || ''])
    if (dup.rows.length > 0) {
      return res.status(200).json({ message: 'Your inquiry was already received. Our team will contact you shortly.', duplicate: true })
    }

    // Inbound landing-page leads land UNASSIGNED — admin/manager distributes manually
    const score = calculateLeadScore({ source: source || 'Website', stage: 'Untouched', mobile, email, course })
    const leadSource = source?.toLowerCase().includes('facebook') ? 'facebook' : 'form'
    const insertRes = await pool.query(`
      INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color, lead_source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Unassigned', $8, $9, 'Untouched', 'red', $10)
      RETURNING id, name, course;
    `, [name, email || `pub_${Date.now()}@noemail.com`, mobile, state || '', city || '', course || 'B.Tech CSE', source || 'Website', new Date().toLocaleString('en-IN', { hour12: true }), score, leadSource])

    const pubLead = insertRes.rows[0]
    // Notify admins a new unassigned lead arrived from the landing page
    await pool.query('INSERT INTO notifications (text, time, type) VALUES ($1, $2, $3);',
      [`New ${source || 'Website'} lead (unassigned): ${name} — assign from Lead Manager`, 'Just now', 'lead_unassigned'])

    res.status(201).json({ message: 'Thank you! Our admissions team will contact you within 24 hours.', lead: pubLead })
  } catch (err) {
    console.error('[Public Inquiry]', err)
    res.status(500).json({ error: 'Failed to submit inquiry.' })
  }
})

// --- FEATURE 11: PAYMENT LINK GENERATOR ---
app.post('/api/payments/generate-link', async (req, res) => {
  const { appNo, name, email, mobile, amount, method } = req.body
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

    // Update payment record
    await pool.query(
      "UPDATE payments SET method = $1, status = 'Link Sent' WHERE app_no = $2;",
      [method || 'Online', appNo]
    )
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Payment link generated for ${appNo}: ₹${(amount || 25000).toLocaleString('en-IN')}`, 'Just now'])

    res.json({ success: true, paymentLink, appNo, amount: amount || 25000 })
  } catch (err) {
    console.error('[Pay Link]', err)
    res.status(500).json({ error: 'Failed to generate payment link.' })
  }
})

// --- FEATURE 12 & 13: EXCEL PREVIEW / COLUMN MAPPER + DUPLICATE DETECTION ---
app.post('/api/leads/preview-upload', (req, res, next) => {
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
app.post('/api/leads/bulk-upload-mapped', (req, res, next) => {
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

    const getNextOwner = () => {
      // Counsellor uploading → their leads; admin "specific" → chosen counselor.
      if (explicitAssignee) return explicitAssignee
      // Otherwise (admin round-robin/default) → stay Unassigned (no auto-assign).
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
        // Source must be 'AI' (admin/internal import) or 'SM' (social media)
        const rawSrc = String(row[columnMap.source] || row.Source || row.source || 'AI').trim().toUpperCase()
        const source = rawSrc === 'SM' ? 'Social Media' : 'Admin Import'
        const sourceType = rawSrc === 'SM' ? 'sm' : 'ai'
        const score  = calculateLeadScore({ source, stage: 'Untouched', mobile, email, course })
        const owner  = getNextOwner()
        assignmentCounts[owner] = (assignmentCounts[owner] || 0) + 1

        const dup = await client.query('SELECT id, name, mobile, email FROM leads WHERE mobile = $1 OR LOWER(email) = LOWER($2) LIMIT 1;', [mobile, email])
        if (dup.rows.length > 0) {
          if (dupHandling === 'skip') {
            // "Specific Counsellor" (or a counselor self-upload) promises to assign
            // ALL rows in this file to that person — so reassign the matched lead's
            // owner even under Skip (owner only; don't touch other fields).
            if (explicitAssignee) {
              await client.query('UPDATE leads SET owner=$1 WHERE id=$2;', [explicitAssignee, dup.rows[0].id])
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
              await client.query('UPDATE leads SET name=$1, course=$2, source=$3, score=$4, source_type=$5, owner=$6 WHERE id=$7;',
                [name, course, source, score, sourceType, explicitAssignee, dup.rows[0].id])
            } else {
              // Admin round-robin/default → update fields but keep existing owner (don't unassign)
              await client.query('UPDATE leads SET name=$1, course=$2, source=$3, score=$4, source_type=$5 WHERE id=$6;',
                [name, course, source, score, sourceType, dup.rows[0].id])
            }
            updated++; continue
          }
        }
        const leadSource = isCounselor ? 'counselor_upload' : (source?.toLowerCase().includes('facebook') ? 'facebook' : 'form')
        await client.query(`
          INSERT INTO leads (name, email, mobile, state, city, course, source, source_type, owner, reg_date, score, stage, stage_color, lead_source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Untouched','red',$12);
        `, [name, email, mobile, state, city, course, source, sourceType, owner,
            new Date().toLocaleString('en-IN', { hour12: true }), score, leadSource])
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

// --- FEATURE 14: GOOGLE SHEETS AUTO-SYNC ---
app.post('/api/integrations/sheets-sync', async (req, res) => {
  const { sheetId, apiKey } = req.body
  if (!sheetId) return res.status(400).json({ error: 'Google Sheet ID required.' })
  try {
    // Fetch sheet data via Google Sheets API
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:Z1000?key=${apiKey || process.env.GOOGLE_SHEETS_API_KEY}`
    const sheetsRes = await fetch(url)
    if (!sheetsRes.ok) {
      const errText = await sheetsRes.text()
      return res.status(400).json({ error: `Google Sheets API error: ${errText.substring(0, 200)}` })
    }
    const sheetsData = await sheetsRes.json()
    const values = sheetsData.values || []
    if (values.length < 2) return res.json({ synced: 0, message: 'No data rows found.' })

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

      const dup = await pool.query('SELECT id FROM leads WHERE mobile = $1 LIMIT 1;', [mobile])
      if (dup.rows.length > 0) { skipped++; continue }

      const score = calculateLeadScore({ source, stage: 'Untouched', mobile, email, course })
      await pool.query(`INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color) VALUES ($1,$2,$3,$4,$5,'Unassigned',$6,$7,'Untouched','red');`,
        [name.substring(0,100), email.substring(0,100), mobile.substring(0,50), course.substring(0,100), source.substring(0,100), new Date().toLocaleString('en-IN', { hour12: true }), score])
      synced++
    }
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Google Sheets sync: ${synced} new leads imported, ${skipped} duplicates skipped`, 'Just now'])
    res.json({ success: true, synced, skipped, total: rows.length })
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
    const r = await pool.query('SELECT id, lead_name AS "leadName", lead_mobile AS "leadMobile", counselor, duration, outcome, notes, called_at AS "calledAt" FROM call_logs ORDER BY id DESC LIMIT 200;')
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
      INSERT INTO call_logs (lead_name, lead_mobile, counselor, duration, outcome, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, lead_name AS "leadName", lead_mobile AS "leadMobile", counselor, duration, outcome, notes, called_at AS "calledAt";
    `, [leadName, leadMobile, counselor, duration || '0:00', outcome || 'Called', notes || ''])

    // Update lead stage if connected
    if (outcome && outcome !== 'No Answer' && leadName) {
      await pool.query("UPDATE leads SET stage = CASE WHEN stage = 'Untouched' THEN 'Contacted' ELSE stage END, stage_color = CASE WHEN stage = 'Untouched' THEN 'blue' ELSE stage_color END WHERE name = $1;", [leadName])
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
      GROUP BY campus ORDER BY applications DESC;
    `)
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
    const r = await pool.query('SELECT id, name, subject, segment, status, sent_count AS "sentCount", open_count AS "openCount", click_count AS "clickCount", created_at AS "createdAt", sent_at AS "sentAt" FROM email_campaigns ORDER BY id DESC;')
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
      INSERT INTO email_campaigns (name, subject, template, segment, status)
      VALUES ($1, $2, $3, $4, 'Draft')
      RETURNING id, name, subject, segment, status, sent_count AS "sentCount", open_count AS "openCount", click_count AS "clickCount", created_at AS "createdAt";
    `, [name, subject, template || '', segment || 'All Leads'])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to create email campaign.' })
  }
})

app.post('/api/email-campaigns/:id/send', async (req, res) => {
  const { id } = req.params
  try {
    const campRes = await pool.query('SELECT * FROM email_campaigns WHERE id = $1;', [id])
    if (!campRes.rows[0]) return res.status(404).json({ error: 'Campaign not found.' })
    const camp = campRes.rows[0]
    const segment = camp.segment || 'All Leads'

    // Build segment-aware query
    let segWhere = "email NOT LIKE '%noemail%' AND email != '' AND email IS NOT NULL"
    if (segment === 'Untouched Leads')      segWhere += " AND stage = 'Untouched'"
    else if (segment === 'Follow Up')       segWhere += " AND stage = 'Follow Up'"
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

    const leadsRes = await pool.query(`SELECT email, name FROM leads WHERE ${segWhere};`)
    const recipients = leadsRes.rows
    let sentCount = 0, failedCount = 0

    // Delete previous logs for this campaign (re-send scenario)
    await pool.query('DELETE FROM email_logs WHERE campaign_id = $1;', [id])

    for (const lead of recipients) {
      const personalizedSubject = camp.subject.replace(/\{name\}/g, lead.name)
      const personalizedBody    = camp.template.replace(/\{name\}/g, lead.name)
      const result = await sendTrackedMail(lead.email, lead.name, personalizedSubject, personalizedBody, id, camp.name)
      if (result.success) sentCount++
      else failedCount++
    }

    await pool.query(
      `UPDATE email_campaigns SET status = 'Sent', sent_count = $1, sent_at = NOW() WHERE id = $2;`,
      [sentCount, id]
    )
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
      [`Email campaign "${camp.name}": ${sentCount} sent, ${failedCount} failed (${segment})`, 'Just now'])
    res.json({ success: true, sent: sentCount, failed: failedCount, total: recipients.length, segment })
  } catch (err) {
    console.error('[Email Campaign Send]', err)
    res.status(500).json({ error: 'Failed to send campaign.' })
  }
})

// ── COMMUNICATION REPORTS ────────────────────────────────────────────────────

// Email logs for a specific campaign
app.get('/api/reports/email-logs/:campaignId', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, recipient_email AS "email", recipient_name AS "name", status, error_message AS "error", sent_at AS "sentAt"
       FROM email_logs WHERE campaign_id = $1 ORDER BY sent_at DESC;`,
      [req.params.campaignId]
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// All email logs summary
app.get('/api/reports/email-logs', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT el.campaign_id AS "campaignId", el.campaign_name AS "campaignName",
              COUNT(*) AS "total",
              SUM(CASE WHEN el.status = 'Sent' THEN 1 ELSE 0 END) AS "sent",
              SUM(CASE WHEN el.status = 'Failed' THEN 1 ELSE 0 END) AS "failed",
              MAX(el.sent_at) AS "lastSentAt"
       FROM email_logs el GROUP BY el.campaign_id, el.campaign_name ORDER BY MAX(el.sent_at) DESC;`
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// WhatsApp bulk send history
app.get('/api/reports/whatsapp-logs', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, campaign_name AS "campaignName", message_template AS "template",
              recipient_count AS "recipientCount", status, sent_by AS "sentBy",
              channel, sent_at AS "sentAt"
       FROM whatsapp_logs ORDER BY sent_at DESC LIMIT 200;`
    )
    res.json(r.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Call logs with outcome stats
app.get('/api/reports/call-logs', async (req, res) => {
  try {
    const logs = await pool.query(
      `SELECT id, lead_name AS "leadName", lead_mobile AS "mobile", counselor,
              duration, outcome, notes, called_at AS "calledAt"
       FROM call_logs ORDER BY called_at DESC LIMIT 500;`
    )
    const stats = await pool.query(
      `SELECT outcome, COUNT(*) AS count FROM call_logs GROUP BY outcome ORDER BY count DESC;`
    )
    const byCounselor = await pool.query(
      `SELECT counselor, COUNT(*) AS total,
              SUM(CASE WHEN outcome = 'Connected' THEN 1 ELSE 0 END) AS connected
       FROM call_logs GROUP BY counselor ORDER BY total DESC;`
    )
    res.json({ logs: logs.rows, outcomeStats: stats.rows, byCounselor: byCounselor.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Test SMTP connection — called from Integrations page
app.post('/api/integration-settings/test-smtp', async (req, res) => {
  try {
    const cfg = await createMailTransporter()
    if (cfg.error) return res.status(400).json({ ok: false, error: cfg.error })
    // Send a test email to the configured address itself
    const user = await getIntegrationSetting('smtp_user') || ''
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
      WHERE id = $6
      RETURNING id, name, subject, segment, status, template;
    `, [name ?? null, subject ?? null, template ?? null, segment ?? null, status ?? null, id])
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
    await pool.query('DELETE FROM email_campaigns WHERE id = $1;', [id])
    res.json({ message: 'Campaign deleted.' })
  } catch (err) {
    res.status(500).json({ error: 'Delete failed.' })
  }
})

// ============================================================
// =================== END NEW FEATURES ======================
// ============================================================

// --- SERVE REACT FRONTEND (production) ---
// Must be placed AFTER all /api routes so API routes take priority
const distPath = path.join(__dirname, '..', 'ccrm', 'dist')
if (fs.existsSync(distPath)) {
  // Serve hashed static assets (JS/CSS) with long-term cache — safe because filenames change on rebuild
  app.use(express.static(distPath, { etag: true, maxAge: '1y', index: false }))
  // Catch-all: always serve index.html fresh — NO etag/cache so browser never gets a stale 304
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
  try {
    const recipients = await getIntegrationSetting('report_email_recipients')
    if (!recipients) {
      console.log('[Cron] Email report recipients not configured — skipping')
      return
    }

    const emails = recipients.split(',').map(e => e.trim()).filter(e => e)
    if (emails.length === 0) return

    // Fetch dashboard stats
    const statsRes = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalLeads",
        SUM(CASE WHEN stage='Untouched'           THEN 1 ELSE 0 END)::int AS untouched,
        SUM(CASE WHEN stage='Contacted'           THEN 1 ELSE 0 END)::int AS contacted,
        SUM(CASE WHEN stage='Follow Up'           THEN 1 ELSE 0 END)::int AS "followUp",
        SUM(CASE WHEN stage='Interested'          THEN 1 ELSE 0 END)::int AS interested,
        SUM(CASE WHEN stage IN ('Process for Payment','Qualified Leads') THEN 1 ELSE 0 END)::int AS "processPay",
        SUM(CASE WHEN stage IN ('Payment Success','Converted') THEN 1 ELSE 0 END)::int AS "paymentSuccess"
      FROM leads;
    `)
    const kpi = statsRes.rows[0]

    const appRes = await pool.query('SELECT COUNT(*)::int AS c FROM applications;')
    const applications = appRes.rows[0].c

    const enrRes = await pool.query("SELECT COUNT(*)::int AS c FROM applications WHERE stage IN ('Enrolment','Enrolments');")
    const enrolments = enrRes.rows[0].c

    const revRes = await pool.query("SELECT COALESCE(SUM(amount),0)::bigint AS s FROM payments WHERE status IN ('Approved','Payment Approved','Paid') AND utr_number IS NOT NULL AND TRIM(utr_number) <> '';")
    const revenue = Number(revRes.rows[0].s)

    // Fetch per-counsellor stats
    const counselRes = await pool.query(`
      SELECT
        u.name, u.email,
        COUNT(l.id)::int AS leads,
        SUM(CASE WHEN l.stage='Untouched'  THEN 1 ELSE 0 END)::int AS untouched,
        SUM(CASE WHEN l.stage='Interested' THEN 1 ELSE 0 END)::int AS interested,
        SUM(CASE WHEN l.stage IN ('Process for Payment','Qualified Leads') THEN 1 ELSE 0 END)::int AS "processPay",
        SUM(CASE WHEN l.stage IN ('Payment Success','Converted') THEN 1 ELSE 0 END)::int AS "paymentSuccess"
      FROM users u
      LEFT JOIN leads l ON l.owner = u.name
      WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager')
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

    // Send emails
    const cfg = await createMailTransporter()
    if (cfg.error) {
      console.error('[Cron] SMTP not configured:', cfg.error)
      return
    }

    for (const email of emails) {
      await cfg.transporter.sendMail({
        from: cfg.from,
        to: email,
        subject: `Productivity Report — ${dateStr}`,
        html: htmlBody
      })
    }

    console.log(`[Cron] Email report sent to ${emails.length} recipient(s)`)
  } catch (e) {
    console.error('[Cron] Email report failed:', e.message)
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

// --- SERVER LAUNCH BOOTSTRAP ---
let cronJobRunning = false  // Prevent duplicate execution

async function startServer() {
  await initDb()

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`)
    console.log(`CCRM Backend Server is successfully running!`)
    console.log(`Access on: http://localhost:${PORT}`)
    console.log(`Production: https://crm.cutmap.ac.in`)
    console.log(`====================================================`)
  })
}

startServer()
