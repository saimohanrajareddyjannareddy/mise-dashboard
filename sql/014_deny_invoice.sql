-- ============================================================
-- 014_deny_invoice.sql
-- Deny (reject) an invoice from the review queue.
--
-- There is no DELETE policy for members on invoice_headers /
-- invoice_lines, so the Review page's Deny button calls this
-- SECURITY DEFINER RPC, following the same pattern as
-- register_invoice_vendor: check the caller is a member of the
-- restaurant, then delete.
--
-- What gets deleted: the invoice's line items and its header —
-- the invoice leaves the books entirely.
--
-- What is deliberately KEPT: the invoice_files row. For
-- email-scanned invoices it is the dedupe tombstone (Gmail message
-- id + content SHA-256), so a denied personal bill is never
-- re-imported by the next mailbox scan.
--
-- Run in the Supabase SQL editor. Until this runs, the Deny
-- button shows a notice naming this file; approvals keep working.
-- ============================================================

create or replace function public.deny_invoice(
  p_restaurant_id uuid,
  p_header_id     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Caller must belong to the restaurant.
  if not exists (
    select 1 from public.user_restaurants ur
    where ur.restaurant_id = p_restaurant_id
      and ur.user_id = auth.uid()
  ) then
    raise exception 'not a member of this restaurant';
  end if;

  -- The invoice must belong to that restaurant.
  if not exists (
    select 1 from public.invoice_headers h
    where h.id = p_header_id
      and h.restaurant_id = p_restaurant_id
  ) then
    raise exception 'invoice not found for this restaurant';
  end if;

  delete from public.invoice_lines where header_id = p_header_id;
  delete from public.invoice_headers where id = p_header_id;
end;
$$;
