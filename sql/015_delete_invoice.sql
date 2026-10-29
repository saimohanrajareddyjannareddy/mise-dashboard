-- ============================================================
-- 015_delete_invoice.sql
-- Delete a saved invoice from its detail page.
--
-- Same pattern as deny_invoice (sql/014): there is no DELETE
-- policy for members on invoice_headers / invoice_lines, so the
-- Delete button calls this SECURITY DEFINER RPC, which checks
-- the caller is a member of the restaurant, then deletes.
--
-- What gets deleted: the invoice's line items and its header —
-- the invoice leaves the books entirely (spend, food cost,
-- price tracker and vendor totals all recompute without it).
--
-- What is deliberately KEPT: the invoice_files row. For
-- email-scanned invoices it is the dedupe tombstone (Gmail
-- message id + content SHA-256), so a deleted invoice is never
-- silently re-imported by the next mailbox scan.
--
-- Run in the Supabase SQL editor. Until this runs, the Delete
-- button shows a notice naming this file.
-- ============================================================

create or replace function public.delete_invoice(
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
