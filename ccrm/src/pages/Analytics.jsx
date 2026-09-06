import React, { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  PieChart as PieIcon, GraduationCap, ClipboardCheck, Wallet,
  RefreshCw, TrendingUp, Users, FileText, Award, AlertTriangle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { Tabs, StatCard, Badge, Button } from '../components/ui'
import { Panel, Loading, ErrorState, NotConfigured, BarList, Funnel, ScrollX, Segmented, useAsync } from '../components/ModuleKit'
import { apiGet, fmtInt, fmtMoney, fmtDateTime } from '../lib/api'

// Item 25 — Analytics / BI.
//
// Four dashboards behind one tab strip. Admission and Finance run on data the
// CRM owns. Academic and Examination run on tables the integration jobs fill,
// and say so plainly while those tables are empty rather than drawing a chart
// of zeroes that reads like a real answer.

// A calm categorical ramp — distinguishable in order, and not the default
// recharts palette that fights the app's blue.
const SERIES = ['#2563eb', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const chartTooltip = {
  contentStyle: {
    borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12,
    boxShadow: '0 8px 24px -6px rgb(15 23 42 / 0.12)',
  },
}

const axis = { tick: { fontSize: 11, fill: '#6b7280' }, axisLine: false, tickLine: false }

function Table({ columns, rows, empty = 'No rows.' }) {
  if (!rows?.length) return <p className="text-sm text-gray-400 py-8 text-center">{empty}</p>
  return (
    <ScrollX>
      <table className="w-full text-sm border-collapse min-w-[520px]">
        <thead>
          <tr>{columns.map(c => <th key={c.key} className={`table-th ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50/80 transition-colors">
              {columns.map(c => (
                <td key={c.key} className={`table-td ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollX>
  )
}

// ── Admission ────────────────────────────────────────────────────────────────
function AdmissionDashboard() {
  const [range, setRange] = useState('90')
  const [campus, setCampus] = useState('')
  const [program, setProgram] = useState('')
  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/analytics/admission', { range, campus, program }), [range, campus, program])

  if (loading) return <Loading label="Building the admission dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const f = data.funnel, c = data.conversion
  const stages = [
    { label: 'Leads',        value: f.leads,        color: 'bg-primary-400' },
    { label: 'Contacted',    value: f.contacted,    color: 'bg-primary-500' },
    { label: 'Qualified',    value: f.qualified,    color: 'bg-info-500' },
    { label: 'Applications', value: f.applications, color: 'bg-accent-500' },
    { label: 'Registered',   value: f.registered,   color: 'bg-success-500' },
    { label: 'Admitted',     value: f.admitted,     color: 'bg-success-700' },
    { label: 'Fee paid',     value: f.enrolled,     color: 'bg-emerald-800' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Segmented
          value={range} onChange={setRange}
          options={[{ value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '365', label: '1y' }, { value: 'all', label: 'All' }]}
        />
        <select value={campus} onChange={e => setCampus(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All campuses</option>
          {data.filters.campuses.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={program} onChange={e => setProgram(e.target.value)} className="input-field !w-auto !py-1.5 text-xs max-w-[200px]">
          <option value="">All programmes</option>
          {data.filters.programs.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users}    label="Leads"        value={fmtInt(f.leads)}        tone="info" />
        <StatCard icon={FileText} label="Applications" value={fmtInt(f.applications)} tone="primary" />
        <StatCard icon={Award}    label="Admitted"     value={fmtInt(f.admitted)}     tone="success" />
        <StatCard icon={TrendingUp} label="Lead → enrolment" value={`${c.overall}%`}  tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Admission funnel" subtitle="Each stage's share of the one before it">
          <Funnel stages={stages} />
          <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-gray-100">
            {[
              ['Lead → application', c.leadToApplication],
              ['Application → admission', c.applicationToAdmission],
              ['Admission → fee paid', c.admissionToEnrolment],
            ].map(([label, v]) => (
              <div key={label} className="text-center">
                <div className="text-lg font-extrabold text-gray-900">{v}%</div>
                <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Twelve-month trend" subtitle="New leads, applications and admissions per month">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.trend} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...chartTooltip} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
              <Line type="monotone" dataKey="leads" name="Leads" stroke={SERIES[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="applications" name="Applications" stroke={SERIES[1]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="admissions" name="Admissions" stroke={SERIES[2]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Lead sources" subtitle="Volume, and how many reached payment">
          <BarList
            items={data.bySource.map(s => ({ label: s.source, value: s.leads, converted: s.converted }))}
            format={fmtInt}
          />
        </Panel>
        <Panel title="Campuses" subtitle="Applications and admissions by campus">
          <BarList
            items={data.byCampus.map(x => ({ label: x.campus, value: x.applications }))}
            format={fmtInt} color="bg-info-500"
          />
        </Panel>
      </div>

      <Panel
        title="Programmes"
        subtitle="Top 12 by application volume"
        action={data.turnaround?.sampleSize > 0 && (
          <span className="text-xs text-gray-500">
            Median application → admission: <strong className="text-gray-800">{data.turnaround.medianDays} days</strong>
            <span className="text-gray-400"> (n={fmtInt(data.turnaround.sampleSize)})</span>
          </span>
        )}
      >
        <Table
          rows={data.byProgram}
          columns={[
            { key: 'program', label: 'Programme' },
            { key: 'applications', label: 'Applications', align: 'right', render: r => fmtInt(r.applications) },
            { key: 'admitted', label: 'Admitted', align: 'right', render: r => fmtInt(r.admitted) },
            { key: 'enrolled', label: 'Fee paid', align: 'right', render: r => fmtInt(r.enrolled) },
            {
              key: 'rate', label: 'Conversion', align: 'right',
              render: r => {
                const pct = r.applications > 0 ? Math.round((r.admitted / r.applications) * 100) : 0
                return <Badge variant={pct >= 50 ? 'success' : pct >= 25 ? 'warning' : 'neutral'}>{pct}%</Badge>
              },
            },
          ]}
        />
      </Panel>
    </div>
  )
}

// ── Academic ─────────────────────────────────────────────────────────────────
function AcademicDashboard() {
  const [year, setYear] = useState('')
  const [term, setTerm] = useState('')
  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/analytics/academic', { academicYear: year, term }), [year, term])

  if (loading) return <Loading label="Building the academic dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  if (!data.configured) {
    return (
      <NotConfigured
        title="No academic records yet"
        description={data.reason}
        action={<Link to="/integration-hub"><Button size="sm">Set up an ERP / LMS sync</Button></Link>}
      />
    )
  }

  const s = data.summary
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={year} onChange={e => setYear(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All years</option>
          {data.filters.years.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={term} onChange={e => setTerm(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All terms</option>
          {data.filters.terms.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">Last synced {fmtDateTime(data.lastSyncedAt)}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Students on record" value={fmtInt(s.students)} tone="primary" />
        <StatCard icon={Award} label="Average GPA" value={s.avgGpa ?? '—'} tone="success" />
        <StatCard icon={ClipboardCheck} label="Average attendance" value={s.avgAttendance != null ? `${s.avgAttendance}%` : '—'} tone="info" />
        <StatCard icon={AlertTriangle} label="At risk" value={fmtInt(data.atRisk.length)} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="GPA distribution" subtitle="Students per grade band">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.gpaDistribution} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bucket" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="students" name="Students" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Attendance bands" subtitle="75% is the usual eligibility bar">
          <BarList
            items={data.attendanceBands.map(b => ({
              label: b.band, value: b.students,
              color: b.band === 'Below 60%' ? 'bg-danger-500' : b.band === '60 – 74%' ? 'bg-warning-500' : 'bg-success-500',
            }))}
            format={fmtInt}
          />
          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-100 text-center">
            <div>
              <div className="text-lg font-extrabold text-gray-900">{fmtInt(s.creditsEarned)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Credits earned</div>
            </div>
            <div>
              <div className="text-lg font-extrabold text-gray-900">{fmtInt(s.creditsRegistered)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Credits registered</div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="By programme" subtitle="Cohort size, average GPA and attendance">
        <Table
          rows={data.byProgram}
          columns={[
            { key: 'program', label: 'Programme' },
            { key: 'students', label: 'Students', align: 'right', render: r => fmtInt(r.students) },
            { key: 'avgGpa', label: 'Avg GPA', align: 'right' },
            {
              key: 'avgAttendance', label: 'Avg attendance', align: 'right',
              render: r => r.avgAttendance == null ? '—'
                : <Badge variant={r.avgAttendance >= 75 ? 'success' : r.avgAttendance >= 60 ? 'warning' : 'danger'}>{r.avgAttendance}%</Badge>,
            },
          ]}
        />
      </Panel>

      <Panel title="Students at risk" subtitle="Attendance below 75%, or GPA below 5.0">
        <Table
          rows={data.atRisk}
          empty="No student is currently below either threshold."
          columns={[
            { key: 'registrationNumber', label: 'Registration no.' },
            { key: 'studentName', label: 'Student' },
            { key: 'program', label: 'Programme' },
            { key: 'term', label: 'Term' },
            { key: 'gpa', label: 'GPA', align: 'right' },
            {
              key: 'attendancePct', label: 'Attendance', align: 'right',
              render: r => r.attendancePct == null ? '—' : <Badge variant="danger">{r.attendancePct}%</Badge>,
            },
          ]}
        />
      </Panel>
    </div>
  )
}

// ── Examination ──────────────────────────────────────────────────────────────
function ExaminationDashboard() {
  const [year, setYear] = useState('')
  const [term, setTerm] = useState('')
  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/analytics/examination', { academicYear: year, term }), [year, term])

  if (loading) return <Loading label="Building the examination dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  if (!data.configured) {
    return (
      <NotConfigured
        title="No examination results yet"
        description={data.reason}
        action={<Link to="/integration-hub"><Button size="sm">Set up an examination sync</Button></Link>}
      />
    )
  }

  const s = data.summary
  const decided = (s.passed || 0) + (s.failed || 0)
  const passRate = decided > 0 ? Math.round((s.passed / decided) * 1000) / 10 : 0
  const outcome = [
    { name: 'Passed', value: s.passed || 0 },
    { name: 'Failed', value: s.failed || 0 },
    { name: 'Absent', value: s.absent || 0 },
    { name: 'Other / pending', value: s.otherOrPending || 0 },
  ].filter(x => x.value > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={year} onChange={e => setYear(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All years</option>
          {data.filters.years.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={term} onChange={e => setTerm(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
          <option value="">All terms</option>
          {data.filters.terms.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">Last synced {fmtDateTime(data.lastSyncedAt)}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ClipboardCheck} label="Results declared" value={fmtInt(s.resultsDeclared)} tone="primary" />
        <StatCard icon={Award} label="Pass rate" value={`${passRate}%`} tone={passRate >= 80 ? 'success' : 'warning'} />
        <StatCard icon={TrendingUp} label="Average score" value={s.avgScorePct != null ? `${s.avgScorePct}%` : '—'} tone="info" />
        <StatCard icon={AlertTriangle} label="Absent" value={fmtInt(s.absent)} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Outcome split" subtitle="Every declared result">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={outcome} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {outcome.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
              </Pie>
              <Tooltip {...chartTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Grade distribution" subtitle="Results per awarded grade">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.gradeDistribution} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="grade" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="count" name="Results" fill={SERIES[3]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Pass rate by programme" subtitle="Among results that were passed or failed">
          <Table
            rows={data.byProgram}
            columns={[
              { key: 'program', label: 'Programme' },
              { key: 'results', label: 'Results', align: 'right', render: r => fmtInt(r.results) },
              {
                key: 'passRate', label: 'Pass rate', align: 'right',
                render: r => r.passRate == null ? '—'
                  : <Badge variant={r.passRate >= 80 ? 'success' : r.passRate >= 60 ? 'warning' : 'danger'}>{r.passRate}%</Badge>,
              },
            ]}
          />
        </Panel>
        <Panel title="Subjects needing attention" subtitle="Weakest pass rates, minimum 5 attempts">
          <Table
            rows={data.hardestSubjects}
            empty="Not enough attempts recorded to rank subjects."
            columns={[
              { key: 'subjectName', label: 'Subject' },
              { key: 'attempts', label: 'Attempts', align: 'right', render: r => fmtInt(r.attempts) },
              {
                key: 'passRate', label: 'Pass rate', align: 'right',
                render: r => r.passRate == null ? '—'
                  : <Badge variant={r.passRate >= 80 ? 'success' : r.passRate >= 60 ? 'warning' : 'danger'}>{r.passRate}%</Badge>,
              },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Pass rate over terms" subtitle="Every year and term on record">
        <Table
          rows={data.byTerm}
          columns={[
            { key: 'academicYear', label: 'Academic year' },
            { key: 'term', label: 'Term' },
            { key: 'results', label: 'Results', align: 'right', render: r => fmtInt(r.results) },
            { key: 'passRate', label: 'Pass rate', align: 'right', render: r => r.passRate == null ? '—' : `${r.passRate}%` },
          ]}
        />
      </Panel>
    </div>
  )
}

// ── Finance ──────────────────────────────────────────────────────────────────
function FinanceDashboard() {
  const [range, setRange] = useState('365')
  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/analytics/finance', { range }), [range])

  if (loading) return <Loading label="Building the finance dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const t = data.totals, o = data.outstanding
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Segmented
          value={range} onChange={setRange}
          options={[{ value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '365', label: '1y' }, { value: 'all', label: 'All' }]}
        />
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
        <span className="text-xs text-gray-400 ml-auto hidden sm:block">
          Only receipts carrying a UTR / transaction reference count as collected.
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Collected" value={fmtMoney(t.collected)} tone="success" />
        <StatCard icon={FileText} label="Receipts" value={fmtInt(t.receipts)} tone="primary" />
        <StatCard icon={AlertTriangle} label="Outstanding" value={fmtMoney(o.total)} tone="danger" />
        <StatCard icon={TrendingUp} label="Collection efficiency" value={`${data.collectionEfficiency}%`} tone="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Collection by month" subtitle="Last twelve months of banked receipts">
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={data.byMonth} margin={{ top: 5, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" {...axis} />
              <YAxis {...axis} tickFormatter={v => (v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <Tooltip {...chartTooltip} formatter={v => fmtMoney(v)} />
              <Bar dataKey="amount" name="Collected" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Outstanding by fee head" subtitle="Demanded on applications but not yet paid">
          <BarList
            items={[
              { label: 'Tuition fee', value: Number(o.tuitionFee), color: 'bg-danger-500' },
              { label: 'Registration fee', value: Number(o.registrationFee), color: 'bg-warning-500' },
              { label: 'Application fee', value: Number(o.applicationFee), color: 'bg-info-500' },
            ]}
            format={fmtMoney}
          />
          <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-gray-100">
            <strong className="text-gray-800">{fmtInt(o.studentsOwingTuition)}</strong> student(s) still owe tuition.
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Collected by fee head" subtitle="Where the money came from">
          <BarList
            items={data.byFeeType.map(x => ({ label: x.feeType, value: Number(x.amount) }))}
            format={fmtMoney} color="bg-success-500"
          />
        </Panel>
        <Panel title="Payment mode" subtitle="Online versus offline settlement">
          <BarList
            items={data.byMode.map(x => ({ label: x.mode, value: Number(x.amount) }))}
            format={fmtMoney} color="bg-info-500"
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Revenue by programme" subtitle="Top 12 collected">
          <Table
            rows={data.byProgram}
            columns={[
              { key: 'program', label: 'Programme' },
              { key: 'receipts', label: 'Receipts', align: 'right', render: r => fmtInt(r.receipts) },
              { key: 'collected', label: 'Collected', align: 'right', render: r => fmtMoney(r.collected) },
            ]}
          />
        </Panel>
        <Panel title="Not yet collected" subtitle="Receipts raised but not approved — the finance queue">
          <Table
            rows={data.pendingByStatus}
            empty="Nothing is waiting in the payment queue."
            columns={[
              { key: 'status', label: 'Status' },
              { key: 'receipts', label: 'Receipts', align: 'right', render: r => fmtInt(r.receipts) },
              { key: 'amount', label: 'Amount', align: 'right', render: r => fmtMoney(r.amount) },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'admission',   label: 'Admission',   icon: PieIcon },
  { id: 'academic',    label: 'Academic',    icon: GraduationCap },
  { id: 'examination', label: 'Examination', icon: ClipboardCheck },
  { id: 'finance',     label: 'Finance',     icon: Wallet },
]

export default function Analytics() {
  const [tab, setTab] = useState('admission')
  return (
    <PageContainer
      title="Analytics"
      description="Admission, academic, examination and finance dashboards"
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5 overflow-x-auto" />
      {tab === 'admission'   && <AdmissionDashboard />}
      {tab === 'academic'    && <AcademicDashboard />}
      {tab === 'examination' && <ExaminationDashboard />}
      {tab === 'finance'     && <FinanceDashboard />}
    </PageContainer>
  )
}
