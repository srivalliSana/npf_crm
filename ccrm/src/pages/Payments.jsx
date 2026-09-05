import React, { useState, useRef } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  CreditCard, DollarSign, CheckCircle, Clock, XCircle,
  Search, Download, Plus, Filter, Send, RefreshCw, MoreHorizontal, X, Save,
  Link, Copy, MessageCircle, ExternalLink, FileSpreadsheet, Upload, ThumbsUp, AlertCircle
} from 'lucide-react'

const STATUS_COLORS = {
  Paid:           { bg: 'bg-green-100',   text: 'text-green-700'   },
  Approved:       { bg: 'bg-green-100',   text: 'text-green-700'   },
  'Payment Done': { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  Pending:        { bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  Failed:         { bg: 'bg-red-100',     text: 'text-red-700'     },
}

export default function Payments() {
  const { payments, setPayments, addPayment, updatePaymentStatus, applications, currentUser, showToast, generatePaymentLink, fetchAllData } = useCcrm()

  const resetPaymentsModule = async () => {
    if (!confirm('⚠️ This will DELETE all payments data permanently.\n\nType OK to continue.')) return
    if (prompt('Type "RESET MODULE" to confirm') !== 'RESET MODULE') return showToast('Reset cancelled.', 'info')
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/admin/reset-module', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ module: 'payments', confirmPhrase: 'RESET MODULE' })
      })
      if (res.ok) {
        showToast('Payments reset — all data cleared', 'success')
        setPayments([])
        fetchAllData?.()
      } else {
        const e = await res.json()
        showToast(e.error || 'Reset failed', 'error')
      }
    } catch { showToast('Network error', 'error') }
  }
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showLink, setShowLink] = useState(false)
  const [generatedLink, setGeneratedLink] = useState(null)
  const [linkLoading, setLinkLoading] = useState(false)

  // Payment Link fields
  const [selectedAppId, setSelectedAppId] = useState('')
  const [payAmount, setPayAmount] = useState('25000')
  const [payMethod, setPayMethod] = useState('Online')

  // UTR submit modal (per-row)
  const [utrPayment, setUtrPayment] = useState(null)
  const [utrInput, setUtrInput]     = useState('')

  // Bulk approve modal
  const [showBulk, setShowBulk]       = useState(false)
  const [bulkResult, setBulkResult]   = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const bulkRef = useRef(null)

  const isFinance = ['Admin', 'Finance', 'Manager'].includes(currentUser?.role)

  const submitUtr = async () => {
    if (!utrInput.trim()) return showToast('Enter UTR / reference number', 'error')
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/payments/${utrPayment.id}/submit-utr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ utrNumber: utrInput.trim(), payMode: 'offline' })
      })
      if (res.ok) {
        const updated = await res.json()
        setPayments(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
        showToast('UTR saved — payment marked as Payment Done', 'success')
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error || 'Failed to save UTR.', 'error')
      }
    } catch { showToast('Network error.', 'error') }
    setUtrPayment(null); setUtrInput('')
  }

  const approveSingle = async (payment) => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/payments/${payment.id}/approve`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (res.ok) {
        const updated = await res.json()
        setPayments(prev => prev.map(p => p.id === updated.id ? { ...p, status: 'Paid' } : p))
        showToast(`✓ Approved ${payment.appNo} — marked as Paid`, 'success')
        fetchAllData?.()
      } else {
        const err = await res.json()
        showToast(err.error || 'Approval failed.', 'error')
      }
    } catch { showToast('Network error.', 'error') }
  }

  const handleBulkApproveFile = async (file) => {
    if (!file) return
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return showToast('Only CSV or Excel files.', 'error')
    setBulkLoading(true); setBulkResult(null)
    try {
      const token = localStorage.getItem('ccrm_token')
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/payments/bulk-approve', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd
      })
      const data = await res.json()
      if (res.ok) {
        setBulkResult(data)
        fetchAllData()
        showToast(`${data.approved} payments approved, ${data.skipped} skipped.`, 'success')
      } else showToast(data.error || 'Bulk approval failed.', 'error')
    } catch { showToast('Network error.', 'error') }
    setBulkLoading(false)
  }

  const downloadApprovalTemplate = () => {
    const headers = ['App ID', 'UTR']
    const samples = [
      ['CUEEAP260001', 'UTR1234567890'],
      ['CUEEAP260002', 'UTR9876543210'],
      ['CUEESM260003', 'NEFT-2026-0042'],
    ]
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...samples.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = encodeURI(csv); a.download = 'CCRM_Payment_Approval_Template.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    showToast('Template downloaded!', 'success')
  }

  const tabs = ['All', 'Pending', 'Payment Done', 'Paid', 'Failed']
  
  const filtered = payments.filter(p => {
    if (filter !== 'All' && p.status !== filter) return false
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q)
        || p.appNo.toLowerCase().includes(q)
        || (p.utrNumber || '').toLowerCase().includes(q)
        || (p.txnId || '').toLowerCase().includes(q)
  })

  // Revenue = admin-verified payments (Paid/Approved) that have a UTR on record.
  const isVerified = (p) => ['Paid','Approved','Payment Approved'].includes(p.status) && (p.utrNumber || '').trim() !== ''
  const approved = payments.filter(isVerified).reduce((s, p) => s + Number(p.amount || 0), 0)
  // Awaiting verification: UTR submitted (Payment Done) OR pending — not yet in revenue.
  const pending  = payments.filter(p => ['Pending','Payment Done'].includes(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0)
  const failed   = payments.filter(p => p.status === 'Failed').length

  const handleAppSelect = (appId) => {
    setSelectedAppId(appId)
  }

  const handleGenerateLink = async (e) => {
    e.preventDefault()
    if (!selectedAppId) return showToast('Please select a student application.', 'error')
    const app = applications.find(a => a.id === parseInt(selectedAppId))
    if (!app) return

    setLinkLoading(true)
    const result = await generatePaymentLink(app.appNo, app.name, app.email, app.mobile, Number(payAmount))
    setLinkLoading(false)

    if (result?.paymentLink) {
      setGeneratedLink({ ...result, app })
    } else {
      // Fallback to simple addPayment
      addPayment({ name: app.name, appNo: app.appNo, amount: Number(payAmount), method: payMethod, status: 'Pending', date: '', txnId: '' })
      setShowLink(false); setSelectedAppId(''); setPayAmount('25000'); setPayMethod('Online')
    }
  }

  const copyLink = (url) => {
    navigator.clipboard?.writeText(url).then(() => showToast('Payment link copied!', 'success')).catch(() => showToast('Copy failed. Please copy manually.', 'warning'))
  }

  const sendLinkViaWA = (app, url, amount = payAmount) => {
    const msg = encodeURIComponent(`Dear ${app.name}, please complete your CUTM admission fee payment of ₹${Number(amount).toLocaleString('en-IN')} via this secure link:\n${url}\n\nApp No: ${app.appNo}\n\nBest Regards,\nCUTM Admissions Team`)
    window.open(`https://wa.me/91${app.mobile}?text=${msg}`, '_blank')
  }

  const handleSendLink = async (p) => {
    const app = applications.find(a => a.appNo === p.appNo)
    if (!app?.mobile) return showToast('No mobile number on file for this application.', 'error')
    const linkRes = await generatePaymentLink(p.appNo, p.name, app.email, app.mobile, p.amount, p.id)
    if (!linkRes?.paymentLink) return showToast('Failed to generate payment link.', 'error')
    sendLinkViaWA(app, linkRes.paymentLink, p.amount)
    showToast(`Payment link opened in WhatsApp for ${p.name}.`, 'success')
  }

  const handleRetry = (p) => {
    // Simulate re-attempt success
    updatePaymentStatus(p.id, 'Approved')
    showToast(`Transaction approved: Marked Application ${p.appNo} as Paid.`, 'success')
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No payment transactions to export.', 'warning')
      return
    }
    const headers = ['Student Name', 'Application No', 'Amount', 'Payment Method', 'Status', 'Date', 'Transaction ID']
    const rows = filtered.map(p => [
      p.name,
      p.appNo,
      p.amount,
      p.method || 'None',
      p.status,
      p.date || 'Pending',
      p.txnId || 'N/A'
    ])
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `payments_reconciliation_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported payments ledger to CSV.', 'success')
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Manager</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fee collection, payment tracking &amp; reconciliation</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export
          </button>
          {currentUser?.role === 'Admin' && (
            <button onClick={resetPaymentsModule}
              className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
              🗑️ Reset Payments
            </button>
          )}
          {isFinance && (
            <button onClick={() => { setShowBulk(true); setBulkResult(null) }}
              className="flex items-center gap-1.5 text-sm text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-1.5 transition-colors">
              <ThumbsUp size={14} /> Bulk Approve
            </button>
          )}
          <button onClick={() => setShowLink(true)}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none">
            <Plus size={14} /> Generate Payment Link
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Collected',   value: `₹${(approved/1000).toFixed(0)}K`,  icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Pending Amount',    value: `₹${(pending/1000).toFixed(0)}K`,   icon: Clock,       color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Failed Payments',   value: failed,                              icon: XCircle,     color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'Total Transactions',value: payments.length,                     icon: CreditCard,  color: 'text-blue-600',   bg: 'bg-blue-50'   },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon size={20} className={card.color} />
            </div>
            <div className="text-2xl font-extrabold text-gray-900">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setFilter(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none ${filter === t ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search payments..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-48" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Student Name','Application No','Amount','Method','Status','UTR / Ref No','Date','Actions'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Pending
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-semibold text-primary-600">{p.name}</td>
                    <td className="table-td text-xs font-mono text-gray-600">{p.appNo}</td>
                    <td className="table-td font-semibold text-gray-800">₹{p.amount.toLocaleString()}</td>
                    <td className="table-td text-gray-600">{p.method || '—'}</td>
                    <td className="table-td">
                      <span className={`badge ${sc.bg} ${sc.text}`}>{p.status}</span>
                    </td>
                    <td className="table-td text-xs font-mono">
                      {p.utrNumber ? (
                        <span className={`px-2 py-0.5 rounded ${p.status === 'Paid' || p.status === 'Approved' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'} font-bold`}>
                          {p.utrNumber}
                        </span>
                      ) : p.txnId ? (
                        <span className="text-gray-500">{p.txnId}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="table-td text-gray-600 text-xs">{p.date || '—'}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.status === 'Pending' && (
                          <>
                            <button
                              onClick={() => handleSendLink(p)}
                              className="flex items-center gap-1 text-xs text-primary-600 hover:text-white border border-primary-200 hover:bg-primary-500 rounded px-2 py-1 font-semibold transition-colors focus:outline-none"
                            >
                              <Send size={11} /> Send Link
                            </button>
                            <button
                              onClick={() => { setUtrPayment(p); setUtrInput('') }}
                              className="flex items-center gap-1 text-xs text-amber-700 hover:text-white border border-amber-300 hover:bg-amber-500 rounded px-2 py-1 font-semibold transition-colors"
                              title="Enter UTR for offline payment"
                            >
                              📋 UTR
                            </button>
                          </>
                        )}
                        {p.status === 'Payment Done' && isFinance && (
                          <button
                            onClick={() => approveSingle(p)}
                            className="flex items-center gap-1 text-xs text-green-700 hover:text-white border border-green-300 hover:bg-green-500 rounded px-2 py-1 font-semibold transition-colors"
                            title={`Approve — UTR: ${p.utrNumber || 'none'}`}
                          >
                            <ThumbsUp size={11} /> Approve
                          </button>
                        )}
                        {p.status === 'Failed' && (
                          <button
                            onClick={() => handleRetry(p)}
                            className="flex items-center gap-1 text-xs text-orange-600 hover:text-white border border-orange-200 hover:bg-orange-500 rounded px-2 py-1 font-semibold transition-colors focus:outline-none"
                          >
                            <RefreshCw size={11} /> Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs text-gray-500">Showing {filtered.length} of {payments.length} records</span>
          <div className="text-xs text-gray-500 font-medium">
            Total collected: <span className="font-bold text-green-600">₹{approved.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Generate Payment Link Modal */}
      {showLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Generate Payment Link</h2>
              <button onClick={() => setShowLink(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleGenerateLink} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Select Student Application *</label>
                <select
                  value={selectedAppId}
                  onChange={e => handleAppSelect(e.target.value)}
                  className="input-field text-sm"
                  required
                >
                  <option value="">-- Choose student application --</option>
                  {applications.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.appNo})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="input-field text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="Online">Online Gateway Link</option>
                  <option value="Offline">Offline Demand Draft / Cash</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button type="button" onClick={() => { setShowLink(false); setGeneratedLink(null) }} className="flex-1 btn-secondary text-sm py-2.5">Cancel</button>
                <button type="submit" disabled={linkLoading} className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {linkLoading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Link size={14} />}
                  {linkLoading ? 'Generating...' : 'Generate Link'}
                </button>
              </div>

              {/* Generated Link Result */}
              {generatedLink && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="text-sm font-semibold text-green-800">Payment Link Generated!</span>
                  </div>
                  <div className="bg-white border border-green-200 rounded-lg p-2 mb-3">
                    <p className="text-xs text-slate-500 mb-1">Payment URL:</p>
                    <p className="text-xs font-mono text-slate-700 break-all">{generatedLink.paymentLink}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyLink(generatedLink.paymentLink)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-white border border-green-300 text-green-700 rounded-lg py-2 hover:bg-green-50">
                      <Copy size={13} /> Copy Link
                    </button>
                    <button onClick={() => sendLinkViaWA(generatedLink.app, generatedLink.paymentLink)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-green-600 text-white rounded-lg py-2 hover:bg-green-700">
                      <MessageCircle size={13} /> Send via WhatsApp
                    </button>
                    <a href={generatedLink.paymentLink} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center text-xs text-green-600 hover:text-green-800 px-2">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* UTR Submit Modal */}
      {utrPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                📋 Submit UTR / Reference
              </h2>
              <button onClick={() => setUtrPayment(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
              <p className="text-sm font-semibold text-blue-800">{utrPayment.name}</p>
              <p className="text-xs text-blue-600 mt-0.5">
                App: <span className="font-mono font-bold">{utrPayment.appNo}</span> · Amount: ₹{Number(utrPayment.amount).toLocaleString()}
              </p>
            </div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              UTR / Bank Reference Number
            </label>
            <input
              type="text" value={utrInput} onChange={e => setUtrInput(e.target.value.toUpperCase())}
              placeholder="e.g. UTR1234567890 or NEFT-2026-0042"
              className="input-field text-sm font-mono mb-1"
              autoFocus
            />
            <p className="text-xs text-gray-400 mb-4">
              Entered by counsellor/student for offline (NEFT, IMPS, UPI, cash receipt) payments.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setUtrPayment(null)} className="flex-1 btn-secondary py-2 text-sm">Cancel</button>
              <button onClick={submitUtr} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 text-sm font-semibold rounded-lg">
                Save → Payment Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Approve Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <ThumbsUp size={18} className="text-green-500" /> Bulk Payment Approval
              </h2>
              <button onClick={() => { setShowBulk(false); setBulkResult(null) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Template */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                    <Download size={13} /> Download Approval Template
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">Columns: <strong>App ID</strong>, <strong>UTR</strong></p>
                </div>
                <button onClick={downloadApprovalTemplate}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 font-medium">
                  Template
                </button>
              </div>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">How it works:</p>
                <ul className="space-y-0.5 list-disc list-inside text-blue-600">
                  <li>Upload Excel/CSV with reconciled UTRs from your bank</li>
                  <li>System finds matching pending payments by <strong>App ID</strong></li>
                  <li>Marks each as <strong>Paid</strong> and stores the UTR</li>
                </ul>
              </div>

              {!bulkResult ? (
                <div
                  onClick={() => bulkRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-green-400 transition-colors"
                >
                  {bulkLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className="animate-spin w-7 h-7 border-4 border-green-200 border-t-green-500 rounded-full" />
                      <p className="text-sm text-gray-500 font-medium">Approving payments…</p>
                    </div>
                  ) : (
                    <>
                      <FileSpreadsheet size={36} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-sm font-semibold text-gray-600">Click to upload approval Excel/CSV</p>
                      <p className="text-xs text-gray-400 mt-1">.csv, .xlsx, .xls</p>
                    </>
                  )}
                  <input ref={bulkRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={e => handleBulkApproveFile(e.target.files?.[0])} />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-extrabold text-green-700">{bulkResult.approved}</div>
                      <div className="text-xs text-green-600">Approved</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-extrabold text-yellow-700">{bulkResult.skipped}</div>
                      <div className="text-xs text-yellow-600">Skipped</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-extrabold text-blue-700">{bulkResult.total}</div>
                      <div className="text-xs text-blue-600">Total Rows</div>
                    </div>
                  </div>
                  {bulkResult.errors?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-32 overflow-y-auto">
                      <p className="text-xs font-semibold text-red-700 mb-1">Issues (first 10):</p>
                      {bulkResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                    </div>
                  )}
                  <button onClick={() => setBulkResult(null)}
                    className="w-full text-sm text-primary-600 border border-primary-200 rounded-lg py-2 hover:bg-primary-50">
                    Upload Another File
                  </button>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button onClick={() => { setShowBulk(false); setBulkResult(null) }} className="btn-secondary text-sm px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
