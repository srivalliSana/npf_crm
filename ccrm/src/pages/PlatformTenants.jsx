import React, { useState, useEffect } from 'react'
import { Building2, Plus, RefreshCw, Power, PowerOff, X, Copy, Check } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function PlatformTenants() {
  const { showToast } = useCcrm()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [created, setCreated] = useState(null)   // { tenant, admin, tempPassword }
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '', allowedDomains: '' })

  const token = () => localStorage.getItem('ccrm_token')

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
                <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                <td className="px-4 py-3 text-gray-500">{t.slug}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{t.plan}</td>
                <td className="px-4 py-3 text-right">{t.users}</td>
                <td className="px-4 py-3 text-right">{Number(t.leads).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${t.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {t.id === 1 ? <span className="text-[11px] text-gray-300">primary</span> : (
                    <button onClick={() => toggleStatus(t)}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border ${t.status === 'Active' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                      {t.status === 'Active' ? <><PowerOff size={12} /> Suspend</> : <><Power size={12} /> Activate</>}
                    </button>
                  )}
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
