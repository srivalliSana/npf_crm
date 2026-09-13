import React from 'react'
import { Plus, CheckCircle2, Circle } from 'lucide-react'

// ── Inline Documents Tab — upload + verify in the lead window directly ───────
// Extracted verbatim from ApplicationDetails.jsx (no behavior change) as
// part of the Campus One Neo restructure, so the layout change and this
// extraction are independently verifiable.
function InlineDocumentsTab({ studentName, documents, uploadDocument, updateDocStatus, deleteDocument, showToast, currentUser, leadId, record, isApp, fetchAllData, discountInput: discountInputProp, setDiscountInput: setDiscountInputProp }) {
  const fileRef = React.useRef(null)
  const [docType, setDocType]   = React.useState('10th Marksheet')
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [generatingLink, setGeneratingLink] = React.useState(false)
  const [showAdmissionDetailsView, setShowAdmissionDetailsView] = React.useState(false)
  const [showFullDetailsView, setShowFullDetailsView] = React.useState(false)
  const [sendingPaymentLink, setSendingPaymentLink] = React.useState(null) // null | 'Booking Fee' | 'Tuition Fee'
  // The discount input is shared with AiInsightsPanel (its "Apply suggested %"
  // button pre-fills this same value) — lifted to ApplicationDetails.jsx when
  // that prop pair is passed; falls back to purely-local state otherwise.
  const [discountInputLocal, setDiscountInputLocal] = React.useState('')
  const discountInput = discountInputProp !== undefined ? discountInputProp : discountInputLocal
  const setDiscountInput = setDiscountInputProp || setDiscountInputLocal
  const [savingDiscount, setSavingDiscount] = React.useState(false)
  const isAdmin = ['Admin','Manager'].includes(currentUser?.role)
  const isCounselor = currentUser?.role === 'Counselor' // tuition discount is Counsellor-only, not Admin/Manager

  const sendPaymentLink = (feeType) => {
    setSendingPaymentLink(feeType)
    const token = localStorage.getItem('ccrm_token')
    fetch(`/api/applications/${record.id}/send-payment-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feeType })
    }).then(r => r.json()).then(d => {
      if (d.success) {
        const to = [d.sentTo?.mobile, d.sentTo?.email].filter(Boolean).join(' and ')
        showToast?.(`✅ Payment link sent to ${to || 'the student'}.`, 'success')
      } else {
        alert('Error: ' + d.error)
      }
    }).catch(e => alert('Failed: ' + e.message)).finally(() => setSendingPaymentLink(null))
  }

  const saveTuitionDiscount = (pct) => {
    setSavingDiscount(true)
    const token = localStorage.getItem('ccrm_token')
    fetch(`/api/applications/${record.id}/tuition-discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ discountPercent: pct })
    }).then(r => r.json()).then(d => {
      if (d.success) { showToast?.(`✅ ${d.message}`, 'success'); setDiscountInput(''); fetchAllData() }
      else alert('Error: ' + d.error)
    }).catch(e => alert('Failed: ' + e.message)).finally(() => setSavingDiscount(false))
  }

  const REQUIRED = [
    '10th Marksheet','12th Marksheet','Aadhar Card','Passport Photo',
    'Transfer Certificate','Migration Certificate','Caste Certificate',
    'Income Certificate','Character Certificate','Medical Certificate'
  ]

  const studentDocs = (documents || []).filter(d =>
    d.student?.toLowerCase() === studentName.toLowerCase()
  )

  const handleFile = async (file) => {
    if (!file) return
    const valid = ['image/jpeg','image/png','image/jpg','application/pdf']
    if (!valid.includes(file.type)) return showToast('Only PDF/JPG/PNG supported', 'error')
    if (file.size > 5 * 1024 * 1024) return showToast('File must be under 5MB', 'error')

    setUploading(true)
    try {
      // Upload file to server
      const fd = new FormData()
      fd.append('document', file)
      const uploadRes = await fetch('/api/upload/document', { method: 'POST', body: fd })
      const { fileUrl } = uploadRes.ok ? await uploadRes.json() : { fileUrl: '' }

      // Create document record
      await uploadDocument({
        student: studentName,
        type: docType,
        fileUrl: fileUrl || URL.createObjectURL(file),
        status: 'Pending'
      })
      showToast(`${docType} uploaded successfully`, 'success')
    } catch {
      showToast('Upload failed', 'error')
    }
    setUploading(false)
  }

  const handleGenerateShareLink = async () => {
    if (!leadId) return showToast('Lead ID not available', 'error')
    setGeneratingLink(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = { 'Authorization': `Bearer ${token}` }
      const res = await fetch(`/api/leads/${leadId}/documents/generate-link`, { method: 'POST', headers })
      if (res.ok) {
        const { shareUrl } = await res.json()
        navigator.clipboard.writeText(shareUrl)
        showToast('Share link copied to clipboard!', 'success')
      } else {
        showToast('Failed to generate share link', 'error')
      }
    } catch (err) {
      console.error(err)
      showToast('Error generating share link', 'error')
    } finally {
      setGeneratingLink(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Documents</h3>
        <span className="text-xs text-gray-400">
          {studentDocs.filter(d => d.status === 'Verified').length} of {studentDocs.length || 0} verified
        </span>
      </div>

      {/* Inline upload area */}
      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 mb-5">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-gray-700">Upload Documents</h4>
          <button
            onClick={handleGenerateShareLink}
            disabled={generatingLink}
            className="text-xs px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
          >
            {generatingLink ? 'Generating...' : '🔗 Share Upload Link'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="input-field text-sm">
              {REQUIRED.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                dragOver ? 'border-primary-500 bg-primary-50' :
                uploading ? 'border-primary-300 bg-primary-50/50' :
                'border-gray-300 hover:border-primary-400'
              }`}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-primary-600">
                  <span className="animate-spin w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full" />
                  Uploading {docType}...
                </div>
              ) : (
                <>
                  <Plus size={20} className="mx-auto text-gray-400 mb-1" />
                  <p className="text-xs text-gray-600 font-semibold">Click to upload or drag & drop</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">PDF, JPG, PNG up to 5MB</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => handleFile(e.target.files?.[0])} />
            </div>
          </div>
        </div>
      </div>

      {/* Required checklist */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
        {REQUIRED.slice(0, 5).map(type => {
          const uploaded = studentDocs.find(d => d.type === type)
          const status = uploaded?.status || 'Not uploaded'
          const tone = uploaded?.status === 'Verified' ? 'green'
                     : uploaded?.status === 'Rejected' ? 'red'
                     : uploaded ? 'yellow' : 'gray'
          const cls = {
            green:  'bg-green-50 border-green-200 text-green-700',
            yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
            red:    'bg-red-50 border-red-200 text-red-700',
            gray:   'bg-gray-50 border-gray-200 text-gray-500',
          }[tone]
          return (
            <div key={type} className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg border ${cls}`}>
              {uploaded ? <CheckCircle2 size={12} className="flex-shrink-0" /> : <Circle size={12} className="flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{type}</p>
                <p className="text-[10px] opacity-75">{status}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* All uploaded docs */}
      {studentDocs.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8 border-2 border-dashed border-gray-200 rounded-xl">
          No documents uploaded yet. Use the upload box above ↑
        </div>
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Document Type','Status','Uploaded','File','Actions'].map(h => (
                  <th key={h} className="table-th text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studentDocs.map(d => (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="table-td text-xs font-medium text-gray-800">{d.type}</td>
                  <td className="table-td">
                    <span className={`badge text-xs font-bold ${
                      d.status === 'Verified' ? 'bg-green-100 text-green-700' :
                      d.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{d.status}</span>
                  </td>
                  <td className="table-td text-xs text-gray-500">{d.uploadDate || '—'}</td>
                  <td className="table-td">
                    {d.fileUrl ? (
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline">View</a>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      {isAdmin && d.status !== 'Verified' && (
                        <button onClick={() => updateDocStatus(d.id, 'Verified')}
                          className="text-xs text-green-600 hover:bg-green-50 px-1.5 py-0.5 rounded">✓ Verify</button>
                      )}
                      {isAdmin && d.status !== 'Rejected' && (
                        <button onClick={() => updateDocStatus(d.id, 'Rejected')}
                          className="text-xs text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded">✗ Reject</button>
                      )}
                      {isAdmin && (
                        <button onClick={() => { if (confirm(`Delete ${d.type}?`)) deleteDocument(d.id) }}
                          className="text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 px-1.5 py-0.5 rounded">🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── 3-STEP ADMISSION JOURNEY: counselor review → booking fee →      ─── */}
      {/* ─── full form/registration fee → docs/tuition fee → CampusOne       ─── */}
      {/* Visible to Admin/Manager (full pipeline, including Admin-only Send
          Link actions further down) and to Counselor — the discount edit
          control a few lines down is Counselor-only, so Counselors need to
          be able to reach this card at all to use it; this was previously
          gated isAdmin-only, making that control unreachable by anyone. */}
      {isApp && (isAdmin || isCounselor) && (
        <div className="mt-6 card">
          <h3 className="text-lg font-bold text-gray-900 mb-4 pb-4 border-b">Admission Journey Pipeline</h3>

          {record?.admissionDetails && Object.keys(record.admissionDetails).length > 0 && (
            <div className="mb-4 p-4 rounded-lg border bg-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Step 1 — Admission Details (Basic + Academic)</p>
                <p className={`text-xs mt-1 font-semibold ${
                  record.admission_details_status === 'Approved' ? 'text-green-600'
                  : record.admission_details_status === 'Rejected' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {record.admission_details_status || 'Pending'} review
                  {record.admission_details_reviewed_by ? ` — by ${record.admission_details_reviewed_by}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAdmissionDetailsView(v => !v)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg"
                >
                  {showAdmissionDetailsView ? 'Hide Details' : 'View Details'}
                </button>
              {(record.admission_details_status || 'Pending') === 'Pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const token = localStorage.getItem('ccrm_token')
                      fetch(`/api/applications/${record.id}/approve-admission-details`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ status: 'Approved' })
                      }).then(r => r.json()).then(d => {
                        if (d.success) { showToast?.('✅ Admission details approved.', 'success'); fetchAllData() }
                        else alert('Error: ' + d.error)
                      }).catch(e => alert('Failed: ' + e.message))
                    }}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const token = localStorage.getItem('ccrm_token')
                      fetch(`/api/applications/${record.id}/approve-admission-details`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ status: 'Rejected' })
                      }).then(r => r.json()).then(d => {
                        if (d.success) { showToast?.('Admission details sent back for correction.', 'info'); fetchAllData() }
                        else alert('Error: ' + d.error)
                      }).catch(e => alert('Failed: ' + e.message))
                    }}
                    className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg"
                  >
                    Reject
                  </button>
                </div>
              )}
              </div>
            </div>
          )}

          {showAdmissionDetailsView && record?.admissionDetails && (
            <div className="mb-4 p-4 rounded-lg border bg-white">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Submitted Admission Details</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                {Object.entries(record.admissionDetails).map(([key, value]) => (
                  value !== '' && value !== null && value !== undefined && (
                    <div key={key}>
                      <p className="text-xs text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-gray-800 font-medium break-words">{String(value)}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {record?.admission_full_details && Object.keys(record.admission_full_details).length > 0 && (
            <div className="mb-4 p-4 rounded-lg border bg-gray-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">Step 2 — Full Admission Form (Personal/Parent/Address/Program/Academic)</p>
                <p className={`text-xs mt-1 font-semibold ${
                  record.admission_full_details_status === 'Approved' ? 'text-green-600'
                  : record.admission_full_details_status === 'Rejected' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {record.admission_full_details_status || 'Pending'} review
                  {record.admission_full_details_reviewed_by ? ` — by ${record.admission_full_details_reviewed_by}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFullDetailsView(v => !v)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg"
                >
                  {showFullDetailsView ? 'Hide Details' : 'View Details'}
                </button>
                {(record.admission_full_details_status || 'Pending') === 'Pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const token = localStorage.getItem('ccrm_token')
                        fetch(`/api/applications/${record.id}/approve-full-details`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ status: 'Approved' })
                        }).then(r => r.json()).then(d => {
                          if (d.success) { showToast?.('✅ Admission form approved.', 'success'); fetchAllData() }
                          else alert('Error: ' + d.error)
                        }).catch(e => alert('Failed: ' + e.message))
                      }}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        const token = localStorage.getItem('ccrm_token')
                        fetch(`/api/applications/${record.id}/approve-full-details`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ status: 'Rejected' })
                        }).then(r => r.json()).then(d => {
                          if (d.success) { showToast?.('Admission form sent back for correction.', 'info'); fetchAllData() }
                          else alert('Error: ' + d.error)
                        }).catch(e => alert('Failed: ' + e.message))
                      }}
                      className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {showFullDetailsView && record?.admission_full_details && (
            <div className="mb-4 p-4 rounded-lg border bg-white">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Submitted Full Admission Form</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                {Object.entries(record.admission_full_details).map(([key, value]) => (
                  value !== '' && value !== null && value !== undefined && value !== false && (
                    <div key={key}>
                      <p className="text-xs text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-gray-800 font-medium break-words">{String(value)}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <ul className="space-y-2 text-sm">
            <li className={`flex items-center justify-between gap-2 ${record?.booking_fee_status === 'Paid' ? 'text-green-600' : 'text-gray-500'}`}>
              <span className="flex items-center gap-2"><span>{record?.booking_fee_status === 'Paid' ? '✓' : '○'}</span> Application Fee (Step 1) Paid</span>
              {isAdmin && record?.booking_fee_status !== 'Paid' && (
                <button onClick={() => sendPaymentLink('Booking Fee')} disabled={sendingPaymentLink === 'Booking Fee'}
                  className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-semibold rounded-lg disabled:opacity-50">
                  {sendingPaymentLink === 'Booking Fee' ? 'Sending...' : '📲 Send Link'}
                </button>
              )}
            </li>
            <li className={`flex items-center gap-2 ${record?.admission_full_details && Object.keys(record.admission_full_details).length > 0 ? 'text-green-600' : 'text-gray-500'}`}>
              <span>{record?.admission_full_details && Object.keys(record.admission_full_details).length > 0 ? '✓' : '○'}</span> Step 2 — Full Admission Form Submitted
            </li>
            <li className={`flex items-center gap-2 ${record?.registration_fee_paid ? 'text-green-600' : 'text-gray-500'}`}>
              <span>{record?.registration_fee_paid ? '✓' : '○'}</span> Registration Fee (always ₹0 — auto-cleared on approval)
            </li>
            <li className={`flex items-center gap-2 ${record?.provisional_admission_status === 'Granted' ? 'text-green-600' : 'text-gray-500'}`}>
              <span>{record?.provisional_admission_status === 'Granted' ? '✓' : '○'}</span> Provisional Admission Granted
            </li>
            <li className={`flex items-center justify-between gap-2 ${record?.tuition_fee_paid ? 'text-green-600' : 'text-gray-500'}`}>
              <span className="flex items-center gap-2">
                <span>{record?.tuition_fee_paid ? '✓' : '○'}</span> Tuition Fee Paid
                {Number(record?.tuition_amount_paid) > 0 && !record?.tuition_fee_paid && (
                  <span className="text-xs font-semibold text-amber-600">(₹{Number(record.tuition_amount_paid).toLocaleString('en-IN')} paid so far)</span>
                )}
              </span>
              {isAdmin && !record?.tuition_fee_paid && (
                <button onClick={() => sendPaymentLink('Tuition Fee')} disabled={sendingPaymentLink === 'Tuition Fee'}
                  className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-semibold rounded-lg disabled:opacity-50">
                  {sendingPaymentLink === 'Tuition Fee' ? 'Sending...' : '📲 Send Link'}
                </button>
              )}
            </li>
            <li className="flex items-center justify-between gap-2 text-gray-500 pl-6">
              <span className="text-xs">
                Tuition Fee Discount:{' '}
                {Number(record?.tuition_fee_discount_percent) > 0
                  ? <span className="font-semibold text-emerald-600">{record.tuition_fee_discount_percent}% off{record?.tuition_fee_discount_set_by ? ` (by ${record.tuition_fee_discount_set_by})` : ''}</span>
                  : <span className="text-gray-400">None</span>}
              </span>
              {isCounselor && !record?.tuition_fee_paid && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="0" max="100" step="0.01" placeholder="%"
                    value={discountInput} onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-16 px-2 py-1 text-xs border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={() => discountInput !== '' && saveTuitionDiscount(Number(discountInput))}
                    disabled={savingDiscount || discountInput === ''}
                    className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {savingDiscount ? 'Saving...' : 'Apply'}
                  </button>
                  {Number(record?.tuition_fee_discount_percent) > 0 && (
                    <button
                      onClick={() => saveTuitionDiscount(0)}
                      disabled={savingDiscount}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
            <li className={`flex items-center gap-2 ${record?.campusone_sync_status === 'Success' ? 'text-green-600' : 'text-gray-500'}`}>
              <span>{record?.campusone_sync_status === 'Success' ? '✓' : '○'}</span> Step 3 — Synced to CampusOne
            </li>
          </ul>
        </div>
      )}

      {/* ─── PHASE 7-8: Temporary Admission Number & CampusOne Sync (legacy manual path) ─── */}
      {isApp && isAdmin && (
        <div className="mt-6 space-y-4">
          {/* Phase 7: Temporary Admission Number Generation */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Temporary Admission Number</h3>
              {record?.registration_number && (
                <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                  Generated
                </span>
              )}
            </div>
            {record?.registration_number ? (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 mb-2">Temporary Admission Number:</p>
                <p className="text-2xl font-bold text-blue-600">{record.registration_number}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Generated on {record.reg_number_generated_at ? new Date(record.reg_number_generated_at).toLocaleDateString() : 'N/A'} — the final registration number is issued via CampusOne after enrollment.
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <p className="text-sm text-gray-600 mb-3">Preconditions for temporary admission number generation:</p>
                <ul className="space-y-2 text-sm">
                  <li className={`flex items-center gap-2 ${record?.form_status === 'Complete' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.form_status === 'Complete' ? '✓' : '○'}</span> Application Submitted
                  </li>
                  <li className={`flex items-center gap-2 ${record?.pay_status === 'Payment Approved' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.pay_status === 'Payment Approved' ? '✓' : '○'}</span> Application Fee Paid
                  </li>
                  <li className={`flex items-center gap-2 ${record?.booking_fee_status === 'Paid' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.booking_fee_status === 'Paid' ? '✓' : '○'}</span> Application Fee (Step 1) Paid
                  </li>
                  <li className={`flex items-center gap-2 text-gray-600`}>
                    <span>○</span> All Documents Verified
                  </li>
                  <li className={`flex items-center gap-2 ${record?.finance_status === 'Verified' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.finance_status === 'Verified' ? '✓' : '○'}</span> Finance Verified
                  </li>
                </ul>
                <button
                  onClick={() => {
                    if (confirm('Generate temporary admission number? All preconditions must be met.')) {
                      const token = localStorage.getItem('ccrm_token')
                      fetch(`/api/applications/${record.id}/generate-registration`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                      })
                        .then(r => r.json())
                        .then(d => {
                          if (d.success) {
                            alert('Temporary admission number generated: ' + d.registrationNumber)
                            fetchAllData()
                          } else {
                            alert('Error: ' + d.error)
                          }
                        })
                        .catch(e => alert('Failed: ' + e.message))
                    }
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Generate Temporary Admission Number
                </button>
              </div>
            )}
          </div>

          {/* Phase 8: CampusOne API Sync */}
          {record?.registration_number && (
            <div className="card">
              <div className="flex items-center justify-between mb-4 pb-4 border-b">
                <h3 className="text-lg font-bold text-gray-900">CampusOne Integration</h3>
                {record?.campusone_sync_status === 'Success' && (
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                    Synced
                  </span>
                )}
                {record?.campusone_sync_status === 'Failed' && (
                  <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-sm font-semibold rounded-full">
                    Failed
                  </span>
                )}
              </div>

              {record?.campusone_sync_status === 'Success' ? (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-gray-600 mb-2">CampusOne Student ID:</p>
                  <p className="text-xl font-bold text-green-600">{record.campusone_student_id}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Synced on {record.campusone_synced_at ? new Date(record.campusone_synced_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              ) : record?.campusone_sync_status === 'Failed' ? (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600 font-semibold mb-2">Sync Failed</p>
                  <p className="text-sm text-red-700">{record.campusone_sync_error}</p>
                  <button
                    onClick={() => {
                      const token = localStorage.getItem('ccrm_token')
                      fetch(`/api/applications/${record.id}/sync-campusone`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                      })
                        .then(r => r.json())
                        .then(d => {
                          if (d.success) {
                            alert(d.message)
                            fetchAllData()
                          } else {
                            alert('Error: ' + d.error)
                          }
                        })
                        .catch(e => alert('Failed: ' + e.message))
                    }}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Retry Sync
                  </button>
                </div>
              ) : (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-600 mb-3">Ready to sync with CampusOne</p>
                  <button
                    onClick={() => {
                      if (confirm('Sync this application to CampusOne? All data will be transferred.')) {
                        const token = localStorage.getItem('ccrm_token')
                        fetch(`/api/applications/${record.id}/sync-campusone`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` }
                        })
                          .then(r => r.json())
                          .then(d => {
                            if (d.success) {
                              alert(d.message)
                              fetchAllData()
                            } else {
                              alert('Error: ' + d.error)
                            }
                          })
                          .catch(e => alert('Failed: ' + e.message))
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Sync to CampusOne
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
export default InlineDocumentsTab
