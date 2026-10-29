-- ============================================================
-- 012_clover_oauth.sql
-- Clover OAuth token storage.
--
-- Today a restaurant pastes a Clover API token into Settings and it
-- sits in restaurant_settings.clover_api_key as plaintext. OAuth
-- replaces that: the merchant approves access on Clover's own site,
-- the callback route exchanges the code server-side, and the access
-- token is stored AES-256-GCM-encrypted (lib/token-crypto.ts) in
-- clover_token_enc. The plaintext column stays for restaurants still
-- on manual tokens; the sync route prefers the OAuth token when one
-- exists and falls back to the manual key.
--
-- Run in the Supabase SQL editor. Until this runs, the OAuth routes
-- redirect back to Settings with a "migration needed" notice and
-- manual-token connections keep working exactly as before.
-- ============================================================

alter table public.restaurant_settings
  add column if not exists clover_token_enc text,
  add column if not exists clover_auth_method text not null default 'manual',
  add column if not exists clover_connected_at timestamptz;

do $$
begin
  alter table public.restaurant_settings
    add constraint restaurant_settings_clover_auth_method_check
    check (clover_auth_method in ('manual', 'oauth'));
exception
  when duplicate_object then null;
end $$;

comment on column public.restaurant_settings.clover_token_enc is
  'AES-256-GCM encrypted Clover OAuth access token (base64 iv||tag||ciphertext). Decrypted only server-side with TOKEN_ENCRYPTION_KEY.';
