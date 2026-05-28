import React, { useState, useRef } from 'react'
import { GraduationCap, Search, CheckCircle, Clock, AlertCircle, FileText, CreditCard, Shield, Phone, Upload, ExternalLink, ChevronRight } from 'lucide-react'

const DOC_CHECKLIST = [
  '10th Marksheet', '12th Marksheet', 'Aadhaar Card',
  'Passport Photo', 'Transfer Certificate', 'Character Certificate'
]

const STAGE_ORDER = ['Unverified', 'Verified', 'Application Started', 'Payment Approved', 'Application Submitted', 'Enrolment']

const STAGE_COLORS = {
  'Unverified': 'bg-red-100 text-red-700',
  'Verified': 'bg-blue-100 text-blue-700',
  'Application Started': 'bg-yellow-100 text-yellow-700',
  'Payment Approved': 'bg-purple-100 text-purple-700',
  'Application Submitted': 'bg-green-100 text-green-700',
  'Enrolment': 'bg-emerald-100 text-emerald-700',
  'Enrolments': 'bg-emerald-100 text-emerald-700',
}

export default function StudentPortal() {
  const [query, setQuery] = useState({ mobile: '', appNo: '' })
  const [mode, setMode] = useState('mobile') // 'mobile' | 'appNo'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedDoc, setUploadedDoc] = useState(null)
  const fileRef = useRef(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    const val = mode === 'mobile' ? query.mobile.trim() : query.appNo.trim()
    if (!val) return setError('Please enter your ' + (mode === 'mobile' ? 'mobile number' : 'application number'))
    setError('')
    setLoading(true)
    try {
      const body = mode === 'mobile' ? { mobile: val } : { appNo: val }
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No application found. Please check your details.')
        setResult(null)
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const stageIdx = result ? STAGE_ORDER.indexOf(result.application?.stage?.replace('Enrolments', 'Enrolment')) : -1

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-primary-900">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center">
              <GraduationCap size={22} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold">CUTM Student Portal</div>
              <div className="text-slate-400 text-xs">Centurion University of Technology & Management</div>
            </div>
          </div>
          <a href="/apply" className="text-sm text-primary-300 hover:text-white">New Inquiry →</a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Search box */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 mb-6">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">Check Application Status</h1>
          <p className="text-slate-300 text-sm text-center mb-6">
            Track your CUEE 2026 application progress
          </p>

          {/* Toggle */}
          <div className="flex bg-white/10 rounded-xl p-1 mb-6">
            {['mobile', 'appNo'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setResult(null) }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${mode === m ? 'bg-white text-slate-800 shadow' : 'text-slate-300 hover:text-white'}`}
              >
                {m === 'mobile' ? '📱 Mobile Number' : '📄 Application No.'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                {mode === 'mobile' ? 'Registered Mobile Number' : 'Application Number'}
              </label>
              <input
                type={mode === 'mobile' ? 'tel' : 'text'}
                value={mode === 'mobile' ? query.mobile : query.appNo}
                onChange={e => setQuery(prev => mode === 'mobile' ? { ...prev, mobile: e.target.value } : { ...prev, appNo: e.target.value })}
                placeholder={mode === 'mobile' ? 'Enter 10-digit mobile' : 'e.g. CUEE20261234'}
                className="w-full bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                maxLength={mode === 'mobile' ? 10 : 20}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/40 text-red-200 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-400 disabled:bg-primary-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition"
            >
              {loading ? <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <Search size={18} />}
              {loading ? 'Searching...' : 'Check Status'}
            </button>
          </form>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Application Card */}
            <div className="bg-white rounded-2xl p-6 shadow-xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{result.application.name}</h2>
                  <div className="text-slate-500 text-sm mt-1 space-y-0.5">
                    <div>📋 App No: <span className="font-mono font-semibold">{result.application.appNo}</span></div>
                    <div>🎓 Course: {result.application.course}</div>
                    <div>🏫 Campus: {result.application.campus}</div>
                    <div>📅 Applied: {result.application.date}</div>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STAGE_COLORS[result.application.stage] || 'bg-slate-100 text-slate-600'}`}>
                  {result.application.stage}
                </span>
              </div>

              {/* Progress Steps */}
              <div className="mb-6">
                <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Application Progress</p>
                <div className="flex items-center">
                  {STAGE_ORDER.map((stage, i) => {
                    const done = i < stageIdx + 1
                    const current = i === stageIdx
                    return (
                      <React.Fragment key={stage}>
                        <div className="flex flex-col items-center flex-1">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                            done ? 'bg-primary-500 border-primary-500 text-white' :
                            current ? 'border-primary-500 text-primary-500 bg-primary-50' :
                            'border-slate-200 text-slate-400 bg-white'
                          }`}>
                            {done && !current ? '✓' : i + 1}
                          </div>
                          <span className={`text-[9px] mt-1 text-center leading-tight ${done ? 'text-primary-600 font-semibold' : 'text-slate-400'}`}>
                            {stage.replace('Application ', '')}
                          </span>
                        </div>
                        {i < STAGE_ORDER.length - 1 && (
                          <div className={`h-0.5 w-4 mb-4 flex-shrink-0 ${i < stageIdx ? 'bg-primary-500' : 'bg-slate-200'}`} />
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 flex items-center gap-3 ${result.application.formStatus === 'Complete' ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}>
                  <FileText size={18} className={result.application.formStatus === 'Complete' ? 'text-green-600' : 'text-yellow-600'} />
                  <div>
                    <div className="text-xs text-slate-500">Form Status</div>
                    <div className={`text-sm font-semibold ${result.application.formStatus === 'Complete' ? 'text-green-700' : 'text-yellow-700'}`}>{result.application.formStatus}</div>
                  </div>
                </div>
                <div className={`rounded-xl p-3 flex items-center gap-3 ${result.application.payStatus === 'Payment Approved' || result.application.payStatus === 'Approved' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                  <CreditCard size={18} className={result.application.payStatus?.includes('Approved') ? 'text-green-600' : 'text-red-500'} />
                  <div>
                    <div className="text-xs text-slate-500">Payment</div>
                    <div className={`text-sm font-semibold ${result.application.payStatus?.includes('Approved') ? 'text-green-700' : 'text-red-600'}`}>{result.application.payStatus}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Info */}
            {result.payment && (
              <div className="bg-white rounded-2xl p-6 shadow-xl">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                  <CreditCard size={18} className="text-primary-500" /> Payment Details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500">Amount</span><div className="font-bold text-slate-800">₹{(result.payment.amount || 25000).toLocaleString('en-IN')}</div></div>
                  <div><span className="text-slate-500">Status</span><div className={`font-bold ${result.payment.status === 'Approved' ? 'text-green-600' : result.payment.status === 'Pending' ? 'text-yellow-600' : 'text-red-600'}`}>{result.payment.status}</div></div>
                  {result.payment.txnId && <div><span className="text-slate-500">Txn ID</span><div className="font-mono font-semibold text-slate-700">{result.payment.txnId}</div></div>}
                  {result.payment.date && <div><span className="text-slate-500">Date</span><div className="font-semibold text-slate-700">{result.payment.date}</div></div>}
                </div>
                {result.payment.status !== 'Approved' && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-sm text-yellow-700">
                    ⚠️ Payment is pending. Please contact admissions to complete your registration.
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            {result.documents?.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-xl">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
                  <Shield size={18} className="text-primary-500" /> Document Verification
                </h3>
                <div className="space-y-2">
                  {result.documents.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-slate-700">{doc.type}</div>
                        <div className="text-xs text-slate-400">Uploaded: {doc.uploadDate}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        doc.status === 'Verified' ? 'bg-green-100 text-green-700' :
                        doc.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {doc.status === 'Verified' ? '✓ ' : doc.status === 'Rejected' ? '✗ ' : '⏳ '}{doc.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pay Now — only when payment pending */}
            {result.payment && result.payment.status !== 'Approved' && (
              <div className="bg-white rounded-2xl p-6 shadow-xl border-2 border-yellow-200">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
                  <CreditCard size={18} className="text-yellow-500" /> Complete Your Payment
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Application fee of <strong className="text-gray-800">₹{Number(result.payment.amount || 25000).toLocaleString('en-IN')}</strong> is pending. Pay online to confirm your seat.
                </p>
                <a href="https://cutm.ac.in/admission/fee"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 rounded-xl text-sm transition">
                  <CreditCard size={16} /> Pay Now — ₹{Number(result.payment.amount || 25000).toLocaleString('en-IN')}
                  <ExternalLink size={13} />
                </a>
                <p className="text-xs text-gray-400 text-center mt-2">Secure payment via Razorpay / PayU · UPI, Net Banking, Cards accepted</p>
              </div>
            )}

            {/* Document Upload */}
            <div className="bg-white rounded-2xl p-6 shadow-xl">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-1">
                <Upload size={18} className="text-primary-500" /> Upload Documents
              </h3>
              <p className="text-xs text-slate-500 mb-4">Upload your documents for verification. Accepted: PDF, JPG, PNG (max 5 MB each).</p>

              {/* Required checklist */}
              <div className="grid grid-cols-2 gap-1.5 mb-4">
                {DOC_CHECKLIST.map(doc => {
                  const uploaded = result.documents?.some(d => d.type === doc)
                  return (
                    <div key={doc} className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg border ${uploaded ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      {uploaded ? <CheckCircle size={12} className="text-green-500 flex-shrink-0" /> : <Clock size={12} className="text-slate-400 flex-shrink-0" />}
                      <span className="truncate">{doc}</span>
                    </div>
                  )
                })}
              </div>

              {uploadedDoc && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700 font-medium mb-3 flex items-center gap-2">
                  <CheckCircle size={15} /> {uploadedDoc} uploaded successfully!
                </div>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-400 text-white font-semibold py-3 rounded-xl text-sm transition">
                {uploading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Upload size={16} />}
                {uploading ? 'Uploading...' : 'Select & Upload Document'}
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { alert('File must be under 5MB.'); return }
                  setUploading(true)
                  try {
                    const fd = new FormData()
                    fd.append('document', file)
                    fd.append('student', result.application.name)
                    fd.append('appNo', result.application.appNo)
                    fd.append('type', file.name.split('.')[0].replace(/_/g, ' '))
                    await fetch('/api/upload/document', { method: 'POST', body: fd })
                    setUploadedDoc(file.name)
                  } catch {}
                  setUploading(false)
                  e.target.value = ''
                }}
              />
            </div>

            {/* Contact */}
            <div className="bg-primary-600 rounded-2xl p-6 text-white text-center">
              <p className="font-semibold mb-1">Need Help?</p>
              <p className="text-primary-100 text-sm mb-3">Our admissions team is available Mon–Sat, 9 AM – 6 PM</p>
              <a href="tel:+916742559441" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-5 py-2 rounded-xl text-sm hover:bg-primary-50 transition">
                <Phone size={16} /> Call Admissions
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
