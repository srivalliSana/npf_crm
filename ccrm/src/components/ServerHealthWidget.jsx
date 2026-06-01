import React, { useState, useEffect } from 'react'
import { Server, Database, Cpu, HardDrive, RefreshCw, Activity } from 'lucide-react'

function formatUptime(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function ServerHealthWidget() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    fetch('/api/admin/server-health')
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)  // refresh every 30s
    return () => clearInterval(id)
  }, [])

  const dbUp     = data?.database?.status === 'up'
  const serverUp = data?.server?.status === 'up'
  const memUsed  = data?.memory?.systemUsedPct || 0
  const memTone  = memUsed > 85 ? 'red' : memUsed > 70 ? 'yellow' : 'green'

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Server size={16} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Server Health</h3>
            <p className="text-xs text-gray-400">Live system metrics · auto-refreshes every 30s</p>
          </div>
        </div>
        <button onClick={refresh} className="text-blue-500 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!data ? (
        <div className="text-center py-6 text-xs text-gray-400">
          {loading ? 'Loading metrics…' : 'No data — server endpoint unreachable'}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status row */}
          <div className="grid grid-cols-2 gap-3">
            <StatusCard label="API Server" up={serverUp} subtext={`Uptime: ${formatUptime(data.server.uptimeSec)}`} icon={Activity} />
            <StatusCard label="Database"   up={dbUp}     subtext={`Latency: ${data.database.latencyMs}ms`} icon={Database} />
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Node" icon={Cpu}
              value={data.server.nodeVersion}
              hint={`${data.server.cpuCount} CPU · load ${data.server.loadAvg1m}`}
            />
            <MetricCard label="Memory" icon={HardDrive}
              value={`${data.memory.heapUsedMB} MB`}
              hint={`Heap ${data.memory.heapUsedMB}/${data.memory.heapTotalMB} MB`}
            />
            <MetricCard label="System RAM" icon={HardDrive}
              value={`${memUsed}%`}
              tone={memTone}
              hint={`${data.memory.systemFreeGB} GB free / ${data.memory.systemTotalGB} GB total`}
            />
          </div>

          {/* Table counts mini-grid */}
          {data.counts && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-medium mb-2">Database Records</p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {Object.entries(data.counts).map(([table, count]) => (
                  <div key={table} className="bg-blue-50/60 rounded-md px-2 py-1.5">
                    <div className="text-[10px] text-blue-500 uppercase font-bold">{table}</div>
                    <div className="font-bold text-gray-700">{count.toLocaleString()}</div>
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

function StatusCard({ label, up, subtext, icon: Icon }) {
  return (
    <div className={`rounded-lg border p-3 ${up ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} className={up ? 'text-green-600' : 'text-red-500'} />
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {up ? '● UP' : '● DOWN'}
        </span>
      </div>
      <div className="text-[11px] text-gray-500">{subtext}</div>
    </div>
  )
}

function MetricCard({ label, value, hint, icon: Icon, tone = 'blue' }) {
  const toneClass = {
    blue:   'text-blue-700',
    green:  'text-green-700',
    yellow: 'text-yellow-700',
    red:    'text-red-700',
  }[tone]
  return (
    <div className="bg-blue-50/40 rounded-lg p-3 border border-blue-100/50">
      <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase font-bold mb-1">
        <Icon size={10} /> {label}
      </div>
      <div className={`font-bold text-sm ${toneClass}`}>{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={hint}>{hint}</div>
    </div>
  )
}
