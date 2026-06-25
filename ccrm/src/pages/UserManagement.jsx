import React, { useState, useRef, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  Users, Plus, Search, Shield, Edit, Trash2,
  CheckCircle, XCircle, X, Save, AlertTriangle,
  Upload, Download, FileSpreadsheet, Key, Activity, Clock, Copy,
  UserCheck, UserMinus, Crown,
} from 'lucide-react'

const ROLE_COLORS = {
  Admin:     { bg: 'bg-red-100',    text: 'text-red-700'    },
  Manager:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  Counselor: { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  Finance:   { bg: 'bg-green-100',  text: 'text-green-700'  },
}

const PERMISSIONS = {
  Admin:     ['View Leads','Edit Leads','Delete Leads','View Applications','Edit Applications','View Reports','Manage Users','System Settings','View Payments','Edit Payments'],
  Manager:   ['View Leads','Edit Leads','View Applications','Edit Applications','View Reports','View Payments'],
  Counselor: ['View Leads','Edit Leads','View Applications','Edit Applications'],
  Finance:   ['View Payments','Edit Payments','View Reports'],
}

// Fallback values if API hasn't loaded yet
const FALLBACK_ROLES = ['Admin','Manager','Counselor','Finance']
const ENTITIES = ['CUTM', 'CUTMAP', 'FTL', 'GTIB', 'GTTECH', 'ESSE']
const parseEntities = (s) => String(s || 'CUTM').split(',').map(x => x.trim()).filter(Boolean)
const FALLBACK_TEAMS = ['Management','Admissions','Sales','Marketing','Finance']
const EMPTY_FORM = { name: '', email: '', mobile: '', role: 'Counselor', team: 'Admissions', status: 'Active', password: '', reportsTo: '', entities: ['CUTM'] }

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function UserManagement({ currentUser }) {
  const { users, addUser, updateUser, deleteUser, fetchAllData, showToast, tenantConfig } = useCcrm()
  // Entity codes from per-tenant config (falls back to the default CUTM/GT set)
  const ENTITY_CODES = Array.isArray(tenantConfig?.entities) && tenantConfig.entities.length
    ? tenantConfig.entities.map(e => e.code)
    : ENTITIES
  const entityLabel = (code) => tenantConfig?.entities?.find(e => e.code === code)?.label || code
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('All')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showModal, setShowModal]     = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [formError, setFormError]     = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Dynamic teams + roles (admin-managed)
  const [teamsList, setTeamsList] = useState([])
  const [rolesList, setRolesList] = useState([])
  const [showManageTR, setShowManageTR] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')

  const loadTeamsRoles = async () => {
    try {
      const [t, r] = await Promise.all([
        fetch('/api/teams').then(x => x.json()),
        fetch('/api/roles').then(x => x.json()),
      ])
      setTeamsList(Array.isArray(t) ? t : [])
      setRolesList(Array.isArray(r) ? r : [])
    } catch {}
  }
  useEffect(() => { loadTeamsRoles() }, [])

  const ROLES = rolesList.length > 0 ? rolesList.map(r => r.name) : FALLBACK_ROLES
  const TEAMS = teamsList.length > 0 ? teamsList.map(t => t.name) : FALLBACK_TEAMS

  const addTeam = async () => {
    if (!newTeamName.trim()) return
    const res = await fetch('/api/teams', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeamName.trim() })
    })
    if (res.ok) { setNewTeamName(''); loadTeamsRoles() }
    else alert((await res.json()).error || 'Failed to add team')
  }

  const deleteTeam = async (id, name) => {
    if (!confirm(`Delete team "${name}"?`)) return
    const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' })
    if (res.ok) loadTeamsRoles()
    else alert((await res.json()).error || 'Delete failed')
  }

  const addRole = async () => {
    if (!newRoleName.trim()) return
    const res = await fetch('/api/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoleName.trim(), description: newRoleDesc.trim() })
    })
    if (res.ok) { setNewRoleName(''); setNewRoleDesc(''); loadTeamsRoles() }
    else alert((await res.json()).error || 'Failed to add role')
  }

  const deleteRole = async (id, name) => {
    if (!confirm(`Delete role "${name}"?`)) return
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' })
    if (res.ok) loadTeamsRoles()
    else alert((await res.json()).error || 'Delete failed')
  }

  // Bulk-select + reset password + activity
  const [selectedIds, setSelectedIds] = useState([])
  const [resetResult, setResetResult] = useState(null)   // { tempPassword, sentTo, message }
  const [resetForUser, setResetForUser] = useState(null) // user being reset
  const [showActivity, setShowActivity] = useState(false)
  const [activity, setActivity] = useState({ recentLogins: [], activity: [] })

  useEffect(() => {
    if (showActivity) {
      fetch('/api/users/activity').then(r => r.json()).then(d => setActivity(d || { recentLogins: [], activity: [] }))
    }
  }, [showActivity])

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const selectAll = () => {
    setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(u => u.id))
  }

  const [bulkEnt, setBulkEnt] = useState(['CUTM'])
  const [showBulkEnt, setShowBulkEnt] = useState(false)
  const applyBulkEntities = async () => {
    if (selectedIds.length === 0) return
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/users/bulk-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids: selectedIds, entities: bulkEnt })
      })
      if (res.ok) {
        showToast(`Entities set for ${selectedIds.length} user(s).`, 'success')
        setShowBulkEnt(false); setSelectedIds([]); fetchAllData()
      } else { showToast('Failed to set entities.', 'error') }
    } catch { showToast('Network error.', 'error') }
  }

  const bulkActivate = async (status) => {
    if (selectedIds.length === 0) return
    try {
      const res = await fetch('/api/users/bulk-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, status })
      })
      if (res.ok) {
        // Optimistic update in local users list
        selectedIds.forEach(id => updateUser(id, { status }))
        setSelectedIds([])
      }
    } catch {}
  }

  const handleResetPassword = async (user) => {
    if (!confirm(`Reset password for ${user.name}?\nA new temporary password will be emailed to ${user.email}.`)) return
    setResetForUser(user)
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) setResetResult(data)
      else alert(data.error || 'Reset failed')
    } catch { alert('Network error') }
  }

  // Bulk upload state
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult]       = useState(null)
  const [dragOver, setDragOver]           = useState(false)
  const fileInputRef = useRef(null)

  const handleDownloadTemplate = () => {
    const headers = ['Name','Email','Mobile','Role','Team','Password','Status']
    const samples = [
      ['Rahul Sharma',  'rahul.sharma@cutm.ac.in',  '9876543210', 'Counselor', 'Admissions', 'CUTM@2026', 'Active'  ],
      ['Priya Patel',   'priya.patel@cutm.ac.in',   '9123456789', 'Manager',   'Admissions', 'CUTM@2026', 'Active'  ],
      ['Amit Kumar',    'amit.kumar@cutm.ac.in',     '8765432109', 'Counselor', 'Sales',      'CUTM@2026', 'Active'  ],
      ['Sneha Rao',     'sneha.rao@cutm.ac.in',      '9012345678', 'Finance',   'Finance',    'CUTM@2026', 'Active'  ],
      ['Vikram Singh',  'vikram.singh@cutm.ac.in',   '7890123456', 'Counselor', 'Admissions', 'CUTM@2026', 'Inactive'],
    ]
    const csv = 'data:text/csv;charset=utf-8,'
      + [headers.join(','), ...samples.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = encodeURI(csv)
    a.download = 'CCRM_User_Upload_Template.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    showToast('Template downloaded!', 'success')
  }

  const handleBulkFile = async (file) => {
    if (!file) return
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      showToast('Only CSV or Excel files are supported.', 'error'); return
    }
    setBulkUploading(true)
    setBulkResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/users/bulk-upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setBulkResult(data)
        fetchAllData()
        showToast(`${data.inserted} users created, ${data.skipped} skipped.`, 'success')
      } else {
        showToast(data.error || 'Upload failed.', 'error')
      }
    } catch {
      showToast('Network error. Please try again.', 'error')
    } finally {
      setBulkUploading(false)
    }
  }

  const tabs     = ['All', ...ROLES]
  const filtered = users.filter(u =>
    (filter === 'All' || u.role === filter) &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.email.toLowerCase().includes(search.toLowerCase()))
  )

  const active   = users.filter(u => u.status === 'Active').length
  const inactive = users.filter(u => u.status === 'Inactive').length

  // ── Open create modal ──────────────────────────────────────────────────────
  function openCreate() {
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  // ── Open edit modal ────────────────────────────────────────────────────────
  function openEdit(u) {
    setEditingUser(u)
    setForm({ name: u.name, email: u.email, mobile: u.mobile || '', role: u.role, team: u.team, status: u.status, password: '', reportsTo: u.reportsTo || '', entities: parseEntities(u.entities) })
    setFormError('')
    setShowModal(true)
  }

  // ── Save (create or update) ────────────────────────────────────────────────
  function handleSave() {
    if (!form.name.trim())  { setFormError('Full name is required.'); return }
    if (!form.email.trim()) { setFormError('Email is required.'); return }
    if (!form.email.includes('@')) { setFormError('Enter a valid email address.'); return }
    if (!editingUser && !form.password) { setFormError('Password is required for new users.'); return }

    if (editingUser) {
      updateUser(editingUser.id, {
        name: form.name,
        email: form.email,
        mobile: form.mobile,
        role: form.role,
        team: form.team,
        status: form.status,
        reportsTo: form.reportsTo,
        entities: form.entities
      })
    } else {
      addUser({
        name: form.name,
        email: form.email,
        mobile: form.mobile,
        role: form.role,
        team: form.team,
        status: form.status,
        password: form.password,
        reportsTo: form.reportsTo,
        entities: form.entities
      })
    }
    setShowModal(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function handleDelete(u) {
    if (u.email === currentUser?.email) return // can't delete yourself
    setDeleteConfirm(u)
  }
  function confirmDelete() {
    deleteUser(deleteConfirm.id)
    if (selectedUser?.id === deleteConfirm.id) setSelectedUser(null)
    setDeleteConfirm(null)
  }

  // ── Promote / revoke Super Admin (Super Admin only) ────────────────────────
  const toggleSuperAdmin = async (u) => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/users/${u.id}/superadmin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ isSuperAdmin: !u.isSuperAdmin })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(`${u.name} ${!u.isSuperAdmin ? 'is now a Super Admin' : 'is no longer a Super Admin'}.`, 'success')
        fetchAllData()
      } else { showToast(data.error || 'Failed to update Super Admin.', 'error') }
    } catch { showToast('Network error.', 'error') }
  }

  // ── Toggle active/inactive ─────────────────────────────────────────────────
  function toggleStatus(u) {
    if (u.email === currentUser?.email) return
    updateUser(u.id, {
      status: u.status === 'Active' ? 'Inactive' : 'Active'
    })
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Role-based access control, teams &amp; hierarchy management</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManageTR(true)}
            className="flex items-center gap-1.5 text-sm text-purple-600 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-1.5"
          >
            <Shield size={14} /> Teams & Roles
          </button>
          <button
            onClick={() => setShowActivity(true)}
            className="flex items-center gap-1.5 text-sm text-primary-600 border border-primary-200 bg-primary-50 hover:bg-primary-100 rounded-lg px-3 py-1.5"
          >
            <Activity size={14} /> Activity Log
          </button>
          <button
            onClick={() => { setShowBulkModal(true); setBulkResult(null) }}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            <Upload size={14} /> Bulk Upload
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5"
          >
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Users', value: users.length, color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Active',      value: active,       color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Inactive',    value: inactive,     color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'Roles',       value: ROLES.length, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Logged-in admin badge */}
      {currentUser && (
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 w-fit">
          <Shield size={13} className="text-red-500" />
          Logged in as <strong className="text-gray-700">{currentUser.name}</strong>
          <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{currentUser.role}</span>
        </div>
      )}

      <div className="flex gap-4">
        {/* User table */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
              {tabs.map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filter === t ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search users..."
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-44" />
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary-50 border-b border-primary-100">
              <span className="text-xs font-medium text-primary-700">
                {selectedIds.length} user{selectedIds.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button onClick={() => bulkActivate('Active')}
                  className="text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg px-3 py-1 flex items-center gap-1">
                  <CheckCircle size={11} /> Activate
                </button>
                <button onClick={() => bulkActivate('Inactive')}
                  className="text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1 flex items-center gap-1">
                  <XCircle size={11} /> Deactivate
                </button>
                <div className="relative">
                  <button onClick={() => setShowBulkEnt(v => !v)}
                    className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-3 py-1">Set Entities</button>
                  {showBulkEnt && (
                    <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-60">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Grant entities to {selectedIds.length} user(s)</p>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {ENTITY_CODES.map(ent => {
                          const on = bulkEnt.includes(ent)
                          return (
                            <button key={ent} type="button"
                              onClick={() => setBulkEnt(p => on ? p.filter(e => e !== ent) : [...p, ent])}
                              className={`text-xs font-medium px-1.5 py-1 rounded border ${on ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                              {entityLabel(ent)}
                            </button>
                          )
                        })}
                      </div>
                      <button onClick={applyBulkEntities}
                        className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1.5 font-medium">Apply</button>
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedIds([])}
                  className="text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-1">Clear</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th w-10">
                    <input type="checkbox"
                      checked={selectedIds.length === filtered.length && filtered.length > 0}
                      onChange={selectAll}
                      className="w-4 h-4 rounded border-gray-300 text-primary-500" />
                  </th>
                  {['Name','Email','Mobile','Role','Team','Entities','Reports To','Status','Last Login','Actions'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const rc   = ROLE_COLORS[u.role] || ROLE_COLORS.Counselor
                  const self = u.email === currentUser?.email
                  const protectedTarget = u.role === 'Admin' || u.isSuperAdmin   // only a Super Admin may delete these
                  const iAmSuper = !!currentUser?.isSuperAdmin
                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${self ? 'bg-primary-50/30' : ''}`}>
                      <td className="table-td">
                        <input type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          disabled={self}
                          className="w-4 h-4 rounded border-gray-300 text-primary-500 disabled:opacity-30" />
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {initials(u.name)}
                          </div>
                          <div>
                            <span className="font-medium text-gray-800">{u.name}</span>
                            {self && <span className="ml-1 text-[10px] text-primary-500 font-semibold">(you)</span>}
                          </div>
                        </div>
                      </td>
                      <td className="table-td text-gray-600 text-xs">{u.email}</td>
                      <td className="table-td text-gray-600 text-xs">{u.mobile || <span className="text-gray-300">—</span>}</td>
                      <td className="table-td">
                        <span className={`badge ${rc.bg} ${rc.text}`}>{u.role}</span>
                        {u.isSuperAdmin && <span className="ml-1 badge bg-amber-100 text-amber-800 text-[9px] font-bold" title="Super Admin">SUPER</span>}
                      </td>
                      <td className="table-td text-gray-600">{u.team}</td>
                      <td className="table-td">
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {parseEntities(u.entities).map(e => (
                            <span key={e} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">{e}</span>
                          ))}
                        </div>
                      </td>
                      <td className="table-td text-gray-600 text-xs">{u.reportsTo || <span className="text-gray-300">—</span>}</td>
                      <td className="table-td">
                        <span className={`badge ${u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="table-td text-xs text-gray-500">{u.lastLogin}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                            className="p-1 rounded hover:bg-blue-50 text-blue-500" title="Permissions">
                            <Shield size={14} />
                          </button>
                          <button onClick={() => openEdit(u)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500" title="Edit">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleResetPassword(u)}
                            className="p-1 rounded hover:bg-yellow-50 text-yellow-500" title="Reset password (email new temp)">
                            <Key size={14} />
                          </button>
                          <button
                            onClick={() => updateUser(u.id, { excludeFromAssignment: !u.excludeFromAssignment })}
                            title={u.excludeFromAssignment ? 'Excluded from auto-assign — click to include' : 'Receiving auto-assign — click to exclude'}
                            className={`p-1 rounded ${u.excludeFromAssignment ? 'hover:bg-gray-100 text-gray-400' : 'hover:bg-green-50 text-green-500'}`}
                          >
                            {u.excludeFromAssignment ? <UserMinus size={14} /> : <UserCheck size={14} />}
                          </button>
                          <button
                            onClick={() => toggleStatus(u)}
                            disabled={self}
                            className={`p-1 rounded ${self ? 'opacity-30 cursor-not-allowed' : u.status === 'Active' ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-500'}`}
                            title={u.status === 'Active' ? 'Deactivate' : 'Activate'}
                          >
                            {u.status === 'Active' ? <XCircle size={14} /> : <CheckCircle size={14} />}
                          </button>
                          {iAmSuper && !self && (
                            <button
                              onClick={() => toggleSuperAdmin(u)}
                              title={u.isSuperAdmin ? 'Revoke Super Admin' : 'Make Super Admin'}
                              className={`p-1 rounded ${u.isSuperAdmin ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-100'}`}
                            >
                              <Crown size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={self || (protectedTarget && !iAmSuper)}
                            className={`p-1 rounded ${self || (protectedTarget && !iAmSuper) ? 'opacity-30 cursor-not-allowed' : 'hover:bg-red-50 text-red-500'}`}
                            title={self ? "Can't delete yourself" : (protectedTarget && !iAmSuper ? 'Only a Super Admin can delete an admin' : 'Delete user')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-400 text-sm">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Permissions panel */}
        {selectedUser && (
          <div className="w-72 bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">Permissions</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {initials(selectedUser.name)}
              </div>
              <div>
                <p className="font-medium text-gray-800 text-sm">{selectedUser.name}</p>
                <p className="text-xs text-gray-500">{selectedUser.role} · {selectedUser.team}</p>
              </div>
            </div>
            <div className="space-y-2">
              {(PERMISSIONS[selectedUser.role] || []).map(perm => (
                <div key={perm} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{perm}</span>
                  <CheckCircle size={14} className="text-green-500" />
                </div>
              ))}
            </div>
            <button
              onClick={() => openEdit(selectedUser)}
              className="mt-4 w-full btn-primary text-xs py-2"
            >
              Edit User
            </button>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                <AlertTriangle size={13} /> {formError}
              </div>
            )}

            <div className="space-y-3">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Enter full name"
                  className="input-field text-sm"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@cutm.ac.in"
                  className="input-field text-sm"
                  disabled={!!editingUser}
                />
                {editingUser && <p className="text-xs text-gray-400 mt-0.5">Email cannot be changed.</p>}
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="input-field text-sm"
                >
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">
                  Permissions: {(PERMISSIONS[form.role] || []).length} granted
                </p>
              </div>

              {/* Team */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Team *</label>
                <select
                  value={form.team}
                  onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                  className="input-field text-sm"
                >
                  {TEAMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Entity Access — which lead sets this user can view */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Entity Access <span className="text-[10px] text-gray-400">(which lead sets this user can view)</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ENTITY_CODES.map(ent => {
                    const on = form.entities.includes(ent)
                    return (
                      <button key={ent} type="button"
                        onClick={() => setForm(f => ({ ...f, entities: on ? f.entities.filter(e => e !== ent) : [...f.entities, ent] }))}
                        className={`text-xs font-medium px-2 py-1.5 rounded-lg border transition ${on ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {entityLabel(ent)}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">They see only their own assigned leads within these entities.</p>
              </div>

              {/* Reports To — Manager / Dean */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Reports To <span className="text-[10px] text-gray-400">(Manager / Dean)</span>
                </label>
                <select
                  value={form.reportsTo}
                  onChange={e => setForm(f => ({ ...f, reportsTo: e.target.value }))}
                  className="input-field text-sm"
                >
                  <option value="">— None (top level) —</option>
                  {users
                    .filter(u => ['Admin','Manager'].includes(u.role) && u.name !== form.name)
                    .map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5">Counsellor's reporting manager/dean — used for team-wise reporting.</p>
              </div>

              {/* Mobile (for WhatsApp alerts) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mobile Number
                  <span className="ml-1 text-[10px] text-green-600 font-medium">(for WhatsApp alerts)</span>
                </label>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                  placeholder="e.g. 9876543210"
                  className="input-field text-sm"
                />
                <p className="text-xs text-gray-400 mt-0.5">WhatsApp notifications will be sent to this number when a lead is assigned.</p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="input-field text-sm"
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>

              {/* Password (create only) */}
              {!editingUser && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    className="input-field text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={handleSave} className="flex-1 btn-primary text-sm flex items-center justify-center gap-1.5">
                <Save size={14} />
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Teams & Roles Manager Modal ─────────────────────────────────────── */}
      {showManageTR && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-purple-50">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Shield size={18} className="text-purple-600" /> Teams & Roles
              </h2>
              <button onClick={() => setShowManageTR(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-6">

              {/* TEAMS */}
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  👥 Teams ({teamsList.length})
                </h3>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text" value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    placeholder="e.g. International Admissions"
                    onKeyDown={e => e.key === 'Enter' && addTeam()}
                    className="flex-1 input-field text-sm"
                  />
                  <button onClick={addTeam}
                    className="bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold px-4 rounded-lg flex items-center gap-1.5">
                    <Plus size={14} /> Add Team
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {teamsList.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.memberCount || 0} member{t.memberCount === 1 ? '' : 's'}</p>
                      </div>
                      <button onClick={() => deleteTeam(t.id, t.name)}
                        className="text-red-400 hover:text-red-600 p-1" title="Delete team">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ROLES */}
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                  🔐 Roles ({rolesList.length})
                </h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input type="text" value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    placeholder="Role name (e.g. Senior Counselor)"
                    className="input-field text-sm" />
                  <input type="text" value={newRoleDesc}
                    onChange={e => setNewRoleDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="input-field text-sm" />
                </div>
                <button onClick={addRole}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 mb-3">
                  <Plus size={14} /> Add Custom Role
                </button>

                <div className="space-y-1.5">
                  {rolesList.map(r => (
                    <div key={r.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 ${r.isSystem ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{r.name}</p>
                          {r.isSystem && <span className="badge bg-blue-100 text-blue-700 text-[9px] font-bold">SYSTEM</span>}
                          <span className="text-[10px] text-gray-400">· {r.memberCount || 0} user{r.memberCount === 1 ? '' : 's'}</span>
                        </div>
                        {r.description && <p className="text-[10px] text-gray-500 mt-0.5">{r.description}</p>}
                      </div>
                      {!r.isSystem && (
                        <button onClick={() => deleteRole(r.id, r.name)}
                          className="text-red-400 hover:text-red-600 p-1" title="Delete role">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                💡 <strong>System roles</strong> (Admin / Manager / Counselor / Finance) cannot be deleted — they're wired into permission checks across the app. You can add custom roles for specialised positions.
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button onClick={() => setShowManageTR(false)} className="btn-secondary text-sm px-4 py-2">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Result Modal ─────────────────────────────────────── */}
      {resetResult && resetForUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Key size={18} className="text-yellow-500" /> Password Reset
              </h2>
              <button onClick={() => { setResetResult(null); setResetForUser(null) }}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-sm">
              <p className="font-semibold text-blue-800">{resetForUser.name}</p>
              <p className="text-xs text-blue-600 mt-0.5">{resetForUser.email}</p>
            </div>
            <p className="text-xs text-gray-500 mb-2">Temporary password (shown only once):</p>
            <div className="flex items-center gap-2 mb-4">
              <code className="flex-1 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 font-mono font-bold text-yellow-800 text-base text-center select-all">
                {resetResult.tempPassword}
              </code>
              <button onClick={() => {
                navigator.clipboard?.writeText(resetResult.tempPassword)
                alert('Copied to clipboard')
              }} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                <Copy size={14} />
              </button>
            </div>
            <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-2 mb-4">
              ✓ Also emailed to {resetResult.sentTo}
            </p>
            <button onClick={() => { setResetResult(null); setResetForUser(null) }}
              className="w-full btn-primary text-sm py-2">Done</button>
          </div>
        </div>
      )}

      {/* ── Activity Log Modal ──────────────────────────────────────────────── */}
      {showActivity && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-primary-50">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Activity size={18} className="text-primary-600" /> User Activity Log
              </h2>
              <button onClick={() => setShowActivity(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              {/* Recent Logins */}
              <div>
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock size={12} /> Recent Logins ({activity.recentLogins.length})
                </h3>
                <div className="space-y-1.5">
                  {activity.recentLogins.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No login activity yet</p>
                  ) : activity.recentLogins.map((u, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">
                          {initials(u.name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{u.name}</p>
                          <p className="text-[10px] text-gray-400">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`badge text-[10px] font-bold ${
                          u.role === 'Admin'     ? 'bg-red-100 text-red-700' :
                          u.role === 'Manager'   ? 'bg-purple-100 text-purple-700' :
                          u.role === 'Counselor' ? 'bg-blue-100 text-blue-700' :
                                                   'bg-green-100 text-green-700'
                        }`}>{u.role}</span>
                        <span className="text-[10px] text-gray-500 mt-1">{u.lastLogin}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent System Activity */}
              <div>
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Activity size={12} /> Recent Activity ({activity.activity.length})
                </h3>
                <div className="space-y-1">
                  {activity.activity.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No recent activity</p>
                  ) : activity.activity.map((a, i) => (
                    <div key={i} className="text-xs px-2 py-1.5 border-l-2 border-primary-200 bg-primary-50/30 ml-1">
                      <p className="text-gray-700">{a.text}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{a.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button onClick={() => setShowActivity(false)} className="btn-secondary text-sm px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Upload Modal ───────────────────────────────────────────────── */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-50 rounded-lg"><FileSpreadsheet size={18} className="text-primary-600" /></div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Bulk User Upload</h2>
                  <p className="text-xs text-gray-500">Upload CSV or Excel — existing emails are skipped</p>
                </div>
              </div>
              <button onClick={() => setShowBulkModal(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Download template */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                    <Download size={14} /> Download CSV Template
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Columns: Name, Email, Mobile, Role, Team, Password, Status
                  </p>
                </div>
                <button onClick={handleDownloadTemplate}
                  className="flex-shrink-0 flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 transition-colors font-medium">
                  <Download size={14} /> Template
                </button>
              </div>

              {/* Roles & valid values note */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Valid values:</p>
                <p><strong>Role:</strong> Admin · Manager · Counselor · Finance (default: Counselor)</p>
                <p><strong>Team:</strong> Management · Admissions · Sales · Marketing · Finance (default: Admissions)</p>
                <p><strong>Status:</strong> Active · Inactive (default: Active)</p>
                <p><strong>Password:</strong> Temporary password — user can change after first login</p>
              </div>

              {/* Drop zone */}
              {!bulkResult && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleBulkFile(e.dataTransfer.files?.[0]) }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'}`}
                >
                  {bulkUploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <span className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full" />
                      <p className="text-sm text-gray-500 font-medium">Uploading & creating users…</p>
                    </div>
                  ) : (
                    <>
                      <Upload size={36} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-sm font-semibold text-gray-600">Drag & drop or click to select file</p>
                      <p className="text-xs text-gray-400 mt-1">Supports .csv, .xlsx, .xls</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={e => handleBulkFile(e.target.files?.[0])} />
                </div>
              )}

              {/* Result */}
              {bulkResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-extrabold text-green-700">{bulkResult.inserted}</div>
                      <div className="text-xs text-green-600">Created</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-extrabold text-yellow-700">{bulkResult.skipped}</div>
                      <div className="text-xs text-yellow-600">Skipped</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-extrabold text-blue-700">{bulkResult.total}</div>
                      <div className="text-xs text-blue-600">Total Rows</div>
                    </div>
                  </div>
                  {bulkResult.errors?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Row errors (first 10):</p>
                      {bulkResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600">{e}</p>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setBulkResult(null)}
                    className="w-full text-sm text-primary-600 border border-primary-200 rounded-lg py-2 hover:bg-primary-50 transition-colors">
                    Upload Another File
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button onClick={() => setShowBulkModal(false)} className="btn-secondary text-sm px-4 py-2">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete User?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
