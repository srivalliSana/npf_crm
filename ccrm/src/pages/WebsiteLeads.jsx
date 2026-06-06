import React, { useState, useEffect } from 'react'
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function WebsiteLeads({ website }) {
  const { showToast } = useCcrm()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
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
  }, [page, search])

  const loadLeads = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('page', page)
      qs.set('limit', limit)
      if (search) qs.set('search', search)

      const res = await fetch(`${apiEndpoint}?${qs.toString()}`)
      if (!res.ok) throw new Error('Failed to load leads')
      const data = await res.json()
      setLeads(data.rows || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
      showToast(`Failed to load ${websiteLabel} leads: ${err.message}`, 'error')
    } finally {
      setLoading(false)
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{websiteLabel} Leads</h1>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          <Download size={16} /> Export
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">
                  <RefreshCw className="inline animate-spin mr-2" size={16} /> Loading...
                </td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">No leads found</td></tr>
              ) : (
                leads.map(lead => (
                  <tr key={lead.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">{lead.id}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{lead.full_name || lead.name}</td>
                    {website === 'gttech' ? (
                      <>
                        <td className="px-4 py-3 text-gray-600">{lead.organization_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.designation || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.industry_sector || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {Array.isArray(lead.interested_in) && lead.interested_in.length > 0
                            ? lead.interested_in.map((item, i) => <div key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded inline-block mr-1 mb-1">{item}</div>)
                            : '—'
                          }
                        </td>
                        <td className="px-4 py-3 text-gray-600">{lead.email || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-gray-600">{lead.email_id || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={lead.looking_for}>{lead.looking_for || '—'}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-gray-900">{lead.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        lead.status === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {lead.status || 'new'}
                      </span>
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
