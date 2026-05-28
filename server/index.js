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

// --- SMTP ALERT MAILER SENDER ---
function sendSystemMailAlert(recipient, subject, messageBody) {
  // Simulates executing msmtp configuration safely in child process
  console.log(`[SMTP Mailer Triggered] To: ${recipient} | Sub: ${subject}`)
  
  // Creates temporary mail text conforming to msmtp standard
  const mailText = `To: ${recipient}\nSubject: ${subject}\n\n${messageBody}`
  const tempPath = path.join(__dirname, `temp_mail_${Date.now()}.txt`)
  
  fs.writeFileSync(tempPath, mailText)
  
  // Asynchronously dispatches mail utilizing native msmtp binary
  import('child_process').then(({ exec }) => {
    exec(`msmtp -t < "${tempPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Failed to send email alert via msmtp: ${error.message}`)
      } else {
        console.log(`Email successfully dispatched via msmtp to ${recipient}`)
      }
      // Cleanup temp mail alert file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    })
  }).catch(e => {
    console.error('Child process runner failed to launch', e)
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
  })
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
    const leadsRes = await pool.query('SELECT id, name, email, mobile, state, city, course, source, owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor" FROM leads ORDER BY id DESC;')
    res.json(leadsRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads.' })
  }
})

app.post('/api/leads', async (req, res) => {
  const { name, email, mobile, state, city, course, source, owner, regDate, score, stage, stageColor } = req.body
  const finalRegDate = regDate || new Date().toLocaleString('en-IN', { hour12: true })
  try {
    const insertRes = await pool.query(`
      INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name, email, mobile, state, city, course, source, owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor";
    `, [name, email, mobile, state, city, course, source, owner, finalRegDate, score || 0, stage || 'Untouched', stageColor || 'red'])

    const newLead = insertRes.rows[0]

    // Alert assigned counselor
    await alertCounselor(owner, name, course, source || 'Manual', newLead.id)

    res.status(201).json(newLead)
  } catch (err) {
    res.status(500).json({ error: 'Failed to register lead.' })
  }
})

app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params
  const { name, email, mobile, state, city, course, source, owner, score, stage, stageColor } = req.body
  try {
    const updateRes = await pool.query(`
      UPDATE leads
      SET name = $1, email = $2, mobile = $3, state = $4, city = $5, course = $6, source = $7, owner = $8, score = $9, stage = $10, stage_color = $11
      WHERE id = $12
      RETURNING id, name, email, mobile, state, city, course, source, owner, reg_date AS "regDate", score, stage, stage_color AS "stageColor";
    `, [name, email, mobile, state, city, course, source, owner, score, stage, stageColor, id])
    
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead details.' })
  }
})

app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params
  try {
    const deleteRes = await pool.query('DELETE FROM leads WHERE id = $1 RETURNING id;', [id])
    if (deleteRes.rows.length === 0) return res.status(404).json({ error: 'Lead not found.' })
    res.json({ message: 'Lead deleted successfully.', id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead.' })
  }
})

// --- APPLICATIONS ROUTERS ---
app.get('/api/applications', async (req, res) => {
  try {
    const appsRes = await pool.query('SELECT id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date FROM applications ORDER BY id DESC;')
    res.json(appsRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applications.' })
  }
})

app.post('/api/applications', async (req, res) => {
  const { name, appNo, email, mobile, formStatus, payStatus, payMethod, campus, course, stage, owner, date } = req.body
  const finalAppNo = appNo || `CUEE2026${Math.floor(1000 + Math.random() * 9000)}`
  const finalDate = date || new Date().toLocaleDateString('en-IN')
  try {
    const insertRes = await pool.query(`
      INSERT INTO applications (name, app_no, email, mobile, form_status, pay_status, pay_method, campus, course, stage, owner, date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date;
    `, [name, finalAppNo, email, mobile, formStatus || 'Incomplete', payStatus || 'Payment Pending', payMethod || '', campus || 'Bhubaneswar', course, stage || 'Application Started', owner || 'Unassigned', finalDate])
    
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
  const { name, appNo, email, mobile, formStatus, payStatus, payMethod, campus, course, stage, owner, date } = req.body
  try {
    const updateRes = await pool.query(`
      UPDATE applications
      SET name = $1, app_no = $2, email = $3, mobile = $4, form_status = $5, pay_status = $6, pay_method = $7, campus = $8, course = $9, stage = $10, owner = $11, date = $12
      WHERE id = $13
      RETURNING id, name, app_no AS "appNo", email, mobile, form_status AS "formStatus", pay_status AS "payStatus", pay_method AS "payMethod", campus, course, stage, owner, date;
    `, [name, appNo, email, mobile, formStatus, payStatus, payMethod, campus, course, stage, owner, date, id])

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
    const payRes = await pool.query('SELECT id, name, app_no AS "appNo", amount, method, status, date, txn_id AS "txnId" FROM payments ORDER BY id DESC;')
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
      })
    }
    res.json(counselors)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch counselor stats.' })
  }
})


app.get('/api/users', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT id, name, email, role, team, status, picture, mobile, last_login AS "lastLogin" FROM users ORDER BY id DESC;')
    res.json(usersRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user accounts.' })
  }
})

app.post('/api/users', async (req, res) => {
  const { name, email, password, role, team, status } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO users (name, email, password, role, team, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role, team, status, picture, last_login AS "lastLogin";
    `, [name, email, password || 'User@123', role || 'Counselor', team || 'Sales', status || 'Active'])
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create user account.' })
  }
})

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params
  const { name, email, role, team, status, picture, password, mobile } = req.body
  try {
    // Dynamically query based on what parameters were sent
    let queryStr = 'UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), team = COALESCE($3, team), status = COALESCE($4, status), picture = COALESCE($5, picture), mobile = COALESCE($6, mobile)'
    const params = [name, role, team, status, picture, mobile || null]

    if (password) {
      queryStr += ', password = $7 WHERE id = $8'
      params.push(password, id)
    } else {
      queryStr += ' WHERE id = $7'
      params.push(id)
    }

    queryStr += ' RETURNING id, name, email, role, team, status, picture, mobile, last_login AS "lastLogin";'

    const updateRes = await pool.query(queryStr, params)
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update user profile details.' })
  }
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
app.post('/api/leads/bulk-upload', uploadDoc.single('file'), async (req, res) => {
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
          const owner = String(row.Owner || row.owner || 'Vikram Kumar').substring(0, 100)
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
              // Auto-assign
              const assignRes = await pool.query(`SELECT lac.counselor_name FROM lead_assignment_counter lac JOIN users u ON u.name = lac.counselor_name WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ORDER BY lac.assignment_count ASC LIMIT 1;`)
              const assignee = assignRes.rows[0]?.counselor_name || 'Unassigned'
              if (assignee !== 'Unassigned') {
                await pool.query('UPDATE lead_assignment_counter SET assignment_count = assignment_count + 1, last_assigned = NOW() WHERE counselor_name = $1;', [assignee])
              }

              const score = calculateLeadScore({ source: 'Facebook Ads', stage: 'Untouched', mobile, email, course })
              const newLead = await pool.query(`
                INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
                VALUES ($1, $2, $3, $4, $5, $6, 'Facebook Ads', $7, $8, $9, 'Untouched', 'red')
                RETURNING id;
              `, [name, email, mobile, state, city, course, assignee, new Date().toLocaleString('en-IN', { hour12: true }), score])

              const leadId = newLead.rows[0]?.id
              // Alert the assigned counselor
              await alertCounselor(assignee, name, course, 'Facebook Ads', leadId)
              console.log(`[Meta Webhook] New lead imported: ${name} → assigned to ${assignee}`)
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
      const assignRes = await pool.query(`SELECT lac.counselor_name FROM lead_assignment_counter lac JOIN users u ON u.name = lac.counselor_name WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ORDER BY lac.assignment_count ASC LIMIT 1;`)
      const assignee = assignRes.rows[0]?.counselor_name || 'Unassigned'
      if (assignee !== 'Unassigned') {
        await pool.query('UPDATE lead_assignment_counter SET assignment_count = assignment_count + 1, last_assigned = NOW() WHERE counselor_name = $1;', [assignee])
      }
      const score = calculateLeadScore({ source: 'Google Ads', stage: 'Untouched', mobile, email, course })
      const glResult = await pool.query(`
        INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color)
        VALUES ($1, $2, $3, $4, 'Google Ads', $5, $6, $7, 'Untouched', 'red')
        RETURNING id;
      `, [name, email, mobile, course, assignee, new Date().toLocaleString('en-IN', { hour12: true }), score])
      await alertCounselor(assignee, name, course, 'Google Ads', glResult.rows[0]?.id)
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
          // Auto-assign
          const waAssignRes = await pool.query(`SELECT lac.counselor_name FROM lead_assignment_counter lac JOIN users u ON u.name = lac.counselor_name WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ORDER BY lac.assignment_count ASC LIMIT 1;`)
          const waAssignee = waAssignRes.rows[0]?.counselor_name || 'Unassigned'
          if (waAssignee !== 'Unassigned') {
            await pool.query('UPDATE lead_assignment_counter SET assignment_count = assignment_count + 1, last_assigned = NOW() WHERE counselor_name = $1;', [waAssignee])
          }
          const waLeadName = `WhatsApp Lead (${from.slice(-4)})`
          const waResult = await pool.query(`
            INSERT INTO leads (name, email, mobile, course, source, owner, reg_date, score, stage, stage_color)
            VALUES ($1, $2, $3, $4, 'WhatsApp', $5, $6, $7, 'Untouched', 'red')
            RETURNING id;
          `, [waLeadName, `wa_${from}@noemail.com`, from, course, waAssignee, new Date().toLocaleString('en-IN', { hour12: true }), score])
          await alertCounselor(waAssignee, waLeadName, course, 'WhatsApp Bot', waResult.rows[0]?.id)
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
  const { leadIds, message, templateName } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    // Get integration config
    const integCfg = req.body.integrationConfig || {}
    const waApiUrl = integCfg.apiUrl || process.env.WA_API_URL
    const waToken = integCfg.apiKey || process.env.WA_API_KEY
    const waPhone = integCfg.phoneId || process.env.WA_PHONE_ID

    // Fetch lead mobiles
    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders});`, leadIds)
    const leads = leadsRes.rows

    let sentCount = 0
    for (const lead of leads) {
      if (!waApiUrl || !waToken || !waPhone) {
        // Simulate success in dev mode
        console.log(`[WA Bulk] Simulating message to ${lead.name} (${lead.mobile}): ${message.substring(0, 50)}...`)
        sentCount++
      } else {
        try {
          const personalizedMsg = message.replace(/\{name\}/g, lead.name).replace(/\{mobile\}/g, lead.mobile)
          // Call WhatsApp Business API
          const waRes = await fetch(`${waApiUrl}/${waPhone}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: lead.mobile.replace(/\D/g, ''),
              type: 'text',
              text: { body: personalizedMsg }
            })
          })
          if (waRes.ok) sentCount++
        } catch (e) {
          console.error(`[WA Bulk] Failed for ${lead.mobile}:`, e.message)
        }
      }
    }

    // Log the campaign
    await pool.query(
      'INSERT INTO whatsapp_logs (campaign_name, message_template, recipient_count, status) VALUES ($1, $2, $3, $4);',
      [templateName || 'Bulk Outreach', message.substring(0, 255), sentCount, 'Sent']
    )
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`WhatsApp bulk sent: ${sentCount} messages dispatched successfully`, 'Just now'])

    res.json({ success: true, sent: sentCount, total: leads.length })
  } catch (err) {
    console.error('[WA Bulk]', err)
    res.status(500).json({ error: 'Bulk WhatsApp failed.', sent: 0 })
  }
})

app.post('/api/leads/bulk-sms', async (req, res) => {
  const { leadIds, message } = req.body
  if (!leadIds?.length || !message) return res.status(400).json({ error: 'Lead IDs and message required.' })

  try {
    const smsApiKey    = await getIntegrationSetting('sms_api_key')
    const smsSenderId  = await getIntegrationSetting('sms_sender_id')

    const placeholders = leadIds.map((_, i) => `$${i+1}`).join(',')
    const leadsRes = await pool.query(`SELECT id, name, mobile FROM leads WHERE id IN (${placeholders});`, leadIds)
    const leads = leadsRes.rows

    let sentCount = 0
    for (const lead of leads) {
      const mobile = `91${lead.mobile.replace(/\D/g, '').slice(-10)}`
      const personalizedMsg = message.replace(/\{name\}/g, lead.name)

      if (!smsApiKey) {
        console.log(`[SMS Bulk] Simulating SMS to ${lead.name} (${mobile})`)
        sentCount++
        continue
      }

      // MSG91 flow API
      try {
        const smsRes = await fetch('https://api.msg91.com/api/sendhttp.php?' + new URLSearchParams({
          authkey: smsApiKey,
          mobiles: mobile,
          message: personalizedMsg,
          sender: smsSenderId || 'CUTMAD',
          route: '4',
          country: '91',
        }))
        if (smsRes.ok) sentCount++
      } catch (e) {
        console.error(`[SMS] Failed for ${mobile}:`, e.message)
      }
    }

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`SMS bulk sent: ${sentCount} messages dispatched`, 'Just now'])
    res.json({ success: true, sent: sentCount, total: leads.length })
  } catch (err) {
    console.error('[SMS Bulk]', err)
    res.status(500).json({ error: 'Bulk SMS failed.', sent: 0 })
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

    // Auto-assign
    const assignRes = await pool.query(`SELECT lac.counselor_name FROM lead_assignment_counter lac JOIN users u ON u.name = lac.counselor_name WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager') ORDER BY lac.assignment_count ASC LIMIT 1;`)
    const assignee = assignRes.rows[0]?.counselor_name || 'Unassigned'
    if (assignee !== 'Unassigned') {
      await pool.query('UPDATE lead_assignment_counter SET assignment_count = assignment_count + 1, last_assigned = NOW() WHERE counselor_name = $1;', [assignee])
    }

    const score = calculateLeadScore({ source: source || 'Website', stage: 'Untouched', mobile, email, course })
    const insertRes = await pool.query(`
      INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Untouched', 'red')
      RETURNING id, name, course;
    `, [name, email || `pub_${Date.now()}@noemail.com`, mobile, state || '', city || '', course || 'B.Tech CSE', source || 'Website', assignee, new Date().toLocaleString('en-IN', { hour12: true }), score])

    const pubLead = insertRes.rows[0]
    // Alert the assigned counselor
    await alertCounselor(assignee, name, course || 'B.Tech CSE', source || 'Website', pubLead?.id)

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
      mobile: /mobile|phone|contact|number/i,
      state:  /state|province/i,
      city:   /city|district|town/i,
      course: /course|program|stream/i,
      source: /source|channel|medium/i,
    }
    for (const h of headers) {
      for (const [field, pattern] of Object.entries(fieldPatterns)) {
        if (pattern.test(h) && !autoMap[field]) autoMap[field] = h
      }
    }

    // Duplicate detection (sample first 20 rows)
    const mobileCol = autoMap.mobile || headers.find(h => /mobile|phone/i.test(h))
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

    // Pre-fetch round-robin counselor list once for the whole batch
    const counselorRes = await pool.query(`
      SELECT lac.counselor_name FROM lead_assignment_counter lac
      JOIN users u ON u.name = lac.counselor_name
      WHERE u.status = 'Active' AND u.role IN ('Counselor','Manager')
      ORDER BY lac.assignment_count ASC;
    `)
    const counselors = counselorRes.rows.map(r => r.counselor_name)
    let rrIndex = 0 // round-robin pointer for this batch

    const getNextCounselor = () => {
      if (!counselors.length) return 'Unassigned'
      const name = counselors[rrIndex % counselors.length]
      rrIndex++
      return name
    }

    const client = await pool.connect()
    let imported = 0, skipped = 0, updated = 0
    const assignmentCounts = {} // track how many leads each counselor got this batch
    try {
      await client.query('BEGIN')
      for (const row of rawData) {
        const name = String(row[columnMap.name] || row.Name || row.name || 'Unnamed').substring(0, 100)
        const email = String(row[columnMap.email] || row.Email || row.email || `lead_${Date.now()}@noemail.com`).substring(0, 100)
        const mobile = String(row[columnMap.mobile] || row.Mobile || row.mobile || '0000000000').replace(/\D/g, '').substring(0, 50) || '0000000000'
        const state = String(row[columnMap.state] || row.State || row.state || '').substring(0, 100)
        const city = String(row[columnMap.city] || row.City || row.city || '').substring(0, 100)
        const course = String(row[columnMap.course] || row.Course || row.course || 'B.Tech CSE').substring(0, 100)
        const source = String(row[columnMap.source] || row.Source || row.source || 'Excel Upload').substring(0, 100)
        const score = calculateLeadScore({ source, stage: 'Untouched', mobile, email, course })

        // Auto-assign round-robin — owner column ignored
        const rawOwner = String(row[columnMap.owner] || row.Owner || row.owner || '').trim()
        const owner = (rawOwner && rawOwner.toLowerCase() !== 'unassigned') ? rawOwner : getNextCounselor()
        assignmentCounts[owner] = (assignmentCounts[owner] || 0) + 1

        const dup = await client.query('SELECT id FROM leads WHERE mobile = $1 OR LOWER(email) = LOWER($2) LIMIT 1;', [mobile, email])
        if (dup.rows.length > 0) {
          if (dupHandling === 'skip') { skipped++; continue }
          if (dupHandling === 'update') {
            await client.query('UPDATE leads SET name = $1, course = $2, source = $3, score = $4 WHERE id = $5;',
              [name, course, source, score, dup.rows[0].id])
            updated++; continue
          }
        }
        await client.query(`
          INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Untouched', 'red');
        `, [name, email, mobile, state, city, course, source, owner, new Date().toLocaleString('en-IN', { hour12: true }), score])
        imported++
      }
      await client.query('COMMIT')

      // Update round-robin counters in bulk
      for (const [counselorName, count] of Object.entries(assignmentCounts)) {
        await pool.query(
          'UPDATE lead_assignment_counter SET assignment_count = assignment_count + $1, last_assigned = NOW() WHERE counselor_name = $2;',
          [count, counselorName]
        )
      }

      // Single summary notification instead of per-lead alerts
      const summary = Object.entries(assignmentCounts).map(([n, c]) => `${n}: ${c}`).join(', ')
      await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);',
        [`Bulk upload: ${imported} leads imported & auto-assigned (${summary || 'none'}) · ${skipped} skipped · ${updated} updated`, 'Just now'])
      res.json({ success: true, imported, skipped, updated, total: rawData.length, assignments: assignmentCounts })
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
    else if (segment === 'Qualified Leads') segWhere += " AND stage = 'Qualified Leads'"
    else if (segment === 'Application Started') segWhere += " AND stage IN ('Application Started','Contacted','Follow Up')"
    else if (segment === 'Payment Pending') segWhere += " AND stage IN ('Payment Pending','Application Submitted','Payment Approved')"
    else if (segment === 'Hot Leads')       segWhere += " AND score >= 75"

    const leadsRes = await pool.query(`SELECT email, name FROM leads WHERE ${segWhere};`)
    const recipients = leadsRes.rows
    let sentCount = 0

    for (const lead of recipients) {
      const personalizedSubject = camp.subject.replace(/\{name\}/g, lead.name)
      const personalizedBody    = camp.template.replace(/\{name\}/g, lead.name)
      try {
        sendSystemMailAlert(lead.email, personalizedSubject, personalizedBody)
        sentCount++
      } catch (e) {
        console.error('[Email Campaign] Failed for', lead.email, e.message)
      }
    }

    await pool.query(`UPDATE email_campaigns SET status = 'Sent', sent_count = $1, sent_at = NOW() WHERE id = $2;`, [sentCount, id])
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Email campaign "${camp.name}" sent to ${sentCount} recipients (${segment})`, 'Just now'])
    res.json({ success: true, sent: sentCount, total: recipients.length, segment })
  } catch (err) {
    console.error('[Email Campaign Send]', err)
    res.status(500).json({ error: 'Failed to send campaign.' })
  }
})

app.put('/api/email-campaigns/:id', async (req, res) => {
  const { id } = req.params
  const { name, subject, template, segment } = req.body
  try {
    const r = await pool.query(`UPDATE email_campaigns SET name = $1, subject = $2, template = $3, segment = $4 WHERE id = $5 RETURNING id, name, subject, segment, status, template;`, [name, subject, template, segment, id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found.' })
    res.json(r.rows[0])
  } catch (err) {
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

// --- SERVER LAUNCH BOOTSTRAP ---
async function startServer() {
  await initDb()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`)
    console.log(`CCRM Backend Server is successfully running!`)
    console.log(`Access on: http://localhost:${PORT}`)
    console.log(`Production: https://crm.cutmap.ac.in`)
    console.log(`====================================================`)
  })
}

startServer()
