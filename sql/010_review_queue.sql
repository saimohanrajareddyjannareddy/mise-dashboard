-- ============================================================
-- 010_review_queue.sql
-- Human review queue for invoice extractions.
--
-- Adds a review state to invoice_headers. Default 'approved' keeps
-- every existing row and every other ingestion path (RD scraper,
-- email ingest, n8n) behaving exactly as before. Only invoices whose
-- extraction fails a reconciliation check at save time (line items
-- don't add up to the stated total, qty x price != line total,
-- missing vendor/date) are inserted as 'needs_review' and surface
-- on the dashboard Review page for a human approve/fix.
--
-- Run in the Supabase SQL editor. The app degrades gracefully until
-- this runs: uploads fall back to inserting without the review
-- fields, and the Review page shows a "setup pending" notice.
-- ============================================================

alter table public.invoice_headers
  add column if not exists review_status text not null default 'approved',
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

do $$
begin
  alter table public.invoice_headers
    add constraint invoice_headers_review_status_check
    check (review_status in ('approved', 'needs_review'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_invoice_headers_review_queue
  on public.invoice_headers (restaurant_id, review_status);

-- The Review page's Approve action updates the header from the
-- client. Allow members to update headers of their own restaurants
-- (same membership model as the rest of the app). If an equivalent
-- policy already exists under another name this is a no-op in
-- effect: permissive policies with the same condition OR together.
drop policy if exists "members_update_own_invoice_headers" on public.invoice_headers;
create policy "members_update_own_invoice_headers"
  on public.invoice_headers
  for update
  using (
    exists (
      select 1 from public.user_restaurants ur
      where ur.restaurant_id = invoice_headers.restaurant_id
        and ur.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_restaurants ur
      where ur.restaurant_id = invoice_headers.restaurant_id
        and ur.user_id = auth.uid()
    )
  );
