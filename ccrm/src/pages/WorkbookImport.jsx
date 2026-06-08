import React, { useState, useRef } from 'react'
import { FileSpreadsheet, Upload, RefreshCw, AlertCircle, CheckCircle2, Layers } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

// Multi-sheet Admission Dashboard importer: each sheet = a program.
export default function WorkbookImport() {
  const { currentUser, showToast } = useCcrm()
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const handleUpload = async () => {
    if (!file) return showToast('Choose the workbook file first.', 'error')
    setUploading(true); setResult(null)
    try {
      const token = localStorage.getItem('ccrm_token')
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/leads/workbook-import', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult(data)
        showToast(`Imported: ${data.updated} updated, ${data.created} created`, 'success')
      } else {
        showToast(data.error || 'Import failed', 'error')
      }
    } catch (e) { showToast('Import failed: ' + e.message, 'error') }
    finally { setUploading(false) }
  }

  if (currentUser && !['Admin', 'Manager'].includes(currentUser.role)) {
    return (
      <div className="p-6 bg-red-50 rounded-xl border border-red-200 m-6 flex items-center gap-3">
        <AlertCircle className="text-red-600" /><span className="text-red-800">Admin / Manager access required.</span>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Layers size={22} className="text-primary-500" /> Admission Workbook Import
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload the full multi-sheet admission workbook. Every sheet is imported as a separate <strong>program</strong>.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">How it works</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Each <strong>sheet name</strong> becomes the lead's <strong>program</strong> (e.g. "B. Tech Dairy").</li>
              <li><strong>FACULTY/STAFF NAME WHO CALLED</strong> → owner (drives CUTM/CUTMAP automatically).</li>
              <li><strong>STATUS</strong> → stage (handles Intersted, Not Internsted, Not Reachable, Wrong Number, Not Called, etc.).</li>
              <li>Matches by <strong>mobile</strong> → updates the lead if it exists, else creates a new one.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 transition"
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }} />
          <FileSpreadsheet size={32} className="mx-auto text-gray-400 mb-2" />
          {file ? <p className="text-gray-800 font-medium">{file.name}</p>
                : <p className="text-gray-500 text-sm">Click to choose the workbook (.xlsx)</p>}
        </div>
        <button onClick={handleUpload} disabled={uploading || !file}
          className="w-full mt-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition">
          {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Importing all sheets…' : 'Import Workbook'}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} className="text-green-500" />
            <h3 className="font-semibold text-gray-800">Import Complete</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p><p className="text-xs text-blue-600 mt-1">Updated</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{result.created}</p><p className="text-xs text-green-600 mt-1">Created</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.skipped}</p><p className="text-xs text-amber-600 mt-1">Skipped</p>
            </div>
          </div>
          {result.perSheet?.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Program (sheet)</th>
                  <th className="px-3 py-2 text-right">Updated</th>
                  <th className="px-3 py-2 text-right">Created</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {result.perSheet.map(s => (
                  <tr key={s.program} className="border-b">
                    <td className="px-3 py-2 font-medium text-gray-800">{s.program}{s.empty && <span className="text-gray-400"> (empty)</span>}{s.error && <span className="text-red-500"> — {s.error}</span>}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{s.updated}</td>
                    <td className="px-3 py-2 text-right text-green-700">{s.created}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{s.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
