const pg = require('pg')
const dotenv = require('dotenv')

dotenv.config()
const { Pool } = pg

const connectionString = process.env.DATABASE_URL || 'postgresql://ccrm_user:Ccrm%40123@localhost:5432/ccrm_db'

const pool = new Pool({ connectionString })

async function checkStudent() {
  try {
    const appNo = 'CUEEAP260504'

    console.log('\n=== STUDENT DATA ===')
    console.log(`Searching for Application: ${appNo}\n`)

    // 1. Find the application
    const appRes = await pool.query(
      `SELECT id, tenant_id, name, email, mobile, course, app_no,
              booking_fee_status, registration_fee_paid, provisional_admission_status,
              tuition_fee_paid, tuition_amount_paid, tuition_fee_discount_percent,
              created_at FROM applications WHERE app_no = $1`,
      [appNo]
    )

    if (appRes.rows.length === 0) {
      console.log('❌ Application not found')
      process.exit(1)
    }

    const app = appRes.rows[0]
    console.log('✅ Application found:')
    console.log(JSON.stringify(app, null, 2))

    // 2. Find the tenant
    const tenantRes = await pool.query(
      `SELECT id, name, domain FROM tenants WHERE id = $1`,
      [app.tenant_id]
    )
    const tenant = tenantRes.rows[0]
    console.log('\n=== TENANT INFO ===')
    console.log(JSON.stringify(tenant, null, 2))

    // 3. Find the program with fees
    console.log(`\n=== PROGRAM LOOKUP ===`)
    console.log(`Looking for: tenant_id=${app.tenant_id}, course="${app.course}"`)

    const progRes = await pool.query(
      `SELECT id, tenant_id, name, booking_fee, registration_fee,
              min_due_provisional, min_amount_to_pay, tuition_fee
       FROM programs WHERE tenant_id = $1 AND name = $2`,
      [app.tenant_id, app.course]
    )

    if (progRes.rows.length === 0) {
      console.log('❌ Program NOT FOUND for this course!')
      console.log(`\nAvailable programs for tenant ${app.tenant_id}:`)
      const allProgs = await pool.query(
        `SELECT id, name, tuition_fee, min_amount_to_pay FROM programs WHERE tenant_id = $1`,
        [app.tenant_id]
      )
      console.log(JSON.stringify(allProgs.rows, null, 2))
    } else {
      const prog = progRes.rows[0]
      console.log('✅ Program found:')
      console.log(JSON.stringify(prog, null, 2))
    }

    // 4. Check payments
    console.log(`\n=== PAYMENT RECORDS ===`)
    const payRes = await pool.query(
      `SELECT id, app_id, fee_type, amount, status, utr_number, created_at, approved_by, approved_at
       FROM payments WHERE app_id = $1 ORDER BY created_at DESC`,
      [app.id]
    )
    console.log(JSON.stringify(payRes.rows, null, 2))

    await pool.end()
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exit(1)
  }
}

checkStudent()
