// Automation engine — the "zero-touch" layer over the admission journey.
//
//   event  ──► rules (per tenant, toggleable, dry-run-able) ──► actions
//                                   │
//                                   └─► scheduled_jobs (Postgres queue, 1-min tick)
//   cron   ──► escalation rules (SLA sweeps, deduped, auto-resolving)
//
// Postgres is the queue on purpose: the app already runs one process with
// node-cron, and FOR UPDATE SKIP LOCKED gives at-most-once execution even if a
// second instance is ever started. Nothing here invents side effects it can't
// log — every action lands in automation_runs.
import { pool } from '../db.js'
import axios from 'axios'
import { decryptSecret } from './secrets.js'

let deps = {}
export function initAutomation(d) { deps = { ...deps, ...d } }

const log = (...a) => console.log('[Automation]', ...a)
const warn = (...a) => console.error('[Automation]', ...a)

// ── Schema ───────────────────────────────────────────────────────────────────
export async function initAutomationSchema() {
  const run = (sql) => pool.query(sql).catch((e) => warn('schema:', e.message))

  await run(`CREATE TABLE IF NOT EXISTS automation_rules (
    id SERIAL PRIMARY KEY, tenant_id INTEGER DEFAULT 1, code VARCHAR(80) NOT NULL,
    name VARCHAR(200) NOT NULL, description TEXT DEFAULT '', event_type VARCHAR(80) NOT NULL,
    conditions JSONB DEFAULT '{}', actions JSONB DEFAULT '[]',
    enabled BOOLEAN DEFAULT TRUE, dry_run BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, code));`)

  await run(`CREATE TABLE IF NOT EXISTS automation_events (
    id BIGSERIAL PRIMARY KEY, tenant_id INTEGER DEFAULT 1, event_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) DEFAULT '', entity_id INTEGER, payload JSONB DEFAULT '{}',
    rules_matched INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW());`)
  await run(`CREATE INDEX IF NOT EXISTS idx_auto_events_tenant ON automation_events (tenant_id, created_at DESC);`)

  await run(`CREATE TABLE IF NOT EXISTS automation_runs (
    id BIGSERIAL PRIMARY KEY, tenant_id INTEGER DEFAULT 1, event_id BIGINT, rule_code VARCHAR(80) DEFAULT '',
    action_type VARCHAR(60) NOT NULL, entity_type VARCHAR(40) DEFAULT '', entity_id INTEGER,
    status VARCHAR(20) NOT NULL, detail TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW());`)
  await run(`CREATE INDEX IF NOT EXISTS idx_auto_runs_tenant ON automation_runs (tenant_id, created_at DESC);`)

  await run(`CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id BIGSERIAL PRIMARY KEY, tenant_id INTEGER DEFAULT 1, job_type VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) DEFAULT '', entity_id INTEGER, dedupe_key VARCHAR(200) UNIQUE,
    run_at TIMESTAMP NOT NULL, status VARCHAR(20) DEFAULT 'pending', attempts INTEGER DEFAULT 0,
    payload JSONB DEFAULT '{}', result TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(), executed_at TIMESTAMP);`)
  await run(`CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_jobs (status, run_at);`)
  await run(`CREATE INDEX IF NOT EXISTS idx_sched_entity ON scheduled_jobs (tenant_id, entity_type, entity_id);`)

  await run(`CREATE TABLE IF NOT EXISTS escalation_rules (
    id SERIAL PRIMARY KEY, tenant_id INTEGER DEFAULT 1, code VARCHAR(80) NOT NULL,
    name VARCHAR(200) NOT NULL, description TEXT DEFAULT '', entity_type VARCHAR(40) NOT NULL,
    hours INTEGER NOT NULL, actions JSONB DEFAULT '[]', enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, code));`)

  await run(`CREATE TABLE IF NOT EXISTS escalations (
    id BIGSERIAL PRIMARY KEY, tenant_id INTEGER DEFAULT 1, rule_code VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL, entity_id INTEGER NOT NULL, entity_label VARCHAR(255) DEFAULT '',
    dedupe_key VARCHAR(200) UNIQUE, status VARCHAR(20) DEFAULT 'open', detail TEXT DEFAULT '',
    notified_to TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(), resolved_at TIMESTAMP);`)
  await run(`CREATE INDEX IF NOT EXISTS idx_escalations_open ON escalations (tenant_id, status, created_at DESC);`)

  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`)
  await run(`UPDATE applications SET created_at = COALESCE(
      to_timestamp(NULLIF(substring(date from '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}'), ''), 'DD/MM/YYYY'), NOW())
    WHERE created_at IS NULL;`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS lms_sync_status VARCHAR(30) DEFAULT 'Pending';`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS lms_user_id VARCHAR(100);`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS lms_sync_error TEXT DEFAULT '';`)
  await run(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS lms_synced_at TIMESTAMP;`)
  await run(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;`)

  const tenants = await pool.query('SELECT id FROM tenants').catch(() => ({ rows: [{ id: 1 }] }))
  for (const { id } of tenants.rows) {
    await seedDefaults(id)
    // SLA sweeps only ever look at records created after this moment. Without
    // it the first sweep on an existing install escalates years of backlog.
    await pool.query(
      `INSERT INTO integration_settings (key, value, updated_at, tenant_id) VALUES ('automation_since', NOW()::text, NOW(), $1)
       ON CONFLICT (tenant_id, key) DO NOTHING;`, [id]).catch((e) => warn('automation_since', e.message))
  }
  log('schema ready')
}

export async function getSince(tenantId) {
  const r = await pool.query(`SELECT value FROM integration_settings WHERE key = 'automation_since' AND tenant_id = $1;`, [tenantId]).catch(() => ({ rows: [] }))
  const d = r.rows[0]?.value ? new Date(r.rows[0].value) : null
  return d && !Number.isNaN(d.getTime()) ? d : new Date()
}

// ── Default rules (idempotent — a tenant's edits are never overwritten) ──────
const DEFAULT_RULES = [
  { code: 'lead_welcome', event_type: 'lead.created', name: 'Welcome new lead',
    description: 'Email the enquirer immediately and schedule counsellor follow-up nudges while the lead stays Untouched.',
    actions: [
      { type: 'send_email', to: 'student', subject: 'Thanks for your interest in {{course}}',
        body: 'Hi {{name}},\n\nThank you for enquiring about {{course}}. Your counsellor {{owner}} will reach out shortly.\n\nIf you would like to apply now, simply reply to this email.\n\nAdmissions Team' },
      { type: 'schedule_sequence', sequence: 'lead_followup' },
    ] },
  { code: 'lead_interested', event_type: 'lead.stage_changed', name: 'Interested → invite to apply',
    conditions: { newStage: 'Interested' },
    description: 'When a counsellor marks a lead Interested, invite them to apply and nudge on days 1, 3 and 7 until an application exists.',
    actions: [
      { type: 'send_email', to: 'student', subject: 'Start your application for {{course}}',
        body: 'Hi {{name}},\n\nGreat speaking with you. The next step is to start your application for {{course}} — it only takes a few minutes.\n\nYour counsellor {{owner}} is available for any questions.\n\nAdmissions Team' },
      { type: 'schedule_sequence', sequence: 'application_nudge' },
    ] },
  { code: 'lead_not_interested', event_type: 'lead.stage_changed', name: 'Not Interested → stop nudges',
    conditions: { newStage: 'Not Interested' },
    description: 'Cancel every pending reminder for a lead who opted out.',
    actions: [{ type: 'cancel_sequence', sequence: 'lead_followup' }, { type: 'cancel_sequence', sequence: 'application_nudge' }] },
  { code: 'app_created', event_type: 'application.created', name: 'Application started → fee + document chasers',
    description: 'Schedule document reminders (days 1/3/7/14) and application-fee reminders (days 2/5/10). Each reminder re-checks and skips itself once the student has done the step.',
    actions: [
      { type: 'cancel_sequence', sequence: 'application_nudge', entity: 'lead' },
      { type: 'schedule_sequence', sequence: 'docs_pending' },
      { type: 'schedule_sequence', sequence: 'fee_pending' },
    ] },
  { code: 'fee_paid', event_type: 'application.fee_paid', name: 'Application fee paid → stop fee chasers, start tuition chasers',
    actions: [
      { type: 'cancel_sequence', sequence: 'fee_pending' },
      { type: 'schedule_sequence', sequence: 'tuition_pending' },
      { type: 'notify', to: 'owner', title: 'Fee paid: {{appNo}}', text: '{{name}} paid the {{feeType}}.' },
    ] },
  { code: 'doc_rejected', event_type: 'document.rejected', name: 'Document rejected → re-upload chasers',
    actions: [{ type: 'schedule_sequence', sequence: 'doc_reupload' }] },
  { code: 'docs_complete', event_type: 'application.docs_complete', name: 'All documents verified → stop chasers, notify counsellor',
    actions: [
      { type: 'cancel_sequence', sequence: 'docs_pending' },
      { type: 'cancel_sequence', sequence: 'doc_reupload' },
      { type: 'notify', to: 'owner', title: 'Documents complete: {{appNo}}', text: 'All mandatory documents for {{name}} are verified.' },
      { type: 'sync_campusone' },
    ] },
  { code: 'tuition_paid', event_type: 'application.tuition_paid', name: 'Tuition paid → push to ERP',
    actions: [{ type: 'cancel_sequence', sequence: 'tuition_pending' }, { type: 'sync_campusone' }] },
  { code: 'erp_synced', event_type: 'application.erp_synced', name: 'ERP record created → provision LMS',
    actions: [{ type: 'provision_lms' }] },
  { code: 'lms_provisioned', event_type: 'application.lms_provisioned', name: 'LMS account ready → onboarding email',
    actions: [
      { type: 'send_email', to: 'student', subject: 'Your learning portal is ready — {{appNo}}',
        body: 'Dear {{name}},\n\nYour admission to {{course}} is complete and your LMS account has been created.\n\nLogin ID: {{email}}\n\nUse "Forgot password" on the LMS login page to set your password the first time.\n\nWelcome to the university!' },
      { type: 'notify', to: 'owner', title: 'Journey complete: {{appNo}}', text: '{{name}} is enrolled in ERP and LMS. No further action.' },
    ] },
]

const DEFAULT_ESCALATIONS = [
  { code: 'lead_untouched_24h', entity_type: 'lead', hours: 24, name: 'Lead untouched for 24h',
    description: 'Counsellor and their manager are told; a call task is created.',
    actions: [{ type: 'notify', to: 'owner' }, { type: 'notify', to: 'manager' }, { type: 'create_task' }] },
  { code: 'lead_untouched_72h', entity_type: 'lead', hours: 72, name: 'Lead untouched for 72h → reassign', enabled: false,
    description: 'Lead is moved to the next counsellor in the round-robin. Off by default — enable once the 24h rule has been observed for a few days.',
    actions: [{ type: 'reassign' }, { type: 'notify', to: 'manager' }] },
  { code: 'docs_pending_7d', entity_type: 'application', hours: 168, name: 'Documents pending 7 days',
    actions: [{ type: 'notify', to: 'owner' }, { type: 'notify', to: 'manager' }, { type: 'create_task' }] },
  { code: 'fee_pending_10d', entity_type: 'application', hours: 240, name: 'Application fee unpaid 10 days',
    actions: [{ type: 'notify', to: 'owner' }, { type: 'notify', to: 'manager' }] },
  { code: 'tuition_pending_14d', entity_type: 'application', hours: 336, name: 'Tuition unpaid 14 days after application fee',
    actions: [{ type: 'notify', to: 'owner' }, { type: 'notify', to: 'manager' }, { type: 'create_task' }] },
  { code: 'erp_sync_failed', entity_type: 'application', hours: 0, name: 'ERP sync failed',
    actions: [{ type: 'retry_erp' }, { type: 'notify', to: 'admins' }] },
  { code: 'lms_sync_failed', entity_type: 'application', hours: 0, name: 'LMS provisioning failed',
    actions: [{ type: 'retry_lms' }, { type: 'notify', to: 'admins' }] },
]

async function seedDefaults(tenantId) {
  for (const r of DEFAULT_RULES) {
    await pool.query(
      `INSERT INTO automation_rules (tenant_id, code, name, description, event_type, conditions, actions)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id, code) DO NOTHING;`,
      [tenantId, r.code, r.name, r.description || '', r.event_type, JSON.stringify(r.conditions || {}), JSON.stringify(r.actions)]
    ).catch((e) => warn('seed rule', r.code, e.message))
  }
  for (const r of DEFAULT_ESCALATIONS) {
    await pool.query(
      `INSERT INTO escalation_rules (tenant_id, code, name, description, entity_type, hours, actions, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id, code) DO NOTHING;`,
      [tenantId, r.code, r.name, r.description || '', r.entity_type, r.hours, JSON.stringify(r.actions), r.enabled !== false]
    ).catch((e) => warn('seed escalation', r.code, e.message))
  }
}
export { seedDefaults }

// ── Reminder sequences ───────────────────────────────────────────────────────
// Each step re-checks `stillRelevant` right before sending, so a sequence
// never needs to be perfectly cancelled — a stale reminder simply skips itself.
const H = 60 * 60 * 1000
const D = 24 * H

export const SEQUENCES = {
  lead_followup: { entity: 'lead', audience: 'owner', label: 'Counsellor follow-up nudge',
    steps: [
      { offsetMs: 4 * H,  subject: 'Reminder: new lead {{name}} is still untouched', body: '{{name}} ({{course}}, {{city}}) enquired 4 hours ago and has not been contacted yet. Mobile: {{mobile}}' },
      { offsetMs: 1 * D,  subject: 'Day 1: {{name}} still untouched', body: 'Lead {{name}} ({{course}}) has been waiting for a call for 24 hours. Mobile: {{mobile}}' },
      { offsetMs: 2 * D,  subject: 'Day 2: {{name}} still untouched — escalates tomorrow', body: 'Lead {{name}} will be reassigned if not contacted within 24 hours. Mobile: {{mobile}}' },
    ] },
  application_nudge: { entity: 'lead', audience: 'student', label: 'Start-your-application nudge',
    steps: [
      { offsetMs: 1 * D, subject: 'Your application for {{course}} is waiting', body: 'Hi {{name}},\n\nJust a reminder to begin your application for {{course}}. Your counsellor {{owner}} is happy to help.\n\nAdmissions Team' },
      { offsetMs: 3 * D, subject: 'Seats are filling — apply for {{course}}', body: 'Hi {{name}},\n\nSeats for {{course}} are limited. Start your application today to secure your place.\n\nAdmissions Team' },
      { offsetMs: 7 * D, subject: 'Last reminder: apply for {{course}}', body: 'Hi {{name}},\n\nThis is our final reminder to start your application for {{course}}. Reply to this email or call {{owner}} if you need help.\n\nAdmissions Team' },
    ] },
  docs_pending: { entity: 'application', audience: 'student', label: 'Pending documents reminder',
    steps: [1, 3, 7, 14].map((d, i) => ({
      offsetMs: d * D,
      subject: `${['Reminder', 'Day 3 reminder', 'Day 7 reminder', 'Final reminder'][i]}: documents pending for {{appNo}}`,
      body: 'Hi {{name}},\n\nYour application {{appNo}} for {{course}} still has documents pending: {{pendingDocs}}.\n\nPlease log in to your student portal and upload them so we can process your admission.\n\nAdmissions Team',
    })) },
  fee_pending: { entity: 'application', audience: 'student', label: 'Application fee reminder',
    steps: [2, 5, 10].map((d) => ({
      offsetMs: d * D,
      subject: 'Application fee pending — {{appNo}}',
      body: 'Hi {{name}},\n\nYour application {{appNo}} for {{course}} is on hold until the application fee is paid. Please complete the payment from your student portal.\n\nAdmissions Team',
    })) },
  tuition_pending: { entity: 'application', audience: 'student', label: 'Tuition fee reminder',
    steps: [3, 7, 12].map((d) => ({
      offsetMs: d * D,
      subject: 'Confirm your seat — tuition fee pending for {{appNo}}',
      body: 'Hi {{name}},\n\nTo confirm your admission to {{course}}, please pay the tuition fee from your student portal. Your counsellor {{owner}} can share a payment link if needed.\n\nAdmissions Team',
    })) },
  doc_reupload: { entity: 'application', audience: 'student', label: 'Re-upload rejected document',
    steps: [2, 5].map((d) => ({
      offsetMs: d * D,
      subject: 'Action needed: re-upload {{docType}} for {{appNo}}',
      body: 'Hi {{name}},\n\nYour {{docType}} was not accepted{{rejectionReason}}. Please upload a clear copy from your student portal.\n\nAdmissions Team',
    })) },
}

// Returns false when the thing we were going to nag about has already happened.
async function stillRelevant(sequence, ctx, tenantId) {
  switch (sequence) {
    case 'lead_followup': return ctx.lead?.stage === 'Untouched'
    case 'application_nudge': {
      if (!ctx.lead || ['Not Interested', 'Lost', 'Junk'].includes(ctx.lead.stage)) return false
      const r = await pool.query(
        `SELECT 1 FROM applications WHERE tenant_id = $1 AND ((LOWER(email) = LOWER($2) AND $2 <> '') OR mobile = $3) LIMIT 1;`,
        [tenantId, ctx.lead.email || '', ctx.lead.mobile || '']
      )
      return r.rows.length === 0
    }
    case 'docs_pending': return !!ctx.app && !(await allMandatoryDocsVerified(ctx.app.id, tenantId))
    case 'fee_pending': return !!ctx.app && ctx.app.booking_fee_status !== 'Paid' && !ctx.app.application_fee_paid && ctx.app.pay_status !== 'Approved'
    case 'tuition_pending': return !!ctx.app && !ctx.app.tuition_fee_paid
    case 'doc_reupload': {
      if (!ctx.app || !ctx.payload?.docId) return false
      const r = await pool.query('SELECT status FROM documents WHERE id = $1 AND tenant_id = $2;', [ctx.payload.docId, tenantId])
      return r.rows[0]?.status === 'Rejected'
    }
    default: return true
  }
}

async function allMandatoryDocsVerified(appId, tenantId) {
  const r = await pool.query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) AS verified
     FROM documents WHERE app_id = $1 AND is_mandatory = TRUE AND tenant_id = $2;`, [appId, tenantId])
  const { total, verified } = r.rows[0]
  return Number(total) > 0 && Number(total) === Number(verified)
}

async function pendingDocNames(appId, tenantId) {
  const r = await pool.query(
    `SELECT type FROM documents WHERE app_id = $1 AND tenant_id = $2 AND is_mandatory = TRUE AND status <> 'Verified' ORDER BY type;`, [appId, tenantId])
  return r.rows.map((x) => x.type).join(', ') || 'mandatory documents'
}

// ── Context + templating ─────────────────────────────────────────────────────
async function loadContext(entityType, entityId, tenantId, payload = {}) {
  const ctx = { payload, tenantId }
  if (entityType === 'lead') {
    ctx.lead = (await pool.query('SELECT * FROM leads WHERE id = $1 AND tenant_id = $2;', [entityId, tenantId])).rows[0]
  } else if (entityType === 'application') {
    ctx.app = (await pool.query('SELECT * FROM applications WHERE id = $1 AND tenant_id = $2;', [entityId, tenantId])).rows[0]
  }
  const subject = ctx.app || ctx.lead
  if (subject?.owner && subject.owner !== 'Unassigned') {
    ctx.owner = (await pool.query('SELECT id, name, email, mobile, reports_to FROM users WHERE name = $1 AND tenant_id = $2 LIMIT 1;', [subject.owner, tenantId])).rows[0]
  }
  return ctx
}

function vars(ctx) {
  const s = ctx.app || ctx.lead || {}
  return {
    name: s.name || '', email: s.email || '', mobile: s.mobile || '', course: s.course || '', city: s.city || '',
    owner: s.owner && s.owner !== 'Unassigned' ? s.owner : 'our admissions team',
    appNo: ctx.app?.app_no || '', feeType: ctx.payload?.feeType || 'fee',
    docType: ctx.payload?.docType || 'document',
    rejectionReason: ctx.payload?.rejectionReason ? ` (${ctx.payload.rejectionReason})` : '',
    pendingDocs: ctx.pendingDocs || '',
    oldStage: ctx.payload?.oldStage || '', newStage: ctx.payload?.newStage || '',
  }
}
const render = (tpl, v) => String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] ?? ''))

async function resolveRecipient(to, ctx, tenantId) {
  if (to === 'student') { const s = ctx.app || ctx.lead; return s?.email ? [{ email: s.email, name: s.name, mobile: s.mobile }] : [] }
  if (to === 'owner') return ctx.owner?.email ? [ctx.owner] : []
  if (to === 'manager') {
    const r = ctx.owner?.reports_to
      ? await pool.query('SELECT name, email, mobile FROM users WHERE (LOWER(email) = LOWER($1) OR name = $1) AND tenant_id = $2 LIMIT 1;', [ctx.owner.reports_to, tenantId])
      : { rows: [] }
    if (r.rows.length) return r.rows
    return (await pool.query(`SELECT name, email, mobile FROM users WHERE role = 'Manager' AND status = 'Active' AND tenant_id = $1;`, [tenantId])).rows
  }
  if (to === 'admins') return (await pool.query(`SELECT name, email, mobile FROM users WHERE role = 'Admin' AND status = 'Active' AND tenant_id = $1;`, [tenantId])).rows
  return []
}

// ── Mode ─────────────────────────────────────────────────────────────────────
// 'live' | 'dry_run' | 'off' — tenant-wide switch. Rules carry their own
// dry_run flag on top, so one risky rule can be rehearsed while the rest run.
export async function getMode(tenantId) {
  const r = await pool.query(`SELECT value FROM integration_settings WHERE key = 'automation_mode' AND tenant_id = $1;`, [tenantId]).catch(() => ({ rows: [] }))
  return r.rows[0]?.value || 'dry_run'
}
export async function setMode(tenantId, mode) {
  await pool.query(
    `INSERT INTO integration_settings (key, value, updated_at, tenant_id) VALUES ('automation_mode', $1, NOW(), $2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`, [mode, tenantId])
}

async function recordRun(tenantId, { eventId = null, ruleCode = '', actionType, entityType = '', entityId = null, status, detail = '' }) {
  await pool.query(
    `INSERT INTO automation_runs (tenant_id, event_id, rule_code, action_type, entity_type, entity_id, status, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
    [tenantId, eventId, ruleCode, actionType, entityType, entityId, status, String(detail).slice(0, 2000)]
  ).catch((e) => warn('recordRun', e.message))
}

// ── Events ───────────────────────────────────────────────────────────────────
export async function emitEvent(tenantId, eventType, entityType, entityId, payload = {}) {
  try {
    const mode = await getMode(tenantId)
    const ev = (await pool.query(
      `INSERT INTO automation_events (tenant_id, event_type, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,$5) RETURNING id;`,
      [tenantId, eventType, entityType, entityId, JSON.stringify(payload)]
    )).rows[0]
    if (mode === 'off') return

    const rules = (await pool.query(
      `SELECT * FROM automation_rules WHERE tenant_id = $1 AND event_type = $2 AND enabled = TRUE;`, [tenantId, eventType])).rows
    const matched = rules.filter((r) => Object.entries(r.conditions || {}).every(([k, v]) => String(payload[k] ?? '') === String(v)))
    await pool.query('UPDATE automation_events SET rules_matched = $1 WHERE id = $2;', [matched.length, ev.id])
    if (!matched.length) return

    const ctx = await loadContext(entityType, entityId, tenantId, payload)
    for (const rule of matched) {
      const dry = mode === 'dry_run' || rule.dry_run
      for (const action of rule.actions || []) {
        try {
          const detail = await runAction(action, { ...ctx, entityType, entityId }, { tenantId, dry })
          await recordRun(tenantId, { eventId: ev.id, ruleCode: rule.code, actionType: action.type, entityType, entityId, status: dry ? 'dry_run' : 'success', detail })
        } catch (e) {
          warn(`rule ${rule.code} action ${action.type}:`, e.message)
          await recordRun(tenantId, { eventId: ev.id, ruleCode: rule.code, actionType: action.type, entityType, entityId, status: 'failed', detail: e.message })
        }
      }
    }
  } catch (e) { warn('emitEvent', eventType, e.message) }
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function runAction(action, ctx, { tenantId, dry }) {
  const v = vars(ctx)
  switch (action.type) {
    case 'send_email': {
      const rcpts = await resolveRecipient(action.to, ctx, tenantId)
      if (!rcpts.length) return `no recipient for "${action.to}"`
      const subject = render(action.subject, v), body = render(action.body, v)
      if (!dry) for (const r of rcpts) await deps.sendMail(r.email, subject, body, tenantId)
      return `${dry ? 'would email' : 'emailed'} ${rcpts.map((r) => r.email).join(', ')} — ${subject}`
    }
    case 'send_sms': {
      const rcpts = await resolveRecipient(action.to, ctx, tenantId)
      const withMobile = rcpts.filter((r) => r.mobile)
      if (!withMobile.length) return 'no mobile number'
      const message = render(action.message, v)
      if (!dry) for (const r of withMobile) await deps.sendSms?.(r.mobile, message, tenantId)
      return `${dry ? 'would sms' : 'sms'} ${withMobile.map((r) => r.mobile).join(', ')}`
    }
    case 'notify': {
      const rcpts = await resolveRecipient(action.to, ctx, tenantId)
      if (!rcpts.length) return `no recipient for "${action.to}"`
      const title = render(action.title, v), text = render(action.text, v)
      if (!dry) for (const r of rcpts) await deps.createNotification(r.email, title, text, 'automation', ctx.lead?.id || null, tenantId)
      return `${dry ? 'would notify' : 'notified'} ${rcpts.map((r) => r.email).join(', ')}`
    }
    case 'create_task': {
      const s = ctx.app || ctx.lead
      const assignee = ctx.owner?.name || s?.owner
      if (!assignee || assignee === 'Unassigned') return 'no assignee'
      const title = render(action.title || 'Follow up with {{name}}', v)
      const due = new Date(Date.now() + (action.dueDays || 1) * D).toLocaleDateString('en-IN')
      if (!dry) await pool.query(
        `INSERT INTO tasks (title, type, priority, due, status, assignee, lead, tenant_id) VALUES ($1,'Call',$2,$3,'Pending',$4,$5,$6);`,
        [title, action.priority || 'High', due, assignee, s?.name || '', tenantId])
      return `${dry ? 'would create' : 'created'} task "${title}" for ${assignee}`
    }
    case 'schedule_sequence': return scheduleSequence(action.sequence, ctx, tenantId, dry)
    case 'cancel_sequence': {
      const entityType = action.entity || SEQUENCES[action.sequence]?.entity || ctx.entityType
      let entityId = ctx.entityId
      if (entityType === 'lead' && ctx.app && !ctx.lead) {
        const r = await pool.query(
          `SELECT id FROM leads WHERE tenant_id = $1 AND ((LOWER(email) = LOWER($2) AND $2 <> '') OR mobile = $3) ORDER BY id DESC LIMIT 1;`,
          [tenantId, ctx.app.email || '', ctx.app.mobile || ''])
        entityId = r.rows[0]?.id
        if (!entityId) return 'no linked lead'
      }
      if (dry) return `would cancel ${action.sequence} for ${entityType} #${entityId}`
      const r = await pool.query(
        `UPDATE scheduled_jobs SET status = 'cancelled', executed_at = NOW(), result = 'cancelled by rule'
         WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'pending' AND payload->>'sequence' = $4;`,
        [tenantId, entityType, entityId, action.sequence])
      return `cancelled ${r.rowCount} pending ${action.sequence} reminder(s)`
    }
    case 'sync_campusone': {
      if (!ctx.app) return 'no application'
      if (dry) return `would run CampusOne auto-sync for ${ctx.app.app_no}`
      // erp_synced is emitted by the sync helper itself, so every path (manual
      // button, webhook, this rule) produces exactly one event.
      await deps.checkAndAutoSyncCampusOne(ctx.app.id, tenantId)
      const after = (await pool.query('SELECT campusone_sync_status, campusone_sync_error FROM applications WHERE id = $1;', [ctx.app.id])).rows[0]
      return `CampusOne: ${after?.campusone_sync_status}${after?.campusone_sync_error ? ' — ' + after.campusone_sync_error : ''}`
    }
    case 'provision_lms': {
      if (!ctx.app) return 'no application'
      if (dry) return `would provision LMS account for ${ctx.app.app_no}`
      const r = await provisionLms(ctx.app.id, tenantId)
      return r.detail
    }
    default: throw new Error(`unknown action ${action.type}`)
  }
}

async function scheduleSequence(sequence, ctx, tenantId, dry) {
  const seq = SEQUENCES[sequence]
  if (!seq) throw new Error(`unknown sequence ${sequence}`)
  const entityId = seq.entity === 'lead' ? ctx.lead?.id : ctx.app?.id
  if (!entityId) return `no ${seq.entity} to schedule ${sequence} for`
  if (dry) return `would schedule ${seq.steps.length} ${sequence} reminder(s)`
  // The doc id makes re-upload chasers unique per rejected document.
  const suffix = sequence === 'doc_reupload' && ctx.payload?.docId ? `:doc${ctx.payload.docId}` : ''
  let n = 0
  for (let i = 0; i < seq.steps.length; i++) {
    const r = await pool.query(
      `INSERT INTO scheduled_jobs (tenant_id, job_type, entity_type, entity_id, dedupe_key, run_at, payload)
       VALUES ($1, 'reminder', $2, $3, $4, $5, $6) ON CONFLICT (dedupe_key) DO NOTHING;`,
      [tenantId, seq.entity, entityId, `${tenantId}:${sequence}${suffix}:${seq.entity}${entityId}:s${i}`,
       new Date(Date.now() + seq.steps[i].offsetMs), JSON.stringify({ sequence, step: i, ...ctx.payload })]
    )
    n += r.rowCount
  }
  return `scheduled ${n} ${sequence} reminder(s)`
}

// ── Scheduler tick (every minute) ────────────────────────────────────────────
let tickRunning = false
export async function runScheduledJobs(limit = 50) {
  if (tickRunning) return
  tickRunning = true
  try {
    const due = await claimDueJobs(limit)
    for (const job of due) {
      let status = 'done', result = ''
      try { result = await executeJob(job); if (result.startsWith('skipped')) status = 'skipped' }
      catch (e) { status = job.attempts >= 3 ? 'failed' : 'pending'; result = e.message; warn('job', job.id, e.message) }
      await pool.query(
        `UPDATE scheduled_jobs SET status = $1, result = $2, executed_at = NOW(),
         run_at = CASE WHEN $4::boolean THEN NOW() + INTERVAL '10 minutes' ELSE run_at END WHERE id = $3;`,
        [status, String(result).slice(0, 2000), job.id, status === 'pending'])
    }
    if (due.length) log(`tick: ${due.length} job(s) processed`)
  } catch (e) { warn('tick', e.message) } finally { tickRunning = false }
}

// Atomically mark due jobs as running so a second process can never pick them up.
async function claimDueJobs(limit) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const due = (await client.query(
      `SELECT * FROM scheduled_jobs WHERE status = 'pending' AND run_at <= NOW()
       ORDER BY run_at LIMIT $1 FOR UPDATE SKIP LOCKED;`, [limit])).rows
    if (due.length) await client.query(
      `UPDATE scheduled_jobs SET status = 'running', attempts = attempts + 1 WHERE id = ANY($1::bigint[]);`, [due.map((j) => j.id)])
    await client.query('COMMIT')
    return due.map((j) => ({ ...j, attempts: j.attempts + 1 }))
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally { client.release() }
}

async function executeJob(job) {
  const mode = await getMode(job.tenant_id)
  if (mode === 'off') return 'skipped — automation off'
  if (job.job_type !== 'reminder') throw new Error(`unknown job_type ${job.job_type}`)

  const { sequence, step } = job.payload
  const seq = SEQUENCES[sequence]
  const st = seq?.steps[step]
  if (!st) throw new Error(`bad sequence/step ${sequence}/${step}`)

  const ctx = await loadContext(job.entity_type, job.entity_id, job.tenant_id, job.payload)
  if (!ctx.app && !ctx.lead) return 'skipped — entity deleted'
  if (!(await stillRelevant(sequence, ctx, job.tenant_id))) return 'skipped — already resolved'
  if (sequence === 'docs_pending') ctx.pendingDocs = await pendingDocNames(ctx.app.id, job.tenant_id)

  const rcpts = await resolveRecipient(seq.audience, ctx, job.tenant_id)
  if (!rcpts.length) return 'skipped — no recipient'
  const v = vars(ctx)
  const subject = render(st.subject, v), body = render(st.body, v)
  const dry = mode === 'dry_run'
  if (!dry) for (const r of rcpts) await deps.sendMail(r.email, subject, body, job.tenant_id)
  await recordRun(job.tenant_id, { actionType: `reminder:${sequence}`, entityType: job.entity_type, entityId: job.entity_id,
    status: dry ? 'dry_run' : 'success', detail: `step ${step + 1} → ${rcpts.map((r) => r.email).join(', ')} — ${subject}` })
  return `${dry ? 'dry-run' : 'sent'} to ${rcpts.map((r) => r.email).join(', ')}`
}

// ── Escalations (SLA sweep, every 30 min) ────────────────────────────────────
// One row per (rule, entity): opened when the SLA is breached, auto-resolved
// when the condition clears. Managers get a single digest per sweep.
// $1 tenant, $2 SLA hours, $3 automation_since cutoff. Every query is bounded
// by the cutoff and a hard LIMIT so a sweep can never touch the whole table.
const SWEEP_CAP = 200
const ESCALATION_QUERIES = {
  lead_untouched_24h: `SELECT id, name, course, owner, mobile FROM leads WHERE tenant_id = $1 AND created_at >= $3 AND stage = 'Untouched'
      AND created_at < NOW() - make_interval(hours => $2) AND owner IS NOT NULL AND owner <> '' AND owner <> 'Unassigned' ORDER BY created_at LIMIT ${SWEEP_CAP};`,
  lead_untouched_72h: `SELECT id, name, course, owner, mobile, city FROM leads WHERE tenant_id = $1 AND created_at >= $3 AND stage = 'Untouched'
      AND created_at < NOW() - make_interval(hours => $2) ORDER BY created_at LIMIT ${SWEEP_CAP};`,
  docs_pending_7d: `SELECT a.id, a.name, a.app_no, a.owner FROM applications a WHERE a.tenant_id = $1 AND a.created_at >= $3 AND a.created_at < NOW() - make_interval(hours => $2)
      AND a.campusone_sync_status <> 'Success' AND EXISTS (SELECT 1 FROM documents d WHERE d.app_id = a.id AND d.is_mandatory AND d.status <> 'Verified') ORDER BY a.created_at LIMIT ${SWEEP_CAP};`,
  fee_pending_10d: `SELECT id, name, app_no, owner FROM applications WHERE tenant_id = $1 AND created_at >= $3 AND created_at < NOW() - make_interval(hours => $2)
      AND booking_fee_status <> 'Paid' AND application_fee_paid = FALSE AND pay_status <> 'Approved' ORDER BY created_at LIMIT ${SWEEP_CAP};`,
  tuition_pending_14d: `SELECT id, name, app_no, owner FROM applications WHERE tenant_id = $1 AND created_at >= $3 AND tuition_fee_paid = FALSE
      AND COALESCE(booking_fee_paid_at, application_fee_paid_at) < NOW() - make_interval(hours => $2) ORDER BY created_at LIMIT ${SWEEP_CAP};`,
  erp_sync_failed: `SELECT id, name, app_no, owner, campusone_sync_error AS error FROM applications WHERE tenant_id = $1 AND campusone_sync_status = 'Failed'
      AND COALESCE(campusone_synced_at, created_at) >= $3 AND $2 = $2 ORDER BY campusone_synced_at LIMIT ${SWEEP_CAP};`,
  lms_sync_failed: `SELECT id, name, app_no, owner, lms_sync_error AS error FROM applications WHERE tenant_id = $1 AND lms_sync_status = 'Failed'
      AND COALESCE(lms_synced_at, created_at) >= $3 AND $2 = $2 ORDER BY lms_synced_at LIMIT ${SWEEP_CAP};`,
}

let sweepRunning = false
export async function runEscalationSweep() {
  if (sweepRunning) return
  sweepRunning = true
  try {
    const tenants = await pool.query('SELECT id FROM tenants').catch(() => ({ rows: [{ id: 1 }] }))
    for (const { id: tenantId } of tenants.rows) {
      const mode = await getMode(tenantId)
      if (mode === 'off') continue
      const dry = mode === 'dry_run'
      const since = await getSince(tenantId)
      const rules = (await pool.query('SELECT * FROM escalation_rules WHERE tenant_id = $1 AND enabled = TRUE;', [tenantId])).rows
      const digest = new Map() // manager email → lines

      for (const rule of rules) {
        const sql = ESCALATION_QUERIES[rule.code]
        if (!sql) continue
        const breached = (await pool.query(sql, [tenantId, rule.hours, since])).rows
        const breachedIds = new Set(breached.map((r) => r.id))

        // Auto-resolve anything that no longer breaches.
        await pool.query(
          `UPDATE escalations SET status = 'resolved', resolved_at = NOW()
           WHERE tenant_id = $1 AND rule_code = $2 AND status = 'open' AND NOT (entity_id = ANY($3::int[]));`,
          [tenantId, rule.code, [...breachedIds]])

        for (const row of breached) {
          const label = row.app_no ? `${row.app_no} — ${row.name}` : `${row.name} (${row.course || ''})`
          const ins = await pool.query(
            `INSERT INTO escalations (tenant_id, rule_code, entity_type, entity_id, entity_label, dedupe_key, detail)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id;`,
            [tenantId, rule.code, rule.entity_type, row.id, label, `${tenantId}:${rule.code}:${row.id}`, row.error || ''])
          if (!ins.rowCount) continue // already escalated, still open

          const ctx = await loadContext(rule.entity_type, row.id, tenantId, {})
          const notified = []
          for (const action of rule.actions || []) {
            try {
              const d = await runEscalationAction(action, rule, row, ctx, tenantId, dry, digest)
              if (d?.notified) notified.push(...d.notified)
              await recordRun(tenantId, { ruleCode: rule.code, actionType: `escalate:${action.type}`, entityType: rule.entity_type, entityId: row.id, status: dry ? 'dry_run' : 'success', detail: d?.detail || '' })
            } catch (e) {
              await recordRun(tenantId, { ruleCode: rule.code, actionType: `escalate:${action.type}`, entityType: rule.entity_type, entityId: row.id, status: 'failed', detail: e.message })
            }
          }
          await pool.query('UPDATE escalations SET notified_to = $1 WHERE id = $2;', [notified.join(', '), ins.rows[0].id])
        }
      }

      if (!dry) for (const [email, lines] of digest) {
        await deps.sendMail(email, `Admissions SLA digest — ${lines.length} item(s) need attention`,
          `The following items have breached their SLA:\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\nOpen the CRM → Automation → Escalations to act on them.`, tenantId).catch(() => {})
      }
    }
  } catch (e) { warn('sweep', e.message) } finally { sweepRunning = false }
}

async function runEscalationAction(action, rule, row, ctx, tenantId, dry, digest) {
  const label = row.app_no ? `${row.app_no} — ${row.name}` : `${row.name} (${row.course || ''})`
  switch (action.type) {
    case 'notify': {
      const rcpts = await resolveRecipient(action.to, ctx, tenantId)
      if (!rcpts.length) return { detail: `no recipient for ${action.to}` }
      const title = `${rule.name}: ${label}`
      if (!dry) for (const r of rcpts) {
        await deps.createNotification(r.email, title, row.error || `Owner: ${row.owner || 'Unassigned'}`, 'escalation', ctx.lead?.id || null, tenantId)
        if (action.to !== 'owner') { if (!digest.has(r.email)) digest.set(r.email, []); digest.get(r.email).push(`${rule.name}: ${label} (owner: ${row.owner || 'Unassigned'})`) }
      }
      return { detail: `${dry ? 'would notify' : 'notified'} ${rcpts.map((r) => r.email).join(', ')}`, notified: rcpts.map((r) => r.email) }
    }
    case 'create_task': {
      const assignee = row.owner
      if (!assignee || assignee === 'Unassigned') return { detail: 'no owner for task' }
      if (!dry) await pool.query(
        `INSERT INTO tasks (title, type, priority, due, status, assignee, lead, tenant_id) VALUES ($1,'Call','High',$2,'Pending',$3,$4,$5);`,
        [`[SLA] ${rule.name}: ${row.name}`, new Date().toLocaleDateString('en-IN'), assignee, row.name, tenantId])
      return { detail: `${dry ? 'would create' : 'created'} task for ${assignee}` }
    }
    case 'reassign': {
      if (rule.entity_type !== 'lead') return { detail: 'reassign only applies to leads' }
      const next = await deps.getNextAssignee(tenantId, row.city || '')
      if (!next || next === 'Unassigned' || next === row.owner) return { detail: 'no alternative counsellor' }
      if (!dry) {
        await pool.query('UPDATE leads SET owner = $1 WHERE id = $2 AND tenant_id = $3;', [next, row.id, tenantId])
        await deps.alertCounselor?.(next, row.name, row.course, 'SLA reassignment', row.id, tenantId)
      }
      return { detail: `${dry ? 'would reassign' : 'reassigned'} ${row.owner || 'Unassigned'} → ${next}` }
    }
    case 'retry_erp': {
      if (dry) return { detail: 'would retry CampusOne sync' }
      await pool.query(`UPDATE applications SET campusone_sync_status = 'Pending' WHERE id = $1;`, [row.id])
      await deps.checkAndAutoSyncCampusOne(row.id, tenantId)
      const after = (await pool.query('SELECT campusone_sync_status FROM applications WHERE id = $1;', [row.id])).rows[0]
      return { detail: `retry → ${after?.campusone_sync_status}` }
    }
    case 'retry_lms': {
      if (dry) return { detail: 'would retry LMS provisioning' }
      const r = await provisionLms(row.id, tenantId)
      return { detail: `retry → ${r.detail}` }
    }
    default: return { detail: `unknown escalation action ${action.type}` }
  }
}

// ── LMS provisioning (ERP → LMS leg of the journey) ──────────────────────────
// Uses the enabled `lms` connector from the Integration Hub. A connector whose
// code is `moodle` speaks Moodle's web-service API; anything else gets a plain
// JSON POST to the connector's student sync-job path (default /students).
export async function provisionLms(appId, tenantId) {
  const app = (await pool.query('SELECT * FROM applications WHERE id = $1 AND tenant_id = $2;', [appId, tenantId])).rows[0]
  if (!app) return { success: false, detail: 'application not found' }
  if (app.lms_sync_status === 'Success') return { success: true, detail: 'already provisioned' }

  const conn = (await pool.query(
    `SELECT * FROM integration_connectors WHERE tenant_id = $1 AND system_type = 'lms' AND enabled = TRUE ORDER BY id LIMIT 1;`, [tenantId])).rows[0]
  if (!conn) {
    await pool.query(`UPDATE applications SET lms_sync_status = 'Not Configured', lms_sync_error = 'No enabled LMS connector' WHERE id = $1;`, [appId])
    return { success: false, detail: 'no enabled LMS connector — configure one in Integration Hub' }
  }

  const secret = decryptSecret(conn.auth_secret || '')
  let userId = null, error = ''
  try {
    if (conn.code === 'moodle') {
      const [first, ...rest] = String(app.name || '').trim().split(/\s+/)
      const params = new URLSearchParams({
        wstoken: secret, wsfunction: 'core_user_create_users', moodlewsrestformat: 'json',
        'users[0][username]': String(app.registration_number || app.app_no).toLowerCase(),
        'users[0][firstname]': first || app.name, 'users[0][lastname]': rest.join(' ') || '.',
        'users[0][email]': app.email, 'users[0][createpassword]': '1', 'users[0][auth]': 'manual',
        'users[0][idnumber]': app.registration_number || app.app_no,
      })
      const url = `${String(conn.base_url).replace(/\/+$/, '')}/webservice/rest/server.php`
      const res = await axios.post(url, params.toString(), { timeout: 20000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true })
      if (res.data?.exception) error = res.data.message || res.data.exception
      else if (Array.isArray(res.data) && res.data[0]?.id) userId = String(res.data[0].id)
      else error = `unexpected response (${res.status})`
    } else {
      const job = (await pool.query(
        `SELECT path FROM integration_sync_jobs WHERE connector_id = $1 AND entity IN ('student','students','application') AND direction <> 'pull' ORDER BY id LIMIT 1;`, [conn.id])).rows[0]
      const headers = { 'Content-Type': 'application/json' }
      if (conn.auth_type === 'bearer' && secret) headers.Authorization = `Bearer ${secret}`
      if (conn.auth_type === 'api_key' && secret) headers[conn.header_name || 'X-API-Key'] = secret
      const cfg = { timeout: 20000, headers, validateStatus: () => true }
      if (conn.auth_type === 'basic' && secret) cfg.auth = { username: conn.auth_username || '', password: secret }
      const url = `${String(conn.base_url).replace(/\/+$/, '')}/${String(job?.path || '/students').replace(/^\/+/, '')}`
      const res = await axios.post(url, {
        name: app.name, email: app.email, mobile: app.mobile, applicationNumber: app.app_no,
        registrationNumber: app.registration_number, erpStudentId: app.campusone_student_id,
        course: app.course, campus: app.campus, debId: app.deb_id, abcId: app.abc_id,
      }, cfg)
      if (res.status >= 200 && res.status < 300) userId = String(res.data?.userId || res.data?.id || res.data?.username || 'ok')
      else error = res.data?.error || res.data?.message || `HTTP ${res.status}`
    }
  } catch (e) { error = e.message }

  const status = userId ? 'Success' : 'Failed'
  await pool.query(
    `UPDATE applications SET lms_sync_status = $1, lms_user_id = $2, lms_sync_error = $3, lms_synced_at = NOW() WHERE id = $4;`,
    [status, userId, error, appId])
  if (userId) setImmediate(() => emitEvent(tenantId, 'application.lms_provisioned', 'application', appId, { appNo: app.app_no, lmsUserId: userId }))
  return { success: !!userId, detail: userId ? `LMS user ${userId} via ${conn.code}` : `LMS failed via ${conn.code}: ${error}` }
}

// ── Journey view (per application) ───────────────────────────────────────────
export async function journeyFor(appRef, tenantId) {
  const app = (await pool.query(
    `SELECT * FROM applications WHERE tenant_id = $2 AND (app_no = $1 OR (($1 ~ '^[0-9]+$') AND id = $1::int)) LIMIT 1;`,
    [String(appRef).trim(), tenantId])).rows[0]
  if (!app) return null
  const appId = app.id
  const docs = (await pool.query(
    `SELECT COUNT(*) FILTER (WHERE is_mandatory) AS total, COUNT(*) FILTER (WHERE is_mandatory AND status = 'Verified') AS verified
     FROM documents WHERE app_id = $1 AND tenant_id = $2;`, [appId, tenantId])).rows[0]
  const feePaid = app.booking_fee_status === 'Paid' || app.application_fee_paid || app.pay_status === 'Approved'
  const steps = [
    { key: 'application', label: 'Application submitted', done: true, at: app.created_at },
    { key: 'fee', label: 'Application fee paid', done: feePaid, at: app.booking_fee_paid_at || app.application_fee_paid_at },
    { key: 'docs', label: `Documents verified (${docs.verified}/${docs.total})`, done: Number(docs.total) > 0 && docs.total === docs.verified },
    { key: 'tuition', label: 'Tuition fee paid', done: !!app.tuition_fee_paid, at: app.tuition_fee_paid_at },
    { key: 'registration', label: 'Registration number issued', done: !!app.registration_number, at: app.reg_number_generated_at, value: app.registration_number },
    { key: 'erp', label: 'Synced to CampusOne ERP', done: app.campusone_sync_status === 'Success', at: app.campusone_synced_at, value: app.campusone_student_id, error: app.campusone_sync_error },
    { key: 'lms', label: 'LMS account provisioned', done: app.lms_sync_status === 'Success', at: app.lms_synced_at, value: app.lms_user_id, error: app.lms_sync_error },
  ]
  const pending = (await pool.query(
    `SELECT id, payload->>'sequence' AS sequence, (payload->>'step')::int + 1 AS step, run_at FROM scheduled_jobs
     WHERE tenant_id = $1 AND entity_type = 'application' AND entity_id = $2 AND status = 'pending' ORDER BY run_at;`, [tenantId, appId])).rows
  const escalations = (await pool.query(
    `SELECT rule_code, status, created_at FROM escalations WHERE tenant_id = $1 AND entity_type = 'application' AND entity_id = $2 ORDER BY created_at DESC;`, [tenantId, appId])).rows
  const runs = (await pool.query(
    `SELECT rule_code, action_type, status, detail, created_at FROM automation_runs WHERE tenant_id = $1 AND entity_type = 'application' AND entity_id = $2 ORDER BY created_at DESC LIMIT 30;`, [tenantId, appId])).rows
  return { id: app.id, appNo: app.app_no, name: app.name, steps, nextStep: steps.find((s) => !s.done)?.label || 'Complete', pendingReminders: pending, escalations, runs }
}
