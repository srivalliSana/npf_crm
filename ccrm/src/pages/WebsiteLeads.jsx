import React, { useState, useEffect } from 'react'
import { Search, Download, Upload, RefreshCw, ChevronLeft, ChevronRight, UserCheck, Users } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const STATUS_OPTIONS = ['New', 'Contacted', 'Interested', 'Follow Up', 'Not Interested', 'Converted', 'Closed']

export default function WebsiteLeads({ website }) {
  const { showToast, counselors, currentUser } = useCcrm()
  const isPrivileged = ['Admin', 'Manager'].includes(currentUser?.role)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedRows, setSelectedRows] = useState([])
  const [assignFilter, setAssignFilter] = useState('all') // all, assigned, unassigned
  const [assignToUser, setAssignToUser] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [importing, setImporting] = useState(false)
  const limit = 25
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const apiEndpoint = {
    ftl: '/api/ftl-leads',
    gtib: '/api/gtib-leads',
    gttech: '/api/gttech-leads',
    esse: '/api/esse-leads'
  }[website]

  const websiteLabel = {
    ftl: 'FTL',
    gtib: 'GTIB',
    gttech: 'GTTECH',
    esse: 'ESSE'
  }[website]

  useEffect(() => {
    loadLeads()
  }, [page, search, assignFilter])

  const loadLeads = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('page', page)
      qs.set('limit', limit)
      if (search) qs.set('search', search)
      if (assignFilter === 'assigned')        qs.set('owner', '!Unassigned')
      else if (assignFilter === 'unassigned') qs.set('owner', 'Unassigned')
      // Counsellors are scoped server-side to GT leads assigned to them
      if (currentUser?.role) qs.set('requesterRole', currentUser.role)
      if (currentUser?.name) qs.set('requesterName', currentUser.name)

      const res = await fetch(`${apiEndpoint}?${qs.toString()}`)
      if (!res.ok) throw new Error('Failed to load leads')
      const data = await res.json()
      setLeads(data.rows || [])
      setTotal(data.total || 0)
      setSelectedRows([])
    } catch (err) {
      console.error(err)
      showToast(`Failed to load ${websiteLabel} leads: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAssignSelected = async () => {
    if (selectedRows.length === 0) {
      showToast('No leads selected', 'error')
      return
    }
    if (!assignToUser) {
      showToast('Please select a counselor', 'error')
      return
    }

    setAssigning(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/website-leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ website, ids: selectedRows, owner: assignToUser })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(`Assigned ${data.assigned} lead(s) to ${assignToUser}`, 'success')
        setSelectedRows([])
        setAssignToUser('')
        await loadLeads()
      } else {
        showToast(data.error || 'Assignment failed', 'error')
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAssigning(false)
    }
  }

  const assignOne = async (id, owner) => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/website-leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ website, ids: [id], owner: owner === 'Unassigned' ? '' : owner })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(owner === 'Unassigned' ? 'Lead unassigned' : `Assigned to ${owner}`, 'success')
        await loadLeads()
      } else {
        showToast(data.error || 'Assignment failed', 'error')
      }
    } catch {
      showToast('Assignment error', 'error')
    }
  }

  const updateStatus = async (id, status) => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/website-leads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ website, ids: [id], status })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(`Status updated to ${status}`, 'success')
        await loadLeads()
      } else {
        showToast(data.error || 'Status update failed', 'error')
      }
    } catch {
      showToast('Status update error', 'error')
    }
  }

  const toggleRowSelect = (leadId) => {
    setSelectedRows(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedRows.length === leads.length) {
      setSelectedRows([])
    } else {
      setSelectedRows(leads.map(lead => lead.id))
    }
  }

  const handleExport = () => {
    let csvHeaders, csvRows

    if (website === 'gttech') {
      csvHeaders = ['ID', 'Full Name', 'Organization', 'Designation', 'Industry', 'Interested In', 'Email', 'Phone', 'Status', 'Created']
      csvRows = leads.map(lead => [
        lead.id,
        lead.full_name,
        lead.organization_name || '',
        lead.designation || '',
        lead.industry_sector || '',
        Array.isArray(lead.interested_in) ? lead.interested_in.join('; ') : '',
        lead.email || '',
        lead.phone || '',
        lead.status,
        lead.created_at
      ])
    } else {
      csvHeaders = ['ID', 'Name', 'Email', 'Phone', 'Looking For', 'Status', 'Created']
      csvRows = leads.map(lead => [
        lead.id,
        lead.name,
        lead.email_id || '',
        lead.phone || '',
        lead.looking_for || '',
        lead.status,
        lead.created_at
      ])
    }

    const csv = [csvHeaders.join(','), ...csvRows.map(row => row.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${website}-leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // allow re-importing the same file
    if (!file) return
    setImporting(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('website', website)
      const res = await fetch('/api/website-leads/import', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: fd
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(`Imported ${data.inserted} ${websiteLabel} lead(s)${data.skipped ? `, ${data.skipped} skipped (invalid phone)` : ''}.`, 'success')
        setPage(1); loadLeads()
      } else {
        showToast(data.error || 'Import failed.', 'error')
      }
    } catch {
      showToast('Import network error.', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{websiteLabel} Leads</h1>
        <div className="flex items-center gap-2">
          <label title="Import from Excel/CSV"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${importing ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'}`}>
            <Upload size={16} /> {importing ? 'Importing…' : 'Import'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={assignFilter}
            onChange={e => { setAssignFilter(e.target.value); setPage(1) }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Leads</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        {/* Bulk Assign — Admin/Manager only */}
        {isPrivileged && selectedRows.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <span className="text-sm font-medium text-blue-900">
              {selectedRows.length} selected
            </span>

            <select
              value={assignToUser}
              onChange={e => setAssignToUser(e.target.value)}
              className="px-3 py-1 text-sm border border-blue-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select counselor...</option>
              {counselors?.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>

            <button
              onClick={handleAssignSelected}
              disabled={assigning || !assignToUser}
              className="ml-auto px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <UserCheck size={14} />
              Assign
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === leads.length && leads.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">ID</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  {website === 'gttech' ? 'Full Name' : 'Name'}
                </th>
                {website === 'gttech' ? (
                  <>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Organization</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Designation</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Industry</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Interested In</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Looking For</th>
                  </>
                )}
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Phone</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Owner</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-500">
                  <RefreshCw className="inline animate-spin mr-2" size={16} /> Loading...
                </td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-500">No leads found</td></tr>
              ) : (
                leads.map(lead => (
                  <tr key={lead.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(lead.id)}
                        onChange={() => toggleRowSelect(lead.id)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">{lead.id}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{lead.full_name || lead.name}</td>
                    {website === 'gttech' ? (
                      <>
                        <td className="px-4 py-3 text-gray-600">{lead.organization_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.designation || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.industry_sector || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {Array.isArray(lead.interested_in) && lead.interested_in.length > 0
                            ? lead.interested_in.slice(0, 2).map((item, i) => (
                              <span key={i} className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mr-1 mb-1">
                                {item}
                              </span>
                            ))
                            : '—'
                          }
                        </td>
                        <td className="px-4 py-3 text-gray-600">{lead.email || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-gray-600">{lead.email_id || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{lead.looking_for || '—'}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-gray-900">{lead.phone || '—'}</td>
                    <td className="px-4 py-3">
                      {isPrivileged ? (
                        <select
                          value={lead.owner || 'Unassigned'}
                          onChange={e => assignOne(lead.id, e.target.value)}
                          className="px-2 py-1 text-xs border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="Unassigned">Unassigned</option>
                          {counselors?.map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-700">{lead.owner || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={STATUS_OPTIONS.includes(lead.status) ? lead.status : 'New'}
                        onChange={e => updateStatus(lead.id, e.target.value)}
                        className="px-2 py-1 text-xs border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {(STATUS_OPTIONS.includes(lead.status) ? STATUS_OPTIONS : [lead.status, ...STATUS_OPTIONS].filter(Boolean)).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
            <span className="text-sm text-gray-600">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-500 mt-4">Total: {total} leads</p>
    </div>
  )
}
