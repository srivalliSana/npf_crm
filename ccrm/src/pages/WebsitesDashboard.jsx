import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, CheckCircle, AlertCircle, ArrowRight, Building2, Leaf, GraduationCap, Sprout } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import PageContainer from '../components/PageContainer'
import { Card, StatCard } from '../components/ui'

const SITES = [
  { id: 'gttech', label: 'GTTECH', icon: Building2,     tone: 'primary' },
  { id: 'ftl',    label: 'FTL',    icon: Leaf,          tone: 'success' },
  { id: 'gtib',   label: 'GTIB',   icon: GraduationCap,  tone: 'info'    },
  { id: 'esse',   label: 'ESSE',   icon: Sprout,         tone: 'warning' },
]
const EMPTY = { total: 0, notContacted: 0, assigned: 0, unassigned: 0 }
// Tailwind can't see dynamically-built class names at build time — spell each tone out
const ICON_TONE = {
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-success-100 text-success-700',
  info:    'bg-info-100 text-info-700',
  warning: 'bg-warning-100 text-warning-700',
}

export default function WebsitesDashboard() {
  const navigate = useNavigate()
  const { showToast } = useCcrm()
  const [stats, setStats] = useState(() => Object.fromEntries(SITES.map(s => [s.id, EMPTY])))
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const countOf = async (site, qs) => {
        const res = await fetch(`/api/${site}-leads?limit=1${qs}`, { headers })
        return res.ok ? (await res.json()).total || 0 : 0
      }

      const results = await Promise.all(SITES.map(async ({ id }) => {
        const [total, assigned, unassigned, notContacted] = await Promise.all([
          countOf(id, ''),
          countOf(id, '&owner=!Unassigned'),
          countOf(id, '&owner=Unassigned'),
          countOf(id, '&status=' + encodeURIComponent('Not Contacted')),
        ])
        return [id, { total, assigned, unassigned, notContacted }]
      }))
      setStats(Object.fromEntries(results))
    } catch (err) {
      console.error('Failed to fetch stats:', err)
      showToast('Failed to load website stats', 'error')
    } finally {
      setLoading(false)
    }
  }

  const grand = SITES.reduce((acc, { id }) => {
    const d = stats[id]
    return { total: acc.total + d.total, assigned: acc.assigned + d.assigned, unassigned: acc.unassigned + d.unassigned }
  }, { total: 0, assigned: 0, unassigned: 0 })

  return (
    <PageContainer title="Website Leads Dashboard" description="Leads from the GT-entity inquiry sites — GTTECH, FTL, GTIB, ESSE">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        <StatCard icon={Users} label="Total Leads (all sites)" value={grand.total.toLocaleString('en-IN')} tone="neutral" />
        <StatCard icon={CheckCircle} label="Assigned" value={grand.assigned.toLocaleString('en-IN')} tone="success" />
        <StatCard icon={AlertCircle} label="Unassigned" value={grand.unassigned.toLocaleString('en-IN')} tone="warning" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SITES.map(s => <div key={s.id} className="card p-6 h-40 animate-pulse bg-gray-50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SITES.map(({ id, label, icon: Icon, tone }) => {
            const d = stats[id]
            const rate = d.total > 0 ? Math.round((d.assigned / d.total) * 100) : 0
            return (
              <Card key={id} className="flex flex-col">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${ICON_TONE[tone] || ICON_TONE.primary}`}>
                      <Icon size={20} strokeWidth={2} />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 text-base">{label} Leads</h2>
                      <p className="text-gray-400 text-xs mt-0.5">Manage and assign leads</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/${id}-leads`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs font-semibold flex-shrink-0"
                  >
                    Manage <ArrowRight size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-semibold uppercase tracking-wide"><Users size={11} /> Total</div>
                    <div className="text-xl font-extrabold text-gray-900 mt-0.5">{d.total.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-info-50 rounded-lg px-3 py-2.5 border border-info-100">
                    <div className="flex items-center gap-1.5 text-info-600 text-[11px] font-semibold uppercase tracking-wide"><Clock size={11} /> Not Contacted</div>
                    <div className="text-xl font-extrabold text-info-700 mt-0.5">{d.notContacted.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-success-50 rounded-lg px-3 py-2.5 border border-success-100">
                    <div className="flex items-center gap-1.5 text-success-600 text-[11px] font-semibold uppercase tracking-wide"><CheckCircle size={11} /> Assigned</div>
                    <div className="text-xl font-extrabold text-success-700 mt-0.5">{d.assigned.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-warning-50 rounded-lg px-3 py-2.5 border border-warning-100">
                    <div className="flex items-center gap-1.5 text-warning-600 text-[11px] font-semibold uppercase tracking-wide"><AlertCircle size={11} /> Unassigned</div>
                    <div className="text-xl font-extrabold text-warning-700 mt-0.5">{d.unassigned.toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2.5">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-success-500 h-1.5 rounded-full transition-all" style={{ width: `${rate}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 flex-shrink-0">{rate}% assigned</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}
