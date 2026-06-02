# CCRM - Complete Project Documentation Index

**Project:** Centurion Customer Relationship Management System  
**Version:** 1.5.0  
**Date:** June 2, 2026  
**Organization:** CUTM Admissions

---

## 📚 Documentation Overview

This document index provides a complete guide to all documentation available for the CCRM project.

### Quick Links by Role

**For Project Managers:**
- Start with: [PROJECT_SUMMARY.md](#project-summary) → [SRS.pdf](#srs-software-requirements-specification)
- Then: [README_DEPLOYMENT.md](#readmedeploymentmd)

**For Developers:**
- Start with: [SDD.pdf](#sdd-software-design-document) → [README.md in repo](#readmemd)
- Then: [AUTOMATED_REPORTING_SETUP.md](#automated-reportingmd)

**For DevOps/Infrastructure:**
- Start with: [DEPLOYMENT_STEPS.txt](#deployment-stepstxt) → [DEPLOY.sh](#deploysh)
- Then: [README_DEPLOYMENT.md](#readmedeploymentmd)

**For QA/Testing:**
- Start with: [SRS.pdf](#srs-software-requirements-specification) (Acceptance Criteria section)
- Then: [README_DEPLOYMENT.md](#readmedeploymentmd) (Testing section)

---

## 📋 Core Documentation

### SRS.pdf - Software Requirements Specification
**File:** `SRS.pdf` (157 KB) | **Markdown:** `SRS.md`

**Purpose:** Complete functional and non-functional requirements for CCRM

**Contents:**
- Introduction (scope, definitions)
- Overall product vision and features
- Detailed functional requirements (7 sections):
  - Lead Management (FR-LM)
  - Application Management (FR-AM)
  - Payment Management (FR-PM)
  - User & Team Management (FR-UM)
  - Analytics & Reporting (FR-AR)
  - Integration & Automation (FR-IA)
  - Data Management (FR-DM)
- Non-functional requirements (6 sections):
  - Performance (NFR-PE)
  - Reliability (NFR-RE)
  - Security (NFR-SE)
  - Usability (NFR-US)
  - Maintainability (NFR-MA)
  - Compatibility (NFR-CO)
- System constraints
- Acceptance criteria & testing strategy
- Glossary and change history

**Readers:** Project managers, product owners, business analysts, QA

**How to Use:**
- Use FR sections to verify feature completeness
- Use NFR sections for testing criteria
- Reference glossary for terminology clarification

---

### SDD.pdf - Software Design Document
**File:** `SDD.pdf` (98 KB) | **Markdown:** `SDD.md`

**Purpose:** Technical architecture, design patterns, and implementation details

**Contents:**
1. Design Overview (architectural style, principles)
2. System Architecture (high-level diagram, tech stack)
3. Database Design (ER diagram, tables, indexes, constraints)
4. API Design (endpoints, request/response format, pagination, error handling)
5. Frontend Architecture (project structure, components, state management)
6. Backend Architecture (server structure, middleware, key functions)
7. Security Design (authentication, authorization, data protection)
8. Performance Optimization (database, API, frontend)
9. Testing Strategy (unit, integration, performance, security)
10. Deployment Architecture (environment, process, monitoring)
11. Scalability Considerations (current and future)
12. Disaster Recovery (backup strategy, recovery procedures)
13. Change history

**Readers:** Developers, architects, DevOps engineers

**How to Use:**
- Reference database schema when adding new features
- Follow API design patterns when creating endpoints
- Use security design section for security reviews
- Reference performance optimization for tuning

---

## 🚀 Deployment & Operations

### README_DEPLOYMENT.md
**File:** `README_DEPLOYMENT.md` (308 KB)

**Purpose:** Complete deployment and post-deployment configuration guide

**Sections:**
- Quick Start (3 deployment options)
- Configuration Details (SMTP, AWS S3, email recipients)
- Monitoring & Logs (what to watch for)
- Troubleshooting (common issues and solutions)
- API Endpoints (test endpoint, integration settings)
- Schedule Changes (how to modify backup time)
- Retention & Cleanup (S3 lifecycle policies)
- Deployment Checklist (pre-deployment tasks)

**Readers:** DevOps, system administrators, tech leads

**Key Info:**
- Deploy using: `bash DEPLOY.sh`
- Configure settings in UI: Settings → Integrations
- Test with: `POST /api/admin/test-daily-report`

---

### DEPLOY.sh
**File:** `DEPLOY.sh` (68 lines)

**Purpose:** Automated deployment script (production server)

**What it does:**
1. Pulls latest code from GitHub
2. Installs npm dependencies
3. Builds React frontend
4. Stops backend service
5. Copies files to /var/www/ccrm/
6. Restarts backend service
7. Shows service status

**Usage:**
```bash
cd /path/to/npf_crm
bash DEPLOY.sh
```

**Readers:** DevOps, release managers

---

### DEPLOYMENT_STEPS.txt
**File:** `DEPLOYMENT_STEPS.txt` (146 KB)

**Purpose:** Step-by-step deployment instructions (both automated and manual)

**Sections:**
- Automated deployment (using DEPLOY.sh)
- Manual deployment steps
- Post-deployment configuration in UI
- Verification checklist
- Troubleshooting guide
- Rollback procedures
- Scheduled times (3:00 AM IST)

**Readers:** System administrators, operations team

**Key Info:**
- Option 1 (easiest): Use DEPLOY.sh
- Option 2: Manual git pull + npm install + npm run build
- Option 3: Upload files manually

---

### AUTOMATED_REPORTING_SETUP.md
**File:** `AUTOMATED_REPORTING_SETUP.md` (156 KB)

**Purpose:** Technical documentation for automated daily reports and S3 backups

**Sections:**
- What was implemented (daily email, daily backup)
- Configuration UI (where to set credentials)
- How to use (step-by-step setup)
- Backend files modified
- Frontend files modified
- Logs to monitor
- Deployment checklist
- Notes on timezone, credentials, frequency

**Readers:** Technical team, DevOps, developers

**Key Features:**
- Daily 3am Productivity Email Report (counselor-wise stats)
- Daily 3am S3 Backup (database, uploads, logs)
- Settings UI for configuration
- Test endpoint for immediate testing

---

## 🎯 Project Overview

### README.md
**File:** `README.md` (in repository root)

**Purpose:** Quick overview of the project, how to run locally

**Contents:**
- What is CCRM
- Quick start (local development)
- Project structure
- Key features
- Tech stack
- Troubleshooting

**Readers:** Developers, contributors

---

## 📊 Design Documents

### Architecture Diagrams (in SDD.pdf)
- High-level system architecture
- Database ER diagram
- Request flow diagram

**Visual Learners:** Use these to understand the system structure

---

## 🧪 Testing

### Test Strategy (in SDD.pdf, Section 9)
- Unit Testing
- Integration Testing
- Performance Testing
- Security Testing

**Test Coverage:**
- Functional tests for each FR requirement
- Performance tests (load test with 100 concurrent users)
- Security tests (SQL injection, XSS, CSRF)
- UAT with real users

---

## 🔒 Security

### Security Design (in SDD.pdf, Section 7)
- Authentication & Authorization (JWT, RBAC)
- Password Security (bcrypt hashing)
- Data Protection (encryption, masking)
- Input Validation (parameterized queries)

**Security Checklist (from SRS.pdf, Section 4.3):**
- ✓ HTTPS/TLS for all traffic
- ✓ Passwords hashed with bcrypt
- ✓ JWT token-based authentication
- ✓ Role-based access control
- ✓ Parameterized SQL queries (SQL injection prevention)
- ✓ Input validation
- ✓ Sensitive fields masked in API responses

---

## 📈 Performance & Scalability

### Performance Optimization (in SDD.pdf, Section 8)
- Database optimization (indexes, query tuning)
- API optimization (caching, payload reduction)
- Frontend optimization (code splitting, rendering)

**Key Optimizations:**
- Removed lead_details JSONB from list views (72MB → 2MB)
- Server-side pagination (prevent loading all 200k+ leads)
- Database indexes on frequently searched columns
- Connection pooling to database

### Scalability (in SDD.pdf, Section 11)
- Current architecture: Single server + PostgreSQL
- Support: 200,000+ leads, 100+ concurrent users
- Future scalability: Load balancer, read replicas, caching layer

---

## 🗂️ Database

### Schema (in SDD.pdf, Section 3)
- leads, applications, payments, users, documents, integration_settings, activity_logs, targets
- 12+ indexes for performance
- Foreign key relationships
- Unique constraints (email, app_no, utr_number)

**Key Relations:**
- leads → applications → payments
- users (managers) → users (counselors) → leads
- applications → documents (file uploads)

---

## 🔌 Integrations

### Supported Integrations (from SRS.pdf, Section 3.6)
1. **Lead Sources:** Facebook Ads, Instagram Ads, Google Ads, LinkedIn, WhatsApp, Manual upload
2. **Email:** Gmail/SMTP, Nodemailer
3. **Messaging:** WhatsApp, SMS, RCS
4. **Payments:** Razorpay, PayU
5. **Telephony:** Ameyo, Exotel
6. **Cloud:** AWS S3 (backups)
7. **Analytics:** Google Analytics 4

### Integration Configuration (in README_DEPLOYMENT.md)
- Go to Settings → Integrations
- Fill in credentials for each integration
- Settings are encrypted and stored in `integration_settings` table

---

## 📞 Support & Troubleshooting

### Deployment Issues
**See:** DEPLOYMENT_STEPS.txt (Troubleshooting section)

**Common Issues:**
- "Email not sending" → Check SMTP configured
- "S3 backup failing" → Check AWS credentials
- "Cron job not running" → Check timezone, service running

### Performance Issues
**See:** SDD.pdf (Section 8: Performance Optimization)

**Monitor:**
```bash
sudo journalctl -u ccrm-backend -f
```

### Data Recovery
**See:** SDD.pdf (Section 12: Disaster Recovery)

**Restore from S3 backup:**
```bash
aws s3 cp s3://bucket/backups/2026-06-02/db.sql.gz .
gunzip db.sql.gz
psql -U ccrm_user ccrm_db < db.sql
```

---

## 📖 How to Read This Documentation

### Path 1: Complete Overview (30 minutes)
1. This file (5 min)
2. SRS.pdf Introduction + Features (10 min)
3. SDD.pdf System Architecture (15 min)

### Path 2: Deployment Only (15 minutes)
1. README_DEPLOYMENT.md Quick Start (5 min)
2. DEPLOY.sh (run it) (5 min)
3. Configure in UI (5 min)

### Path 3: Developer Onboarding (2 hours)
1. README.md (10 min)
2. SDD.pdf entire document (60 min)
3. Run locally and explore code (50 min)

### Path 4: Implementation Details (1 hour)
1. SDD.pdf Database Design + API Design (30 min)
2. Review code in `server/index.js` and `ccrm/src/pages/` (30 min)

---

## 📝 Document Versions

All documents follow semantic versioning:
- **Major.Minor.Patch** (e.g., 1.5.0)
- Current version: **1.5.0** (June 2, 2026)

**Change History Available in:**
- SRS.pdf, Section 8 (Document Change History)
- SDD.pdf, Section 13 (Document Change History)

---

## 🎓 Terminology

### Common Terms

| Term | Definition |
|------|-----------|
| **CRM** | Customer Relationship Management |
| **Lead** | Prospective student |
| **Conversion** | Lead becomes enrolled student |
| **Counselor** | Staff member handling lead follow-up |
| **Manager** | Supervisor overseeing counselors |
| **UTR** | Unique Transaction Reference (payment) |
| **KPI** | Key Performance Indicator (metric) |
| **Role** | Job function (Admin, Manager, Counselor) |
| **Stage** | Position in lead lifecycle |
| **RBAC** | Role-Based Access Control |
| **JWT** | JSON Web Token (authentication) |
| **RTO** | Recovery Time Objective (disaster recovery) |
| **RPO** | Recovery Point Objective (disaster recovery) |

**Full Glossary:** See SRS.pdf, Section 7

---

## 📞 Getting Help

### For Specific Questions

| Question | Answer In |
|----------|-----------|
| "What features does CCRM have?" | SRS.pdf, Section 2 |
| "How do I deploy to production?" | README_DEPLOYMENT.md |
| "Where is the database schema?" | SDD.pdf, Section 3 |
| "What are the API endpoints?" | SDD.pdf, Section 4 |
| "How does authentication work?" | SDD.pdf, Section 7 |
| "How do backups work?" | SDD.pdf, Section 12 |
| "Why is the app slow?" | SDD.pdf, Section 8 |
| "How do I troubleshoot?" | DEPLOYMENT_STEPS.txt or README_DEPLOYMENT.md |

---

## 🎉 Summary

**CCRM is a complete, production-ready CRM system with:**
- ✅ 200,000+ lead capacity
- ✅ Multi-channel lead import (7+ sources)
- ✅ Complete application & payment workflow
- ✅ Real-time analytics & reporting
- ✅ Automated daily email reports
- ✅ Automated S3 backups
- ✅ Role-based access control
- ✅ Comprehensive documentation

**Next Steps:**
1. Read SRS.pdf for requirements
2. Read SDD.pdf for architecture
3. Deploy using DEPLOY.sh
4. Configure in Settings UI
5. Monitor via logs and dashboards

---

**For questions or clarifications, refer to the specific section mentioned above or check the logs for debugging information.**

**Last Updated:** June 2, 2026  
**Version:** 1.5.0
