import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader, Clock, Upload } from 'lucide-react'
import { INDIA_STATES, getDistrictsForState, CASTE_CATEGORIES } from '../data/indiaLocations'

// One token drives the whole journey: fill basic details → counselor approval →
// booking fee → fuller admission form → registration fee → provisional admission
// → document upload + tuition fee → CampusOne sync. GET /api/admission-details/:token
// returns the application's current stage flags; this component just renders
// whichever screen is next.

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">{children}</div>
    </div>
  )
}

function Header({ application, badge }) {
  if (!application) return null
  return (
    <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Admission Journey</h1>
      <p className="text-gray-600 mb-4">{application.name} — {application.course || 'N/A'}</p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-gray-700"><span className="font-bold">Email:</span> {application.email}</p>
        <p className="text-sm text-gray-700"><span className="font-bold">Mobile:</span> {application.mobile}</p>
      </div>
      {badge}
    </div>
  )
}

// ── Payment UTR submission form, reused for Booking / Registration / Tuition ──
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
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <Clock size={48} className="text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Submitted</h2>
        <p className="text-gray-600">Your {title.toLowerCase()} reference has been submitted and is awaiting admin confirmation. This page will update once it's approved.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold">
          Check status
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 mb-4">{description}</p>
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-700">Amount to pay: <span className="font-bold text-lg text-indigo-700">₹{Number(amount || 0).toLocaleString('en-IN')}</span></p>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">UTR / Transaction Reference Number</label>
          <input
            type="text" value={utrNumber} onChange={(e) => setUtrNumber(e.target.value)}
            placeholder="Enter after completing your bank transfer / UPI payment"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-semibold flex items-center gap-2">
          {submitting ? <Loader size={16} className="animate-spin" /> : '✓'} {submitting ? 'Submitting...' : 'Submit Payment Reference'}
        </button>
      </form>
    </div>
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name === 'pincode') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 6)
      setFormData(prev => ({ ...prev, pincode: digitsOnly }))
      return
    }
    if (name === 'state') {
      setFormData(prev => ({ ...prev, state: value, city: '' })) // reset city when state changes
      return
    }
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleFullFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setFullFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmitStep1 = async (e) => {
    e.preventDefault()
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

  const handleSubmitFullForm = async (e) => {
    e.preventDefault()
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
    return <Shell><div className="text-center py-24"><Loader size={48} className="animate-spin text-indigo-600 mx-auto mb-4" /><p className="text-gray-700">Loading your admission journey...</p></div></Shell>
  }

  if (error) {
    return (
      <Shell>
        <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-lg mx-auto">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">Invalid Link</h2>
          <p className="text-gray-600 mb-4 text-center">{error}</p>
          <p className="text-sm text-gray-500 text-center">Please check your email for the correct link or contact admissions.</p>
        </div>
      </Shell>
    )
  }

  const j = journey
  const fullFormSubmitted = j.admissionFullDetails && Object.keys(j.admissionFullDetails).length > 0

  // ── Screen 6: done ──
  if (j.campusoneSyncStatus === 'Success') {
    return (
      <Shell>
        <Header application={j.application} />
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle2 size={56} className="text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Admission Complete 🎉</h2>
          <p className="text-gray-600">Your registration number is <span className="font-mono font-bold">{j.registrationNumber}</span>. All your details and documents have been sent for enrollment. Welcome aboard!</p>
        </div>
      </Shell>
    )
  }

  // ── Screen 5: provisional admission granted → documents + tuition fee ──
  if (j.provisionalAdmissionStatus === 'Granted') {
    const allMandatoryVerified = j.documents.filter(d => d.mandatory).every(d => d.status === 'Verified')
    return (
      <Shell>
        <Header application={j.application} />
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <CheckCircle2 size={40} className="text-green-600 mb-2" />
          <h2 className="text-xl font-bold text-gray-900 mb-1">Provisional Admission Granted</h2>
          <p className="text-gray-600">Registration Number: <span className="font-mono font-bold">{j.registrationNumber}</span>. Upload your documents and pay the tuition fee below to complete your admission.</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">📄 Document Checklist</h3>
          <div className="space-y-3">
            {j.documents.map(doc => (
              <div key={doc.type} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{doc.type} {doc.mandatory && <span className="text-red-500">*</span>}</p>
                  <p className="text-xs text-gray-500">
                    {doc.status === 'Verified' ? '✅ Verified' : doc.status === 'Rejected' ? '❌ Rejected — please re-upload' : doc.uploaded ? '⏳ Uploaded, pending verification' : 'Not uploaded yet'}
                  </p>
                </div>
                <label className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5">
                  <Upload size={14} /> {doc.uploaded ? 'Re-upload' : 'Upload'}
                  <input type="file" className="hidden" onChange={(e) => e.target.files[0] && handleDocUpload(doc.type, e.target.files[0])} />
                </label>
              </div>
            ))}
          </div>
        </div>

        {!j.tuitionFeePaid ? (
          <PaymentScreen
            token={token} feeType="Tuition Fee" amount={j.tuitionFeeAmount}
            title="Pay Minimum Tuition Fee" description="Pay the minimum tuition fee assigned to your program to finish your admission."
            onSubmitted={fetchJourney}
          />
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <Clock size={40} className="text-amber-500 mx-auto mb-3" />
            <p className="text-gray-700 font-semibold">Tuition fee received. {allMandatoryVerified ? 'Finalizing your admission...' : 'Waiting for all mandatory documents to be verified.'}</p>
          </div>
        )}
      </Shell>
    )
  }

  // ── Screen 4: registration fee (after full form submitted) ──
  if (fullFormSubmitted) {
    if (!j.registrationFeePaid) {
      return (
        <Shell>
          <Header application={j.application} />
          <PaymentScreen
            token={token} feeType="Registration Fee" amount={j.registrationFeeAmount}
            title="Pay Registration Fee" description="Pay your registration fee to receive provisional admission."
            onSubmitted={fetchJourney}
          />
        </Shell>
      )
    }
    return (
      <Shell>
        <Header application={j.application} />
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <Clock size={40} className="text-amber-500 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold">Registration fee received. Finalizing your provisional admission...</p>
        </div>
      </Shell>
    )
  }

  // ── Screen 3: booking fee paid → fuller admission form ──
  if (j.bookingFeeStatus === 'Paid') {
    return (
      <Shell>
        <Header application={j.application} />
        <form onSubmit={handleSubmitFullForm} className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 pb-3 border-b-2 border-indigo-200">📝 Full Admission Form</h2>

          <div>
            <h3 className="font-bold text-gray-900 mb-3">Guardian / Financial Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="guardianOccupation" value={fullFormData.guardianOccupation} onChange={handleFullFormChange} placeholder="Guardian's Occupation" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input name="guardianAnnualIncome" type="number" value={fullFormData.guardianAnnualIncome} onChange={handleFullFormChange} placeholder="Guardian's Annual Income (₹)" className="px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-3">Previous Institution</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="previousInstitution" value={fullFormData.previousInstitution} onChange={handleFullFormChange} placeholder="Previous Institution Name" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input name="tcNumber" value={fullFormData.tcNumber} onChange={handleFullFormChange} placeholder="Transfer Certificate (TC) Number" className="px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-3">Entrance Exam (if applicable)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input name="entranceExamName" value={fullFormData.entranceExamName} onChange={handleFullFormChange} placeholder="Exam Name" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input name="entranceExamRollNo" value={fullFormData.entranceExamRollNo} onChange={handleFullFormChange} placeholder="Roll No" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input name="entranceExamScore" value={fullFormData.entranceExamScore} onChange={handleFullFormChange} placeholder="Score / Rank" className="px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-3">Bank Details (for refunds)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input name="bankName" value={fullFormData.bankName} onChange={handleFullFormChange} placeholder="Bank Name" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input name="bankAccountNumber" value={fullFormData.bankAccountNumber} onChange={handleFullFormChange} placeholder="Account Number" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input name="bankIFSC" value={fullFormData.bankIFSC} onChange={handleFullFormChange} placeholder="IFSC Code" className="px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" name="hostelRequired" checked={fullFormData.hostelRequired} onChange={handleFullFormChange} className="w-4 h-4" /> Hostel Required
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" name="transportRequired" checked={fullFormData.transportRequired} onChange={handleFullFormChange} className="w-4 h-4" /> Transport Required
            </label>
          </div>

          <button type="submit" disabled={submitting} className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold disabled:opacity-50 flex items-center gap-2">
            {submitting ? <Loader size={18} className="animate-spin" /> : '✅'} {submitting ? 'Saving...' : 'Submit Full Admission Form'}
          </button>
        </form>
      </Shell>
    )
  }

  // ── Screen 2: approved, awaiting booking fee ──
  if (j.admissionDetailsStatus === 'Approved') {
    return (
      <Shell>
        <Header application={j.application} />
        <PaymentScreen
          token={token} feeType="Booking Fee" amount={j.bookingFeeAmount}
          title="Pay Booking Fee" description="Your admission details are approved! Pay the booking fee to secure your seat and proceed."
          onSubmitted={fetchJourney}
        />
      </Shell>
    )
  }

  // ── Screen 1b: submitted, awaiting counselor review ──
  if (j.alreadyFilled && j.admissionDetailsStatus === 'Pending') {
    return (
      <Shell>
        <Header application={j.application} />
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <Clock size={48} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Awaiting Counselor Review</h2>
          <p className="text-gray-600">Your admission details have been submitted and are being reviewed by our admissions team. You'll be notified by email once approved.</p>
        </div>
      </Shell>
    )
  }

  // ── Screen 1: fill basic + academic details (first visit, or resubmit after rejection) ──
  const rejected = j.admissionDetailsStatus === 'Rejected'
  return (
    <Shell>
      <Header application={j.application} badge={rejected && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-bold text-red-900">Changes Requested</p>
          <p className="text-sm text-red-800">Your admission details need a correction — please review and resubmit below.</p>
        </div>
      )} />

      <form onSubmit={handleSubmitStep1} className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-indigo-200">👤 Personal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Birth</label>
              <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Father's Name</label>
              <input type="text" name="fatherName" value={formData.fatherName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mother's Name</label>
              <input type="text" name="motherName" value={formData.motherName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nationality</label>
              <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} placeholder="e.g., Indian" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
              <textarea name="address" value={formData.address} onChange={handleChange} rows="2" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
              <select name="country" value={formData.country} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                <option value="India">India</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
              <select name="state" value={formData.state} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                <option value="">-- Select State --</option>
                {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">City / District</label>
              <select name="city" value={formData.city} onChange={handleChange} disabled={!formData.state} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100">
                <option value="">{formData.state ? '-- Select City --' : 'Select a state first'}</option>
                {getDistrictsForState(formData.state).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Pincode</label>
              <input
                type="text" inputMode="numeric" name="pincode" value={formData.pincode} onChange={handleChange}
                maxLength={6} placeholder="6-digit PIN code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Religion</label>
              <input type="text" name="religion" value={formData.religion} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Caste Category</label>
              <select name="caste" value={formData.caste} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                <option value="">-- Select --</option>
                {CASTE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Subcaste</label>
              <input type="text" name="subcaste" value={formData.subcaste} onChange={handleChange} placeholder="If applicable" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-indigo-200">🎓 Academic Information</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-gray-900 mb-3">10th Grade</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="number" name="tenthMarks" value={formData.tenthMarks} onChange={handleChange} placeholder="Marks" className="px-4 py-2 border border-gray-300 rounded-lg" />
                <input type="number" step="0.01" name="tenthPercentage" value={formData.tenthPercentage} onChange={handleChange} placeholder="Percentage (%)" className="px-4 py-2 border border-gray-300 rounded-lg" />
                <input type="text" name="tenthBoard" value={formData.tenthBoard} onChange={handleChange} placeholder="Board (e.g., CBSE)" className="px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-3">12th Grade</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="number" name="twelfthMarks" value={formData.twelfthMarks} onChange={handleChange} placeholder="Marks" className="px-4 py-2 border border-gray-300 rounded-lg" />
                <input type="number" step="0.01" name="twelfthPercentage" value={formData.twelfthPercentage} onChange={handleChange} placeholder="Percentage (%)" className="px-4 py-2 border border-gray-300 rounded-lg" />
                <input type="text" name="twelfthBoard" value={formData.twelfthBoard} onChange={handleChange} placeholder="Board (e.g., CBSE)" className="px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Graduation (if applicable)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" name="graduationMarks" value={formData.graduationMarks} onChange={handleChange} placeholder="Marks/CGPA" className="px-4 py-2 border border-gray-300 rounded-lg" />
                <input type="number" step="0.01" name="graduationPercentage" value={formData.graduationPercentage} onChange={handleChange} placeholder="Percentage (%)" className="px-4 py-2 border border-gray-300 rounded-lg" />
                <input type="text" name="graduationUniversity" value={formData.graduationUniversity} onChange={handleChange} placeholder="University" className="px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <textarea name="otherCertifications" value={formData.otherCertifications} onChange={handleChange} placeholder="Other Certifications/Achievements (JEE, NEET, awards, etc.)" rows="3" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-indigo-200">➕ Additional Information</h2>
          <div className="space-y-4">
            <textarea name="extraCurricularActivities" value={formData.extraCurricularActivities} onChange={handleChange} placeholder="Extra-Curricular Activities" rows="3" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
            <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
              <input type="checkbox" name="scholarshipRequired" checked={formData.scholarshipRequired} onChange={handleChange} className="w-4 h-4" /> Scholarship/Financial Aid Required
            </label>
            <textarea name="medicalConditions" value={formData.medicalConditions} onChange={handleChange} placeholder="Medical Conditions (if any)" rows="3" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" name="emergencyContactName" value={formData.emergencyContactName} onChange={handleChange} placeholder="Emergency Contact Name" className="px-4 py-2 border border-gray-300 rounded-lg" />
              <input type="tel" name="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={handleChange} placeholder="Emergency Contact Phone" className="px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
        </div>

        <button type="submit" disabled={submitting} className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-lg disabled:opacity-50 flex items-center gap-2">
          {submitting ? <Loader size={20} className="animate-spin" /> : '✅'} {submitting ? 'Saving...' : 'Save Admission Details'}
        </button>
      </form>
    </Shell>
  )
}
