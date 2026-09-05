import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader, Clock, Upload, ChevronLeft, ChevronRight, Check, Pencil, Users, BookOpen, Building2, Briefcase, Phone, Mail, Globe } from 'lucide-react'
import { INDIA_STATES, getDistrictsForState, CASTE_CATEGORIES } from '../data/indiaLocations'

const LOGO_URL = 'https://crm.cutmap.ac.in/landing/images/logo.jpg'
const SUPPORT_EMAIL = 'admissions@cutmap.ac.in'
const HERO_GRADIENT = 'linear-gradient(135deg, #064e3b 0%, #065f46 20%, #0d9488 50%, #0369a1 75%, #1e40af 100%)'
const STATS = [
  { value: '10,000+', label: 'Students', icon: Users },
  { value: '100+', label: 'Programs', icon: BookOpen },
  { value: '4', label: 'Campuses', icon: Building2 },
  { value: '95%', label: 'Placements', icon: Briefcase },
]

// One token drives the whole journey: fill basic details → counselor approval →
// booking fee → fuller admission form → registration fee → provisional admission
// → document upload + tuition fee → CampusOne sync. GET /api/admission-details/:token
// returns the application's current stage flags; this component renders whichever
// screen is next, and the two data-entry screens (basic details, full form) are
// themselves broken into short wizard steps so nobody faces a 25-field wall at once.

const JOURNEY_STAGES = ['Details', 'Booking Fee', 'Full Form', 'Registration Fee', 'Docs & Tuition']

function macroStageIndex(j) {
  if (!j) return 0
  const fullFormSubmitted = j.admissionFullDetails && Object.keys(j.admissionFullDetails).length > 0
  if (j.provisionalAdmissionStatus === 'Granted') return 4
  if (fullFormSubmitted) return 3
  if (j.bookingFeeStatus === 'Paid') return 2
  if (j.admissionDetailsStatus === 'Approved') return 1
  return 0
}

// ── Page shell: full-width, Inter font, top navbar + bottom footer on every screen ──
function PageShell({ children }) {
  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      <nav className="w-full bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Centurion University" className="h-10 w-auto" />
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-teal-700 transition-colors">
            <Mail size={15} /> Need help? {SUPPORT_EMAIL}
          </a>
        </div>
      </nav>

      <main className="flex-1 w-full">{children}</main>

      <footer className="w-full bg-gray-950 text-gray-400 mt-auto">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            <div>
              <img src={LOGO_URL} alt="Centurion University" className="h-12 w-auto rounded-md bg-white p-1 mb-3" />
              <p className="text-xs leading-relaxed text-gray-500">Centurion University of Technology and Management — Building careers, transforming lives since 2010.</p>
            </div>
            <div>
              <h4 className="text-white text-sm font-semibold mb-3">Contact</h4>
              <ul className="space-y-2.5 text-xs">
                <li><a href="tel:+917065569969" className="flex items-center gap-2 hover:text-white transition-colors"><Phone size={13} /> +91 70655 69969</a></li>
                <li><a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 hover:text-white transition-colors"><Mail size={13} /> {SUPPORT_EMAIL}</a></li>
                <li><a href="https://www.cutmap.ac.in" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors"><Globe size={13} /> www.cutmap.ac.in</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-sm font-semibold mb-3">Need Assistance?</h4>
              <p className="text-xs leading-relaxed text-gray-500">If you face any issue with this admission portal, reach out to our admissions team and we'll help you right away.</p>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-5 text-xs text-gray-600 text-center sm:text-left">
            © {new Date().getFullYear()} Centurion University of Technology and Management. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── Hero: vibrant welcome banner (same gradient as the public site) + macro stepper ──
function Hero({ application, macroStep }) {
  return (
    <div className="relative overflow-hidden" style={{ background: HERO_GRADIENT }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
        backgroundSize: '36px 36px'
      }} />
      <div className="absolute top-0 right-1/4 w-72 h-72 rounded-full bg-blue-300/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/5 w-56 h-56 rounded-full bg-cyan-300/15 blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-5 lg:px-8 pt-10 pb-20 sm:pt-14 sm:pb-24 relative z-10">
        <div className="inline-flex items-center gap-2 bg-yellow-400/15 border border-yellow-400/30 text-yellow-300 text-xs font-bold px-4 py-1.5 rounded-full mb-5">
          🎓 CUEE 2026 Admission Journey
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-3 tracking-tight max-w-2xl">
          {application ? <>Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300">{application.name.split(' ')[0]}</span>!</> : 'Your Admission Journey'}
        </h1>
        <p className="text-teal-100 text-base sm:text-lg max-w-xl mb-8">
          {application ? <>You're on your way to <strong className="text-white">{application.course || 'Centurion University'}</strong>. Just a few quick steps left.</> : 'NAAC A+ accredited, 100+ programs, 95% placement record.'}
        </p>

        <div className="grid grid-cols-4 gap-4 sm:gap-8 max-w-lg">
          {STATS.map(stat => (
            <div key={stat.label} className="text-center sm:text-left">
              <div className="text-xl sm:text-2xl font-extrabold text-white">{stat.value}</div>
              <div className="text-teal-200 text-[10px] sm:text-xs mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Macro stepper — floats as an elevated white card overlapping the hero's bottom edge */}
      {typeof macroStep === 'number' && (
        <div className="max-w-4xl mx-auto px-5 lg:px-8 relative z-10" style={{ marginBottom: '-2.75rem' }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-5 sm:px-8 py-5">
            <ol className="flex items-center w-full">
              {JOURNEY_STAGES.map((label, i) => (
                <li key={label} className="flex-1 flex items-center last:flex-none">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                      i < macroStep ? 'bg-emerald-600 border-emerald-600 text-white'
                      : i === macroStep ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-400'
                    }`} style={i === macroStep ? { background: 'linear-gradient(135deg,#0d9488,#0369a1)' } : undefined}>
                      {i < macroStep ? <Check size={15} /> : i + 1}
                    </div>
                    <span className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-center leading-tight ${i <= macroStep ? 'text-gray-700' : 'text-gray-400'}`} style={{ maxWidth: 70 }}>
                      {label}
                    </span>
                  </div>
                  {i < JOURNEY_STAGES.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < macroStep ? 'bg-emerald-600' : 'bg-gray-200'}`} />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Content column: constrains width for readability inside the full-width page.
// afterHero=false (no Hero above it, e.g. the error screen) skips the top padding
// that normally compensates for the Hero's floating stepper card overlap. ──
function Content({ children, afterHero = true }) {
  return <div className="max-w-4xl mx-auto px-5 lg:px-8 pb-16" style={{ paddingTop: afterHero ? '4rem' : '3rem' }}>{children}</div>
}

function ApplicantBar({ application }) {
  if (!application) return null
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-2">
      <div>
        <p className="font-bold text-gray-900">{application.name}</p>
        <p className="text-sm text-gray-500">{application.course || 'N/A'} · {application.email}</p>
      </div>
      <div className="text-xs text-gray-400 font-mono">{application.mobile}</div>
    </div>
  )
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 ${className}`}>{children}</div>
}

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
const inputCls = "w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 outline-none transition-colors disabled:bg-gray-100 disabled:text-gray-400"
const primaryBtnCls = "text-white shadow-lg shadow-teal-900/10 hover:brightness-110 transition-all"
const primaryBtnStyle = { background: 'linear-gradient(135deg,#0d9488,#0369a1)' }

// ── Generic step-wizard: progress dots + Back/Next, used by both the basic-
// details form and the fuller Step-2 form so neither dumps everything at once ──
function StepWizard({ steps, onFinish, finishLabel = 'Submit', submitting }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepError, setStepError] = useState('')
  const isLast = stepIndex === steps.length - 1
  const step = steps[stepIndex]

  const goNext = () => {
    const err = step.validate?.()
    if (err) { setStepError(err); return }
    setStepError('')
    if (isLast) onFinish()
    else setStepIndex(i => i + 1)
  }
  const goBack = () => { setStepError(''); setStepIndex(i => Math.max(0, i - 1)) }

  return (
    <Card>
      {/* Step progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">Step {stepIndex + 1} of {steps.length}</span>
          <span className="text-xs text-gray-400">{step.title}</span>
        </div>
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <div key={s.title} className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={i <= stepIndex ? { ...primaryBtnStyle, width: '100%' } : { width: 0 }} />
            </div>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-1">{step.title}</h2>
      {step.subtitle && <p className="text-sm text-gray-500 mb-5">{step.subtitle}</p>}

      {stepError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0" /> {stepError}
        </div>
      )}

      <div className="space-y-5">{step.render()}</div>

      <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100">
        <button
          type="button" onClick={goBack} disabled={stepIndex === 0}
          className="flex items-center gap-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-0 disabled:pointer-events-none"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <button
          type="button" onClick={goNext} disabled={submitting}
          className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 ${primaryBtnCls}`}
          style={primaryBtnStyle}
        >
          {submitting ? <Loader size={16} className="animate-spin" /> : isLast ? <Check size={16} /> : null}
          {isLast ? (submitting ? 'Submitting...' : finishLabel) : 'Continue'}
          {!isLast && <ChevronRight size={16} />}
        </button>
      </div>
    </Card>
  )
}

// ── Payment screen, reused for Booking / Registration / Tuition fee ──
function PaymentScreen({ token, feeType, amount, title, description, onSubmitted }) {
  const [utrNumber, setUtrNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submittedKey = `admission_journey_${token}_paid_${feeType}`
  const [alreadySubmitted, setAlreadySubmitted] = useState(() => {
    try { return localStorage.getItem(submittedKey) === '1' } catch { return false }
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!utrNumber.trim()) { setError('Please enter your UTR/transaction reference number.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/admission-details/${token}/submit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeType, utrNumber, amount })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit payment.')
      try { localStorage.setItem(submittedKey, '1') } catch {}
      setAlreadySubmitted(true)
      onSubmitted?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (alreadySubmitted) {
    return (
      <Card className="text-center">
        <Clock size={44} className="text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Submitted</h2>
        <p className="text-gray-600 text-sm">Your {title.toLowerCase()} reference has been submitted and is awaiting admin confirmation. This page will update once it's approved.</p>
        <button type="button" onClick={() => window.location.reload()} className={`mt-5 px-5 py-2.5 rounded-lg text-sm font-semibold ${primaryBtnCls}`} style={primaryBtnStyle}>
          Check status
        </button>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      <div className="bg-teal-50 border border-teal-100 rounded-lg p-4 mb-5">
        <p className="text-sm text-gray-600">Amount to pay</p>
        <p className="font-bold text-2xl text-teal-700">₹{Number(amount || 0).toLocaleString('en-IN')}</p>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="UTR / Transaction Reference Number">
          <input
            type="text" value={utrNumber} onChange={(e) => setUtrNumber(e.target.value)}
            placeholder="Enter after completing your bank transfer / UPI payment"
            className={inputCls}
          />
        </Field>
        <button type="submit" disabled={submitting} className={`w-full sm:w-auto px-6 py-2.5 rounded-lg disabled:opacity-50 font-semibold flex items-center justify-center gap-2 ${primaryBtnCls}`} style={primaryBtnStyle}>
          {submitting ? <Loader size={16} className="animate-spin" /> : <Check size={16} />} {submitting ? 'Submitting...' : 'Submit Payment Reference'}
        </button>
      </form>
    </Card>
  )
}

export default function AdmissionDetailsForm() {
  const { token } = useParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [journey, setJourney] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    dateOfBirth: '', fatherName: '', motherName: '', address: '',
    country: 'India', state: '', city: '', pincode: '',
    nationality: '', religion: '', caste: '', subcaste: '',
    tenthMarks: '', tenthPercentage: '', tenthBoard: '',
    twelfthMarks: '', twelfthPercentage: '', twelfthBoard: '',
    graduationMarks: '', graduationPercentage: '', graduationUniversity: '', otherCertifications: '',
    extraCurricularActivities: '', scholarshipRequired: false, medicalConditions: '',
    emergencyContactName: '', emergencyContactPhone: ''
  })

  const [fullFormData, setFullFormData] = useState({
    guardianOccupation: '', guardianAnnualIncome: '', previousInstitution: '', tcNumber: '',
    entranceExamName: '', entranceExamRollNo: '', entranceExamScore: '',
    bankAccountNumber: '', bankIFSC: '', bankName: '',
    hostelRequired: false, transportRequired: false
  })

  const fetchJourney = () => {
    fetch(`/api/admission-details/${token}`)
      .then(r => { if (!r.ok) throw new Error('Invalid or expired link'); return r.json() })
      .then(data => {
        setJourney(data)
        if (data.admissionDetails && Object.keys(data.admissionDetails).length > 0) {
          setFormData(prev => ({ ...prev, ...data.admissionDetails }))
        }
        if (data.admissionFullDetails && Object.keys(data.admissionFullDetails).length > 0) {
          setFullFormData(prev => ({ ...prev, ...data.admissionFullDetails }))
        }
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  useEffect(fetchJourney, [token])

  const setField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }))
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name === 'pincode') return setField('pincode', value.replace(/\D/g, '').slice(0, 6))
    if (name === 'state') { setFormData(prev => ({ ...prev, state: value, city: '' })); return }
    setField(name, type === 'checkbox' ? checked : value)
  }
  const handleFullFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setFullFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmitStep1 = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admission-details/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
      })
      if (!res.ok) throw new Error('Failed to save details')
      fetchJourney()
    } catch (err) {
      alert('❌ Error saving details: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitFullForm = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admission-details/${token}/full-form`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullFormData)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save.')
      fetchJourney()
    } catch (err) {
      alert('❌ ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDocUpload = async (type, file) => {
    const fd = new FormData()
    fd.append('type', type)
    fd.append('file', file)
    try {
      const res = await fetch(`/api/admission-details/${token}/documents`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed.')
      fetchJourney()
    } catch (err) {
      alert('❌ ' + err.message)
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="text-center py-24"><Loader size={40} className="animate-spin text-teal-700 mx-auto mb-4" /><p className="text-gray-600 text-sm">Loading your admission journey...</p></div>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <Content afterHero={false}>
          <Card className="max-w-md mx-auto text-center">
            <AlertCircle size={44} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-gray-600 text-sm mb-3">{error}</p>
            <p className="text-xs text-gray-400">Please check your email for the correct link or contact admissions.</p>
          </Card>
        </Content>
      </PageShell>
    )
  }

  const j = journey
  const fullFormSubmitted = j.admissionFullDetails && Object.keys(j.admissionFullDetails).length > 0
  const macroStep = macroStageIndex(j)

  // ── Screen: done ──
  if (j.campusoneSyncStatus === 'Success') {
    return (
      <PageShell>
        <Hero application={j.application} macroStep={5} />
        <Content>
          <ApplicantBar application={j.application} />
          <Card className="text-center">
            <CheckCircle2 size={52} className="text-emerald-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Admission Complete 🎉</h2>
            <p className="text-gray-600 text-sm">Your temporary admission number is <span className="font-mono font-bold text-gray-900">{j.registrationNumber}</span>. All your details and documents have been sent for enrollment. Welcome aboard!</p>
          </Card>
        </Content>
      </PageShell>
    )
  }

  // ── Screen: provisional admission granted → documents + tuition fee ──
  if (j.provisionalAdmissionStatus === 'Granted') {
    const allMandatoryVerified = j.documents.filter(d => d.mandatory).every(d => d.status === 'Verified')
    return (
      <PageShell>
        <Hero application={j.application} macroStep={macroStep} />
        <Content>
          <ApplicantBar application={j.application} />
          <Card className="mb-6">
            <CheckCircle2 size={36} className="text-emerald-600 mb-2" />
            <h2 className="text-xl font-bold text-gray-900 mb-1">Provisional Admission Granted</h2>
            <p className="text-gray-500 text-sm">Temporary Admission Number: <span className="font-mono font-bold text-gray-800">{j.registrationNumber}</span>. Upload your documents and pay the tuition fee below to complete your admission.</p>
          </Card>

          <Card className="mb-6">
            <h3 className="font-bold text-gray-900 mb-4">📄 Document Checklist</h3>
            <div className="space-y-2.5">
              {j.documents.map(doc => (
                <div key={doc.type} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{doc.type} {doc.mandatory && <span className="text-red-500">*</span>}</p>
                    <p className="text-xs text-gray-500">
                      {doc.status === 'Verified' ? '✅ Verified' : doc.status === 'Rejected' ? '❌ Rejected — please re-upload' : doc.uploaded ? '⏳ Uploaded, pending verification' : 'Not uploaded yet'}
                    </p>
                  </div>
                  <label className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 flex-shrink-0 hover:brightness-110 transition-all" style={primaryBtnStyle}>
                    <Upload size={13} /> {doc.uploaded ? 'Re-upload' : 'Upload'}
                    <input type="file" className="hidden" onChange={(e) => e.target.files[0] && handleDocUpload(doc.type, e.target.files[0])} />
                  </label>
                </div>
              ))}
            </div>
          </Card>

          {!j.tuitionFeePaid ? (
            <PaymentScreen
              token={token} feeType="Tuition Fee" amount={j.tuitionFeeAmount}
              title="Pay Minimum Tuition Fee" description="Pay the minimum tuition fee assigned to your program to finish your admission."
              onSubmitted={fetchJourney}
            />
          ) : (
            <Card className="text-center">
              <Clock size={36} className="text-amber-500 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold text-sm">Tuition fee received. {allMandatoryVerified ? 'Finalizing your admission...' : 'Waiting for all mandatory documents to be verified.'}</p>
            </Card>
          )}
        </Content>
      </PageShell>
    )
  }

  // ── Screen: registration fee (after full form submitted) ──
  if (fullFormSubmitted) {
    return (
      <PageShell>
        <Hero application={j.application} macroStep={macroStep} />
        <Content>
          <ApplicantBar application={j.application} />
          {!j.registrationFeePaid ? (
            <PaymentScreen
              token={token} feeType="Registration Fee" amount={j.registrationFeeAmount}
              title="Pay Registration Fee" description="Pay your registration fee to receive provisional admission."
              onSubmitted={fetchJourney}
            />
          ) : (
            <Card className="text-center">
              <Clock size={36} className="text-amber-500 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold text-sm">Registration fee received. Finalizing your provisional admission...</p>
            </Card>
          )}
        </Content>
      </PageShell>
    )
  }

  // ── Screen: booking fee paid → fuller admission form (3-step wizard) ──
  if (j.bookingFeeStatus === 'Paid') {
    const steps = [
      {
        title: 'Guardian & Financial Information',
        subtitle: 'Helps us understand your family background for scholarship eligibility.',
        render: () => (
          <>
            <Field label="Guardian's Occupation">
              <input className={inputCls} name="guardianOccupation" value={fullFormData.guardianOccupation} onChange={handleFullFormChange} placeholder="e.g., Farmer, Business, Salaried" />
            </Field>
            <Field label="Guardian's Annual Income (₹)">
              <input className={inputCls} type="number" name="guardianAnnualIncome" value={fullFormData.guardianAnnualIncome} onChange={handleFullFormChange} placeholder="e.g., 300000" />
            </Field>
          </>
        )
      },
      {
        title: 'Previous Institution & Entrance Exam',
        subtitle: 'Tell us where you studied last, and any entrance exam you took.',
        render: () => (
          <>
            <Field label="Previous Institution Name">
              <input className={inputCls} name="previousInstitution" value={fullFormData.previousInstitution} onChange={handleFullFormChange} />
            </Field>
            <Field label="Transfer Certificate (TC) Number">
              <input className={inputCls} name="tcNumber" value={fullFormData.tcNumber} onChange={handleFullFormChange} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Exam Name" hint="If applicable"><input className={inputCls} name="entranceExamName" value={fullFormData.entranceExamName} onChange={handleFullFormChange} placeholder="e.g., JEE, NEET" /></Field>
              <Field label="Roll No"><input className={inputCls} name="entranceExamRollNo" value={fullFormData.entranceExamRollNo} onChange={handleFullFormChange} /></Field>
              <Field label="Score / Rank"><input className={inputCls} name="entranceExamScore" value={fullFormData.entranceExamScore} onChange={handleFullFormChange} /></Field>
            </div>
          </>
        )
      },
      {
        title: 'Bank Details & Preferences',
        subtitle: 'Bank details are used only for refunds, if any. Choose your accommodation needs below.',
        render: () => (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Bank Name"><input className={inputCls} name="bankName" value={fullFormData.bankName} onChange={handleFullFormChange} /></Field>
              <Field label="Account Number"><input className={inputCls} name="bankAccountNumber" value={fullFormData.bankAccountNumber} onChange={handleFullFormChange} /></Field>
              <Field label="IFSC Code"><input className={inputCls} name="bankIFSC" value={fullFormData.bankIFSC} onChange={handleFullFormChange} style={{ textTransform: 'uppercase' }} /></Field>
            </div>
            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" name="hostelRequired" checked={fullFormData.hostelRequired} onChange={handleFullFormChange} className="w-4 h-4 accent-teal-700" /> Hostel Required
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" name="transportRequired" checked={fullFormData.transportRequired} onChange={handleFullFormChange} className="w-4 h-4 accent-teal-700" /> Transport Required
              </label>
            </div>
          </>
        )
      }
    ]
    return (
      <PageShell>
        <Hero application={j.application} macroStep={macroStep} />
        <Content>
          <ApplicantBar application={j.application} />
          <StepWizard steps={steps} onFinish={handleSubmitFullForm} finishLabel="Submit Full Admission Form" submitting={submitting} />
        </Content>
      </PageShell>
    )
  }

  // ── Screen: approved, awaiting booking fee ──
  if (j.admissionDetailsStatus === 'Approved') {
    return (
      <PageShell>
        <Hero application={j.application} macroStep={macroStep} />
        <Content>
          <ApplicantBar application={j.application} />
          <PaymentScreen
            token={token} feeType="Booking Fee" amount={j.bookingFeeAmount}
            title="Pay Booking Fee" description="Your admission details are approved! Pay the booking fee to secure your seat and proceed."
            onSubmitted={fetchJourney}
          />
        </Content>
      </PageShell>
    )
  }

  // ── Screen: submitted, awaiting counselor review ──
  if (j.alreadyFilled && j.admissionDetailsStatus === 'Pending') {
    return (
      <PageShell>
        <Hero application={j.application} macroStep={macroStep} />
        <Content>
          <ApplicantBar application={j.application} />
          <Card className="text-center">
            <Clock size={44} className="text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Awaiting Counselor Review</h2>
            <p className="text-gray-600 text-sm">Your admission details have been submitted and are being reviewed by our admissions team. You'll be notified by email once approved.</p>
          </Card>
        </Content>
      </PageShell>
    )
  }

  // ── Screen: fill basic + academic details — 5-step wizard (first visit, or resubmit after rejection) ──
  const rejected = j.admissionDetailsStatus === 'Rejected'

  const reviewRow = (label, value) => (
    <div className="flex justify-between py-2 border-b border-gray-50 text-sm gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value || <span className="text-gray-300 italic">—</span>}</span>
    </div>
  )

  const step1Steps = [
    {
      title: 'About You',
      subtitle: 'A little about yourself and your family.',
      validate: () => (!formData.dateOfBirth || !formData.fatherName || !formData.motherName) ? "Please fill Date of Birth, Father's Name, and Mother's Name to continue." : null,
      render: () => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date of Birth" required><input className={inputCls} type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} /></Field>
          <Field label="Nationality"><input className={inputCls} name="nationality" value={formData.nationality} onChange={handleChange} placeholder="e.g., Indian" /></Field>
          <Field label="Father's Name" required><input className={inputCls} name="fatherName" value={formData.fatherName} onChange={handleChange} /></Field>
          <Field label="Mother's Name" required><input className={inputCls} name="motherName" value={formData.motherName} onChange={handleChange} /></Field>
        </div>
      )
    },
    {
      title: 'Where You Live',
      subtitle: 'Your permanent address details.',
      validate: () => (!formData.state || !formData.city || formData.pincode.length !== 6) ? 'Please select your State, City, and enter a valid 6-digit Pincode.' : null,
      render: () => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Address"><textarea className={inputCls} name="address" value={formData.address} onChange={handleChange} rows="2" /></Field>
          </div>
          <Field label="Country">
            <select className={inputCls} name="country" value={formData.country} onChange={handleChange}>
              <option value="India">India</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field label="Pincode" required>
            <input className={inputCls} type="text" inputMode="numeric" name="pincode" value={formData.pincode} onChange={handleChange} maxLength={6} placeholder="6-digit PIN code" />
          </Field>
          <Field label="State" required>
            <select className={inputCls} name="state" value={formData.state} onChange={handleChange}>
              <option value="">-- Select State --</option>
              {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="City / District" required>
            <select className={inputCls} name="city" value={formData.city} onChange={handleChange} disabled={!formData.state}>
              <option value="">{formData.state ? '-- Select City --' : 'Select a state first'}</option>
              {getDistrictsForState(formData.state).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Religion"><input className={inputCls} name="religion" value={formData.religion} onChange={handleChange} /></Field>
          <Field label="Caste Category">
            <select className={inputCls} name="caste" value={formData.caste} onChange={handleChange}>
              <option value="">-- Select --</option>
              {CASTE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Subcaste" hint="If applicable"><input className={inputCls} name="subcaste" value={formData.subcaste} onChange={handleChange} /></Field>
        </div>
      )
    },
    {
      title: 'Academic Record',
      subtitle: 'Your 10th, 12th, and graduation details (if applicable).',
      render: () => (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">10th Grade</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className={inputCls} type="number" name="tenthMarks" value={formData.tenthMarks} onChange={handleChange} placeholder="Marks" />
              <input className={inputCls} type="number" step="0.01" name="tenthPercentage" value={formData.tenthPercentage} onChange={handleChange} placeholder="Percentage (%)" />
              <input className={inputCls} type="text" name="tenthBoard" value={formData.tenthBoard} onChange={handleChange} placeholder="Board (e.g., CBSE)" />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">12th Grade</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className={inputCls} type="number" name="twelfthMarks" value={formData.twelfthMarks} onChange={handleChange} placeholder="Marks" />
              <input className={inputCls} type="number" step="0.01" name="twelfthPercentage" value={formData.twelfthPercentage} onChange={handleChange} placeholder="Percentage (%)" />
              <input className={inputCls} type="text" name="twelfthBoard" value={formData.twelfthBoard} onChange={handleChange} placeholder="Board (e.g., CBSE)" />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Graduation (if applicable)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className={inputCls} type="text" name="graduationMarks" value={formData.graduationMarks} onChange={handleChange} placeholder="Marks/CGPA" />
              <input className={inputCls} type="number" step="0.01" name="graduationPercentage" value={formData.graduationPercentage} onChange={handleChange} placeholder="Percentage (%)" />
              <input className={inputCls} type="text" name="graduationUniversity" value={formData.graduationUniversity} onChange={handleChange} placeholder="University" />
            </div>
          </div>
          <textarea className={inputCls} name="otherCertifications" value={formData.otherCertifications} onChange={handleChange} placeholder="Other Certifications/Achievements (JEE, NEET, awards, etc.)" rows="2" />
        </div>
      )
    },
    {
      title: 'A Few More Details',
      subtitle: 'Emergency contact and any support you may need.',
      validate: () => (!formData.emergencyContactName || !formData.emergencyContactPhone) ? 'Please provide an emergency contact name and phone number.' : null,
      render: () => (
        <div className="space-y-4">
          <textarea className={inputCls} name="extraCurricularActivities" value={formData.extraCurricularActivities} onChange={handleChange} placeholder="Extra-Curricular Activities" rows="2" />
          <label className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" name="scholarshipRequired" checked={formData.scholarshipRequired} onChange={handleChange} className="w-4 h-4 accent-teal-700" /> Scholarship/Financial Aid Required
          </label>
          <textarea className={inputCls} name="medicalConditions" value={formData.medicalConditions} onChange={handleChange} placeholder="Medical Conditions (if any)" rows="2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Emergency Contact Name" required><input className={inputCls} name="emergencyContactName" value={formData.emergencyContactName} onChange={handleChange} /></Field>
            <Field label="Emergency Contact Phone" required><input className={inputCls} type="tel" name="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={handleChange} /></Field>
          </div>
        </div>
      )
    },
    {
      title: 'Review & Submit',
      subtitle: "Please check everything looks right before submitting for the counselor's review.",
      render: () => (
        <div className="space-y-4">
          {[
            ['Personal', [['Date of Birth', formData.dateOfBirth], ["Father's Name", formData.fatherName], ["Mother's Name", formData.motherName], ['Nationality', formData.nationality]]],
            ['Address', [['Address', formData.address], ['Country', formData.country], ['State', formData.state], ['City', formData.city], ['Pincode', formData.pincode], ['Religion', formData.religion], ['Caste', formData.caste], ['Subcaste', formData.subcaste]]],
            ['Academic', [['10th %', formData.tenthPercentage], ['12th %', formData.twelfthPercentage], ['Graduation %', formData.graduationPercentage]]],
            ['Additional', [['Emergency Contact', formData.emergencyContactName], ['Emergency Phone', formData.emergencyContactPhone], ['Scholarship Needed', formData.scholarshipRequired ? 'Yes' : 'No']]]
          ].map(([section, rows]) => (
            <div key={section} className="border border-gray-100 rounded-lg p-4">
              <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-1">{section}</p>
              {rows.map(([label, value]) => <React.Fragment key={label}>{reviewRow(label, value)}</React.Fragment>)}
            </div>
          ))}
          <p className="text-xs text-gray-400 flex items-center gap-1.5"><Pencil size={12} /> Use Back to change any answer before submitting.</p>
        </div>
      )
    }
  ]

  return (
    <PageShell>
      <Hero application={j.application} macroStep={macroStep} />
      <Content>
        <ApplicantBar application={j.application} />
        {rejected && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-bold text-red-900 text-sm">Changes Requested</p>
            <p className="text-sm text-red-800">Your admission details need a correction — please review and resubmit below.</p>
          </div>
        )}
        <StepWizard steps={step1Steps} onFinish={handleSubmitStep1} finishLabel="Submit for Review" submitting={submitting} />
      </Content>
    </PageShell>
  )
}
