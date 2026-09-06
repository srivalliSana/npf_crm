import React, { useState } from 'react'
import {
  ScrollText, Users, FolderArchive, FileSpreadsheet, Timer, Search,
  Download, RefreshCw, ChevronLeft, ChevronRight, ShieldAlert, FileText,
} from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Tabs, StatCard, Badge, Button, Modal } from '../components/ui'
import { Panel, Loading, ErrorState, useAsync, ScrollX } from '../components/ModuleKit'
import { apiGet, apiPut, downloadFile, fmtInt, fmtDate, fmtDateTime, fmtBytes } from '../lib/api'
import { usePermissions } from '../hooks/usePermissions'

// Item 26 — Regulatory / Compliance.
//
// Four things an inspection or a DPDP enquiry actually asks for: what happened
// (audit trail), whose record it happened to (student records), the returns
// themselves (required reports), and where the evidence is filed (document
// repository) — plus the retention rules that govern all of it.

const STATUS_VARIANT = { Verified: 'success', Rejected: 'danger', Pending: 'warning' }

function Pager({ total, limit, offset, onChange }) {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  if (total <= limit) return null
  return (
    <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-gray-100">
      <span className="text-xs text-gray-500">
        {fmtInt(offset + 1)}–{fmtInt(Math.min(offset + limit, total))} of {fmtInt(total)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(offset - limit)}>Prev</Button>
        <span className="text-xs text-gray-500 px-1">{page} / {pages}</span>
        <Button variant="ghost" size="sm" icon={ChevronRight} iconPosition="right" disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  )
}

// ── Audit trail ──────────────────────────────────────────────────────────────
function AuditTrail() {
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [offset, setOffset] = useState(0)
  const [detail, setDetail] = useState(null)
  const limit = 50

  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/security/audit-logs', { q, action, entityType, limit, offset }),
    [q, action, entityType, offset])

  const reset = (fn) => (v) => { fn(v); setOffset(0) }

  return (
    <Panel
      title="Audit trail"
      subtitle="Every mutating action, with the actor, the target and the outcome"
      action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>}
    >
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field !pl-8 !py-1.5 text-xs"
            placeholder="Search summary, path or record id…"
            defaultValue={q}
            onKeyDown={e => { if (e.key === 'Enter') reset(setQ)(e.target.value) }}
            onBlur={e => reset(setQ)(e.target.value)}
          />
        </div>
        <select value={action} onChange={e => reset(setAction)(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All actions</option>
          {(data?.facets.actions || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={entityType} onChange={e => reset(setEntityType)(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All entities</option>
          {(data?.facets.entities || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <ScrollX>
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr>
                  <th className="table-th">When</th>
                  <th className="table-th">Actor</th>
                  <th className="table-th">Action</th>
                  <th className="table-th">Entity</th>
                  <th className="table-th">Summary</th>
                  <th className="table-th">IP</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={7} className="table-td text-center text-gray-400 py-10">No audit events match these filters.</td></tr>
                )}
                {data.rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="table-td whitespace-nowrap text-gray-500">{fmtDateTime(r.createdAt)}</td>
                    <td className="table-td">
                      <div className="font-medium text-gray-800 truncate max-w-[180px]">{r.actorEmail || 'system'}</div>
                      {r.actorRole && <div className="text-[10px] text-gray-400">{r.actorRole}</div>}
                    </td>
                    <td className="table-td"><Badge variant={r.action === 'DELETE' ? 'danger' : r.action === 'CREATE' ? 'success' : 'neutral'}>{r.action}</Badge></td>
                    <td className="table-td text-gray-600">{r.entityType}{r.entityId ? ` #${r.entityId}` : ''}</td>
                    <td className="table-td text-gray-600">
                      <span className="truncate block max-w-[260px]" title={r.summary}>{r.summary}</span>
                    </td>
                    <td className="table-td text-gray-400 text-xs">{r.ip || '—'}</td>
                    <td className="table-td text-right">
                      <button onClick={() => setDetail(r)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title="Audit event" size="xl">
          <div className="space-y-3 text-sm">
            {[
              ['When', fmtDateTime(detail.createdAt)],
              ['Actor', `${detail.actorEmail || 'system'}${detail.actorRole ? ` (${detail.actorRole})` : ''}`],
              ['Action', detail.action],
              ['Entity', `${detail.entityType}${detail.entityId ? ` #${detail.entityId}` : ''}`],
              ['Request', `${detail.method} ${detail.path}`],
              ['Response', detail.statusCode],
              ['IP', detail.ip || '—'],
              ['Client', detail.userAgent || '—'],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-2">
                <span className="text-xs text-gray-400 font-medium">{k}</span>
                <span className="col-span-2 text-gray-700 break-words">{v}</span>
              </div>
            ))}
            <div>
              <div className="text-xs text-gray-400 font-medium mb-1">Payload (secrets redacted)</div>
              <pre className="bg-gray-50 rounded-lg p-3 text-[11px] text-gray-700 overflow-x-auto max-h-64">
                {JSON.stringify(detail.changes, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  )
}

// ── Student records ──────────────────────────────────────────────────────────
function StudentRecords() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [openId, setOpenId] = useState(null)
  const limit = 50

  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/compliance/student-records', { q, status, limit, offset }), [q, status, offset])

  return (
    <>
      <Panel
        title="Student records"
        subtitle="The permanent record per applicant — identifiers, KYC and file completeness"
        action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>}
      >
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-field !pl-8 !py-1.5 text-xs"
              placeholder="Name, email, mobile, application / registration / admission no…"
              defaultValue={q}
              onKeyDown={e => { if (e.key === 'Enter') { setQ(e.target.value); setOffset(0) } }}
              onBlur={e => { setQ(e.target.value); setOffset(0) }}
            />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }} className="input-field !w-auto !py-1.5 text-xs">
            <option value="">All applicants</option>
            <option value="admitted">Admitted</option>
            <option value="registered">Registered</option>
            <option value="incomplete">KYC incomplete</option>
          </select>
        </div>

        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
          <>
            <ScrollX>
              <table className="w-full text-sm border-collapse min-w-[820px]">
                <thead>
                  <tr>
                    <th className="table-th">Student</th>
                    <th className="table-th">Application</th>
                    <th className="table-th">Registration</th>
                    <th className="table-th">Admission</th>
                    <th className="table-th">Programme</th>
                    <th className="table-th">KYC</th>
                    <th className="table-th">Documents</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={8} className="table-td text-center text-gray-400 py-10">No student records match.</td></tr>
                  )}
                  {data.rows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="table-td">
                        <div className="font-medium text-gray-800">{r.name}</div>
                        <div className="text-[10px] text-gray-400">{r.email}</div>
                      </td>
                      <td className="table-td font-mono text-xs text-gray-600">{r.appNo}</td>
                      <td className="table-td font-mono text-xs text-gray-600">{r.registrationNumber || '—'}</td>
                      <td className="table-td font-mono text-xs text-gray-600">{r.admissionNumber || '—'}</td>
                      <td className="table-td text-gray-600 max-w-[160px] truncate" title={r.program}>{r.program}</td>
                      <td className="table-td">
                        <Badge variant={r.kycComplete ? 'success' : 'warning'}>{r.kycComplete ? 'Complete' : 'Incomplete'}</Badge>
                      </td>
                      <td className="table-td">
                        {r.documentsOutstanding > 0
                          ? <Badge variant="danger">{r.documentsOutstanding} outstanding</Badge>
                          : <Badge variant="success">{fmtInt(r.documentCount)} on file</Badge>}
                      </td>
                      <td className="table-td text-right">
                        <button onClick={() => setOpenId(r.id)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Open file</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
            <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
          </>
        )}
      </Panel>

      {openId && <StudentFile id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}

function StudentFile({ id, onClose }) {
  const { data, loading, error } = useAsync(() => apiGet(`/api/compliance/student-records/${id}`), [id])

  return (
    <Modal open onClose={onClose} title="Student file" size="2xl">
      {loading ? <Loading /> : error ? <ErrorState error={error} /> : (
        <div className="space-y-5">
          <div>
            <h4 className="text-base font-bold text-gray-900">{data.application.name}</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.application.program} · {data.application.campus} · {data.application.email}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="neutral">App {data.application.appNo}</Badge>
              {data.application.registrationNumber && <Badge variant="info">Reg {data.application.registrationNumber}</Badge>}
              {data.application.admissionNumber && <Badge variant="success">Adm {data.application.admissionNumber}</Badge>}
            </div>
          </div>

          <Section title={`Documents (${data.documents.length})`} empty="No documents on file.">
            {data.documents.map(d => (
              <div key={d.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <FileText size={14} className="text-gray-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-800 truncate">{d.type}{d.isMandatory && <span className="text-danger-500 ml-1">*</span>}</div>
                  <div className="text-[10px] text-gray-400">
                    {d.uploadDate || '—'}{d.sizeBytes ? ` · ${fmtBytes(d.sizeBytes)}` : ''}
                    {d.retentionUntil ? ` · retain until ${fmtDate(d.retentionUntil)}` : ''}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[d.status] || 'neutral'}>{d.status}</Badge>
              </div>
            ))}
          </Section>

          <Section title={`Payments (${data.payments.length})`} empty="No payments recorded.">
            {data.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
                <div>
                  <div className="text-gray-800">{p.feeType || 'Fee'} · ₹{Number(p.amount).toLocaleString('en-IN')}</div>
                  <div className="text-[10px] text-gray-400">{p.date} · {p.utrNumber || p.txnId || 'no reference'}</div>
                </div>
                <Badge variant={/approved|paid/i.test(p.status) ? 'success' : 'warning'}>{p.status}</Badge>
              </div>
            ))}
          </Section>

          <Section title={`Academic records (${data.academicRecords.length})`} empty="No academic records synced for this student.">
            {data.academicRecords.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
                <span className="text-gray-700">{a.academicYear} · {a.term}</span>
                <span className="text-gray-500 text-xs">
                  GPA {a.gpa ?? '—'} · CGPA {a.cgpa ?? '—'} · Attendance {a.attendancePct ?? '—'}%
                </span>
              </div>
            ))}
          </Section>

          <Section title={`Examination results (${data.examResults.length})`} empty="No examination results synced for this student.">
            {data.examResults.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
                <span className="text-gray-700">{e.subjectName || e.subjectCode}</span>
                <span className="text-gray-500 text-xs">
                  {e.obtainedMarks ?? '—'}/{e.maxMarks} · {e.grade || '—'} · {e.result || '—'}
                </span>
              </div>
            ))}
          </Section>

          <Section title={`Record history (${data.auditHistory.length})`} empty="No audit events recorded against this record yet.">
            {data.auditHistory.map(h => (
              <div key={h.id} className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0 text-xs">
                <span className="text-gray-400 whitespace-nowrap w-32 flex-shrink-0">{fmtDateTime(h.createdAt)}</span>
                <span className="text-gray-700 flex-1">{h.summary}</span>
                <span className="text-gray-400 truncate max-w-[140px]">{h.actorEmail}</span>
              </div>
            ))}
          </Section>
        </div>
      )}
    </Modal>
  )
}

function Section({ title, children, empty }) {
  const hasChildren = React.Children.count(children) > 0
  return (
    <div>
      <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{title}</h5>
      {hasChildren ? <div>{children}</div> : <p className="text-xs text-gray-400 py-2">{empty}</p>}
    </div>
  )
}

// ── Required reports ─────────────────────────────────────────────────────────
function RequiredReports() {
  const { can } = usePermissions()
  const [year, setYear] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const reports = useAsync(() => apiGet('/api/compliance/reports'), [])
  const runs = useAsync(() => apiGet('/api/compliance/report-runs'), [])

  const generate = async (code, label) => {
    setBusy(code); setMsg(null)
    try {
      await downloadFile(`/api/compliance/reports/${code}`, { format: 'csv', academicYear: year }, `${code}.csv`)
      setMsg({ tone: 'success', text: `"${label}" downloaded.` })
      runs.reload()
    } catch (e) {
      setMsg({ tone: 'danger', text: e.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Statutory reports"
        subtitle="Generated live from CRM records and downloaded as CSV"
        action={
          <input
            className="input-field !w-32 !py-1.5 text-xs"
            placeholder="Year e.g. 2026"
            value={year}
            onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        }
      >
        {msg && (
          <div className={`mb-4 text-xs rounded-lg px-3 py-2 ${msg.tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
            {msg.text}
          </div>
        )}
        {reports.loading ? <Loading /> : reports.error ? <ErrorState error={reports.error} onRetry={reports.reload} /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {reports.data.map(r => (
              <div key={r.code} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-800">{r.label}</h4>
                    <p className="text-xs text-gray-500 mt-1">{r.description}</p>
                  </div>
                  <FileSpreadsheet size={18} className="text-gray-300 flex-shrink-0" />
                </div>

                {/* Columns the CRM cannot fill are named up front, so nobody
                    files a return assuming they were captured. */}
                {r.unavailable?.length > 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-warning-700 bg-warning-50 rounded-lg px-2.5 py-1.5">
                    <ShieldAlert size={12} className="flex-shrink-0 mt-0.5" />
                    <span>Exported empty — not captured anywhere in the CRM: <strong>{r.unavailable.join(', ')}</strong></span>
                  </div>
                )}

                <div className="mt-auto pt-1">
                  <Button
                    size="sm" variant="secondary" icon={Download}
                    loading={busy === r.code}
                    disabled={!can('compliance.export')}
                    onClick={() => generate(r.code, r.label)}
                  >
                    Download CSV
                  </Button>
                  {!can('compliance.export') && (
                    <span className="text-[11px] text-gray-400 ml-2">Requires the compliance.export permission</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Generation history" subtitle="Every export is itself an audited event">
        {runs.loading ? <Loading /> : runs.error ? <ErrorState error={runs.error} onRetry={runs.reload} /> : (
          <ScrollX>
            <table className="w-full text-sm border-collapse min-w-[520px]">
              <thead>
                <tr>
                  <th className="table-th">Generated</th>
                  <th className="table-th">Report</th>
                  <th className="table-th">Year</th>
                  <th className="table-th text-right">Rows</th>
                  <th className="table-th">By</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.length === 0 && (
                  <tr><td colSpan={5} className="table-td text-center text-gray-400 py-10">No reports generated yet.</td></tr>
                )}
                {runs.data.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="table-td text-gray-500 whitespace-nowrap">{fmtDateTime(r.generatedAt)}</td>
                    <td className="table-td text-gray-800">{r.reportCode}</td>
                    <td className="table-td text-gray-500">{r.academicYear || 'All'}</td>
                    <td className="table-td text-right tabular-nums">{fmtInt(r.rowCount)}</td>
                    <td className="table-td text-gray-500 truncate max-w-[200px]">{r.generatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Panel>
    </div>
  )
}

// ── Document repository ──────────────────────────────────────────────────────
function DocumentRepository() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 100
  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/compliance/documents', { q, status, limit, offset }), [q, status, offset])

  return (
    <Panel
      title="Document repository"
      subtitle="Every uploaded document, its verification state and its retention date"
      action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>}
    >
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field !pl-8 !py-1.5 text-xs"
            placeholder="Student, document type or application no…"
            defaultValue={q}
            onKeyDown={e => { if (e.key === 'Enter') { setQ(e.target.value); setOffset(0) } }}
            onBlur={e => { setQ(e.target.value); setOffset(0) }}
          />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All statuses</option>
          {(data?.facets.statuses || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <ScrollX>
            <table className="w-full text-sm border-collapse min-w-[760px]">
              <thead>
                <tr>
                  <th className="table-th">Student</th>
                  <th className="table-th">Application</th>
                  <th className="table-th">Document</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Uploaded</th>
                  <th className="table-th">Verified by</th>
                  <th className="table-th">Retain until</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={8} className="table-td text-center text-gray-400 py-10">No documents match.</td></tr>
                )}
                {data.rows.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="table-td text-gray-800">{d.student}</td>
                    <td className="table-td font-mono text-xs text-gray-500">{d.appNo || '—'}</td>
                    <td className="table-td text-gray-600">
                      {d.type}{d.isMandatory && <span className="text-danger-500 ml-1" title="Mandatory">*</span>}
                    </td>
                    <td className="table-td"><Badge variant={STATUS_VARIANT[d.status] || 'neutral'}>{d.status}</Badge></td>
                    <td className="table-td text-gray-500 text-xs">{d.uploadDate || '—'}</td>
                    <td className="table-td text-gray-500 text-xs truncate max-w-[160px]">{d.verifiedBy || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{d.retentionUntil ? fmtDate(d.retentionUntil) : '—'}</td>
                    <td className="table-td text-right">
                      {d.fileUrl
                        ? <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:text-primary-700 font-medium">Open</a>
                        : <span className="text-xs text-gray-300">No file</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
        </>
      )}
    </Panel>
  )
}

// ── Retention ────────────────────────────────────────────────────────────────
function Retention() {
  const { can } = usePermissions()
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/compliance/retention'), [])
  const [saving, setSaving] = useState('')

  const save = async (entity, patch) => {
    setSaving(entity)
    try { await apiPut(`/api/compliance/retention/${entity}`, patch); reload() }
    catch (e) { alert(e.message) }
    finally { setSaving('') }
  }

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <Panel
      title="Records retention"
      subtitle="How long each class of record is kept, on what legal basis, and what happens after"
    >
      <ScrollX>
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead>
            <tr>
              <th className="table-th">Record class</th>
              <th className="table-th">Legal basis</th>
              <th className="table-th text-right">Retain (months)</th>
              <th className="table-th">After expiry</th>
              <th className="table-th text-right">Rows held</th>
              <th className="table-th text-right">Past retention</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.entity} className="hover:bg-gray-50/80 transition-colors">
                <td className="table-td font-medium text-gray-800">{p.entity}</td>
                <td className="table-td text-gray-500 text-xs max-w-[280px]">{p.legalBasis || '—'}</td>
                <td className="table-td text-right">
                  <input
                    type="number" min={1} max={600} defaultValue={p.retainMonths}
                    disabled={!can('retention.manage') || saving === p.entity}
                    className="input-field !w-20 !py-1 text-xs text-right disabled:bg-gray-50"
                    onBlur={e => {
                      const v = parseInt(e.target.value)
                      if (v !== p.retainMonths) save(p.entity, { retainMonths: v, action: p.action })
                    }}
                  />
                </td>
                <td className="table-td">
                  <select
                    defaultValue={p.action}
                    disabled={!can('retention.manage') || saving === p.entity}
                    className="input-field !w-auto !py-1 text-xs disabled:bg-gray-50"
                    onChange={e => save(p.entity, { retainMonths: p.retainMonths, action: e.target.value })}
                  >
                    <option value="review">Flag for review</option>
                    <option value="archive">Archive</option>
                    <option value="purge">Purge</option>
                  </select>
                </td>
                <td className="table-td text-right tabular-nums text-gray-600">{p.total == null ? '—' : fmtInt(p.total)}</td>
                <td className="table-td text-right">
                  {p.overdue == null ? <span className="text-gray-300">—</span>
                    : p.overdue > 0 ? <Badge variant="warning">{fmtInt(p.overdue)}</Badge>
                    : <Badge variant="success">0</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      <p className="text-[11px] text-gray-400 mt-4">
        Setting a policy records the intent and surfaces what has aged out. Deletion is not automated —
        purging a student record is irreversible and stays a deliberate, human action.
      </p>
      {!can('retention.manage') && (
        <p className="text-[11px] text-gray-400 mt-1">Editing requires the retention.manage permission.</p>
      )}
    </Panel>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'audit',      label: 'Audit trail',      icon: ScrollText },
  { id: 'students',   label: 'Student records',  icon: Users },
  { id: 'reports',    label: 'Required reports', icon: FileSpreadsheet },
  { id: 'documents',  label: 'Document repository', icon: FolderArchive },
  { id: 'retention',  label: 'Retention',        icon: Timer },
]

export default function Compliance() {
  const [tab, setTab] = useState('audit')
  const summary = useAsync(() => apiGet('/api/compliance/summary'), [])
  const s = summary.data

  return (
    <PageContainer
      title="Regulatory & Compliance"
      description="Audit trail, student records, statutory reports and the document repository"
    >
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard icon={Users} label="Student records" value={fmtInt(s.students.total)} tone="primary" />
          <StatCard icon={FolderArchive} label="Documents on file" value={fmtInt(s.documents.total)} tone="info" />
          <StatCard icon={ShieldAlert} label="Mandatory outstanding" value={fmtInt(s.documents.mandatoryOutstanding)} tone={s.documents.mandatoryOutstanding > 0 ? 'danger' : 'success'} />
          <StatCard icon={ScrollText} label="Audit events (30d)" value={fmtInt(s.audit.last30d)} tone="neutral" />
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5 overflow-x-auto" />

      {tab === 'audit'     && <AuditTrail />}
      {tab === 'students'  && <StudentRecords />}
      {tab === 'reports'   && <RequiredReports />}
      {tab === 'documents' && <DocumentRepository />}
      {tab === 'retention' && <Retention />}
    </PageContainer>
  )
}
