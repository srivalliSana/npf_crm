import React, { useState } from 'react'
import {
  ShieldCheck, KeyRound, Monitor, LogIn, ScrollText, DatabaseBackup,
  RefreshCw, AlertTriangle, Users, Activity, Check, X, HardDrive, Cloud,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import { Tabs, StatCard, Badge, Button } from '../components/ui'
import { Panel, Loading, ErrorState, useAsync, ScrollX } from '../components/ModuleKit'
import { apiGet, apiPut, apiPost, fmtInt, fmtDateTime, fmtBytes } from '../lib/api'
import { usePermissions } from '../hooks/usePermissions'

// Item 29 — Security: role-based access, authentication, backup, audit logs,
// encryption. Each tab answers one question an auditor or an admin actually
// asks, and every claim is backed by something the server measured.

// A user agent is unreadable in a table; the browser and OS are what identify
// a session to the person deciding whether to kill it.
function shortAgent(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Unknown browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview() {
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/security/overview'), [])
  if (loading) return <Loading label="Checking security posture…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const u = data.userStats, e = data.encryption
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="User accounts" value={fmtInt(u.total)} tone="primary" />
        <StatCard icon={Monitor} label="Active sessions" value={fmtInt(data.activeSessions)} tone="info" />
        <StatCard icon={LogIn} label="Failed sign-ins (24h)" value={fmtInt(data.failedLogins24h)} tone={data.failedLogins24h > 0 ? 'warning' : 'success'} />
        <StatCard icon={Activity} label="Audited actions (24h)" value={fmtInt(data.auditEvents24h)} tone="neutral" />
      </div>

      {data.suspiciousAccounts.length > 0 && (
        <Panel title="Repeated sign-in failures" subtitle="Five or more failures against one account in the last hour">
          <div className="space-y-2">
            {data.suspiciousAccounts.map(a => (
              <div key={a.email} className="flex items-center gap-3 bg-danger-50 rounded-xl px-3.5 py-2.5">
                <AlertTriangle size={15} className="text-danger-600 flex-shrink-0" />
                <span className="text-sm text-gray-800 flex-1 truncate">{a.email || '(no email supplied)'}</span>
                <Badge variant="danger">{a.attempts} attempts</Badge>
                <span className="text-xs text-gray-500 hidden sm:inline">{fmtDateTime(a.last_attempt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Accounts by role" subtitle="Who holds which level of access">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Active', u.active, 'success'], ['Inactive', u.inactive, 'neutral'],
              ['Admins', u.admins, 'danger'], ['Super admins', u.superadmins, 'danger'],
              ['Managers', u.managers, 'warning'], ['Counsellors', u.counselors, 'info'],
              ['Finance', u.finance, 'info'],
            ].map(([label, value, variant]) => (
              <div key={label} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-600">{label}</span>
                <Badge variant={variant}>{fmtInt(value)}</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Encryption" subtitle="Credentials at rest and traffic in transit">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {e.keyConfigured
                ? <Check size={16} className="text-success-700 flex-shrink-0" />
                : <X size={16} className="text-danger-600 flex-shrink-0" />}
              <div className="flex-1">
                <div className="text-sm text-gray-800">Secrets-at-rest key</div>
                <div className="text-xs text-gray-500">
                  {e.keyConfigured
                    ? `${e.algorithm} — configured via SETTINGS_ENC_KEY`
                    : 'SETTINGS_ENC_KEY is not set, so stored credentials remain plaintext.'}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Stored secrets encrypted</span>
              <Badge variant={e.secretsEncrypted === e.secretsTotal && e.secretsTotal > 0 ? 'success' : e.secretsEncrypted > 0 ? 'warning' : 'neutral'}>
                {fmtInt(e.secretsEncrypted)} / {fmtInt(e.secretsTotal)}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-gray-500">Transport</span>
              <span className="text-xs text-gray-700">{e.transport}</span>
            </div>
            {!e.keyConfigured && (
              <p className="text-[11px] text-warning-700 bg-warning-50 rounded-lg px-2.5 py-2">
                Set <code className="font-mono">SETTINGS_ENC_KEY</code> in the server environment and re-save each
                credential — existing plaintext values are read as-is and only encrypted when next written.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Most active accounts" subtitle="Audited actions in the last seven days">
        {data.topActors.length === 0
          ? <p className="text-sm text-gray-400 py-6 text-center">No audited activity in the last week.</p>
          : (
            <div className="space-y-2">
              {data.topActors.map(a => (
                <div key={a.email} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 truncate">{a.email}</span>
                  <Badge variant="neutral">{fmtInt(a.actions)} actions</Badge>
                </div>
              ))}
            </div>
          )}
      </Panel>
    </div>
  )
}

// ── Roles & permissions ──────────────────────────────────────────────────────
function RolesPermissions() {
  const { can } = usePermissions()
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/security/permissions'), [])
  const [draft, setDraft] = useState(null)   // { roleId, set: Set<string> }
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  if (loading) return <Loading label="Loading the permission matrix…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const editable = can('roles.manage')
  const groups = [...new Set(data.catalogue.map(p => p.group))]

  const startEdit = (role) => setDraft({ roleId: role.id, set: new Set(role.permissions) })
  const toggle = (key) => setDraft(d => {
    const next = new Set(d.set)
    next.has(key) ? next.delete(key) : next.add(key)
    return { ...d, set: next }
  })

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      await apiPut(`/api/security/roles/${draft.roleId}/permissions`, { permissions: [...draft.set] })
      setMsg({ tone: 'success', text: 'Permissions saved. They take effect within a minute.' })
      setDraft(null)
      reload()
    } catch (e) {
      setMsg({ tone: 'danger', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-xs rounded-lg px-3 py-2 ${msg.tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
          {msg.text}
        </div>
      )}

      <Panel
        title="Roles"
        subtitle="What each role may do. These permissions are enforced by the server, not just the menu."
      >
        <div className="space-y-3">
          {data.roles.map(role => {
            const isEditing = draft?.roleId === role.id
            const active = isEditing ? draft.set : new Set(role.permissions)
            const isFull = active.has('*')
            return (
              <div key={role.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/70 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900">{role.name}</h4>
                      {role.isSystem && <Badge variant="neutral">System</Badge>}
                      {isFull && <Badge variant="danger">Full access</Badge>}
                      {role.usingDefaults && !isEditing && <Badge variant="warning">Using defaults</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                  </div>
                  <span className="text-xs text-gray-500">{fmtInt(role.userCount)} user(s)</span>
                  {editable && (
                    isEditing ? (
                      <div className="flex gap-2">
                        <Button size="sm" loading={saving} onClick={save}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => startEdit(role)}>Edit</Button>
                    )
                  )}
                </div>

                {isFull && !isEditing ? (
                  <p className="px-4 py-3 text-xs text-gray-500">
                    Holds the <code className="font-mono">*</code> wildcard — every permission, present and future.
                  </p>
                ) : (
                  <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                    {groups.map(group => (
                      <div key={group}>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{group}</div>
                        <div className="space-y-1">
                          {data.catalogue.filter(p => p.group === group).map(p => (
                            <label
                              key={p.key}
                              className={`flex items-start gap-2 text-xs ${isEditing ? 'cursor-pointer' : 'cursor-default'} ${active.has(p.key) ? 'text-gray-800' : 'text-gray-400'}`}
                            >
                              <input
                                type="checkbox"
                                checked={active.has(p.key)}
                                disabled={!isEditing}
                                onChange={() => toggle(p.key)}
                                className="mt-0.5 accent-primary-500 disabled:opacity-60"
                              />
                              <span>{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {!editable && (
          <p className="text-[11px] text-gray-400 mt-4">Editing requires the roles.manage permission.</p>
        )}
      </Panel>
    </div>
  )
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function Sessions() {
  const { can } = usePermissions()
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/security/sessions'), [])
  const [busy, setBusy] = useState('')

  const revoke = async (jti, email) => {
    if (!confirm(`Sign out ${email}? Their current token stops working within about 30 seconds.`)) return
    setBusy(jti)
    try { await apiPost(`/api/security/sessions/${jti}/revoke`); reload() }
    catch (e) { alert(e.message) }
    finally { setBusy('') }
  }

  if (loading) return <Loading label="Listing active sessions…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <Panel
      title="Active sessions"
      subtitle="Every currently valid sign-in. Revoking one invalidates its token before its normal 7-day expiry."
      action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>}
    >
      <ScrollX>
        <table className="w-full text-sm border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th className="table-th">User</th>
              <th className="table-th">Role</th>
              <th className="table-th">Signed in via</th>
              <th className="table-th">Device</th>
              <th className="table-th">IP</th>
              <th className="table-th">Last seen</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={7} className="table-td text-center text-gray-400 py-10">
                No active sessions. Sessions are recorded from the first sign-in after this release.
              </td></tr>
            )}
            {data.map(s => (
              <tr key={s.jti} className="hover:bg-gray-50/80 transition-colors">
                <td className="table-td">
                  <div className="font-medium text-gray-800">{s.name || s.email}</div>
                  <div className="text-[10px] text-gray-400">{s.email}</div>
                </td>
                <td className="table-td text-gray-600">{s.role || '—'}</td>
                <td className="table-td"><Badge variant="neutral">{s.loginMethod}</Badge></td>
                <td className="table-td text-gray-500 text-xs">{shortAgent(s.userAgent)}</td>
                <td className="table-td text-gray-400 text-xs">{s.ip || '—'}</td>
                <td className="table-td text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(s.lastSeenAt)}</td>
                <td className="table-td text-right">
                  {can('security.manage') && (
                    <Button
                      size="sm" variant="ghost" loading={busy === s.jti}
                      className="!text-danger-600 hover:!bg-danger-50"
                      onClick={() => revoke(s.jti, s.email)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </Panel>
  )
}

// ── Login activity ───────────────────────────────────────────────────────────
function LoginActivity() {
  const [status, setStatus] = useState('')
  const { data, loading, error, reload } = useAsync(
    () => apiGet('/api/security/login-events', { status, limit: 200 }), [status])

  return (
    <Panel
      title="Sign-in activity"
      subtitle="Successful and failed attempts, with the reason each failure was rejected"
      action={
        <div className="flex items-center gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)} className="input-field !w-auto !py-1.5 text-xs">
            <option value="">All attempts</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
        </div>
      }
    >
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <ScrollX>
          <table className="w-full text-sm border-collapse min-w-[620px]">
            <thead>
              <tr>
                <th className="table-th">When</th>
                <th className="table-th">Email</th>
                <th className="table-th">Result</th>
                <th className="table-th">Method</th>
                <th className="table-th">Device</th>
                <th className="table-th">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-gray-400 py-10">
                  No sign-in activity recorded yet.
                </td></tr>
              )}
              {data.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="table-td text-gray-500 whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td className="table-td text-gray-800 truncate max-w-[200px]">{e.email || '—'}</td>
                  <td className="table-td">
                    {e.success
                      ? <Badge variant="success">Success</Badge>
                      : <Badge variant="danger">{e.reason || 'Failed'}</Badge>}
                  </td>
                  <td className="table-td text-gray-500 text-xs">{e.method}</td>
                  <td className="table-td text-gray-500 text-xs">{shortAgent(e.userAgent)}</td>
                  <td className="table-td text-gray-400 text-xs">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </Panel>
  )
}

// ── Backups ──────────────────────────────────────────────────────────────────
function Backups() {
  const { can } = usePermissions()
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/security/backups'), [])
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState(null)

  const runNow = async () => {
    setRunning(true); setMsg(null)
    try {
      await apiPost('/api/admin/backup-now')
      setMsg({ tone: 'success', text: 'Backup script completed.' })
      reload()
    } catch (e) {
      setMsg({ tone: 'danger', text: e.message })
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <Loading label="Checking backups…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const stale = data.ageHours != null && data.ageHours > 36
  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-xs rounded-lg px-3 py-2 ${msg.tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="On-disk backups" subtitle={data.directory}>
          {!data.dirReadable ? (
            // Reporting "no backups" would be wrong — the process may simply
            // lack permission to look. Say which it is.
            <div className="flex items-start gap-2 text-xs text-warning-700 bg-warning-50 rounded-lg px-3 py-2.5">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                The server process can't read this directory, so on-disk backups can't be verified from here.
                This is not the same as "no backups exist" — check the host directly.
              </span>
            </div>
          ) : data.latest ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <HardDrive size={16} className={stale ? 'text-warning-600' : 'text-success-700'} />
                <div className="flex-1">
                  <div className="text-sm text-gray-800">Latest: {data.latest.name}</div>
                  <div className="text-xs text-gray-500">
                    {fmtDateTime(data.latest.modifiedAt)} · {fmtBytes(data.latest.sizeBytes)} · {data.ageHours}h old
                  </div>
                </div>
                <Badge variant={stale ? 'warning' : 'success'}>{stale ? 'Stale' : 'Current'}</Badge>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-1 max-h-52 overflow-y-auto">
                {data.files.map(f => (
                  <div key={f.name} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate">{f.name}</span>
                    <span className="text-gray-400 whitespace-nowrap ml-2">{fmtBytes(f.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">No backup files found in this directory.</p>
          )}
        </Panel>

        <Panel title="Schedule & offsite copy" subtitle="Automated backups configured on this server">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Schedule</span>
              <span className="text-xs text-gray-700">{data.schedule}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Offsite (S3)</span>
              {data.s3Configured
                ? <Badge variant="success">{data.s3Bucket}</Badge>
                : <Badge variant="warning">Not configured</Badge>}
            </div>
            {!data.s3Configured && (
              <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                <Cloud size={12} className="flex-shrink-0 mt-0.5" />
                Add <code className="font-mono">aws_s3_bucket</code>, <code className="font-mono">aws_access_key_id</code> and
                <code className="font-mono"> aws_secret_access_key</code> under Integration Settings to enable the nightly
                offsite upload. Without it, a host failure loses every backup with it.
              </p>
            )}
            {can('security.manage') && (
              <div className="pt-3 border-t border-gray-100">
                <Button size="sm" variant="secondary" icon={DatabaseBackup} loading={running} onClick={runNow}>
                  Run backup now
                </Button>
                <p className="text-[11px] text-gray-400 mt-2">
                  Executes <code className="font-mono">/usr/local/bin/ccrm-backup.sh</code> on the server and can take
                  several minutes.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',      icon: ShieldCheck },
  { id: 'roles',       label: 'Roles & permissions', icon: KeyRound },
  { id: 'sessions',    label: 'Sessions',      icon: Monitor },
  { id: 'logins',      label: 'Sign-in activity', icon: LogIn },
  { id: 'backups',     label: 'Backup & encryption', icon: DatabaseBackup },
]

export default function SecurityAccess() {
  const [tab, setTab] = useState('overview')
  return (
    <PageContainer
      title="Security & Access"
      description="Role-based access, authentication, backups, audit logs and encryption"
      action={
        <Link to="/compliance" className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1">
          <ScrollText size={13} /> Full audit trail
        </Link>
      }
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5 overflow-x-auto" />
      {tab === 'overview' && <Overview />}
      {tab === 'roles'    && <RolesPermissions />}
      {tab === 'sessions' && <Sessions />}
      {tab === 'logins'   && <LoginActivity />}
      {tab === 'backups'  && <Backups />}
    </PageContainer>
  )
}
