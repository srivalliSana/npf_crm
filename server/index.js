import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { pool, initDb } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET || 'ccrm-jwt-secret-key-2026'

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
    
    // Auto-create a notification
    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`New lead assigned: ${name} (${course})`, 'Just now'])
    
    res.status(201).json(insertRes.rows[0])
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
    const docsRes = await pool.query('SELECT id, student, type, status, upload_date AS "uploadDate" FROM documents ORDER BY id DESC;')
    res.json(docsRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents.' })
  }
})

app.post('/api/documents', async (req, res) => {
  const { student, type, status } = req.body
  try {
    const insertRes = await pool.query(`
      INSERT INTO documents (student, type, status, upload_date)
      VALUES ($1, $2, $3, $4)
      RETURNING id, student, type, status, upload_date AS "uploadDate";
    `, [student, type, status || 'Pending', new Date().toLocaleDateString('en-IN')])

    await pool.query('INSERT INTO notifications (text, time) VALUES ($1, $2);', [`Student uploaded document for verification: ${type}`, 'Just now'])

    res.status(201).json(insertRes.rows[0])
  } catch (err) {
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

// --- USERS MANAGEMENT ROUTERS ---
app.get('/api/users', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT id, name, email, role, team, status, picture, last_login AS "lastLogin" FROM users ORDER BY id DESC;')
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
  const { name, email, role, team, status, picture, password } = req.body
  try {
    // Dynamically query based on what parameters were sent
    let queryStr = 'UPDATE users SET name = COALESCE($1, name), role = COALESCE($2, role), team = COALESCE($3, team), status = COALESCE($4, status), picture = COALESCE($5, picture)'
    const params = [name, role, team, status, picture]
    
    if (password) {
      queryStr += ', password = $6 WHERE id = $7'
      params.push(password, id)
    } else {
      queryStr += ' WHERE id = $6'
      params.push(id)
    }
    
    queryStr += ' RETURNING id, name, email, role, team, status, picture, last_login AS "lastLogin";'
    
    const updateRes = await pool.query(queryStr, params)
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    res.json(updateRes.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update user profile details.' })
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
app.get('/api/notifications', async (req, res) => {
  try {
    const notifRes = await pool.query('SELECT id, text, time, unread FROM notifications ORDER BY id DESC;')
    res.json(notifRes.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.' })
  }
})

app.put('/api/notifications', async (req, res) => {
  const { id, unread } = req.body
  try {
    if (id) {
      const updateRes = await pool.query('UPDATE notifications SET unread = $1 WHERE id = $2 RETURNING id, unread;', [unread, id])
      res.json(updateRes.rows[0])
    } else {
      // Mark all read
      await pool.query('UPDATE notifications SET unread = FALSE;')
      res.json({ message: 'All notifications marked as read.' })
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle notification unread status.' })
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

// --- SERVER LAUNCH BOOTSTRAP ---
async function startServer() {
  await initDb()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`)
    console.log(`CCRM Backend Server is successfully running!`)
    console.log(`Access API on: http://localhost:${PORT}`)
    console.log(`Serving static uploads on: http://localhost:${PORT}/uploads`)
    console.log(`====================================================`)
  })
}

startServer()
