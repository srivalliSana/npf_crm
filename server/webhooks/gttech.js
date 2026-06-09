// GTTECH Inquiry Form Webhook
export default async (req, res, pool) => {
  try {
    const { full_name, organization_name, designation, industry_sector, interested_in, email, phone } = req.body

    if (!full_name || !phone) {
      return res.status(400).json({ success: false, error: 'Missing required fields: full_name, phone' })
    }

    const cleanPhone = phone.replace(/[^\d]/g, '')
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid phone number. Must be at least 10 digits.' })
    }

    const insertRes = await pool.query(
      `INSERT INTO gttech_leads (full_name, organization_name, designation, industry_sector, interested_in, email, phone, website_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, full_name, email, phone;`,
      [full_name, organization_name, designation, industry_sector, JSON.stringify(interested_in || []), email, cleanPhone, 'gttech']
    )

    const lead = insertRes.rows[0]
    console.log(`[GTTECH Webhook] New lead: ${lead.full_name} (${lead.email})`)

    res.status(201).json({
      success: true,
      message: 'GTTECH inquiry received',
      leadId: lead.id,
      lead: { id: lead.id, full_name: lead.full_name, email: lead.email, phone: lead.phone }
    })
  } catch (err) {
    console.error('[GTTECH Webhook Error]', err.message)
    res.status(500).json({ success: false, error: 'Failed to process inquiry.' })
  }
}
