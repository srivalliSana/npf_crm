import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { GraduationCap, Upload, CheckCircle, Clock, AlertCircle } from 'lucide-react'

const REQUIRED = [
  '10th Marksheet', '12th Marksheet', 'Aadhar Card', 'Passport Photo',
  'Transfer Certificate', 'Migration Certificate', 'Caste Certificate',
  'Income Certificate', 'Character Certificate', 'Medical Certificate'
]

export default function DocumentUpload() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [link, setLink] = useState(null)
  const [docType, setDocType] = useState(REQUIRED[0])
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState([])
  const fileRef = useRef(null)

  useEffect(() => {
    fetch(`/api/document-upload/${token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Invalid or expired link.')
        setLink(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const handleFile = async (file) => {
    if (!file) return
    const valid = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!valid.includes(file.type)) return setError('Only PDF/JPG/PNG files are supported.')
    if (file.size > 5 * 1024 * 1024) return setError('File must be under 5MB.')
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', docType)
      const res = await fetch(`/api/document-upload/${token}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed.')
      setUploaded(prev => [...prev, docType])
    } catch (e) {
      setError(e.message)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-primary-900">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold">CUTM Admissions</div>
            <div className="text-slate-400 text-xs">Document Upload</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {loading ? (
          <div className="text-center text-slate-300 py-20">
            <span className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full inline-block" />
          </div>
        ) : !link ? (
          <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
            <AlertCircle size={28} className="text-red-500 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-slate-800 mb-1">Link Invalid or Expired</h1>
            <p className="text-sm text-slate-500">{error || 'Please contact your counsellor for a new upload link.'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <h1 className="text-xl font-bold text-slate-800">Upload Your Documents</h1>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              Hi {link.lead_name}, upload each required document below. Accepted: PDF, JPG, PNG (max 5MB each).
            </p>

            <div className="grid grid-cols-2 gap-1.5 mb-5">
              {REQUIRED.map(doc => {
                const done = uploaded.includes(doc)
                return (
                  <div key={doc} className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg border ${done ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    {done ? <CheckCircle size={12} className="text-green-500 flex-shrink-0" /> : <Clock size={12} className="text-slate-400 flex-shrink-0" />}
                    <span className="truncate">{doc}</span>
                  </div>
                )
              })}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-4">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
                {REQUIRED.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white font-semibold py-3 rounded-xl text-sm transition"
            >
              {uploading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Upload size={16} />}
              {uploading ? 'Uploading...' : `Upload ${docType}`}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />

            <p className="text-xs text-slate-400 text-center mt-4">
              Your counsellor will verify each document and let you know if anything needs to be re-uploaded.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
