import React from 'react'
import { Plug } from 'lucide-react'
import IntegrationStatusWidget from '../components/IntegrationStatusWidget'

export default function IntegrationHealth() {
  return (
    <div className="p-6">
      <div className="page-band"><div>
          <h1 className="page-band-title"><Plug size={26} /> Integration Health</h1>
          <p className="page-band-desc">Live status of email, SMS, WhatsApp, RCS and telephony integrations</p>
        </div></div>
      <IntegrationStatusWidget />
    </div>
  )
}
