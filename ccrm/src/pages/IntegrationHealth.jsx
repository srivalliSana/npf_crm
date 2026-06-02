import React from 'react'
import { Plug } from 'lucide-react'
import IntegrationStatusWidget from '../components/IntegrationStatusWidget'

export default function IntegrationHealth() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Plug size={22} className="text-primary-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Integration Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live status of email, SMS, WhatsApp, RCS and telephony integrations</p>
        </div>
      </div>
      <IntegrationStatusWidget />
    </div>
  )
}
