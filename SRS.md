# Software Requirements Specification (SRS)
## CCRM - Centurion Customer Relationship Management System

**Version:** 1.5.0  
**Date:** June 2, 2026  
**Organization:** CUTM Admissions  
**Project Manager:** Principal, CUTM

---

## 1. INTRODUCTION

### 1.1 Purpose
This document specifies the functional and non-functional requirements for CCRM (Centurion Customer Relationship Management), a comprehensive lead and student management system for CUTM (Centurion University of Technology and Management) admissions process.

### 1.2 Scope
CCRM is a web-based application designed to:
- Manage 200,000+ leads efficiently with server-side pagination
- Track student journey from lead → application → enrollment → payment
- Enable counselors, managers, and admins to collaborate on student recruitment
- Automate daily reporting and backup processes
- Integrate with multiple marketing channels (Facebook, Instagram, Google Ads, LinkedIn, WhatsApp, SMS, RCS)
- Process online payments through Razorpay and PayU
- Track telephony interactions via Ameyo/Exotel

### 1.3 Definitions and Acronyms
| Term | Definition |
|------|-----------|
| Lead | A prospective student interested in CUTM |
| Counselor | Staff member responsible for lead follow-up |
| Manager | Supervisor overseeing a team of counselors |
| Admin | System administrator with full access |
| CRM | Customer Relationship Management |
| SRS | Software Requirements Specification |
| SDD | Software Design Document |
| UTR | Unique Transaction Reference (for payments) |
| KPI | Key Performance Indicator |
| IST | Indian Standard Time (UTC+5:30) |

---

## 1.4 System Modules Overview (Quick Reference)

This section provides a high-level summary of all major modules in CCRM for quick understanding:

| # | Module | Purpose | Key Features | Users |
|---|--------|---------|--------------|-------|
| 1 | **Lead Management** | Import & track prospective students | Import from 7 sources, assign to counselors, track stages, search/filter | Counselors, Managers, Admins |
| 2 | **Application Management** | Process student applications | Create apps from leads, upload docs, track stages, admin review | Counselors, Admins |
| 3 | **Payment Management** | Handle online & manual payments | Razorpay/PayU integration, UTR verification, revenue tracking | Admins, Finance |
| 4 | **User & Team Management** | Manage users and organizational structure | Role-based access (Admin/Manager/Counselor), team assignment, activity logs | Admins |
| 5 | **Dashboard & KPIs** | Real-time performance metrics | Total Leads, Applications, Revenue, Enrollments, campus-wise breakdown | All Users |
| 6 | **Productivity Report** | Counselor performance analysis | Counselor-wise stats, lead stages, applications, exportable reports | Managers, Admins |
| 7 | **Daily Email Reports** | Automated productivity emails | 3:00 AM IST, HTML formatted, KPI + counselor breakdown, configurable recipients | Admins, Managers |
| 8 | **S3 Backup & Recovery** | Automated daily backups | Database, files, logs, source code backed up to AWS S3 daily | Admins |
| 9 | **Integration Health** | Monitor external integrations | Status of Facebook, Google, SMS, Email, WhatsApp, Payments, Telephony | Admins |
| 10 | **Settings & Configuration** | System-wide configuration | SMTP, AWS S3, WhatsApp, SMS, Payment gateways, Google services | Admins |

---

## 2. OVERALL DESCRIPTION

### 2.1 Product Vision
A unified platform for educational institution admissions that:
- Consolidates leads from multiple marketing channels
- Enables efficient lead assignment and follow-up
- Tracks conversion through application, payment, and enrollment
- Provides real-time analytics and performance metrics
- Automates routine tasks (emails, backups, reports)
- Scales to handle 200,000+ concurrent leads

### 2.2 Product Features (High-Level)

#### 2.2.1 Lead Management
- Import leads from multiple sources (Facebook Ads, Google Ads, Instagram, LinkedIn, manual upload)
- Assign leads to counselors based on campus/course
- Track lead stage: Untouched → Contacted → Interested → Process for Payment → Payment Success → Converted
- Real-time lead status visibility
- Bulk operations (assign, transfer, delete with confirmation)
- Lead search, filter, and bulk upload

#### 2.2.2 Application Management
- Create applications from leads
- Track application stages (Draft, Submitted, Approved, Rejected, Enrolled)
- Document upload for each application
- Application verification by admins

#### 2.2.3 Payment Management
- Online payment integration (Razorpay, PayU)
- Manual payment entry with UTR number
- Admin verification of payments
- Revenue tracking (only admin-verified payments count)
- Payment status tracking

#### 2.2.4 User & Team Management
- Role-based access (Counselor, Manager, Admin)
- User management (create, edit, deactivate)
- Team structure with manager-to-counselor relationships
- Activity logging (who changed what, when)
- Bulk user import via Excel

#### 2.2.5 Analytics & Reporting
- Dashboard with KPIs (Total Leads, Applications, Revenue, Enrollments)
- Campus-wise statistics
- Counselor-wise productivity report
- Daily automated email reports
- Lead stage distribution
- Top performers ranking
- Target vs. achievement tracking

#### 2.2.6 Integration & Automation
- Multi-channel lead import (Facebook, Google Ads, Instagram, LinkedIn, WhatsApp, SMS)
- Automated email alerts to counselors
- Automated daily email reports at 3:00 AM IST
- Automated S3 backup at 3:00 AM IST
- Webhook support for lead ingestion
- RCS Business Messaging support

#### 2.2.7 Data Management
- Database backup to AWS S3 (daily)
- Log archival
- Data export (CSV, Excel)
- Bulk operations with audit trails

---

## 3. FUNCTIONAL REQUIREMENTS

### 3.1 Lead Management (FR-LM)

#### FR-LM-1: Lead Import
- **Requirement:** System shall support importing leads from multiple sources
- **Sources:** Facebook Ads, Google Ads, Instagram Ads, LinkedIn, WhatsApp Bot, manual upload
- **Acceptance Criteria:**
  - Leads can be imported via webhook (marketing channels)
  - Leads can be uploaded via Excel file
  - Duplicate detection prevents duplicate lead entries
  - Lead deduplication based on email/mobile combination
  - Bulk import progress tracking with error reporting

#### FR-LM-2: Lead Assignment
- **Requirement:** Counselors and leads shall be assigned to counselors/managers
- **Acceptance Criteria:**
  - Manual assignment by managers/admins
  - Bulk assignment via dropdown selector
  - Assignment creates activity log entry
  - Assigned counselor receives email notification
  - Lead history shows all assignment changes

#### FR-LM-3: Lead Stages
- **Requirement:** System shall track lead progression through defined stages
- **Stages:**
  1. **Untouched** — Lead received, not yet contacted
  2. **Contacted** — Counselor has reached out
  3. **Follow Up** — Initial contact made, awaiting response
  4. **Interested** — Lead shows interest in admission
  5. **Process for Payment** — Student proceeding towards payment
  6. **Payment Success** — Lead stage (unverified payment)
  7. **Converted** — Student enrolled
- **Acceptance Criteria:**
  - Only assigned counselor can change own leads' stages
  - Managers can change team leads' stages
  - Admins can change any lead's stage
  - Stage change creates audit log
  - Timestamps recorded for each stage

#### FR-LM-4: Lead Search & Filter
- **Requirement:** Counselors shall search/filter leads efficiently
- **Acceptance Criteria:**
  - Search by name, email, mobile, campus, course
  - Filter by stage, owner (counselor), campus, date range
  - Server-side pagination (50 leads per page max)
  - Sort by name, date assigned, stage, last updated
  - Quick filters ("My Leads", "Untouched", "Interested", etc.)

#### FR-LM-5: Lead Details
- **Requirement:** Detailed lead information shall be accessible
- **Acceptance Criteria:**
  - Display: Name, Email, Mobile, Campus, Course, Source, Owner, Stage, Timestamps
  - Edit inline: Name, Mobile (with confirmation)
  - View activity history (all actions on this lead)
  - View assignment history (who owned this lead when)
  - View application(s) linked to this lead
  - View payment(s) linked to this lead

### 3.2 Application Management (FR-AM)

#### FR-AM-1: Create Application
- **Requirement:** Counselors shall create applications from leads
- **Acceptance Criteria:**
  - Create application from lead detail page
  - Pre-populate with lead data (name, email, mobile, course)
  - Allow editing course selection
  - Generate unique Application Number (APP-XXXX-YYYY)
  - Mark lead as "Process for Payment" stage

#### FR-AM-2: Application Stages
- **Requirement:** Track application progression
- **Stages:**
  1. **Draft** — Not yet submitted
  2. **Submitted** — Awaiting admin review
  3. **Approved** — Admin approved, fee due
  4. **Rejected** — Admin rejected, can resubmit
  5. **Enrolled** — Payment confirmed, admission complete
- **Acceptance Criteria:**
  - Counselor submits application
  - Admin reviews and approves/rejects
  - Applicant status changes reflect in dashboard
  - Status history maintained with timestamps

#### FR-AM-3: Document Upload
- **Requirement:** Applicants shall upload required documents
- **Acceptance Criteria:**
  - Upload from application form
  - Support file types: PDF, JPG, PNG (max 10 MB each)
  - Store in `/uploads/documents/` folder
  - Organize by App Number
  - Admin can view/download all documents

#### FR-AM-4: Application Export
- **Requirement:** Admins shall export application data
- **Acceptance Criteria:**
  - Export as CSV/Excel with all details
  - Include document file paths
  - Filter by status, date range, campus
  - Bulk export with progress indicator

### 3.3 Payment Management (FR-PM)

#### FR-PM-1: Online Payment Gateway
- **Requirement:** System shall process online payments
- **Providers:** Razorpay, PayU
- **Acceptance Criteria:**
  - Student can initiate payment from application
  - Redirected to payment gateway
  - Webhook receives payment confirmation
  - Payment status updated automatically
  - Student receives email receipt

#### FR-PM-2: Payment Verification
- **Requirement:** Admin shall verify payments with UTR number
- **Acceptance Criteria:**
  - Payment requires manual verification by admin
  - Admin must enter/confirm UTR (Unique Transaction Reference)
  - Only verified payments count towards revenue
  - UTR number is unique and searchable
  - Verification creates audit log

#### FR-PM-3: Revenue Tracking
- **Requirement:** System shall calculate revenue accurately
- **Acceptance Criteria:**
  - Only payments with status "Approved"/"Paid" AND valid UTR count
  - Invalid UTR or unverified payments excluded from revenue
  - Revenue dashboard shows verified amount
  - Revenue breakdown by campus, course
  - Daily revenue dashboard widget

#### FR-PM-4: Payment History
- **Requirement:** View complete payment history
- **Acceptance Criteria:**
  - Show all payments linked to application
  - Display amount, date, status, UTR, payment method
  - Admin can filter by date, status, UTR
  - Export payment records

### 3.4 User & Team Management (FR-UM)

#### FR-UM-1: User Roles & Permissions
- **Requirement:** Role-based access control (RBAC)
- **Roles:**
  1. **Admin** — Full system access, user management, payment verification
  2. **Manager** — Oversee team, assign leads, view team reports
  3. **Counselor** — Own leads, create applications, update stages
- **Acceptance Criteria:**
  - Login with email/password
  - Session timeout after 30 minutes of inactivity
  - Token-based authentication (JWT)
  - Role verified on every API request

#### FR-UM-2: User Management
- **Requirement:** Admins shall manage system users
- **Acceptance Criteria:**
  - Create new user with role assignment
  - Edit user (name, email, role, status)
  - Deactivate/reactivate user (soft delete)
  - Bulk import users via Excel
  - User activity log (login history, actions)
  - Password reset via email link

#### FR-UM-3: Team Structure
- **Requirement:** Manager-counselor relationships
- **Acceptance Criteria:**
  - Assign counselors to managers
  - Manager sees only own team leads
  - Manager can reassign team leads
  - Counselor can see only own leads (unless assigned by manager)
  - Admin sees all leads regardless of team

#### FR-UM-4: Activity Logging
- **Requirement:** Audit trail for all changes
- **Acceptance Criteria:**
  - Log: User, Action, Lead ID, Timestamp, Old Value, New Value
  - Searchable by user, date range, action type
  - Admin-only access to activity logs
  - 90-day retention of logs

### 3.5 Analytics & Reporting (FR-AR)

#### FR-AR-1: Dashboard
- **Requirement:** Real-time KPI dashboard
- **Acceptance Criteria:**
  - Total Leads (count of all leads)
  - Total Applications (count of applications)
  - Revenue Collected (sum of verified payments with UTR)
  - Enrolments (count of enrolled students)
  - Campus-wise breakdown
  - Load in <2 seconds for admin, <3 seconds for counselor (role-scoped)

#### FR-AR-2: Productivity Report
- **Requirement:** Counselor-wise performance metrics
- **Acceptance Criteria:**
  - Show per-counselor stats:
    - Leads Assigned
    - Untouched
    - Interested
    - Process for Pay
    - App Assigned
    - Pay Approved (verified payments)
  - Sortable by any column
  - Exportable as CSV
  - Pagination (6 rows per page)
  - Shows total row at bottom

#### FR-AR-3: Daily Email Reports
- **Requirement:** Automated email reports at 3:00 AM IST
- **Acceptance Criteria:**
  - Email contains KPI summary + counselor-wise table
  - HTML formatted with styling
  - Recipients configurable in Settings
  - Only sent if recipients list not empty
  - Requires SMTP to be configured
  - Log success/failure in system logs

#### FR-AR-4: Lead Stage Distribution
- **Requirement:** Analytics on lead distribution across stages
- **Acceptance Criteria:**
  - Show count of leads in each stage
  - Pie chart visualization
  - Filter by campus, date range
  - Export as report

#### FR-AR-5: Target vs Achievement
- **Requirement:** Admission targets and achievement tracking
- **Acceptance Criteria:**
  - Admins set monthly targets (leads, applications, enrollments)
  - Dashboard shows target vs. achieved
  - Progress bar visualization
  - Campus-wise breakdown

### 3.6 Integration & Automation (FR-IA)

#### FR-IA-1: Multi-Channel Lead Import
- **Requirement:** Support multiple lead sources
- **Sources:**
  - Facebook Lead Ads (via Graph API)
  - Instagram Lead Ads (via Meta API)
  - Google Ads Lead Forms (via webhook)
  - LinkedIn Lead Gen Forms (via webhook)
  - WhatsApp Chatbot (via WABA)
  - Manual bulk upload (Excel)
- **Acceptance Criteria:**
  - Webhook endpoints for each source
  - Automatic duplicate detection
  - Lead data normalized and stored
  - Error handling with retry logic

#### FR-IA-2: Email Alerts
- **Requirement:** Automated email notifications to counselors
- **Triggers:**
  - Lead assigned to counselor
  - Lead needs follow-up (via scheduled task)
  - Payment received notification
  - Application status change
- **Acceptance Criteria:**
  - Email sent within 5 minutes of trigger
  - Email contains relevant details
  - Counselor can unsubscribe from specific alerts
  - Requires SMTP configuration

#### FR-IA-3: Daily Backup
- **Requirement:** Automated daily backup at 3:00 AM IST
- **Backup Components:**
  - Full PostgreSQL database dump (gzipped)
  - `/uploads/` directory (tarred and gzipped)
  - Server logs (last 24 hours, gzipped)
- **Storage:** AWS S3 in date-stamped folders (backups/YYYY-MM-DD/)
- **Acceptance Criteria:**
  - Backup completes within 30 minutes
  - All 3 components uploaded successfully
  - Failure logged with error details
  - S3 credentials securely stored in integration_settings

#### FR-IA-4: Scheduled Tasks
- **Requirement:** Automated recurring tasks
- **Tasks:**
  - Daily email report (3:00 AM IST)
  - Daily S3 backup (3:00 AM IST)
  - Follow-up reminders (configurable)
- **Acceptance Criteria:**
  - Cron jobs run reliably
  - Failures trigger admin alerts
  - Timezone: Asia/Kolkata (IST)
  - Logs all executions

### 3.7 Data Management (FR-DM)

#### FR-DM-1: Data Export
- **Requirement:** Users shall export data for external use
- **Formats:** CSV, Excel (.xlsx)
- **Acceptance Criteria:**
  - Export leads with all fields
  - Export applications with documents
  - Export payments with UTR
  - Filter before export
  - Large exports show progress (>1000 rows)

#### FR-DM-2: Bulk Operations
- **Requirement:** Perform actions on multiple records
- **Operations:** Assign, reassign, delete, stage change
- **Acceptance Criteria:**
  - Select multiple records (checkbox)
  - Confirm before deletion
  - Progress indicator for large operations
  - Audit log for each changed record
  - Rollback option (undo) within 5 minutes

#### FR-DM-3: Data Cleanup
- **Requirement:** Remove dummy/junk data
- **Acceptance Criteria:**
  - Admin can mark records as "junk"
  - Junk records hidden from normal views
  - Separate admin view for junk records
  - Permanent delete (soft delete to archive table) only after 30 days

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Performance (NFR-PE)

#### NFR-PE-1: Response Time
- Dashboard load: <2 seconds (admin), <3 seconds (counselor)
- Lead list pagination: <1 second per page
- Search/filter: <2 seconds
- API endpoints: <500ms p95 latency

#### NFR-PE-2: Scalability
- Support 200,000+ leads in database
- Concurrent users: 100+ simultaneous
- Server-side pagination to prevent browser freeze
- Only essential fields in list views (not lead_details JSONB)

#### NFR-PE-3: Throughput
- Support 1,000+ lead imports per day
- Support 100+ concurrent API calls
- Batch export of 50,000+ records

### 4.2 Reliability (NFR-RE)

#### NFR-RE-1: Availability
- 99.5% uptime SLA
- Planned maintenance windows announced 48h in advance
- Graceful degradation if services unavailable

#### NFR-RE-2: Data Integrity
- Transactional consistency (ACID)
- No data loss on crashes
- Automated backups every 24 hours
- Backup tested monthly

#### NFR-RE-3: Error Handling
- Graceful error messages to users
- Errors logged with stack traces
- Admin notification on critical errors
- Automatic retry for transient failures

### 4.3 Security (NFR-SE)

#### NFR-SE-1: Authentication
- Email/password login
- Session timeout: 30 minutes of inactivity
- JWT token-based for API
- Password minimum 8 characters

#### NFR-SE-2: Authorization
- Role-based access control (RBAC)
- Row-level security (counselor sees only own leads)
- API calls verify role on every request
- Admin-only endpoints require explicit admin role

#### NFR-SE-3: Data Protection
- HTTPS/TLS for all traffic
- Passwords hashed with bcrypt
- Sensitive fields masked (API keys, secrets)
- PII (email, mobile) encrypted at rest (optional: phase 2)

#### NFR-SE-4: Credential Management
- Integration credentials stored in `integration_settings` table
- Credentials encrypted before storage
- Never logged or exposed in error messages
- Admin can rotate credentials anytime

### 4.4 Usability (NFR-US)

#### NFR-US-1: User Interface
- Responsive design (mobile, tablet, desktop)
- Intuitive navigation
- Consistent color scheme and typography
- Dark mode support (future)

#### NFR-US-2: Accessibility
- WCAG 2.1 Level AA compliance
- Keyboard navigation support
- Screen reader compatible
- Sufficient color contrast

#### NFR-US-3: Help & Support
- In-app help documentation
- Tooltip explanations for complex fields
- Error messages in plain language
- Admin knowledge base

### 4.5 Maintainability (NFR-MA)

#### NFR-MA-1: Code Quality
- Clean, readable, well-commented code
- No magic numbers (use named constants)
- Modular architecture
- DRY (Don't Repeat Yourself) principle

#### NFR-MA-2: Documentation
- API documentation (endpoints, parameters, responses)
- Database schema documentation
- Deployment guide
- Troubleshooting guide

#### NFR-MA-3: Logging
- Structured logs (JSON format)
- Log levels: DEBUG, INFO, WARN, ERROR
- Centralized log storage
- 90-day log retention

### 4.6 Compatibility (NFR-CO)

#### NFR-CO-1: Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

#### NFR-CO-2: Device Support
- Desktop (1920x1080+)
- Tablet (iPad, 768x1024+)
- Mobile (iPhone 12+, Android 11+)

#### NFR-CO-3: Database
- PostgreSQL 12+
- Backup compatible with AWS RDS

---

## 5. SYSTEM CONSTRAINTS

### 5.1 Technical Constraints
- **Backend:** Node.js/Express
- **Frontend:** React 18+ with Vite
- **Database:** PostgreSQL 12+
- **Hosting:** Linux server (Ubuntu 20.04+)
- **File Storage:** Local filesystem + AWS S3

### 5.2 Business Constraints
- **Go-Live:** By December 2026
- **Budget:** Within allocation
- **Team Size:** 1 developer + 1 QA

### 5.3 Regulatory Constraints
- GDPR compliance for EU data
- India data residency for Indian leads
- Password complexity per government standards
- Audit trail for sensitive operations

---

## 6. ACCEPTANCE CRITERIA & TESTING

### 6.1 Functional Testing
- All FR requirements tested with positive and negative test cases
- Test coverage: >80%
- Regression testing after each change

### 6.2 Performance Testing
- Load test with 100 concurrent users
- Verify response times meet NFR-PE
- Database query optimization

### 6.3 Security Testing
- SQL injection tests
- XSS (Cross-Site Scripting) tests
- CSRF (Cross-Site Request Forgery) tests
- Penetration testing

### 6.4 User Acceptance Testing (UAT)
- Real users test end-to-end workflows
- Feedback collected and prioritized
- Defects logged and tracked

---

## 7. GLOSSARY

| Term | Definition |
|------|-----------|
| Lead | Prospective student contact |
| Conversion | Lead becomes enrolled student |
| UTR | Payment transaction reference number |
| KPI | Measurable performance indicator |
| Role | Job function (Admin, Manager, Counselor) |
| Stage | Position in lead lifecycle |
| Campus | Physical location (Bhubaneswar, etc.) |
| Course | Educational program (BTech, MBA, etc.) |
| Webhook | HTTP callback for real-time events |

---

## 8. DOCUMENT CHANGE HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | Team | Initial draft |
| 1.1 | Feb 2026 | Team | Added payment verification requirements |
| 1.2 | Mar 2026 | Team | Added automated reporting requirements |
| 1.3 | Apr 2026 | Team | Refined lead stage definitions |
| 1.4 | May 2026 | Team | Added S3 backup requirements |
| 1.5 | Jun 2026 | Team | Final version with all requirements |

---

**End of SRS Document**
