import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader } from 'lucide-react'

export default function AdmissionDetailsForm() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [application, setApplication] = useState(null)
  const [alreadyFilled, setAlreadyFilled] = useState(false)

  const [formData, setFormData] = useState({
    // Personal Information
    dateOfBirth: '',
    fatherName: '',
    motherName: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    nationality: '',
    religion: '',

    // Academic Information
    tenthMarks: '',
    tenthPercentage: '',
    tenthBoard: '',
    twelfthMarks: '',
    twelfthPercentage: '',
    twelfthBoard: '',
    graduationMarks: '',
    graduationPercentage: '',
    graduationUniversity: '',
    otherCertifications: '',

    // Additional Info
    extraCurricularActivities: '',
    scholarshipRequired: false,
    medicalConditions: '',
    emergencyContactName: '',
    emergencyContactPhone: ''
  })

  // Fetch application and existing details
  useEffect(() => {
    fetch(`/api/admission-details/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Invalid or expired link')
        return r.json()
      })
      .then(data => {
        setApplication(data.application)
        setAlreadyFilled(data.alreadyFilled)
        if (data.admissionDetails && Object.keys(data.admissionDetails).length > 0) {
          setFormData({ ...formData, ...data.admissionDetails })
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const res = await fetch(`/api/admission-details/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) throw new Error('Failed to save details')
      const data = await res.json()

      alert('✅ Your admission details have been saved successfully!')
      setAlreadyFilled(true)
    } catch (err) {
      alert('❌ Error saving details: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader size={48} className="animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-700">Loading admission form...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-lg">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Please check your email for the correct link or contact admissions.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Admission Details Form</h1>
          <p className="text-gray-600 mb-4">Complete your admission information below</p>

          {application && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <span className="font-bold">Name:</span> {application.name}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-bold">Email:</span> {application.email}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-bold">Course:</span> {application.course || 'N/A'}
              </p>
            </div>
          )}

          {alreadyFilled && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
              <CheckCircle2 size={24} className="text-green-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-green-900">Form Already Submitted</p>
                <p className="text-sm text-green-800">You can update your details below and resubmit.</p>
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-8">
          {/* Personal Information */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-indigo-200">
              👤 Personal Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Birth</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Father's Name</label>
                <input
                  type="text"
                  name="fatherName"
                  value={formData.fatherName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Mother's Name</label>
                <input
                  type="text"
                  name="motherName"
                  value={formData.motherName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nationality</label>
                <input
                  type="text"
                  name="nationality"
                  value={formData.nationality}
                  onChange={handleChange}
                  placeholder="e.g., Indian"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows="2"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Pincode</label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Religion</label>
                <input
                  type="text"
                  name="religion"
                  value={formData.religion}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Academic Information */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-indigo-200">
              🎓 Academic Information
            </h2>

            <div className="space-y-6">
              {/* 10th */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">10th Grade</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Marks</label>
                    <input
                      type="number"
                      name="tenthMarks"
                      value={formData.tenthMarks}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Percentage (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="tenthPercentage"
                      value={formData.tenthPercentage}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Board</label>
                    <input
                      type="text"
                      name="tenthBoard"
                      value={formData.tenthBoard}
                      onChange={handleChange}
                      placeholder="e.g., CBSE"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* 12th */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">12th Grade</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Marks</label>
                    <input
                      type="number"
                      name="twelfthMarks"
                      value={formData.twelfthMarks}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Percentage (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="twelfthPercentage"
                      value={formData.twelfthPercentage}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Board</label>
                    <input
                      type="text"
                      name="twelfthBoard"
                      value={formData.twelfthBoard}
                      onChange={handleChange}
                      placeholder="e.g., CBSE"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Graduation */}
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Graduation (if applicable)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Marks/CGPA</label>
                    <input
                      type="text"
                      name="graduationMarks"
                      value={formData.graduationMarks}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Percentage (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      name="graduationPercentage"
                      value={formData.graduationPercentage}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">University</label>
                    <input
                      type="text"
                      name="graduationUniversity"
                      value={formData.graduationUniversity}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Other Certifications/Achievements</label>
                <textarea
                  name="otherCertifications"
                  value={formData.otherCertifications}
                  onChange={handleChange}
                  placeholder="e.g., JEE, NEET, Skill certifications, Awards, etc."
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-indigo-200">
              ➕ Additional Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Extra-Curricular Activities</label>
                <textarea
                  name="extraCurricularActivities"
                  value={formData.extraCurricularActivities}
                  onChange={handleChange}
                  placeholder="Sports, clubs, volunteering, etc."
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="scholarship"
                  name="scholarshipRequired"
                  checked={formData.scholarshipRequired}
                  onChange={handleChange}
                  className="w-4 h-4 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                />
                <label htmlFor="scholarship" className="text-sm font-semibold text-gray-700">
                  Scholarship/Financial Aid Required
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Medical Conditions (if any)</label>
                <textarea
                  name="medicalConditions"
                  value={formData.medicalConditions}
                  onChange={handleChange}
                  placeholder="Please mention any allergies, disabilities, or health conditions we should know about"
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Emergency Contact Name</label>
                  <input
                    type="text"
                    name="emergencyContactName"
                    value={formData.emergencyContactName}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Emergency Contact Phone</label>
                  <input
                    type="tel"
                    name="emergencyContactPhone"
                    value={formData.emergencyContactPhone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? <Loader size={20} className="animate-spin" /> : '✅'}
              {submitting ? 'Saving...' : 'Save Admission Details'}
            </button>
            <button
              type="button"
              onClick={() => window.location.href = '/'}
              className="px-8 py-3 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 font-bold text-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
