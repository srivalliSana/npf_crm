import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  Users, Plus, Search, Shield, Edit, Trash2,
  CheckCircle, XCircle, Key, X, Save, AlertTriangle,
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

const ROLES  = ['Admin','Manager','Counselor','Finance']
const TEAMS  = ['Management','Admissions','Sales','Marketing','Finance']
const EMPTY_FORM = { name: '', email: '', role: 'Counselor', team: 'Admissions', status: 'Active', password: '' }

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function UserManagement({ currentUser }) {
  const { users, addUser, updateUser, deleteUser } = useCcrm()
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('All')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showModal, setShowModal]     = useState(false)
  const [editingUser, setEditingUser] = useState(null)   // null = create, object = edit
  const [form, setForm]               = useState(EMPTY_FORM)
  const [formError, setFormError]     = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null) // user to delete

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
    setForm({ name: u.name, email: u.email, role: u.role, team: u.team, status: u.status, password: '' })
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
        role: form.role,
        team: form.team,
        status: form.status
      })
    } else {
      addUser({
        name: form.name,
        email: form.email,
        role: form.role,
        team: form.team,
        status: form.status,
        password: form.password
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
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5"
        >
          <Plus size={14} /> Add User
        </button>
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

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Name','Email','Role','Team','Status','Last Login','Actions'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const rc   = ROLE_COLORS[u.role] || ROLE_COLORS.Counselor
                  const self = u.email === currentUser?.email
                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${self ? 'bg-primary-50/30' : ''}`}>
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
                      <td className="table-td">
                        <span className={`badge ${rc.bg} ${rc.text}`}>{u.role}</span>
                      </td>
                      <td className="table-td text-gray-600">{u.team}</td>
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
                          <button
                            onClick={() => toggleStatus(u)}
                            disabled={self}
                            className={`p-1 rounded ${self ? 'opacity-30 cursor-not-allowed' : u.status === 'Active' ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-500'}`}
                            title={u.status === 'Active' ? 'Deactivate' : 'Activate'}
                          >
                            {u.status === 'Active' ? <XCircle size={14} /> : <CheckCircle size={14} />}
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={self}
                            className={`p-1 rounded ${self ? 'opacity-30 cursor-not-allowed' : 'hover:bg-red-50 text-red-500'}`}
                            title={self ? "Can't delete yourself" : 'Delete user'}
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
                    <td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No users found.</td>
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
