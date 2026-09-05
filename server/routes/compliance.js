// Item 26 — Regulatory / Compliance: audit trail, student records, required
// reports, document repository.
//
// Every report below is generated from rows the CRM already holds. Where a
// statutory return needs a field nobody has captured yet (gender, category as
// a coded value), the column is emitted empty rather than guessed — a return
// filed from invented data is worse than an incomplete one.
import express from 'express'
import { pool } from '../db.js'
import { authenticateToken } from '../lib/auth.js'
import { requirePermission } from '../lib/permissions.js'
import { recordAudit, clientIp } from '../lib/audit.js'

const router = express.Router()
router.use(authenticateToken)

// admission_full_details holds the long KYC form; admission_details the short
// counsellor-entered block. Read a key from either, preferring the full form.
const detail = (key) => `COALESCE(NULLIF(a.admission_full_details->>'${key}',''), NULLIF(a.admission_details->>'${key}',''), '')`

// ── Workspace summary ────────────────────────────────────────────────────────
router.get('/summary', requirePermission('compliance.view'), async (req, res) => {
  const t = [req.tenantId]
  try {
    const [students, docs, audit, runs, retention] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE COALESCE(registration_number,'') <> '')::int AS registered,
               COUNT(*) FILTER (WHERE COALESCE(admission_number,'')   <> '')::int AS admitted,
               COUNT(*) FILTER (WHERE admission_full_details <> '{}'::jsonb)::int AS "kycComplete"
        FROM applications a WHERE tenant_id = $1;`, t),
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status='Verified')::int AS verified,
               COUNT(*) FILTER (WHERE status='Rejected')::int AS rejected,
               COUNT(*) FILTER (WHERE is_mandatory AND status <> 'Verified')::int AS "mandatoryOutstanding"
        FROM documents WHERE tenant_id = $1;`, t),
      pool.query(`
        SELECT COUNT(*)::int AS total,
               MIN(created_at) AS "oldestEvent",
               COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS "last30d"
        FROM audit_logs WHERE tenant_id = $1;`, t),
      pool.query(`
        SELECT report_code AS "reportCode", academic_year AS "academicYear", row_count AS "rowCount",
               generated_by AS "generatedBy", generated_at AS "generatedAt"
        FROM compliance_report_runs WHERE tenant_id = $1
        ORDER BY generated_at DESC LIMIT 10;`, t),
      pool.query(`
        SELECT entity, retain_months AS "retainMonths", legal_basis AS "legalBasis",
               action, updated_by AS "updatedBy", updated_at AS "updatedAt"
        FROM retention_policies WHERE tenant_id = $1 ORDER BY entity;`, t),
    ])
    res.json({
      students: students.rows[0],
      documents: docs.rows[0],
      audit: audit.rows[0],
      recentRuns: runs.rows,
      retention: retention.rows,
    })
  } catch (err) {
    console.error('[compliance/summary]', err.message)
    res.status(500).json({ error: 'Failed to build compliance summary.' })
  }
})

// ── Student records ──────────────────────────────────────────────────────────
// The permanent record an inspection asks for: one row per applicant, with the
// identifiers and completeness flags that determine whether the file is intact.
router.get('/student-records', requirePermission('compliance.view'), async (req, res) => {
  const { q, program, campus, status } = req.query
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50))
  const offset = Math.max(0, parseInt(req.query.offset) || 0)

  const where = ['a.tenant_id = $1']
  const params = [req.tenantId]
  const add = (clause, value) => { params.push(value); where.push(clause.replace('$?', `$${params.length}`)) }

  if (program) add('a.course = $?', program)
  if (campus)  add('a.campus = $?', campus)
  if (status === 'admitted')   where.push(`COALESCE(a.admission_number,'') <> ''`)
  if (status === 'registered') where.push(`COALESCE(a.registration_number,'') <> ''`)
  if (status === 'incomplete') where.push(`a.admission_full_details = '{}'::jsonb`)
  if (q) {
    params.push(`%${q}%`)
    const i = params.length
    where.push(`(a.name ILIKE $${i} OR a.email ILIKE $${i} OR a.mobile ILIKE $${i}
                 OR a.app_no ILIKE $${i} OR COALESCE(a.registration_number,'') ILIKE $${i}
                 OR COALESCE(a.admission_number,'') ILIKE $${i})`)
  }
  const whereSql = where.join(' AND ')

  try {
    const [rows, count] = await Promise.all([
      pool.query(`
        SELECT a.id, a.app_no AS "appNo", a.name, a.email, a.mobile,
               a.course AS program, a.school_dept AS "schoolDept", a.campus,
               a.stage, a.registration_number AS "registrationNumber",
               a.admission_number AS "admissionNumber", a.date AS "applicationDate",
               ${detail('dateOfBirth')} AS "dateOfBirth",
               ${detail('fatherName')} AS "fatherName",
               (a.admission_full_details <> '{}'::jsonb) AS "kycComplete",
               a.tuition_fee_paid AS "tuitionFeePaid",
               (SELECT COUNT(*)::int FROM documents d WHERE d.app_id = a.id AND d.tenant_id = a.tenant_id) AS "documentCount",
               (SELECT COUNT(*)::int FROM documents d WHERE d.app_id = a.id AND d.tenant_id = a.tenant_id
                  AND d.is_mandatory AND d.status <> 'Verified') AS "documentsOutstanding"
        FROM applications a
        WHERE ${whereSql}
        ORDER BY a.id DESC LIMIT ${limit} OFFSET ${offset};`, params),
      pool.query(`SELECT COUNT(*)::int AS c FROM applications a WHERE ${whereSql};`, params),
    ])
    res.json({ rows: rows.rows, total: count.rows[0].c, limit, offset })
  } catch (err) {
    console.error('[compliance/student-records]', err.message)
    res.status(500).json({ error: 'Failed to list student records.' })
  }
})

// One student's complete file, including the audit history of the record.
router.get('/student-records/:id', requirePermission('compliance.view'), async (req, res) => {
  const p = [req.params.id, req.tenantId]
  try {
    const appRes = await pool.query(
      `SELECT a.*, a.app_no AS "appNo", a.registration_number AS "registrationNumber",
              a.admission_number AS "admissionNumber"
       FROM applications a WHERE a.id = $1 AND a.tenant_id = $2;`, p)
    const app = appRes.rows[0]
    if (!app) return res.status(404).json({ error: 'Student record not found.' })

    const [docs, payments, history, academics, exams] = await Promise.all([
      pool.query(`
        SELECT id, type, category, status, upload_date AS "uploadDate", file_url AS "fileUrl",
               is_mandatory AS "isMandatory", verified_by AS "verifiedBy", verified_at AS "verifiedAt",
               rejection_reason AS "rejectionReason", sha256, size_bytes AS "sizeBytes",
               retention_until AS "retentionUntil"
        FROM documents WHERE app_id = $1 AND tenant_id = $2 ORDER BY id;`, p),
      pool.query(`
        SELECT id, amount, method, status, date, txn_id AS "txnId", utr_number AS "utrNumber",
               fee_type AS "feeType", pay_mode AS "payMode"
        FROM payments WHERE app_no = $1 AND tenant_id = $2 ORDER BY id;`, [app.app_no, req.tenantId]),
      pool.query(`
        SELECT id, actor_email AS "actorEmail", action, summary, created_at AS "createdAt"
        FROM audit_logs
        WHERE tenant_id = $2 AND entity_type = 'applications' AND entity_id = $1::text
        ORDER BY created_at DESC LIMIT 100;`, p),
      pool.query(`
        SELECT academic_year AS "academicYear", term, credits_registered AS "creditsRegistered",
               credits_earned AS "creditsEarned", gpa, cgpa, attendance_pct AS "attendancePct", status
        FROM academic_records
        WHERE tenant_id = $2 AND (app_id = $1::int OR ($3 <> '' AND registration_number = $3))
        ORDER BY academic_year, term;`, [req.params.id, req.tenantId, app.registration_number || '']),
      pool.query(`
        SELECT academic_year AS "academicYear", term, exam_code AS "examCode",
               subject_code AS "subjectCode", subject_name AS "subjectName",
               max_marks AS "maxMarks", obtained_marks AS "obtainedMarks", grade, result
        FROM exam_results
        WHERE tenant_id = $1 AND $2 <> '' AND registration_number = $2
        ORDER BY academic_year, term, subject_code;`, [req.tenantId, app.registration_number || '']),
    ])

    res.json({
      application: {
        id: app.id, appNo: app.app_no, name: app.name, email: app.email, mobile: app.mobile,
        program: app.course, schoolDept: app.school_dept, campus: app.campus, stage: app.stage,
        owner: app.owner, applicationDate: app.date,
        registrationNumber: app.registration_number, admissionNumber: app.admission_number,
        admissionDetails: app.admission_details || {},
        admissionFullDetails: app.admission_full_details || {},
      },
      documents: docs.rows,
      payments: payments.rows,
      academicRecords: academics.rows,
      examResults: exams.rows,
      auditHistory: history.rows,
    })
  } catch (err) {
    console.error('[compliance/student-record]', err.message)
    res.status(500).json({ error: 'Failed to load the student record.' })
  }
})

// ── Statutory reports ────────────────────────────────────────────────────────
// Each entry names its columns and the SQL that fills them. `unavailable` lists
// columns the CRM cannot populate today, so the UI can warn before an export is
// filed rather than after.
const REPORTS = {
  'admission-register': {
    label: 'Admission Register',
    description: 'The statutory register of admitted students — one row per admission, in admission-number order.',
    unavailable: ['gender', 'socialCategory'],
    sql: (yearFilter) => `
      SELECT a.admission_number AS "admissionNumber", a.registration_number AS "registrationNumber",
             a.app_no AS "applicationNo", a.name AS "studentName",
             ${detail('fatherName')} AS "fatherName", ${detail('motherName')} AS "motherName",
             ${detail('dateOfBirth')} AS "dateOfBirth", ${detail('nationality')} AS nationality,
             ${detail('religion')} AS religion, ${detail('caste')} AS caste,
             '' AS gender, '' AS "socialCategory",
             a.course AS program, a.school_dept AS "school", a.campus,
             a.email, a.mobile, ${detail('address')} AS address, ${detail('state')} AS state,
             a.admission_number_generated_at AS "admissionDate",
             CASE WHEN a.tuition_fee_paid THEN 'Paid' ELSE 'Pending' END AS "tuitionFeeStatus"
      FROM applications a
      WHERE a.tenant_id = $1 AND COALESCE(a.admission_number,'') <> '' ${yearFilter}
      ORDER BY a.admission_number;`,
  },
  'enrolment-summary': {
    label: 'Enrolment Summary',
    description: 'Admitted headcount by programme, school and campus — the aggregate most returns open with.',
    unavailable: ['genderSplit'],
    sql: (yearFilter) => `
      SELECT a.course AS program, COALESCE(NULLIF(a.school_dept,''),'Unassigned') AS school,
             a.campus, COUNT(*)::int AS admitted,
             SUM(CASE WHEN a.tuition_fee_paid THEN 1 ELSE 0 END)::int AS "feePaid",
             SUM(CASE WHEN a.admission_full_details <> '{}'::jsonb THEN 1 ELSE 0 END)::int AS "kycComplete"
      FROM applications a
      WHERE a.tenant_id = $1 AND COALESCE(a.admission_number,'') <> '' ${yearFilter}
      GROUP BY a.course, school, a.campus
      ORDER BY admitted DESC;`,
  },
  'fee-collection': {
    label: 'Fee Collection Register',
    description: 'Every approved receipt with its UTR/transaction reference, for reconciliation and audit.',
    unavailable: [],
    sql: () => `
      SELECT p.date AS "receiptDate", p.app_no AS "applicationNo", p.name AS "studentName",
             a.registration_number AS "registrationNumber", a.course AS program, a.campus,
             p.fee_type AS "feeType", p.amount, p.method, p.pay_mode AS "mode",
             p.utr_number AS "utrReference", p.txn_id AS "transactionId", p.status
      FROM payments p
      LEFT JOIN applications a ON a.app_no = p.app_no AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.status IN ('Approved','Payment Approved','Paid')
      ORDER BY p.id DESC;`,
  },
  'document-compliance': {
    label: 'Document Compliance Register',
    description: 'Mandatory-document status per admitted student — the checklist an inspection works through.',
    unavailable: [],
    sql: () => `
      SELECT a.admission_number AS "admissionNumber", a.app_no AS "applicationNo",
             a.name AS "studentName", a.course AS program, a.campus,
             COUNT(d.id)::int AS "documentsOnFile",
             COUNT(d.id) FILTER (WHERE d.is_mandatory)::int AS "mandatoryExpected",
             COUNT(d.id) FILTER (WHERE d.is_mandatory AND d.status = 'Verified')::int AS "mandatoryVerified",
             COUNT(d.id) FILTER (WHERE d.status = 'Rejected')::int AS "rejected",
             CASE WHEN COUNT(d.id) FILTER (WHERE d.is_mandatory AND d.status <> 'Verified') = 0
                  THEN 'Complete' ELSE 'Incomplete' END AS "fileStatus"
      FROM applications a
      LEFT JOIN documents d ON d.app_id = a.id AND d.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND COALESCE(a.admission_number,'') <> ''
      GROUP BY a.id, a.admission_number, a.app_no, a.name, a.course, a.campus
      ORDER BY "fileStatus", a.admission_number;`,
  },
  'data-access-log': {
    label: 'Data Access & Disclosure Log',
    description: 'Exports, credential reveals and deletions from the audit trail — evidence for DPDP Act enquiries.',
    unavailable: [],
    sql: () => `
      SELECT created_at AS "timestamp", actor_email AS "actor", actor_role AS "role",
             action, entity_type AS "entity", entity_id AS "entityId", summary, ip
      FROM audit_logs
      WHERE tenant_id = $1 AND action IN ('EXPORT','REVEAL_SECRET','DELETE','IMPERSONATE','REVOKE','GRANT_ROLE')
      ORDER BY created_at DESC LIMIT 5000;`,
  },
}

router.get('/reports', requirePermission('compliance.view'), (_req, res) => {
  res.json(Object.entries(REPORTS).map(([code, r]) => ({
    code, label: r.label, description: r.description, unavailable: r.unavailable,
  })))
})

function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v) => {
    if (v == null) return ''
    const s = v instanceof Date ? v.toISOString() : String(v)
    // Prefix formula-triggering characters so a spreadsheet treats the value as
    // text — a name beginning "=" must not execute when the return is opened.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n')
}

router.get('/reports/:code', requirePermission('compliance.export'), async (req, res) => {
  const report = REPORTS[req.params.code]
  if (!report) return res.status(404).json({ error: 'Unknown report.' })

  const year = (req.query.academicYear || '').trim()
  const params = [req.tenantId]
  let yearFilter = ''
  if (year) {
    // Admission year, taken from when the admission number was issued.
    params.push(year)
    yearFilter = `AND EXTRACT(YEAR FROM a.admission_number_generated_at)::text = $${params.length}`
  }

  try {
    const r = await pool.query(report.sql(yearFilter), params)

    await pool.query(
      `INSERT INTO compliance_report_runs (tenant_id, report_code, academic_year, row_count, params, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6);`,
      [req.tenantId, req.params.code, year, r.rows.length,
       JSON.stringify({ format: req.query.format || 'json' }), req.user.email]
    ).catch(() => {})

    await recordAudit({
      tenantId: req.tenantId, actorId: req.user.id, actorEmail: req.user.email, actorRole: req.userRole,
      action: 'EXPORT', entityType: 'compliance_report', entityId: req.params.code,
      summary: `Generated "${report.label}"${year ? ` for ${year}` : ''} — ${r.rows.length} row(s)`,
      ip: clientIp(req), userAgent: req.headers['user-agent'],
    })

    if (req.query.format === 'csv') {
      const stamp = new Date().toISOString().slice(0, 10)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.code}-${stamp}.csv"`)
      return res.send(toCsv(r.rows))
    }
    res.json({
      code: req.params.code, label: report.label, unavailable: report.unavailable,
      rowCount: r.rows.length, rows: r.rows,
    })
  } catch (err) {
    console.error('[compliance/report]', err.message)
    res.status(500).json({ error: 'Failed to generate the report.' })
  }
})

router.get('/report-runs', requirePermission('compliance.view'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, report_code AS "reportCode", academic_year AS "academicYear", row_count AS "rowCount",
             params, generated_by AS "generatedBy", generated_at AS "generatedAt"
      FROM compliance_report_runs WHERE tenant_id = $1
      ORDER BY generated_at DESC LIMIT 100;`, [req.tenantId])
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to read report history.' })
  }
})

// ── Document repository ──────────────────────────────────────────────────────
router.get('/documents', requirePermission('documents.view'), async (req, res) => {
  const { q, status, category, mandatory } = req.query
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100))
  const offset = Math.max(0, parseInt(req.query.offset) || 0)

  const where = ['d.tenant_id = $1']
  const params = [req.tenantId]
  const add = (clause, value) => { params.push(value); where.push(clause.replace('$?', `$${params.length}`)) }
  if (status)    add('d.status = $?', status)
  if (category)  add('d.category = $?', category)
  if (mandatory === 'true') where.push('d.is_mandatory')
  if (q) {
    params.push(`%${q}%`)
    const i = params.length
    where.push(`(d.student ILIKE $${i} OR d.type ILIKE $${i} OR COALESCE(a.app_no,'') ILIKE $${i})`)
  }
  const whereSql = where.join(' AND ')

  try {
    const [rows, count, facets] = await Promise.all([
      pool.query(`
        SELECT d.id, d.student, d.type, d.category, d.status, d.upload_date AS "uploadDate",
               d.file_url AS "fileUrl", d.is_mandatory AS "isMandatory",
               d.verified_by AS "verifiedBy", d.verified_at AS "verifiedAt",
               d.rejection_reason AS "rejectionReason", d.sha256, d.size_bytes AS "sizeBytes",
               d.retention_until AS "retentionUntil", d.archived_at AS "archivedAt",
               a.app_no AS "appNo", a.course AS program
        FROM documents d
        LEFT JOIN applications a ON a.id = d.app_id AND a.tenant_id = d.tenant_id
        WHERE ${whereSql} ORDER BY d.id DESC LIMIT ${limit} OFFSET ${offset};`, params),
      pool.query(`
        SELECT COUNT(*)::int AS c FROM documents d
        LEFT JOIN applications a ON a.id = d.app_id AND a.tenant_id = d.tenant_id
        WHERE ${whereSql};`, params),
      pool.query(`
        SELECT json_agg(DISTINCT status) AS statuses,
               json_agg(DISTINCT NULLIF(category,'')) AS categories
        FROM documents WHERE tenant_id = $1;`, [req.tenantId]),
    ])
    res.json({
      rows: rows.rows, total: count.rows[0].c, limit, offset,
      facets: {
        statuses:   (facets.rows[0].statuses   || []).filter(Boolean).sort(),
        categories: (facets.rows[0].categories || []).filter(Boolean).sort(),
      },
    })
  } catch (err) {
    console.error('[compliance/documents]', err.message)
    res.status(500).json({ error: 'Failed to search the document repository.' })
  }
})

// ── Retention policies ───────────────────────────────────────────────────────
router.get('/retention', requirePermission('compliance.view'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT entity, retain_months AS "retainMonths", legal_basis AS "legalBasis",
             action, updated_by AS "updatedBy", updated_at AS "updatedAt"
      FROM retention_policies WHERE tenant_id = $1 ORDER BY entity;`, [req.tenantId])

    // How many rows each policy currently covers, and how many are already past
    // their retention window and awaiting the stated action.
    const TABLES = { documents: 'upload_date', audit_logs: 'created_at', leads: null, email_logs: 'sent_at', payments: null }
    const rows = []
    for (const p of r.rows) {
      let total = null, overdue = null
      const col = TABLES[p.entity]
      try {
        const c = await pool.query(`SELECT COUNT(*)::int AS c FROM ${p.entity} WHERE tenant_id = $1;`, [req.tenantId])
        total = c.rows[0].c
        if (col) {
          const o = await pool.query(
            `SELECT COUNT(*)::int AS c FROM ${p.entity}
             WHERE tenant_id = $1 AND ${col}::timestamp < NOW() - ($2 || ' months')::interval;`,
            [req.tenantId, String(p.retainMonths)])
          overdue = o.rows[0].c
        }
      } catch { /* table or column shape differs — counts stay null */ }
      rows.push({ ...p, total, overdue })
    }
    res.json(rows)
  } catch (err) {
    console.error('[compliance/retention]', err.message)
    res.status(500).json({ error: 'Failed to read retention policies.' })
  }
})

router.put('/retention/:entity', requirePermission('retention.manage'), async (req, res) => {
  const months = parseInt(req.body.retainMonths)
  const action = String(req.body.action || 'review')
  if (!Number.isFinite(months) || months < 1 || months > 600) {
    return res.status(400).json({ error: 'retainMonths must be between 1 and 600.' })
  }
  if (!['review', 'archive', 'purge'].includes(action)) {
    return res.status(400).json({ error: 'action must be review, archive or purge.' })
  }
  try {
    const r = await pool.query(
      `UPDATE retention_policies
       SET retain_months = $1, action = $2, legal_basis = COALESCE($3, legal_basis),
           updated_by = $4, updated_at = NOW()
       WHERE tenant_id = $5 AND entity = $6
       RETURNING entity, retain_months AS "retainMonths", action, legal_basis AS "legalBasis";`,
      [months, action, req.body.legalBasis ?? null, req.user.email, req.tenantId, req.params.entity])
    if (!r.rows[0]) return res.status(404).json({ error: 'No policy for that entity.' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('[compliance/retention-update]', err.message)
    res.status(500).json({ error: 'Failed to update the retention policy.' })
  }
})

export default router
