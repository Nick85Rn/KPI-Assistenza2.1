-- supabase/functions-auth.sql
--
-- Protezione delle Edge Function "interne" (sincronizzazioni Zoho, geocodifica,
-- IMAP, valutazione chat con AI). Prima erano richiamabili da chiunque conoscesse
-- l'indirizzo, con costi (AI) e consumo delle quote Zoho.
--
-- Come funziona
--   Ogni funzione accetta la chiamata solo se vale UNA di queste condizioni:
--     1. l'header  x-cron-secret  contiene il segreto CRON_SECRET (lavori programmati);
--     2. l'header  Authorization  contiene il token di un utente loggato la cui email
--        è in public.internal_allowed_users (pulsante "Sincronizza" del cruscotto).
--   Il segreto è generato dal database e conservato nel Vault di Supabase:
--   non è scritto in nessun file né in nessuna Edge Function.
--
-- Per autorizzare un altro utente del cruscotto:
--   insert into public.internal_allowed_users (email) values ('nome@pienissimo.pro');
--
-- Per cambiare il segreto (i cron lo leggono dal Vault a ogni esecuzione):
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'CRON_SECRET'),
--     encode(gen_random_bytes(32), 'hex'));

create table if not exists public.internal_allowed_users (email text primary key);
alter table public.internal_allowed_users enable row level security;
revoke all on public.internal_allowed_users from anon, authenticated;
insert into public.internal_allowed_users (email)
  select lower(email) from public.quality_viewers on conflict do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'CRON_SECRET') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'CRON_SECRET',
      'Segreto per chiamare le Edge Function dai lavori programmati');
  end if;
end $$;

create or replace function public.check_cron_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public, vault as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'CRON_SECRET' and decrypted_secret = p_secret
  );
$$;

create or replace function public.internal_user_allowed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.internal_allowed_users
                 where lower(email) = lower(coalesce(p_email, '')));
$$;

-- Solo le Edge Function (service_role) possono usarle
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
revoke execute on function public.internal_user_allowed(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;
grant execute on function public.internal_user_allowed(text) to service_role;

-- Lavori programmati: esempio di chiamata con il segreto
--   select net.http_get(
--     url := 'https://<progetto>.supabase.co/functions/v1/<funzione>',
--     headers := jsonb_build_object('x-cron-secret',
--       (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')),
--     timeout_milliseconds := 120000);
