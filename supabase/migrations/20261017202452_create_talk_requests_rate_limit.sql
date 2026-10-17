/*
# Rate-limit table for the talk Edge Function

1. New Tables
- `talk_requests`
  - `id` (uuid, primary key, auto-generated)
  - `ip` (text, not null) — hashed client IP from x-forwarded-for
  - `created_at` (timestamptz, not null, default now())
  - Index on (ip, created_at) for fast per-IP window counts.
2. Security
- RLS enabled; no policies added on purpose. Only the talk Edge Function touches this
  table with the service role (which bypasses RLS). anon/authenticated get no access,
  so visitors can never read or write rate-limit rows through the Data API.
3. Notes
- One row per chat request. The function counts rows in the last minute and last day
  per IP and deletes rows older than a day to keep the table small.
*/

CREATE TABLE IF NOT EXISTS talk_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talk_requests_ip_created_idx ON talk_requests (ip, created_at);

ALTER TABLE talk_requests ENABLE ROW LEVEL SECURITY;
