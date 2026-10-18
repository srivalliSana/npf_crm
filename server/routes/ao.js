// Admission Officer (AO) review — the final document-validation gate.
//
//   ops verifies every mandatory doc ──► application enters the AO queue
//   AO approves  ──► provisional letter (if not yet sent) + ERP push
//   AO requests changes ──► named docs rejected with reasons ──► student
//                           chased automatically ──► re-verify ──► back in queue
//
// The ERP gate is 'auto' by default: it only holds the CampusOne push when the
// tenant actually has an active Admission Officer, so tenants without one keep
// today's behaviour unchanged.
import express from 'express'
import { pool } from '../db.js'
import { authenticateToken } from '../lib/auth.js'
import { requirePermission } from '../lib/permissions.js'
import { recordAudit, clientIp } from '../lib/audit.js'
import { emitEvent, getMode } from '../lib/automation.js'

let deps = {}
export function initAo(d) { deps = { ...deps, ...d } }

export const AO_ROLE = 'Admission Officer'

export async function initAoSchema() {
  const run = (sql) => pool.query(sql).catch((e) => console.error('[AO schema]', e.message))
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ao_status VARCHAR(30) DEFAULT 'Not Ready';`) // Not Ready | Pending Review | Approved | Changes Requested
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ao_queued_at TIMESTAMP;`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ao_reviewed_by VARCHAR(255) DEFAULT '';`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ao_reviewed_at TIMESTAMP;`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS ao_remarks TEXT DEFAULT '';`)
  await run(`CREATE INDEX IF NOT EXISTS idx_app_ao_status ON applications (tenant_id, ao_status);`)
  // Applications whose documents were already complete before this gate
  // existed are queued once, silently — no notification, just visible to the AO.
  await run(`UPDATE applications a SET ao_status = 'Pending Review', ao_queued_at = NOW()
    WHERE ao_status = 'Not Ready' AND campusone_sync_status <> 'Success'
      AND EXISTS (SELECT 1 FROM documents d WHERE d.app_id = a.id AND d.is_mandatory)
      AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.app_id = a.id AND d.is_mandatory AND d.status <> 'Verified');`)
}

export async function getAoGate(tenantId) {
  const r = await pool.query(`SELECT value FROM integration_settings WHERE key = 'ao_gate' AND tenant_id = $1;`, [tenantId]).catch(() => ({ rows: [] }))
  return r.rows[0]?.value || 'auto'
}

// True when the CampusOne push must wait for AO approval.
export async function aoGateActive(tenantId) {
  const gate = await getAoGate(tenantId)
  if (gate === 'on') return true
  if (gate === 'off') return false
  const r = await pool.query(`SELECT 1 FROM users WHERE role = $1 AND status = 'Active' AND tenant_id = $2 LIMIT 1;`, [AO_ROLE, tenantId])
  return r.rows.length > 0
}

// Called whenever a document decision might have completed the set.
export async function queueForAoReview(appId, tenantId) {
  const r = await pool.query(
    `UPDATE applications SET ao_status = 'Pending Review', ao_queued_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND ao_status IN ('Not Ready', 'Changes Requested') RETURNING app_no;`, [appId, tenantId])
  if (r.rowCount) emitEvent(tenantId, 'application.ao_queued', 'application', appId, { appNo: r.rows[0].app_no })
  return r.rowCount > 0
}

const router = express.Router()
router.use(authenticateToken)
const review = requirePermission('documents.ao_review')

const APP_COLS = `a.id, a.name, a.app_no, a.email, a.mobile, a.course, a.campus, a.owner, a.created_at,
  a.ao_status, a.ao_queued_at, a.ao_reviewed_by, a.ao_reviewed_at, a.ao_remarks,
  a.booking_fee_status, a.application_fee_paid, a.pay_status, a.tuition_fee_paid, a.registration_number,
  a.campusone_sync_status, a.admission_letter_sent_at, a.admission_details_status,
  (SELECT COUNT(*) FROM documents d WHERE d.app_id = a.id AND d.is_mandatory)::int AS docs_total,
  (SELECT COUNT(*) FROM documents d WHERE d.app_id = a.id AND d.is_mandatory AND d.status = 'Verified')::int AS docs_verified,
  (SELECT COUNT(*) FROM documents d WHERE d.app_id = a.id AND d.status = 'Rejected')::int AS docs_rejected`

router.get('/overview', review, async (req, res) => {
  try {
    const t = [req.tenantId]
    const [counts, gate, gateActive, aoUsers] = await Promise.all([
      pool.query(`SELECT ao_status, COUNT(*)::int AS n FROM applications WHERE tenant_id = $1 GROUP BY ao_status;`, t),
      getAoGate(req.tenantId), aoGateActive(req.tenantId),
      pool.query(`SELECT name, email FROM users WHERE role = $2 AND status = 'Active' AND tenant_id = $1 ORDER BY name;`, [req.tenantId, AO_ROLE]),
    ])
    const n = (s) => counts.rows.find((r) => r.ao_status === s)?.n || 0
    res.json({
      gate, gateActive, aoUsers: aoUsers.rows,
      counts: { pending: n('Pending Review'), changes: n('Changes Requested'), approved: n('Approved'), notReady: n('Not Ready') },
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/gate', requirePermission('settings.manage'), async (req, res) => {
  const { gate } = req.body
  if (!['auto', 'on', 'off'].includes(gate)) return res.status(400).json({ error: 'gate must be auto | on | off' })
  await pool.query(
    `INSERT INTO integration_settings (key, value, updated_at, tenant_id) VALUES ('ao_gate', $1, NOW(), $2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`, [gate, req.tenantId])
  recordAudit({ tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role, action: 'ao.gate', entityType: 'settings', summary: `AO gate → ${gate}`, ip: clientIp(req) }).catch(() => {})
  res.json({ gate, gateActive: await aoGateActive(req.tenantId) })
})

router.get('/queue', review, async (req, res) => {
  const status = { pending: 'Pending Review', changes: 'Changes Requested', approved: 'Approved' }[req.query.status] || 'Pending Review'
  try {
    const r = await pool.query(
      `SELECT ${APP_COLS} FROM applications a WHERE a.tenant_id = $1 AND a.ao_status = $2
       ORDER BY ${status === 'Approved' ? 'a.ao_reviewed_at DESC NULLS LAST' : 'a.ao_queued_at ASC NULLS LAST'} LIMIT 300;`, [req.tenantId, status])
    res.json(r.rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/applications/:id', review, async (req, res) => {
  try {
    const app = (await pool.query(`SELECT ${APP_COLS}, a.admission_details, a.admission_full_details FROM applications a WHERE a.id = $1 AND a.tenant_id = $2;`, [req.params.id, req.tenantId])).rows[0]
    if (!app) return res.status(404).json({ error: 'Application not found.' })
    const docs = (await pool.query(
      `SELECT id, type, status, file_url, upload_date, is_mandatory, verified_by, verified_at, rejection_reason, file_size
       FROM documents WHERE app_id = $1 AND tenant_id = $2 ORDER BY is_mandatory DESC, type;`, [app.id, req.tenantId])).rows
    res.json({ ...app, documents: docs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/applications/:id/decision', review, async (req, res) => {
  const { decision, remarks = '', rejectedDocs = [] } = req.body
  if (!['approve', 'changes'].includes(decision)) return res.status(400).json({ error: 'decision must be approve | changes' })
  try {
    const app = (await pool.query('SELECT * FROM applications WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])).rows[0]
    if (!app) return res.status(404).json({ error: 'Application not found.' })
    const by = req.user.email

    if (decision === 'approve') {
      const pending = (await pool.query(`SELECT COUNT(*)::int AS n FROM documents WHERE app_id = $1 AND is_mandatory AND status <> 'Verified';`, [app.id])).rows[0].n
      if (pending > 0) return res.status(400).json({ error: `${pending} mandatory document(s) are not verified yet.` })
      await pool.query(
        `UPDATE applications SET ao_status = 'Approved', ao_reviewed_by = $1, ao_reviewed_at = NOW(), ao_remarks = $2 WHERE id = $3;`, [by, remarks, app.id])
      emitEvent(req.tenantId, 'application.ao_approved', 'application', app.id, { appNo: app.app_no, by })
      // The gate may have been the only thing holding the ERP push.
      deps.checkAndAutoSyncCampusOne?.(app.id, req.tenantId).catch(() => {})
      // Outbound mail follows the tenant's automation mode: dry_run/off → nothing leaves the system.
      if (!app.admission_letter_sent_at && (await getMode(req.tenantId)) === 'live') deps.autoSendAdmissionLetter?.(app.app_no, '', req.tenantId).catch((e) => console.error('[AO letter]', e.message))
      recordAudit({ tenantId: req.tenantId, actorId: req.user.id, actorEmail: by, actorRole: req.user.role, action: 'ao.approve', entityType: 'application', entityId: app.id, summary: `AO approved ${app.app_no}`, ip: clientIp(req) }).catch(() => {})
      return res.json({ ok: true, aoStatus: 'Approved' })
    }

    // changes requested
    if (!rejectedDocs.length && !remarks.trim()) return res.status(400).json({ error: 'Name at least one document to re-submit, or give remarks.' })
    const rejected = []
    for (const d of rejectedDocs) {
      const r = await pool.query(
        `UPDATE documents SET status = 'Rejected', verified_by = $1, verified_at = NOW(), rejection_reason = $2
         WHERE id = $3 AND app_id = $4 AND tenant_id = $5 RETURNING id, type;`, [by, d.reason || remarks || 'Rejected by Admission Officer', d.id, app.id, req.tenantId])
      if (r.rows[0]) {
        rejected.push({ ...r.rows[0], reason: d.reason || remarks })
        emitEvent(req.tenantId, 'document.rejected', 'application', app.id, { docId: r.rows[0].id, docType: r.rows[0].type, rejectionReason: d.reason || remarks || '', by })
      }
    }
    await pool.query(
      `UPDATE applications SET ao_status = 'Changes Requested', ao_reviewed_by = $1, ao_reviewed_at = NOW(), ao_remarks = $2 WHERE id = $3;`, [by, remarks, app.id])
    emitEvent(req.tenantId, 'application.ao_changes_requested', 'application', app.id, { appNo: app.app_no, by, docs: rejected.map((d) => d.type) })
    if (app.email && deps.sendMail && (await getMode(req.tenantId)) === 'live') {
      const list = rejected.length ? rejected.map((d) => `• ${d.type}${d.reason ? ` — ${d.reason}` : ''}`).join('\n') : ''
      await deps.sendMail(app.email, `Action needed on your application ${app.app_no}`,
        `Dear ${app.name},\n\nThe Admission Office has reviewed your application and needs the following before it can be finalised:\n\n${list || remarks}\n${list && remarks ? `\nRemarks: ${remarks}\n` : ''}\nPlease log in to your student portal and re-upload the documents listed above.\n\nAdmissions Office`, req.tenantId).catch(() => {})
    }
    recordAudit({ tenantId: req.tenantId, actorId: req.user.id, actorEmail: by, actorRole: req.user.role, action: 'ao.changes', entityType: 'application', entityId: app.id, summary: `AO requested changes on ${app.app_no}: ${rejected.map((d) => d.type).join(', ')}`, ip: clientIp(req) }).catch(() => {})
    res.json({ ok: true, aoStatus: 'Changes Requested', rejected })
  } catch (e) { console.error('[AO decision]', e.message); res.status(500).json({ error: e.message }) }
})

// Re-send the provisional admission letter on demand.
router.post('/applications/:id/send-letter', review, async (req, res) => {
  const app = (await pool.query('SELECT app_no FROM applications WHERE id = $1 AND tenant_id = $2;', [req.params.id, req.tenantId])).rows[0]
  if (!app) return res.status(404).json({ error: 'Application not found.' })
  if ((await getMode(req.tenantId)) !== 'live') return res.status(409).json({ error: 'Automation is not live for this tenant — switch to Live on the Automation page to send emails.' })
  try { await deps.autoSendAdmissionLetter(app.app_no, '', req.tenantId); res.json({ ok: true }) }
  catch (e) { res.status(502).json({ error: e.message }) }
})

export default router
