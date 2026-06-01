import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Users, AlertTriangle, CheckCircle2, XCircle, ChevronRight, Lock } from 'lucide-react'

export default function SecurityWidget() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    fetch('/api/admin/security-overview')
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  const u = data?.userStats
  const failed = data?.failedPayments || 0
  const checks = data?.integrationChecks || []
  const checksOk = checks.filter(c => c.ok).length
  const allOk    = checks.length > 0 && checksOk === checks.length

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Shield size={16} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Security & User Access</h3>
            <p className="text-xs text-gray-400">User roles · recent logins · integration checks</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/users')}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
        >
          Manage Users <ChevronRight size={12} />
        </button>
      </div>

      {!data || loading ? (
        <div className="text-center py-6 text-xs text-gray-400">
          {loading ? 'Loading security overview…' : 'Endpoint unreachable'}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Role split */}
          {u && (
            <div className="grid grid-cols-5 gap-2">
              <KPI label="Total"      value={u.total}      color="text-gray-700"   bg="bg-blue-50/60" />
              <KPI label="Active"     value={u.active}     color="text-green-600"  bg="bg-green-50" />
              <KPI label="Inactive"   value={u.inactive}   color="text-red-500"    bg="bg-red-50" />
              <KPI label="Admins"     value={u.admins}     color="text-red-600"    bg="bg-red-50/60" />
              <KPI label="Counsellors" value={u.counselors} color="text-blue-600"  bg="bg-blue-50/60" />
            </div>
          )}

          {/* Integration / security checks */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-600 uppercase">Security & Integration Checks</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${allOk ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {checksOk} / {checks.length} OK
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {checks.map(c => (
                <div key={c.label} className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border ${c.ok ? 'bg-green-50/50 border-green-100 text-green-700' : 'bg-red-50/50 border-red-100 text-red-600'}`}>
                  {c.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <span className="font-medium">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Failed payment / suspicious activity */}
          {failed > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 flex items-center gap-2 text-xs">
              <AlertTriangle size={14} className="text-yellow-600 flex-shrink-0" />
              <span className="text-yellow-700">
                <strong>{failed}</strong> failed payment attempt{failed === 1 ? '' : 's'} on record — review in Payments
              </span>
            </div>
          )}

          {/* Recent logins */}
          {data.recentLogins?.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-600 uppercase mb-2 flex items-center gap-1">
                <Lock size={11} /> Recent Active Sessions
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {data.recentLogins.slice(0, 6).map((u, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-blue-50/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 flex-shrink-0">
                        {u.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-700 truncate">{u.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 ml-2">
                      <span className={`text-[9px] font-bold px-1.5 rounded ${
                        u.role === 'Admin'     ? 'bg-red-100 text-red-700' :
                        u.role === 'Manager'   ? 'bg-purple-100 text-purple-700' :
                        u.role === 'Counselor' ? 'bg-blue-100 text-blue-700' :
                                                 'bg-green-100 text-green-700'
                      }`}>{u.role}</span>
                      <span className="text-[9px] text-gray-400 mt-0.5">{u.lastLogin}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function KPI({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-md px-2 py-2 text-center`}>
      <div className={`text-base font-extrabold ${color}`}>{value}</div>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5 truncate">{label}</div>
    </div>
  )
}
