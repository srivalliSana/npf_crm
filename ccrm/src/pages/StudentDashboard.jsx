import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, AlertCircle, CheckCircle2, Clock, FileText, Award, Loader,
  Upload, IndianRupee, ShieldCheck
} from 'lucide-react'
import { getUrlTenantSlug } from '../tenantSlug'

// Loads Razorpay's Checkout script once and reuses it — the widget itself
// is only ever needed on CU EDU's booking-fee step.
let razorpayScriptPromise = null
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true)
  if (razorpayScriptPromise) return razorpayScriptPromise
  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
  return razorpayScriptPromise
}

const DOC_LABELS = {
  '10th Marksheet': '10th Marksheet',
  '12th Marksheet': '12th Marksheet',
  'Graduation Marksheet': 'Graduation Marksheet',
  'ID Proof': 'Government ID Proof',
  'Passport Photo': 'Passport Photo',
  'Transfer Certificate': 'Transfer Certificate',
  'Migration Certificate': 'Migration Certificate',
  'Caste Certificate': 'Caste Certificate',
}

function authHeaders(json = true) {
  const token = localStorage.getItem('student_token')
  return json
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { Authorization: `Bearer ${token}` }
}

// One fee's card: shows amount, status, and — while it's payable — a UTR
// submission form. Staff still approve the payment on their existing
// Payments page; this only ever submits proof, never marks itself paid.
function FeeCard({ title, blurb, amount, status, onSubmit, submitting }) {
  const [utr, setUtr] = useState('')
  const isPaid = status === 'Paid'
  const isPending = status === 'Payment Done'

  return (
    <div className={`border rounded-lg p-4 ${!amount && amount !== 0 ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{blurb}</p>
        </div>
        {isPaid ? <CheckCircle2 size={22} className="text-green-600 flex-shrink-0" /> : <Clock size={22} className="text-yellow-600 flex-shrink-0" />}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-3">₹{Number(amount || 0).toLocaleString('en-IN')}</p>

      {isPaid && <p className="text-sm text-green-700 font-medium">✓ Paid and approved</p>}
      {isPending && <p className="text-sm text-amber-700 font-medium">Submitted — awaiting admin approval</p>}
      {!isPaid && !isPending && (
        <div className="flex gap-2">
          <input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="UTR / transaction reference number"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
          <button
            onClick={() => utr.trim() && onSubmit(utr.trim())}
            disabled={submitting || !utr.trim()}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
          >
            {submitting ? <Loader size={15} className="animate-spin" /> : <IndianRupee size={15} />}
            Submit
          </button>
        </div>
      )}
    </div>
  )
}

function DocRow({ type, mandatory, uploaded, status, onUpload, uploading }) {
  const inputRef = React.useRef(null)
  const badge = status === 'Verified'
    ? <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Verified</span>
    : status === 'Rejected'
      ? <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Rejected — re-upload</span>
      : uploaded
        ? <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Pending review</span>
        : <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Not uploaded</span>

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{DOC_LABELS[type] || type}{mandatory && <span className="text-red-500 ml-1">*</span>}</p>
      </div>
      <div className="flex items-center gap-3">
        {badge}
        <input ref={inputRef} type="file" hidden onChange={(e) => e.target.files[0] && onUpload(type, e.target.files[0])} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading === type}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
        >
          {uploading === type ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploaded || status === 'Rejected' ? 'Re-upload' : 'Upload'}
        </button>
      </div>
    </div>
  )
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const tenantSlug = getUrlTenantSlug()
  const isCuEdu = tenantSlug === 'cuedu'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [submittingFee, setSubmittingFee] = useState(null)
  const [uploadingDoc, setUploadingDoc] = useState(null)
  const [payingGateway, setPayingGateway] = useState(false)
  const [toast, setToast] = useState('')

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('student_token')
      if (!token) { navigate('/student-login'); return }
      const res = await fetch('/api/student-portal', { headers: authHeaders(false) })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { navigate('/student-login'); return }
        throw new Error('Failed to fetch your application data.')
      }
      setData(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const submitPayment = async (feeType, amount, utrNumber) => {
    setSubmittingFee(feeType)
    try {
      const res = await fetch('/api/student-portal/submit-payment', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ feeType, utrNumber, amount })
      })
      const d = await res.json()
      if (!res.ok) { flash(`❌ ${d.error}`); return }
      flash('✅ Payment submitted — the admissions team will review it shortly.')
      fetchData()
    } catch {
      flash('❌ Network error — please try again.')
    } finally {
      setSubmittingFee(null)
    }
  }

  // CU EDU only — a real Razorpay checkout instead of the UTR-then-review
  // flow: order created server-side, and the resulting signature is verified
  // server-side too before anything is marked paid (never trusted from here).
  const payViaGateway = async () => {
    setPayingGateway(true)
    try {
      const ok = await loadRazorpayScript()
      if (!ok) { flash('❌ Could not load the payment window. Check your connection and try again.'); return }

      const orderRes = await fetch('/api/student-portal/create-payment-order', { method: 'POST', headers: authHeaders() })
      const order = await orderRes.json()
      if (!orderRes.ok) { flash(`❌ ${order.error}`); return }

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'CU EDU Admissions',
        description: 'Application entry fee',
        prefill: { name: order.name, email: order.email },
        handler: async (response) => {
          try {
            const verifyRes = await fetch('/api/student-portal/verify-payment', {
              method: 'POST', headers: authHeaders(), body: JSON.stringify(response)
            })
            const v = await verifyRes.json()
            if (!verifyRes.ok) { flash(`❌ ${v.error}`); return }
            flash('✅ Payment received — your portal is now unlocked.')
            fetchData()
          } catch {
            flash('❌ Payment went through, but confirming it failed — contact admissions with your payment id.')
          }
        },
        modal: { ondismiss: () => flash('Payment window closed.') }
      })
      rzp.open()
    } catch {
      flash('❌ Could not start the payment. Please try again.')
    } finally {
      setPayingGateway(false)
    }
  }

  const uploadDoc = async (type, file) => {
    setUploadingDoc(type)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)
      const res = await fetch('/api/student-portal/documents', { method: 'POST', headers: authHeaders(false), body: form })
      const d = await res.json()
      if (!res.ok) { flash(`❌ ${d.error}`); return }
      flash('✅ Document uploaded — pending verification.')
      fetchData()
    } catch {
      flash('❌ Upload failed — please try again.')
    } finally {
      setUploadingDoc(null)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('student_token')
    localStorage.removeItem('student_app_id')
    localStorage.removeItem('student_name')
    navigate('/student-login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="text-center"><Loader size={48} className="animate-spin text-indigo-600 mx-auto mb-4" /><p className="text-gray-700">Loading your application...</p></div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-lg text-center">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={handleLogout} className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Back to Login</button>
        </div>
      </div>
    )
  }
  if (!data) return null

  const { application: app, documents, admissionDetailsStatus, bookingFeeStatus, bookingFeeAmount,
    registrationFeePaid, registrationFeeAmount, provisionalAdmissionStatus, registrationNumber,
    tuitionFeeAmount, tuitionFeePaid, campusoneSyncStatus } = data

  const bookingUnlocked = admissionDetailsStatus === 'Approved'
  const bookingPaid = bookingFeeStatus === 'Paid'
  const registrationPaid = !!registrationFeePaid
  const provisionalGranted = provisionalAdmissionStatus === 'Granted'
  const mandatoryDocs = documents.filter(d => d.mandatory)
  const allMandatoryVerified = mandatoryDocs.length > 0 && mandatoryDocs.every(d => d.status === 'Verified')
  const allComplete = tuitionFeePaid && allMandatoryVerified

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📚 Student Portal</h1>
            <p className="text-sm text-gray-600">Welcome, {app.name} · {app.appNo}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </header>

      {toast && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2.5">{toast}</div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Application summary */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><FileText size={20} className="text-blue-600" /> Your Application</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Course</p><p className="font-semibold text-gray-900">{app.course}</p></div>
            <div><p className="text-gray-500">Application #</p><p className="font-semibold text-gray-900">{app.appNo}</p></div>
            <div><p className="text-gray-500">Email</p><p className="font-semibold text-gray-900 truncate">{app.email}</p></div>
            <div><p className="text-gray-500">Mobile</p><p className="font-semibold text-gray-900">{app.mobile}</p></div>
          </div>
        </div>

        {allComplete && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 p-6 text-center">
            <CheckCircle2 size={44} className="text-green-600 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-green-900 mb-1">🎉 Admission Complete!</h3>
            <p className="text-green-800 text-sm">All fees paid and documents verified.{registrationNumber && <> Registration number: <strong>{registrationNumber}</strong>.</>}</p>
            {campusoneSyncStatus === 'Success' && <p className="text-xs text-green-700 mt-2">Your records have been synced to the academic system.</p>}
          </div>
        )}

        {/* Step: Entry / Booking Fee */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><ShieldCheck size={20} className="text-purple-600" /> {isCuEdu ? 'Entry Fee' : 'Booking Fee'}</h2>
          {!bookingUnlocked ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">Your admission details are still under review — the fee will unlock once a counselor approves them.</p>
          ) : isCuEdu ? (
            bookingPaid ? (
              <p className="text-sm text-green-700 font-medium">✓ Paid — your portal is unlocked</p>
            ) : (
              <div className="border rounded-lg p-4">
                <p className="text-2xl font-bold text-gray-900 mb-1">₹{Number(bookingFeeAmount || 1000).toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-600 mb-4">Pay once to unlock document upload — no waiting on manual review.</p>
                <button
                  onClick={payViaGateway}
                  disabled={payingGateway}
                  className="w-full py-2.5 px-4 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {payingGateway ? <Loader size={16} className="animate-spin" /> : <IndianRupee size={16} />}
                  {payingGateway ? 'Opening secure payment...' : `Pay ₹${Number(bookingFeeAmount || 1000).toLocaleString('en-IN')} to continue`}
                </button>
              </div>
            )
          ) : (
            <FeeCard title="Booking Fee" blurb="Locks in your seat" amount={bookingFeeAmount} status={bookingFeeStatus}
              onSubmit={(utr) => submitPayment('Booking Fee', bookingFeeAmount, utr)} submitting={submittingFee === 'Booking Fee'} />
          )}
        </div>

        {/* Step: Registration Fee — CU EDU's funnel has no separate stage for this;
            paying the entry fee above unlocks documents directly. */}
        {bookingPaid && !isCuEdu && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><Award size={20} className="text-purple-600" /> Registration Fee</h2>
            <FeeCard title="Registration Fee" blurb="Grants provisional admission" amount={registrationFeeAmount} status={registrationPaid ? 'Paid' : null}
              onSubmit={(utr) => submitPayment('Registration Fee', registrationFeeAmount, utr)} submitting={submittingFee === 'Registration Fee'} />
          </div>
        )}

        {/* Provisional admission + documents */}
        {provisionalGranted && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
              <h3 className="font-bold text-blue-900 mb-1">Provisional Admission Granted</h3>
              <p className="text-sm text-blue-800">Upload the documents below in any order, whenever you have them ready — there's no deadline to do it all at once.</p>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2"><Upload size={20} className="text-purple-600" /> Documents</h2>
              <p className="text-xs text-gray-500 mb-3">{mandatoryDocs.filter(d => d.status === 'Verified').length}/{mandatoryDocs.length} mandatory documents verified</p>
              <div>
                {documents.map((d) => (
                  <DocRow key={d.type} {...d} onUpload={uploadDoc} uploading={uploadingDoc} />
                ))}
              </div>
            </div>

            {/* Step: Tuition Fee */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><IndianRupee size={20} className="text-purple-600" /> Tuition Fee</h2>
              <FeeCard title="Tuition Fee" blurb="Completes your enrollment" amount={tuitionFeeAmount} status={tuitionFeePaid ? 'Paid' : null}
                onSubmit={(utr) => submitPayment('Tuition Fee', tuitionFeeAmount, utr)} submitting={submittingFee === 'Tuition Fee'} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
