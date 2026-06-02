import React from 'react'
import { ShieldCheck } from 'lucide-react'
import SecurityWidget from '../components/SecurityWidget'

export default function SecurityAccess() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck size={22} className="text-primary-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Security &amp; User Access</h1>
          <p className="text-sm text-gray-500 mt-0.5">Active sessions, login activity and access controls</p>
        </div>
      </div>
      <SecurityWidget />
    </div>
  )
}
