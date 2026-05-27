import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  CreditCard, DollarSign, CheckCircle, Clock, XCircle,
  Search, Download, Plus, Filter, Send, RefreshCw, MoreHorizontal, X, Save
} from 'lucide-react'

const STATUS_COLORS = {
  Approved: { bg: 'bg-green-100',  text: 'text-green-700'  },
  Pending:  { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Failed:   { bg: 'bg-red-100',    text: 'text-red-700'    },
}

export default function Payments() {
  const { payments, addPayment, updatePaymentStatus, applications, showToast } = useCcrm()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showLink, setShowLink] = useState(false)

  // Payment Link fields
  const [selectedAppId, setSelectedAppId] = useState('')
  const [payAmount, setPayAmount] = useState('25000')
  const [payMethod, setPayMethod] = useState('Online')

  const tabs = ['All', 'Approved', 'Pending', 'Failed']
  
  const filtered = payments.filter(p =>
    (filter === 'All' || p.status === filter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.appNo.toLowerCase().includes(search.toLowerCase()))
  )

  const approved = payments.filter(p => p.status === 'Approved').reduce((s, p) => s + Number(p.amount || 0), 0)
  const pending  = payments.filter(p => p.status === 'Pending').reduce((s, p) => s + Number(p.amount || 0), 0)
  const failed   = payments.filter(p => p.status === 'Failed').length

  const handleAppSelect = (appId) => {
    setSelectedAppId(appId)
  }

  const handleGenerateLink = (e) => {
    e.preventDefault()
    if (!selectedAppId) {
      showToast('Please select a student application.', 'error')
      return
    }

    const app = applications.find(a => a.id === parseInt(selectedAppId))
    if (!app) return

    addPayment({
      name: app.name,
      appNo: app.appNo,
      amount: Number(payAmount),
      method: payMethod,
      status: 'Pending',
      date: '',
      txnId: ''
    })

    setShowLink(false)
    setSelectedAppId('')
    setPayAmount('25000')
    setPayMethod('Online')
  }

  const handleSendLink = (p) => {
    showToast(`Payment link successfully sent to ${p.name}'s registered contact details.`, 'success')
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
                {['Student Name','Application No','Amount','Payment Method','Status','Date','Transaction ID','Actions'].map(h => (
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
                    <td className="table-td text-gray-600">{p.date || '—'}</td>
                    <td className="table-td text-xs font-mono text-gray-500">{p.txnId || '—'}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        {p.status === 'Pending' && (
                          <button
                            onClick={() => handleSendLink(p)}
                            className="flex items-center gap-1 text-xs text-primary-600 hover:text-white border border-primary-200 hover:bg-primary-500 rounded px-2 py-1 font-semibold transition-colors focus:outline-none"
                          >
                            <Send size={11} /> Send Link
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
                <button
                  type="button"
                  onClick={() => setShowLink(false)}
                  className="flex-1 btn-secondary text-sm py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-1.5"
                >
                  <Send size={14} /> Generate &amp; Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
