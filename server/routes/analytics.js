// Item 25 — Analytics / BI: admission, academic, examination and finance
// dashboards. Item 30 — Management Command Centre.
//
// Everything is aggregated in SQL. The existing /api/dashboard/stats already
// proved the point at this data volume: pulling rows into Node to count them
// does not survive a million leads.
//
// The academic and examination dashboards read academic_records / exam_results,
// which the integration jobs fill. Until a job runs they are empty, and each
// endpoint says so explicitly (`configured: false`) rather than rendering
// convincing-looking zeroes.
import express from 'express'
import { pool } from '../db.js'
import { authenticateToken } from '../lib/auth.js'
import { requirePermission } from '../lib/permissions.js'

const router = express.Router()
router.use(authenticateToken)

// Short-TTL cache, mirroring the dashboard's: these are heavy scans and a
// dashboard tolerates a minute of staleness.
const cache = new Map()
const TTL_MS = 60_000
const cached = async (key, build) => {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data
  const data = await build()
  cache.set(key, { ts: Date.now(), data })
  // The key space is bounded by tenant × dashboard × filters; trim anyway so a
  // long-running process can't accumulate stale entries forever.
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.ts > TTL_MS) cache.delete(k)
  return data
}

// range → an interval clause. 'all' means no time filter.
function rangeClause(range, col) {
  const days = { '7': 7, '30': 30, '90': 90, '180': 180, '365': 365 }[String(range)]
  return days ? `AND ${col} >= NOW() - INTERVAL '${days} days'` : ''
}

// ── 25a · Admission dashboard ────────────────────────────────────────────────
router.get('/admission', requirePermission('analytics.view'), async (req, res) => {
  const { range = '90', campus = '', program = '' } = req.query
  const key = `adm:${req.tenantId}:${range}:${campus}:${program}`
  try {
    res.json(await cached(key, async () => {
      const p = [req.tenantId]
      let appFilter = ''
      if (campus)  { p.push(campus);  appFilter += ` AND a.campus = $${p.length}` }
      if (program) { p.push(program); appFilter += ` AND a.course = $${p.length}` }

      const leadWhere = `l.tenant_id = $1 ${rangeClause(range, 'l.created_at')}`
      const appWhere  = `a.tenant_id = $1 ${appFilter} ${rangeClause(range, 'a.created_at')}`

      const [funnel, byProgram, byCampus, bySource, trend, tat, filters, undated] = await Promise.all([
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM leads l WHERE ${leadWhere})                                        AS "leads",
            (SELECT COUNT(*)::int FROM leads l WHERE ${leadWhere} AND l.stage <> 'Untouched')             AS "contacted",
            (SELECT COUNT(*)::int FROM leads l WHERE ${leadWhere} AND l.stage IN ('Interested','Qualified Leads','Process for Payment','Payment Success','Converted')) AS "qualified",
            (SELECT COUNT(*)::int FROM applications a WHERE ${appWhere})                                  AS "applications",
            (SELECT COUNT(*)::int FROM applications a WHERE ${appWhere} AND COALESCE(a.registration_number,'') <> '') AS "registered",
            (SELECT COUNT(*)::int FROM applications a WHERE ${appWhere} AND COALESCE(a.admission_number,'') <> '')    AS "admitted",
            (SELECT COUNT(*)::int FROM applications a WHERE ${appWhere} AND a.tuition_fee_paid)            AS "enrolled";`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(a.course,''),'Unspecified') AS program,
                 COUNT(*)::int AS applications,
                 COUNT(*) FILTER (WHERE COALESCE(a.admission_number,'') <> '')::int AS admitted,
                 COUNT(*) FILTER (WHERE a.tuition_fee_paid)::int AS enrolled
          FROM applications a WHERE ${appWhere}
          GROUP BY 1 ORDER BY applications DESC LIMIT 12;`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(a.campus,''),'Unspecified') AS campus,
                 COUNT(*)::int AS applications,
                 COUNT(*) FILTER (WHERE COALESCE(a.admission_number,'') <> '')::int AS admitted
          FROM applications a WHERE ${appWhere} GROUP BY 1 ORDER BY applications DESC;`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(l.source,''),'Unknown') AS source,
                 COUNT(*)::int AS leads,
                 COUNT(*) FILTER (WHERE l.stage IN ('Payment Success','Converted'))::int AS converted
          FROM leads l WHERE ${leadWhere} GROUP BY 1 ORDER BY leads DESC LIMIT 12;`, [req.tenantId]),
        pool.query(`
          -- One row per month across both tables, so a month with applications
          -- but no new leads (or the reverse) still appears on the trend line.
          WITH months AS (
            SELECT to_char(m, 'YYYY-MM') AS month FROM generate_series(
              date_trunc('month', NOW()) - INTERVAL '11 months', date_trunc('month', NOW()), INTERVAL '1 month') m
          )
          SELECT months.month,
            COALESCE((SELECT COUNT(*)::int FROM leads l
                      WHERE l.tenant_id = $1 AND to_char(l.created_at,'YYYY-MM') = months.month), 0) AS leads,
            COALESCE((SELECT COUNT(*)::int FROM applications a
                      WHERE a.tenant_id = $1 AND to_char(a.created_at,'YYYY-MM') = months.month), 0) AS applications,
            COALESCE((SELECT COUNT(*)::int FROM applications a
                      WHERE a.tenant_id = $1 AND to_char(a.admission_number_generated_at,'YYYY-MM') = months.month), 0) AS admissions
          FROM months ORDER BY months.month;`, [req.tenantId]),
        pool.query(`
          -- Turnaround from application to admission number, for the rows where
          -- both timestamps are actually known.
          SELECT COUNT(*)::int AS "sampleSize",
                 ROUND(AVG(EXTRACT(EPOCH FROM (a.admission_number_generated_at - a.created_at)) / 86400)::numeric, 1) AS "avgDays",
                 ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (a.admission_number_generated_at - a.created_at)) / 86400)::numeric, 1) AS "medianDays"
          FROM applications a
          WHERE a.tenant_id = $1 AND a.created_at IS NOT NULL
            AND a.admission_number_generated_at IS NOT NULL
            AND a.admission_number_generated_at >= a.created_at;`, [req.tenantId]),
        pool.query(`
          SELECT json_agg(DISTINCT NULLIF(campus,'')) AS campuses,
                 json_agg(DISTINCT NULLIF(course,'')) AS programs
          FROM applications WHERE tenant_id = $1;`, [req.tenantId]),
        pool.query(`
          SELECT (SELECT COUNT(*)::int FROM leads        WHERE tenant_id = $1 AND created_at IS NULL) AS leads,
                 (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1 AND created_at IS NULL) AS applications;`,
          [req.tenantId]),
      ])

      const f = funnel.rows[0]
      const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
      return {
        funnel: f,
        conversion: {
          leadToApplication: pct(f.applications, f.leads),
          applicationToAdmission: pct(f.admitted, f.applications),
          admissionToEnrolment: pct(f.enrolled, f.admitted),
          overall: pct(f.enrolled, f.leads),
        },
        byProgram: byProgram.rows,
        byCampus: byCampus.rows,
        bySource: bySource.rows,
        trend: trend.rows,
        turnaround: tat.rows[0],
        filters: {
          campuses: (filters.rows[0].campuses || []).filter(Boolean).sort(),
          programs: (filters.rows[0].programs || []).filter(Boolean).sort(),
        },
        // Records with no usable timestamp, excluded from every dated view above.
        undated: undated.rows[0],
      }
    }))
  } catch (err) {
    console.error('[analytics/admission]', err.message)
    res.status(500).json({ error: 'Failed to build the admission dashboard.' })
  }
})

// ── 25b · Academic dashboard ─────────────────────────────────────────────────
router.get('/academic', requirePermission('analytics.view'), async (req, res) => {
  const { academicYear = '', term = '' } = req.query
  const key = `acad:${req.tenantId}:${academicYear}:${term}`
  try {
    res.json(await cached(key, async () => {
      const p = [req.tenantId]
      let filter = ''
      if (academicYear) { p.push(academicYear); filter += ` AND academic_year = $${p.length}` }
      if (term)         { p.push(term);         filter += ` AND term = $${p.length}` }
      const where = `tenant_id = $1 ${filter}`

      const totals = await pool.query(`
        SELECT COUNT(*)::int AS records,
               COUNT(DISTINCT registration_number)::int AS students,
               MAX(synced_at) AS "lastSyncedAt"
        FROM academic_records WHERE tenant_id = $1;`, [req.tenantId])

      // Nothing has been synced yet — say so instead of drawing empty charts
      // that read as "every student has a GPA of zero".
      if (totals.rows[0].records === 0) {
        return { configured: false, ...totals.rows[0], reason: 'No academic records yet. Configure an ERP/LMS sync job under Integrations.' }
      }

      const [summary, gpaDist, byProgram, attendance, atRisk, filters] = await Promise.all([
        pool.query(`
          SELECT COUNT(DISTINCT registration_number)::int AS students,
                 ROUND(AVG(gpa)::numeric, 2)            AS "avgGpa",
                 ROUND(AVG(cgpa)::numeric, 2)           AS "avgCgpa",
                 ROUND(AVG(attendance_pct)::numeric, 1) AS "avgAttendance",
                 ROUND(SUM(credits_earned)::numeric, 0) AS "creditsEarned",
                 ROUND(SUM(credits_registered)::numeric, 0) AS "creditsRegistered"
          FROM academic_records WHERE ${where};`, p),
        pool.query(`
          SELECT bucket, COUNT(*)::int AS students FROM (
            SELECT CASE
              WHEN gpa IS NULL   THEN 'Not recorded'
              WHEN gpa >= 9      THEN '9.0 – 10'
              WHEN gpa >= 8      THEN '8.0 – 8.9'
              WHEN gpa >= 7      THEN '7.0 – 7.9'
              WHEN gpa >= 6      THEN '6.0 – 6.9'
              WHEN gpa >= 5      THEN '5.0 – 5.9'
              ELSE 'Below 5.0' END AS bucket
            FROM academic_records WHERE ${where}) b
          GROUP BY bucket ORDER BY bucket DESC;`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(program,''),'Unspecified') AS program,
                 COUNT(DISTINCT registration_number)::int AS students,
                 ROUND(AVG(gpa)::numeric, 2) AS "avgGpa",
                 ROUND(AVG(attendance_pct)::numeric, 1) AS "avgAttendance"
          FROM academic_records WHERE ${where}
          GROUP BY 1 ORDER BY students DESC LIMIT 15;`, p),
        pool.query(`
          SELECT band, COUNT(*)::int AS students FROM (
            SELECT CASE
              WHEN attendance_pct IS NULL THEN 'Not recorded'
              WHEN attendance_pct >= 90 THEN '90%+'
              WHEN attendance_pct >= 75 THEN '75 – 89%'
              WHEN attendance_pct >= 60 THEN '60 – 74%'
              ELSE 'Below 60%' END AS band
            FROM academic_records WHERE ${where}) b
          GROUP BY band ORDER BY band;`, p),
        pool.query(`
          -- The list a dean actually acts on: short of the 75% attendance bar,
          -- or carrying a failing GPA.
          SELECT registration_number AS "registrationNumber", student_name AS "studentName",
                 program, academic_year AS "academicYear", term,
                 gpa, attendance_pct AS "attendancePct", status
          FROM academic_records
          WHERE ${where} AND (attendance_pct < 75 OR gpa < 5)
          ORDER BY attendance_pct NULLS LAST, gpa LIMIT 100;`, p),
        pool.query(`
          SELECT json_agg(DISTINCT NULLIF(academic_year,'')) AS years,
                 json_agg(DISTINCT NULLIF(term,'')) AS terms
          FROM academic_records WHERE tenant_id = $1;`, [req.tenantId]),
      ])

      return {
        configured: true,
        ...totals.rows[0],
        summary: summary.rows[0],
        gpaDistribution: gpaDist.rows,
        byProgram: byProgram.rows,
        attendanceBands: attendance.rows,
        atRisk: atRisk.rows,
        filters: {
          years: (filters.rows[0].years || []).filter(Boolean).sort(),
          terms: (filters.rows[0].terms || []).filter(Boolean).sort(),
        },
      }
    }))
  } catch (err) {
    console.error('[analytics/academic]', err.message)
    res.status(500).json({ error: 'Failed to build the academic dashboard.' })
  }
})

// ── 25c · Examination dashboard ──────────────────────────────────────────────
router.get('/examination', requirePermission('analytics.view'), async (req, res) => {
  const { academicYear = '', term = '' } = req.query
  const key = `exam:${req.tenantId}:${academicYear}:${term}`
  try {
    res.json(await cached(key, async () => {
      const p = [req.tenantId]
      let filter = ''
      if (academicYear) { p.push(academicYear); filter += ` AND academic_year = $${p.length}` }
      if (term)         { p.push(term);         filter += ` AND term = $${p.length}` }
      const where = `tenant_id = $1 ${filter}`

      const totals = await pool.query(`
        SELECT COUNT(*)::int AS results,
               COUNT(DISTINCT registration_number)::int AS students,
               MAX(synced_at) AS "lastSyncedAt"
        FROM exam_results WHERE tenant_id = $1;`, [req.tenantId])

      if (totals.rows[0].results === 0) {
        return { configured: false, ...totals.rows[0], reason: 'No examination results yet. Configure an Examination sync job under Integrations.' }
      }

      const [summary, byProgram, hardest, grades, byTerm, filters] = await Promise.all([
        pool.query(`
          SELECT COUNT(*)::int AS "resultsDeclared",
                 COUNT(*) FILTER (WHERE result = 'Pass')::int    AS passed,
                 COUNT(*) FILTER (WHERE result = 'Fail')::int    AS failed,
                 COUNT(*) FILTER (WHERE result = 'Absent')::int  AS absent,
                 COUNT(*) FILTER (WHERE result NOT IN ('Pass','Fail','Absent') OR result = '')::int AS "otherOrPending",
                 ROUND(AVG(CASE WHEN max_marks > 0 THEN obtained_marks / max_marks * 100 END)::numeric, 1) AS "avgScorePct"
          FROM exam_results WHERE ${where};`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(program,''),'Unspecified') AS program,
                 COUNT(*)::int AS results,
                 COUNT(*) FILTER (WHERE result = 'Pass')::int AS passed,
                 ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'Pass')
                       / NULLIF(COUNT(*) FILTER (WHERE result IN ('Pass','Fail')), 0), 1) AS "passRate"
          FROM exam_results WHERE ${where}
          GROUP BY 1 ORDER BY results DESC LIMIT 15;`, p),
        pool.query(`
          -- Subjects with the weakest pass rate: where intervention pays off.
          -- Fewer than 5 attempts is noise, not a signal, so they're excluded.
          SELECT subject_code AS "subjectCode",
                 COALESCE(NULLIF(subject_name,''), subject_code) AS "subjectName",
                 COUNT(*)::int AS attempts,
                 ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'Pass')
                       / NULLIF(COUNT(*) FILTER (WHERE result IN ('Pass','Fail')), 0), 1) AS "passRate",
                 ROUND(AVG(CASE WHEN max_marks > 0 THEN obtained_marks / max_marks * 100 END)::numeric, 1) AS "avgScorePct"
          FROM exam_results WHERE ${where}
          GROUP BY subject_code, subject_name
          HAVING COUNT(*) FILTER (WHERE result IN ('Pass','Fail')) >= 5
          ORDER BY "passRate" NULLS LAST LIMIT 15;`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(grade,''),'Ungraded') AS grade, COUNT(*)::int AS count
          FROM exam_results WHERE ${where} GROUP BY 1 ORDER BY 1;`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(academic_year,''),'—') AS "academicYear",
                 COALESCE(NULLIF(term,''),'—') AS term,
                 COUNT(*)::int AS results,
                 ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'Pass')
                       / NULLIF(COUNT(*) FILTER (WHERE result IN ('Pass','Fail')), 0), 1) AS "passRate"
          FROM exam_results WHERE tenant_id = $1
          GROUP BY 1, 2 ORDER BY 1, 2;`, [req.tenantId]),
        pool.query(`
          SELECT json_agg(DISTINCT NULLIF(academic_year,'')) AS years,
                 json_agg(DISTINCT NULLIF(term,'')) AS terms
          FROM exam_results WHERE tenant_id = $1;`, [req.tenantId]),
      ])

      return {
        configured: true,
        ...totals.rows[0],
        summary: summary.rows[0],
        byProgram: byProgram.rows,
        hardestSubjects: hardest.rows,
        gradeDistribution: grades.rows,
        byTerm: byTerm.rows,
        filters: {
          years: (filters.rows[0].years || []).filter(Boolean).sort(),
          terms: (filters.rows[0].terms || []).filter(Boolean).sort(),
        },
      }
    }))
  } catch (err) {
    console.error('[analytics/examination]', err.message)
    res.status(500).json({ error: 'Failed to build the examination dashboard.' })
  }
})

// ── 25d · Finance dashboard ──────────────────────────────────────────────────
const APPROVED = `('Approved','Payment Approved','Paid')`

router.get('/finance', requirePermission('analytics.view'), async (req, res) => {
  const { range = '365' } = req.query
  const key = `fin:${req.tenantId}:${range}`
  try {
    res.json(await cached(key, async () => {
      const p = [req.tenantId]
      // A receipt without a UTR/transaction reference is not a collection.
      const collected = `p.tenant_id = $1 AND p.status IN ${APPROVED}
                         AND p.utr_number IS NOT NULL AND TRIM(p.utr_number) <> ''`

      const [totals, byFeeType, byMonth, byMode, outstanding, byProgram, pending] = await Promise.all([
        pool.query(`
          SELECT COALESCE(SUM(p.amount),0)::bigint AS collected,
                 COUNT(*)::int AS receipts,
                 COUNT(DISTINCT p.app_no)::int AS payers,
                 COALESCE(ROUND(AVG(p.amount)),0)::bigint AS "avgReceipt"
          FROM payments p WHERE ${collected} ${rangeClause(range, 'p.created_at')};`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(p.fee_type,''),'Unspecified') AS "feeType",
                 COALESCE(SUM(p.amount),0)::bigint AS amount, COUNT(*)::int AS receipts
          FROM payments p WHERE ${collected} ${rangeClause(range, 'p.created_at')}
          GROUP BY 1 ORDER BY amount DESC;`, p),
        pool.query(`
          SELECT to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS month,
                 COALESCE(SUM(p.amount),0)::bigint AS amount, COUNT(*)::int AS receipts
          FROM payments p
          WHERE ${collected} AND p.created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
          GROUP BY 1 ORDER BY 1;`, p),
        pool.query(`
          SELECT COALESCE(NULLIF(p.pay_mode,''),'unspecified') AS mode,
                 COALESCE(SUM(p.amount),0)::bigint AS amount, COUNT(*)::int AS receipts
          FROM payments p WHERE ${collected} ${rangeClause(range, 'p.created_at')}
          GROUP BY 1 ORDER BY amount DESC;`, p),
        pool.query(`
          -- Demanded-but-unpaid, from the fee amounts configured per application.
          SELECT
            COALESCE(SUM(CASE WHEN NOT COALESCE(a.application_fee_paid,  false) THEN a.application_fee_amount  ELSE 0 END),0)::bigint AS "applicationFee",
            COALESCE(SUM(CASE WHEN NOT COALESCE(a.registration_fee_paid, false) THEN a.registration_fee_amount ELSE 0 END),0)::bigint AS "registrationFee",
            COALESCE(SUM(CASE WHEN NOT COALESCE(a.tuition_fee_paid,      false) THEN a.tuition_fee_amount      ELSE 0 END),0)::bigint AS "tuitionFee",
            COUNT(*) FILTER (WHERE NOT COALESCE(a.tuition_fee_paid, false) AND a.tuition_fee_amount > 0)::int   AS "studentsOwingTuition"
          FROM applications a WHERE a.tenant_id = $1;`, [req.tenantId]),
        pool.query(`
          SELECT COALESCE(NULLIF(a.course,''),'Unspecified') AS program,
                 COALESCE(SUM(p.amount),0)::bigint AS collected, COUNT(p.id)::int AS receipts
          FROM payments p
          JOIN applications a ON a.app_no = p.app_no AND a.tenant_id = p.tenant_id
          WHERE ${collected} ${rangeClause(range, 'p.created_at')}
          GROUP BY 1 ORDER BY collected DESC LIMIT 12;`, p),
        pool.query(`
          -- Money claimed but not yet cleared — the finance team's work queue.
          SELECT COALESCE(NULLIF(p.status,''),'Unspecified') AS status,
                 COUNT(*)::int AS receipts, COALESCE(SUM(p.amount),0)::bigint AS amount
          FROM payments p
          WHERE p.tenant_id = $1 AND p.status NOT IN ${APPROVED}
          GROUP BY 1 ORDER BY amount DESC;`, [req.tenantId]),
      ])

      const undated = await pool.query(
        `SELECT COUNT(*)::int AS receipts, COALESCE(SUM(p.amount),0)::bigint AS amount
         FROM payments p WHERE ${collected} AND p.created_at IS NULL;`, [req.tenantId])

      const out = outstanding.rows[0]
      const totalOutstanding = Number(out.applicationFee) + Number(out.registrationFee) + Number(out.tuitionFee)
      const collectedAmt = Number(totals.rows[0].collected)
      return {
        totals: totals.rows[0],
        byFeeType: byFeeType.rows,
        byMonth: byMonth.rows,
        byMode: byMode.rows,
        byProgram: byProgram.rows,
        pendingByStatus: pending.rows,
        outstanding: { ...out, total: totalOutstanding },
        // Share of everything demanded that has actually been banked.
        collectionEfficiency: (collectedAmt + totalOutstanding) > 0
          ? Math.round((collectedAmt / (collectedAmt + totalOutstanding)) * 1000) / 10
          : 0,
        undated: undated.rows[0],
      }
    }))
  } catch (err) {
    console.error('[analytics/finance]', err.message)
    res.status(500).json({ error: 'Failed to build the finance dashboard.' })
  }
})

// ── 30 · Management Command Centre ───────────────────────────────────────────
// One screen of core operational KPIs plus the exceptions worth waking someone
// for. Deliberately narrow: if a number here doesn't change a decision, it
// belongs on one of the dashboards above instead.
router.get('/command-centre', requirePermission('commandcentre.view'), async (req, res) => {
  const key = `cc:${req.tenantId}`
  try {
    res.json(await cached(key, async () => {
      const t = [req.tenantId]
      const [pipeline, today, finance, ops, health, topPerformers] = await Promise.all([
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM leads WHERE tenant_id = $1)                                          AS "totalLeads",
            (SELECT COUNT(*)::int FROM leads WHERE tenant_id = $1 AND stage = 'Untouched')                  AS untouched,
            (SELECT COUNT(*)::int FROM leads WHERE tenant_id = $1
               AND (owner IS NULL OR owner = '' OR owner = 'Unassigned'))                                   AS unassigned,
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1)                                   AS applications,
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1 AND COALESCE(admission_number,'') <> '') AS admitted,
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1 AND tuition_fee_paid)              AS enrolled;`, t),
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM leads WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE)        AS "newLeads",
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE) AS "newApplications",
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1
               AND admission_number_generated_at::date = CURRENT_DATE)                                       AS "newAdmissions",
            (SELECT COUNT(*)::int FROM payments WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE)     AS "paymentsLogged",
            (SELECT COUNT(*)::int FROM audit_logs WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE)   AS "auditEvents";`, t),
        pool.query(`
          SELECT
            (SELECT COALESCE(SUM(amount),0)::bigint FROM payments
              WHERE tenant_id = $1 AND status IN ${APPROVED}
                AND utr_number IS NOT NULL AND TRIM(utr_number) <> '')                       AS "collectedAllTime",
            (SELECT COALESCE(SUM(amount),0)::bigint FROM payments
              WHERE tenant_id = $1 AND status IN ${APPROVED}
                AND utr_number IS NOT NULL AND TRIM(utr_number) <> ''
                AND created_at >= date_trunc('month', NOW()))                                AS "collectedThisMonth",
            (SELECT COUNT(*)::int FROM payments
              WHERE tenant_id = $1 AND status = 'Payment Done')                              AS "awaitingApproval";`, t),
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM documents WHERE tenant_id = $1
               AND is_mandatory AND status NOT IN ('Verified','Rejected'))                   AS "docsAwaitingVerification",
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1
               AND admission_details_status = 'Pending' AND admission_full_details <> '{}'::jsonb) AS "kycAwaitingApproval",
            (SELECT COUNT(*)::int FROM tasks WHERE tenant_id = $1 AND status = 'Pending')    AS "openTasks",
            (SELECT COUNT(*)::int FROM lead_transfers
               WHERE tenant_id = $1 AND status = 'pending')                                  AS "transfersAwaiting";`, t),
        pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM applications WHERE tenant_id = $1 AND campusone_sync_status = 'Failed') AS "erpSyncFailures",
            (SELECT COUNT(*)::int FROM integration_sync_logs WHERE tenant_id = $1
               AND status = 'failed' AND started_at > NOW() - INTERVAL '24 hours')           AS "syncFailures24h",
            (SELECT COUNT(*)::int FROM login_events WHERE tenant_id = $1
               AND NOT success AND created_at > NOW() - INTERVAL '24 hours')                 AS "failedLogins24h",
            (SELECT COUNT(*)::int FROM user_sessions WHERE tenant_id = $1
               AND revoked_at IS NULL AND expires_at > NOW())                                AS "activeSessions";`, t),
        pool.query(`
          SELECT u.name, u.role,
                 COUNT(l.id)::int AS leads,
                 COUNT(l.id) FILTER (WHERE l.stage IN ('Payment Success','Converted'))::int AS converted
          FROM users u
          JOIN leads l ON LOWER(l.owner) = LOWER(u.name) AND l.tenant_id = u.tenant_id
          WHERE u.tenant_id = $1 AND u.status = 'Active'
          GROUP BY u.name, u.role
          ORDER BY converted DESC, leads DESC LIMIT 8;`, t),
      ])

      const pl = pipeline.rows[0], op = ops.rows[0], hl = health.rows[0], fi = finance.rows[0]

      // Exceptions, most severe first. Each carries the route the user should
      // land on, so the tile is one click from the work.
      const alerts = []
      const alert = (severity, label, count, to) => { if (count > 0) alerts.push({ severity, label, count, to }) }
      alert('critical', 'ERP syncs failed',                 hl.erpSyncFailures,        '/integration-hub')
      alert('critical', 'Integration runs failed (24h)',    hl.syncFailures24h,        '/integration-hub')
      alert('warning',  'Payments awaiting approval',       fi.awaitingApproval,       '/payments')
      alert('warning',  'Mandatory documents unverified',   op.docsAwaitingVerification, '/document-verification')
      alert('warning',  'Admission KYC awaiting approval',  op.kycAwaitingApproval,    '/applications')
      alert('warning',  'Leads unassigned',                 pl.unassigned,             '/leads')
      alert('info',     'Lead transfers awaiting decision', op.transfersAwaiting,      '/transfer-approvals')
      alert('info',     'Failed sign-ins (24h)',            hl.failedLogins24h,        '/security')

      const rank = { critical: 0, warning: 1, info: 2 }
      alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count)

      return {
        pipeline: pl,
        today: today.rows[0],
        finance: fi,
        operations: op,
        health: hl,
        topPerformers: topPerformers.rows,
        alerts,
        generatedAt: new Date().toISOString(),
      }
    }))
  } catch (err) {
    console.error('[analytics/command-centre]', err.message)
    res.status(500).json({ error: 'Failed to build the command centre.' })
  }
})

export default router
