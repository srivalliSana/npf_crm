// Every top-level path segment already used as a real route in App.jsx.
// If the URL's first segment isn't one of these, treat it as a tenant slug
// (used to derive React Router's `basename` so every page for a non-default
// tenant stays under /<slug>/... without touching any individual route).
// NOTE: whenever a new top-level route is added to App.jsx, add it here too.
export const RESERVED_SLUGS = [
  'login', 'apply', 'student-portal', 'student', 'leads', 'call-outcomes',
  'websites-dashboard', 'ftl-leads', 'gtib-leads', 'gttech-leads', 'esse-leads',
  'applications', 'dashboard', 'platform-tenants', 'reports', 'productivity',
  'analytics', 'logs', 'call-activity', 'workbook-import', 'social-comments',
  'server-health', 'security', 'org-settings', 'campaigns', 'tasks',
  'payments', 'documents', 'calendar', 'settings', 'integrations',
  'integration-settings', 'leaderboard', 'email-campaigns', 'drip-workflows',
  'comms-report', 'help', 'profile', 'transfer-approvals', 'users', 'api',
  'verify-email', 'document-upload', 'admission-details', 'student-login',
  'student-dashboard', 'command-centre', 'compliance', 'integration-hub',
  'integration-health', 'programs',
]

export function getUrlTenantSlug() {
  const seg = window.location.pathname.split('/')[1] || ''
  return seg && !RESERVED_SLUGS.includes(seg) ? seg : null
}
