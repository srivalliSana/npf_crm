# EasyGoIVR Click-to-Call Integration

## Overview

This document describes the **EasyGoIVR click-to-call integration** for the CCRM (Centurion CRM) platform. It enables counselors to make outbound calls directly from the Lead Manager with automatic call logging and history tracking.

---

## Features

✅ **Click-to-Call** — Initiate calls from lead detail with one click  
✅ **Call History** — View all call attempts for each lead  
✅ **Call Status Tracking** — Monitor call progress (initiated, completed, failed)  
✅ **Automatic Logging** — Calls are logged to the database with timestamps  
✅ **Admin Configuration** — Secure credential management via Settings page  
✅ **Vendor-Independent** — Designed to support multiple calling providers in future  

---

## Architecture

### Backend (server/index.js)

**EasyGoIVRProvider Class**
```javascript
class EasyGoIVRProvider {
  constructor(email, passwordHash)
  async getToken()          // Get JWT token with auto-refresh
  async initiateCall(extension, phoneNumber, did)
}
```

**API Endpoints**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/calls/initiate` | POST | Click-to-call from lead detail |
| `/api/calls/history/:leadId` | GET | Fetch call history for a lead |
| `/api/calls/webhook` | POST | Receive call status updates from EasyGoIVR |
| `/api/integrations/messaging-provider` | POST | Configure EasyGoIVR provider |
| `/api/integrations/messaging-provider/:channel` | GET | Get current provider config |

**Database Schema**

```sql
CREATE TABLE calls (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  lead_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  caller_extension VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'initiated',
  call_duration INTEGER DEFAULT 0,
  initiated_by VARCHAR(100) NOT NULL,
  initiated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  provider VARCHAR(50) DEFAULT 'easygoivr',
  recording_url TEXT DEFAULT ''
);
```

---

## Frontend (React)

### Components

**IntegrationSettings.jsx** — Admin page to configure EasyGoIVR  
- Email/Username field
- Password hash field
- DID field
- Test & save button

**ClickToCall.jsx** — Reusable component for click-to-call  
- Click-to-call button
- Call history display
- Status indicators

### Context (CcrmContext.jsx)

New functions exported:
- `initiateCall(leadId, phoneNumber, counselorExtension)` — Make a call
- `getCallHistory(leadId)` — Fetch call history

---

## Setup Instructions

### 1. Admin Configuration

Navigate to **Settings → Integration Settings** and enter:

- **Email**: Your EasyGoIVR account email (e.g., `admin@truckmitr.com`)
- **Password Hash**: Your EasyGoIVR password hash
- **DID**: Your Direct Inward Dial number (e.g., `8062814103`)

Click **"Save & Test Configuration"** to verify credentials.

### 2. Counselor Setup

Each counselor must:

1. Go to **Settings → Profile**
2. Add their **counselor extension** (e.g., `09810808735`)
3. Save the profile

Without an extension set, the "Click to Call" button will show an error.

### 3. Click-to-Call Usage

In **Lead Manager** or lead detail view:

1. Click the **"Click to Call"** button
2. The system initiates an outbound call from the counselor's extension to the lead's phone number
3. The call is logged automatically with timestamp and status
4. Counselors can view **"Call History"** to see all previous calls to that lead

---

## EasyGoIVR API Reference

### Token Generation

```bash
POST https://client.easygoivr.com/masterapiJwt/gentoken
Authorization: Basic auth (email:password_hash)

Response:
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

### Initiate Call

```bash
POST https://client.easygoivr.com/easygoapiJwt/request/dial
Headers: API_TOKEN: <JWT token>

Body:
{
  "exten": "09810808735",      // Caller extension
  "number": "07042333735",      // Recipient phone number
  "did": "8062814103"           // DID (shown to recipient)
}

Response:
{
  "call_id": "12345",
  "status": "initiated"
}
```

---

## Call Status Flow

```
initiated → active → completed
           ↘       ↗
             failed
```

**Status Definitions:**
- `initiated` — Call setup started
- `active` — Call is ringing or connected
- `completed` — Call ended normally
- `failed` — Call failed (no answer, dropped, etc.)

---

## Webhook for Call Events (Optional)

To receive real-time call status updates from EasyGoIVR:

**Configure in EasyGoIVR Dashboard:**
```
Webhook URL: https://crm.cutmap.ac.in/api/calls/webhook
Events: call_completed, call_failed, call_duration
```

**Payload Example:**
```json
{
  "callId": "12345",
  "status": "completed",
  "duration": 300,
  "completedAt": "2026-06-05T10:30:45Z"
}
```

The webhook will update the database with final call status and duration.

---

## Troubleshooting

### Issue: "EasyGoIVR not configured"

**Solution:** Go to **Settings → Integration Settings** and enter your credentials.

### Issue: "Please set your extension in Profile Settings"

**Solution:** Go to **Settings → Profile** and add your counselor extension.

### Issue: "Call initiated but no call received"

**Possible causes:**
1. Wrong DID configured (recipient sees different number)
2. Counselor extension not recognized by EasyGoIVR
3. Phone number format incorrect (should be 10 digits without +91)

**Solution:**
1. Verify DID in EasyGoIVR dashboard
2. Check extension exists in EasyGoIVR IVR system
3. Format number as `07042333735` (not `+917042333735`)

### Issue: "Call failed with authentication error"

**Solution:**
1. Verify email and password hash in **Integration Settings**
2. Regenerate API token by saving the configuration again
3. Contact EasyGoIVR support if credentials are correct

---

## Future Enhancements

### Multi-Provider Support
- Switchable providers (Twilio, Knowlarity, etc.)
- Admin UI to select provider per channel

### Call Recording
- Store `recording_url` in database
- Playback widget in call history

### Call Metrics
- Average call duration per counselor
- Call success rate dashboard
- Peak call times analytics

### SMS Integration
- Send SMS after call with follow-up message
- SMS callback requests

---

## Database Migration

If upgrading from a previous version without the `calls` table:

```sql
CREATE TABLE calls (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  lead_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  caller_extension VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'initiated',
  call_duration INTEGER DEFAULT 0,
  initiated_by VARCHAR(100) NOT NULL,
  initiated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  provider VARCHAR(50) DEFAULT 'easygoivr',
  recording_url TEXT DEFAULT ''
);

CREATE INDEX idx_calls_lead_id ON calls(lead_id);
CREATE INDEX idx_calls_initiated_at ON calls(initiated_at);
```

---

## Security Considerations

✅ **Credentials Encrypted** — Password hashes stored in database, not in code  
✅ **JWT Token Auto-Refresh** — Tokens auto-refresh with 5-min buffer  
✅ **Admin-Only Configuration** — Only admins can configure providers  
✅ **Per-User Audit Trail** — All calls logged with `initiated_by` counselor name  
✅ **No Phone Number Leakage** — Phone numbers only visible to authorized users  

---

## Support

For EasyGoIVR API issues, contact: support@easygoivr.com  
For CRM integration issues, contact: tokalyankv@gmail.com

---

**Last Updated:** June 5, 2026  
**Version:** 1.0
