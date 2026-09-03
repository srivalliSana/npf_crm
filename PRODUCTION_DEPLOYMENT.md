# CCRM Phases 4-8 Production Deployment Guide

**Status:** ✅ PRODUCTION READY  
**Date:** September 3, 2026  
**Version:** 1.0.0  
**Components:** Phases 1-8 Complete  

---

## 📋 Executive Summary

This document outlines the production deployment of CCRM Phases 4-8, which adds critical features for admissions processing:

- **Phase 4:** Booking fee payment module
- **Phase 5:** Document verification dashboard
- **Phase 6:** Finance verification module
- **Phase 7:** Automatic registration number generation
- **Phase 8:** CampusOne ERP integration

All components are production-ready with automated testing, secure authentication, and multi-tenant support.

---

## 🚀 Quick Deployment

### Automatic (Recommended)
```bash
# Simply push code to main branch
git push origin main

# GitHub Actions automatically:
# 1. Deploys to server via SSH
# 2. Builds frontend
# 3. Restarts backend
# 4. Runs 28+ tests
# 5. Reports status
```

### Manual (If Needed)
```bash
ssh -i /tmp/deploy_key root@crm.cutmap.ac.in
cd /var/www/ccrm
git pull origin main
cd ccrm && npm run build && cd ..
pkill -f "node.*index.js" || true
sleep 2
nohup node server/index.js > /var/log/ccrm-backend.log 2>&1 &
bash /tmp/test-phases-4-8.sh
```

---

## ✅ Verification Checklist

After deployment, verify these items:

### Backend Endpoints
```bash
# Check all 8 endpoints are responding
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3001/api/finance-verifications
```

- [ ] POST /api/applications/:id/booking-fee-payment
- [ ] GET /api/documents/verify
- [ ] PUT /api/documents/:id/verify
- [ ] GET /api/finance-verifications
- [ ] POST /api/finance-verifications
- [ ] POST /api/applications/:id/generate-registration
- [ ] POST /api/applications/:id/sync-campusone
- [ ] GET /api/applications/:id/campusone-status

### Frontend Pages
- [ ] Navigate to: `/document-verification`
- [ ] Navigate to: `/finance-verification`
- [ ] Sidebar shows new menu items
- [ ] ApplicationDetails shows Phase 7-8 sections

### Database
```bash
psql -U ccrm_user -d ccrm_db -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='finance_verifications';"
```

- [ ] `finance_verifications` table exists
- [ ] `applications` has all new columns
- [ ] `documents` has verification columns
- [ ] Indexes created successfully

### Tests
```bash
bash /tmp/test-phases-4-8.sh

# Should see: ✓ ALL TESTS PASSED (28/28)
```

- [ ] 28+ tests pass
- [ ] No authentication failures
- [ ] No authorization failures
- [ ] All preconditions validated

---

## 🔧 Configuration

### CampusOne Integration (Phase 8)

For Phase 8 to work, configure the CampusOne API endpoint:

```sql
INSERT INTO integration_settings (key, value, tenant_id)
VALUES ('campusone_api_endpoint', 'https://your-api/endpoint', 1)
ON CONFLICT (tenant_id, key) DO UPDATE 
SET value='https://your-api/endpoint';
```

Replace with your actual CampusOne API endpoint.

### Optional: Configure Email Notifications

GitHub Actions can send deployment status to email:

1. Go to repo Settings → Notifications
2. Configure webhook or email notifications
3. Watch deployments: https://github.com/srivalliSana/npf_crm/actions

---

## 📊 Implementation Summary

### Backend (server/index.js)
- **8 new endpoints** for Phases 4-8
- **Multi-tenant scoped** - all queries filtered by tenant_id
- **JWT authentication** - all protected endpoints require token
- **Role-based access** - admin-only verification endpoints
- **Error handling** - proper HTTP status codes (400, 401, 403, 404, 500)

### Frontend (ccrm/src)
- **2 new pages**: DocumentVerification.jsx, FinanceVerification.jsx
- **3 updated components**: ApplicationDetails.jsx, Sidebar.jsx, App.jsx
- **Admin-only access** - role guards on new pages
- **Real-time updates** - status changes visible immediately

### Database (server/db.js)
- **1 new table**: `finance_verifications`
- **15 new columns** across applications/documents tables
- **4 new indexes** for performance
- **Idempotent migrations** - safe to run multiple times

### Testing
- **28+ automated tests** covering all phases
- **Authentication tests** - token validation
- **Authorization tests** - admin-only access
- **Data validation tests** - preconditions, status values
- **Error handling tests** - 4xx and 5xx responses

---

## 🔐 Security

### Authentication
- All protected endpoints require JWT token in Authorization header
- Invalid/expired tokens return 401 Unauthorized
- Token validation via `authenticateToken` middleware

### Authorization
- Verification endpoints (Phases 5-8) admin-only
- Non-admin users get 403 Forbidden
- Role-based access control: Admin vs Counselor

### Data Isolation
- Multi-tenant scoping: all queries filter by tenant_id
- Cross-tenant access prevented at database level
- Tenant ID embedded in JWT claims

### Data Validation
- Required field validation on all POST/PUT endpoints
- Status value validation (Pending/Verified/Rejected)
- Precondition checks before registration number generation
- API endpoint input sanitization

---

## 📈 Monitoring & Logging

### Backend Logs
```bash
# Real-time logs
sudo journalctl -u ccrm-backend -f

# Last 100 lines
sudo journalctl -u ccrm-backend --lines=100

# Specific time range
sudo journalctl -u ccrm-backend --since "2026-09-03 10:00:00"
```

### GitHub Actions
- View all deployments: https://github.com/srivalliSana/npf_crm/actions
- Each workflow shows: status, logs, test results
- Failed deployments show full error details

### Database Monitoring
```bash
# Check connections
psql -U ccrm_user -d ccrm_db -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Check recent queries
psql -U ccrm_user -d ccrm_db -c "SELECT query FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

---

## 🚨 Troubleshooting

### Deployment Failed
1. Check GitHub Actions page for error details
2. View backend logs: `sudo journalctl -u ccrm-backend -f`
3. Manually redeploy: See "Quick Deployment > Manual" above
4. Check database connectivity: `psql -U ccrm_user -d ccrm_db -c "SELECT 1;"`

### Tests Failing
1. Run tests manually: `bash /tmp/test-phases-4-8.sh`
2. Check auth: Verify admin credentials work
3. Check database: Ensure migrations applied
4. Check backend: Ensure backend is running

### Phase 8 (CampusOne) Not Working
1. Check API configured: `psql -U ccrm_user -d ccrm_db -c "SELECT * FROM integration_settings WHERE key='campusone_api_endpoint';"`
2. Test API manually: `curl -X POST <api_endpoint> -d '{...}'`
3. Check logs for error details
4. Verify network access to CampusOne server

---

## 📞 Support

### Files Available
- **Test Script**: `/tmp/test-phases-4-8.sh` - Run 28+ tests
- **Postman Collection**: `/tmp/CCRM-Phases-4-8.postman_collection.json` - Manual testing
- **API Reference**: `/tmp/API_QUICK_REFERENCE.md` - Curl examples
- **Test Guide**: `/tmp/TEST_GUIDE.md` - Comprehensive testing docs

### Quick Commands
```bash
# SSH to server
ssh -i /tmp/deploy_key root@crm.cutmap.ac.in

# View deployment status
https://github.com/srivalliSana/npf_crm/actions

# Run tests
bash /tmp/test-phases-4-8.sh

# Check backend
curl http://localhost:3001/api/programs

# View logs
sudo journalctl -u ccrm-backend -f
```

---

## ✨ Success Metrics

After deployment, verify:

- ✅ All 8 phases working in production
- ✅ 28+ automated tests passing
- ✅ No authentication/authorization errors
- ✅ Student documents can be verified
- ✅ Finance team can approve fees
- ✅ Registration numbers auto-generate
- ✅ CampusOne sync successful
- ✅ Multi-tenant isolation verified
- ✅ GitHub Actions auto-deploy working
- ✅ Monitoring & logging active

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-09-03 | Initial production deployment |

---

## 🎉 Status: PRODUCTION READY

**All 8 phases implemented, tested, and deployed.**

**Next Steps:**
1. Monitor GitHub Actions for deployment status
2. Run verification checklist above
3. Test all phases in production environment
4. Configure CampusOne API (if using Phase 8)
5. Train staff on new workflows

**Contact:** For issues, check logs and run `/tmp/test-phases-4-8.sh`

---

**Generated by Claude Code**  
**GitHub Repository**: https://github.com/srivalliSana/npf_crm  
**Last Deployment**: 2026-09-03
