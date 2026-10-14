-- supabase/security-hardening.sql
--
-- Storico e script rieseguibile degli interventi di sicurezza sul database.
-- Eseguito su Supabase (progetto oqqqoedxzflnebjozhqu) il 14/10/2026.
-- Si può rieseguire senza danni (sono tutte revoche/impostazioni idempotenti),
-- ad esempio su un ambiente nuovo o di test.
--
-- Prerequisito: supabase/functions-auth.sql (segreto dei lavori programmati
-- e utenti autorizzati alle Edge Function "interne").
--
-- INDICE
--   0. Utenti autorizzati al pulsante "Sincronizza"
--   1. Viste con dati interni: non più leggibili da anonimi/loggati generici
--   2. Funzioni recompute_*: richiamabili solo dal server (service_role)
--   3. Funzioni della scheda Qualità chat: non per gli anonimi
--   4. Permessi superflui sulle tabelle (TRUNCATE, scritture anonime)
--   5. search_path fisso sulle funzioni segnalate dall'advisor di Supabase
--   6. Verifiche
--
-- COSA RESTA VOLUTAMENTE PUBBLICO
--   - funzioni chat_availability, chat_is_festivo, registra_click_whatsapp
--     (le usano il widget e il portale per il pulsante WhatsApp e gli orari);
--   - lettura anonima di chatbot_settings e widget_settings (impostazioni del widget).
--
-- NON FATTO QUI (da pannello Supabase):
--   - Authentication > Sign In / Providers > Email > "Prevent use of leaked passwords"
--     (disponibile solo su alcuni piani).

-- ---------------------------------------------------------------------------
-- 0. Utenti autorizzati al pulsante "Sincronizza" del cruscotto
--    (la tabella è creata da functions-auth.sql; l'email deve coincidere con
--    quella con cui si accede al cruscotto)
-- ---------------------------------------------------------------------------
insert into public.internal_allowed_users (email)
values ('nicola.p@pienissimo.pro')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. Viste: contengono dati di chat e ticket, nessun frontend le legge.
--    Le Edge Function e i lavori programmati (service_role/postgres) le usano ancora.
-- ---------------------------------------------------------------------------
revoke select on public.vw_chats_fuori_orario from anon, authenticated;
revoke select on public.v_ticket_threads_pending from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Funzioni recompute_*: ricalcolano gli aggregati (operazioni pesanti).
--    Prima erano richiamabili da chiunque tramite /rest/v1/rpc/...
--    Restano usabili da service_role (Edge Function) e da postgres (cron, editor SQL).
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'recompute\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Scheda Qualità chat: le due funzioni controllano già l'email dell'utente
--    loggato; per gli anonimi non servono affatto.
-- ---------------------------------------------------------------------------
revoke execute on function public.get_chat_quality_by_operator(date, date) from public, anon;
revoke execute on function public.quality_viewer_ok() from public, anon;

-- ---------------------------------------------------------------------------
-- 4. Permessi sulle tabelle di public.
--    Tutte hanno la RLS attiva e nessuna policy di scrittura per gli anonimi,
--    quindi questa è igiene: TRUNCATE, in particolare, NON è fermato dalla RLS.
--    Le scritture degli utenti loggati (impostazioni, FAQ, regole) restano com'erano.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.relname);
    execute format('revoke insert, update, delete on public.%I from anon', r.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. search_path fisso (advisor "function_search_path_mutable").
--    "extensions" serve a match_faq_entries (estensione vector).
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'match_faq_entries', 'update_chat_faq_timestamp', 'pasqua', 'quality_render_chat',
        'quality_operators', 'classify_provenienza_locale', 'recompute_formazione_per_provenienza',
        'recompute_daily_whatsapp_assistenza', 'recompute_daily_dept_tickets',
        'recompute_daily_mail_assistenza', 'recompute_daily_segnalazioni_zucchetti',
        'recompute_assistenza_per_provenienza', 'get_assistenza_per_provenienza',
        'get_chatbot_funnel', 'get_chat_sessions', 'count_chat_sessions',
        'get_chat_session_detail', 'get_unanswered_questions', 'count_unanswered_questions')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Verifiche (devono dare: viste e recompute = anon false / auth false / service true)
-- ---------------------------------------------------------------------------
-- select 'vista' as tipo, c.relname as nome,
--        has_table_privilege('anon', c.oid, 'select') as anon,
--        has_table_privilege('authenticated', c.oid, 'select') as auth,
--        has_table_privilege('service_role', c.oid, 'select') as service
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname in ('vw_chats_fuori_orario', 'v_ticket_threads_pending')
-- union all
-- select 'funzione', p.proname,
--        has_function_privilege('anon', p.oid, 'execute'),
--        has_function_privilege('authenticated', p.oid, 'execute'),
--        has_function_privilege('service_role', p.oid, 'execute')
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and (p.proname like 'recompute\_%'
--        or p.proname in ('chat_availability', 'registra_click_whatsapp', 'chat_is_festivo'))
-- order by 1, 2;
--
-- Anche l'advisor di sicurezza di Supabase non deve più segnalare
-- "function_search_path_mutable" né funzioni anonime diverse dalle tre del widget.
