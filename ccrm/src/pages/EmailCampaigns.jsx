import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { Mail, Plus, Send, Trash2, Edit2, Users, BarChart2, Eye, EyeOff, Save, X, ChevronDown } from 'lucide-react'

const SEGMENTS = ['All Leads', 'Hot Leads', 'Untouched Leads', 'Qualified Leads', 'Application Started', 'Payment Pending']
const TEMPLATES = {
  blank: { subject: '', body: '' },
  admission: {
    subject: 'CUEE 2026 — Apply Now for {course} at CUTM!',
    body: `Dear {name},

Greetings from Centurion University of Technology & Management!

We are delighted to invite you to apply for the CUEE 2026 admissions. Limited seats are available for {course} at our world-class campuses.

🎓 Why Choose CUTM?
• NBA/NAAC Accredited Programs
• 95%+ Placement Record
• 4 Campuses across Odisha & Andhra Pradesh
• Industry-integrated curriculum

📅 Application Deadline: 30th June 2026

👉 Apply Now: https://cutm.ac.in/apply

For queries, call us at: +91 674 2559441

Best Regards,
Admissions Team — CUTM`
  },
  followup: {
    subject: 'Following up on your CUTM inquiry, {name}',
    body: `Dear {name},

Thank you for showing interest in Centurion University!

We noticed you haven't completed your application yet. Our counselors are available to assist you with:
• Course selection guidance
• Scholarship information
• Fee structure details
• Campus virtual tour

📞 Call us: +91 674 2559441
📧 Email: admissions@cutm.ac.in

Don't miss your seat — apply today!

Warm Regards,
CUTM Admissions Team`
  },
  scholarship: {
    subject: '🎓 Scholarship Opportunity for {name} at CUTM',
    body: `Dear {name},

Congratulations! Based on your profile, you may be eligible for CUTM Merit Scholarships worth up to ₹1,00,000!

Scholarship Categories:
• Merit Scholarship: Up to 100% tuition waiver
• Sports Excellence: ₹50,000 grant
• Rural Talent: ₹25,000 support

Apply before 15th June to qualify for scholarship assessment.

Apply Here: https://cutm.ac.in/scholarship

Contact: admissions@cutm.ac.in | +91 674 2559441

CUTM Admissions Team`
  }
}

export default function EmailCampaigns() {
  const { emailCampaigns, setEmailCampaigns, addEmailCampaign, sendEmailCampaign, deleteEmailCampaign, leads, showToast } = useCcrm()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const [form, setForm] = useState({ name: '', subject: '', template: '', segment: 'All Leads' })
  const [selectedTemplate, setSelectedTemplate] = useState('blank')
  const [loading, setLoading] = useState(false)
  const [sendingId, setSendingId] = useState(null)

  useEffect(() => {
    fetch('/api/email-campaigns')
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmailCampaigns(data))
      .catch(() => {})
  }, [])

  const handleTemplateSelect = (tpl) => {
    setSelectedTemplate(tpl)
    const t = TEMPLATES[tpl]
    setForm(prev => ({ ...prev, subject: t.subject, template: t.body }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name || !form.subject) return showToast('Campaign name and subject required.', 'error')
    setLoading(true)
    if (editId) {
      try {
        const res = await fetch(`/api/email-campaigns/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        })
        if (res.ok) {
          const updated = await res.json()
          setEmailCampaigns(prev => prev.map(c => c.id === editId ? { ...c, ...updated } : c))
          showToast('Campaign updated.', 'success')
        }
      } catch {}
    } else {
      await addEmailCampaign(form)
    }
    setLoading(false)
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', subject: '', template: '', segment: 'All Leads' })
  }

  const handleSend = async (id) => {
    const camp = emailCampaigns.find(c => c.id === id)
    const count = recipientCount(camp?.segment || 'All Leads')
    if (!confirm(`Send "${camp?.name}" to ${count} leads in segment "${camp?.segment}"?\n\nThis action cannot be undone.`)) return
    setSendingId(id)
    const result = await sendEmailCampaign(id)
    setSendingId(null)
    if (result) {
      const { sent = 0, failed = 0, total = 0 } = result
      if (failed > 0 && sent === 0) {
        showToast(`Send failed for all ${failed} recipients — check SMTP credentials in Integrations → Gmail/SMTP Email`, 'error')
      } else if (failed > 0) {
        showToast(`Sent: ${sent} ✓  Failed: ${failed} ✗  — check Communications Report for details`, 'warning')
      } else {
        showToast(`Campaign sent to ${sent} of ${total} recipients ✓`, 'success')
      }
    }
  }

  const openEdit = (camp) => {
    setForm({ name: camp.name, subject: camp.subject || '', template: camp.template || '', segment: camp.segment || 'All Leads' })
    setEditId(camp.id)
    setShowForm(true)
  }

  const recipientCount = (segment) => {
    if (!leads) return 0
    const hasEmail = l => l.email && !l.email.includes('noemail') && l.email.trim() !== ''
    if (segment === 'All Leads')          return leads.filter(hasEmail).length
    if (segment === 'Hot Leads')          return leads.filter(l => hasEmail(l) && (l.score || 0) >= 75).length
    if (segment === 'Untouched Leads')    return leads.filter(l => hasEmail(l) && l.stage === 'Untouched').length
    if (segment === 'Qualified Leads')    return leads.filter(l => hasEmail(l) && l.stage === 'Qualified Leads').length
    if (segment === 'Application Started') return leads.filter(l => hasEmail(l) && ['Application Started','Contacted','Follow Up'].includes(l.stage)).length
    if (segment === 'Payment Pending')    return leads.filter(l => hasEmail(l) && ['Payment Pending','Application Submitted','Payment Approved'].includes(l.stage)).length
    return leads.filter(hasEmail).length
  }

  const stats = {
    total: emailCampaigns.length,
    sent: emailCampaigns.filter(c => c.status === 'Sent').length,
    draft: emailCampaigns.filter(c => c.status === 'Draft').length,
    totalSent: emailCampaigns.reduce((s, c) => s + (c.sentCount || 0), 0)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Mail size={26} className="text-primary-500" /> Email Campaigns
          </h1>
          <p className="text-slate-500 text-sm mt-1">Create, personalize and send email campaigns to lead segments</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ name:'', subject:'', template:'', segment:'All Leads' }); setSelectedTemplate('blank') }}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: stats.total, color: 'text-slate-700 bg-slate-50', icon: Mail },
          { label: 'Sent', value: stats.sent, color: 'text-green-600 bg-green-50', icon: Send },
          { label: 'Drafts', value: stats.draft, color: 'text-yellow-600 bg-yellow-50', icon: Edit2 },
          { label: 'Emails Sent', value: stats.totalSent.toLocaleString(), color: 'text-primary-600 bg-primary-50', icon: Users },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">{editId ? 'Edit Campaign' : 'New Email Campaign'}</h2>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. CUEE 2026 Outreach"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Segment</label>
                <select
                  value={form.segment}
                  onChange={e => setForm(p => ({ ...p, segment: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {SEGMENTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Template selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Quick Templates</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries({ blank: '📝 Blank', admission: '🎓 Admission', followup: '📞 Follow Up', scholarship: '💰 Scholarship' }).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleTemplateSelect(k)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${selectedTemplate === k ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold' : 'border-slate-200 text-slate-600 hover:border-primary-300'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                placeholder="Use {name} for personalization"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Body</label>
              <textarea
                value={form.template}
                onChange={e => setForm(p => ({ ...p, template: e.target.value }))}
                rows={12}
                placeholder="Write your email content. Use {name} for personalization..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
              />
              <p className="text-xs text-slate-400 mt-1">
                Available variables: <code className="bg-slate-100 px-1 rounded">{'{name}'}</code>
                <span className="mx-1">·</span>
                Recipients: <strong className="text-primary-600">{recipientCount(form.segment)} leads</strong>
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="px-4 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                <Save size={16} /> {loading ? 'Saving...' : 'Save Campaign'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaigns List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {emailCampaigns.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Mail size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm">Create your first email campaign to get started</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Campaign</th>
                <th className="px-4 py-3 text-left">Segment</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Opens</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emailCampaigns.map(camp => (
                <tr key={camp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{camp.name}</div>
                    <div className="text-xs text-slate-400 truncate max-w-xs">{camp.subject}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{camp.segment}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${camp.status === 'Sent' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {camp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{(camp.sentCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{camp.openCount || 0}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{camp.clickCount || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setPreviewId(previewId === camp.id ? null : camp.id)}
                        className="p-1.5 text-slate-400 hover:text-primary-600 rounded-lg hover:bg-primary-50"
                        title="Preview"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => openEdit(camp)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                        disabled={camp.status === 'Sent'}
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleSend(camp.id)}
                        disabled={camp.status === 'Sent' || sendingId === camp.id}
                        className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-30"
                        title="Send Campaign"
                      >
                        {sendingId === camp.id ? <span className="animate-spin inline-block w-3 h-3 border border-slate-400 border-t-green-500 rounded-full" /> : <Send size={15} />}
                      </button>
                      <button
                        onClick={() => deleteEmailCampaign(camp.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview panel */}
      {previewId && (() => {
        const camp = emailCampaigns.find(c => c.id === previewId)
        if (!camp) return null
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">📧 Preview: {camp.name}</h3>
              <button onClick={() => setPreviewId(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">Subject:</div>
              <div className="font-medium text-slate-800 mb-4">{camp.subject?.replace(/\{name\}/g, 'Student Name')}</div>
              <div className="text-xs text-slate-500 mb-1">Body:</div>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {(camp.template || '(No content)')?.replace(/\{name\}/g, 'Student Name')}
              </pre>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
