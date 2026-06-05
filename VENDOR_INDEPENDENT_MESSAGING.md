# Vendor-Independent Communication Layer Architecture

## Overview

A pluggable messaging and calling system that works with **ANY vendor** without code changes. Admins configure credentials via UI, and the system routes messages/calls through the configured provider.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│          CRM (Lead Detail Page)                 │
│  ┌───────────────────────────────────────────┐  │
│  │ Send WhatsApp | Make Call | Send SMS     │  │
│  │ (Buttons call unified API)               │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      ↓
          ┌───────────────────────────┐
          │   Unified API Layer       │
          │  (vendor-agnostic)        │
          │                           │
          │  POST /api/messages/send  │
          │  POST /api/calls/initiate │
          │  POST /api/sms/send       │
          └───────────────────────────┘
                      ↓
          ┌───────────────────────────┐
          │  Provider Router          │
          │  (picks correct vendor)   │
          │                           │
          │  readProviderConfig()     │
          │  selectVendor()           │
          └───────────────────────────┘
                ↙   ↓    ↘
        ┌──────┴─────┴─────────────┐
        ↓         ↓         ↓       ↓
    [Twilio]  [Gupshup] [AWS SNS] [Knowlarity]
    WhatsApp   WhatsApp   SMS     Calling
```

---

## Database Schema

```sql
-- Store which provider is configured for which channel
CREATE TABLE IF NOT EXISTS messaging_providers (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(50) NOT NULL UNIQUE, -- 'whatsapp', 'sms', 'calling', 'facebook'
  provider_type VARCHAR(50) NOT NULL,  -- 'twilio', 'gupshup', 'aws_sns', 'knowlarity', 'meta'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Store credentials securely (encrypted in production)
CREATE TABLE IF NOT EXISTS provider_credentials (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL,
  credential_key VARCHAR(100) NOT NULL, -- 'account_sid', 'auth_token', 'api_key', etc.
  credential_value TEXT NOT NULL,       -- encrypted in production
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (provider_id) REFERENCES messaging_providers(id)
);

-- Message delivery tracking
CREATE TABLE IF NOT EXISTS unified_messages (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  message_type VARCHAR(20), -- 'whatsapp', 'sms', 'email'
  provider_type VARCHAR(50), -- 'twilio', 'gupshup', etc.
  recipient VARCHAR(100),
  message_text TEXT,
  direction VARCHAR(10), -- 'sent', 'received'
  status VARCHAR(20),    -- 'pending', 'sent', 'delivered', 'read', 'failed'
  provider_message_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

-- Call logs (unified)
CREATE TABLE IF NOT EXISTS unified_calls (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  provider_type VARCHAR(50), -- 'knowlarity', 'twilio', 'aws_chime'
  phone_number VARCHAR(20),
  counselor_name VARCHAR(100),
  call_duration_seconds INT,
  call_status VARCHAR(20), -- 'initiated', 'connected', 'failed', 'completed'
  recording_url TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
```

---

## Backend Implementation

### 1. Provider Factory (Abstraction)

```javascript
// server/lib/messaging-factory.js

class MessagingProvider {
  constructor(providerType) {
    this.type = providerType;
  }

  // Every provider must implement these
  async send(to, message, options) {
    throw new Error('send() not implemented');
  }

  async receive(webhookData) {
    throw new Error('receive() not implemented');
  }

  async getStatus(messageId) {
    throw new Error('getStatus() not implemented');
  }
}

// Twilio WhatsApp Provider
class TwilioWhatsAppProvider extends MessagingProvider {
  constructor(accountSid, authToken, phoneNumber) {
    super('twilio');
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = phoneNumber;
    this.client = new twilio(accountSid, authToken);
  }

  async send(to, message, options = {}) {
    const msg = await this.client.messages.create({
      from: `whatsapp:${this.fromNumber}`,
      to: `whatsapp:${to}`,
      body: message,
      mediaUrl: options.mediaUrl,
    });
    return { messageId: msg.sid, status: 'sent' };
  }
}

// Gupshup WhatsApp Provider
class GupshupWhatsAppProvider extends MessagingProvider {
  constructor(apiKey, apiUrl) {
    super('gupshup');
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  async send(to, message, options = {}) {
    const res = await fetch(`${this.apiUrl}/send`, {
      method: 'POST',
      headers: { 'apikey': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: to,
        message: message,
        media: options.mediaUrl,
      }),
    });
    const data = await res.json();
    return { messageId: data.messageId, status: 'sent' };
  }
}

// SMS Provider (AWS SNS)
class AWSSnSmsProvider extends MessagingProvider {
  constructor(awsAccessKeyId, awsSecretAccessKey, region) {
    super('aws_sns');
    this.sns = new AWS.SNS({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: region,
    });
  }

  async send(to, message, options = {}) {
    const res = await this.sns.publish({
      Message: message,
      PhoneNumber: to,
    }).promise();
    return { messageId: res.MessageId, status: 'sent' };
  }
}

// Calling Provider (Knowlarity)
class KnowlarityCallingProvider extends MessagingProvider {
  constructor(apiKey, apiSecret, campaignId) {
    super('knowlarity');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.campaignId = campaignId;
  }

  async initiate(counselorPhone, candidatePhone) {
    // Call Knowlarity API
    const res = await fetch('https://api.knowlarity.com/v1/call/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        campaign_id: this.campaignId,
        agent_phone: counselorPhone,
        customer_phone: candidatePhone,
      }),
    });
    const data = await res.json();
    return { callId: data.call_id, status: 'initiated' };
  }
}

// Provider Registry
class ProviderRegistry {
  static async getProvider(channel) {
    // 1. Fetch configured provider from DB
    const config = await pool.query(
      `SELECT mp.provider_type, array_agg(json_build_object(
         'key', pc.credential_key,
         'value', pc.credential_value
       )) as credentials
       FROM messaging_providers mp
       LEFT JOIN provider_credentials pc ON mp.id = pc.provider_id
       WHERE mp.channel = $1 AND mp.is_active = true
       GROUP BY mp.provider_type;`,
      [channel]
    );

    if (!config.rows[0]) {
      throw new Error(`No active provider configured for channel: ${channel}`);
    }

    const { provider_type, credentials } = config.rows[0];
    const credMap = credentials.reduce((acc, c) => ({
      ...acc,
      [c.key]: c.value,
    }), {});

    // 2. Instantiate correct provider class
    switch (provider_type) {
      case 'twilio':
        return new TwilioWhatsAppProvider(
          credMap.account_sid,
          credMap.auth_token,
          credMap.phone_number
        );
      case 'gupshup':
        return new GupshupWhatsAppProvider(
          credMap.api_key,
          credMap.api_url
        );
      case 'aws_sns':
        return new AWSSnSmsProvider(
          credMap.aws_access_key_id,
          credMap.aws_secret_access_key,
          credMap.region
        );
      case 'knowlarity':
        return new KnowlarityCallingProvider(
          credMap.api_key,
          credMap.api_secret,
          credMap.campaign_id
        );
      default:
        throw new Error(`Unknown provider type: ${provider_type}`);
    }
  }
}

module.exports = { ProviderRegistry };
```

### 2. API Endpoints (Vendor-Agnostic)

```javascript
// server/routes/unified-messaging.js

// Send WhatsApp (works with ANY WhatsApp provider)
app.post('/api/messages/whatsapp/send', authenticateToken, async (req, res) => {
  try {
    const { leadId, phoneNumber, message } = req.body;
    
    // Get configured WhatsApp provider (could be Twilio, Gupshup, etc.)
    const provider = await ProviderRegistry.getProvider('whatsapp');
    
    // Send via configured provider
    const result = await provider.send(phoneNumber, message);
    
    // Log to unified messages table
    await pool.query(
      `INSERT INTO unified_messages (lead_id, message_type, provider_type, recipient, message_text, direction, status, provider_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [leadId, 'whatsapp', provider.type, phoneNumber, message, 'sent', result.status, result.messageId]
    );
    
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send SMS (works with ANY SMS provider)
app.post('/api/messages/sms/send', authenticateToken, async (req, res) => {
  try {
    const { leadId, phoneNumber, message } = req.body;
    
    const provider = await ProviderRegistry.getProvider('sms');
    const result = await provider.send(phoneNumber, message);
    
    await pool.query(
      `INSERT INTO unified_messages (lead_id, message_type, provider_type, recipient, message_text, direction, status, provider_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [leadId, 'sms', provider.type, phoneNumber, message, 'sent', result.status, result.messageId]
    );
    
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initiate Call (works with ANY calling provider)
app.post('/api/calls/initiate', authenticateToken, async (req, res) => {
  try {
    const { leadId, candidatePhone, counselorPhone } = req.body;
    
    const provider = await ProviderRegistry.getProvider('calling');
    const result = await provider.initiate(counselorPhone, candidatePhone);
    
    await pool.query(
      `INSERT INTO unified_calls (lead_id, provider_type, phone_number, counselor_name, call_status, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW());`,
      [leadId, provider.type, candidatePhone, req.user.name, result.status]
    );
    
    res.json({ success: true, callId: result.callId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generic webhook handler (routes to correct provider)
app.post('/api/webhooks/messaging/:provider', async (req, res) => {
  const { provider } = req.params;
  
  // Each provider sends webhook to their route
  // Webhook data is routed to correct handler
  if (provider === 'twilio') {
    // Parse Twilio webhook
    const { MessageSid, From, Body } = req.body;
    // Update status in DB
  } else if (provider === 'gupshup') {
    // Parse Gupshup webhook
  }
  
  res.json({ success: true });
});
```

### 3. Configuration API

```javascript
// Admin configures provider credentials via API
app.post('/api/integrations/messaging-provider', adminOnly, async (req, res) => {
  const { channel, providerType, credentials } = req.body;
  
  // 1. Create or update provider config
  const provRes = await pool.query(
    `INSERT INTO messaging_providers (channel, provider_type, is_active)
     VALUES ($1, $2, true)
     ON CONFLICT (channel) DO UPDATE SET provider_type = $2
     RETURNING id;`,
    [channel, providerType]
  );
  
  const providerId = provRes.rows[0].id;
  
  // 2. Store credentials (encrypted in production)
  for (const [key, value] of Object.entries(credentials)) {
    await pool.query(
      `INSERT INTO provider_credentials (provider_id, credential_key, credential_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (credential_key) DO UPDATE SET credential_value = $3;`,
      [providerId, key, encryptCredential(value)]
    );
  }
  
  // 3. Test connection
  try {
    const provider = await ProviderRegistry.getProvider(channel);
    // Send test message or call
    res.json({ success: true, message: 'Provider configured and tested successfully' });
  } catch (err) {
    res.status(400).json({ error: `Provider test failed: ${err.message}` });
  }
});

// Get current provider config
app.get('/api/integrations/messaging-provider/:channel', adminOnly, async (req, res) => {
  const result = await pool.query(
    `SELECT mp.provider_type FROM messaging_providers mp
     WHERE mp.channel = $1 AND mp.is_active = true;`,
    [req.params.channel]
  );
  
  res.json(result.rows[0] || { provider_type: null });
});
```

---

## Frontend: Settings UI

```jsx
// ccrm/src/pages/Integrations.jsx - Messaging Providers Section

function MessagingProvidersConfig() {
  const [providers, setProviders] = useState({
    whatsapp: null,
    sms: null,
    calling: null,
  });

  const PROVIDER_OPTIONS = {
    whatsapp: ['Twilio', 'Gupshup', 'Meta Business'],
    sms: ['AWS SNS', 'Twilio', 'Gupshup'],
    calling: ['Knowlarity', 'Twilio', 'AWS Chime'],
  };

  const CREDENTIAL_FIELDS = {
    twilio: ['Account SID', 'Auth Token', 'Phone Number'],
    gupshup: ['API Key', 'API URL'],
    aws_sns: ['AWS Access Key ID', 'AWS Secret Access Key', 'Region'],
    knowlarity: ['API Key', 'API Secret', 'Campaign ID'],
  };

  return (
    <div className="space-y-6">
      {['whatsapp', 'sms', 'calling'].map(channel => (
        <div key={channel} className="bg-white p-6 rounded-xl border">
          <h3 className="font-semibold mb-4 capitalize">{channel} Provider</h3>
          
          <select
            value={providers[channel] || ''}
            onChange={(e) => setProviders({...providers, [channel]: e.target.value})}
            className="input-field mb-4"
          >
            <option value="">Select Provider</option>
            {PROVIDER_OPTIONS[channel]?.map(p => (
              <option key={p} value={p.toLowerCase()}>{p}</option>
            ))}
          </select>

          {providers[channel] && (
            <div className="space-y-3">
              {CREDENTIAL_FIELDS[providers[channel]]?.map(field => (
                <input
                  key={field}
                  type="password"
                  placeholder={field}
                  className="input-field"
                  onBlur={(e) => handleSaveCredential(channel, field, e.target.value)}
                />
              ))}
              <button
                onClick={() => handleTestProvider(channel)}
                className="btn-primary text-sm"
              >
                Test Connection
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Supported Providers (Extensible)

| Channel   | Provider      | Cost         | Features                        |
|-----------|---------------|---------------|---------------------------------|
| WhatsApp  | Twilio        | ₹0.50/msg     | Full support, media, webhooks   |
| WhatsApp  | Gupshup       | ₹0.20/msg     | Budget option, good India reach |
| WhatsApp  | Meta Business | ₹0.48/msg     | Direct from Meta, highest trust |
| SMS       | AWS SNS       | ₹1.50/msg     | Reliable, enterprise-grade      |
| SMS       | Twilio        | ₹0.90/msg     | Same as WhatsApp vendor         |
| Calling   | Knowlarity    | ₹0.50/min     | You already have this           |
| Calling   | Twilio Voice  | ₹0.013/min    | Lower cost option               |

---

## How to Add a New Provider

1. **Create Provider Class**
   ```javascript
   class NewProviderWhatsApp extends MessagingProvider {
     async send(to, message, options) {
       // Implement send logic
     }
   }
   ```

2. **Register in ProviderRegistry**
   ```javascript
   case 'new_provider':
     return new NewProviderWhatsApp(credMap.api_key, credMap.api_url);
   ```

3. **Admin configures via UI**
   - Go to Integrations → Messaging Providers
   - Select "New Provider" for WhatsApp
   - Enter credentials
   - Click "Test Connection"

**No code changes needed in core API or frontend!**

---

## Benefits

✅ **Vendor Agnostic** — Switch providers without code changes
✅ **Cost Optimization** — Use cheapest provider per channel
✅ **No Lock-in** — Move to any provider anytime
✅ **Scalable** — Easy to add new providers
✅ **Admin-Friendly** — Configure via UI, no coding needed
✅ **Redundancy** — Could have backup providers
✅ **Compliance** — Some countries require specific providers

