import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, AlertCircle, CheckCircle2, Clock, FileText, Loader,
  Upload, IndianRupee, ShieldCheck
} from 'lucide-react'
import { getUrlTenantSlug } from '../tenantSlug'
import FullAdmissionForm from '../components/FullAdmissionForm'

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
  'Graduation Marksheet': 'Graduation Marksheet ( Incl Vocational)',
  'ID Proof': 'Government ID Proof',
  'Passport Photo': 'Passport Photo',
  'Transfer Certificate': 'Transfer Certificate',
  'Migration Certificate': 'Migration Certificate',
  'Caste Certificate': 'Caste Certificate',
}

// Small secondary caption shown under a document's label, where one applies.
const DOC_HINTS = {
  'Graduation Marksheet': 'subject to eligibility',
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
function FeeCard({ title, blurb, amount, status, onSubmit, submitting, onPayGateway }) {
  const [utr, setUtr] = useState('')
  const [payingGateway, setPayingGateway] = useState(false)
  const isPaid = status === 'Paid'
  const isPending = status === 'Payment Done'

  const handlePayNow = async () => {
    setPayingGateway(true)
    try {
      const paymentId = await onPayGateway()
      if (!paymentId) return
      // Auto-populate the reference field with the real payment id, then
      // submit immediately — the student already proved the payment went
      // through, no reason to make them click twice.
      setUtr(paymentId)
      onSubmit(paymentId)
    } finally {
      setPayingGateway(false)
    }
  }

  return (
    <div className={`border rounded-xl p-6 ${!amount && amount !== 0 ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
          <p className="text-base text-gray-600">{blurb}</p>
        </div>
        {isPaid ? <CheckCircle2 size={26} className="text-green-600 flex-shrink-0" /> : <Clock size={26} className="text-yellow-600 flex-shrink-0" />}
      </div>
      <p className="text-4xl font-bold text-gray-900 mb-4">₹{Number(amount || 0).toLocaleString('en-IN')}</p>

      {isPaid && <p className="text-base text-green-700 font-medium">✓ Paid and approved</p>}
      {isPending && <p className="text-base text-amber-700 font-medium">Submitted — awaiting admin approval</p>}
      {!isPaid && !isPending && (
        <div className="space-y-3">
          {onPayGateway && (
            <button
              onClick={handlePayNow}
              disabled={payingGateway || submitting}
              className="w-full py-3 px-4 bg-purple-600 text-white text-base font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {payingGateway ? <Loader size={17} className="animate-spin" /> : <IndianRupee size={17} />}
              {payingGateway ? 'Opening secure payment...' : 'Pay Now'}
            </button>
          )}
          <div className="flex items-center gap-3 text-sm text-gray-400">
            {onPayGateway && <><div className="h-px bg-gray-200 flex-1" />or enter a reference manually<div className="h-px bg-gray-200 flex-1" /></>}
          </div>
          <div className="flex gap-2">
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="UTR / transaction reference number"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <button
              onClick={() => utr.trim() && onSubmit(utr.trim())}
              disabled={submitting || !utr.trim()}
              className="px-5 py-2.5 bg-gray-700 text-white text-base font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
            >
              {submitting ? <Loader size={16} className="animate-spin" /> : null}
              Submit
            </button>
          </div>
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
        {DOC_HINTS[type] && <p className="text-xs text-gray-400 lowercase">{DOC_HINTS[type]}</p>}
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
  const [submittingFullForm, setSubmittingFullForm] = useState(false)
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

  // Used by FeeCard's "Pay Now" (Tuition Fee, and anywhere else FeeCard is
  // used) — opens the same Razorpay window as the CU EDU entry fee, but only
  // ever hands back the resulting payment id for the UTR field. It does not
  // verify or approve anything itself: the UTR still goes through
  // submit-payment for staff to review on the Payments page, same as a
  // hand-typed UTR would. This is purely "stop making the student copy a
  // reference number out of their bank SMS" — not a change in who can mark
  // a fee paid.
  const payViaGatewayForUtr = (feeType) => new Promise(async (resolve) => {
    try {
      const ok = await loadRazorpayScript()
      if (!ok) { flash('❌ Could not load the payment window. Check your connection and try again.'); resolve(null); return }

      const orderRes = await fetch('/api/student-portal/create-payment-order', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ feeType })
      })
      const order = await orderRes.json()
      if (!orderRes.ok) { flash(`❌ ${order.error}`); resolve(null); return }

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'CU EDU Admissions',
        description: feeType,
        prefill: { name: order.name, email: order.email },
        handler: (response) => resolve(response.razorpay_payment_id),
        modal: { ondismiss: () => resolve(null) }
      })
      rzp.open()
    } catch {
      flash('❌ Could not start the payment. Please try again.')
      resolve(null)
    }
  })

  // Step 2 — the fuller admission form (personal/parent/address/program/
  // academic details + documents), unlocked once the booking fee is paid.
  // Every submit (first time, or a resubmit after rejection) goes back to
  // Pending for a counselor to review before the registration fee unlocks.
  const submitFullForm = async (formData) => {
    setSubmittingFullForm(true)
    try {
      const res = await fetch('/api/student-portal/full-form', { method: 'POST', headers: authHeaders(), body: JSON.stringify(formData) })
      const d = await res.json()
      if (!res.ok) { flash(`❌ ${d.error}`); return }
      flash('✅ Admission form submitted — awaiting counselor review.')
      fetchData()
    } catch {
      flash('❌ Network error — please try again.')
    } finally {
      setSubmittingFullForm(false)
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

  const { application: app, documents, documentsVerified, admissionDetailsStatus, bookingFeeStatus, bookingFeeAmount,
    admissionFullDetails, admissionFullDetailsStatus, admissionFullDetailsReviewNote,
    provisionalAdmissionStatus, registrationNumber,
    tuitionFeeAmount, tuitionFeeFullAmount, tuitionFeeDiscountPercent, tuitionFeePaid, campusoneSyncStatus, programTotalFee } = data

  const bookingUnlocked = admissionDetailsStatus === 'Approved'
  const bookingPaid = bookingFeeStatus === 'Paid'
  const fullFormSubmitted = admissionFullDetails && Object.keys(admissionFullDetails).length > 0
  const fullDetailsApproved = admissionFullDetailsStatus === 'Approved'
  const fullDetailsPending = fullFormSubmitted && admissionFullDetailsStatus === 'Pending'
  const fullDetailsRejected = admissionFullDetailsStatus === 'Rejected'
  const provisionalGranted = provisionalAdmissionStatus === 'Granted'
  const mandatoryDocs = documents.filter(d => d.mandatory)
  const allMandatoryVerified = mandatoryDocs.length > 0 && mandatoryDocs.every(d => d.status === 'Verified')
  const allComplete = tuitionFeePaid && allMandatoryVerified

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📚 Student Portal</h1>
            <p className="text-base text-gray-600 mt-0.5">Welcome, {app.name} · {app.appNo}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2.5 text-base text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <LogOut size={20} /> Logout
          </button>
        </div>
      </header>

      {toast && (
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <div className="bg-gray-900 text-white text-base rounded-lg px-5 py-3">{toast}</div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Application summary */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2.5"><FileText size={24} className="text-blue-600" /> Your Application</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-base">
            <div><p className="text-gray-500">Course</p><p className="font-semibold text-gray-900 text-lg">{app.course}</p></div>
            <div><p className="text-gray-500">Application #</p><p className="font-semibold text-gray-900 text-lg">{app.appNo}</p></div>
            <div><p className="text-gray-500">Email</p><p className="font-semibold text-gray-900 text-lg truncate">{app.email}</p></div>
            <div><p className="text-gray-500">Mobile</p><p className="font-semibold text-gray-900 text-lg">{app.mobile}</p></div>
          </div>
        </div>

        {allComplete && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 p-8 text-center">
            <CheckCircle2 size={52} className="text-green-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-green-900 mb-2">🎉 Admission Complete!</h3>
            <p className="text-green-800 text-lg">All fees paid and documents verified.{registrationNumber && <> Registration number: <strong>{registrationNumber}</strong>.</>}</p>
            {campusoneSyncStatus === 'Success' && <p className="text-sm text-green-700 mt-3">Your records have been synced to the academic system.</p>}
          </div>
        )}

        {/* Step: Application Fee */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-5 flex items-center gap-2.5"><ShieldCheck size={24} className="text-purple-600" /> Application Fee</h2>
          {!bookingUnlocked ? (
            <p className="text-base text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">Your admission details are still under review — the fee will unlock once a counselor approves them.</p>
          ) : isCuEdu ? (
            bookingPaid ? (
              <p className="text-base text-green-700 font-medium">✓ Paid — your portal is unlocked</p>
            ) : (
              <div className="border rounded-xl p-6 max-w-md">
                <p className="text-4xl font-bold text-gray-900 mb-2">₹{Number(bookingFeeAmount || 1000).toLocaleString('en-IN')}</p>
                <p className="text-base text-gray-600 mb-5">Pay once to unlock document upload — no waiting on manual review.</p>
                <button
                  onClick={payViaGateway}
                  disabled={payingGateway}
                  className="w-full py-3 px-4 bg-purple-600 text-white text-base font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {payingGateway ? <Loader size={18} className="animate-spin" /> : <IndianRupee size={18} />}
                  {payingGateway ? 'Opening secure payment...' : `Pay ₹${Number(bookingFeeAmount || 1000).toLocaleString('en-IN')} to continue`}
                </button>
              </div>
            )
          ) : (
            <FeeCard title="Application Fee" blurb="Confirms your application" amount={bookingFeeAmount} status={bookingFeeStatus}
              onSubmit={(utr) => submitPayment('Booking Fee', bookingFeeAmount, utr)} submitting={submittingFee === 'Booking Fee'} />
          )}
        </div>

        {/* Step 2: upload documents — its own standalone step right after the
            booking fee, gated by staff verification before the fuller
            admission form unlocks. */}
        {bookingPaid && !documentsVerified && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2.5"><Upload size={24} className="text-purple-600" /> Upload Documents</h2>
            <p className="text-sm text-gray-500 mb-1">{mandatoryDocs.filter(d => d.status === 'Verified').length}/{mandatoryDocs.length} mandatory documents verified — your admission form unlocks once all of them are.</p>
            <p className="text-xs text-gray-400 mb-4">All documents combined must be under 3MB total.</p>
            <div>
              {documents.map((d) => (
                <DocRow key={d.type} {...d} onUpload={uploadDoc} uploading={uploadingDoc} />
              ))}
            </div>
          </div>
        )}

        {/* Step 3: the fuller admission form — personal/parent/address/program/
            academic details — unlocked once all mandatory documents are
            verified. Approval grants provisional admission directly — there's
            no registration fee anymore, it's always ₹0. */}
        {bookingPaid && documentsVerified && !fullDetailsApproved && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-5 flex items-center gap-2.5 px-1"><FileText size={24} className="text-purple-600" /> Complete Your Admission Form</h2>
            {fullDetailsPending ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <Clock size={44} className="text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">Awaiting Counselor Review</h3>
                <p className="text-base text-gray-600">Your admission form has been submitted and is being reviewed. You'll be notified by email once it's approved.</p>
              </div>
            ) : (
              <FullAdmissionForm
                app={app} initialData={admissionFullDetails}
                onSubmit={submitFullForm} submitting={submittingFullForm}
                rejected={fullDetailsRejected} reviewNote={admissionFullDetailsReviewNote}
              />
            )}
          </div>
        )}

        {/* Provisional admission + tuition fee — documents are already verified
            by this point (Step 2, above), so there's nothing left to upload
            here in the ordinary case; a document accidentally un-verified
            after the fact would still show up in the Step 2 card above. */}
        {provisionalGranted && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 text-lg mb-1.5">Provisional Admission Granted</h3>
              <p className="text-base text-blue-800">Pay the tuition fee below to complete your enrollment.{registrationNumber && <> Temporary admission number: <strong>{registrationNumber}</strong>.</>}</p>
            </div>

            {/* Step: Tuition Fee */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-5 flex items-center gap-2.5"><IndianRupee size={24} className="text-purple-600" /> Tuition Fee</h2>
              {!tuitionFeePaid && (
                <p className={`text-sm text-gray-500 ${tuitionFeeDiscountPercent > 0 ? 'mb-1' : 'mb-4'}`}>Total Program Fee: <span className="font-semibold text-gray-700">₹{Number(programTotalFee || 0).toLocaleString('en-IN')}</span></p>
              )}
              {tuitionFeeDiscountPercent > 0 && (
                <p className="text-sm text-emerald-600 font-medium mb-4">
                  🎉 {tuitionFeeDiscountPercent}% discount applied — ₹{Number(tuitionFeeFullAmount || 0).toLocaleString('en-IN')} reduced to ₹{Number(tuitionFeeAmount || 0).toLocaleString('en-IN')}
                </p>
              )}
              <FeeCard title="Tuition Fee" blurb="Completes your enrollment" amount={tuitionFeeAmount} status={tuitionFeePaid ? 'Paid' : null}
                onSubmit={(utr) => submitPayment('Tuition Fee', tuitionFeeAmount, utr)} submitting={submittingFee === 'Tuition Fee'}
                onPayGateway={() => payViaGatewayForUtr('Tuition Fee')} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
