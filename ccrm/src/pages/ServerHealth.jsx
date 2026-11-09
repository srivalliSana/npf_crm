import React from 'react'
import { Server } from 'lucide-react'
import ServerHealthWidget from '../components/ServerHealthWidget'

export default function ServerHealth() {
  return (
    <div className="p-6">
      <div className="page-band"><div>
          <h1 className="page-band-title"><Server size={26} /> Server Health</h1>
          <p className="page-band-desc">Backend uptime, database status and system resources</p>
        </div></div>
      <ServerHealthWidget />
    </div>
  )
}
