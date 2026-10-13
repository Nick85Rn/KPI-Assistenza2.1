-- Valutazione automatica giornaliera delle chat (scheda "Qualità chat").
-- Gira alle 06:30 UTC (08:30 in Italia), dopo la sincronizzazione chat delle 05:10 UTC.
-- Guarda gli ultimi 3 giorni e valuta solo le chat non ancora valutate (max 40 per volta).
-- Già creato su Supabase come job "score-chats-daily"; per rimuoverlo:
--   select cron.unschedule('score-chats-daily');
select cron.schedule(
  'score-chats-daily',
  '30 6 * * *',
  $$select net.http_get(
      url := 'https://oqqqoedxzflnebjozhqu.supabase.co/functions/v1/score-chats?days=3&limit=40',
      timeout_milliseconds := 140000
  )$$
);
