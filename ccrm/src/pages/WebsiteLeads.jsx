import React, { useState, useEffect } from 'react'
import { Search, Download, Upload, RefreshCw, ChevronLeft, ChevronRight, UserCheck, Users, GitBranch, X } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import GTJourney from '../components/GTJourney'
import PageContainer from '../components/PageContainer'
import { Card, Button, Modal } from '../components/ui'

// GT entities sales funnel (in order) + off-ramps
const STATUS_OPTIONS = [
  'Not Contacted', 'Contacted', 'Interested', 'Further Discussion',
  'Quote Requested', 'PO Raised', 'Payment Done',
  'Invalid Number', 'Not Interested',
]
const STATUS_COLOR = {
  'Not Contacted':      'bg-gray-100 text-gray-600',
  'Contacted':          'bg-info-50 text-info-700',
  'Interested':         'bg-success-50 text-success-700',
  'Further Discussion': 'bg-warning-50 text-warning-700',
  'Quote Requested':    'bg-indigo-50 text-indigo-700',
  'PO Raised':          'bg-purple-50 text-purple-700',
  'Payment Done':       'bg-success-100 text-success-800',
  'Invalid Number':     'bg-danger-50 text-danger-600',
  'Not Interested':     'bg-danger-100 text-danger-700',
}

export default function WebsiteLeads({ website }) {
  const { showToast, counselors, currentUser, users } = useCcrm()
  const isPrivileged = ['Admin', 'Manager'].includes(currentUser?.role)
  // Assignable = active users granted THIS entity. Falls back to all counsellors if
  // nobody is granted it yet (so assignment is never blocked).
  const entityCode = String(website || '').toUpperCase()
  const grantedToEntity = (users || []).filter(u =>
    (u.status === 'Active' || !u.status) &&
    String(u.entities || '').split(',').map(s => s.trim().toUpperCase()).includes(entityCode)
  )
  const assignable = grantedToEntity.length ? grantedToEntity : (counselors || [])
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
  const [journeyLead, setJourneyLead] = useState(null)  // GT lead whose journey modal is open
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

      const token = localStorage.getItem('ccrm_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const res = await fetch(`${apiEndpoint}?${qs.toString()}`, { headers })
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
    if (allOnPageSelected) {
      setSelectedRows([])
    } else {
      setSelectedRows(leads.map(lead => lead.id))
    }
  }

  const [selectingAll, setSelectingAll] = useState(false)
  const allOnPageSelected = leads.length > 0 && leads.every(l => selectedRows.includes(l.id))
  const handleSelectAllMatching = async () => {
    setSelectingAll(true)
    try {
      const qs = new URLSearchParams()
      qs.set('idsOnly', '1')
      if (search) qs.set('search', search)
      if (assignFilter === 'assigned')        qs.set('owner', '!Unassigned')
      else if (assignFilter === 'unassigned') qs.set('owner', 'Unassigned')
      if (currentUser?.role) qs.set('requesterRole', currentUser.role)
      if (currentUser?.name) qs.set('requesterName', currentUser.name)

      const token = localStorage.getItem('ccrm_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const res = await fetch(`${apiEndpoint}?${qs.toString()}`, { headers })
      if (!res.ok) throw new Error('Failed to fetch matching leads')
      const data = await res.json()
      setSelectedRows(data.ids || [])
      showToast(`Selected all ${(data.ids || []).length} matching leads`, 'success')
    } catch (err) {
      showToast('Failed to select all leads.', 'error')
    } finally {
      setSelectingAll(false)
    }
  }

  const handleExport = async () => {
    try {
      setLoading(true)
      const qs = new URLSearchParams()
      qs.set('limit', '9999')
      if (search) qs.set('search', search)

      const token = localStorage.getItem('ccrm_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
      const apiEndpoint = `/api/${website}-leads`
      const res = await fetch(`${apiEndpoint}?${qs.toString()}`, { headers })

      if (!res.ok) {
        alert('Failed to export. Please try again.')
        return
      }

      const data = await res.json()
      const allLeads = data.rows || []

      let csvHeaders, csvRows

      if (website === 'gttech') {
        csvHeaders = ['ID', 'Full Name', 'Organization', 'Designation', 'Industry', 'Interested In', 'Email', 'Phone', 'Status', 'Created']
        csvRows = allLeads.map(lead => [
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
        csvRows = allLeads.map(lead => [
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
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + err.message)
    } finally {
      setLoading(false)
    }
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
    <PageContainer
      title={`${websiteLabel} Leads`}
      action={(
        <>
          <label title="Import from Excel/CSV"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${importing ? 'bg-gray-200 text-gray-500 cursor-wait' : 'bg-success-500 text-white hover:bg-success-600 cursor-pointer shadow-card'}`}>
            <Upload size={16} /> {importing ? 'Importing…' : 'Import'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
          <Button icon={Download} onClick={handleExport}>Export</Button>
        </>
      )}
    >
      {/* Search & Filters */}
      <Card className="p-4 mb-4 space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input-field pl-10"
            />
          </div>

          <select
            value={assignFilter}
            onChange={e => { setAssignFilter(e.target.value); setPage(1) }}
            className="input-field w-44"
          >
            <option value="all">All Leads</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        {/* "Select all N matching leads" — appears once every row on this page is checked */}
        {allOnPageSelected && selectedRows.length < total && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm bg-primary-50/60 border border-primary-100 rounded-lg">
            <span className="text-primary-800">All {leads.length} leads on this page are selected.</span>
            <button
              onClick={handleSelectAllMatching}
              disabled={selectingAll}
              className="text-primary-700 font-semibold underline hover:text-primary-900 disabled:opacity-50"
            >
              {selectingAll ? 'Selecting...' : `Select all ${total} leads matching this view`}
            </button>
          </div>
        )}

        {/* Bulk Assign — Admin/Manager only */}
        {isPrivileged && selectedRows.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-lg border border-primary-100">
            <span className="text-sm font-medium text-primary-900">
              {selectedRows.length === total ? `All ${total} selected` : `${selectedRows.length} selected`}
            </span>

            <select
              value={assignToUser}
              onChange={e => setAssignToUser(e.target.value)}
              className="px-3 py-1 text-sm border border-primary-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">Select faculty...</option>
              {assignable.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>

            <Button size="sm" icon={UserCheck} disabled={assigning || !assignToUser} onClick={handleAssignSelected} className="ml-auto">
              Assign
            </Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-primary-500"
                  />
                </th>
                <th className="table-th">#</th>
                <th className="table-th">
                  {website === 'gttech' ? 'Full Name' : 'Name'}
                </th>
                {website === 'gttech' ? (
                  <>
                    <th className="table-th">Organization</th>
                    <th className="table-th">Designation</th>
                    <th className="table-th">Industry</th>
                    <th className="table-th">Interested In</th>
                    <th className="table-th">Email</th>
                  </>
                ) : (
                  <>
                    <th className="table-th">Email</th>
                    <th className="table-th">Looking For</th>
                  </>
                )}
                <th className="table-th">Phone</th>
                <th className="table-th">Owner</th>
                <th className="table-th">Status</th>
                <th className="table-th">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-500">
                  <RefreshCw className="inline animate-spin mr-2 text-primary-500" size={16} /> Loading...
                </td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-500">No leads found</td></tr>
              ) : (
                leads.map((lead, i) => (
                  <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="table-td">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(lead.id)}
                        onChange={() => toggleRowSelect(lead.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-500"
                      />
                    </td>
                    <td className="table-td text-gray-500 font-mono text-xs">{(page - 1) * limit + i + 1}</td>
                    <td className="table-td text-gray-900 font-medium">{lead.full_name || lead.name}</td>
                    {website === 'gttech' ? (
                      <>
                        <td className="table-td text-gray-600">{lead.organization_name || '—'}</td>
                        <td className="table-td text-gray-600">{lead.designation || '—'}</td>
                        <td className="table-td text-gray-600">{lead.industry_sector || '—'}</td>
                        <td className="table-td text-gray-600">
                          {Array.isArray(lead.interested_in) && lead.interested_in.length > 0
                            ? lead.interested_in.slice(0, 2).map((item, i) => (
                              <span key={i} className="inline-block text-xs bg-info-100 text-info-700 px-2 py-1 rounded mr-1 mb-1">
                                {item}
                              </span>
                            ))
                            : '—'
                          }
                        </td>
                        <td className="table-td text-gray-600">{lead.email || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="table-td text-gray-600">{lead.email_id || '—'}</td>
                        <td className="table-td text-gray-600 max-w-xs truncate">{lead.looking_for || '—'}</td>
                      </>
                    )}
                    <td className="table-td text-gray-900">{lead.phone || '—'}</td>
                    <td className="table-td">
                      {isPrivileged ? (
                        <select
                          value={lead.owner || 'Unassigned'}
                          onChange={e => assignOne(lead.id, e.target.value)}
                          className="px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                        >
                          <option value="Unassigned">Unassigned</option>
                          {(() => {
                            const names = assignable.map(c => c.name)
                            const opts = lead.owner && !names.includes(lead.owner)
                              ? [{ id: 'cur', name: lead.owner }, ...assignable]
                              : assignable
                            return opts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                          })()}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-700">{lead.owner || '—'}</span>
                      )}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={STATUS_OPTIONS.includes(lead.status) ? lead.status : 'Not Contacted'}
                          onChange={e => updateStatus(lead.id, e.target.value)}
                          className={`px-2 py-1 text-xs font-medium border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-primary-400 ${STATUS_COLOR[lead.status] || 'bg-white text-gray-700'}`}
                        >
                          {(STATUS_OPTIONS.includes(lead.status) ? STATUS_OPTIONS : [lead.status, ...STATUS_OPTIONS].filter(Boolean)).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button onClick={() => setJourneyLead(lead)} title="View journey"
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-500">
                          <GitBranch size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="table-td text-gray-600 text-xs">
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <span className="text-sm text-gray-600">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      <p className="text-sm text-gray-500 mt-4">Total: {total} leads</p>

      {/* GT lead journey modal */}
      <Modal
        open={!!journeyLead}
        onClose={() => setJourneyLead(null)}
        title={journeyLead ? `${journeyLead.full_name || journeyLead.name} — Lead Journey` : ''}
        subtitle={journeyLead ? `${websiteLabel} · ${journeyLead.phone || '—'}${journeyLead.owner ? ` · ${journeyLead.owner}` : ''}` : ''}
        size="xl"
      >
        {journeyLead && (
          <>
            <GTJourney
              status={journeyLead.status}
              onSelect={async (s) => {
                await updateStatus(journeyLead.id, s)
                setJourneyLead(prev => prev ? { ...prev, status: s } : prev)
              }}
            />
            <p className="text-[11px] text-gray-400 mt-4">Click any stage to update this lead's status.</p>
          </>
        )}
      </Modal>
    </PageContainer>
  )
}
