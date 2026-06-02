import React from 'react'
import { Server } from 'lucide-react'
import ServerHealthWidget from '../components/ServerHealthWidget'

export default function ServerHealth() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Server size={22} className="text-primary-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Server Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">Backend uptime, database status and system resources</p>
        </div>
      </div>
      <ServerHealthWidget />
    </div>
  )
}
