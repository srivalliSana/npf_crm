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
        upload_date VARCHAR(100)
      );
    `)

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

    // Seed Campaigns
    const campaignsCountRes = await client.query('SELECT COUNT(*) FROM campaigns;')
    if (parseInt(campaignsCountRes.rows[0].count) === 0) {
      console.log('Seeding initial campaigns...')
      const seedCampaigns = [
        ['CUEE 2026 Facebook Campaign', 'Facebook Ads', 'Active', 150000, 98000, 1240, 87, '01/04/2026', '30/06/2026'],
        ['Google Search – B.Tech', 'Google Ads', 'Active', 200000, 145000, 2100, 156, '15/03/2026', '15/07/2026'],
        ['LinkedIn MBA Campaign', 'LinkedIn', 'Paused', 80000, 62000, 430, 42, '01/04/2026', '31/05/2026'],
        ['WhatsApp Drip – Agriculture', 'WhatsApp', 'Active', 30000, 18000, 680, 95, '10/04/2026', '10/07/2026'],
        ['Education Fair – Vizag', 'Offline', 'Completed', 50000, 48500, 320, 38, '20/03/2026', '22/03/2026'],
        ['SMS Blast – Odisha', 'SMS', 'Active', 25000, 12000, 890, 67, '01/05/2026', '31/05/2026']
      ]
      for (const c of seedCampaigns) {
        await client.query(`
          INSERT INTO campaigns (name, channel, status, budget, spent, leads, conversions, start_date, end_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, c)
      }
    }

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
