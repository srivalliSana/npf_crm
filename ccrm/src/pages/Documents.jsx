import React, { useState, useRef } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  FileText, Upload, CheckCircle, Clock, XCircle,
  Search, Download, Eye, X, Save,
  ExternalLink, AlertCircle, Trash2
} from 'lucide-react'

const STATUS_COLORS = {
  Verified: { bg: 'bg-green-100',  text: 'text-green-700',  icon: CheckCircle },
  Pending:  { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock       },
  Rejected: { bg: 'bg-red-100',    text: 'text-red-700',    icon: XCircle     },
}

const DOC_TYPES = [
  '10th Marksheet', '12th Marksheet', 'Graduation Certificate',
  'Aadhaar Card', 'PAN Card', 'Passport Photo', 'Transfer Certificate',
  'Migration Certificate', 'Character Certificate', 'Income Certificate',
  'Caste Certificate', 'Medical Certificate',
]

export default function Documents() {
  const { documents, updateDocStatus, uploadDocument, deleteDocument, leads, currentUser, showToast } = useCcrm()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showUpload, setShowUpload] = useState(false)
  const [viewDoc, setViewDoc] = useState(null) // document to preview
  const [deleteConfirm, setDeleteConfirm] = useState(null) // doc id to delete
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Upload Form state
  const [uploadForm, setUploadForm] = useState({
    student: '',
    type: '10th Marksheet',
    fileUrl: null
  })

  const tabs = ['All', 'Verified', 'Pending', 'Rejected']
  
  const filtered = documents.filter(d =>
    (filter === 'All' || d.status === filter) &&
    (d.student.toLowerCase().includes(search.toLowerCase()) || d.type.toLowerCase().includes(search.toLowerCase()))
  )

  const verified = documents.filter(d => d.status === 'Verified').length
  const pending  = documents.filter(d => d.status === 'Pending').length
  const rejected = documents.filter(d => d.status === 'Rejected').length

  const handleFileSelect = async (file) => {
    if (!file) return
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/jpg']
    if (!validTypes.includes(file.type)) {
      showToast('Only PDF, JPG, PNG files are supported.', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be under 5MB.', 'error')
      return
    }
    setSelectedFile(file)

    // Try backend upload
    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('document', file)
      const res = await fetch('/api/upload/document', { method: 'POST', body: formData })
      if (res.ok) {
        const { fileUrl } = await res.json()
        setUploadForm(p => ({ ...p, fileUrl }))
        showToast('File uploaded to server.', 'success')
      } else {
        // Fallback: create a local object URL for preview only
        const localUrl = URL.createObjectURL(file)
        setUploadForm(p => ({ ...p, fileUrl: localUrl }))
        showToast(`File ready: "${file.name}"`, 'info')
      }
    } catch {
      const localUrl = URL.createObjectURL(file)
      setUploadForm(p => ({ ...p, fileUrl: localUrl }))
      showToast(`File ready: "${file.name}"`, 'info')
    } finally {
      setUploading(false)
    }
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!uploadForm.student) {
      showToast('Please select a student lead.', 'error')
      return
    }
    if (!selectedFile && !uploadForm.fileUrl) {
      showToast('Please select a file to upload.', 'error')
      return
    }

    uploadDocument(uploadForm)
    setShowUpload(false)
    setSelectedFile(null)
    setUploadForm({
      student: '',
      type: '10th Marksheet',
      fileUrl: null
    })
  }

  const handleVerify = (id) => {
    updateDocStatus(id, 'Verified')
  }

  const handleReject = (id) => {
    updateDocStatus(id, 'Rejected')
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No document logs to export.', 'warning')
      return
    }
    const headers = ['Student Name', 'Document Type', 'Status', 'Upload Date']
    const rows = filtered.map(d => [
      d.student,
      d.type,
      d.status,
      d.uploadDate
    ])
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `documents_reconciliation_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported document verification records.', 'success')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Document Verification</h1>
          <p className="text-sm text-gray-500 mt-0.5">Collect, verify and manage student documents</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none">
            <Upload size={14} /> Upload Document
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Verified',  value: verified, color: 'text-green-600',  bg: 'bg-green-50',  icon: CheckCircle },
          { label: 'Pending',   value: pending,  color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock       },
          { label: 'Rejected',  value: rejected, color: 'text-red-600',    bg: 'bg-red-50',    icon: XCircle     },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
              <s.icon size={22} className={s.color} />
            </div>
            <div>
              <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Document checklist by student */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {leads.slice(0, 3).map(lead => {
          const studentDocs = documents.filter(d => d.student.toLowerCase() === lead.name.toLowerCase())
          const verifiedCount = studentDocs.filter(d => d.status === 'Verified').length
          return (
            <div key={lead.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800 text-sm truncate max-w-44">{lead.name}</p>
                  <p className="text-xs text-gray-500 font-semibold">{verifiedCount}/{studentDocs.length || 3} documents verified</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold shadow select-none">
                  {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
              </div>
              <div className="w-full bg-gray-150 rounded-full h-1.5 mb-3">
                <div className="bg-primary-500 h-1.5 rounded-full transition-all" style={{ width: `${(verifiedCount / Math.max(studentDocs.length || 3, 1)) * 100}%` }} />
              </div>
              <div className="space-y-1.5">
                {studentDocs.map(d => {
                  const sc = STATUS_COLORS[d.status] || STATUS_COLORS.Pending
                  return (
                    <div key={d.id} className="flex items-center justify-between py-0.5 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-600 font-medium truncate max-w-44">{d.type}</span>
                      <span className={`badge ${sc.bg} ${sc.text} text-[10px] font-bold`}>{d.status}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setFilter(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none ${filter === t ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-48" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Student Name','Document Type','Status','Upload Date','Actions'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const sc = STATUS_COLORS[d.status] || STATUS_COLORS.Pending
                return (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-semibold text-primary-600">{d.student}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400" />
                        {d.type}
                      </div>
                    </td>
                    <td className="table-td">
                      <span className={`badge ${sc.bg} ${sc.text}`}>{d.status}</span>
                    </td>
                    <td className="table-td text-gray-600">{d.uploadDate}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setViewDoc(d)} className="p-1 rounded hover:bg-blue-50 text-blue-500 focus:outline-none" title="View document"><Eye size={14} /></button>
                        {d.status !== 'Verified' && (
                          <button onClick={() => handleVerify(d.id)} className="p-1 rounded hover:bg-green-50 text-green-500 focus:outline-none" title="Verify">
                            <CheckCircle size={14} />
                          </button>
                        )}
                        {d.status !== 'Rejected' && (
                          <button onClick={() => handleReject(d.id)} className="p-1 rounded hover:bg-red-50 text-red-500 focus:outline-none" title="Reject">
                            <XCircle size={14} />
                          </button>
                        )}
                        {currentUser?.role === 'Admin' && (
                          <button onClick={() => setDeleteConfirm(d.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 focus:outline-none" title="Delete document">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                    No documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center"><Trash2 size={22} className="text-red-500" /></div>
              <h3 className="font-bold text-gray-900 text-base">Delete Document</h3>
              <p className="text-sm text-gray-500">This will permanently delete the document record. Cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary py-2 text-sm">Cancel</button>
              <button onClick={() => { deleteDocument(deleteConfirm); setDeleteConfirm(null) }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 text-sm font-semibold rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Upload Student Document</h2>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Select Student *</label>
                <select
                  value={uploadForm.student}
                  onChange={e => setUploadForm(p => ({ ...p, student: e.target.value }))}
                  className="input-field text-sm"
                  required
                >
                  <option value="">-- Choose student lead --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.name}>{l.name} ({l.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Document Type</label>
                <select
                  value={uploadForm.type}
                  onChange={e => setUploadForm(p => ({ ...p, type: e.target.value }))}
                  className="input-field text-sm"
                >
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Upload File *</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files?.[0]) }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center hover:border-primary-400 transition-colors cursor-pointer ${selectedFile ? 'border-green-400 bg-green-50/30' : 'border-gray-300'}`}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <svg className="animate-spin h-6 w-6 text-primary-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      <p className="text-xs text-primary-600 font-semibold">Uploading...</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center gap-1">
                      <CheckCircle size={22} className="text-green-500" />
                      <p className="text-xs text-green-700 font-semibold truncate max-w-full">{selectedFile.name}</p>
                      <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB — click to change</p>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                      <p className="text-xs text-gray-500 font-semibold">Click to upload or drag &amp; drop</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG up to 5MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files?.[0])}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setSelectedFile(null); setUploadForm({ student:'', type:'10th Marksheet', fileUrl: null }) }}
                  className="flex-1 btn-secondary text-sm py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Save size={15} /> Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {viewDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setViewDoc(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <FileText size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-sm text-gray-900">{viewDoc.type}</p>
                  <p className="text-xs text-gray-500">{viewDoc.student} · Uploaded: {viewDoc.uploadDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewDoc.fileUrl && (
                  <a
                    href={viewDoc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={13} /> Open
                  </a>
                )}
                <button onClick={() => setViewDoc(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="p-4 min-h-72 flex items-center justify-center bg-gray-50">
              {viewDoc.fileUrl ? (
                viewDoc.fileUrl.endsWith('.pdf') || viewDoc.fileUrl.includes('application/pdf') ? (
                  <iframe
                    src={viewDoc.fileUrl}
                    title="Document Preview"
                    className="w-full h-96 rounded-lg border border-gray-200"
                  />
                ) : (
                  <img
                    src={viewDoc.fileUrl}
                    alt={viewDoc.type}
                    className="max-h-96 max-w-full rounded-lg border border-gray-200 shadow-sm object-contain"
                    onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-gray-400 py-12">
                  <FileText size={48} className="opacity-25" />
                  <div className="text-center">
                    <p className="text-sm font-semibold">No file attached</p>
                    <p className="text-xs mt-1 text-gray-400">This document was registered without a file upload.</p>
                    <p className="text-xs mt-0.5 text-gray-400">Use the Upload Document button to attach a file.</p>
                  </div>
                </div>
              )}
              <div className="hidden flex-col items-center justify-center gap-3 text-gray-400 py-12">
                <AlertCircle size={40} className="text-orange-400" />
                <p className="text-sm font-medium text-orange-500">Could not load document preview.</p>
                {viewDoc.fileUrl && (
                  <a href={viewDoc.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 underline flex items-center gap-1">
                    <ExternalLink size={12}/> Open in new tab
                  </a>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <span className={`badge text-xs font-semibold ${
                  viewDoc.status === 'Verified' ? 'bg-green-100 text-green-700' :
                  viewDoc.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>{viewDoc.status}</span>
              </div>
              <div className="flex gap-2">
                {viewDoc.status !== 'Verified' && (
                  <button
                    onClick={() => { updateDocStatus(viewDoc.id, 'Verified'); setViewDoc(prev => ({...prev, status: 'Verified'})) }}
                    className="flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <CheckCircle size={13} /> Verify
                  </button>
                )}
                {viewDoc.status !== 'Rejected' && (
                  <button
                    onClick={() => { updateDocStatus(viewDoc.id, 'Rejected'); setViewDoc(prev => ({...prev, status: 'Rejected'})) }}
                    className="flex items-center gap-1 text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <XCircle size={13} /> Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
