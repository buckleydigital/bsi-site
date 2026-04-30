-- Migration: create leads table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists public.leads (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  email               text        not null,
  phone               text,
  postcode            text,
  avg_quarterly_bill  text,
  purchase_timeline   text,
  custom_fields       text,       -- JSON string: source, is_homeowner, matched_buyer, submitted_at, etc.
  created_at          timestamptz not null default now()
);

-- Enable Row Level Security so anonymous users cannot read or write directly.
-- The Edge Function uses the service-role key which bypasses RLS automatically.
alter table public.leads enable row level security;

-- No permissive policies are added intentionally.
-- All access goes through the submit-lead Edge Function (service role).
