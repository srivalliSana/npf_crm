import React, { useState, useEffect } from 'react'
import { Eye, LogOut } from 'lucide-react'

// Shown whenever a platform admin is viewing a tenant via "View Leads" —
// lets them return to their own platform-admin session without logging out.
export default function ImpersonationBanner() {
  const [backup, setBackup] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ccrm_impersonation_backup')
      setBackup(raw ? JSON.parse(raw) : null)
    } catch { setBackup(null) }
  }, [])

  if (!backup) return null

  const exitImpersonation = () => {
    localStorage.setItem('ccrm_token', backup.token)
    localStorage.setItem('ccrm_current_user', backup.user)
    localStorage.removeItem('ccrm_impersonation_backup')
    window.location.href = '/platform-tenants'
  }

  return (
    <div className="fixed bottom-4 left-4 z-[10001] flex items-center gap-2.5 bg-gray-900 text-white text-xs font-medium pl-3.5 pr-2 py-2 rounded-full shadow-dropdown">
      <Eye size={13} className="text-warning-400 flex-shrink-0" />
      <span>Viewing as <strong>{backup.tenantName}</strong>'s admin</span>
      <button
        onClick={exitImpersonation}
        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-full px-2.5 py-1 transition-colors"
      >
        <LogOut size={11} /> Exit
      </button>
    </div>
  )
}
