# Supabase Setup Guide – BSI Lead Pipeline

This document tells you **exactly** what to do inside Supabase so that leads land in your database and hit your inbox as a formatted email the moment they're submitted.

---

## Overview of what happens

```
Browser form → Supabase Edge Function (submit-lead)
                        │
                        ├─► INSERT into `leads` table
                        └─► Resend API → email to DELIVERY_EMAIL
```

---

## Step 1 – Create the `leads` table

1. Go to your Supabase dashboard → **SQL Editor** → **New query**
2. Paste and run the contents of `supabase/migrations/001_create_leads_table.sql`

The table has these columns:

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Auto-generated primary key |
| `name` | text | Full name |
| `email` | text | Email address |
| `phone` | text | Phone number |
| `postcode` | text | Postcode |
| `avg_quarterly_bill` | text | Selected bill range |
| `purchase_timeline` | text | Selected timeline |
| `custom_fields` | text | JSON string – contains `source`, `is_homeowner`, `matched_buyer`, `submitted_at`, and any other fields |
| `created_at` | timestamptz | Auto-set on insert |

Row Level Security is enabled with **no public policies** – all writes go through the Edge Function which uses the service-role key and bypasses RLS automatically.

---

## Step 2 – Get a free Resend account (for email)

Resend is Supabase's official email partner and has a free plan (3 000 emails/month).

1. Sign up at **https://resend.com** (takes 30 seconds)
2. **Add and verify your sending domain** (e.g. `bettersolarinstallers.com.au`) under Domains → Add Domain
   - Resend gives you DNS records to add to your domain host
   - If you don't want to set up a domain yet, Resend lets you send from `onboarding@resend.dev` on the free tier for testing
3. Under **API Keys** → Create API Key → copy it

---

## Step 3 – Set Edge Function secrets

You need to store three secrets. Do this via the Supabase CLI **or** the Dashboard.

### Option A – Supabase Dashboard (easiest)
Go to **Project Settings → Edge Functions → Manage secrets** and add:

| Secret name | Value |
|---|---|
| `DELIVERY_EMAIL` | The email address where lead notifications should be sent (e.g. `team@youragency.com.au`) |
| `RESEND_API_KEY` | Your Resend API key from Step 2 |
| `RESEND_FROM_EMAIL` | The verified sender address in Resend (e.g. `leads@bettersolarinstallers.com.au`) |

### Option B – Supabase CLI
```bash
supabase secrets set DELIVERY_EMAIL="team@youragency.com.au" \
                     RESEND_API_KEY="re_xxxxxxxxxxxx" \
                     RESEND_FROM_EMAIL="leads@bettersolarinstallers.com.au" \
  --project-ref ijclawqvwxszbevambvu
```

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase into every Edge Function – you do not need to set these.

---

## Step 4 – Deploy the Edge Function

Install the Supabase CLI if you haven't already:
```bash
npm install -g supabase
```

Then, from the root of this repository:
```bash
supabase functions deploy submit-lead --project-ref ijclawqvwxszbevambvu
```

That's it. The function will be live at:
```
https://ijclawqvwxszbevambvu.supabase.co/functions/v1/submit-lead
```

---

## Step 5 – Test it

You can test the Edge Function directly with `curl`:

```bash
curl -X POST https://ijclawqvwxszbevambvu.supabase.co/functions/v1/submit-lead \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY2xhd3F2d3hzemJldmFtYnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MTYxODYsImV4cCI6MjA5MzA5MjE4Nn0.5oZBdN0psuR6drNB7c34rcQZhH2TNuMmJhHdpViiThg" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "0412345678",
    "postcode": "4350",
    "avg_quarterly_bill": "$400-$600",
    "purchase_timeline": "Within 3 months",
    "source": "test",
    "is_homeowner": true,
    "matched_buyer": "YAGI - Independant Energy Consultant"
  }'
```

Expected response: `{"success":true}`

Then check:
- **Supabase → Table Editor → leads** – the row should be there
- Your `DELIVERY_EMAIL` inbox – the notification email should arrive within seconds

---

## What the email looks like

The email is a clean, branded HTML email with your BSI branding (dark blue gradient header) containing a table of all lead fields:

- Name, Email, Phone, Postcode
- Avg Quarterly Bill, Purchase Timeline
- Source page, Homeowner status, Matched Buyer
- Submission timestamp (AEST)

Subject line format: `☀️ New Solar Lead – Jane Smith (4350)`

---

## Viewing leads

Go to **Supabase Dashboard → Table Editor → leads** to see all submissions. You can also use the built-in **Supabase Studio** to filter, sort, and export as CSV.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `{"error":"Failed to save lead..."}` | Make sure you ran the SQL migration in Step 1 |
| No email arriving | Double-check `DELIVERY_EMAIL`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` secrets are set correctly in Step 3 |
| Email goes to spam | Verify your sending domain in Resend (Step 2) |
| `Function not found` | Run `supabase functions deploy submit-lead` again (Step 4) |
