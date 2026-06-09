// FTL Inquiry Form Webhook
export default async (req, res, pool) => {
  try {
    const { name, email_id, phone, looking_for } = req.body

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, phone' })
    }

    const cleanPhone = phone.replace(/[^\d]/g, '')
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid phone number. Must be at least 10 digits.' })
    }

    const insertRes = await pool.query(
      `INSERT INTO ftl_leads (name, email_id, phone, looking_for, website_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email_id, phone;`,
      [name, email_id, cleanPhone, looking_for, 'ftl']
    )

    const lead = insertRes.rows[0]
    console.log(`[FTL Webhook] New lead: ${lead.name} (${lead.email_id})`)

    res.status(201).json({
      success: true,
      message: 'FTL inquiry received',
      leadId: lead.id,
      lead: { id: lead.id, name: lead.name, email: lead.email_id, phone: lead.phone }
    })
  } catch (err) {
    console.error('[FTL Webhook Error]', err.message)
    res.status(500).json({ success: false, error: 'Failed to process inquiry.' })
  }
}
