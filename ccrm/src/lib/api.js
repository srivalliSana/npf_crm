// Thin fetch wrapper for the new module pages.
//
// The app calls raw fetch everywhere and re-declares the Authorization header
// at every call site — which is exactly how the Payments page lost its header
// on three endpoints. New pages go through here instead.
//
// window.fetch is already patched in CcrmContext to bounce expired sessions to
// /login, so that behaviour is inherited rather than duplicated.

export const authHeaders = () => {
  const token = localStorage.getItem('ccrm_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function parse(res) {
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export function apiGet(path, params) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v != null)
      ).toString()
    : ''
  return fetch(`${path}${qs}`, { headers: authHeaders() }).then(parse)
}

export function apiSend(method, path, body) {
  return fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(parse)
}

export const apiPost = (path, body) => apiSend('POST', path, body)
export const apiPut = (path, body) => apiSend('PUT', path, body)
export const apiDelete = (path) => apiSend('DELETE', path)

// CSV endpoints need the Authorization header, so a plain <a download> can't
// reach them — fetch the body, then hand the browser a blob URL.
export async function downloadFile(path, params, fallbackName = 'export.csv') {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v != null)
      ).toString()
    : ''
  const res = await fetch(`${path}${qs}`, { headers: authHeaders() })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed.')

  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = match ? match[1] : fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ── Formatting shared across the dashboards ─────────────────────────────────
export const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'))

export const fmtMoney = (n) => {
  if (n == null) return '—'
  const v = Number(n)
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)} Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(2)} L`
  return `₹${v.toLocaleString('en-IN')}`
}

export const fmtDateTime = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { dateStyle: 'medium' })
}

export const fmtBytes = (n) => {
  if (!n) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = Number(n), i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
