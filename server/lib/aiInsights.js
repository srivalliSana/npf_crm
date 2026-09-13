// Real, rule-based logic behind the Lead Detail Workspace's "AI Assistant"
// panel — Admission Health, Risk Prediction, Scholarship Suggestion, Next
// Best Action. Every input here is a real column/table already written by
// the rest of the app; nothing is fabricated. Weights, day thresholds, and
// percentage tiers are v1 defaults chosen from the signals actually
// available, not numbers derived from any existing policy document — easy
// to retune later, not settled business rules.
import { pool } from '../db.js'

// Sibling to the existing allMandatoryDocsVerified() (server/index.js) which
// only returns a boolean — this returns the fraction, for a prorated score.
export async function mandatoryDocsRatio(appId, tenantId = 1) {
  const r = await pool.query(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'Verified' THEN 1 ELSE 0 END) AS verified
     FROM documents WHERE app_id = $1 AND is_mandatory = TRUE AND tenant_id = $2;`,
    [appId, tenantId]
  )
  const total = Number(r.rows[0]?.total) || 0
  const verified = Number(r.rows[0]?.verified) || 0
  return total > 0 ? verified / total : 0
}

// ── 5.1 Admission Health (0-100) ────────────────────────────────────────────
export async function computeAdmissionHealth(app, tenantId, applyTuitionDiscount, programTuitionFee) {
  const drivers = []
  const docRatio = await mandatoryDocsRatio(app.id, tenantId)
  const docsScore = Math.round(docRatio * 40)
  if (docRatio < 1) drivers.push(`${Math.round(docRatio * 100)}% of mandatory documents verified`)

  // Regular Admissions' older flow only ever sets pay_status (never the
  // newer application_fee_paid boolean, which is written by the explicit
  // CU EDU-style admission journey) — treat either as "paid" so this
  // doesn't contradict what the sidebar's own Payment Status already shows.
  const applicationFeePaid = app.application_fee_paid || ['Paid', 'Payment Done'].includes(app.pay_status)
  let feeScore = 0
  if (applicationFeePaid) feeScore += 10
  else drivers.push('Application fee not yet paid')
  if (app.registration_fee_paid) feeScore += 15
  if (app.tuition_fee_paid) {
    feeScore += 15
  } else {
    const fullDue = applyTuitionDiscount(programTuitionFee, app)
    const paid = Number(app.tuition_amount_paid) || 0
    if (fullDue > 0 && paid > 0) {
      feeScore += Math.round((paid / fullDue) * 15)
      drivers.push('Tuition fee partially paid')
    } else {
      drivers.push('Tuition fee not yet paid')
    }
  }

  let gateScore = 0
  if (app.admission_details_status === 'Approved') gateScore += 7
  if (app.admission_full_details_status === 'Approved') gateScore += 7
  if (app.campusone_sync_status === 'Success') gateScore += 6

  const score = Math.min(100, docsScore + feeScore + gateScore)
  const band = score >= 80 ? { label: 'Excellent', tone: 'success' }
    : score >= 60 ? { label: 'On Track', tone: 'info' }
    : score >= 35 ? { label: 'Needs Attention', tone: 'warning' }
    : { label: 'At Risk', tone: 'danger' }

  return { score, band: band.label, tone: band.tone, drivers: drivers.slice(0, 3) }
}

// ── 5.2 Risk Prediction — days since last activity (leads-level) ───────────
export async function computeRiskPrediction(leadId, tenantId, fallbackDate) {
  if (!leadId) return { daysSince: null, bucket: 'Unknown', tone: 'neutral' }

  const leadRes = await pool.query('SELECT status_history, created_at FROM leads WHERE id = $1 AND tenant_id = $2;', [leadId, tenantId])
  const lead = leadRes.rows[0]
  let lastActivity = lead?.created_at || fallbackDate || null

  const history = Array.isArray(lead?.status_history) ? lead.status_history : []
  for (const entry of history) {
    const ts = entry?.timestamp ? new Date(entry.timestamp) : null
    if (ts && (!lastActivity || ts > new Date(lastActivity))) lastActivity = ts
  }

  const callRes = await pool.query('SELECT MAX(completed_at) AS last_call FROM calls WHERE lead_id = $1;', [leadId])
  const lastCall = callRes.rows[0]?.last_call
  if (lastCall && (!lastActivity || new Date(lastCall) > new Date(lastActivity))) lastActivity = lastCall

  if (!lastActivity) return { daysSince: null, bucket: 'Unknown', tone: 'neutral' }

  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000))
  const bucket = daysSince <= 2 ? { label: 'Fresh', tone: 'success' }
    : daysSince <= 6 ? { label: 'Cooling', tone: 'info' }
    : daysSince <= 13 ? { label: 'At Risk', tone: 'warning' }
    : { label: 'Cold / Escalate', tone: 'danger' }

  return { daysSince, bucket: bucket.label, tone: bucket.tone }
}

// ── 5.3 Scholarship Suggestion — advisory only, never auto-applies ─────────
export function computeScholarshipSuggestion(admissionFullDetails) {
  const d = admissionFullDetails || {}
  const nums = [d.tenthPercentage, d.twelfthPercentage, d.graduationPercentage]
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0 && n <= 100)

  if (!nums.length) {
    return { suggestedPercent: 0, tier: 'insufficient-data', academicAvgPercent: null, rationale: 'Academic percentages not on file yet.' }
  }
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const suggestedPercent = avg >= 90 ? 15 : avg >= 80 ? 10 : avg >= 70 ? 5 : 0
  const rationale = suggestedPercent > 0
    ? `Average academic score ${avg.toFixed(1)}% qualifies for a merit-based suggestion.`
    : `Average academic score ${avg.toFixed(1)}% is below the merit threshold — no automatic suggestion.`
  return { suggestedPercent, tier: `avg-${Math.floor(avg / 10) * 10}`, academicAvgPercent: Math.round(avg * 10) / 10, rationale }
}

// ── 5.4 Next Best Action — first-match-wins rule chain ──────────────────────
export async function computeNextBestAction(app, tenantId, daysSince) {
  if (app.campusone_sync_status === 'Failed') {
    return { label: 'Retry CampusOne sync', severity: 'critical' }
  }

  const pendingPayment = await pool.query(
    `SELECT id FROM payments WHERE app_no = $1 AND tenant_id = $2 AND status = 'Payment Done' LIMIT 1;`,
    [app.app_no, tenantId]
  )
  if (pendingPayment.rows.length) return { label: 'Approve pending payment', severity: 'warning' }

  const pendingDoc = await pool.query(
    `SELECT id FROM documents WHERE app_id = $1 AND tenant_id = $2 AND is_mandatory = TRUE AND status NOT IN ('Verified','Rejected') LIMIT 1;`,
    [app.id, tenantId]
  )
  if (pendingDoc.rows.length) return { label: 'Verify pending documents', severity: 'warning' }

  const hasFullDetails = app.admission_full_details && Object.keys(app.admission_full_details).length > 0
  if (app.admission_details_status === 'Pending' && hasFullDetails) {
    return { label: 'Review admission KYC', severity: 'warning' }
  }

  if (!app.owner || app.owner === '' || app.owner === 'Unassigned') {
    return { label: 'Assign a counsellor', severity: 'info' }
  }

  if (daysSince != null && daysSince >= 14) {
    return { label: 'Re-engage — no activity in 2+ weeks', severity: 'info' }
  }

  return { label: 'No action needed — on track', severity: 'success' }
}
