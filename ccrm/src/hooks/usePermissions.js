import { useState, useEffect } from 'react'
import { apiGet } from '../lib/api'

// The signed-in user's effective permissions (item 29).
//
// Route guards still gate on role — that behaviour is unchanged. This is for
// gating individual controls inside a page, where "is this an Admin?" is the
// wrong question and "may this account approve payments?" is the right one.
//
// Cached at module scope: permissions change rarely and every page that gates a
// button would otherwise refetch them on mount.
let _cache = null
let _inflight = null

export function clearPermissionCache() {
  _cache = null
  _inflight = null
}

export function usePermissions() {
  const [state, setState] = useState(_cache)
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    if (_cache) return
    let alive = true
    _inflight = _inflight || apiGet('/api/security/me/permissions')
    _inflight
      .then(data => {
        _cache = data
        if (alive) { setState(data); setLoading(false) }
      })
      .catch(() => {
        // An older server without this endpoint, or a transient failure. Mark
        // it as `failed` rather than "no permissions": callers fall back to the
        // role check in that case, so a flaky request can't lock a legitimate
        // user out of pages their role has always been able to reach.
        _inflight = null
        if (alive) { setState({ permissions: [], role: '', failed: true }); setLoading(false) }
      })
    return () => { alive = false }
  }, [])

  const permissions = state?.permissions || []
  const can = (key) => permissions.includes('*') || permissions.includes(key)

  return {
    can,
    permissions,
    role: state?.role || '',
    isSuperAdmin: !!state?.isSuperAdmin,
    loading,
    failed: !!state?.failed,
  }
}
