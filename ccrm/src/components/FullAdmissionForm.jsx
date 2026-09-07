import React, { useState } from 'react'
import { User, Users, MapPin, GraduationCap, BookOpen, Upload, Check, Loader, AlertCircle, ChevronRight, CheckCircle2 } from 'lucide-react'
import { INDIA_STATES, CASTE_CATEGORIES } from '../data/indiaLocations'

// The fuller admission form — Step 2 of the journey, unlocked once the booking
// fee is paid. Matches the university's CampusOne intake form: six tabs a
// student can jump between freely (not a strict linear wizard), with document
// upload folded in as the last tab so everything the counselor needs to review
// arrives in one submission.

const TABS = [
  { key: 'personal', label: 'Personal Details', icon: User },
  { key: 'parent', label: "Parent's Details", icon: Users },
  { key: 'address', label: 'Address Details', icon: MapPin },
  { key: 'program', label: 'Program Details', icon: GraduationCap },
  { key: 'academic', label: 'Academic Details', icon: BookOpen },
  { key: 'documents', label: 'Upload Documents', icon: Upload },
]

const inputCls = "w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 outline-none transition-colors disabled:bg-gray-100 disabled:text-gray-400"
const labelCls = "block text-sm font-semibold text-gray-700 mb-1.5"
const primaryBtnStyle = { background: 'linear-gradient(135deg,#0d9488,#0369a1)' }

function Field({ label, required, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function SectionTitle({ children }) {
  return <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mt-6 mb-3 first:mt-0">{children}</p>
}

const emptyData = {
  // Personal
  firstName: '', middleName: '', lastName: '', dob: '', gender: '', nationality: 'Indian',
  category: '', caste: '', residentialStatus: '', stream: '', religion: '',
  aadharNumber: '', abcId: '', passportNo: '', physicallyChallenged: 'No', maritalStatus: '',
  motherTongue: '', howDidYouKnow: '', howDidYouKnowOther: '', whyChooseUs: '', whyChooseUsOther: '',
  panNumber: '', bloodGroup: '',
  // Parent's — Father
  fatherSalutation: '', fatherFirstName: '', fatherMiddleName: '', fatherLastName: '', fatherMobile: '',
  fatherHomePhone: '', fatherEmail: '', fatherQualification: '', fatherOccupation: '', fatherDesignation: '',
  fatherCompany: '', fatherPan: '', fatherAnnualIncome: '',
  // Parent's — Mother
  motherSalutation: '', motherFirstName: '', motherMiddleName: '', motherLastName: '', motherMobile: '',
  motherHomePhone: '', motherEmail: '', motherQualification: '', motherOccupation: '',
  // Local Guardian
  guardianSalutation: '', guardianFirstName: '', guardianMiddleName: '', guardianLastName: '',
  guardianEmail: '', guardianHomePhone: '', guardianMobile: '', guardianRelationship: '',
  guardianCompany: '', guardianOccupation: '', guardianDetails: '',
  // Siblings & family income
  siblingsCount: '', siblingsQualification: '', financialYear: '', familyIncome: '',
  // Address — present
  presentAddress1: '', presentAddress2: '', presentCountry: 'India', presentState: '', presentDistrict: '', presentCity: '', presentPincode: '',
  // Address — permanent
  sameAsPresent: false,
  permanentAddress1: '', permanentAddress2: '', permanentCountry: 'India', permanentState: '', permanentDistrict: '', permanentCity: '', permanentPincode: '',
  // Program
  specialization: '', campus: '', admissionCategory: '', academicSession: '',
  hostelRequired: false, transportRequired: false,
  bankName: '', bankAccountNumber: '', bankIFSC: '',
  // Academic
  previousInstitution: '', tcNumber: '', qualifyingExamName: '', qualifyingYear: '', qualifyingPercentage: '',
  entranceExamName: '', entranceExamRollNo: '', entranceExamScore: '',
}

const REQUIRED_FIELDS = {
  personal: [['firstName', 'First Name'], ['lastName', 'Last Name'], ['dob', 'Date of Birth'], ['gender', 'Gender'],
    ['category', 'Category'], ['caste', 'Caste'], ['religion', 'Religion'], ['aadharNumber', 'Aadhar Card No'], ['motherTongue', 'Mother Tongue']],
  parent: [['fatherFirstName', "Father's First Name"], ['fatherMobile', "Father's Mobile Number"],
    ['motherFirstName', "Mother's First Name"], ['motherMobile', "Mother's Mobile Number"]],
  address: [['presentAddress1', 'Present Address Line 1'], ['presentState', 'Present State'], ['presentDistrict', 'Present District'],
    ['presentCity', 'Present Town/City'], ['presentPincode', 'Present Pin Code']],
  program: [],
  academic: [['previousInstitution', 'Previous Institution Name']],
  documents: [],
}

export default function FullAdmissionForm({ app, initialData, documents = [], onSubmit, onUploadDoc, submitting, rejected, reviewNote }) {
  const [tab, setTab] = useState('personal')
  const [data, setData] = useState(() => ({
    ...emptyData,
    firstName: (app?.name || '').split(' ')[0] || '',
    lastName: (app?.name || '').split(' ').slice(1).join(' ') || '',
    ...(initialData || {}),
  }))
  const [errors, setErrors] = useState([])

  const set = (name, value) => setData(prev => ({ ...prev, [name]: value }))
  const onChange = (e) => {
    const { name, value, type, checked } = e.target
    if (name === 'presentPincode' || name === 'permanentPincode') return set(name, value.replace(/\D/g, '').slice(0, 6))
    if (name === 'aadharNumber') return set(name, value.replace(/\D/g, '').slice(0, 12))
    if (name === 'presentState') { setData(prev => ({ ...prev, presentState: value, presentDistrict: '' })); return }
    if (name === 'permanentState') { setData(prev => ({ ...prev, permanentState: value, permanentDistrict: '' })); return }
    if (name === 'sameAsPresent') {
      setData(prev => ({
        ...prev, sameAsPresent: checked,
        ...(checked ? {
          permanentAddress1: prev.presentAddress1, permanentAddress2: prev.presentAddress2, permanentCountry: prev.presentCountry,
          permanentState: prev.presentState, permanentDistrict: prev.presentDistrict, permanentCity: prev.presentCity, permanentPincode: prev.presentPincode
        } : {})
      }))
      return
    }
    set(name, type === 'checkbox' ? checked : value)
  }

  const tabIndex = TABS.findIndex(t => t.key === tab)
  const isLastTab = tabIndex === TABS.length - 1

  const validateAll = () => {
    const missing = []
    for (const [tKey, fields] of Object.entries(REQUIRED_FIELDS)) {
      for (const [field, label] of fields) {
        if (!String(data[field] || '').trim()) missing.push({ tab: tKey, label })
      }
    }
    return missing
  }

  const goNext = () => {
    if (!isLastTab) { setTab(TABS[tabIndex + 1].key); setErrors([]); return }
    const missing = validateAll()
    if (missing.length) {
      setErrors(missing)
      setTab(missing[0].tab)
      return
    }
    setErrors([])
    onSubmit(data)
  }

  const mandatoryDocs = documents.filter(d => d.mandatory)
  const mandatoryUploaded = mandatoryDocs.filter(d => d.uploaded).length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {rejected && (
        <div className="m-6 mb-0 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-bold text-red-900 text-sm">Changes Requested</p>
          <p className="text-sm text-red-800">Your admission form needs a correction{reviewNote?.by ? ` (reviewed by ${reviewNote.by})` : ''} — please update and resubmit below.</p>
        </div>
      )}

      {/* Tab strip */}
      <div className="border-b border-gray-100 px-2 sm:px-4 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((t, i) => {
            const Icon = t.icon
            const active = t.key === tab
            const done = i < tabIndex
            return (
              <button
                key={t.key} type="button" onClick={() => { setTab(t.key); setErrors([]) }}
                className={`flex flex-col items-center gap-1.5 px-4 sm:px-6 py-4 border-b-2 transition-colors flex-shrink-0 ${
                  active ? 'border-teal-600 text-teal-700' : done ? 'border-transparent text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  active ? 'text-white' : done ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                }`} style={active ? primaryBtnStyle : undefined}>
                  {done ? <Check size={15} /> : <Icon size={15} />}
                </div>
                <span className="text-[11px] font-semibold whitespace-nowrap">{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {errors.length > 0 && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <div className="flex items-center gap-2 font-semibold mb-1"><AlertCircle size={16} /> Please complete these required fields:</div>
            <ul className="list-disc list-inside">{errors.map((e, i) => <li key={i}>{e.label} <span className="text-red-400">({TABS.find(t => t.key === e.tab)?.label})</span></li>)}</ul>
          </div>
        )}

        {tab === 'personal' && (
          <div>
            <p className="text-xs text-red-500 font-medium mb-4">(*Name of the Applicant As Per Last Qualifying Examination)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="First Name" required><input className={inputCls} name="firstName" value={data.firstName} onChange={onChange} /></Field>
              <Field label="Middle Name"><input className={inputCls} name="middleName" value={data.middleName} onChange={onChange} /></Field>
              <Field label="Last Name" required><input className={inputCls} name="lastName" value={data.lastName} onChange={onChange} /></Field>
              <Field label="Date of Birth" required><input className={inputCls} type="date" name="dob" value={data.dob} onChange={onChange} /></Field>

              <Field label="Gender" required>
                <select className={inputCls} name="gender" value={data.gender} onChange={onChange}>
                  <option value="">Select...</option><option>Male</option><option>Female</option><option>Other</option>
                </select>
              </Field>
              <Field label="Nationality" required><input className={inputCls} name="nationality" value={data.nationality} onChange={onChange} /></Field>
              <Field label="Email Id" required><input className={inputCls} type="email" name="email" value={app?.email || ''} disabled /></Field>
              <Field label="Mobile No" required><input className={inputCls} name="mobile" value={app?.mobile || ''} disabled /></Field>

              <Field label="Category" required>
                <select className={inputCls} name="category" value={data.category} onChange={onChange}>
                  <option value="">Select...</option>{CASTE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Caste" required><input className={inputCls} name="caste" value={data.caste} onChange={onChange} placeholder="Caste" /></Field>
              <Field label="Residential Status">
                <select className={inputCls} name="residentialStatus" value={data.residentialStatus} onChange={onChange}>
                  <option value="">Select...</option><option>Resident Indian</option><option>NRI</option><option>Foreign National</option>
                </select>
              </Field>
              <Field label="Stream">
                <select className={inputCls} name="stream" value={data.stream} onChange={onChange}>
                  <option value="">Select...</option><option>Science</option><option>Commerce</option><option>Arts</option><option>Other</option>
                </select>
              </Field>

              <Field label="Religion" required><input className={inputCls} name="religion" value={data.religion} onChange={onChange} /></Field>
              <Field label="Aadhar Card No" required><input className={inputCls} inputMode="numeric" name="aadharNumber" value={data.aadharNumber} onChange={onChange} maxLength={12} /></Field>
              <Field label="ABC Id"><input className={inputCls} name="abcId" value={data.abcId} onChange={onChange} placeholder="ABC Id..." /></Field>
              <Field label="Passport No"><input className={inputCls} name="passportNo" value={data.passportNo} onChange={onChange} placeholder="Passport no..." /></Field>

              <Field label="Physically Challenged?">
                <select className={inputCls} name="physicallyChallenged" value={data.physicallyChallenged} onChange={onChange}>
                  <option>No</option><option>Yes</option>
                </select>
              </Field>
              <Field label="Marital Status">
                <select className={inputCls} name="maritalStatus" value={data.maritalStatus} onChange={onChange}>
                  <option value="">Select...</option><option>Single</option><option>Married</option>
                </select>
              </Field>
              <Field label="Mother Tongue" required><input className={inputCls} name="motherTongue" value={data.motherTongue} onChange={onChange} /></Field>
              <Field label="Blood Group">
                <select className={inputCls} name="bloodGroup" value={data.bloodGroup} onChange={onChange}>
                  <option value="">Select...</option>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>

              <Field label="How did you know about us?">
                <select className={inputCls} name="howDidYouKnow" value={data.howDidYouKnow} onChange={onChange}>
                  <option value="">Select...</option><option>Social Media</option><option>Friend/Family</option><option>Website</option><option>Newspaper/Ad</option><option>Other</option>
                </select>
                {data.howDidYouKnow === 'Other' && <input className={`${inputCls} mt-2`} name="howDidYouKnowOther" value={data.howDidYouKnowOther} onChange={onChange} placeholder="Please specify" />}
              </Field>
              <Field label="Why did you choose us?">
                <select className={inputCls} name="whyChooseUs" value={data.whyChooseUs} onChange={onChange}>
                  <option value="">Select...</option><option>Reputation</option><option>Faculty</option><option>Placement Record</option><option>Fees</option><option>Other</option>
                </select>
                {data.whyChooseUs === 'Other' && <input className={`${inputCls} mt-2`} name="whyChooseUsOther" value={data.whyChooseUsOther} onChange={onChange} placeholder="Please specify" />}
              </Field>
              <Field label="PAN Card Number"><input className={inputCls} name="panNumber" value={data.panNumber} onChange={onChange} style={{ textTransform: 'uppercase' }} /></Field>
            </div>
          </div>
        )}

        {tab === 'parent' && (
          <div>
            <SectionTitle>Father's Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Father's Salutation" required>
                <select className={inputCls} name="fatherSalutation" value={data.fatherSalutation} onChange={onChange}>
                  <option value="">Select...</option><option>Mr.</option><option>Dr.</option><option>Late Mr.</option>
                </select>
              </Field>
              <Field label="First Name" required><input className={inputCls} name="fatherFirstName" value={data.fatherFirstName} onChange={onChange} /></Field>
              <Field label="Middle Name"><input className={inputCls} name="fatherMiddleName" value={data.fatherMiddleName} onChange={onChange} /></Field>
              <Field label="Last Name"><input className={inputCls} name="fatherLastName" value={data.fatherLastName} onChange={onChange} /></Field>
              <Field label="Mobile Number" required><input className={inputCls} name="fatherMobile" value={data.fatherMobile} onChange={onChange} placeholder="+91-XXXXXXXXXX" /></Field>
              <Field label="Home Phone"><input className={inputCls} name="fatherHomePhone" value={data.fatherHomePhone} onChange={onChange} placeholder="EX.0123456789" /></Field>
              <Field label="Email Id"><input className={inputCls} type="email" name="fatherEmail" value={data.fatherEmail} onChange={onChange} placeholder="ex@example.com" /></Field>
              <Field label="Highest Qualification"><input className={inputCls} name="fatherQualification" value={data.fatherQualification} onChange={onChange} /></Field>
              <Field label="Occupation">
                <select className={inputCls} name="fatherOccupation" value={data.fatherOccupation} onChange={onChange}>
                  <option value="">Select...</option><option>Farmer</option><option>Business</option><option>Salaried</option><option>Self-Employed</option><option>Retired</option><option>Other</option>
                </select>
              </Field>
              <Field label="Designation"><input className={inputCls} name="fatherDesignation" value={data.fatherDesignation} onChange={onChange} /></Field>
              <Field label="Company/Organisation Name"><input className={inputCls} name="fatherCompany" value={data.fatherCompany} onChange={onChange} /></Field>
              <Field label="PAN Card Number"><input className={inputCls} name="fatherPan" value={data.fatherPan} onChange={onChange} /></Field>
              <Field label="Annual Income"><input className={inputCls} type="number" name="fatherAnnualIncome" value={data.fatherAnnualIncome} onChange={onChange} /></Field>
            </div>

            <SectionTitle>Mother's Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Mother's Salutation" required>
                <select className={inputCls} name="motherSalutation" value={data.motherSalutation} onChange={onChange}>
                  <option value="">Select...</option><option>Mrs.</option><option>Ms.</option><option>Dr.</option><option>Late Mrs.</option>
                </select>
              </Field>
              <Field label="First Name" required><input className={inputCls} name="motherFirstName" value={data.motherFirstName} onChange={onChange} /></Field>
              <Field label="Middle Name"><input className={inputCls} name="motherMiddleName" value={data.motherMiddleName} onChange={onChange} /></Field>
              <Field label="Last Name"><input className={inputCls} name="motherLastName" value={data.motherLastName} onChange={onChange} /></Field>
              <Field label="Mobile Number" required><input className={inputCls} name="motherMobile" value={data.motherMobile} onChange={onChange} placeholder="10 digit mobile no..." /></Field>
              <Field label="Home Phone"><input className={inputCls} name="motherHomePhone" value={data.motherHomePhone} onChange={onChange} placeholder="EX.0123456789" /></Field>
              <Field label="Email Id"><input className={inputCls} type="email" name="motherEmail" value={data.motherEmail} onChange={onChange} placeholder="ex@example.com" /></Field>
              <Field label="Highest Qualification"><input className={inputCls} name="motherQualification" value={data.motherQualification} onChange={onChange} /></Field>
              <Field label="Occupation">
                <select className={inputCls} name="motherOccupation" value={data.motherOccupation} onChange={onChange}>
                  <option value="">Select...</option><option>Homemaker</option><option>Farmer</option><option>Business</option><option>Salaried</option><option>Self-Employed</option><option>Other</option>
                </select>
              </Field>
            </div>

            <SectionTitle>Local Guardian Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Local Guardian's Salutation">
                <select className={inputCls} name="guardianSalutation" value={data.guardianSalutation} onChange={onChange}>
                  <option value="">Select...</option><option>Mr.</option><option>Mrs.</option><option>Ms.</option><option>Dr.</option>
                </select>
              </Field>
              <Field label="First Name"><input className={inputCls} name="guardianFirstName" value={data.guardianFirstName} onChange={onChange} placeholder="First name..." /></Field>
              <Field label="Middle Name"><input className={inputCls} name="guardianMiddleName" value={data.guardianMiddleName} onChange={onChange} placeholder="Middle name..." /></Field>
              <Field label="Last Name"><input className={inputCls} name="guardianLastName" value={data.guardianLastName} onChange={onChange} placeholder="Last name..." /></Field>
              <Field label="Email Id" className="lg:col-span-2"><input className={inputCls} type="email" name="guardianEmail" value={data.guardianEmail} onChange={onChange} placeholder="sachin@example.com" /></Field>
              <Field label="Home Phone"><input className={inputCls} name="guardianHomePhone" value={data.guardianHomePhone} onChange={onChange} placeholder="EX.0123456789" /></Field>
              <Field label="Mobile Number"><input className={inputCls} name="guardianMobile" value={data.guardianMobile} onChange={onChange} placeholder="10 digit mobile no..." /></Field>
              <Field label="Relationship"><input className={inputCls} name="guardianRelationship" value={data.guardianRelationship} onChange={onChange} placeholder="Relationship..." /></Field>
              <Field label="Company/Organisation Name"><input className={inputCls} name="guardianCompany" value={data.guardianCompany} onChange={onChange} /></Field>
              <Field label="Occupation">
                <select className={inputCls} name="guardianOccupation" value={data.guardianOccupation} onChange={onChange}>
                  <option value="">Select...</option><option>Farmer</option><option>Business</option><option>Salaried</option><option>Self-Employed</option><option>Retired</option><option>Other</option>
                </select>
              </Field>
              <Field label="Any guardian's details" className="lg:col-span-2"><input className={inputCls} name="guardianDetails" value={data.guardianDetails} onChange={onChange} placeholder="Any guardian's details" /></Field>
            </div>

            <SectionTitle>Siblings Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Siblings">
                <select className={inputCls} name="siblingsCount" value={data.siblingsCount} onChange={onChange}>
                  <option value="">Select...</option><option>0</option><option>1</option><option>2</option><option>3+</option>
                </select>
              </Field>
              <Field label="Highest Qualification"><input className={inputCls} name="siblingsQualification" value={data.siblingsQualification} onChange={onChange} placeholder="Highest Qualification..." /></Field>
            </div>

            <SectionTitle>Family Income</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Financial Year"><input className={inputCls} name="financialYear" value={data.financialYear} onChange={onChange} placeholder="e.g., 2025-26" /></Field>
              <Field label="Family Income From All Sources"><input className={inputCls} type="number" name="familyIncome" value={data.familyIncome} onChange={onChange} /></Field>
            </div>
          </div>
        )}

        {tab === 'address' && (
          <div>
            <SectionTitle>Present Residential Address (For Correspondence)</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Address Line 1" required><input className={inputCls} name="presentAddress1" value={data.presentAddress1} onChange={onChange} /></Field>
              <Field label="Address Line 2"><input className={inputCls} name="presentAddress2" value={data.presentAddress2} onChange={onChange} placeholder="enter landmark..." /></Field>
              <Field label="Country" required>
                <select className={inputCls} name="presentCountry" value={data.presentCountry} onChange={onChange}>
                  <option>India</option><option>Other</option>
                </select>
              </Field>
              <Field label="District" required><input className={inputCls} name="presentDistrict" value={data.presentDistrict} onChange={onChange} placeholder="District" /></Field>
              <Field label="State" required>
                <select className={inputCls} name="presentState" value={data.presentState} onChange={onChange}>
                  <option value="">Select State</option>{INDIA_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Town / City" required><input className={inputCls} name="presentCity" value={data.presentCity} onChange={onChange} /></Field>
              <Field label="Pin Code" required><input className={inputCls} inputMode="numeric" name="presentPincode" value={data.presentPincode} onChange={onChange} maxLength={6} /></Field>
            </div>

            <div className="mt-6 mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">Permanent Address</p>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                <input type="checkbox" name="sameAsPresent" checked={data.sameAsPresent} onChange={onChange} className="w-4 h-4 accent-teal-700" />
                Same as above
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Address Line 1"><input className={inputCls} name="permanentAddress1" value={data.permanentAddress1} onChange={onChange} disabled={data.sameAsPresent} /></Field>
              <Field label="Address Line 2"><input className={inputCls} name="permanentAddress2" value={data.permanentAddress2} onChange={onChange} placeholder="permanent street address..." disabled={data.sameAsPresent} /></Field>
              <Field label="Country">
                <select className={inputCls} name="permanentCountry" value={data.permanentCountry} onChange={onChange} disabled={data.sameAsPresent}>
                  <option>India</option><option>Other</option>
                </select>
              </Field>
              <Field label="District"><input className={inputCls} name="permanentDistrict" value={data.permanentDistrict} onChange={onChange} disabled={data.sameAsPresent} /></Field>
              <Field label="State">
                <select className={inputCls} name="permanentState" value={data.permanentState} onChange={onChange} disabled={data.sameAsPresent}>
                  <option value="">Select State</option>{INDIA_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Town / City"><input className={inputCls} name="permanentCity" value={data.permanentCity} onChange={onChange} disabled={data.sameAsPresent} /></Field>
              <Field label="Pin Code"><input className={inputCls} inputMode="numeric" name="permanentPincode" value={data.permanentPincode} onChange={onChange} maxLength={6} disabled={data.sameAsPresent} /></Field>
            </div>
          </div>
        )}

        {tab === 'program' && (
          <div>
            <SectionTitle>Programme</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Programme"><input className={inputCls} value={app?.course || ''} disabled /></Field>
              <Field label="Specialization"><input className={inputCls} name="specialization" value={data.specialization} onChange={onChange} /></Field>
              <Field label="Campus">
                <select className={inputCls} name="campus" value={data.campus} onChange={onChange}>
                  <option value="">Select...</option><option>Online</option><option>Bhubaneswar</option><option>Paralakhemundi</option><option>Vizianagaram</option>
                </select>
              </Field>
              <Field label="Admission Category">
                <select className={inputCls} name="admissionCategory" value={data.admissionCategory} onChange={onChange}>
                  <option value="">Select...</option><option>Regular</option><option>Management</option><option>Sports Quota</option>
                </select>
              </Field>
              <Field label="Academic Session" hint="e.g., 2026-27"><input className={inputCls} name="academicSession" value={data.academicSession} onChange={onChange} /></Field>
            </div>
            <div className="flex flex-wrap gap-6 mt-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" name="hostelRequired" checked={data.hostelRequired} onChange={onChange} className="w-4 h-4 accent-teal-700" /> Hostel Required
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" name="transportRequired" checked={data.transportRequired} onChange={onChange} className="w-4 h-4 accent-teal-700" /> Transport Required
              </label>
            </div>

            <SectionTitle>Bank Details (for refunds, if any)</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Bank Name"><input className={inputCls} name="bankName" value={data.bankName} onChange={onChange} /></Field>
              <Field label="Account Number"><input className={inputCls} name="bankAccountNumber" value={data.bankAccountNumber} onChange={onChange} /></Field>
              <Field label="IFSC Code"><input className={inputCls} name="bankIFSC" value={data.bankIFSC} onChange={onChange} style={{ textTransform: 'uppercase' }} /></Field>
            </div>
          </div>
        )}

        {tab === 'academic' && (
          <div>
            <SectionTitle>Previous Institution & Transfer</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Previous Institution Name" required><input className={inputCls} name="previousInstitution" value={data.previousInstitution} onChange={onChange} /></Field>
              <Field label="Transfer Certificate (TC) Number"><input className={inputCls} name="tcNumber" value={data.tcNumber} onChange={onChange} /></Field>
            </div>

            <SectionTitle>Qualifying Examination</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Exam / Board Name"><input className={inputCls} name="qualifyingExamName" value={data.qualifyingExamName} onChange={onChange} /></Field>
              <Field label="Year of Passing"><input className={inputCls} type="number" name="qualifyingYear" value={data.qualifyingYear} onChange={onChange} /></Field>
              <Field label="Percentage / CGPA"><input className={inputCls} name="qualifyingPercentage" value={data.qualifyingPercentage} onChange={onChange} /></Field>
            </div>

            <SectionTitle>Entrance Exam (if applicable)</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Exam Name"><input className={inputCls} name="entranceExamName" value={data.entranceExamName} onChange={onChange} placeholder="e.g., JEE, NEET" /></Field>
              <Field label="Roll No"><input className={inputCls} name="entranceExamRollNo" value={data.entranceExamRollNo} onChange={onChange} /></Field>
              <Field label="Score / Rank"><input className={inputCls} name="entranceExamScore" value={data.entranceExamScore} onChange={onChange} /></Field>
            </div>
          </div>
        )}

        {tab === 'documents' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <SectionTitle>Upload Documents</SectionTitle>
              <span className="text-xs font-semibold text-gray-500">{mandatoryUploaded}/{mandatoryDocs.length} mandatory uploaded</span>
            </div>
            <div className="space-y-2.5">
              {documents.map(doc => (
                <div key={doc.type} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{doc.type} {doc.mandatory && <span className="text-red-500">*</span>}</p>
                    <p className="text-xs text-gray-500">
                      {doc.status === 'Verified' ? '✅ Verified' : doc.status === 'Rejected' ? '❌ Rejected — please re-upload' : doc.uploaded ? '⏳ Uploaded, pending verification' : 'Not uploaded yet'}
                    </p>
                  </div>
                  <label className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 flex-shrink-0 hover:brightness-110 transition-all" style={primaryBtnStyle}>
                    <Upload size={13} /> {doc.uploaded ? 'Re-upload' : 'Upload'}
                    <input type="file" className="hidden" onChange={(e) => e.target.files[0] && onUploadDoc(doc.type, e.target.files[0])} />
                  </label>
                </div>
              ))}
              {documents.length === 0 && <p className="text-sm text-gray-400">No document checklist available yet.</p>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100">
          <div className="text-xs text-gray-400">Tab {tabIndex + 1} of {TABS.length}</div>
          <button
            type="button" onClick={goNext} disabled={submitting}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 hover:brightness-110 transition-all"
            style={primaryBtnStyle}
          >
            {submitting ? <Loader size={16} className="animate-spin" /> : isLastTab ? <CheckCircle2 size={16} /> : null}
            {isLastTab ? (submitting ? 'Submitting...' : 'Submit Application') : 'Save & Continue'}
            {!isLastTab && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
