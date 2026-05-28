import React, { useState } from 'react'
import { GraduationCap, CheckCircle, Phone, Mail, MapPin, BookOpen, Send, AlertCircle } from 'lucide-react'

const COURSES = [
  'B.Tech CSE', 'B.Tech ECE', 'B.Tech Civil', 'B.Tech Mech',
  'BCA', 'BBA', 'B.Com', 'MBA', 'MBA (Finance)', 'MBA (HR)',
  'M.Tech', 'M.Sc Agriculture', 'MCA', 'B.Sc Agriculture', 'Other'
]

const STATES = [
  'Andhra Pradesh', 'Odisha', 'Telangana', 'West Bengal', 'Jharkhand',
  'Chhattisgarh', 'Bihar', 'Maharashtra', 'Tamil Nadu', 'Karnataka', 'Other'
]

const SOURCES = [
  'Google Search', 'Facebook', 'Friend / Family Referral', 'Education Fair',
  'Walk-in', 'YouTube', 'WhatsApp', 'Other'
]

export default function PublicInquiry() {
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', state: '', city: '', course: '', source: ''
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverMsg, setServerMsg] = useState('')

  const validate = () => {
    const e = {}
    if (!form.name.trim() || form.name.trim().length < 2) e.name = 'Please enter your full name.'
    if (!form.mobile || !/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, ''))) e.mobile = 'Enter a valid 10-digit mobile number.'
    if (!form.course) e.course = 'Please select a course.'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email address.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      const res = await fetch('/api/public/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: form.source || 'Website' })
      })
      const data = await res.json()
      setServerMsg(data.message || 'Thank you! Our team will contact you within 24 hours.')
      setSubmitted(true)
    } catch {
      setErrors({ submit: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const set = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Inquiry Received! 🎉</h2>
          <p className="text-slate-600">{serverMsg}</p>
          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2">
            <p className="text-sm text-slate-500">What happens next:</p>
            <div className="flex items-center gap-2 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">1</span> Our counselor will call within 24 hours</div>
            <div className="flex items-center gap-2 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">2</span> You'll receive course brochure via WhatsApp</div>
            <div className="flex items-center gap-2 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">3</span> Schedule a campus visit or virtual session</div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-400">For urgent queries, call us at:</p>
            <a href="tel:+916742559441" className="flex items-center justify-center gap-2 text-primary-600 font-semibold">
              <Phone size={16} /> +91 674 2559441
            </a>
          </div>
          <button
            onClick={() => { setSubmitted(false); setForm({ name:'', email:'', mobile:'', state:'', city:'', course:'', source:'' }) }}
            className="text-sm text-primary-600 underline"
          >
            Submit another inquiry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-stretch">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-2/5 p-12 text-white">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <GraduationCap size={28} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-xl">CUTM</div>
              <div className="text-primary-200 text-sm">Centurion University of Technology & Management</div>
            </div>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Shape Your Future with<br />World-Class Education
          </h1>
          <p className="text-primary-100 text-lg mb-8">
            Join 10,000+ students across Odisha and Andhra Pradesh. Apply for CUEE 2026 today.
          </p>
          {[
            { icon: GraduationCap, text: '100+ Programs across Engineering, Management, Agriculture & Science' },
            { icon: MapPin, text: 'Campuses in Bhubaneswar, Vizianagaram, Paralakhemundi & Balasore' },
            { icon: BookOpen, text: 'NBA/NAAC accredited with 95%+ placement record' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <item.icon size={18} />
              </div>
              <p className="text-primary-100 text-sm leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-white/20 pt-6">
          <div className="flex items-center gap-4 text-sm text-primary-200">
            <a href="tel:+916742559441" className="flex items-center gap-1 hover:text-white"><Phone size={14} /> +91 674 2559441</a>
            <a href="mailto:admissions@cutm.ac.in" className="flex items-center gap-1 hover:text-white"><Mail size={14} /> admissions@cutm.ac.in</a>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 bg-white lg:rounded-l-3xl flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <GraduationCap size={24} className="text-primary-600" />
            <span className="font-bold text-primary-600">CUTM Admissions 2026</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Request Information</h2>
          <p className="text-slate-500 text-sm mb-8">Fill the form — our counselor calls within 24 hours.</p>

          {errors.submit && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-red-700 text-sm">
              <AlertCircle size={16} /> {errors.submit}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Enter your full name"
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition ${errors.name ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mobile <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={e => set('mobile', e.target.value)}
                  placeholder="10-digit number"
                  maxLength={10}
                  className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.mobile ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                />
                {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="your@email.com"
                  className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.email ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Course Interested In <span className="text-red-500">*</span></label>
              <select
                value={form.course}
                onChange={e => set('course', e.target.value)}
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.course ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
              >
                <option value="">-- Select Course --</option>
                {COURSES.map(c => <option key={c}>{c}</option>)}
              </select>
              {errors.course && <p className="text-red-500 text-xs mt-1">{errors.course}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <select
                  value={form.state}
                  onChange={e => set('state', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- State --</option>
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  placeholder="Your city"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">How did you hear about us?</label>
              <select
                value={form.source}
                onChange={e => set('source', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Select Source --</option>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : <Send size={18} />}
              {loading ? 'Submitting...' : 'Submit Inquiry'}
            </button>

            <p className="text-center text-xs text-slate-400 mt-4">
              By submitting, you agree to be contacted by CUTM admissions team. Your information is kept confidential.
            </p>
          </form>

          {/* Check application status link */}
          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Already applied?{' '}
              <a href="/student-portal" className="text-primary-600 font-semibold hover:underline">
                Check your application status →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
