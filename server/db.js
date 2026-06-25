import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()
const { Pool } = pg

const connectionString = process.env.DATABASE_URL || 'postgresql://ccrm_user:Ccrm%40123@localhost:5432/ccrm_db'

export const pool = new Pool({
  connectionString
})

// Schema Migrations Setup
export async function initDb() {
  const client = await pool.connect()
  try {
    console.log('--- Initializing CCRM PostgreSQL Database Schema ---')

    // GT website lead tables: ensure the owner column exists up-front, so this
    // critical migration runs even if a later init statement throws and aborts.
    for (const t of ['ftl_leads', 'gtib_leads', 'gttech_leads', 'esse_leads']) {
      await client.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS owner VARCHAR(120) DEFAULT '';`).catch(() => {})
    }
    // Per-user opt-out of round-robin auto-assignment
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS exclude_from_assignment BOOLEAN DEFAULT FALSE;`).catch(() => {})
    // Per-user entity access (comma-separated: CUTM,CUTMAP,FTL,GTIB,GTTECH,ESSE) — default CUTM
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS entities TEXT DEFAULT 'CUTM';`).catch(() => {})
    await client.query(`UPDATE users SET entities='CUTM' WHERE entities IS NULL OR entities='';`).catch(() => {})
    // Super Admin flag — only a super admin can delete/demote other admins
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;`).catch(() => {})
    // One-time bootstrap (first run, before any super admin exists): promote the oldest
    // admin to super admin, and give existing admins full entity access so they keep
    // their current all-sections visibility once admins become entity-gated.
    try {
      const hasSuper = await client.query("SELECT 1 FROM users WHERE is_superadmin = TRUE LIMIT 1;")
      if (hasSuper.rows.length === 0) {
        await client.query("UPDATE users SET is_superadmin = TRUE WHERE id = (SELECT id FROM users WHERE role = 'Admin' ORDER BY id ASC LIMIT 1);")
        await client.query("UPDATE users SET entities = 'CUTM,CUTMAP,FTL,GTIB,GTTECH,ESSE' WHERE role = 'Admin';")
      }
    } catch { /* users table not present yet on a brand-new DB */ }
    // GT lead status: seed the funnel default (old rows were 'new'/empty)
    for (const t of ['ftl_leads', 'gtib_leads', 'gttech_leads', 'esse_leads']) {
      await client.query(`UPDATE ${t} SET status='Not Contacted' WHERE status IS NULL OR status IN ('', 'new', 'New');`).catch(() => {})
    }

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'Counselor',
        team VARCHAR(100) DEFAULT 'Sales',
        status VARCHAR(50) DEFAULT 'Active',
        picture TEXT,
        last_login VARCHAR(100) DEFAULT '—'
      );
    `)

    // 2. Leads Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        mobile VARCHAR(50) NOT NULL,
        state VARCHAR(100),
        city VARCHAR(100),
        course VARCHAR(100),
        source VARCHAR(100),
        owner VARCHAR(100),
        reg_date VARCHAR(100),
        score INTEGER DEFAULT 0,
        stage VARCHAR(50) DEFAULT 'Untouched',
        stage_color VARCHAR(50) DEFAULT 'red'
      );
    `)

    // Real timestamp for date-range filtering (reg_date is a display string).
    // Backfill historical dates from reg_date ("DD/MM/YYYY, ...") once; new rows default NOW().
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;`).catch(() => {})
    await client.query(`ALTER TABLE leads ALTER COLUMN created_at SET DEFAULT NOW();`).catch(() => {})
    await client.query(`UPDATE leads SET created_at = to_timestamp(reg_date, 'DD/MM/YYYY')
                        WHERE created_at IS NULL AND reg_date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}';`).catch(() => {})
    await client.query(`UPDATE leads SET created_at = NOW() WHERE created_at IS NULL;`).catch(() => {})

    // Facebook / Instagram comments captured via the Meta webhook
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_comments (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(20),
        post_id VARCHAR(150),
        comment_id VARCHAR(150) UNIQUE,
        commenter_id VARCHAR(150),
        commenter_name VARCHAR(200),
        text TEXT,
        permalink TEXT,
        lead_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => {})

    // 3. Applications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        app_no VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100) NOT NULL,
        mobile VARCHAR(50) NOT NULL,
        form_status VARCHAR(50) DEFAULT 'Incomplete',
        pay_status VARCHAR(50) DEFAULT 'Payment Pending',
        pay_method VARCHAR(50) DEFAULT '',
        campus VARCHAR(100) DEFAULT 'Bhubaneswar',
        course VARCHAR(100) NOT NULL,
        stage VARCHAR(100) DEFAULT 'Application Started',
        owner VARCHAR(100) DEFAULT 'Unassigned',
        date VARCHAR(100)
      );
    `)

    // 4. Tasks Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'Call',
        priority VARCHAR(50) DEFAULT 'Medium',
        due VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending',
        assignee VARCHAR(100),
        lead VARCHAR(100)
      );
    `)

    // 5. Payments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        app_no VARCHAR(100) NOT NULL,
        amount INTEGER DEFAULT 0,
        method VARCHAR(50) DEFAULT '',
        status VARCHAR(50) DEFAULT 'Pending',
        date VARCHAR(100) DEFAULT '',
        txn_id VARCHAR(100) DEFAULT ''
      );
    `)

    // 6. Queries Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS queries (
        id SERIAL PRIMARY KEY,
        student VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Admission',
        priority VARCHAR(50) DEFAULT 'Medium',
        status VARCHAR(50) DEFAULT 'Open',
        assignee VARCHAR(100),
        created VARCHAR(100)
      );
    `)

    // 7. Documents Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        student VARCHAR(100) NOT NULL,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        upload_date VARCHAR(100),
        file_url TEXT DEFAULT ''
      );
    `)
    // Migration: add file_url column if it doesn't exist yet (for existing DBs)
    await client.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT DEFAULT '';
    `).catch(() => {})

    // 8. Events Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        date VARCHAR(50),
        time VARCHAR(50),
        type VARCHAR(50),
        venue VARCHAR(255),
        participants INTEGER DEFAULT 1
      );
    `)

    // 9. Campaigns Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        channel VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Active',
        budget INTEGER DEFAULT 0,
        spent INTEGER DEFAULT 0,
        leads INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        start_date VARCHAR(50),
        end_date VARCHAR(50)
      );
    `)

    // 10. Notifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        time VARCHAR(100) DEFAULT 'Just now',
        unread BOOLEAN DEFAULT TRUE
      );
    `)

    // 11. Lead Assignment Counter (round-robin auto-assign)
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_assignment_counter (
        id SERIAL PRIMARY KEY,
        counselor_name VARCHAR(100) NOT NULL UNIQUE,
        counselor_email VARCHAR(100),
        assignment_count INTEGER DEFAULT 0,
        last_assigned TIMESTAMP DEFAULT NOW()
      );
    `)

    // 12. Drip Sequences (automated follow-up)
    await client.query(`
      CREATE TABLE IF NOT EXISTS drip_sequences (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER,
        lead_name VARCHAR(100),
        lead_email VARCHAR(100),
        lead_mobile VARCHAR(50),
        sequence_name VARCHAR(100) DEFAULT 'Standard Admission',
        current_step INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT NOW(),
        next_action_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // 13. Call Logs (click-to-call)
    await client.query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id SERIAL PRIMARY KEY,
        lead_name VARCHAR(100),
        lead_mobile VARCHAR(50),
        counselor VARCHAR(100),
        duration VARCHAR(50) DEFAULT '0:00',
        outcome VARCHAR(100) DEFAULT 'No Answer',
        notes TEXT DEFAULT '',
        called_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // 13b. Calls (EasyGoIVR integration)
    await client.query(`
      CREATE TABLE IF NOT EXISTS calls (
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
    `)

    // 14. Admission Targets (target vs achievement)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admission_targets (
        id SERIAL PRIMARY KEY,
        month VARCHAR(20) NOT NULL,
        year INTEGER NOT NULL,
        campus VARCHAR(100) DEFAULT 'All',
        target_leads INTEGER DEFAULT 0,
        target_applications INTEGER DEFAULT 0,
        target_enrollments INTEGER DEFAULT 0,
        UNIQUE(month, year, campus)
      );
    `)

    // 15. Email Campaigns Builder
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) DEFAULT '',
        template TEXT DEFAULT '',
        segment VARCHAR(100) DEFAULT 'All Leads',
        status VARCHAR(50) DEFAULT 'Draft',
        sent_count INTEGER DEFAULT 0,
        open_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP
      );
    `)

    // 16. WhatsApp Bulk Message Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id SERIAL PRIMARY KEY,
        campaign_name VARCHAR(255),
        message_template TEXT,
        recipient_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Sent',
        sent_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Migrations: add campus column to leads if not exists
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campus VARCHAR(100) DEFAULT 'Bhubaneswar';`).catch(() => {})
    // Migrations: add score column update on leads
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_score INTEGER DEFAULT 0;`).catch(() => {})

    // === SOCIAL MEDIA & ALERT SYSTEM MIGRATIONS ===

    // Upgrade notifications table with per-user targeting + metadata
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_email VARCHAR(100);`).catch(() => {})
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT '';`).catch(() => {})
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'info';`).catch(() => {})
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lead_id INTEGER;`).catch(() => {})
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();`).catch(() => {})

    // Integration settings table (key-value store for API credentials)
    await client.query(`
      CREATE TABLE IF NOT EXISTS integration_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => {})

    // Users: add mobile field for WhatsApp alerts to counselors + mobile_number for calling
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(50) DEFAULT '';`).catch(() => {})
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20) DEFAULT '';`).catch(() => {})

    // Leads: add lead_source tracking (facebook, form, counselor_upload, manual)
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source VARCHAR(50) DEFAULT 'form';`).catch(() => {})

    // Document links for shareable upload URLs
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_links (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL,
        token VARCHAR(100) UNIQUE NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        expiry_date TIMESTAMP,
        views_count INTEGER DEFAULT 0
      );
    `).catch(() => {})
    // Reporting hierarchy — counsellor reports to a manager/dean (stores manager's name)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_to VARCHAR(255) DEFAULT '';`).catch(() => {})

    // Applications: full admission details (KYC + academics) + letter dispatch tracking
    await client.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS admission_details JSONB DEFAULT '{}'::jsonb;`).catch(() => {})
    await client.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS admission_letter_sent_at TIMESTAMP;`).catch(() => {})
    await client.query(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS school_dept VARCHAR(255) DEFAULT '';`).catch(() => {})

    // Leads: same details so counsellor can fill them at lead stage (before app exists)
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_details JSONB DEFAULT '{}'::jsonb;`).catch(() => {})

    // WhatsApp logs: track who sent + honest delivery status
    await client.query(`ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS sent_by VARCHAR(255) DEFAULT '';`).catch(() => {})
    await client.query(`ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'whatsapp';`).catch(() => {})

    // Lead transfer requests — counsellor requests, admin approves
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_transfers (
        id          SERIAL PRIMARY KEY,
        lead_id     INTEGER NOT NULL,
        from_owner  VARCHAR(255) NOT NULL,
        to_owner    VARCHAR(255) NOT NULL,
        remark      TEXT DEFAULT '',
        status      VARCHAR(20) DEFAULT 'pending',
        requested_by VARCHAR(255),
        requested_at TIMESTAMP DEFAULT NOW(),
        decided_by  VARCHAR(255),
        decided_at  TIMESTAMP
      );
    `).catch(() => {})

    // Custom Teams (admin-managed)
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id   SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => {})

    // Custom Roles (admin-managed, in addition to system roles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id   SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        permissions JSONB DEFAULT '[]'::jsonb,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => {})

    // Seed system defaults if empty
    const teamCount = await client.query("SELECT COUNT(*)::int AS c FROM teams;")
    if (teamCount.rows[0].c === 0) {
      for (const t of ['Management','Admissions','Sales','Marketing','Finance']) {
        await client.query(`INSERT INTO teams (name) VALUES ($1) ON CONFLICT DO NOTHING;`, [t]).catch(() => {})
      }
    }
    const roleCount = await client.query("SELECT COUNT(*)::int AS c FROM roles;")
    if (roleCount.rows[0].c === 0) {
      const sysRoles = [
        ['Admin',     'Full access to all modules and settings', ['*'], true],
        ['Manager',   'View all leads, manage team, approve payments', ['view_all_leads','manage_team','approve_payments'], true],
        ['Counselor', 'Handle assigned leads, log calls, send messages', ['view_own_leads','edit_own_leads','send_messages'], true],
        ['Finance',   'View and approve payments', ['view_payments','approve_payments'], true],
      ]
      for (const [name, desc, perms, sys] of sysRoles) {
        await client.query(
          `INSERT INTO roles (name, description, permissions, is_system) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;`,
          [name, desc, JSON.stringify(perms), sys]
        ).catch(() => {})
      }
    }

    // RCS approved templates — pulled via webhook from rcssms.in or added manually
    await client.query(`
      CREATE TABLE IF NOT EXISTS rcs_templates (
        id SERIAL PRIMARY KEY,
        template_id  VARCHAR(100) UNIQUE NOT NULL,
        name         VARCHAR(255) DEFAULT '',
        rcs_type     VARCHAR(50)  DEFAULT 'BASIC',
        status       VARCHAR(50)  DEFAULT 'PENDING',
        provider     VARCHAR(50)  DEFAULT 'rcssms',
        variables    JSONB        DEFAULT '[]'::jsonb,
        preview      TEXT         DEFAULT '',
        created_at   TIMESTAMP    DEFAULT NOW(),
        approved_at  TIMESTAMP
      );
    `).catch(() => {})

    // Per-lead RCS message log (single sends + DLR delivery status)
    await client.query(`
      CREATE TABLE IF NOT EXISTS rcs_messages (
        id SERIAL PRIMARY KEY,
        lead_id      INTEGER,
        lead_name    VARCHAR(255) DEFAULT '',
        mobile       VARCHAR(20)  DEFAULT '',
        template_id  VARCHAR(100) DEFAULT '',
        rcs_type     VARCHAR(50)  DEFAULT 'BASIC',
        variables    JSONB        DEFAULT '{}'::jsonb,
        status       VARCHAR(50)  DEFAULT 'sent',
        msgid        VARCHAR(255) DEFAULT '',
        error_code   VARCHAR(255) DEFAULT '',
        sent_by      VARCHAR(255) DEFAULT '',
        created_at   TIMESTAMP    DEFAULT NOW(),
        delivered_at TIMESTAMP
      );
    `).catch(() => {})

    // Application number sequences
    await client.query(`CREATE SEQUENCE IF NOT EXISTS cueeap_seq START 1;`).catch(() => {})  // Excel/offline apps
    await client.query(`CREATE SEQUENCE IF NOT EXISTS cueesm_seq START 1;`).catch(() => {})  // Social media apps
    // Init sequences to current max so we never clash with existing records
    await client.query(`SELECT setval('cueeap_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM applications),1));`).catch(() => {})
    await client.query(`SELECT setval('cueesm_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM applications),1));`).catch(() => {})

    // Lead extra fields
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_type VARCHAR(10) DEFAULT 'ai';`).catch(() => {})      // 'ai' | 'sm'
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS not_interested_reason TEXT DEFAULT '';`).catch(() => {})    // reason when Not Interested
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date VARCHAR(50) DEFAULT '';`).catch(() => {})    // set when stage = Follow Up (from call-outcomes upload)
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS program VARCHAR(120) DEFAULT '';`).catch(() => {})        // school/program (sheet name in the admission workbook)
    // Stage taxonomy migration to the admission flowchart (idempotent)
    await client.query(`UPDATE leads SET stage='Follow Up' WHERE stage='Further Talk';`).catch(() => {})
    await client.query(`UPDATE leads SET stage='Campus Visit Scheduled' WHERE stage='Campus Visit';`).catch(() => {})
    await client.query(`UPDATE leads SET stage='Payment Success' WHERE stage='Admission Confirmed';`).catch(() => {})
    // Source label: Meta lead-ads were previously stored as 'Facebook Ads' (idempotent)
    await client.query(`UPDATE leads SET source='Meta' WHERE source='Facebook Ads';`).catch(() => {})
    // (GT owner column is migrated at the top of initDb so it's resilient to earlier failures)

    // Payment extra fields
    await client.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS utr_number VARCHAR(100) DEFAULT '';`).catch(() => {})
    await client.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS pay_mode VARCHAR(20) DEFAULT 'online';`).catch(() => {})  // 'online' | 'offline'

    // Bulk-upload audit log — who uploaded, when, and the outcome
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_logs (
        id SERIAL PRIMARY KEY,
        uploader_name VARCHAR(255) DEFAULT '',
        uploader_role VARCHAR(50)  DEFAULT '',
        file_name     VARCHAR(255) DEFAULT '',
        total_rows    INTEGER      DEFAULT 0,
        imported      INTEGER      DEFAULT 0,
        skipped       INTEGER      DEFAULT 0,
        updated       INTEGER      DEFAULT 0,
        dup_handling  VARCHAR(50)  DEFAULT '',
        assign_mode   VARCHAR(50)  DEFAULT '',
        assigned_to   VARCHAR(255) DEFAULT '',
        created_at    TIMESTAMP    DEFAULT NOW()
      );
    `).catch(() => {})

    // Email delivery logs (per-recipient tracking for campaigns)
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE CASCADE,
        campaign_name VARCHAR(255) DEFAULT '',
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255) DEFAULT '',
        status VARCHAR(50) DEFAULT 'Sent',
        error_message TEXT DEFAULT '',
        sent_at TIMESTAMP DEFAULT NOW()
      );
    `).catch(() => {})

    console.log('Schema tables created successfully.')

    // --- SEED INITIAL MOCK DATA IF TABLES ARE EMPTY ---
    
    // Seed Users
    const usersCountRes = await client.query('SELECT COUNT(*) FROM users;')
    if (parseInt(usersCountRes.rows[0].count) === 0) {
      console.log('Seeding initial users...')
      const seedUsers = [
        ['Vikram Kumar', 'vkumar@cutm.ac.in', 'Admin@123', 'Admin', 'Management', 'Active', '27/05/2026 09:15 AM'],
        ['Anita Sharma', 'anitas@cutm.ac.in', 'Manager@123', 'Manager', 'Admissions', 'Active', '27/05/2026 08:45 AM'],
        ['Rahul Verma', 'rahulv@cutm.ac.in', 'Counselor@123', 'Counselor', 'Sales', 'Active', '26/05/2026 06:30 PM'],
        ['Meena Patel', 'meenap@cutm.ac.in', 'Counselor@123', 'Counselor', 'Sales', 'Active', '26/05/2026 05:00 PM'],
        ['Suresh Dubey', 'sureshd@cutm.ac.in', 'Counselor@123', 'Counselor', 'Admissions', 'Active', '27/05/2026 09:00 AM'],
        ['Kavitha Rao', 'kavithar@cutm.ac.in', 'Counselor@123', 'Counselor', 'Marketing', 'Active', '26/05/2026 04:30 PM'],
        ['Deepak Mishra', 'deepakm@cutm.ac.in', 'Counselor@123', 'Counselor', 'Sales', 'Inactive', '20/05/2026 11:00 AM'],
        ['Preethi Nair', 'preethin@cutm.ac.in', 'Counselor@123', 'Counselor', 'Admissions', 'Active', '27/05/2026 08:00 AM']
      ]
      for (const u of seedUsers) {
        await client.query(`
          INSERT INTO users (name, email, password, role, team, status, last_login)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, u)
      }
    }

    // Seed Leads
    const leadsCountRes = await client.query('SELECT COUNT(*) FROM leads;')
    if (parseInt(leadsCountRes.rows[0].count) === 0) {
      console.log('Seeding initial leads...')
      const seedLeads = [
        ['Ravi Kumar Sharma', 'ravi.sharma@gmail.com', '9876543210', 'Andhra Pradesh', 'Visakhapatnam', 'B.Tech CSE', 'Facebook Ads', 'Vikram Kumar', '26/05/2026, 12:42 PM', 82, 'Qualified Leads', 'green'],
        ['Priya Devi Nayak', 'priya.nayak@yahoo.com', '9845123456', 'Odisha', 'Bhubaneswar', 'BBA', 'Walk-in', 'Anita S.', 0, 'Untouched', 'red'],
        ['Arjun Patel', 'arjun.patel@gmail.com', '9765432109', 'Andhra Pradesh', 'Guntur', 'MBA', 'LinkedIn', 'Rahul V.', 35, 'Unqualified Leads', 'orange'],
        ['Sneha Reddy', 'sneha.reddy@outlook.com', '9654321098', 'Telangana', 'Hyderabad', 'B.Tech CSE', 'Google Ads', 'Meena P.', 0, 'Untouched', 'red'],
        ['Kiran Babu Rao', 'kiran.rao@gmail.com', '9543210987', 'Odisha', 'Cuttack', 'B.Tech CSE', 'Referral', 'Vikram Kumar', 74, 'Qualified Leads', 'green'],
        ['Ananya Mishra', 'ananya.mishra@gmail.com', '9432109876', 'Odisha', 'Rourkela', 'B.Tech CSE', 'Website', 'Suresh D.', 0, 'Untouched', 'red'],
        ['Suresh Chandra Das', 'suresh.das@rediffmail.com', '9321098765', 'Andhra Pradesh', 'Vijayawada', 'B.Tech CSE', 'Education Fair', 'Kavitha R.', 68, 'Qualified Leads', 'green'],
        ['Deepika Mohapatra', 'deepika.m@gmail.com', '9210987654', 'Odisha', 'Berhampur', 'B.Tech CSE', 'Facebook Ads', 'Deepak M.', 28, 'Unqualified Leads', 'orange'],
        ['Rajesh Kumar Sahu', 'rajesh.sahu@gmail.com', '9109876543', 'Odisha', 'Sambalpur', 'B.Tech CSE', 'SMS Campaign', 'Preethi N.', 0, 'Untouched', 'red'],
        ['Lakshmi Priya', 'lakshmi.priya@gmail.com', '9098765432', 'Andhra Pradesh', 'Nellore', 'B.Tech CSE', 'Referral', 'Arun K.', 91, 'Qualified Leads', 'green'],
        ['Venkat Narayana', 'venkat.n@gmail.com', '8987654321', 'Andhra Pradesh', 'Kurnool', 'B.Tech CSE', 'Google Ads', 'Sunita B.', 0, 'Untouched', 'red'],
        ['Sushma Rani Behera', 'sushma.behera@gmail.com', '8876543210', 'Odisha', 'Puri', 'B.Tech CSE', 'Walk-in', 'Vikram Kumar', 77, 'Qualified Leads', 'green'],
        ['Manoj Kumar Tripathy', 'manoj.tripathy@gmail.com', '8765432109', 'Odisha', 'Balasore', 'B.Tech CSE', 'LinkedIn', 'Anita S.', 65, 'Qualified Leads', 'green'],
        ['Pooja Agarwal', 'pooja.agarwal@gmail.com', '8654321098', 'West Bengal', 'Kolkata', 'B.Tech CSE', 'Facebook Ads', 'Rahul V.', 0, 'Untouched', 'red'],
        ['Santosh Kumar Jena', 'santosh.jena@gmail.com', '8543210987', 'Odisha', 'Kendrapara', 'B.Tech CSE', 'Referral', 'Meena P.', 58, 'Qualified Leads', 'green']
      ]
      for (const l of seedLeads) {
        await client.query(`
          INSERT INTO leads (name, email, mobile, state, city, course, source, owner, reg_date, score, stage, stage_color)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, l)
      }
    }

    // Seed Applications
    const appsCountRes = await client.query('SELECT COUNT(*) FROM applications;')
    if (parseInt(appsCountRes.rows[0].count) === 0) {
      console.log('Seeding initial applications...')
      const seedApps = [
        ['Korumalli Vandana', 'CUEE202612229', 'vandanasai063@gmail.com', '9133033136', 'Incomplete', 'Payment Pending', '', 'Paralakhemundi', 'M.Sc Agriculture (Genetics)', 'Application Started', 'Vikram Kumar', '26/05/2026'],
        ['Relli Poornima', 'CUEEMA262127', 'poornima@Gmail.com', '9603317965', 'Incomplete', 'Payment Pending', '', 'Bhubaneswar', 'MBA', 'Verified', 'Anita Sharma', '26/05/2026'],
        ['Parchuri Venkata Thanuja', 'CUEEMA262109', 'thanujaparchuri3@gmail.com', '7382449004', 'Complete', 'Payment Pending', '', 'Vizianagaram', 'B.Tech CSE', 'Application Started', 'Rahul Verma', '26/05/2026'],
        ['Karrotu Durga Prasad', 'CUEEMA262106', 'karthikcherry206@gmail.com', '8125047286', 'Incomplete', 'Payment Pending', '', 'Bhubaneswar', 'B.Tech ECE', 'Verified', 'Deepak Mishra', '26/05/2026'],
        ['Kumar Kotturu', 'CUEE20266235', 'kotturukumar73@gmail.com', '7995232246', 'Incomplete', 'Payment Pending', '', 'Paralakhemundi', 'BCA', 'Unverified', 'Sunita B.', '25/05/2026'],
        ['Karla Rajesh', 'CUEE20266611', 'karlarajesh88@gmail.com', '7093030264', 'Complete', 'Payment Pending', 'Online', 'Bhubaneswar', 'B.Com', 'Payment Approved', 'Suresh Dubey', '25/05/2026'],
        ['K. Sudhamani', 'CUEE20269810', 'jsudhamani123@gmail.com', '6303911866', 'Incomplete', 'Payment Pending', '', 'Vizianagaram', 'M.Tech', 'Application Started', 'Preethi Nair', '25/05/2026'],
        ['Sowjanya Kolli', 'CUEE202639', 'kollikumari254@gmail.com', '9441007820', 'Complete', 'Payment Approved', 'Offline', 'Bhubaneswar', 'MBA', 'Application Submitted', 'Anita Sharma', '25/05/2026'],
        ['Ravi Kumar Sharma', 'CUEE20261001', 'ravi.sharma@gmail.com', '9876543210', 'Complete', 'Payment Approved', 'Online', 'Bhubaneswar', 'B.Tech CSE', 'Enrolments', 'Vikram Kumar', '24/05/2026']
      ]
      for (const a of seedApps) {
        await client.query(`
          INSERT INTO applications (name, app_no, email, mobile, form_status, pay_status, pay_method, campus, course, stage, owner, date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, a)
      }
    }

    // Seed Tasks
    const tasksCountRes = await client.query('SELECT COUNT(*) FROM tasks;')
    if (parseInt(tasksCountRes.rows[0].count) === 0) {
      console.log('Seeding initial tasks...')
      const seedTasks = [
        ['Follow up with Ravi Kumar', 'Call', 'High', '27/05/2026 10:00 AM', 'Pending', 'Vikram Kumar', 'Ravi Kumar Sharma'],
        ['Send brochure to Priya Nayak', 'Email', 'Medium', '27/05/2026 11:30 AM', 'Pending', 'Anita Sharma', 'Priya Devi Nayak'],
        ['Schedule campus visit – Arjun', 'Meeting', 'High', '27/05/2026 02:00 PM', 'Completed', 'Rahul Verma', 'Arjun Patel'],
        ['Payment reminder – Sneha Reddy', 'WhatsApp', 'High', '27/05/2026 03:00 PM', 'Pending', 'Meena Patel', 'Sneha Reddy'],
        ['Document collection – Kiran', 'Task', 'Low', '28/05/2026 09:00 AM', 'Pending', 'Vikram Kumar', 'Kiran Babu Rao'],
        ['GD/PI scheduling – Ananya', 'Meeting', 'Medium', '28/05/2026 11:00 AM', 'Pending', 'Suresh Dubey', 'Ananya Mishra'],
        ['Verify documents – Suresh Das', 'Task', 'High', '28/05/2026 02:30 PM', 'Pending', 'Kavitha Rao', 'Suresh Chandra Das'],
        ['Send offer letter – Deepika', 'Email', 'Medium', '29/05/2026 10:00 AM', 'Pending', 'Deepak Mishra', 'Deepika Mohapatra']
      ]
      for (const t of seedTasks) {
        await client.query(`
          INSERT INTO tasks (title, type, priority, due, status, assignee, lead)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, t)
      }
    }

    // Seed Payments
    const payCountRes = await client.query('SELECT COUNT(*) FROM payments;')
    if (parseInt(payCountRes.rows[0].count) === 0) {
      console.log('Seeding initial payments...')
      const seedPayments = [
        ['Sowjanya Kolli', 'CUEE202639', 25000, 'Offline', 'Approved', '26/05/2026', 'TXN001234'],
        ['Karla Rajesh', 'CUEE20266611', 25000, 'Online', 'Approved', '25/05/2026', 'TXN001235'],
        ['Ravi Kumar Sharma', 'CUEE20261001', 50000, 'Online', 'Approved', '24/05/2026', 'TXN001236'],
        ['Korumalli Vandana', 'CUEE202612229', 25000, '', 'Pending', '', ''],
        ['Relli Poornima', 'CUEEMA262127', 25000, '', 'Pending', '', ''],
        ['Parchuri Venkata Thanuja', 'CUEEMA262109', 50000, '', 'Pending', '', ''],
        ['Karrotu Durga Prasad', 'CUEEMA262106', 50000, '', 'Pending', '', ''],
        ['Kumar Kotturu', 'CUEE20266235', 25000, '', 'Failed', '23/05/2026', 'TXN001237']
      ]
      for (const p of seedPayments) {
        await client.query(`
          INSERT INTO payments (name, app_no, amount, method, status, date, txn_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, p)
      }
    }

    // Seed Queries
    const queriesCountRes = await client.query('SELECT COUNT(*) FROM queries;')
    if (parseInt(queriesCountRes.rows[0].count) === 0) {
      console.log('Seeding initial queries...')
      const seedQueries = [
        ['Ravi Kumar Sharma', 'Admission process for B.Tech CSE', 'Admission', 'High', 'Open', 'Vikram Kumar', '26/05/2026'],
        ['Priya Devi Nayak', 'Fee structure for MBA program', 'Finance', 'Medium', 'Resolved', 'Anita Sharma', '25/05/2026'],
        ['Arjun Patel', 'Hostel availability at Bhubaneswar', 'Hostel', 'Low', 'Open', 'Rahul Verma', '25/05/2026'],
        ['Sneha Reddy', 'Scholarship eligibility criteria', 'Scholarship', 'High', 'In Progress', 'Meena Patel', '24/05/2026'],
        ['Kiran Babu Rao', 'Document submission deadline', 'Admission', 'High', 'Open', 'Vikram Kumar', '24/05/2026'],
        ['Ananya Mishra', 'Course curriculum for M.Tech', 'Academic', 'Low', 'Resolved', 'Suresh Dubey', '23/05/2026']
      ]
      for (const q of seedQueries) {
        await client.query(`
          INSERT INTO queries (student, subject, category, priority, status, assignee, created)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, q)
      }
    }

    // Seed Documents
    const docsCountRes = await client.query('SELECT COUNT(*) FROM documents;')
    if (parseInt(docsCountRes.rows[0].count) === 0) {
      console.log('Seeding initial documents...')
      const seedDocs = [
        ['Ravi Kumar Sharma', '10th Marksheet', 'Verified', '20/05/2026'],
        ['Ravi Kumar Sharma', '12th Marksheet', 'Verified', '20/05/2026'],
        ['Ravi Kumar Sharma', 'Aadhaar Card', 'Verified', '21/05/2026'],
        ['Priya Devi Nayak', '10th Marksheet', 'Pending', '22/05/2026'],
        ['Priya Devi Nayak', 'Transfer Certificate', 'Rejected', '22/05/2026'],
        ['Arjun Patel', '10th Marksheet', 'Verified', '23/05/2026'],
        ['Arjun Patel', '12th Marksheet', 'Pending', '23/05/2026']
      ]
      for (const d of seedDocs) {
        await client.query(`
          INSERT INTO documents (student, type, status, upload_date)
          VALUES ($1, $2, $3, $4)
        `, d)
      }
    }

    // Seed Events
    const eventsCountRes = await client.query('SELECT COUNT(*) FROM events;')
    if (parseInt(eventsCountRes.rows[0].count) === 0) {
      console.log('Seeding initial events...')
      const seedEvents = [
        ['GD Session – Batch A', '2026-05-28', '10:00 AM', 'GD', 'Room 101, Main Campus', 12],
        ['PI – MBA Candidates', '2026-05-28', '02:00 PM', 'PI', 'Conference Hall', 8],
        ['WAT – B.Tech Batch', '2026-05-29', '09:00 AM', 'WAT', 'Exam Hall 2', 25],
        ['Campus Tour – Vizag', '2026-05-30', '11:00 AM', 'Tour', 'Vizag Campus', 15],
        ['Orientation – New Batch', '2026-06-01', '09:00 AM', 'Orientation', 'Auditorium', 120]
      ]
      for (const e of seedEvents) {
        await client.query(`
          INSERT INTO events (title, date, time, type, venue, participants)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, e)
      }
    }

    // Campaigns: no dummy seed. Admins create real campaigns from the UI.
    // Remove the old demo campaigns from any existing database (idempotent).
    await client.query(`
      DELETE FROM campaigns WHERE name IN (
        'CUEE 2026 Facebook Campaign', 'Google Search – B.Tech', 'LinkedIn MBA Campaign',
        'WhatsApp Drip – Agriculture', 'Education Fair – Vizag', 'SMS Blast – Odisha'
      );
    `).catch(() => {})

    // Seed Notifications
    const notificationsCountRes = await client.query('SELECT COUNT(*) FROM notifications;')
    if (parseInt(notificationsCountRes.rows[0].count) === 0) {
      console.log('Seeding initial notifications...')
      const seedNotifications = [
        ['New lead assigned: Ravi Kumar', '2 min ago', true],
        ['Application submitted by Priya Sharma', '15 min ago', true],
        ['Follow-up reminder: Arjun Patel', '1 hr ago', false],
        ['Payment approved: Sneha Reddy', '3 hrs ago', false]
      ]
      for (const n of seedNotifications) {
        await client.query(`
          INSERT INTO notifications (text, time, unread)
          VALUES ($1, $2, $3)
        `, n)
      }
    }

    console.log('--- CCRM PostgreSQL Database Schema Bootstrapped & Seeded Successfully ---')
  } catch (err) {
    console.error('Failed to initialize CCRM database schema:', err)
  } finally {
    client.release()
  }
}

// ─── Multi-tenant foundation (Phase 1) ────────────────────────────────────────
// Runs independently of initDb() so an unrelated migration abort can't block it.
// Additive + idempotent: every data table gets tenant_id DEFAULT 1 (Centurion),
// so existing single-tenant behaviour is unchanged until queries are scoped (Phase 2).
const TENANT_TABLES = [
  'users', 'leads', 'applications', 'payments', 'documents', 'notifications',
  'integration_settings', 'lead_transfers', 'tasks', 'events', 'campaigns',
  'rcs_templates', 'rcs_messages', 'upload_logs', 'lead_assignment_counter',
  'esse_leads', 'ftl_leads', 'gtib_leads', 'gttech_leads', 'social_comments',
  'drip_sequences', 'drip_enrollments', 'email_campaigns', 'calls',
  'call_logs', 'whatsapp_logs', 'email_logs', 'sms_logs', 'queries'
]

export async function initTenancy() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(80) UNIQUE,
        status VARCHAR(20) DEFAULT 'Active',
        plan VARCHAR(40) DEFAULT 'standard',
        allowed_domains TEXT DEFAULT '',
        branding JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)
    // Per-tenant config (Phase 3 de-hardcode): branding / entities / lead stages
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS entities JSONB DEFAULT '[]';`).catch(() => {})
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stages JSONB DEFAULT '[]';`).catch(() => {})

    // Default tenant = Centurion (id 1). Existing rows backfill to it via DEFAULT 1.
    await client.query(`INSERT INTO tenants (id, name, slug, allowed_domains)
      VALUES (1, 'Centurion', 'centurion', 'cutm.ac.in,cutmap.ac.in')
      ON CONFLICT (id) DO NOTHING;`)
    await client.query(`SELECT setval(pg_get_serial_sequence('tenants','id'),
      GREATEST((SELECT MAX(id) FROM tenants), 1));`).catch(() => {})

    // Seed Centurion's existing branding/entities/stages (only if not yet set) so its
    // app looks/behaves exactly as today. New tenants get generic defaults via the API.
    const CENTURION_BRANDING = {
      name: 'Centurion', shortName: 'CCRM', logoText: 'C',
      appTitle: 'CCRM Admissions', primaryColor: '#4f46e5', tagline: 'Admissions'
    }
    const CENTURION_ENTITIES = [
      { code: 'CUTM',   label: 'CUTM',   kind: 'main' },
      { code: 'CUTMAP', label: 'CUTMAP', kind: 'main' },
      { code: 'FTL',    label: 'FTL',    kind: 'gt'   },
      { code: 'GTIB',   label: 'GTIB',   kind: 'gt'   },
      { code: 'GTTECH', label: 'GTTECH', kind: 'gt'   },
      { code: 'ESSE',   label: 'ESSE',   kind: 'gt'   }
    ]
    const CENTURION_STAGES = ['Untouched','Contacted','Invalid Number','No Response','Follow Up','Interested','Campus Visit Scheduled','Campus Visit Completed','Process for Payment','Payment Success']
    await client.query(
      `UPDATE tenants SET
         branding = CASE WHEN branding = '{}'::jsonb OR branding IS NULL THEN $1::jsonb ELSE branding END,
         entities = CASE WHEN entities = '[]'::jsonb OR entities IS NULL THEN $2::jsonb ELSE entities END,
         stages   = CASE WHEN stages   = '[]'::jsonb OR stages   IS NULL THEN $3::jsonb ELSE stages   END
       WHERE id = 1;`,
      [JSON.stringify(CENTURION_BRANDING), JSON.stringify(CENTURION_ENTITIES), JSON.stringify(CENTURION_STAGES)]
    ).catch(() => {})

    for (const t of TENANT_TABLES) {
      await client.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;`).catch(() => {})
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${t}_tenant ON ${t} (tenant_id);`).catch(() => {})
    }

    // integration_settings: key was globally UNIQUE — make it per-tenant (tenant_id, key)
    await client.query(`ALTER TABLE integration_settings DROP CONSTRAINT IF EXISTS integration_settings_key_key;`).catch(() => {})
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_intset_tenant_key ON integration_settings (tenant_id, key);`).catch(() => {})

    // Platform super-admin (above per-tenant admins) — can create/suspend tenants
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT FALSE;`).catch(() => {})
    // Designate the product owner; if absent, fall back to the oldest tenant-1 admin
    await client.query(`UPDATE users SET is_platform_admin = TRUE WHERE LOWER(email) = 'tokalyankv@gmail.com';`).catch(() => {})
    await client.query(`
      UPDATE users SET is_platform_admin = TRUE
      WHERE id = (SELECT id FROM users WHERE tenant_id = 1 AND role = 'Admin' ORDER BY id ASC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM users WHERE is_platform_admin = TRUE);
    `).catch(() => {})

    console.log('--- Multi-tenant foundation ready (tenants + tenant_id columns) ---')
  } catch (err) {
    console.error('initTenancy failed:', err.message)
  } finally {
    client.release()
  }
}
