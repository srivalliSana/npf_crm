// Automation admin API — rules, reminders queue, escalations, journey view.
import express from 'express'
import { pool } from '../db.js'
import { authenticateToken } from '../lib/auth.js'
import { requirePermission } from '../lib/permissions.js'
import { recordAudit, clientIp } from '../lib/audit.js'
import {
  getMode, setMode, SEQUENCES, journeyFor, emitEvent,
  runScheduledJobs, runEscalationSweep, provisionLms, seedDefaults,
} from '../lib/automation.js'

const router = express.Router()
router.use(authenticateToken)

const view = requirePermission('automation.view')
const manage = requirePermission('automation.manage')

router.get('/overview', view, async (req, res) => {
  const t = [req.tenantId]
  try {
    const [mode, rules, esc, jobs, runs24, openEsc, recentEvents, recentRuns, journey] = await Promise.all([
      getMode(req.tenantId),
      pool.query('SELECT * FROM automation_rules WHERE tenant_id = $1 ORDER BY id;', t),
      pool.query('SELECT * FROM escalation_rules WHERE tenant_id = $1 ORDER BY id;', t),
      pool.query(`SELECT status, COUNT(*)::int AS n FROM scheduled_jobs WHERE tenant_id = $1 GROUP BY status;`, t),
      pool.query(`SELECT status, COUNT(*)::int AS n FROM automation_runs WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours' GROUP BY status;`, t),
      pool.query(`SELECT COUNT(*)::int AS n FROM escalations WHERE tenant_id = $1 AND status = 'open';`, t),
      pool.query(`SELECT * FROM automation_events WHERE tenant_id = $1 ORDER BY id DESC LIMIT 50;`, t),
      pool.query(`SELECT * FROM automation_runs WHERE tenant_id = $1 ORDER BY id DESC LIMIT 100;`, t),
      pool.query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE booking_fee_status = 'Paid' OR application_fee_paid OR pay_status = 'Approved')::int AS fee_paid,
          COUNT(*) FILTER (WHERE tuition_fee_paid)::int AS tuition_paid,
          COUNT(*) FILTER (WHERE campusone_sync_status = 'Success')::int AS erp_synced,
          COUNT(*) FILTER (WHERE campusone_sync_status = 'Failed')::int AS erp_failed,
          COUNT(*) FILTER (WHERE lms_sync_status = 'Success')::int AS lms_provisioned,
          COUNT(*) FILTER (WHERE lms_sync_status = 'Failed')::int AS lms_failed
        FROM applications WHERE tenant_id = $1;`, t),
    ])
    const count = (rows, s) => rows.find((r) => r.status === s)?.n || 0
    res.json({
      mode,
      rules: rules.rows, escalationRules: esc.rows,
      sequences: Object.entries(SEQUENCES).map(([code, s]) => ({ code, label: s.label, entity: s.entity, audience: s.audience, steps: s.steps.length })),
      queue: { pending: count(jobs.rows, 'pending'), done: count(jobs.rows, 'done'), skipped: count(jobs.rows, 'skipped'), failed: count(jobs.rows, 'failed'), cancelled: count(jobs.rows, 'cancelled') },
      runs24h: { success: count(runs24.rows, 'success'), dryRun: count(runs24.rows, 'dry_run'), failed: count(runs24.rows, 'failed') },
      openEscalations: openEsc.rows[0].n,
      journey: journey.rows[0],
      recentEvents: recentEvents.rows, recentRuns: recentRuns.rows,
    })
  } catch (e) { console.error('[automation/overview]', e.message); res.status(500).json({ error: e.message }) }
})

router.put('/mode', manage, async (req, res) => {
  const { mode } = req.body
  if (!['live', 'dry_run', 'off'].includes(mode)) return res.status(400).json({ error: 'mode must be live | dry_run | off' })
  await setMode(req.tenantId, mode)
  recordAudit({ tenantId: req.tenantId, user: req.user, action: 'automation.mode', resource: 'automation', detail: { mode }, ip: clientIp(req) }).catch(() => {})
  res.json({ mode })
})

router.put('/rules/:id', manage, async (req, res) => {
  const { enabled, dryRun, name, description, actions, conditions } = req.body
  try {
    const r = await pool.query(
      `UPDATE automation_rules SET enabled = COALESCE($1, enabled), dry_run = COALESCE($2, dry_run),
         name = COALESCE($3, name), description = COALESCE($4, description),
         actions = COALESCE($5::jsonb, actions), conditions = COALESCE($6::jsonb, conditions), updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8 RETURNING *;`,
      [enabled ?? null, dryRun ?? null, name ?? null, description ?? null,
       actions ? JSON.stringify(actions) : null, conditions ? JSON.stringify(conditions) : null, req.params.id, req.tenantId])
    if (!r.rows.length) return res.status(404).json({ error: 'Rule not found.' })
    res.json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/escalation-rules/:id', manage, async (req, res) => {
  const { enabled, hours, name, actions } = req.body
  try {
    const r = await pool.query(
      `UPDATE escalation_rules SET enabled = COALESCE($1, enabled), hours = COALESCE($2, hours), name = COALESCE($3, name),
         actions = COALESCE($4::jsonb, actions), updated_at = NOW() WHERE id = $5 AND tenant_id = $6 RETURNING *;`,
      [enabled ?? null, hours ?? null, name ?? null, actions ? JSON.stringify(actions) : null, req.params.id, req.tenantId])
    if (!r.rows.length) return res.status(404).json({ error: 'Rule not found.' })
    res.json(r.rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/rules/reset-defaults', manage, async (req, res) => {
  await seedDefaults(req.tenantId)
  res.json({ ok: true })
})

router.get('/jobs', view, async (req, res) => {
  const status = req.query.status || 'pending'
  const r = await pool.query(
    `SELECT j.*, COALESCE(a.app_no, l.name) AS entity_label, COALESCE(a.name, l.name) AS entity_name
     FROM scheduled_jobs j
     LEFT JOIN applications a ON j.entity_type = 'application' AND a.id = j.entity_id
     LEFT JOIN leads l ON j.entity_type = 'lead' AND l.id = j.entity_id
     WHERE j.tenant_id = $1 AND j.status = $2 ORDER BY j.run_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200;`,
    [req.tenantId, status])
  res.json(r.rows)
})

router.post('/jobs/:id/cancel', manage, async (req, res) => {
  const r = await pool.query(
    `UPDATE scheduled_jobs SET status = 'cancelled', executed_at = NOW(), result = $3 WHERE id = $1 AND tenant_id = $2 AND status = 'pending' RETURNING id;`,
    [req.params.id, req.tenantId, `cancelled by ${req.user.email}`])
  res.json({ cancelled: r.rowCount })
})

router.post('/jobs/:id/run-now', manage, async (req, res) => {
  await pool.query(`UPDATE scheduled_jobs SET run_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'pending';`, [req.params.id, req.tenantId])
  await runScheduledJobs()
  const r = await pool.query('SELECT status, result FROM scheduled_jobs WHERE id = $1;', [req.params.id])
  res.json(r.rows[0] || {})
})

router.get('/escalations', view, async (req, res) => {
  const status = req.query.status || 'open'
  const r = await pool.query(
    `SELECT e.*, r.name AS rule_name, COALESCE(a.owner, l.owner) AS owner FROM escalations e
     LEFT JOIN escalation_rules r ON r.code = e.rule_code AND r.tenant_id = e.tenant_id
     LEFT JOIN applications a ON e.entity_type = 'application' AND a.id = e.entity_id
     LEFT JOIN leads l ON e.entity_type = 'lead' AND l.id = e.entity_id
     WHERE e.tenant_id = $1 AND e.status = $2 ORDER BY e.created_at DESC LIMIT 300;`, [req.tenantId, status])
  res.json(r.rows)
})

router.post('/escalations/:id/resolve', manage, async (req, res) => {
  const r = await pool.query(
    `UPDATE escalations SET status = 'resolved', resolved_at = NOW(), detail = detail || $3 WHERE id = $1 AND tenant_id = $2 RETURNING id;`,
    [req.params.id, req.tenantId, ` | resolved manually by ${req.user.email}`])
  res.json({ resolved: r.rowCount })
})

router.post('/sweep', manage, async (req, res) => {
  await runEscalationSweep()
  const n = await pool.query(`SELECT COUNT(*)::int AS n FROM escalations WHERE tenant_id = $1 AND status = 'open';`, [req.tenantId])
  res.json({ openEscalations: n.rows[0].n })
})

router.get('/journey/:appId', view, async (req, res) => {
  const j = await journeyFor(req.params.appId, req.tenantId)
  if (!j) return res.status(404).json({ error: 'Application not found.' })
  res.json(j)
})

router.post('/journey/:appId/provision-lms', manage, async (req, res) => {
  const r = await provisionLms(req.params.appId, req.tenantId)
  res.status(r.success ? 200 : 502).json(r)
})

// Fire a synthetic event — used to rehearse a rule in dry-run mode.
router.post('/test-event', manage, async (req, res) => {
  const { eventType, entityType, entityId, payload } = req.body
  if (!eventType || !entityType || !entityId) return res.status(400).json({ error: 'eventType, entityType, entityId required' })
  await emitEvent(req.tenantId, eventType, entityType, Number(entityId), { ...(payload || {}), test: true })
  const runs = await pool.query(
    `SELECT rule_code, action_type, status, detail FROM automation_runs WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 ORDER BY id DESC LIMIT 20;`,
    [req.tenantId, entityType, entityId])
  res.json({ runs: runs.rows })
})

export default router
