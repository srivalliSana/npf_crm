import React, { useState, useRef } from 'react'
import { PhoneCall, Upload, Download, CheckCircle2, RefreshCw, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const STATUS_VALUES = ['Contacted', 'No Response', 'Not Interested', 'Follow Up', 'Interested']

export default function CallOutcomes() {
  const { currentUser, showToast, refreshCounselors } = useCcrm()
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const downloadTemplate = () => {
    const rows = [
      ['Name', 'Mobile', 'Status'],
      ['Ravi Kumar', '9876543210', 'Contacted'],
      ['Priya Sharma', '9876543211', 'Interested'],
      ['Anil Reddy', '9876543212', 'No Response'],
      ['Sita Devi', '9876543213', 'Follow Up'],
      ['Mohan Rao', '9876543214', 'Not Interested'],
    ]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'call-outcomes-template.csv'
    a.click()
  }

  const handleUpload = async () => {
    if (!file) return showToast('Please choose a file first.', 'error')
    setUploading(true)
    setResult(null)
    try {
      const token = localStorage.getItem('ccrm_token')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('uploaderRole', currentUser?.role || 'Admin')
      fd.append('uploaderName', currentUser?.name || '')
      const res = await fetch('/api/leads/call-outcomes-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult(data)
        showToast(`Done: ${data.updated} updated, ${data.created} created, ${data.skipped} skipped`, 'success')
        refreshCounselors?.()
      } else {
        showToast(data.error || 'Upload failed', 'error')
      }
    } catch (e) {
      showToast('Upload failed: ' + e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PhoneCall size={22} className="text-primary-500" /> Call Outcomes Upload
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload your day's call sheet. Existing leads are updated by mobile number; new numbers are added as fresh leads.
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Your file needs 3 columns: <span className="font-mono">Name</span>, <span className="font-mono">Mobile</span>, <span className="font-mono">Status</span></p>
            <p>Allowed <strong>Status</strong> values:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {STATUS_VALUES.map(s => (
                <span key={s} className="px-2 py-0.5 bg-white border border-blue-200 rounded text-xs font-medium text-blue-700">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Upload File</h2>
          <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700">
            <Download size={15} /> Download template
          </button>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 transition"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }}
          />
          <FileSpreadsheet size={32} className="mx-auto text-gray-400 mb-2" />
          {file ? (
            <p className="text-gray-800 font-medium">{file.name}</p>
          ) : (
            <p className="text-gray-500 text-sm">Click to choose a CSV or Excel file</p>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="w-full mt-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
        >
          {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Uploading...' : 'Upload Call Outcomes'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} className="text-green-500" />
            <h3 className="font-semibold text-gray-800">Upload Complete</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
              <p className="text-xs text-blue-600 mt-1">Updated</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{result.created}</p>
              <p className="text-xs text-green-600 mt-1">New leads</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
              <p className="text-xs text-amber-600 mt-1">Skipped</p>
            </div>
          </div>
          {result.skipReasons?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-600 uppercase mb-2">Why rows were skipped</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {result.skipReasons.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
