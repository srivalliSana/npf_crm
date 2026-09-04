import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Card, Modal, Button } from '../components/ui'

const BLANK_FORM = {
  name: '',
  application_fee: '',
  booking_fee: '1000',
  registration_fee: '',
  min_due_provisional: '',
  tuition_fee: '',
  min_amount_to_pay: ''
}

export default function ProgramsManager() {
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPrograms()
  }, [])

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/programs', { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setPrograms(await res.json())
    } catch (e) {
      console.error('Failed to fetch programs:', e)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (program = null) => {
    if (program) {
      setEditingId(program.id)
      setFormData({
        name: program.name || '',
        application_fee: program.application_fee || '',
        booking_fee: program.booking_fee ?? '1000',
        registration_fee: program.registration_fee || '',
        min_due_provisional: program.min_due_provisional || '',
        tuition_fee: program.tuition_fee || '',
        min_amount_to_pay: program.min_amount_to_pay || ''
      })
    } else {
      setEditingId(null)
      setFormData(BLANK_FORM)
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      alert('Program name is required')
      return
    }

    setSaving(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const url = editingId ? `/api/programs/${editingId}` : '/api/programs'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          name: formData.name,
          application_fee: parseFloat(formData.application_fee) || 0,
          booking_fee: parseFloat(formData.booking_fee) || 0,
          registration_fee: parseFloat(formData.registration_fee) || 0,
          min_due_provisional: parseFloat(formData.min_due_provisional) || 0,
          tuition_fee: parseFloat(formData.tuition_fee) || 0,
          min_amount_to_pay: parseFloat(formData.min_amount_to_pay) || 0
        })
      })

      if (res.ok) {
        await fetchPrograms()
        setShowModal(false)
        alert(editingId ? 'Program updated' : 'Program created')
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to save program')
      }
    } catch (e) {
      alert('Error saving program: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this program?')) return

    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/programs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        await fetchPrograms()
        alert('Program deleted')
      } else {
        alert('Failed to delete program')
      }
    } catch (e) {
      alert('Error deleting program: ' + e.message)
    }
  }

  if (loading) return <PageContainer><p>Loading programs...</p></PageContainer>

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programs Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Programs and their fees are specific to your organization — set them here and they'll drive the admission journey's booking/registration/tuition fee amounts automatically.</p>
        </div>
        <button onClick={() => openModal()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium whitespace-nowrap">
          <Plus size={16} /> Add Program
        </button>
      </div>

      <Card>
        {programs.length === 0 ? (
          <p className="text-center py-8 text-gray-500">No programs yet. Click "Add Program" to create one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Program Name</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Booking Fee</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Registration Fee</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Min Due (Provisional)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Tuition Fee (Full)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Min Due (Tuition)</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {programs.map(prog => (
                  <tr key={prog.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{prog.name}</td>
                    <td className="text-right px-4 py-3 text-gray-600">₹{Number(prog.booking_fee || 0).toLocaleString()}</td>
                    <td className="text-right px-4 py-3 text-gray-600">₹{Number(prog.registration_fee).toLocaleString()}</td>
                    <td className="text-right px-4 py-3 text-gray-600">₹{Number(prog.min_due_provisional || 0).toLocaleString()}</td>
                    <td className="text-right px-4 py-3 text-gray-600">₹{Number(prog.tuition_fee).toLocaleString()}</td>
                    <td className="text-right px-4 py-3 text-gray-600">₹{Number(prog.min_amount_to_pay).toLocaleString()}</td>
                    <td className="text-center px-4 py-3 space-x-2">
                      <button onClick={() => openModal(prog)} className="text-blue-600 hover:text-blue-700">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(prog.id)} className="text-red-600 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Program' : 'Add Program'} size="md">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Program Name *</label>
              <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., BBA, MBA, B.Tech" className="input-field text-sm w-full" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Application Fee</label>
              <input type="number" value={formData.application_fee} onChange={e => setFormData(p => ({ ...p, application_fee: e.target.value }))}
                placeholder="0" className="input-field text-sm w-full" />
            </div>

            <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100 space-y-3">
              <p className="text-xs font-semibold text-indigo-800">Step 1 — Booking Fee</p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Booking Fee</label>
                <input type="number" value={formData.booking_fee} onChange={e => setFormData(p => ({ ...p, booking_fee: e.target.value }))}
                  placeholder="1000" className="input-field text-sm w-full" />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 space-y-3">
              <p className="text-xs font-semibold text-amber-800">Step 2 — Registration Fee → Provisional Admission</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Registration Fee (Full)</label>
                  <input type="number" value={formData.registration_fee} onChange={e => setFormData(p => ({ ...p, registration_fee: e.target.value }))}
                    placeholder="0" className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Min Due for Provisional</label>
                  <input type="number" value={formData.min_due_provisional} onChange={e => setFormData(p => ({ ...p, min_due_provisional: e.target.value }))}
                    placeholder="0" className="input-field text-sm w-full" />
                </div>
              </div>
              <p className="text-xs text-amber-700">The student must pay at least "Min Due for Provisional" to be granted provisional admission — it can differ from the full registration fee.</p>
            </div>

            <div className="p-3 rounded-lg bg-green-50 border border-green-100 space-y-3">
              <p className="text-xs font-semibold text-green-800">Step 3 — Tuition Fee → Documents + CampusOne</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tuition Fee (Full)</label>
                  <input type="number" value={formData.tuition_fee} onChange={e => setFormData(p => ({ ...p, tuition_fee: e.target.value }))}
                    placeholder="0" className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Min Due (Tuition)</label>
                  <input type="number" value={formData.min_amount_to_pay} onChange={e => setFormData(p => ({ ...p, min_amount_to_pay: e.target.value }))}
                    placeholder="0" className="input-field text-sm w-full" />
                </div>
              </div>
              <p className="text-xs text-green-700">Once this minimum tuition amount is paid and all mandatory documents are verified, the application is auto-synced to CampusOne.</p>
            </div>
          </div>
          <div className="mt-6 flex gap-2 justify-end">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50">
              <Save size={16} /> {saving ? 'Saving...' : (editingId ? 'Update' : 'Create')}
            </button>
          </div>
        </Modal>
      )}
    </PageContainer>
  )
}
