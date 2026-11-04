import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useCcrm } from './context/CcrmContext'
import { usePermissions } from './hooks/usePermissions'
import { getUrlTenantSlug, isHostBasedTenant } from './tenantSlug'
import Login from './pages/Login'
import Layout from './components/Layout'
const LeadManager = lazy(() => import('./pages/LeadManager'))
const ApplicationManager = lazy(() => import('./pages/ApplicationManager'))
const ApplicationDetails = lazy(() => import('./pages/ApplicationDetails'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProductivityReport = lazy(() => import('./pages/ProductivityReport'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Payments = lazy(() => import('./pages/Payments'))
const Documents = lazy(() => import('./pages/Documents'))
const CalendarPro = lazy(() => import('./pages/CalendarPro'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const Integrations = lazy(() => import('./pages/Integrations'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const EmailCampaigns = lazy(() => import('./pages/EmailCampaigns'))
const DripWorkflows = lazy(() => import('./pages/DripWorkflows'))
const CommunicationsReport = lazy(() => import('./pages/CommunicationsReport'))
const Help = lazy(() => import('./pages/Help'))
const TransferApprovals = lazy(() => import('./pages/TransferApprovals'))
const PublicInquiry = lazy(() => import('./pages/PublicInquiry'))
const StudentPortal = lazy(() => import('./pages/StudentPortal'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const DocumentUpload = lazy(() => import('./pages/DocumentUpload'))
const Analytics = lazy(() => import('./pages/Analytics'))
const SocialComments = lazy(() => import('./pages/SocialComments'))
const PlatformTenants = lazy(() => import('./pages/PlatformTenants'))
const LeadIdSettings = lazy(() => import('./pages/LeadIdSettings'))
const OrgSettings = lazy(() => import('./pages/OrgSettings'))
const ServerHealth = lazy(() => import('./pages/ServerHealth'))
const SecurityAccess = lazy(() => import('./pages/SecurityAccess'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const IntegrationSettings = lazy(() => import('./pages/IntegrationSettings'))
const FTLLeads = lazy(() => import('./pages/FTLLeads'))
const GTIBLeads = lazy(() => import('./pages/GTIBLeads'))
const GTTECHLeads = lazy(() => import('./pages/GTTECHLeads'))
const ESSELeads = lazy(() => import('./pages/ESSELeads'))
const WebsitesDashboard = lazy(() => import('./pages/WebsitesDashboard'))
const UploadLogs = lazy(() => import('./pages/UploadLogs'))
const CallOutcomes = lazy(() => import('./pages/CallOutcomes'))
const CallActivityReport = lazy(() => import('./pages/CallActivityReport'))
const WorkbookImport = lazy(() => import('./pages/WorkbookImport'))
const ProgramsManager = lazy(() => import('./pages/ProgramsManager'))
const DocumentVerification = lazy(() => import('./pages/DocumentVerification'))
const Grievances = lazy(() => import('./pages/Grievances'))
const FinanceVerification = lazy(() => import('./pages/FinanceVerification'))
const AdmissionDetailsForm = lazy(() => import('./pages/AdmissionDetailsForm'))
const StudentLogin = lazy(() => import('./pages/StudentLogin'))
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))
const CommandCentre = lazy(() => import('./pages/CommandCentre'))
const Compliance = lazy(() => import('./pages/Compliance'))
const IntegrationHub = lazy(() => import('./pages/IntegrationHub'))
const IntegrationHealth = lazy(() => import('./pages/IntegrationHealth'))
const Automation = lazy(() => import('./pages/Automation'))
const AoReview = lazy(() => import('./pages/AoReview'))

// ── Auth layout guard — checks auth, wraps with Layout ───────────────────────
function AuthGuard() {
  const { currentUser, handleLogout } = useCcrm()
  if (!currentUser) return <Navigate to="/login" replace />
  return <Layout onLogout={handleLogout} user={currentUser} />
}

// ── Role guard — used inside AuthGuard for admin-only routes ─────────────────
function RoleGuard({ roles }) {
  const { currentUser } = useCcrm()
  if (!currentUser) return <Navigate to="/login" replace />
  // Super / platform admins have full access regardless of their base role
  const privileged = currentUser.isSuperAdmin || currentUser.isPlatformAdmin
  if (roles && !privileged && !roles.includes(currentUser.role)) return <Navigate to="/leads" replace />
  return <Outlet />
}

// ── Permission guard — gates on what the server will actually allow ─────────
// RoleGuard checks the role *name*, which can't reflect a permission an admin
// granted through Security → Roles. These routes gate on the same permission
// the API enforces, so granting it genuinely opens the page instead of
// admitting the user to a screen that then 403s on every request.
//
// `roles` is the fallback for when the permission lookup itself failed (an
// older server, or a transient error) — degrading to the previous role check
// rather than locking anyone out.
function PermissionGuard({ permission, roles }) {
  const { currentUser } = useCcrm()
  const { can, loading, failed } = usePermissions()
  if (!currentUser) return <Navigate to="/login" replace />
  const privileged = currentUser.isSuperAdmin || currentUser.isPlatformAdmin
  if (privileged) return <Outlet />
  if (loading) return null                       // brief; avoids a redirect flash
  const allowed = failed
    ? (!roles || roles.includes(currentUser.role))
    : can(permission)
  return allowed ? <Outlet /> : <Navigate to="/leads" replace />
}

export default function App() {
  const { currentUser } = useCcrm()
  // Non-reserved first URL segment (e.g. /cuedu/...) becomes the router's
  // basename, so every route below stays prefixed for that tenant without
  // any per-route changes. Centurion's plain URLs (no matching segment) get
  // basename=undefined — identical to today's behavior. A tenant on its own
  // dedicated domain (see tenantSlug.js) also gets basename=undefined,
  // since its routes live at the root with no path prefix at all.
  const tenantSlug = getUrlTenantSlug()
  const basename = (tenantSlug && !isHostBasedTenant()) ? `/${tenantSlug}` : undefined

  return (
    <BrowserRouter basename={basename}>
      <Suspense fallback={<div style={{ minHeight: '100vh' }} aria-busy="true" />}>
      <Routes>
        {/* All routes nested under the root path */}
        <Route path="/">

          {/* ── index route: ONLY matches exact "/" → Public landing page ──
              Using <Route index> is the React Router v6 way to match the root
              exclusively without interfering with any other nested routes.    */}
          <Route index element={<PublicInquiry />} />

          {/* ── Other public pages (no auth) ── */}
          <Route path="apply"          element={<PublicInquiry />} />
          <Route path="student-portal" element={<StudentPortal />} />
          <Route path="student"        element={<StudentPortal />} />
          <Route path="verify-email"       element={<VerifyEmail />} />
          <Route path="verify-email/:appNo" element={<VerifyEmail />} />
          <Route path="document-upload/:token" element={<DocumentUpload />} />
          <Route path="admission-details/:token" element={<AdmissionDetailsForm />} />
          <Route path="student-login" element={<StudentLogin />} />
          <Route path="student-dashboard" element={<StudentDashboard />} />

          {/* ── Login — redirect inside if already authenticated ──
              basename (set above from the URL) already handles the tenant
              prefix, so this plain route matches both /login and
              /<slug>/login — no separate route needed for the slug case. ── */}
          <Route
            path="login"
            element={currentUser ? <Navigate to="/leads" replace /> : <Login />}
          />

          {/* ── Protected app routes — AuthGuard checks auth, renders Layout ── */}
          <Route element={<AuthGuard />}>
            <Route path="leads"            element={<LeadManager />} />
            <Route path="call-outcomes"    element={<CallOutcomes />} />
            <Route path="leads/:id"        element={<ApplicationDetails />} />
            {/* Website overview — Admin only */}
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="websites-dashboard" element={<WebsitesDashboard />} />
            </Route>
            {/* GT Entity lead pages — any authed user; data is owner-scoped server-side
                so an assigned faculty sees only their own GT leads */}
            <Route path="ftl-leads"        element={<FTLLeads />} />
            <Route path="gtib-leads"       element={<GTIBLeads />} />
            <Route path="gttech-leads"     element={<GTTECHLeads />} />
            <Route path="esse-leads"       element={<ESSELeads />} />
            <Route path="applications"     element={<ApplicationManager />} />
            <Route path="applications/:id" element={<ApplicationDetails />} />
            <Route path="dashboard"        element={<Dashboard />} />
            <Route path="platform-tenants" element={<PlatformTenants />} />
            <Route path="lead-id-settings" element={<LeadIdSettings />} />
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="programs"              element={<ProgramsManager />} />
              <Route path="finance-verification"  element={<FinanceVerification />} />
            </Route>
            <Route element={<RoleGuard roles={['Admin', 'Counselor']} />}>
              <Route path="document-verification" element={<DocumentVerification />} />
            </Route>
            <Route element={<RoleGuard roles={['Admin', 'Counselor', 'Manager']} />}>
              <Route path="grievances" element={<Grievances />} />
            </Route>
            <Route path="reports"          element={<Reports />} />
            <Route path="productivity"     element={<ProductivityReport />} />
            {/* Gated on the permission the API enforces, not the role name */}
            <Route element={<PermissionGuard permission="commandcentre.view" roles={['Admin','Manager']} />}>
              <Route path="command-centre" element={<CommandCentre />} />
            </Route>
            <Route element={<PermissionGuard permission="analytics.view" roles={['Admin','Manager']} />}>
              <Route path="analytics"      element={<Analytics />} />
            </Route>
            <Route element={<PermissionGuard permission="compliance.view" roles={['Admin']} />}>
              <Route path="compliance"     element={<Compliance />} />
            </Route>
            <Route element={<RoleGuard roles={['Admin','Manager']} />}>
              <Route path="logs"           element={<UploadLogs />} />
              <Route path="call-activity"  element={<CallActivityReport />} />
              <Route path="workbook-import" element={<WorkbookImport />} />
              <Route path="social-comments" element={<SocialComments />} />
            </Route>
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="server-health"      element={<ServerHealth />} />
              <Route path="org-settings"       element={<OrgSettings />} />
            </Route>
            <Route element={<PermissionGuard permission="security.view" roles={['Admin']} />}>
              <Route path="security"           element={<SecurityAccess />} />
            </Route>
            <Route path="campaigns"        element={<Campaigns />} />
            <Route path="tasks"            element={<Tasks />} />
            <Route path="payments"         element={<Payments />} />
            <Route path="documents"        element={<Documents />} />
            <Route path="calendar"         element={<CalendarPro />} />
            <Route path="settings"         element={<Settings />} />
            {/* Integrations — Admin only */}
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="integrations"     element={<Integrations />} />
              <Route path="integration-settings" element={<IntegrationSettings />} />
              <Route path="integration-health" element={<IntegrationHealth />} />
            </Route>
            <Route element={<PermissionGuard permission="integrations.view" roles={['Admin']} />}>
              <Route path="integration-hub"  element={<IntegrationHub />} />
            </Route>
            <Route element={<PermissionGuard permission="automation.view" roles={['Admin', 'Manager']} />}>
              <Route path="automation"       element={<Automation />} />
            </Route>
            <Route element={<PermissionGuard permission="documents.ao_review" roles={['Admin', 'Admission Officer']} />}>
              <Route path="ao-review"        element={<AoReview />} />
            </Route>
            <Route path="leaderboard"      element={<Leaderboard />} />
            <Route path="email-campaigns"  element={<EmailCampaigns />} />
            <Route path="drip-workflows"     element={<DripWorkflows />} />
            <Route path="comms-report"       element={<CommunicationsReport />} />
            <Route path="help"               element={<Help />} />
            <Route path="profile"            element={<UserProfile />} />
            <Route element={<RoleGuard roles={['Admin','Manager']} />}>
              <Route path="transfer-approvals" element={<TransferApprovals />} />
            </Route>

            {/* Admin-only */}
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="users" element={<UserManagement currentUser={currentUser} />} />
            </Route>
          </Route>

          {/* ── Catch-all → back to landing page ── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
