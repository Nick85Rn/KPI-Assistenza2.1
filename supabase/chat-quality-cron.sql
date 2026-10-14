-- Valutazione automatica giornaliera delle chat (scheda "Qualità chat").
-- Gira alle 06:30, 06:35 e 06:40 UTC (08:30 in Italia d'estate), dopo la sincronizzazione chat
-- delle 05:44 UTC. Guarda gli ultimi 3 giorni e valuta solo le chat non ancora valutate
-- (max 40 per passata, tre passate per smaltire i giorni più pieni).
-- La funzione accetta solo l'header x-cron-secret: vedi supabase/functions-auth.sql.
-- L'elenco completo dei lavori programmati è in supabase/cron-jobs.sql.
-- Già creato su Supabase come job "score-chats-daily"; per rimuoverlo:
--   select cron.unschedule('score-chats-daily');
select cron.schedule(
  'score-chats-daily',
  '30,35,40 6 * * *',
  $$select net.http_get(
      url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/score-chats?days=3&limit=40',
      headers := jsonb_build_object('x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET')),
      timeout_milliseconds := 140000
  )$$
);
