import React, { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Search } from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Card } from '../components/ui'
import { useCcrm } from '../context/CcrmContext'

export default function DocumentVerification() {
  const [applications, setApplications] = useState([])
  const [selectedApp, setSelectedApp] = useState(null)
  const [documents, setDocuments] = useState([])
  const [verifyingDoc, setVerifyingDoc] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const { tenantConfig } = useCcrm()

  useEffect(() => {
    fetchApplications()
  }, [])

  const fetchApplications = async () => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/applications', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const apps = await res.json()
        setApplications(apps.filter(a => a.form_status === 'Complete' && a.stage !== 'Verified'))
      }
    } catch (e) {
      console.error('Failed to fetch applications:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectApp = async (app) => {
    setSelectedApp(app)
    setVerifyingDoc(null)
    setRejectionReason('')
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/documents/verify?app_id=${app.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setDocuments(await res.json())
    } catch (e) {
      console.error('Failed to fetch documents:', e)
    }
  }

  const handleVerifyDoc = async (docId, status) => {
    if (status === 'Rejected' && !rejectionReason.trim()) {
      alert('Please provide a rejection reason.')
      return
    }

    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/documents/${docId}/verify`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, rejectionReason })
      })

      if (res.ok) {
        // Update local documents list
        setDocuments(docs =>
          docs.map(d => d.id === docId ? { ...d, status, verified_by: 'current_user', verified_at: new Date() } : d)
        )
        setVerifyingDoc(null)
        setRejectionReason('')
        alert(`Document marked as ${status}`)
      } else {
        alert('Failed to verify document')
      }
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const filteredApps = applications.filter(app =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.app_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getDocumentStatusColor = (status) => {
    switch (status) {
      case 'Verified': return 'bg-green-50 border-green-200'
      case 'Rejected': return 'bg-red-50 border-red-200'
      default: return 'bg-yellow-50 border-yellow-200'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Verified': return <CheckCircle2 size={18} className="text-green-600" />
      case 'Rejected': return <XCircle size={18} className="text-red-600" />
      default: return <AlertCircle size={18} className="text-yellow-600" />
    }
  }

  if (loading) return <PageContainer><p>Loading...</p></PageContainer>

  return (
    <PageContainer>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Applications List */}
        <div className="lg:col-span-1">
          <Card>
            <div className="flex items-center gap-2 mb-4 p-4 bg-gray-50 rounded-lg">
              <Search size={18} className="text-gray-400" />
              <input
                type="text"
                placeholder="Search by name/email/ID"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
              />
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredApps.length === 0 ? (
                <p className="text-center py-8 text-gray-500">No applications pending verification</p>
              ) : (
                filteredApps.map(app => (
                  <button
                    key={app.id}
                    onClick={() => handleSelectApp(app)}
                    className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                      selectedApp?.id === app.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-sm">{app.name}</div>
                    <div className="text-xs text-gray-500">{app.app_no}</div>
                    <div className="text-xs text-gray-400">{app.email}</div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Document Verification Area */}
        <div className="lg:col-span-2">
          {!selectedApp ? (
            <Card>
              <div className="text-center py-12 text-gray-500">
                <p>Select an application to view and verify documents</p>
              </div>
            </Card>
          ) : (
            <>
              <Card className="mb-6">
                <div className="flex items-start justify-between mb-4 pb-4 border-b">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedApp.name}</h2>
                    <p className="text-sm text-gray-600">{selectedApp.app_no}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">Course</div>
                    <div className="text-sm text-gray-600">{selectedApp.course}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Email: </span>
                    <span className="font-medium">{selectedApp.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Mobile: </span>
                    <span className="font-medium">{selectedApp.mobile}</span>
                  </div>
                </div>
              </Card>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Documents</h3>
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <Card>
                      <p className="text-center py-8 text-gray-500">No documents uploaded yet</p>
                    </Card>
                  ) : (
                    documents.map(doc => (
                      <Card key={doc.id} className={`border-2 ${getDocumentStatusColor(doc.status)}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="mt-1">{getStatusIcon(doc.status)}</div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{doc.type}</div>
                              <div className="text-xs text-gray-600">
                                Status: <span className="font-semibold">{doc.status}</span>
                              </div>
                              {doc.verified_by && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Verified by {doc.verified_by} on {new Date(doc.verified_at).toLocaleDateString()}
                                </div>
                              )}
                              {doc.rejection_reason && (
                                <div className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                                  {doc.rejection_reason}
                                </div>
                              )}
                            </div>
                          </div>

                          {doc.status === 'Pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setVerifyingDoc(doc.id)}
                                className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Verify
                              </button>
                              <button
                                onClick={() => {
                                  setVerifyingDoc(doc.id)
                                  setRejectionReason('')
                                }}
                                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>

                        {verifyingDoc === doc.id && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            {doc.status === 'Pending' && !rejectionReason && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleVerifyDoc(doc.id, 'Verified')}
                                  className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                  ✓ Confirm Verified
                                </button>
                                <button
                                  onClick={() => setRejectionReason('temp')}
                                  className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                  ✗ Mark Rejected
                                </button>
                              </div>
                            )}

                            {verifyingDoc === doc.id && rejectionReason === 'temp' && (
                              <div className="space-y-2">
                                <textarea
                                  placeholder="Enter reason for rejection..."
                                  value={rejectionReason === 'temp' ? '' : rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  className="w-full p-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                                  rows="3"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleVerifyDoc(doc.id, 'Rejected')}
                                    className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                  >
                                    Confirm Rejection
                                  </button>
                                  <button
                                    onClick={() => {
                                      setVerifyingDoc(null)
                                      setRejectionReason('')
                                    }}
                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
