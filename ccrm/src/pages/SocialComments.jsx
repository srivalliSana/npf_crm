import React, { useState, useEffect } from 'react'
import { MessageCircle, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Facebook, Instagram } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function SocialComments() {
  const { showToast } = useCcrm()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [platform, setPlatform] = useState('')
  const [loading, setLoading] = useState(false)
  const limit = 25
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const load = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const qs = new URLSearchParams({ page, limit })
      if (platform) qs.set('platform', platform)
      const res = await fetch(`/api/social-comments?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('Failed to load comments')
      const data = await res.json()
      setRows(data.rows || [])
      setTotal(data.total || 0)
    } catch (e) {
      showToast('Failed to load social comments.', 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [page, platform])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle size={20} className="text-primary-500" /> Social Comments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Facebook &amp; Instagram comments captured via the Meta webhook (each commenter is also a lead).</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={platform} onChange={e => { setPlatform(e.target.value); setPage(1) }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">All platforms</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <button onClick={load} className="flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Commenter</th>
                <th className="px-4 py-3 text-left">Comment</th>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Post</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400"><RefreshCw className="inline animate-spin mr-2" size={16} /> Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">No comments captured yet.</td></tr>
              ) : rows.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${c.platform === 'instagram' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
                      {c.platform === 'instagram' ? <Instagram size={12} /> : <Facebook size={12} />}
                      {c.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.commenter_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-md">{c.text || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    {c.permalink
                      ? <a href={c.permalink} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline inline-flex items-center gap-1 text-xs"><ExternalLink size={12} /> View</a>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500">
            <span>Page {page} of {totalPages} · {total.toLocaleString()} comments</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
