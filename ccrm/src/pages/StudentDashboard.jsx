import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, AlertCircle, CheckCircle2, Clock, FileText, Loader,
  Upload, IndianRupee, ShieldCheck, Lock, LifeBuoy, Send, Hash,
  UserRound, Mail, Phone, GraduationCap
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

function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}` }

// ── Small building blocks ────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-card p-6 sm:p-8 ${className}`}>{children}</div>
}

function Pill({ tone = 'gray', children }) {
  const tones = {
    gray:    'bg-gray-100 text-gray-600',
    green:   'bg-success-50 text-success-700',
    amber:   'bg-warning-50 text-warning-700',
    red:     'bg-danger-50 text-danger-700',
    blue:    'bg-primary-50 text-primary-700',
  }
  return <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${tones[tone]}`}>{children}</span>
}

// Compact info strip: Lead ID, App No, Counsellor, Email, Mobile.
function InfoStrip({ app, leadId, counsellorName }) {
  const items = [
    { label: 'Lead ID', value: leadId ? `#${leadId}` : '—', icon: Hash },
    { label: 'Application No.', value: app.appNo, icon: FileText },
    { label: 'Counsellor', value: counsellorName || 'Unassigned', icon: UserRound },
    { label: 'Email', value: app.email, icon: Mail },
    { label: 'Mobile', value: app.mobile, icon: Phone },
  ]
  return (
    <Card className="!p-5 sm:!p-6">
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        {items.map((it) => (
          <div key={it.label} className="min-w-[130px]">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1">
              <it.icon size={11.5} /> {it.label}
            </div>
            <div className={`text-[13px] font-bold text-gray-900 truncate ${it.label !== 'Counsellor' ? 'font-mono' : ''}`}>{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// Horizontal journey stepper matching the Campus One Neo design language.
function Stepper({ steps }) {
  return (
    <Card className="!p-5 sm:!p-6 overflow-x-auto">
      <div className="flex items-start min-w-[640px]">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[110px] text-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-[13px] border-2 ${
                s.state === 'done' ? 'bg-success-500 text-white border-success-500'
                : s.state === 'current' ? 'bg-primary-500 text-white border-primary-500 ring-4 ring-primary-100'
                : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                {s.state === 'done' ? '✓' : i + 1}
              </div>
              <div className={`text-[12px] font-bold ${s.state === 'current' ? 'text-primary-600' : 'text-gray-800'}`}>{s.label}</div>
              <div className="text-[10.5px] text-gray-400">{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mt-4 min-w-[16px] ${s.state === 'done' ? 'bg-success-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </Card>
  )
}

// Shown in place of a section that hasn't unlocked yet, so the student always
// sees the whole journey rather than steps just silently not existing.
function LockedCard({ reason }) {
  return (
    <Card className="text-center py-10">
      <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
        <Lock size={18} />
      </div>
      <p className="font-bold text-gray-900 mb-1">Locked</p>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">{reason}</p>
    </Card>
  )
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
    <div className={`border border-gray-100 rounded-2xl p-6 ${!amount && amount !== 0 ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">{title}</h3>
          <p className="text-sm text-gray-500">{blurb}</p>
        </div>
        {isPaid ? <CheckCircle2 size={24} className="text-success-500 flex-shrink-0" /> : <Clock size={24} className="text-warning-500 flex-shrink-0" />}
      </div>
      <p className="text-4xl font-extrabold text-gray-900 mb-4 font-mono tracking-tight">{money(amount)}</p>

      {isPaid && <p className="text-sm text-success-700 font-semibold">✓ Paid and approved</p>}
      {isPending && <p className="text-sm text-warning-700 font-semibold">Submitted — awaiting admin approval</p>}
      {!isPaid && !isPending && (
        <div className="space-y-3">
          {onPayGateway && (
            <button
              onClick={handlePayNow}
              disabled={payingGateway || submitting}
              className="w-full py-3 px-4 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-soft"
            >
              {payingGateway ? <Loader size={16} className="animate-spin" /> : <IndianRupee size={16} />}
              {payingGateway ? 'Opening secure payment...' : 'Pay Now'}
            </button>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {onPayGateway && <><div className="h-px bg-gray-200 flex-1" />or enter a reference manually<div className="h-px bg-gray-200 flex-1" /></>}
          </div>
          <div className="flex gap-2">
            <input
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="UTR / transaction reference number"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-200 focus:border-primary-300 focus:outline-none"
            />
            <button
              onClick={() => utr.trim() && onSubmit(utr.trim())}
              disabled={submitting || !utr.trim()}
              className="px-5 py-2.5 bg-gray-800 text-white text-sm font-bold rounded-xl hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
            >
              {submitting ? <Loader size={15} className="animate-spin" /> : null}
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Tuition Fee's card — the one flexible amount on the whole journey: full,
// minimum due, or anything in between the student plans to pay right now.
function TuitionFeeCard({ minDue, fullAmount, onSubmit, submitting, onPayGateway }) {
  const [plan, setPlan] = useState('min')
  const [custom, setCustom] = useState(minDue)
  const [utr, setUtr] = useState('')
  const [payingGateway, setPayingGateway] = useState(false)

  const amount = plan === 'min' ? minDue : plan === 'full' ? fullAmount : Math.max(0, Number(custom) || 0)
  const isValid = amount >= minDue

  const handlePayNow = async () => {
    if (!isValid) return
    setPayingGateway(true)
    try {
      const paymentId = await onPayGateway(amount)
      if (!paymentId) return
      setUtr(paymentId)
      onSubmit(amount, paymentId)
    } finally {
      setPayingGateway(false)
    }
  }

  const plans = [
    { key: 'min', label: 'Minimum Due', value: minDue },
    ...(fullAmount > minDue ? [{ key: 'full', label: 'Full Amount', value: fullAmount }] : []),
    { key: 'custom', label: 'Custom Amount', value: null },
  ]

  return (
    <div className="border border-gray-100 rounded-2xl p-6">
      <p className="text-sm text-gray-500 mb-4">Pay in full, the minimum due, or any amount you plan to pay right now.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
        {plans.map((p) => (
          <button
            key={p.key}
            onClick={() => { setPlan(p.key); if (p.key !== 'custom') setCustom(p.value) }}
            className={`text-left rounded-xl border-2 px-4 py-3 transition ${plan === p.key ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}
          >
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{p.label}</div>
            <div className="font-mono font-extrabold text-[15px] text-gray-900">{p.value != null ? money(p.value) : 'You decide'}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3.5 py-2.5 bg-gray-50">
          <span className="font-mono font-bold text-gray-400">₹</span>
          <input
            type="number" min={minDue} step="500" value={custom}
            onFocus={() => setPlan('custom')}
            onChange={(e) => { setPlan('custom'); setCustom(e.target.value) }}
            className="flex-1 bg-transparent outline-none font-mono font-bold text-gray-900"
            placeholder={`Min. ${money(minDue)}`}
          />
        </div>
        <button
          onClick={handlePayNow}
          disabled={!isValid || payingGateway || submitting}
          className="px-6 py-2.5 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 disabled:opacity-40 flex items-center justify-center gap-2 shadow-soft flex-shrink-0"
        >
          {payingGateway ? <Loader size={16} className="animate-spin" /> : <IndianRupee size={16} />}
          {payingGateway ? 'Opening secure payment...' : `Pay ${money(amount)}`}
        </button>
      </div>
      {!isValid && <p className="text-xs text-danger-600 font-semibold mb-3">Minimum payable amount is {money(minDue)}.</p>}

      <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
        <div className="h-px bg-gray-200 flex-1" />or enter a reference manually<div className="h-px bg-gray-200 flex-1" />
      </div>
      <div className="flex gap-2">
        <input
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          placeholder="UTR / transaction reference number"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-200 focus:border-primary-300 focus:outline-none"
        />
        <button
          onClick={() => isValid && utr.trim() && onSubmit(amount, utr.trim())}
          disabled={submitting || !utr.trim() || !isValid}
          className="px-5 py-2.5 bg-gray-800 text-white text-sm font-bold rounded-xl hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
        >
          {submitting ? <Loader size={15} className="animate-spin" /> : null}
          Submit
        </button>
      </div>
    </div>
  )
}

function DocCard({ type, mandatory, uploaded, status, onUpload, uploading }) {
  const inputRef = React.useRef(null)
  const isLocked = status === 'Verified'
  const tone = status === 'Verified' ? 'green' : status === 'Rejected' ? 'red' : uploaded ? 'amber' : 'gray'
  const label = status === 'Verified' ? 'Verified' : status === 'Rejected' ? 'Rejected — re-upload' : uploaded ? 'Pending review' : 'Not uploaded'

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 ${status === 'Rejected' ? 'border-danger-200 bg-danger-50/40' : 'border-gray-100 bg-white'}`}>
      <div className="w-full h-12 rounded-xl bg-gray-50 flex items-center justify-center text-xl">📄</div>
      <div className="text-[12.5px] font-bold text-gray-900 leading-tight">
        {DOC_LABELS[type] || type}{mandatory && <span className="text-danger-500 ml-1">*</span>}
      </div>
      {DOC_HINTS[type] && <p className="text-[10.5px] text-gray-400 lowercase -mt-1">{DOC_HINTS[type]}</p>}
      <Pill tone={tone}>{isLocked && '🔒 '}{label}</Pill>
      <input ref={inputRef} type="file" hidden onChange={(e) => e.target.files[0] && onUpload(type, e.target.files[0])} />
      {isLocked ? (
        <div className="text-[10.5px] text-gray-400 mt-1">Locked — verified, cannot be changed</div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading === type}
          className="mt-1 w-full justify-center text-[12px] font-bold text-primary-600 hover:text-primary-700 border border-primary-100 hover:bg-primary-50 rounded-lg py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {uploading === type ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploaded || status === 'Rejected' ? 'Re-upload' : 'Upload'}
        </button>
      )}
    </div>
  )
}

const GRIEVANCE_CATEGORIES = ['Payment issue', 'Document upload issue', 'Counsellor / communication', 'Technical / login issue', 'Other']

function GrievanceSection() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState(GRIEVANCE_CATEGORIES[0])
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/student-portal/grievances', { headers: authHeaders(false) })
      if (res.ok) setTickets(await res.json())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchTickets() }, [])

  const submit = async () => {
    if (!message.trim()) { setErr('Please describe your issue.'); return }
    setSubmitting(true)
    setErr('')
    try {
      const res = await fetch('/api/student-portal/grievances', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ category, message })
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Failed to submit.'); return }
      setMessage('')
      setShowForm(false)
      fetchTickets()
    } catch {
      setErr('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
        <div className="flex items-center gap-2.5">
          <LifeBuoy size={22} className="text-primary-600" />
          <h2 className="text-xl font-extrabold text-gray-900">Grievance &amp; Support</h2>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 flex items-center gap-1.5"
        >
          {showForm ? 'Cancel' : 'Raise a Ticket'}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl space-y-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {GRIEVANCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            placeholder="Describe your issue…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-none"
          />
          {err && <p className="text-xs text-danger-600 font-semibold">{err}</p>}
          <button
            onClick={submit} disabled={submitting}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-900 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Ticket
          </button>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading ? null : tickets.length === 0 ? (
          <p className="text-sm text-gray-400">No tickets raised yet. If anything is unclear or stuck, raise a ticket and our team responds within 24 hours.</p>
        ) : tickets.map(t => (
          <div key={t.id} className="border-b border-dashed border-gray-100 last:border-b-0 pb-3 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-[11px] text-gray-400">GRV{String(t.id).padStart(4, '0')}</span>
                <span className="text-[12.5px] font-semibold text-gray-800 ml-2">{t.category}</span>
                <p className="text-[12.5px] text-gray-500 mt-0.5">{t.message}</p>
                {t.response && <p className="text-[12.5px] text-success-700 mt-1.5 bg-success-50 rounded-lg px-3 py-2"><strong>Response:</strong> {t.response}</p>}
              </div>
              <Pill tone={t.status === 'Resolved' ? 'green' : 'amber'}>{t.status}</Pill>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap gap-x-10 gap-y-3">
        <div><div className="text-[10.5px] font-bold uppercase text-gray-400">Helpline</div><div className="text-sm font-bold font-mono">1800-123-4560</div></div>
        <div><div className="text-[10.5px] font-bold uppercase text-gray-400">Support Email</div><div className="text-sm font-bold">support@cuedu.in</div></div>
        <div><div className="text-[10.5px] font-bold uppercase text-gray-400">Hours</div><div className="text-sm font-bold">24×7</div></div>
      </div>
    </Card>
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

  // Used by FeeCard's "Pay Now" (and TuitionFeeCard, passing its own chosen
  // amount) — opens the same Razorpay window as the CU EDU entry fee, but
  // only ever hands back the resulting payment id for the UTR field. It does
  // not verify or approve anything itself: the UTR still goes through
  // submit-payment for staff to review on the Payments page, same as a
  // hand-typed UTR would. This is purely "stop making the student copy a
  // reference number out of their bank SMS" — not a change in who can mark
  // a fee paid.
  const payViaGatewayForUtr = (feeType, amount) => new Promise(async (resolve) => {
    try {
      const ok = await loadRazorpayScript()
      if (!ok) { flash('❌ Could not load the payment window. Check your connection and try again.'); resolve(null); return }

      const orderRes = await fetch('/api/student-portal/create-payment-order', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ feeType, amount })
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
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-center"><Loader size={40} className="animate-spin text-primary-500 mx-auto mb-4" /><p className="text-gray-500">Loading your application...</p></div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-card text-center">
          <AlertCircle size={44} className="text-danger-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={handleLogout} className="w-full px-4 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600">Back to Login</button>
        </div>
      </div>
    )
  }
  if (!data) return null

  const { application: app, leadId, counsellorName, documents, documentsVerified, admissionDetailsStatus, bookingFeeStatus, bookingFeeAmount,
    admissionFullDetails, admissionFullDetailsStatus, admissionFullDetailsReviewNote,
    provisionalAdmissionStatus, registrationNumber,
    tuitionFeeAmount, tuitionFeeFullAmount, tuitionFeeTotalAmount, tuitionFeeDiscountPercent, tuitionFeePaid, campusoneSyncStatus, programTotalFee } = data

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

  const steps = [
    { label: 'Review', sub: bookingUnlocked ? 'Approved' : 'In review', state: bookingUnlocked ? 'done' : 'current' },
    { label: 'Application Fee', sub: bookingPaid ? 'Paid' : bookingUnlocked ? 'Unlocked' : 'Locked', state: !bookingUnlocked ? 'pending' : bookingPaid ? 'done' : 'current' },
    { label: 'Documents', sub: !bookingPaid ? 'Locked' : documentsVerified ? 'Verified' : `${mandatoryDocs.filter(d => d.status === 'Verified').length}/${mandatoryDocs.length} verified`, state: !bookingPaid ? 'pending' : documentsVerified ? 'done' : 'current' },
    { label: 'Admission Form', sub: !documentsVerified ? 'Locked' : fullDetailsApproved ? 'Approved' : 'In review', state: !documentsVerified ? 'pending' : fullDetailsApproved ? 'done' : 'current' },
    { label: 'Tuition Fee', sub: !provisionalGranted ? 'Locked' : tuitionFeePaid ? 'Paid' : 'Unlocked', state: !provisionalGranted ? 'pending' : tuitionFeePaid ? 'done' : 'current' },
    { label: 'Complete', sub: allComplete ? 'Done' : 'Locked', state: allComplete ? 'done' : 'pending' },
  ]

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center text-white font-extrabold text-[12px] flex-shrink-0">CU</div>
            <div>
              <h1 className="text-lg font-extrabold text-gray-900 leading-tight">Student Portal</h1>
              <p className="text-[12.5px] text-gray-500">{app.name} · {app.appNo}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition">
            <LogOut size={17} /> Logout
          </button>
        </div>
      </header>

      {toast && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="bg-gray-900 text-white text-sm font-medium rounded-xl px-5 py-3">{toast}</div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        <InfoStrip app={app} leadId={leadId} counsellorName={counsellorName} />
        <Stepper steps={steps} />

        {allComplete && (
          <div className="bg-success-50 rounded-2xl border-2 border-success-100 p-8 text-center">
            <CheckCircle2 size={48} className="text-success-500 mx-auto mb-3" />
            <h3 className="text-2xl font-extrabold text-success-700 mb-2">🎉 Admission Complete!</h3>
            <p className="text-success-700">All fees paid and documents verified.{registrationNumber && <> Registration number: <strong className="font-mono">{registrationNumber}</strong>.</>}</p>
            {campusoneSyncStatus === 'Success' && <p className="text-sm text-success-600 mt-2">Your records have been synced to the academic system.</p>}
          </div>
        )}

        {/* Step: Application Fee */}
        <Card>
          <h2 className="text-xl font-extrabold text-gray-900 mb-5 flex items-center gap-2.5"><ShieldCheck size={22} className="text-primary-600" /> Application Fee</h2>
          {!bookingUnlocked ? (
            <LockedCard reason="Your admission details are still under review — this fee will unlock once a counselor approves them." />
          ) : isCuEdu ? (
            bookingPaid ? (
              <p className="text-sm text-success-700 font-semibold">✓ Paid — your portal is unlocked</p>
            ) : (
              <div className="border border-gray-100 rounded-2xl p-6 max-w-md">
                <p className="text-4xl font-extrabold text-gray-900 mb-2 font-mono">{money(bookingFeeAmount || 1000)}</p>
                <p className="text-sm text-gray-500 mb-5">Pay once to unlock document upload — no waiting on manual review.</p>
                <button
                  onClick={payViaGateway}
                  disabled={payingGateway}
                  className="w-full py-3 px-4 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-soft"
                >
                  {payingGateway ? <Loader size={17} className="animate-spin" /> : <IndianRupee size={17} />}
                  {payingGateway ? 'Opening secure payment...' : `Pay ${money(bookingFeeAmount || 1000)} to continue`}
                </button>
              </div>
            )
          ) : (
            <FeeCard title="Application Fee" blurb="Confirms your application" amount={bookingFeeAmount} status={bookingFeeStatus}
              onSubmit={(utr) => submitPayment('Booking Fee', bookingFeeAmount, utr)} submitting={submittingFee === 'Booking Fee'} />
          )}
        </Card>

        {/* Step 2: upload documents — its own standalone step right after the
            booking fee, gated by staff verification before the fuller
            admission form unlocks. */}
        {bookingPaid && !documentsVerified && (
          <Card>
            <h2 className="text-xl font-extrabold text-gray-900 mb-1.5 flex items-center gap-2.5"><Upload size={22} className="text-primary-600" /> Upload Documents</h2>
            <p className="text-sm text-gray-500 mb-1">{mandatoryDocs.filter(d => d.status === 'Verified').length}/{mandatoryDocs.length} mandatory documents verified — your admission form unlocks once all of them are. You'll get an email the moment each one is reviewed.</p>
            <p className="text-xs text-gray-400 mb-4">All documents combined must be under 3MB total. You can upload them all at once, or come back and finish later.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {documents.map((d) => (
                <DocCard key={d.type} {...d} onUpload={uploadDoc} uploading={uploadingDoc} />
              ))}
            </div>
          </Card>
        )}

        {/* Step 3: the fuller admission form — personal/parent/address/program/
            academic details — unlocked once all mandatory documents are
            verified. Approval grants provisional admission directly — there's
            no registration fee anymore, it's always ₹0. */}
        {bookingPaid && documentsVerified && !fullDetailsApproved && (
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-4 flex items-center gap-2.5 px-1"><FileText size={22} className="text-primary-600" /> Complete Your Admission Form</h2>
            {fullDetailsPending ? (
              <Card className="text-center py-10">
                <Clock size={40} className="text-warning-500 mx-auto mb-3" />
                <h3 className="text-lg font-extrabold text-gray-900 mb-1.5">Awaiting Counselor Review</h3>
                <p className="text-sm text-gray-500">Your admission form has been submitted and is being reviewed. You'll be notified by email once it's approved.</p>
              </Card>
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
            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-6">
              <h3 className="font-extrabold text-primary-700 text-lg mb-1.5 flex items-center gap-2"><GraduationCap size={20} /> Provisional Admission Granted</h3>
              <p className="text-sm text-primary-700">Pay the tuition fee below to complete your enrollment.{registrationNumber && <> Temporary admission number: <strong className="font-mono">{registrationNumber}</strong>.</>}</p>
            </div>

            {/* Step: Tuition Fee */}
            <Card>
              <h2 className="text-xl font-extrabold text-gray-900 mb-1 flex items-center gap-2.5"><IndianRupee size={22} className="text-primary-600" /> Tuition Fee</h2>
              {!tuitionFeePaid && (
                <p className={`text-sm text-gray-500 ${tuitionFeeDiscountPercent > 0 ? 'mb-1' : 'mb-4'}`}>Total Program Fee: <span className="font-bold text-gray-700 font-mono">{money(programTotalFee)}</span></p>
              )}
              {tuitionFeeDiscountPercent > 0 && (
                <p className="text-sm text-success-600 font-semibold mb-4">
                  🎉 {tuitionFeeDiscountPercent}% discount applied — {money(tuitionFeeFullAmount)} reduced to {money(tuitionFeeAmount)}
                </p>
              )}
              {tuitionFeePaid ? (
                <p className="text-sm text-success-700 font-semibold">✓ Paid and approved</p>
              ) : (
                <TuitionFeeCard
                  minDue={tuitionFeeAmount} fullAmount={tuitionFeeTotalAmount || tuitionFeeAmount}
                  onSubmit={(amount, utr) => submitPayment('Tuition Fee', amount, utr)} submitting={submittingFee === 'Tuition Fee'}
                  onPayGateway={(amount) => payViaGatewayForUtr('Tuition Fee', amount)}
                />
              )}
            </Card>
          </>
        )}

        <GrievanceSection />
      </main>
    </div>
  )
}
