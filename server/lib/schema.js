// Schema for the Analytics / Compliance / Integration / Security modules.
//
// Kept out of db.js on purpose: initDb() is one long transaction-less migration
// list where a single failure aborts the rest, and these tables are additive.
// Same conventions as db.js — CREATE TABLE IF NOT EXISTS + ALTER ... IF NOT
// EXISTS, every row carries tenant_id DEFAULT 1 (Centurion), and every failure
// is swallowed so a partially-migrated DB still boots.
import { pool } from '../db.js'
import { ROLE_DEFAULTS, PERMISSION_KEYS } from './permissions.js'

// Tables created here that need the same tenant_id/index treatment initTenancy()
// gives the older tables. Listed once so adding a table can't forget the index.
const MODULE_TABLES = [
  'audit_logs', 'login_events', 'user_sessions',
  'retention_policies', 'compliance_report_runs',
  'integration_connectors', 'integration_sync_jobs', 'integration_sync_logs',
  'academic_records', 'exam_results',
]

export async function initModuleSchema() {
  const client = await pool.connect()
  const run = (sql, params) => client.query(sql, params).catch(err => {
    console.error('[initModuleSchema]', err.message)
  })

  try {
    // ── 26 / 29 · Application-wide audit trail ────────────────────────────────
    // platform_audit_logs already covers cross-tenant platform-admin actions;
    // this is the in-tenant equivalent, written for every mutating API call.
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            BIGSERIAL PRIMARY KEY,
        tenant_id     INTEGER      DEFAULT 1,
        actor_id      INTEGER,
        actor_email   VARCHAR(255) DEFAULT '',
        actor_role    VARCHAR(50)  DEFAULT '',
        action        VARCHAR(30)  NOT NULL,
        entity_type   VARCHAR(60)  DEFAULT '',
        entity_id     VARCHAR(100) DEFAULT '',
        summary       TEXT         DEFAULT '',
        method        VARCHAR(10)  DEFAULT '',
        path          TEXT         DEFAULT '',
        status_code   INTEGER,
        changes       JSONB        DEFAULT '{}'::jsonb,
        ip            VARCHAR(64)  DEFAULT '',
        user_agent    TEXT         DEFAULT '',
        created_at    TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE INDEX IF NOT EXISTS idx_audit_tenant_time   ON audit_logs (tenant_id, created_at DESC);`)
    await run(`CREATE INDEX IF NOT EXISTS idx_audit_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id);`)
    await run(`CREATE INDEX IF NOT EXISTS idx_audit_tenant_actor  ON audit_logs (tenant_id, actor_email);`)

    // ── 29 · Authentication: login attempts + revocable sessions ──────────────
    await run(`
      CREATE TABLE IF NOT EXISTS login_events (
        id          BIGSERIAL PRIMARY KEY,
        tenant_id   INTEGER      DEFAULT 1,
        user_id     INTEGER,
        email       VARCHAR(255) DEFAULT '',
        success     BOOLEAN      DEFAULT FALSE,
        reason      VARCHAR(120) DEFAULT '',
        method      VARCHAR(30)  DEFAULT 'password',
        ip          VARCHAR(64)  DEFAULT '',
        user_agent  TEXT         DEFAULT '',
        created_at  TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE INDEX IF NOT EXISTS idx_login_tenant_time  ON login_events (tenant_id, created_at DESC);`)
    await run(`CREATE INDEX IF NOT EXISTS idx_login_tenant_email ON login_events (tenant_id, LOWER(email));`)

    // One row per issued JWT. authenticateToken checks the token's jti against
    // the revoked set, so an admin can actually kill a live session — a plain
    // stateless JWT can't be withdrawn before it expires.
    await run(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id           BIGSERIAL PRIMARY KEY,
        tenant_id    INTEGER      DEFAULT 1,
        user_id      INTEGER,
        email        VARCHAR(255) DEFAULT '',
        jti          VARCHAR(64)  UNIQUE NOT NULL,
        login_method VARCHAR(30)  DEFAULT 'password',
        ip           VARCHAR(64)  DEFAULT '',
        user_agent   TEXT         DEFAULT '',
        created_at   TIMESTAMP    DEFAULT NOW(),
        last_seen_at TIMESTAMP    DEFAULT NOW(),
        expires_at   TIMESTAMP,
        revoked_at   TIMESTAMP,
        revoked_by   VARCHAR(255) DEFAULT ''
      );
    `)
    await run(`CREATE INDEX IF NOT EXISTS idx_sessions_tenant_user ON user_sessions (tenant_id, user_id);`)
    await run(`CREATE INDEX IF NOT EXISTS idx_sessions_live        ON user_sessions (revoked_at, expires_at);`)

    // ── 26 · Records retention (what we keep, for how long, on what basis) ────
    await run(`
      CREATE TABLE IF NOT EXISTS retention_policies (
        id            SERIAL PRIMARY KEY,
        tenant_id     INTEGER      DEFAULT 1,
        entity        VARCHAR(60)  NOT NULL,
        retain_months INTEGER      DEFAULT 84,
        legal_basis   VARCHAR(255) DEFAULT '',
        action        VARCHAR(20)  DEFAULT 'review',
        updated_by    VARCHAR(255) DEFAULT '',
        updated_at    TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_retention_tenant_entity ON retention_policies (tenant_id, entity);`)

    // Every statutory export is itself an auditable event — who pulled which
    // register, for which year, and how many rows it contained.
    await run(`
      CREATE TABLE IF NOT EXISTS compliance_report_runs (
        id            SERIAL PRIMARY KEY,
        tenant_id     INTEGER      DEFAULT 1,
        report_code   VARCHAR(60)  NOT NULL,
        academic_year VARCHAR(20)  DEFAULT '',
        row_count     INTEGER      DEFAULT 0,
        params        JSONB        DEFAULT '{}'::jsonb,
        generated_by  VARCHAR(255) DEFAULT '',
        generated_at  TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE INDEX IF NOT EXISTS idx_report_runs_tenant ON compliance_report_runs (tenant_id, generated_at DESC);`)

    // ── 25 · Real timestamps on applications & payments ──────────────────────
    // Both tables only carry a display string (`date`, e.g. "6/9/2026"), which
    // can't be filtered or bucketed by month. Same treatment leads already got
    // in db.js: add the column NULL, backfill what parses, and only then set the
    // default — adding it WITH a default would stamp every historical row with
    // the migration's own timestamp and quietly fabricate the history.
    for (const table of ['applications', 'payments']) {
      await run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;`)
      await run(`UPDATE ${table} SET created_at = to_timestamp(date, 'DD/MM/YYYY')
                 WHERE created_at IS NULL AND date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}';`)
      await run(`ALTER TABLE ${table} ALTER COLUMN created_at SET DEFAULT NOW();`)
      await run(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant_created ON ${table} (tenant_id, created_at);`)
    }

    // ── 26 · Document repository metadata on the existing documents table ─────
    await run(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS category        VARCHAR(60) DEFAULT '';`)
    await run(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS sha256          VARCHAR(64) DEFAULT '';`)
    await run(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS size_bytes      BIGINT      DEFAULT 0;`)
    await run(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS retention_until DATE;`)
    await run(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMP;`)

    // ── 27 · Integration registry: connectors → jobs → run logs ───────────────
    await run(`
      CREATE TABLE IF NOT EXISTS integration_connectors (
        id              SERIAL PRIMARY KEY,
        tenant_id       INTEGER      DEFAULT 1,
        code            VARCHAR(60)  NOT NULL,
        name            VARCHAR(150) NOT NULL,
        system_type     VARCHAR(20)  NOT NULL,
        direction       VARCHAR(20)  DEFAULT 'outbound',
        base_url        TEXT         DEFAULT '',
        health_path     TEXT         DEFAULT '',
        auth_type       VARCHAR(20)  DEFAULT 'none',
        auth_username   VARCHAR(150) DEFAULT '',
        auth_secret     TEXT         DEFAULT '',
        header_name     VARCHAR(80)  DEFAULT '',
        enabled         BOOLEAN      DEFAULT FALSE,
        status          VARCHAR(20)  DEFAULT 'not_configured',
        last_checked_at TIMESTAMP,
        last_error      TEXT         DEFAULT '',
        created_at      TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_connector_tenant_code ON integration_connectors (tenant_id, code);`)

    await run(`
      CREATE TABLE IF NOT EXISTS integration_sync_jobs (
        id            SERIAL PRIMARY KEY,
        tenant_id     INTEGER      DEFAULT 1,
        connector_id  INTEGER      REFERENCES integration_connectors(id) ON DELETE CASCADE,
        entity        VARCHAR(60)  NOT NULL,
        direction     VARCHAR(20)  DEFAULT 'pull',
        path          TEXT         DEFAULT '',
        schedule_cron VARCHAR(60)  DEFAULT '',
        enabled       BOOLEAN      DEFAULT FALSE,
        last_run_at   TIMESTAMP,
        last_status   VARCHAR(20)  DEFAULT '',
        last_records  INTEGER      DEFAULT 0,
        last_error    TEXT         DEFAULT '',
        created_at    TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE INDEX IF NOT EXISTS idx_sync_jobs_tenant ON integration_sync_jobs (tenant_id, connector_id);`)

    await run(`
      CREATE TABLE IF NOT EXISTS integration_sync_logs (
        id              BIGSERIAL PRIMARY KEY,
        tenant_id       INTEGER      DEFAULT 1,
        job_id          INTEGER,
        connector_code  VARCHAR(60)  DEFAULT '',
        entity          VARCHAR(60)  DEFAULT '',
        direction       VARCHAR(20)  DEFAULT '',
        trigger_source  VARCHAR(20)  DEFAULT 'manual',
        status          VARCHAR(20)  DEFAULT 'running',
        records_read    INTEGER      DEFAULT 0,
        records_written INTEGER      DEFAULT 0,
        records_failed  INTEGER      DEFAULT 0,
        error           TEXT         DEFAULT '',
        started_at      TIMESTAMP    DEFAULT NOW(),
        finished_at     TIMESTAMP,
        duration_ms     INTEGER
      );
    `)
    await run(`CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant ON integration_sync_logs (tenant_id, started_at DESC);`)

    // ── 25 · Academic + examination facts ─────────────────────────────────────
    // CRM-owned tables the ERP/LMS/Examination connectors write into. They stay
    // empty (and the dashboards say so) until a sync job is configured — nothing
    // here invents data.
    await run(`
      CREATE TABLE IF NOT EXISTS academic_records (
        id                  BIGSERIAL PRIMARY KEY,
        tenant_id           INTEGER      DEFAULT 1,
        app_id              INTEGER,
        registration_number VARCHAR(60)  DEFAULT '',
        student_name        VARCHAR(150) DEFAULT '',
        program             VARCHAR(150) DEFAULT '',
        school_dept         VARCHAR(150) DEFAULT '',
        campus              VARCHAR(100) DEFAULT '',
        academic_year       VARCHAR(20)  DEFAULT '',
        term                VARCHAR(40)  DEFAULT '',
        credits_registered  NUMERIC(6,2) DEFAULT 0,
        credits_earned      NUMERIC(6,2) DEFAULT 0,
        gpa                 NUMERIC(4,2),
        cgpa                NUMERIC(4,2),
        attendance_pct      NUMERIC(5,2),
        status              VARCHAR(40)  DEFAULT '',
        source              VARCHAR(40)  DEFAULT 'manual',
        synced_at           TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_academic_key
               ON academic_records (tenant_id, registration_number, academic_year, term);`)
    await run(`CREATE INDEX IF NOT EXISTS idx_academic_tenant_prog ON academic_records (tenant_id, program);`)

    await run(`
      CREATE TABLE IF NOT EXISTS exam_results (
        id                  BIGSERIAL PRIMARY KEY,
        tenant_id           INTEGER      DEFAULT 1,
        registration_number VARCHAR(60)  DEFAULT '',
        student_name        VARCHAR(150) DEFAULT '',
        program             VARCHAR(150) DEFAULT '',
        academic_year       VARCHAR(20)  DEFAULT '',
        term                VARCHAR(40)  DEFAULT '',
        exam_code           VARCHAR(60)  DEFAULT '',
        subject_code        VARCHAR(60)  DEFAULT '',
        subject_name        VARCHAR(200) DEFAULT '',
        max_marks           NUMERIC(6,2) DEFAULT 100,
        obtained_marks      NUMERIC(6,2),
        grade               VARCHAR(10)  DEFAULT '',
        result              VARCHAR(20)  DEFAULT '',
        exam_date           DATE,
        source              VARCHAR(40)  DEFAULT 'manual',
        synced_at           TIMESTAMP    DEFAULT NOW()
      );
    `)
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_exam_key
               ON exam_results (tenant_id, registration_number, exam_code, subject_code);`)
    await run(`CREATE INDEX IF NOT EXISTS idx_exam_tenant_term ON exam_results (tenant_id, academic_year, term);`)

    // Safety net, mirroring initTenancy(): if any table above already existed
    // from an earlier build without tenant_id, add it and its index now.
    for (const t of MODULE_TABLES) {
      await run(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;`)
      await run(`CREATE INDEX IF NOT EXISTS idx_${t}_tenant ON ${t} (tenant_id);`)
    }

    // Seed a default retention policy per entity for tenant 1 only if absent —
    // an admin editing these must never be overwritten on the next boot.
    const DEFAULT_RETENTION = [
      ['documents',   84, 'UGC record-retention norm — 7 years after exit', 'review'],
      ['audit_logs',  96, 'IT Act 2000 s.43A / audit evidence — 8 years',   'archive'],
      ['leads',       36, 'DPDP Act 2023 — purpose-limited, 3 years',        'purge'],
      ['email_logs',  24, 'Operational evidence of notice served',           'purge'],
      ['payments',   120, 'Income Tax Act — books of account, 10 years',     'review'],
    ]
    for (const [entity, months, basis, action] of DEFAULT_RETENTION) {
      await run(
        `INSERT INTO retention_policies (tenant_id, entity, retain_months, legal_basis, action, updated_by)
         VALUES (1, $1, $2, $3, $4, 'system')
         ON CONFLICT (tenant_id, entity) DO NOTHING;`,
        [entity, months, basis, action]
      )
    }

    // ── 29 · Migrate legacy role permissions to the new catalogue ────────────
    // db.js seeded roles with coarse strings ('view_all_leads', 'manage_team')
    // that no longer name anything checkable. Rewrite a built-in role only when
    // none of its stored values are recognised — an Admin holding '*', or a role
    // an admin has already re-saved through the new UI, is left untouched.
    for (const [name, perms] of Object.entries(ROLE_DEFAULTS)) {
      await run(
        `UPDATE roles SET permissions = $1::jsonb
         WHERE name = $2
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(permissions) AS p(v)
             WHERE p.v = ANY($3::text[])
           );`,
        [JSON.stringify(perms), name, [...PERMISSION_KEYS, '*']]
      )
    }

    console.log('--- Analytics / Compliance / Integration / Security schema ready ---')
  } catch (err) {
    console.error('initModuleSchema failed:', err.message)
  } finally {
    client.release()
  }
}
