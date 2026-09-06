import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useCcrm } from './context/CcrmContext'
import { usePermissions } from './hooks/usePermissions'
import { getUrlTenantSlug } from './tenantSlug'
import Login from './pages/Login'
import Layout from './components/Layout'
import LeadManager from './pages/LeadManager'
import ApplicationManager from './pages/ApplicationManager'
import ApplicationDetails from './pages/ApplicationDetails'
import Dashboard from './pages/Dashboard'
import ProductivityReport from './pages/ProductivityReport'
import Campaigns from './pages/Campaigns'
import Tasks from './pages/Tasks'
import Payments from './pages/Payments'
import Documents from './pages/Documents'
import CalendarPro from './pages/CalendarPro'
import UserManagement from './pages/UserManagement'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Integrations from './pages/Integrations'
import Leaderboard from './pages/Leaderboard'
import EmailCampaigns from './pages/EmailCampaigns'
import DripWorkflows from './pages/DripWorkflows'
import CommunicationsReport from './pages/CommunicationsReport'
import Help from './pages/Help'
import TransferApprovals from './pages/TransferApprovals'
import PublicInquiry from './pages/PublicInquiry'
import StudentPortal from './pages/StudentPortal'
import VerifyEmail from './pages/VerifyEmail'
import DocumentUpload from './pages/DocumentUpload'
import Analytics from './pages/Analytics'
import SocialComments from './pages/SocialComments'
import PlatformTenants from './pages/PlatformTenants'
import LeadIdSettings from './pages/LeadIdSettings'
import OrgSettings from './pages/OrgSettings'
import ServerHealth from './pages/ServerHealth'
import SecurityAccess from './pages/SecurityAccess'
import UserProfile from './pages/UserProfile'
import IntegrationSettings from './pages/IntegrationSettings'
import FTLLeads from './pages/FTLLeads'
import GTIBLeads from './pages/GTIBLeads'
import GTTECHLeads from './pages/GTTECHLeads'
import ESSELeads from './pages/ESSELeads'
import WebsitesDashboard from './pages/WebsitesDashboard'
import UploadLogs from './pages/UploadLogs'
import CallOutcomes from './pages/CallOutcomes'
import CallActivityReport from './pages/CallActivityReport'
import WorkbookImport from './pages/WorkbookImport'
import ProgramsManager from './pages/ProgramsManager'
import DocumentVerification from './pages/DocumentVerification'
import FinanceVerification from './pages/FinanceVerification'
import AdmissionDetailsForm from './pages/AdmissionDetailsForm'
import StudentLogin from './pages/StudentLogin'
import StudentDashboard from './pages/StudentDashboard'
import CommandCentre from './pages/CommandCentre'
import Compliance from './pages/Compliance'
import IntegrationHub from './pages/IntegrationHub'
import IntegrationHealth from './pages/IntegrationHealth'

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
  // basename=undefined — identical to today's behavior.
  const tenantSlug = getUrlTenantSlug()
  const basename = tenantSlug ? `/${tenantSlug}` : undefined

  return (
    <BrowserRouter basename={basename}>
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
              <Route path="document-verification" element={<DocumentVerification />} />
              <Route path="finance-verification"  element={<FinanceVerification />} />
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
    </BrowserRouter>
  )
}
