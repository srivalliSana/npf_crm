import React, { useState, useEffect } from 'react'
import { RefreshCw, Upload, AlertCircle, User } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function UploadLogs() {
  const { currentUser, showToast } = useCcrm()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/upload-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setLogs(await res.json())
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error || 'Failed to load logs', 'error')
      }
    } catch (e) {
      showToast('Failed to load logs', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (currentUser && !['Admin', 'Manager'].includes(currentUser.role)) {
    return (
      <div className="p-6 bg-red-50 rounded-xl border border-red-200 m-6 flex items-center gap-3">
        <AlertCircle className="text-red-600" />
        <span className="text-red-800">Admin / Manager access required.</span>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Upload size={22} className="text-primary-500" /> Upload Logs
          </h1>
          <p className="text-gray-500 text-sm mt-1">Audit trail of bulk lead uploads — who uploaded, when, and the outcome.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Date &amp; Time</th>
                <th className="px-4 py-3 text-left">Uploaded By</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">File</th>
                <th className="px-4 py-3 text-right">Rows</th>
                <th className="px-4 py-3 text-right">Imported</th>
                <th className="px-4 py-3 text-right">Updated</th>
                <th className="px-4 py-3 text-right">Skipped</th>
                <th className="px-4 py-3 text-left">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                  <RefreshCw className="inline animate-spin mr-2" size={16} /> Loading...
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">No uploads recorded yet.</td></tr>
              ) : (
                logs.map(l => (
                  <tr key={l.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                      <User size={14} className="text-gray-400" /> {l.uploaderName || 'Unknown'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        l.uploaderRole === 'Admin' ? 'bg-red-100 text-red-700' :
                        l.uploaderRole === 'Manager' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>{l.uploaderRole || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={l.fileName}>{l.fileName || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{l.totalRows}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{l.imported}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">{l.updated}</td>
                    <td className="px-4 py-3 text-right font-medium text-amber-600">{l.skipped}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {l.assignedTo
                        ? <span className="text-violet-700 font-medium">{l.assignedTo}</span>
                        : <span className="text-gray-400">Unassigned</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && logs.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">Showing the most recent {logs.length} uploads.</p>
      )}
    </div>
  )
}
