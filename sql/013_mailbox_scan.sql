-- ============================================================
-- 013_mailbox_scan.sql
-- "Scan my email" invoice intake: the restaurant connects its
-- mailbox (Gmail first) and mise imports supplier invoice
-- attachments automatically — the fix for lost paper receipts when
-- the supplier emailed a copy.
--
-- restaurant_settings gains the mailbox connection: provider,
-- address, the OAuth refresh token (AES-256-GCM encrypted with
-- lib/token-crypto, same as Clover), and scan bookkeeping.
-- invoice_files gains a content hash so the scanner can skip
-- duplicates BEFORE spending an AI parse on them.
--
-- Run in the Supabase SQL editor. Until this runs, the email
-- routes report "migration needed" and nothing else changes.
-- ============================================================

alter table public.restaurant_settings
  add column if not exists mailbox_provider text,
  add column if not exists mailbox_email text,
  add column if not exists mailbox_token_enc text,
  add column if not exists mailbox_connected_at timestamptz,
  add column if not exists mailbox_last_scan_at timestamptz;

alter table public.invoice_files
  add column if not exists content_sha256 text;

create index if not exists idx_invoice_files_content_sha
  on public.invoice_files (restaurant_id, content_sha256);

comment on column public.restaurant_settings.mailbox_token_enc is
  'AES-256-GCM encrypted JSON pack holding the mailbox OAuth refresh token. Decrypted only server-side with TOKEN_ENCRYPTION_KEY.';
