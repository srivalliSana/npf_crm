import React from 'react'
import { Link } from 'react-router-dom'
import {
  Gauge, Users, FileText, Award, Wallet, RefreshCw, ChevronRight,
  AlertOctagon, AlertTriangle, Info, Activity, ShieldCheck, Clock,
} from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { StatCard, Button, Badge } from '../components/ui'
import { Panel, Loading, ErrorState, useAsync, ScrollX } from '../components/ModuleKit'
import { apiGet, fmtInt, fmtMoney, fmtDateTime } from '../lib/api'

// Item 30 — Management Command Centre.
//
// One screen for whoever runs the operation: where the pipeline stands, what
// moved today, and what is stuck. Every exception tile links straight to the
// queue that clears it — a number nobody can act on doesn't belong here.

const SEVERITY = {
  critical: { icon: AlertOctagon,  ring: 'border-danger-500/40 bg-danger-50',   text: 'text-danger-700',  badge: 'danger'  },
  warning:  { icon: AlertTriangle, ring: 'border-warning-500/40 bg-warning-50', text: 'text-warning-700', badge: 'warning' },
  info:     { icon: Info,          ring: 'border-info-500/40 bg-info-50',       text: 'text-info-700',    badge: 'info'    },
}

function AlertTile({ alert }) {
  const s = SEVERITY[alert.severity] || SEVERITY.info
  const Icon = s.icon
  return (
    <Link
      to={alert.to}
      className={`flex items-center gap-3 p-3.5 rounded-xl border ${s.ring} hover:shadow-card transition-shadow group`}
    >
      <Icon size={18} className={`${s.text} flex-shrink-0`} />
      <div className="min-w-0 flex-1">
        <div className={`text-lg font-extrabold leading-none ${s.text}`}>{fmtInt(alert.count)}</div>
        <div className="text-[11px] text-gray-600 mt-1 leading-tight">{alert.label}</div>
      </div>
      <ChevronRight size={15} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
    </Link>
  )
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-xl font-extrabold text-gray-900 leading-none tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{label}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}

export default function CommandCentre() {
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/analytics/command-centre'), [])

  if (loading) return <PageContainer title="Command Centre"><Loading label="Gathering operational KPIs…" /></PageContainer>
  if (error) return <PageContainer title="Command Centre"><ErrorState error={error} onRetry={reload} /></PageContainer>

  const { pipeline: p, today, finance, operations, health, alerts, topPerformers } = data
  const conversion = p.totalLeads > 0 ? Math.round((p.enrolled / p.totalLeads) * 1000) / 10 : 0

  return (
    <PageContainer
      title="Management Command Centre"
      description="Core operational KPIs across admissions, finance and platform health"
      action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:inline">As of {fmtDateTime(data.generatedAt)}</span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
        </div>
      }
    >
      {/* Headline pipeline */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard icon={Users}    label="Total leads"  value={fmtInt(p.totalLeads)}   tone="info" />
        <StatCard icon={FileText} label="Applications" value={fmtInt(p.applications)} tone="primary" />
        <StatCard icon={Award}    label="Admitted"     value={fmtInt(p.admitted)}     tone="success" />
        <StatCard icon={Wallet}   label="Collected"    value={fmtMoney(finance.collectedAllTime)} tone="success" />
        <StatCard icon={Gauge}    label="Lead → enrolment" value={`${conversion}%`}   tone="warning" />
      </div>

      {/* Exceptions first — this is the part that changes what someone does next. */}
      <Panel
        title="Needs attention"
        subtitle="Open exceptions across the platform, most severe first"
        className="mb-4"
      >
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-success-700 bg-success-50 rounded-xl px-4 py-3">
            <ShieldCheck size={16} /> Nothing is queued or failing right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {alerts.map(a => <AlertTile key={a.label} alert={a} />)}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today */}
        <Panel title="Today" subtitle="Movement since midnight" bodyClass="divide-y divide-gray-100">
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <MiniStat label="New leads"        value={fmtInt(today.newLeads)} />
            <MiniStat label="New applications" value={fmtInt(today.newApplications)} />
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <MiniStat label="New admissions"   value={fmtInt(today.newAdmissions)} />
            <MiniStat label="Payments logged"  value={fmtInt(today.paymentsLogged)} />
          </div>
          <div className="pt-3 mt-1">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Activity size={13} className="text-gray-400" />
              {fmtInt(today.auditEvents)} audited actions today
            </div>
          </div>
        </Panel>

        {/* Finance */}
        <Panel title="Finance" subtitle="Collection and the approval queue">
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">This month</span>
              <span className="text-xl font-extrabold text-gray-900">{fmtMoney(finance.collectedThisMonth)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">All time</span>
              <span className="text-sm font-bold text-gray-700">{fmtMoney(finance.collectedAllTime)}</span>
            </div>
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Awaiting approval</span>
              {finance.awaitingApproval > 0
                ? <Link to="/payments"><Badge variant="warning">{fmtInt(finance.awaitingApproval)} pending</Badge></Link>
                : <Badge variant="success">Clear</Badge>}
            </div>
          </div>
        </Panel>

        {/* Platform health */}
        <Panel title="Platform health" subtitle="Integrations, sessions and sign-in activity">
          <div className="space-y-2.5 text-sm">
            {[
              ['ERP syncs failed',        health.erpSyncFailures,  '/integration-hub', true],
              ['Sync runs failed (24h)',  health.syncFailures24h,  '/integration-hub', true],
              ['Failed sign-ins (24h)',   health.failedLogins24h,  '/security',        true],
              ['Active sessions',         health.activeSessions,   '/security',        false],
            ].map(([label, value, to, isBad]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{label}</span>
                <Link to={to}>
                  <Badge variant={!isBad ? 'neutral' : value > 0 ? 'danger' : 'success'}>{fmtInt(value)}</Badge>
                </Link>
              </div>
            ))}
            <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Open tasks</span>
              <Link to="/tasks"><Badge variant="neutral">{fmtInt(operations.openTasks)}</Badge></Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* Counsellor performance */}
      <Panel
        title="Counsellor performance"
        subtitle="By leads converted to payment"
        className="mt-4"
        action={<Link to="/leaderboard" className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1">Full leaderboard <ChevronRight size={12} /></Link>}
      >
        {topPerformers.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No counsellor has leads assigned yet.</p>
        ) : (
          <ScrollX>
            <table className="w-full text-sm border-collapse min-w-[420px]">
              <thead>
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Counsellor</th>
                  <th className="table-th">Role</th>
                  <th className="table-th text-right">Leads</th>
                  <th className="table-th text-right">Converted</th>
                  <th className="table-th text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {topPerformers.map((c, i) => {
                  const rate = c.leads > 0 ? Math.round((c.converted / c.leads) * 100) : 0
                  return (
                    <tr key={c.name} className="hover:bg-gray-50/80 transition-colors">
                      <td className="table-td text-gray-400 font-semibold">{i + 1}</td>
                      <td className="table-td font-medium text-gray-800">{c.name}</td>
                      <td className="table-td text-gray-500">{c.role}</td>
                      <td className="table-td text-right tabular-nums">{fmtInt(c.leads)}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{fmtInt(c.converted)}</td>
                      <td className="table-td text-right">
                        <Badge variant={rate >= 20 ? 'success' : rate >= 10 ? 'warning' : 'neutral'}>{rate}%</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Panel>

      <p className="text-[11px] text-gray-400 mt-4 flex items-center gap-1.5">
        <Clock size={11} /> Figures are cached for up to a minute; Refresh forces a rebuild.
      </p>
    </PageContainer>
  )
}
