import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCcrm } from '../context/CcrmContext'
import { PhoneCall, UserPlus, CalendarClock, AlertTriangle, TrendingUp, Users, FileText, CheckCircle, RefreshCw, Filter, Trash2, Download, CreditCard, Trophy } from 'lucide-react'
import { stageLabel } from '../stageLabel'
import PageContainer from '../components/PageContainer'
import { Card, Table, Modal, Button, Select } from '../components/ui'
import CounsellorPerformanceCards from '../components/dashboard/CounsellorPerformanceCards'

// Default lead stages shown in the summary table (funnel order) — used as a
// fallback until the tenant's own stage config loads, or for tenants that
// haven't customized their stage pipeline.
const DEFAULT_STAGES = ['Untouched', 'Contacted', 'Invalid Number', 'No Response', 'Follow Up', 'Interested', 'Campus Visit Scheduled', 'Campus Visit Completed', 'Process for Payment', 'Payment Success', 'Not Interested']

export default function Dashboard() {
  const { currentUser, tenantConfig } = useCcrm()
  const ALL_STAGES = (Array.isArray(tenantConfig?.stages) && tenantConfig.stages.length) ? tenantConfig.stages : DEFAULT_STAGES
  // CUTM/CUTMAP domain split is Centurion-specific (email-domain based); only
  // show it for tenants whose entity config actually defines those brands.
  const hasCutmCutmap = (tenantConfig?.entities || []).some(e => e.kind === 'main' && ['CUTM', 'CUTMAP'].includes(e.code))
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [summaryStage, setSummaryStage] = useState('All')
  const [summaryDomain, setSummaryDomain] = useState('All')   // All | cutm | cutmap
  const [deleteTarget, setDeleteTarget] = useState(null)      // counsellor row pending lead deletion
  const [deleting, setDeleting] = useState(false)

  const loadStats = () => {
    // Server-side aggregated dashboard stats — scales to millions of rows.
    // Role-scoped: counsellor sees own, manager sees their team, admin sees all.
    setStatsLoading(true)
    let q = ''
    if (currentUser?.role === 'Counselor') q = `?owner=${encodeURIComponent(currentUser.name)}`
    else if (currentUser?.role === 'Manager') q = `?manager=${encodeURIComponent(currentUser.name)}`
    const token = localStorage.getItem('ccrm_token')
    fetch(`/api/dashboard/stats${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStats(data); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
  }
  useEffect(() => { loadStats() }, [currentUser])

  const handleDeleteCounsellorLeads = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/leads/delete-by-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ owner: deleteTarget.counsellor })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDeleteTarget(null)
        loadStats()
      }
    } catch { /* ignore */ }
    finally { setDeleting(false) }
  }

  const kpi = stats?.kpi || {}
  const byCounsellor = stats?.byCounsellor?.[0] || {}
  const isAdmin = currentUser?.role === 'Admin'
  const isCounselor = currentUser?.role === 'Counselor'

  const SUMMARY_CARDS = isCounselor ? [
    { label: 'Total Leads',     value: ((byCounsellor?.leads ?? 0)).toLocaleString(),        icon: Users,       tone: 'info' },
    { label: 'Untouched',       value: ((byCounsellor?.untouched ?? 0)).toLocaleString(),    icon: Users,       tone: 'warning' },
    { label: 'Interested',      value: ((byCounsellor?.interested ?? 0)).toLocaleString(),   icon: FileText,    tone: 'success' },
    { label: 'Further Talk/Follow Up',       value: ((byCounsellor?.followUp ?? 0)).toLocaleString(),     icon: TrendingUp,  tone: 'warning' },
    { label: 'Not Interested',  value: ((byCounsellor?.notInterested ?? 0)).toLocaleString(), icon: CheckCircle, tone: 'danger' },
  ] : [
    { label: 'Total Leads',     value: ((kpi?.totalLeads || 0)).toLocaleString(),           icon: Users,       tone: 'info' },
    { label: 'Unassigned',      value: ((kpi?.unassigned ?? 0)).toLocaleString(),           icon: Users,       tone: 'neutral' },
    { label: 'Untouched',       value: ((kpi?.untouched ?? 0)).toLocaleString(),            icon: Users,       tone: 'warning' },
    { label: 'Contacted',       value: ((kpi?.contacted ?? 0)).toLocaleString(),            icon: Users,       tone: 'info' },
    { label: 'Interested',      value: ((kpi?.interested ?? 0)).toLocaleString(),           icon: FileText,    tone: 'success' },
    { label: 'Further Talk/Follow Up',       value: ((kpi?.followUp ?? 0)).toLocaleString(),             icon: TrendingUp,  tone: 'warning' },
    { label: 'Qualified Leads', value: ((kpi?.qualified ?? 0)).toLocaleString(),            icon: CheckCircle, tone: 'primary' },
    { label: 'Process for Payment', value: ((kpi?.processForPayment ?? 0)).toLocaleString(), icon: CreditCard, tone: 'warning' },
    { label: 'Payment Success', value: ((kpi?.paymentSuccess ?? 0)).toLocaleString(),       icon: CheckCircle, tone: 'success' },
    { label: 'Not Interested',  value: ((kpi?.notInterested ?? 0)).toLocaleString(),        icon: CheckCircle, tone: 'danger' },
    { label: 'Converted',       value: ((kpi?.converted ?? 0)).toLocaleString(),            icon: Trophy,      tone: 'warning' },
    ...(isAdmin ? [{ label: 'Revenue Collected', value: `₹${(((stats?.revenue ?? 0))/100000).toFixed(1)}L`, icon: CheckCircle, tone: 'success' }] : []),
  ]

  // One finding, stated under the title: what most needs attention today.
  const _n = (v) => Number(v || 0)
  const _src = isCounselor ? byCounsellor : kpi
  const loadFailed = !statsLoading && !stats
  const dashboardFinding = statsLoading ? 'Loading the latest numbers…' : loadFailed ? 'Could not load the latest numbers' : (
    _n(_src.untouched) > 0
      ? `${_n(_src.untouched).toLocaleString()} lead${_n(_src.untouched) === 1 ? '' : 's'} not yet contacted${_n(_src.followUp) ? ` · ${_n(_src.followUp).toLocaleString()} waiting on a follow-up` : ''}`
      : _n(_src.followUp) ? `${_n(_src.followUp).toLocaleString()} waiting on a follow-up` : _n(kpi.totalLeads || byCounsellor.leads) > 0 ? 'Every lead has been contacted' : 'No leads yet'
  )

  // Pipeline stages shown in the stacked bar, and the "needs attention" list. All from the same kpi payload.
  const pipeline = (isCounselor
    ? [['Untouched', _src.untouched], ['Follow up', _src.followUp], ['Interested', _src.interested], ['Not interested', _src.notInterested]]
    : [['Untouched', _src.untouched], ['Contacted', _src.contacted], ['Interested', _src.interested], ['Process for payment', _src.processForPayment], ['Payment success', _src.paymentSuccess]]
  ).map(([label, v]) => ({ label, value: _n(v) }))
  const pipelineTotal = pipeline.reduce((n, x) => n + x.value, 0)
  const attention = [
    { label: 'Not yet contacted', value: _n(_src.untouched), to: '/leads' },
    { label: 'Waiting on a follow-up', value: _n(_src.followUp), to: '/leads' },
    ...(isCounselor ? [] : [{ label: 'Unassigned to a counsellor', value: _n(kpi?.unassigned), to: '/leads' }]),
  ].filter(a => a.value > 0)

  const cutm   = stats?.byDomain?.cutm   || { total: 0, stages: {} }
  const cutmap = stats?.byDomain?.cutmap || { total: 0, stages: {} }
  const st = (data, stage) => data?.stages?.[stage] || 0
  const visibleStages = summaryStage === 'All' ? ALL_STAGES : ALL_STAGES.filter(s => s === summaryStage)
  const matrixRows = (stats?.byCounsellorStages || []).filter(r => summaryDomain === 'All' || r.domain === summaryDomain)

  // Export the Stage Summary matrix (respecting the active Domain + Stage filters) to CSV.
  const exportStageSummary = () => {
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Counsellor', 'Domain', 'Assigned', ...visibleStages.map(stageLabel), 'Total']
    const lines = [header.map(esc).join(',')]
    matrixRows.forEach(r => {
      const rowTotal = summaryStage === 'All' ? (r.total || 0) : visibleStages.reduce((n, s) => n + st(r, s), 0)
      lines.push([
        r.counsellor,
        (r.domain || '').toUpperCase(),
        r.total || 0,
        ...visibleStages.map(s => st(r, s)),
        rowTotal,
      ].map(esc).join(','))
    })
    // Totals row
    const grandTotal = summaryStage === 'All'
      ? matrixRows.reduce((n, r) => n + (r.total || 0), 0)
      : matrixRows.reduce((n, r) => n + visibleStages.reduce((m, s) => m + st(r, s), 0), 0)
    lines.push([
      'All counsellors',
      summaryDomain === 'All' ? 'ALL' : summaryDomain.toUpperCase(),
      matrixRows.reduce((n, r) => n + (r.total || 0), 0),
      ...visibleStages.map(s => matrixRows.reduce((n, r) => n + st(r, s), 0)),
      grandTotal,
    ].map(esc).join(','))

    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `stage-summary-${summaryDomain}-${summaryStage === 'All' ? 'all-stages' : summaryStage}-${stamp}.csv`.replace(/\s+/g, '-')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <PageContainer title="Dashboard" description={dashboardFinding}>
      {statsLoading && (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2 mb-6">
          <RefreshCw size={16} className="animate-spin text-primary-500" /> Please wait, loading dashboard…
        </div>
      )}

      {loadFailed && (
        <div className="mb-5 flex items-center justify-between gap-4 border border-danger-200 bg-danger-50 px-5 py-4">
          <div className="flex items-center gap-3 text-danger-700 text-[15px]"><AlertTriangle size={20} /> The dashboard numbers could not be loaded. Nothing below should be read as an all-clear.</div>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadStats}>Retry</Button>
        </div>
      )}

      {/* Quick actions: the routine tasks, one click away */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {[
          { to: '/leads', icon: PhoneCall, title: 'Call next lead', sub: 'Open the lead board', tone: 'bg-primary-500 text-white hover:bg-primary-600' },
          { to: '/leads', icon: UserPlus, title: 'Add a lead', sub: 'Capture a new enquiry', tone: 'bg-accent-500 text-primary-900 hover:bg-accent-400' },
          { to: '/tasks', icon: CalendarClock, title: "Today's follow-ups", sub: 'Reminders and scheduled calls', tone: 'bg-primary-900 text-white hover:bg-primary-800' },
        ].map(a => (
          <Link key={a.title} to={a.to} className={`flex items-center gap-4 px-5 py-4 transition-colors ${a.tone}`}>
            <a.icon size={28} strokeWidth={1.7} className="flex-shrink-0" />
            <span><span className="block text-lg font-semibold leading-tight">{a.title}</span><span className="block text-sm opacity-80 mt-0.5">{a.sub}</span></span>
          </Link>
        ))}
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {(isCounselor
          ? [['Untouched', _src.untouched, 'bg-accent-50 text-accent-800'], ['Follow up', _src.followUp, 'bg-primary-50 text-primary-800'], ['Interested', _src.interested, 'bg-green-50 text-green-800'], ['Not interested', _src.notInterested, 'bg-gray-100 text-gray-800']]
          : [['Untouched', _src.untouched, 'bg-accent-50 text-accent-800'], ['Follow up', _src.followUp, 'bg-primary-50 text-primary-800'], ['Process for payment', _src.processForPayment, 'bg-blue-50 text-blue-800'], ['Payment success', _src.paymentSuccess, 'bg-green-50 text-green-800']]
        ).map(([label, v, tone]) => (
          <div key={label} className={`px-5 py-5 ${tone}`}>
            <div className="text-[34px] leading-none font-semibold tabular-nums">{_n(v).toLocaleString()}</div>
            <div className="text-[15px] mt-2 opacity-90">{label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline — one block answers "where are the leads?"; the attention list answers "what do I do next?" */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-3 mb-6">
        <Card className="p-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[14px] text-gray-500">{isCounselor ? 'Your leads' : 'Total leads'}</div>
              <div className="text-[44px] leading-none font-medium text-gray-900 mt-2 tabular-nums tracking-tight">{SUMMARY_CARDS[0]?.value ?? '0'}</div>
            </div>
            {!isCounselor && hasCutmCutmap && stats?.byDomain && (
              <div className="text-[14px] text-gray-500 tabular-nums">
                {(cutm.total || 0).toLocaleString()} CUTM · {(cutmap.total || 0).toLocaleString()} CUTMAP · {((stats?.byDomain?.other?.total) || 0).toLocaleString()} unassigned or other
              </div>
            )}
          </div>

          {pipelineTotal > 0 && (
            <div className="mt-6">
              <div className="flex h-3 rounded-sm overflow-hidden bg-gray-100">
                {pipeline.filter(x => x.value > 0).map((x, i) => (
                  <div key={x.label} title={`${x.label}: ${x.value}`} className="h-full bg-data-500"
                    style={{ width: `${(x.value / pipelineTotal) * 100}%`, opacity: Math.max(0.25, 1 - i * 0.2), marginRight: 2 }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[14px] text-gray-600">
                {pipeline.map((x, i) => (
                  <span key={x.label} className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2 h-2 rounded-sm bg-data-500 inline-block" style={{ opacity: Math.max(0.25, 1 - i * 0.2) }} />
                    {x.label} <span className="text-gray-900 font-medium">{x.value.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 mt-6">
            {SUMMARY_CARDS.slice(1).map(c => (
              <div key={c.label} className="flex items-baseline justify-between py-2">
                <dt className="text-[15px] text-gray-600">{c.label}</dt>
                <dd className="text-[15px] font-medium text-gray-900 tabular-nums">{c.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-6 self-start">
          <div className="text-base font-medium text-gray-900">Needs attention</div>
          <div className="mt-4 space-y-1">
            {attention.length === 0 && <p className="text-[15px] text-gray-500 py-2">{loadFailed ? 'Numbers are not available right now.' : 'Nothing is waiting.'}</p>}
            {attention.map(a => (
              <Link key={a.label} to={a.to} className="flex items-center justify-between py-3 px-3 -mx-3 rounded-md hover:bg-gray-100 transition-colors">
                <span className="text-[15px] text-gray-700">{a.label}</span>
                <span className="text-[22px] font-medium text-gray-900 tabular-nums">{a.value.toLocaleString()}</span>
              </Link>
            ))}
          </div>
          <Link to="/leads" className="mt-5 inline-flex items-center justify-center w-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold py-2.5 rounded-md transition-colors">Open lead manager</Link>
        </Card>
      </div>

      {/* Counsellor performance — joins byCounsellor with the Stage Summary matrix */}
      {!isCounselor && (
        <CounsellorPerformanceCards byCounsellor={stats?.byCounsellor} byCounsellorStages={stats?.byCounsellorStages} />
      )}

      {/* Your GT entities (counsellor's own leads per granted GT entity) */}
      {stats?.gtEntities?.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Your GT Entities</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.gtEntities.map(e => (
              <Card key={e.entity} className="p-3">
                <div className="text-[12px] font-bold text-primary-600">{e.entity}</div>
                <div className="text-xl font-semibold text-gray-900 leading-tight">{(e.total || 0).toLocaleString()}</div>
                <div className="text-[12px] text-gray-500">leads · {(e.untouched || 0).toLocaleString()} not contacted</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* By domain (admin/manager) — Centurion-specific, hidden for other tenants */}
      {!isCounselor && hasCutmCutmap && stats?.byDomain && (
        <Card padding={false} className="overflow-hidden mb-6">
          <div className="px-5 py-4 text-base font-medium text-gray-900">Leads by domain</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">Domain</th>
                  {['Total', 'Untouched', 'Follow Up', 'Interested', 'Not Interested', 'Invalid Number'].map(h => <th key={h} className="table-th text-right">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[{ label: 'CUTM', data: cutm }, { label: 'CUTMAP', data: cutmap }].map(d => (
                  <tr key={d.label}>
                    <td className="table-td font-medium text-gray-900">{d.label}</td>
                    <td className="table-td text-right">{(d.data.total || 0).toLocaleString()}</td>
                    {['Untouched', 'Follow Up', 'Interested', 'Not Interested', 'Invalid Number'].map(st_ => (
                      <td key={st_} className="table-td text-right">{st(d.data, st_).toLocaleString()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Leads by Source (admin/manager) */}
      {!isCounselor && Array.isArray(stats?.bySource) && stats.bySource.length > 0 && (
        <Card padding={false} className="overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100">
            <Card.Title>Leads by Source</Card.Title>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.bySource.map(src => (
              <div key={src.source} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <span className="text-gray-700 text-sm font-medium">{src.source}</span>
                <span className="text-gray-900 font-semibold text-sm">{(src.leads || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stage Summary — counsellor (rows) × stage (columns) matrix (admin/manager) */}
      {!isCounselor && Array.isArray(stats?.byCounsellorStages) && (
        <Card padding={false} className="overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <Card.Title>Stage Summary — by Counsellor</Card.Title>
            <div className="flex items-center gap-2">
              {/* Domain filter: All / CUTM / CUTMAP */}
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {[{ v: 'All', l: 'All' }, { v: 'cutm', l: 'CUTM' }, { v: 'cutmap', l: 'CUTMAP' }].map(d => (
                  <button key={d.v} onClick={() => setSummaryDomain(d.v)}
                    className={`px-3 py-1.5 ${summaryDomain === d.v ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
              <Filter size={14} className="text-gray-400" />
              <Select
                value={summaryStage}
                onChange={e => setSummaryStage(e.target.value)}
                containerClassName="w-40"
                className="!py-1.5 text-sm"
              >
                <option value="All">All stages</option>
                {ALL_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </Select>
              <Button variant="secondary" size="sm" icon={Download} onClick={exportStageSummary} disabled={matrixRows.length === 0}>
                Export
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
          <Table.Head>
            <tr>
              <Table.HCell className="sticky left-0 bg-gray-50">Counsellor</Table.HCell>
              <Table.HCell className="text-center !text-primary-600">Assigned</Table.HCell>
              {visibleStages.map(s => <Table.HCell key={s} className="text-center whitespace-nowrap">{stageLabel(s)}</Table.HCell>)}
              <Table.HCell className="text-center">Total</Table.HCell>
            </tr>
          </Table.Head>
          <Table.Body>
            {matrixRows.length === 0 ? (
              <tr><td colSpan={visibleStages.length + 3} className="text-center py-8 text-gray-400">No leads for this filter.</td></tr>
            ) : matrixRows.map(r => {
              // In 'All' view, Total = the counsellor's true assigned count (matches Assigned).
              // When filtered to one stage, Total = that stage's count.
              const rowTotal = summaryStage === 'All' ? (r.total || 0) : visibleStages.reduce((n, s) => n + st(r, s), 0)
              return (
                <Table.Row key={r.counsellor} className="group">
                  <Table.Cell className="font-medium text-gray-800 sticky left-0 bg-white">
                    <span className="inline-flex items-center gap-2">
                      {r.counsellor}
                      {isAdmin && (
                        <button onClick={() => setDeleteTarget(r)} title={`Delete all ${r.counsellor}'s leads`}
                          className="opacity-0 group-hover:opacity-100 text-danger-400 hover:text-danger-600 transition">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-center font-bold text-primary-600">{(r.total || 0).toLocaleString()}</Table.Cell>
                  {visibleStages.map(s => {
                    const v = st(r, s)
                    return <Table.Cell key={s} className="text-center">{v ? v.toLocaleString() : <span className="text-gray-300">0</span>}</Table.Cell>
                  })}
                  <Table.Cell className="text-center font-bold text-gray-900">{rowTotal.toLocaleString()}</Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
          <tfoot className="bg-gray-50 border-t font-semibold">
            <tr>
              <td className="table-td sticky left-0 bg-gray-50">All counsellors</td>
              <td className="table-td text-center text-primary-600">
                {matrixRows.reduce((n, r) => n + (r.total || 0), 0).toLocaleString()}
              </td>
              {visibleStages.map(s => (
                <td key={s} className="table-td text-center text-gray-700">
                  {matrixRows.reduce((n, r) => n + st(r, s), 0).toLocaleString()}
                </td>
              ))}
              <td className="table-td text-center text-gray-900">
                {(summaryStage === 'All'
                  ? matrixRows.reduce((n, r) => n + (r.total || 0), 0)
                  : matrixRows.reduce((n, r) => n + visibleStages.reduce((m, s) => m + st(r, s), 0), 0)
                ).toLocaleString()}
              </td>
            </tr>
          </tfoot>
          </table>
          </div>
        </Card>
      )}

      {/* Delete all leads of a counsellor — confirm (Admin) */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete counsellor's leads"
        footer={(
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" icon={Trash2} loading={deleting} onClick={handleDeleteCounsellorLeads}>
              {deleting ? 'Deleting...' : `Delete ${(deleteTarget?.total || 0).toLocaleString()} leads`}
            </Button>
          </>
        )}
      >
        <p className="text-sm text-gray-600">
          This will permanently delete <strong className="text-danger-600">{(deleteTarget?.total || 0).toLocaleString()} lead(s)</strong> owned by
          <strong className="text-gray-900"> {deleteTarget?.counsellor}</strong>. This cannot be undone.
        </p>
      </Modal>
    </PageContainer>
  )
}
