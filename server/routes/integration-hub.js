// Item 27 — Integration: CRM ↔ ERP ↔ LMS ↔ Examination.
//
// The app already pushed applications to CampusOne through a single hardcoded
// endpoint with no retry, no history and no way to see whether it was working.
// This generalises that into a registry:
//
//     connector (a system + how to reach it)
//        └── sync job (an entity + a direction + a path)
//              └── run log (what happened, every time)
//
// Only HTTP/JSON connectors are supported, which is what CampusOne, Moodle and
// a typical examination portal all expose. A job that has never run reports
// exactly that — no dashboard here shows a green tick it hasn't earned.
import express from 'express'
import axios from 'axios'
import { pool } from '../db.js'
import { authenticateToken } from '../lib/auth.js'
import { requirePermission } from '../lib/permissions.js'
import { recordAudit, clientIp } from '../lib/audit.js'
import { encryptSecret, decryptSecret, SETTINGS_MASK } from '../lib/secrets.js'

const router = express.Router()
router.use(authenticateToken)

const SYSTEM_TYPES = ['erp', 'lms', 'examination', 'finance', 'crm']
const AUTH_TYPES = ['none', 'bearer', 'basic', 'api_key']
// Entities a job may move, and which way each direction makes sense.
const ENTITIES = {
  academic_records: { pull: true,  push: false, label: 'Academic records (term GPA, credits, attendance)' },
  exam_results:     { pull: true,  push: false, label: 'Examination results (subject marks & grades)' },
  applications:     { pull: false, push: true,  label: 'Admitted students → downstream system' },
}

// Blueprints offered when a system type has no connector yet. Purely a UI
// convenience — nothing is written until an admin saves one.
const BLUEPRINTS = [
  { code: 'campusone', name: 'CampusOne ERP',      systemType: 'erp',         direction: 'bidirectional' },
  { code: 'moodle',    name: 'Moodle LMS',         systemType: 'lms',         direction: 'inbound' },
  { code: 'exam',      name: 'Examination Portal', systemType: 'examination', direction: 'inbound' },
]

const publicConnector = (c) => ({
  id: c.id, code: c.code, name: c.name, systemType: c.system_type, direction: c.direction,
  baseUrl: c.base_url, healthPath: c.health_path, authType: c.auth_type,
  authUsername: c.auth_username, headerName: c.header_name,
  // Never return the credential — only whether one is stored.
  hasSecret: !!c.auth_secret, authSecret: c.auth_secret ? SETTINGS_MASK : '',
  enabled: c.enabled, status: c.status,
  lastCheckedAt: c.last_checked_at, lastError: c.last_error,
})

// Build the axios config for a connector, decrypting its stored credential.
function requestConfig(c, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra.headers || {}) }
  const secret = decryptSecret(c.auth_secret || '')
  if (c.auth_type === 'bearer' && secret) headers.Authorization = `Bearer ${secret}`
  if (c.auth_type === 'api_key' && secret) headers[c.header_name || 'X-API-Key'] = secret
  const cfg = { timeout: 15000, headers, validateStatus: () => true, ...extra }
  if (c.auth_type === 'basic' && secret) cfg.auth = { username: c.auth_username || '', password: secret }
  return cfg
}

const joinUrl = (base, p) => `${String(base || '').replace(/\/+$/, '')}/${String(p || '').replace(/^\/+/, '')}`

// ── Overview ─────────────────────────────────────────────────────────────────
router.get('/overview', requirePermission('integrations.view'), async (req, res) => {
  const t = [req.tenantId]
  try {
    const [connectors, jobs, recent, dataCounts, legacy] = await Promise.all([
      pool.query('SELECT * FROM integration_connectors WHERE tenant_id = $1 ORDER BY system_type, name;', t),
      pool.query(`
        SELECT j.*, c.code AS connector_code, c.name AS connector_name, c.system_type
        FROM integration_sync_jobs j
        JOIN integration_connectors c ON c.id = j.connector_id
        WHERE j.tenant_id = $1 ORDER BY j.id;`, t),
      pool.query(`
        SELECT id, connector_code AS "connectorCode", entity, direction, trigger_source AS "triggerSource",
               status, records_read AS "recordsRead", records_written AS "recordsWritten",
               records_failed AS "recordsFailed", error, started_at AS "startedAt",
               finished_at AS "finishedAt", duration_ms AS "durationMs"
        FROM integration_sync_logs WHERE tenant_id = $1
        ORDER BY started_at DESC LIMIT 25;`, t),
      pool.query(`
        SELECT (SELECT COUNT(*)::int FROM academic_records WHERE tenant_id = $1) AS "academicRecords",
               (SELECT COUNT(*)::int FROM exam_results     WHERE tenant_id = $1) AS "examResults",
               (SELECT COUNT(*)::int FROM applications
                 WHERE tenant_id = $1 AND campusone_sync_status = 'Success')     AS "erpSynced";`, t),
      // The pre-registry CampusOne endpoint, so an existing install can see it
      // here instead of wondering why the ERP looks unconfigured.
      pool.query(`SELECT value FROM integration_settings WHERE tenant_id = $1 AND key = 'campusone_api_endpoint';`, t),
    ])

    const existing = new Set(connectors.rows.map(c => c.code))
    res.json({
      connectors: connectors.rows.map(publicConnector),
      available: BLUEPRINTS.filter(b => !existing.has(b.code)),
      jobs: jobs.rows.map(j => ({
        id: j.id, connectorId: j.connector_id, connectorCode: j.connector_code,
        connectorName: j.connector_name, systemType: j.system_type,
        entity: j.entity, entityLabel: ENTITIES[j.entity]?.label || j.entity,
        direction: j.direction, path: j.path, scheduleCron: j.schedule_cron, enabled: j.enabled,
        lastRunAt: j.last_run_at, lastStatus: j.last_status,
        lastRecords: j.last_records, lastError: j.last_error,
      })),
      recentRuns: recent.rows,
      dataCounts: dataCounts.rows[0],
      legacyCampusOneEndpoint: legacy.rows[0]?.value || null,
      entities: Object.entries(ENTITIES).map(([k, v]) => ({ entity: k, ...v })),
    })
  } catch (err) {
    console.error('[integration-hub/overview]', err.message)
    res.status(500).json({ error: 'Failed to load the integration overview.' })
  }
})

// ── Connectors ───────────────────────────────────────────────────────────────
router.post('/connectors', requirePermission('integrations.manage'), async (req, res) => {
  const { code, name, systemType, direction, baseUrl, healthPath, authType, authUsername, authSecret, headerName } = req.body
  if (!code || !name) return res.status(400).json({ error: 'code and name are required.' })
  if (!SYSTEM_TYPES.includes(systemType)) return res.status(400).json({ error: `systemType must be one of ${SYSTEM_TYPES.join(', ')}.` })
  if (authType && !AUTH_TYPES.includes(authType)) return res.status(400).json({ error: `authType must be one of ${AUTH_TYPES.join(', ')}.` })
  try {
    const r = await pool.query(`
      INSERT INTO integration_connectors
        (tenant_id, code, name, system_type, direction, base_url, health_path,
         auth_type, auth_username, auth_secret, header_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (tenant_id, code) DO NOTHING
      RETURNING *;`,
      [req.tenantId, String(code).slice(0, 60), String(name).slice(0, 150), systemType,
       direction || 'outbound', baseUrl || '', healthPath || '', authType || 'none',
       authUsername || '', encryptSecret(authSecret || ''), headerName || ''])
    if (!r.rows[0]) return res.status(409).json({ error: 'A connector with that code already exists.' })

    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'CREATE', entityType: 'integration_connector', entityId: String(r.rows[0].id),
      summary: `Added ${systemType.toUpperCase()} connector "${name}"`, ip: clientIp(req),
    })
    res.status(201).json(publicConnector(r.rows[0]))
  } catch (err) {
    console.error('[integration-hub/create-connector]', err.message)
    res.status(500).json({ error: 'Failed to create the connector.' })
  }
})

router.put('/connectors/:id', requirePermission('integrations.manage'), async (req, res) => {
  const { name, direction, baseUrl, healthPath, authType, authUsername, authSecret, headerName, enabled } = req.body
  if (authType && !AUTH_TYPES.includes(authType)) return res.status(400).json({ error: `authType must be one of ${AUTH_TYPES.join(', ')}.` })
  try {
    const cur = await pool.query('SELECT * FROM integration_connectors WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])
    if (!cur.rows[0]) return res.status(404).json({ error: 'Connector not found.' })

    // An untouched credential field arrives as null, empty, or the mask the UI
    // displayed — all three mean "keep what's stored". Without the empty case an
    // edit that only renamed the connector would silently wipe its credential.
    // Same rule integration_settings already follows: a secret is never blanked
    // through a form; delete the connector to remove it.
    const secret = (authSecret == null || authSecret === '' || authSecret === SETTINGS_MASK)
      ? cur.rows[0].auth_secret
      : encryptSecret(authSecret)

    const r = await pool.query(`
      UPDATE integration_connectors SET
        name = COALESCE($1, name), direction = COALESCE($2, direction),
        base_url = COALESCE($3, base_url), health_path = COALESCE($4, health_path),
        auth_type = COALESCE($5, auth_type), auth_username = COALESCE($6, auth_username),
        auth_secret = $7, header_name = COALESCE($8, header_name),
        enabled = COALESCE($9, enabled)
      WHERE id = $10 AND tenant_id = $11 RETURNING *;`,
      [name ?? null, direction ?? null, baseUrl ?? null, healthPath ?? null, authType ?? null,
       authUsername ?? null, secret, headerName ?? null,
       typeof enabled === 'boolean' ? enabled : null, req.params.id, req.tenantId])

    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'UPDATE', entityType: 'integration_connector', entityId: req.params.id,
      summary: `Updated connector "${r.rows[0].name}"`, ip: clientIp(req),
    })
    res.json(publicConnector(r.rows[0]))
  } catch (err) {
    console.error('[integration-hub/update-connector]', err.message)
    res.status(500).json({ error: 'Failed to update the connector.' })
  }
})

router.delete('/connectors/:id', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM integration_connectors WHERE id = $1 AND tenant_id = $2 RETURNING name;', [req.params.id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Connector not found.' })
    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'DELETE', entityType: 'integration_connector', entityId: req.params.id,
      summary: `Removed connector "${r.rows[0].name}" and its sync jobs`, ip: clientIp(req),
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete the connector.' })
  }
})

// Reachability check. Records the outcome on the connector so the dashboard
// shows a checked-at timestamp rather than an unqualified "connected".
router.post('/connectors/:id/test', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const cur = await pool.query('SELECT * FROM integration_connectors WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])
    const c = cur.rows[0]
    if (!c) return res.status(404).json({ error: 'Connector not found.' })
    if (!c.base_url) return res.status(400).json({ error: 'Set a base URL before testing.' })

    const url = joinUrl(c.base_url, c.health_path || '')
    const started = Date.now()
    let status = 'error', error = '', httpStatus = null
    try {
      const r = await axios.get(url, requestConfig(c))
      httpStatus = r.status
      if (r.status >= 200 && r.status < 400) status = 'connected'
      else error = `HTTP ${r.status}`
    } catch (e) {
      error = e.message
    }
    const latencyMs = Date.now() - started

    await pool.query(
      `UPDATE integration_connectors SET status = $1, last_checked_at = NOW(), last_error = $2
       WHERE id = $3 AND tenant_id = $4;`,
      [status, error.slice(0, 500), req.params.id, req.tenantId])

    res.json({ status, httpStatus, latencyMs, url, error: error || null })
  } catch (err) {
    console.error('[integration-hub/test]', err.message)
    res.status(500).json({ error: 'Connection test failed to run.' })
  }
})

// ── Sync jobs ────────────────────────────────────────────────────────────────
router.post('/jobs', requirePermission('integrations.manage'), async (req, res) => {
  const { connectorId, entity, direction, path: jobPath, scheduleCron, enabled } = req.body
  const spec = ENTITIES[entity]
  if (!spec) return res.status(400).json({ error: `entity must be one of ${Object.keys(ENTITIES).join(', ')}.` })
  const dir = direction || (spec.pull ? 'pull' : 'push')
  if (!spec[dir]) return res.status(400).json({ error: `${entity} cannot be synced with direction "${dir}".` })
  try {
    const owns = await pool.query('SELECT id FROM integration_connectors WHERE id = $1 AND tenant_id = $2;', [connectorId, req.tenantId])
    if (!owns.rows[0]) return res.status(404).json({ error: 'Connector not found.' })

    const r = await pool.query(`
      INSERT INTO integration_sync_jobs (tenant_id, connector_id, entity, direction, path, schedule_cron, enabled)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *;`,
      [req.tenantId, connectorId, entity, dir, jobPath || '', scheduleCron || '', !!enabled])
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error('[integration-hub/create-job]', err.message)
    res.status(500).json({ error: 'Failed to create the sync job.' })
  }
})

router.put('/jobs/:id', requirePermission('integrations.manage'), async (req, res) => {
  const { path: jobPath, scheduleCron, enabled } = req.body
  try {
    const r = await pool.query(`
      UPDATE integration_sync_jobs
      SET path = COALESCE($1, path), schedule_cron = COALESCE($2, schedule_cron),
          enabled = COALESCE($3, enabled)
      WHERE id = $4 AND tenant_id = $5 RETURNING *;`,
      [jobPath ?? null, scheduleCron ?? null, typeof enabled === 'boolean' ? enabled : null,
       req.params.id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Sync job not found.' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update the sync job.' })
  }
})

router.delete('/jobs/:id', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM integration_sync_jobs WHERE id = $1 AND tenant_id = $2 RETURNING id;', [req.params.id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Sync job not found.' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete the sync job.' })
  }
})

router.post('/jobs/:id/run', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT j.*, c.* , j.id AS job_id, j.entity AS job_entity, j.direction AS job_direction, j.path AS job_path
      FROM integration_sync_jobs j
      JOIN integration_connectors c ON c.id = j.connector_id
      WHERE j.id = $1 AND j.tenant_id = $2;`, [req.params.id, req.tenantId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Sync job not found.' })

    const result = await runSyncJob({
      row: r.rows[0], tenantId: req.tenantId, triggerSource: 'manual', actor: req.user.email,
    })
    res.json(result)
  } catch (err) {
    console.error('[integration-hub/run]', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get('/logs', requirePermission('integrations.view'), async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100))
  const where = ['tenant_id = $1']
  const params = [req.tenantId]
  if (req.query.jobId) { params.push(req.query.jobId); where.push(`job_id = $${params.length}`) }
  if (req.query.status) { params.push(req.query.status); where.push(`status = $${params.length}`) }
  try {
    const r = await pool.query(`
      SELECT id, job_id AS "jobId", connector_code AS "connectorCode", entity, direction,
             trigger_source AS "triggerSource", status, records_read AS "recordsRead",
             records_written AS "recordsWritten", records_failed AS "recordsFailed", error,
             started_at AS "startedAt", finished_at AS "finishedAt", duration_ms AS "durationMs"
      FROM integration_sync_logs WHERE ${where.join(' AND ')}
      ORDER BY started_at DESC LIMIT ${limit};`, params)
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to read sync logs.' })
  }
})

// ── The runner ───────────────────────────────────────────────────────────────
// Rows arrive as camelCase or snake_case from whatever system is on the other
// end; read both spellings rather than demanding one.
const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k]
  }
  return null
}
const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))

async function upsertAcademicRecord(tenantId, row) {
  const reg = pick(row, 'registrationNumber', 'registration_number', 'regNo', 'reg_no')
  const year = pick(row, 'academicYear', 'academic_year', 'year')
  const term = pick(row, 'term', 'semester', 'sem')
  if (!reg || !year || !term) throw new Error('row needs registrationNumber, academicYear and term')

  await pool.query(`
    INSERT INTO academic_records
      (tenant_id, registration_number, student_name, program, school_dept, campus,
       academic_year, term, credits_registered, credits_earned, gpa, cgpa, attendance_pct, status, source, synced_at,
       app_id)
    -- $2 is cast explicitly: without it Postgres deduces varchar from the
    -- INSERT target and text from the comparison below, and rejects the
    -- statement with "inconsistent types deduced for parameter $2".
    VALUES ($1,$2::text,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'sync',NOW(),
       (SELECT id FROM applications WHERE registration_number = $2::text AND tenant_id = $1 LIMIT 1))
    ON CONFLICT (tenant_id, registration_number, academic_year, term) DO UPDATE SET
      student_name = EXCLUDED.student_name, program = EXCLUDED.program,
      school_dept = EXCLUDED.school_dept, campus = EXCLUDED.campus,
      credits_registered = EXCLUDED.credits_registered, credits_earned = EXCLUDED.credits_earned,
      gpa = EXCLUDED.gpa, cgpa = EXCLUDED.cgpa, attendance_pct = EXCLUDED.attendance_pct,
      status = EXCLUDED.status, source = 'sync', synced_at = NOW(),
      app_id = COALESCE(academic_records.app_id, EXCLUDED.app_id);`,
    [tenantId, String(reg), pick(row, 'studentName', 'student_name', 'name') || '',
     pick(row, 'program', 'course') || '', pick(row, 'schoolDept', 'school_dept', 'school') || '',
     pick(row, 'campus') || '', String(year), String(term),
     num(pick(row, 'creditsRegistered', 'credits_registered')) ?? 0,
     num(pick(row, 'creditsEarned', 'credits_earned')) ?? 0,
     num(pick(row, 'gpa', 'sgpa')), num(pick(row, 'cgpa')),
     num(pick(row, 'attendancePct', 'attendance_pct', 'attendance')),
     pick(row, 'status') || ''])
}

async function upsertExamResult(tenantId, row) {
  const reg = pick(row, 'registrationNumber', 'registration_number', 'regNo', 'reg_no')
  const examCode = pick(row, 'examCode', 'exam_code', 'exam')
  const subjectCode = pick(row, 'subjectCode', 'subject_code', 'subject')
  if (!reg || !examCode || !subjectCode) throw new Error('row needs registrationNumber, examCode and subjectCode')

  const max = num(pick(row, 'maxMarks', 'max_marks', 'total')) ?? 100
  const got = num(pick(row, 'obtainedMarks', 'obtained_marks', 'marks', 'score'))
  // Trust an explicit result field; derive a sensible one only when the source
  // gave marks but no verdict.
  const explicit = pick(row, 'result', 'status')
  const derived = got == null ? '' : (got >= max * 0.4 ? 'Pass' : 'Fail')

  await pool.query(`
    INSERT INTO exam_results
      (tenant_id, registration_number, student_name, program, academic_year, term, exam_code,
       subject_code, subject_name, max_marks, obtained_marks, grade, result, exam_date, source, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'sync',NOW())
    ON CONFLICT (tenant_id, registration_number, exam_code, subject_code) DO UPDATE SET
      student_name = EXCLUDED.student_name, program = EXCLUDED.program,
      academic_year = EXCLUDED.academic_year, term = EXCLUDED.term,
      subject_name = EXCLUDED.subject_name, max_marks = EXCLUDED.max_marks,
      obtained_marks = EXCLUDED.obtained_marks, grade = EXCLUDED.grade,
      result = EXCLUDED.result, exam_date = EXCLUDED.exam_date,
      source = 'sync', synced_at = NOW();`,
    [tenantId, String(reg), pick(row, 'studentName', 'student_name', 'name') || '',
     pick(row, 'program', 'course') || '', pick(row, 'academicYear', 'academic_year', 'year') || '',
     pick(row, 'term', 'semester', 'sem') || '', String(examCode), String(subjectCode),
     pick(row, 'subjectName', 'subject_name', 'title') || '', max, got,
     pick(row, 'grade') || '', explicit || derived,
     pick(row, 'examDate', 'exam_date') || null])
}

// Exported so the scheduler in index.js can drive the same code path as the
// "Run now" button — one implementation, one set of logs.
export async function runSyncJob({ row, tenantId, triggerSource = 'manual' }) {
  const started = Date.now()
  const logRes = await pool.query(`
    INSERT INTO integration_sync_logs
      (tenant_id, job_id, connector_code, entity, direction, trigger_source, status)
    VALUES ($1,$2,$3,$4,$5,$6,'running') RETURNING id;`,
    [tenantId, row.job_id, row.code, row.job_entity, row.job_direction, triggerSource])
  const logId = logRes.rows[0].id

  let read = 0, written = 0, failed = 0, error = ''
  try {
    if (!row.base_url) throw new Error('Connector has no base URL.')

    if (row.job_direction === 'pull') {
      const resp = await axios.get(joinUrl(row.base_url, row.job_path), requestConfig(row))
      if (resp.status < 200 || resp.status >= 300) throw new Error(`Source returned HTTP ${resp.status}`)
      // Accept a bare array or the common { data: [...] } / { records: [...] } envelopes.
      const rows = Array.isArray(resp.data) ? resp.data
        : Array.isArray(resp.data?.data) ? resp.data.data
        : Array.isArray(resp.data?.records) ? resp.data.records
        : null
      if (!rows) throw new Error('Expected a JSON array, or an object with a data/records array.')
      read = rows.length

      const upsert = row.job_entity === 'academic_records' ? upsertAcademicRecord
        : row.job_entity === 'exam_results' ? upsertExamResult
        : null
      if (!upsert) throw new Error(`No pull handler for entity "${row.job_entity}".`)

      // One bad row must not abandon the rest of the batch; the count of
      // failures is reported instead.
      for (const r of rows) {
        try { await upsert(tenantId, r); written++ }
        catch (e) { failed++; if (!error) error = `First row error: ${e.message}` }
      }
    } else {
      // Push: send admitted students the connector hasn't acknowledged yet.
      const pending = await pool.query(`
        SELECT id, app_no, name, email, mobile, course, campus, school_dept,
               registration_number, admission_number, admission_details, admission_full_details
        FROM applications
        WHERE tenant_id = $1 AND COALESCE(registration_number,'') <> ''
          AND COALESCE(campusone_sync_status,'') <> 'Success'
        ORDER BY id LIMIT 200;`, [tenantId])
      read = pending.rows.length

      for (const a of pending.rows) {
        try {
          const resp = await axios.post(joinUrl(row.base_url, row.job_path), {
            studentName: a.name, email: a.email, mobile: a.mobile,
            applicationNumber: a.app_no, registrationNumber: a.registration_number,
            admissionNumber: a.admission_number, program: a.course || a.school_dept || '',
            campus: a.campus || '', admissionDetails: a.admission_details || {},
            admissionFullDetails: a.admission_full_details || {},
          }, requestConfig(row))
          if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}`)
          const remoteId = resp.data?.studentId || resp.data?.id || null
          await pool.query(`
            UPDATE applications SET campusone_sync_status = 'Success', campusone_student_id = $1,
                   campusone_sync_error = '', campusone_synced_at = NOW()
            WHERE id = $2 AND tenant_id = $3;`, [remoteId, a.id, tenantId])
          written++
        } catch (e) {
          failed++
          if (!error) error = `First push error (${a.app_no}): ${e.message}`
          await pool.query(`
            UPDATE applications SET campusone_sync_status = 'Failed', campusone_sync_error = $1,
                   campusone_synced_at = NOW()
            WHERE id = $2 AND tenant_id = $3;`, [String(e.message).slice(0, 500), a.id, tenantId]).catch(() => {})
        }
      }
    }
  } catch (e) {
    error = e.message
  }

  // A run that wrote nothing because every row failed is not a success.
  const status = error && written === 0 ? 'failed' : failed > 0 ? 'partial' : 'success'
  const durationMs = Date.now() - started

  await pool.query(`
    UPDATE integration_sync_logs
    SET status = $1, records_read = $2, records_written = $3, records_failed = $4,
        error = $5, finished_at = NOW(), duration_ms = $6
    WHERE id = $7;`,
    [status, read, written, failed, String(error).slice(0, 2000), durationMs, logId])

  await pool.query(`
    UPDATE integration_sync_jobs
    SET last_run_at = NOW(), last_status = $1, last_records = $2, last_error = $3
    WHERE id = $4;`,
    [status, written, String(error).slice(0, 500), row.job_id])

  return { logId, status, recordsRead: read, recordsWritten: written, recordsFailed: failed, durationMs, error: error || null }
}

// Runs every enabled job across every tenant. Called from the hourly cron.
export async function runScheduledSyncJobs() {
  try {
    const r = await pool.query(`
      SELECT j.*, c.*, j.id AS job_id, j.entity AS job_entity, j.direction AS job_direction,
             j.path AS job_path, j.tenant_id AS job_tenant
      FROM integration_sync_jobs j
      JOIN integration_connectors c ON c.id = j.connector_id
      WHERE j.enabled AND c.enabled;`)
    for (const row of r.rows) {
      try {
        await runSyncJob({ row, tenantId: row.job_tenant, triggerSource: 'schedule' })
      } catch (e) {
        console.error(`[sync:${row.code}/${row.job_entity}]`, e.message)
      }
    }
    if (r.rows.length) console.log(`[Cron] Ran ${r.rows.length} integration sync job(s)`)
  } catch (err) {
    console.error('[runScheduledSyncJobs]', err.message)
  }
}

export default router
