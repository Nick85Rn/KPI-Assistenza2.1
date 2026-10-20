-- supabase/cron-jobs.sql
--
-- Tutti i lavori programmati (pg_cron) del progetto, come sono su Supabase
-- dal 14/10/2026. Rieseguibile: ogni job viene prima rimosso e poi ricreato.
-- Orari in UTC (in Italia: +1 ora d'inverno, +2 d'estate).
--
-- Le Edge Function "interne" accettano solo l'header x-cron-secret: il valore
-- viene letto dal Vault a ogni esecuzione (vedi supabase/functions-auth.sql),
-- quindi non è scritto in nessun file. Cambiando il segreto nel Vault, i job
-- continuano a funzionare senza toccarli.
--
-- Il dettaglio dello stato dei job:
--   select jobname, schedule, active from cron.job order by jobname;
--   select * from cron.job_run_details order by start_time desc limit 50;
--   select id, status_code, left(content, 200) from net._http_response order by id desc limit 20;
--
-- Dal 14/10/2026 le sincronizzazioni Zoho non girano più da GitHub Actions
-- (.github/workflows/daily-kpi-sync.yml è rimasto solo per i lanci manuali).

-- Pulizia dei job che ricreiamo qui sotto
select cron.unschedule(jobname)
from cron.job
where jobname in (
  'geocode-locali-every-5min', 'kpi-sync-contacts-daily', 'kpi-sync-crm-daily',
  'kpi-sync-calls-daily', 'kpi-sync-desk-daily', 'kpi-sync-desk-sla-daily', 'kpi-sync-open-tickets-daily',
  'kpi-sync-salesiq-daily', 'mail-automatiche-refresh-daily', 'score-chats-daily',
  'zoho-resolve-addresses-weekly', 'zoho-sync-desk-threads-daily', 'zoho-sync-locali-daily',
  'zoho-sync-locali-weekly-full', 'zoho-workload-recompute-daily'
);

-- 03:00 ogni giorno: locali (incrementale) / domenica 04:00: sincronizzazione completa
select cron.schedule('zoho-sync-locali-daily', '0 3 * * *', $$
  select net.http_post(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-locali',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET'))
  ) as request_id $$);

select cron.schedule('zoho-sync-locali-weekly-full', '0 4 * * 0', $$
  select net.http_post(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-locali?mode=full',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET'))
  ) as request_id $$);

-- domenica 05:00: risoluzione degli indirizzi dei locali
select cron.schedule('zoho-resolve-addresses-weekly', '0 5 * * 0', $$
  select net.http_post(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-locali?action=resolve-addresses&limit=200',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET'))
  ) as request_id $$);

-- ogni 5 minuti: geocodifica dei locali ancora senza coordinate
select cron.schedule('geocode-locali-every-5min', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/geocode-locali?limit=25',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 120000
  ) as request_id $$);

-- Sincronizzazioni giornaliere KPI (05:10-05:50 UTC), in sequenza
select cron.schedule('kpi-sync-desk-daily', '10 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-desk',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

select cron.schedule('kpi-sync-desk-sla-daily', '13 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-desk-sla',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

select cron.schedule('kpi-sync-crm-daily', '16 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-crm',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

select cron.schedule('kpi-sync-contacts-daily', '18 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-contacts',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

-- Chiamate del centralino 3CX registrate in Zoho CRM (ultimi 14 giorni): scheda "Chiamate".
-- Tabelle e vista in supabase/calls-setup.sql. Recupero storico: ?since=YYYY-MM-DD.
-- Deve girare PRIMA del ricalcolo del carico di lavoro (05:40), che usa le chiamate.
select cron.schedule('kpi-sync-calls-daily', '36 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-calls',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

-- Messaggi dei ticket (3 passate da 150 ticket) e ricalcolo del carico di lavoro
select cron.schedule('zoho-sync-desk-threads-daily', '20,25,30 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-desk-threads?dept=all&max=150',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 140000) $$);

select cron.schedule('zoho-workload-recompute-daily', '40 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-desk-threads?action=recompute&days=30',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 120000) $$);

select cron.schedule('kpi-sync-open-tickets-daily', '42 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-open-tickets',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

select cron.schedule('kpi-sync-salesiq-daily', '44 5 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/zoho-sync-salesiq',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 150000) $$);

-- Mail automatiche (funzione SQL, non serve il segreto)
select cron.schedule('mail-automatiche-refresh-daily', '50 5 * * *',
  $$select public.refresh_mail_automatic()$$);

-- Valutazione AI delle chat (3 passate da 40: 06:30, 06:35, 06:40 UTC)
select cron.schedule('score-chats-daily', '30,35,40 6 * * *', $$
  select net.http_get(
    url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/score-chats?days=3&limit=40',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
    timeout_milliseconds := 140000) $$);
