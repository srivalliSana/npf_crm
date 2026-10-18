import React, { useState } from 'react'
import {
  ClipboardCheck, RefreshCw, CheckCircle2, XCircle, FileText, ExternalLink, Send,
  Clock, AlertTriangle, ShieldCheck, Users,
} from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Badge, Button, StatCard } from '../components/ui'
import { Panel, Loading, ErrorState, useAsync, ScrollX } from '../components/ModuleKit'
import { apiGet, apiPost, apiPut, fmtInt, fmtDateTime, fmtBytes } from '../lib/api'
import { usePermissions } from '../hooks/usePermissions'
import { useCcrm } from '../context/CcrmContext'

// Admission Officer review — the final validation gate before an application
// is pushed to the ERP. Ops verifies documents; the AO looks at the whole file
// and either approves it or sends named documents back to the student.

const DOC_VARIANT = { Verified: 'success', Rejected: 'danger', Pending: 'warning' }
const GATE = {
  auto: 'Auto — ERP push waits for AO only while an Admission Officer user exists',
  on:   'On — ERP push always waits for AO approval',
  off:  'Off — ERP push never waits (AO decision is advisory)',
}

function Flash({ msg }) {
  if (!msg) return null
  const cls = msg.tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
  return <div className={`mb-4 text-xs rounded-lg px-3 py-2.5 ${cls}`}>{msg.text}</div>
}

function fileHref(url) {
  if (!url) return null
  return /^https?:\/\//.test(url) ? url : `/${String(url).replace(/^\/+/, '')}`
}

function ReviewPanel({ appId, onDone, flash }) {
  const { data, loading, error, reload } = useAsync(() => apiGet(`/api/ao/applications/${appId}`), [appId])
  const [rejected, setRejected] = useState({})   // docId → reason
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState('')

  if (loading) return <Loading label="Loading application…" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const app = data
  const toggle = (d) => setRejected((r) => { const n = { ...r }; if (n[d.id] !== undefined) delete n[d.id]; else n[d.id] = ''; return n })
  const rejectedList = Object.entries(rejected).map(([id, reason]) => ({ id: Number(id), reason }))
  const allVerified = app.documents.filter(d => d.is_mandatory).every(d => d.status === 'Verified')

  const decide = async (decision) => {
    if (decision === 'changes' && !rejectedList.length && !remarks.trim()) return flash('danger', 'Tick at least one document to send back, or write remarks.')
    if (decision === 'approve' && !confirm(`Approve ${app.app_no} — ${app.name}? This releases the ERP push and the provisional letter.`)) return
    setBusy(decision)
    try {
      const r = await apiPost(`/api/ao/applications/${appId}/decision`, { decision, remarks, rejectedDocs: rejectedList })
      flash('success', decision === 'approve' ? `${app.app_no} approved.` : `Changes requested on ${app.app_no} — ${r.rejected.length} document(s) sent back.`)
      onDone()
    } catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }
  const resendLetter = async () => {
    setBusy('letter')
    try { await apiPost(`/api/ao/applications/${appId}/send-letter`); flash('success', 'Provisional letter sent.'); reload() }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  const det = app.admission_full_details && Object.keys(app.admission_full_details).length ? app.admission_full_details : (app.admission_details || {})
  const detailRows = Object.entries(det).filter(([, v]) => v && typeof v !== 'object').slice(0, 18)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{app.name} <span className="font-mono text-sm text-gray-500">{app.app_no}</span></h3>
          <p className="text-xs text-gray-500">{app.course} · {app.campus} · Counsellor: {app.owner || '—'} · {app.email} · {app.mobile}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Badge variant={app.ao_status === 'Approved' ? 'success' : app.ao_status === 'Changes Requested' ? 'danger' : 'warning'}>{app.ao_status}</Badge>
            <Badge variant={app.booking_fee_status === 'Paid' || app.application_fee_paid || app.pay_status === 'Approved' ? 'success' : 'neutral'}>Application fee {app.booking_fee_status === 'Paid' || app.application_fee_paid || app.pay_status === 'Approved' ? 'paid' : 'pending'}</Badge>
            <Badge variant={app.tuition_fee_paid ? 'success' : 'neutral'}>Tuition {app.tuition_fee_paid ? 'paid' : 'pending'}</Badge>
            <Badge variant={app.admission_letter_sent_at ? 'success' : 'neutral'}>Letter {app.admission_letter_sent_at ? 'sent' : 'not sent'}</Badge>
            <Badge variant={app.campusone_sync_status === 'Success' ? 'success' : 'neutral'}>ERP {app.campusone_sync_status || 'Pending'}</Badge>
          </div>
        </div>
        <Button size="sm" variant="secondary" icon={Send} loading={busy === 'letter'} onClick={resendLetter}>{app.admission_letter_sent_at ? 'Re-send letter' : 'Send letter now'}</Button>
      </div>

      {app.ao_remarks && <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"><strong>Last AO remarks</strong> ({app.ao_reviewed_by}, {fmtDateTime(app.ao_reviewed_at)}): {app.ao_remarks}</div>}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Documents ({app.docs_verified}/{app.docs_total} mandatory verified)</h4>
          <div className="space-y-2">
            {app.documents.length === 0 && <p className="text-sm text-gray-400">No documents uploaded.</p>}
            {app.documents.map(d => {
              const href = fileHref(d.file_url)
              const picked = rejected[d.id] !== undefined
              return (
                <div key={d.id} className={`border rounded-xl p-3 ${picked ? 'border-danger-300 bg-danger-50' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText size={15} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{d.type}</span>
                    {d.is_mandatory && <Badge variant="neutral">Mandatory</Badge>}
                    <Badge variant={DOC_VARIANT[d.status] || 'neutral'}>{d.status}</Badge>
                    {d.file_size > 0 && <span className="text-[11px] text-gray-400">{fmtBytes(d.file_size)}</span>}
                    <span className="flex-1" />
                    {href ? <a href={href} target="_blank" rel="noreferrer" className="text-xs text-primary-600 inline-flex items-center gap-1 hover:underline"><ExternalLink size={12} />Open</a> : <span className="text-[11px] text-gray-400">No file</span>}
                    {app.ao_status !== 'Approved' && (
                      <label className="text-xs text-danger-700 inline-flex items-center gap-1.5 ml-2">
                        <input type="checkbox" className="accent-danger-600" checked={picked} onChange={() => toggle(d)} /> Send back
                      </label>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    Uploaded {d.upload_date || '—'}{d.verified_by ? ` · ${d.status.toLowerCase()} by ${d.verified_by} ${fmtDateTime(d.verified_at)}` : ''}
                    {d.rejection_reason && <span className="text-danger-600"> · reason: {d.rejection_reason}</span>}
                  </div>
                  {picked && (
                    <input className="input-field mt-2 text-xs" placeholder={`Why must ${d.type} be re-submitted? (optional — remarks below are used if blank)`}
                      value={rejected[d.id]} onChange={(e) => setRejected((r) => ({ ...r, [d.id]: e.target.value }))} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="lg:col-span-2">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Admission details</h4>
          {detailRows.length === 0 ? <p className="text-xs text-gray-400">No details captured yet.</p> : (
            <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {detailRows.map(([k, v]) => <React.Fragment key={k}><dt className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</dt><dd className="text-gray-900 break-words">{String(v)}</dd></React.Fragment>)}
            </dl>
          )}
          <p className="text-[11px] text-gray-400 mt-2">Details status: {app.admission_details_status || 'Pending'}</p>
        </div>
      </div>

      {app.ao_status !== 'Approved' && (
        <div className="border-t pt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Remarks to the student / file</label>
          <textarea className="input-field text-sm" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional for approval; required if no document is ticked when requesting changes." />
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button icon={CheckCircle2} loading={busy === 'approve'} disabled={!allVerified || rejectedList.length > 0} onClick={() => decide('approve')}>Approve admission</Button>
            <Button variant="secondary" icon={XCircle} loading={busy === 'changes'} onClick={() => decide('changes')}>Request changes{rejectedList.length ? ` (${rejectedList.length})` : ''}</Button>
            {!allVerified && <span className="text-xs text-warning-700 self-center inline-flex items-center gap-1"><AlertTriangle size={12} /> Approval needs every mandatory document verified.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AoReview() {
  const { can } = usePermissions()
  const { currentUser } = useCcrm()
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [msg, setMsg] = useState(null)
  const flash = (tone, text) => setMsg({ tone, text })
  const overview = useAsync(() => apiGet('/api/ao/overview'), [])
  const queue = useAsync(() => apiGet('/api/ao/queue', { status: tab }), [tab])
  const [gateBusy, setGateBusy] = useState(false)

  if (overview.loading) return <PageContainer title="Admission Officer Review"><Loading /></PageContainer>
  if (overview.error) return <PageContainer title="Admission Officer Review"><ErrorState error={overview.error} onRetry={overview.reload} /></PageContainer>
  const ov = overview.data
  const canGate = can('settings.manage') || currentUser?.role === 'Admin'
  const reloadAll = () => { overview.reload(); queue.reload(); setSelected(null) }

  const setGate = async (gate) => {
    setGateBusy(true)
    try { await apiPut('/api/ao/gate', { gate }); overview.reload(); flash('success', `ERP gate set to ${gate}.`) }
    catch (e) { flash('danger', e.message) } finally { setGateBusy(false) }
  }

  return (
    <PageContainer
      title="Admission Officer Review"
      description="Final document validation and admission decision before the ERP push"
      action={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={reloadAll}>Refresh</Button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Clock} label="Awaiting review" value={fmtInt(ov.counts.pending)} tone={ov.counts.pending ? 'warning' : 'success'} />
        <StatCard icon={XCircle} label="Changes requested" value={fmtInt(ov.counts.changes)} tone="danger" />
        <StatCard icon={CheckCircle2} label="Approved" value={fmtInt(ov.counts.approved)} tone="success" />
        <StatCard icon={Users} label="Admission Officers" value={fmtInt(ov.aoUsers.length)} tone="info" />
      </div>

      <div className={`mb-4 flex items-center gap-2 text-xs rounded-xl px-3.5 py-2.5 flex-wrap ${ov.gateActive ? 'bg-info-50 text-info-700' : 'bg-gray-50 text-gray-600'}`}>
        <ShieldCheck size={14} /><strong>ERP gate {ov.gateActive ? 'active' : 'inactive'}.</strong> {GATE[ov.gate]}
        {ov.aoUsers.length === 0 && <span>· No Admission Officer user yet — create one under Users with role "Admission Officer"; Admins receive AO notifications meanwhile.</span>}
        {canGate && (
          <span className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden bg-white">
            {['auto', 'on', 'off'].map(g => <button key={g} disabled={gateBusy} onClick={() => setGate(g)} className={`px-2.5 py-1 capitalize ${ov.gate === g ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{g}</button>)}
          </span>
        )}
      </div>

      <Flash msg={msg} />

      <div className="grid lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-2" title="Queue"
          action={<div className="flex gap-1">{[['pending', 'Pending'], ['changes', 'Changes'], ['approved', 'Approved']].map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setSelected(null) }} className={`px-2.5 py-1 text-xs rounded-lg ${tab === k ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
          ))}</div>}>
          {queue.loading ? <Loading /> : queue.error ? <ErrorState error={queue.error} onRetry={queue.reload} /> : queue.data.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">{tab === 'pending' ? 'Nothing waiting — every complete file has been reviewed.' : 'Empty.'}</p>
          ) : (
            <div className="divide-y divide-gray-100 -mx-2">
              {queue.data.map(a => (
                <button key={a.id} onClick={() => setSelected(a.id)} className={`w-full text-left px-2 py-2.5 hover:bg-gray-50 rounded-lg ${selected === a.id ? 'bg-primary-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{a.name}</span>
                    <span className="font-mono text-[11px] text-gray-500">{a.app_no}</span>
                    <span className="flex-1" />
                    <Badge variant={a.docs_rejected ? 'danger' : a.docs_verified === a.docs_total ? 'success' : 'warning'}>{a.docs_verified}/{a.docs_total} docs</Badge>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{a.course} · {a.owner || 'Unassigned'} · {tab === 'approved' ? `approved ${fmtDateTime(a.ao_reviewed_at)}` : `queued ${fmtDateTime(a.ao_queued_at)}`}</div>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel className="lg:col-span-3" title={selected ? 'Review' : 'Select an application'}>
          {selected ? <ReviewPanel appId={selected} onDone={reloadAll} flash={flash} /> : (
            <div className="text-sm text-gray-400 py-12 text-center"><ClipboardCheck size={28} className="mx-auto mb-2 text-gray-300" />Pick an application from the queue to review its documents and decide.</div>
          )}
        </Panel>
      </div>
    </PageContainer>
  )
}
