import React, { useState, useEffect } from 'react'
import { Building2, Plus, RefreshCw, Power, PowerOff, X, Copy, Check, Edit3, Save, User, KeyRound, UserPlus, ArrowUpCircle, Eye } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import { Modal, Button } from '../components/ui'

const PLAN_OPTIONS = ['standard', 'premium', 'enterprise']

export default function PlatformTenants() {
  const { showToast } = useCcrm()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [created, setCreated] = useState(null)   // { tenant, admin, tempPassword }
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '', allowedDomains: '' })
  const [viewingId, setViewingId] = useState(null)   // tenant id currently loading "View Leads"

  // Edit tenant modal
  const [editTenant, setEditTenant]     = useState(null)   // tenant row being edited
  const [editForm, setEditForm]         = useState({ name: '', plan: 'standard', allowedDomains: '' })
  const [editSaving, setEditSaving]     = useState(false)
  const [admins, setAdmins]             = useState([])     // [{id, name, email, newPassword}]
  const [adminsLoading, setAdminsLoading] = useState(false)

  // New admin (create fresh account)
  const [showNewAdmin, setShowNewAdmin] = useState(false)
  const [newAdmin, setNewAdmin]         = useState({ name: '', email: '', password: '' })
  const [newAdminSaving, setNewAdminSaving] = useState(false)

  // Promote existing tenant user to Admin
  const [tenantUsers, setTenantUsers]   = useState([])     // every user in this tenant, incl. current admins
  const [promoteUserId, setPromoteUserId] = useState('')
  const [promoting, setPromoting]       = useState(false)

  const token = () => localStorage.getItem('ccrm_token')

  const loadAdmins = async (tenantId) => {
    const res = await fetch(`/api/platform/tenants/${tenantId}/admins`, { headers: { Authorization: `Bearer ${token()}` } })
    if (res.ok) {
      const data = await res.json()
      setAdmins(data.map(a => ({ ...a, newPassword: '' })))
    }
  }

  const loadTenantUsers = async (tenantId) => {
    const res = await fetch(`/api/platform/tenants/${tenantId}/users`, { headers: { Authorization: `Bearer ${token()}` } })
    if (res.ok) setTenantUsers(await res.json())
  }

  const openEdit = async (t) => {
    setEditTenant(t)
    setEditForm({ name: t.name || '', plan: t.plan || 'standard', allowedDomains: t.allowedDomains || '' })
    setAdmins([])
    setTenantUsers([])
    setPromoteUserId('')
    setShowNewAdmin(false)
    setNewAdmin({ name: '', email: '', password: '' })
    setAdminsLoading(true)
    try {
      await Promise.all([loadAdmins(t.id), loadTenantUsers(t.id)])
    } catch { /* non-fatal — tenant fields still editable */ }
    finally { setAdminsLoading(false) }
  }

  const updateAdminField = (id, field, value) => {
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  const createAdmin = async () => {
    if (!newAdmin.email.trim()) return showToast('Email is required.', 'error')
    setNewAdminSaving(true)
    try {
      const res = await fetch(`/api/platform/tenants/${editTenant.id}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(newAdmin)
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed to create admin.', 'error')
      showToast(`${data.name} added as admin.`, 'success')
      setShowNewAdmin(false)
      setNewAdmin({ name: '', email: '', password: '' })
      await Promise.all([loadAdmins(editTenant.id), loadTenantUsers(editTenant.id)])
    } catch { showToast('Failed to create admin.', 'error') }
    finally { setNewAdminSaving(false) }
  }

  const promoteToAdmin = async () => {
    if (!promoteUserId) return
    setPromoting(true)
    try {
      const res = await fetch(`/api/platform/tenants/${editTenant.id}/admins/${promoteUserId}/promote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed to promote user.', 'error')
      showToast(`${data.name} is now an Admin.`, 'success')
      setPromoteUserId('')
      await Promise.all([loadAdmins(editTenant.id), loadTenantUsers(editTenant.id)])
    } catch { showToast('Failed to promote user.', 'error') }
    finally { setPromoting(false) }
  }

  const saveEdit = async () => {
    if (!editForm.name.trim()) return showToast('Organization name is required.', 'error')
    setEditSaving(true)
    try {
      const res = await fetch(`/api/platform/tenants/${editTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name: editForm.name.trim(),
          plan: editForm.plan,
          allowedDomains: editForm.allowedDomains.split(',').map(s => s.trim()).filter(Boolean)
        })
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Failed to update tenant.', 'error'); setEditSaving(false); return }

      // Push through any admin edits (name/email always sent; password only if the field was filled in)
      for (const a of admins) {
        const body = { name: a.name.trim(), email: a.email.trim() }
        if (a.newPassword.trim()) body.password = a.newPassword.trim()
        const aRes = await fetch(`/api/platform/tenants/${editTenant.id}/admins/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(body)
        })
        if (!aRes.ok) {
          const aData = await aRes.json().catch(() => ({}))
          showToast(`${a.email}: ${aData.error || 'Failed to update admin.'}`, 'error')
          setEditSaving(false)
          return
        }
      }

      showToast(`${editForm.name} updated.`, 'success')
      setEditTenant(null)
      load()
    } catch { showToast('Failed to update tenant.', 'error') }
    finally { setEditSaving(false) }
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/platform/tenants', { headers: { Authorization: `Bearer ${token()}` } })
      if (!res.ok) throw new Error()
      setRows(await res.json())
    } catch { showToast('Failed to load tenants.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)

  const createTenant = async () => {
    if (!form.name || !form.slug || !form.adminEmail) return showToast('Name, slug and admin email are required.', 'error')
    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, allowedDomains: form.allowedDomains.split(',').map(s => s.trim()).filter(Boolean) })
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed to create tenant.', 'error')
      setCreated(data)
      setShowAdd(false)
      setForm({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '', allowedDomains: '' })
      load()
    } catch { showToast('Failed to create tenant.', 'error') }
  }

  const toggleStatus = async (t) => {
    const next = t.status === 'Active' ? 'Suspended' : 'Active'
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status: next })
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed.', 'error')
      showToast(`${t.name} ${next === 'Active' ? 'activated' : 'suspended'}.`, 'success')
      load()
    } catch { showToast('Failed to update tenant.', 'error') }
  }

  // "View Leads" — impersonate that tenant's admin so we can see and manage
  // its real data. Stashes our own platform-admin session first so we can
  // return to it (see the "Exit impersonation" banner in Navbar.jsx).
  const viewAsAdmin = async (t) => {
    setViewingId(t.id)
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed to view tenant.', 'error')

      const ownToken = localStorage.getItem('ccrm_token')
      const ownUser  = localStorage.getItem('ccrm_current_user')
      if (ownToken && !localStorage.getItem('ccrm_impersonation_backup')) {
        localStorage.setItem('ccrm_impersonation_backup', JSON.stringify({ token: ownToken, user: ownUser, tenantName: t.name }))
      }
      localStorage.setItem('ccrm_token', data.token)
      localStorage.setItem('ccrm_current_user', JSON.stringify(data.user))
      window.location.href = data.tenantSlug ? `/${data.tenantSlug}/leads` : '/leads'
    } catch { showToast('Failed to view tenant.', 'error') }
    finally { setViewingId(null) }
  }

  const copyCreds = () => {
    if (!created) return
    navigator.clipboard.writeText(`URL: ${location.origin}\nEmail: ${created.admin.email}\nPassword: ${created.tempPassword}`)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={20} className="text-primary-500" /> Tenants
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform admin — create and manage organizations on this CRM.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5">
            <Plus size={14} /> Add Tenant
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Organization</th>
              <th className="px-4 py-3 text-left">Slug</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No tenants yet.</td></tr>
            ) : rows.map(t => (
              <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(t)}
                    className="font-medium text-primary-600 hover:text-primary-700 hover:underline text-left flex items-center gap-1.5 group">
                    {t.name}
                    <Edit3 size={12} className="text-gray-300 group-hover:text-primary-500 flex-shrink-0" />
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">{t.slug}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{t.plan}</td>
                <td className="px-4 py-3 text-right">{t.users}</td>
                <td className="px-4 py-3 text-right">{Number(t.leads).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${t.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => viewAsAdmin(t)} disabled={viewingId === t.id || t.status !== 'Active'}
                      title={t.status !== 'Active' ? 'Tenant is suspended' : `View ${t.name}'s leads as their admin`}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Eye size={12} /> {viewingId === t.id ? 'Loading...' : 'View Leads'}
                    </button>
                    {t.id === 1 ? <span className="text-[11px] text-gray-300">primary</span> : (
                      <button onClick={() => toggleStatus(t)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border ${t.status === 'Active' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                        {t.status === 'Active' ? <><PowerOff size={12} /> Suspend</> : <><Power size={12} /> Activate</>}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Tenant modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Add Tenant</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <Field label="Organization name" value={form.name}
                onChange={v => setForm(f => ({ ...f, name: v, slug: f.slug || slugify(v) }))} placeholder="Acme University" />
              <Field label="Slug (subdomain / webhook path)" value={form.slug}
                onChange={v => setForm(f => ({ ...f, slug: slugify(v) }))} placeholder="acme" />
              <Field label="First admin name" value={form.adminName} onChange={v => setForm(f => ({ ...f, adminName: v }))} placeholder="Acme Admin" />
              <Field label="First admin email" value={form.adminEmail} onChange={v => setForm(f => ({ ...f, adminEmail: v }))} placeholder="admin@acme.edu" />
              <Field label="Temp password (optional)" value={form.adminPassword} onChange={v => setForm(f => ({ ...f, adminPassword: v }))} placeholder="ChangeMe@123" />
              <Field label="Allowed login domains (comma-sep, optional)" value={form.allowedDomains} onChange={v => setForm(f => ({ ...f, allowedDomains: v }))} placeholder="acme.edu" />
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 text-sm border border-gray-300 rounded-lg py-2 hover:bg-gray-50">Cancel</button>
              <button onClick={createTenant} className="flex-1 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Created — show credentials once */}
      {created && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">✅ {created.tenant.name} created</h2>
            <p className="text-sm text-gray-500 mb-4">Share these one-time credentials with the org admin. They log in at the normal login page.</p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono space-y-1">
              <div><span className="text-gray-400">Email:</span> {created.admin.email}</div>
              <div><span className="text-gray-400">Password:</span> {created.tempPassword}</div>
              <div><span className="text-gray-400">Webhook slug:</span> {created.tenant.slug}</div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={copyCreds} className="flex-1 text-sm border border-gray-300 rounded-lg py-2 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5">
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <button onClick={() => setCreated(null)} className="flex-1 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tenant modal */}
      <Modal
        open={!!editTenant}
        onClose={() => setEditTenant(null)}
        title={<span className="flex items-center gap-2"><Building2 size={18} className="text-primary-500" /> Edit Organization</span>}
        subtitle={editTenant ? `Slug: ${editTenant.slug} (not editable — used in login URLs & webhooks)` : ''}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setEditTenant(null)}>Cancel</Button>
            <Button className="flex-1" icon={Save} loading={editSaving} onClick={saveEdit}>Save Changes</Button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <Field label="Organization name" value={editForm.name}
              onChange={v => setEditForm(f => ({ ...f, name: v }))} placeholder="Acme University" />
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Plan</label>
              <select value={editForm.plan} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400 capitalize">
                {PLAN_OPTIONS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <Field label="Allowed login domains (comma-sep, optional)" value={editForm.allowedDomains}
              onChange={v => setEditForm(f => ({ ...f, allowedDomains: v }))} placeholder="acme.edu" />
          </div>

          {/* Admin accounts */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <User size={13} /> Admin Accounts
              </p>
              <button onClick={() => setShowNewAdmin(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                <UserPlus size={13} /> Add New Admin
              </button>
            </div>

            {showNewAdmin && (
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 mb-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Name</label>
                    <input value={newAdmin.name} onChange={e => setNewAdmin(f => ({ ...f, name: e.target.value }))}
                      placeholder="Jane Doe"
                      className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Email *</label>
                    <input value={newAdmin.email} onChange={e => setNewAdmin(f => ({ ...f, email: e.target.value }))}
                      placeholder="jane@org.edu"
                      className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Temp password (optional)</label>
                  <input value={newAdmin.password} onChange={e => setNewAdmin(f => ({ ...f, password: e.target.value }))}
                    placeholder="Defaults to ChangeMe@123"
                    className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white font-mono" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowNewAdmin(false)} className="flex-1 text-xs border border-gray-300 rounded-lg py-1.5 hover:bg-gray-50 bg-white">Cancel</button>
                  <button onClick={createAdmin} disabled={newAdminSaving}
                    className="flex-1 text-xs bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg py-1.5">
                    {newAdminSaving ? 'Creating...' : 'Create Admin'}
                  </button>
                </div>
              </div>
            )}

            {adminsLoading ? (
              <p className="text-xs text-gray-400">Loading admins…</p>
            ) : admins.length === 0 ? (
              <p className="text-xs text-gray-400">No admin accounts found for this tenant.</p>
            ) : (
              <div className="space-y-4">
                {admins.map(a => (
                  <div key={a.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Name</label>
                        <input value={a.name} onChange={e => updateAdminField(a.id, 'name', e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Email</label>
                        <input value={a.email} onChange={e => updateAdminField(a.id, 'email', e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                        <KeyRound size={10} /> New password (leave blank to keep current)
                      </label>
                      <input type="text" value={a.newPassword} onChange={e => updateAdminField(a.id, 'newPassword', e.target.value)}
                        placeholder="Only fill in to reset"
                        className="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white font-mono" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Promote an existing tenant user to Admin */}
            {tenantUsers.filter(u => u.role !== 'Admin').length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                  <ArrowUpCircle size={12} /> Promote existing user to Admin
                </label>
                <div className="flex gap-2">
                  <select value={promoteUserId} onChange={e => setPromoteUserId(e.target.value)}
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white">
                    <option value="">— Choose a user —</option>
                    {tenantUsers.filter(u => u.role !== 'Admin').map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email}) · {u.role}</option>
                    ))}
                  </select>
                  <button onClick={promoteToAdmin} disabled={!promoteUserId || promoting}
                    className="text-xs font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg px-3 whitespace-nowrap">
                    {promoting ? 'Promoting...' : 'Promote'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
    </div>
  )
}
