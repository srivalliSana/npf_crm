// Role-based access control (item 29).
//
// The app already had a `roles` table with a permissions JSONB column, but
// nothing read it — every gate in the app checked the role *string* ('Admin',
// 'Manager', …), so a custom role could be created and then behaved like a
// Counselor. This module makes those stored permissions the actual authority.
//
// Compatibility rules that matter:
//   • '*' in a role's permission list means full access (Admin keeps it).
//   • Super admins and platform admins always bypass — same as the UI's
//     RoleGuard, which treats them as privileged regardless of base role.
//   • A role whose row is missing, or whose permission list is empty, falls
//     back to ROLE_DEFAULTS so an unmigrated DB never locks anyone out.
import { pool } from '../db.js'

// ── Catalogue ────────────────────────────────────────────────────────────────
// The full set of grantable permissions, grouped for the admin UI's matrix.
export const PERMISSIONS = [
  { key: 'leads.view_own',        group: 'Leads',        label: 'View own leads' },
  { key: 'leads.view_all',        group: 'Leads',        label: 'View all leads' },
  { key: 'leads.edit',            group: 'Leads',        label: 'Create / edit leads' },
  { key: 'leads.delete',          group: 'Leads',        label: 'Delete leads' },
  { key: 'leads.assign',          group: 'Leads',        label: 'Assign & transfer leads' },
  { key: 'leads.export',          group: 'Leads',        label: 'Export lead data' },

  { key: 'applications.view',     group: 'Admissions',   label: 'View applications' },
  { key: 'applications.edit',     group: 'Admissions',   label: 'Edit applications' },
  { key: 'applications.verify',   group: 'Admissions',   label: 'Verify / approve admissions' },
  { key: 'documents.view',        group: 'Admissions',   label: 'View documents' },
  { key: 'documents.verify',      group: 'Admissions',   label: 'Verify documents' },

  { key: 'payments.view',         group: 'Finance',      label: 'View payments' },
  { key: 'payments.approve',      group: 'Finance',      label: 'Approve payments' },
  { key: 'payments.export',       group: 'Finance',      label: 'Export finance data' },

  { key: 'messaging.send',        group: 'Engagement',   label: 'Send email / SMS / WhatsApp / RCS' },
  { key: 'campaigns.manage',      group: 'Engagement',   label: 'Manage campaigns & drip flows' },

  { key: 'analytics.view',        group: 'Analytics',    label: 'View analytics dashboards' },
  { key: 'reports.view',          group: 'Analytics',    label: 'View reports' },
  { key: 'reports.export',        group: 'Analytics',    label: 'Export reports' },
  { key: 'commandcentre.view',    group: 'Analytics',    label: 'View Management Command Centre' },

  { key: 'compliance.view',       group: 'Compliance',   label: 'View compliance workspace' },
  { key: 'compliance.export',     group: 'Compliance',   label: 'Generate statutory reports' },
  { key: 'audit.view',            group: 'Compliance',   label: 'Read the audit trail' },
  { key: 'retention.manage',      group: 'Compliance',   label: 'Edit retention policies' },

  { key: 'integrations.view',     group: 'Integration',  label: 'View integrations' },
  { key: 'integrations.manage',   group: 'Integration',  label: 'Configure & run integrations' },

  { key: 'security.view',         group: 'Security',     label: 'View security dashboard' },
  { key: 'security.manage',       group: 'Security',     label: 'Revoke sessions, run backups' },
  { key: 'users.view',            group: 'Security',     label: 'View user accounts' },
  { key: 'users.manage',          group: 'Security',     label: 'Create / edit / disable users' },
  { key: 'roles.manage',          group: 'Security',     label: 'Edit roles & permissions' },
  { key: 'settings.manage',       group: 'Security',     label: 'Change org & integration settings' },
]

export const PERMISSION_KEYS = PERMISSIONS.map(p => p.key)

// ── Defaults per built-in role ───────────────────────────────────────────────
export const ROLE_DEFAULTS = {
  Admin: ['*'],
  Manager: [
    'leads.view_all', 'leads.edit', 'leads.assign', 'leads.export',
    'applications.view', 'applications.edit', 'documents.view',
    'payments.view', 'messaging.send', 'campaigns.manage',
    'analytics.view', 'reports.view', 'reports.export', 'commandcentre.view',
    'users.view',
  ],
  Counselor: [
    'leads.view_own', 'leads.edit', 'applications.view', 'documents.view',
    'payments.view', 'messaging.send', 'reports.view',
  ],
  Finance: [
    'payments.view', 'payments.approve', 'payments.export',
    'applications.view', 'documents.view', 'reports.view', 'reports.export',
  ],
}

// ── Resolution ───────────────────────────────────────────────────────────────
// Role → permissions is read constantly (every guarded request), changes rarely,
// and is global rather than per-tenant like the `roles` table itself. A short
// TTL cache keeps it off the hot path without making edits feel stale.
const CACHE_TTL_MS = 60_000
let _cache = { at: 0, map: null }

export function invalidatePermissionCache() {
  _cache = { at: 0, map: null }
}

const KNOWN = new Set([...PERMISSION_KEYS, '*'])

async function loadRoleMap() {
  if (_cache.map && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.map
  const map = new Map()
  try {
    const r = await pool.query('SELECT name, permissions FROM roles;')
    for (const row of r.rows) {
      const perms = Array.isArray(row.permissions) ? row.permissions : []
      // The roles table predates this catalogue and was seeded with coarse
      // strings ('view_all_leads', 'manage_team') that match nothing here. A
      // role holding only those — or nothing at all — falls back to its
      // built-in default, so an un-migrated DB degrades to today's access
      // rather than locking every non-Admin out of the whole product.
      const usable = perms.filter(p => KNOWN.has(p))
      map.set(row.name, usable.length ? usable : (ROLE_DEFAULTS[row.name] || []))
    }
  } catch {
    // roles table unavailable — fall back entirely to the built-in defaults so
    // a migration hiccup degrades to today's behaviour instead of a lockout.
  }
  for (const [name, perms] of Object.entries(ROLE_DEFAULTS)) {
    if (!map.has(name)) map.set(name, perms)
  }
  _cache = { at: Date.now(), map }
  return map
}

// Every permission the given JWT payload / user row effectively holds.
// Returns ['*'] for privileged accounts.
export async function getEffectivePermissions(user) {
  if (!user) return []
  if (user.is_platform_admin || user.isPlatformAdmin) return ['*']
  if (user.is_superadmin || user.isSuperAdmin) return ['*']
  const map = await loadRoleMap()
  return map.get(user.role) || ROLE_DEFAULTS[user.role] || []
}

export function permitted(perms, key) {
  return Array.isArray(perms) && (perms.includes('*') || perms.includes(key))
}

// Express middleware. Run *after* authenticateToken — it reads req.user.
// The DB is consulted for the superadmin/platform flags because they are not
// carried in every JWT (older tokens predate the claim).
export function requirePermission(key) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' })
    try {
      const r = await pool.query(
        'SELECT role, is_superadmin, is_platform_admin FROM users WHERE id = $1;',
        [req.user.id]
      )
      const row = r.rows[0]
      if (!row) return res.status(403).json({ error: 'Account no longer exists.' })

      const perms = await getEffectivePermissions({ ...req.user, ...row })
      if (!permitted(perms, key)) {
        return res.status(403).json({ error: `Permission required: ${key}` })
      }
      req.userRole = row.role
      req.permissions = perms
      next()
    } catch (err) {
      console.error('[requirePermission]', err.message)
      res.status(500).json({ error: 'Permission check failed.' })
    }
  }
}
