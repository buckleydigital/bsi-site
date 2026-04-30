import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    })
  }

  try {
    const body = await req.json()

    const {
      name,
      firstName,
      lastName,
      email,
      phone,
      postcode,
      avg_quarterly_bill,
      purchase_timeline,
      source,
      is_homeowner,
      matched_buyer,
      submitted_at,
      'cf-turnstile-response': _turnstile,
      ...rest
    } = body

    const leadName = (name ?? `${firstName ?? ''} ${lastName ?? ''}`.trim()) || null

    // Everything else (source, is_homeowner, matched_buyer, etc.) goes into custom_fields
    const customFieldsObj: Record<string, unknown> = {}
    if (source) customFieldsObj.source = source
    if (is_homeowner !== undefined) customFieldsObj.is_homeowner = is_homeowner
    if (matched_buyer) customFieldsObj.matched_buyer = matched_buyer
    if (submitted_at) customFieldsObj.submitted_at = submitted_at
    for (const [k, v] of Object.entries(rest)) customFieldsObj[k] = v
    const customFields = Object.keys(customFieldsObj).length > 0
      ? JSON.stringify(customFieldsObj)
      : null

    // Use service role key – bypasses RLS so the edge function has full write access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { error: dbError } = await supabase
      .from('leads')
      .insert({
        name: leadName,
        email,
        phone,
        postcode,
        avg_quarterly_bill,
        purchase_timeline,
        custom_fields: customFields,
      })

    if (dbError) {
      console.error('DB insert error:', dbError)
      throw new Error('Failed to save lead: ' + dbError.message)
    }

    // ── Email notification ──────────────────────────────────────────────
    const deliveryEmail = Deno.env.get('DELIVERY_EMAIL')
    const resendApiKey  = Deno.env.get('RESEND_API_KEY')
    const fromEmail     = Deno.env.get('RESEND_FROM_EMAIL') ?? 'leads@bettersolarinstallers.com.au'

    if (deliveryEmail && resendApiKey) {
      const submittedAtStr = submitted_at ?? new Date().toISOString()
      const submittedDisplay = (() => {
        try { return new Date(submittedAtStr).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }) }
        catch { return submittedAtStr }
      })()

      const htmlEmail = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>New Solar Lead</title>
  <style>
    body{margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif}
    .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.10)}
    .hd{background:linear-gradient(135deg,#0d3d5e 0%,#257bab 100%);padding:32px;text-align:center}
    .hd h1{color:#fff;margin:0 0 6px;font-size:22px;letter-spacing:.02em}
    .hd p{color:rgba(255,255,255,.75);margin:0;font-size:13px}
    .bd{padding:28px 32px}
    .row{display:flex;align-items:baseline;padding:11px 0;border-bottom:1px solid #f0f0f0}
    .row:last-child{border-bottom:none}
    .lbl{font-size:11px;font-weight:700;color:#8898aa;text-transform:uppercase;letter-spacing:.07em;width:150px;flex-shrink:0}
    .val{font-size:15px;color:#1a1a2e;font-weight:500;word-break:break-word}
    .val a{color:#257bab;text-decoration:none}
    .ft{background:#f0f4f8;padding:14px 32px;text-align:center;font-size:11px;color:#aaa}
    pre{margin:0;font-size:12px;white-space:pre-wrap;font-family:monospace}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hd">
      <h1>&#9728;&#65039; New Solar Lead</h1>
      <p>Better Solar Installers Australia</p>
    </div>
    <div class="bd">
      <div class="row"><span class="lbl">Name</span><span class="val">${leadName ?? '—'}</span></div>
      <div class="row"><span class="lbl">Email</span><span class="val"><a href="mailto:${email}">${email ?? '—'}</a></span></div>
      <div class="row"><span class="lbl">Phone</span><span class="val"><a href="tel:${phone}">${phone ?? '—'}</a></span></div>
      <div class="row"><span class="lbl">Postcode</span><span class="val">${postcode ?? '—'}</span></div>
      <div class="row"><span class="lbl">Avg Quarterly Bill</span><span class="val">${avg_quarterly_bill ?? '—'}</span></div>
      <div class="row"><span class="lbl">Purchase Timeline</span><span class="val">${purchase_timeline ?? '—'}</span></div>
      <div class="row"><span class="lbl">Source</span><span class="val">${source ?? '—'}</span></div>
      <div class="row"><span class="lbl">Homeowner</span><span class="val">${is_homeowner === true ? 'Yes' : is_homeowner === false ? 'No' : '—'}</span></div>
      <div class="row"><span class="lbl">Matched Buyer</span><span class="val">${matched_buyer ?? '—'}</span></div>
      <div class="row"><span class="lbl">Submitted At</span><span class="val">${submittedDisplay}</span></div>
      ${customFields ? `<div class="row"><span class="lbl">Custom Fields</span><span class="val"><pre>${customFields}</pre></span></div>` : ''}
    </div>
    <div class="ft">Better Solar Installers Australia &bull; bettersolarinstallers.com.au</div>
  </div>
</body></html>`

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: deliveryEmail,
          subject: `☀️ New Solar Lead – ${leadName ?? email} (${postcode ?? 'unknown postcode'})`,
          html: htmlEmail,
        }),
      })

      if (!emailRes.ok) {
        // Log the error but don't fail the request – the lead is already saved
        const errText = await emailRes.text()
        console.error('Resend email error:', errText)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    console.error('submit-lead error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
