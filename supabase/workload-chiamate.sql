-- supabase/workload-chiamate.sql
--
-- Le chiamate entrano nel "Carico di lavoro" (applicato su Supabase il 20/10/2026).
--
-- Cosa cambia
--   * zoho_daily_workload: due colonne nuove, ore_chiamate e chiamate_gestite.
--   * workload_settings: due righe nel gruppo "Chiamate" (visibili nella tabella dei
--     parametri della pagina): durata reale, senza stime, e tetto per singola chiamata.
--   * recompute_daily_workload: le chiamate diventano intervalli di tempo reali
--     (inizio = Call_Start_Time, fine = inizio + durata, massimo chiamata_cap_sec) e
--     entrano nell'unione degli intervalli con chat, ticket e formazione: se una persona
--     e' al telefono e in chat nello stesso momento il tempo si conta una volta sola.
--
-- Cosa conta come "chiamata di lavoro"
--   solo chiamate CON RISPOSTA fatte o ricevute dagli interni con perimetro 'Assistenza'
--   (tabella call_extensions, vedi calls-setup.sql) e il cui nome e' in team_operatori.
--   Il receptionist digitale (800-802) e le chiamate senza risposta non contano.
--   I dati delle chiamate partono dal 15/09/2026.
--
-- Ordine dei lavori programmati: la sincronizzazione chiamate (05:36 UTC) deve girare
-- PRIMA del ricalcolo del carico (05:40 UTC): vedi cron-jobs.sql.
--
-- Rieseguibile: la parte sulla funzione si ferma da sola se e' gia' stata aggiornata.
-- Dopo averla eseguita, per ricalcolare lo storico:
--   select public.recompute_daily_workload(current_date - 90, current_date);

alter table public.zoho_daily_workload
  add column if not exists ore_chiamate numeric not null default 0,
  add column if not exists chiamate_gestite integer not null default 0;

insert into public.workload_settings (chiave, valore, valore_testo, gruppo, etichetta, descrizione, unita, ordine) values
 ('chiamate_registro', null, null, 'Chiamate', 'Durata delle chiamate con risposta',
  'Nessuna stima: si usa la durata reale registrata dal centralino in Zoho CRM. Contano solo le chiamate con risposta fatte o ricevute dagli interni del team assistenza; le chiamate gestite dal receptionist digitale e quelle senza risposta non contano. I dati partono dal 15/09/2026.',
  'registrata', 410),
 ('chiamata_cap_sec', 7200, null, 'Chiamate', 'Durata massima considerata per una chiamata',
  'Una chiamata più lunga di questo valore conta solo per questo valore. Evita di contare come lavoro chiamate rimaste aperte per errore.',
  'secondi', 420)
on conflict (chiave) do nothing;

-- Aggiornamento di recompute_daily_workload: sostituzioni mirate sul testo della funzione
-- esistente (restano invariati attributi, search_path, timeout e permessi).
do $do$
declare
  d text := pg_get_functiondef('public.recompute_daily_workload(date,date)'::regprocedure);
  nl text := E'\r\n';
  pats text[]; reps text[];
  i int;
begin
  if position('v_cap_call' in d) > 0 then
    raise notice 'recompute_daily_workload gia'' aggiornata: nessuna modifica';
    return;
  end if;
  pats := array[
    $q$  v_weekend    int  := coalesce($q$,
    $q$v_cap_sess := coalesce(v_cap_sess, 5400);$q$,
    $q$_wl_occ, _wl_occ_chat, _wl_occ_seg, _wl_conc;$q$,
    $q$  -- ===== INTERVALLI: tutte le attività insieme =====$q$,
    $q$select operatore, 'formazione', e_ms - duration_minutes * 60000::bigint, e_ms from _wl_form;$q$,
    $q$ore_ticket_stimate, ore_lavoro_equivalenti)$q$,
    $q$  keys as (select operatore, giorno from occ union select operatore, giorno from pres$q$,
    $q$union select operatore, giorno from tk union select operatore, giorno from fo)$q$,
    $q$round((coalesce(att.ore, 0) + coalesce(tk.ore, 0) + coalesce(fo.ore, 0))::numeric, 2)$q$,
    $q$  left join tk    on tk.operatore = k.operatore and tk.giorno = k.giorno$q$
  ];
  reps := array[
    $q$  v_cap_call   int  := (select valore from workload_settings where chiave = 'chiamata_cap_sec');$q$ || nl || $q$  v_weekend    int  := coalesce($q$,
    $q$v_cap_sess := coalesce(v_cap_sess, 5400);$q$ || nl || $q$  v_cap_call := coalesce(v_cap_call, 7200);$q$,
    $q$_wl_occ, _wl_occ_chat, _wl_occ_seg, _wl_conc, _wl_call;$q$,
    $q$  -- ===== CHIAMATE (durata reale registrata dal centralino, solo con risposta) =====$q$ || nl ||
    $q$  create temp table _wl_call on commit drop as$q$ || nl ||
    $q$  select lower(split_part(e.name, ' ', 1)) as operatore,$q$ || nl ||
    $q$         (extract(epoch from c.started_at) * 1000)::bigint as s_ms,$q$ || nl ||
    $q$         (extract(epoch from c.started_at) * 1000)::bigint + (least(c.duration_sec, v_cap_call) * 1000)::bigint as e_ms$q$ || nl ||
    $q$  from zoho_calls c$q$ || nl ||
    $q$  join call_extensions e on e.extension = c.extension$q$ || nl ||
    $q$  where e.perimetro = 'Assistenza' and c.outcome = 'Risposta' and c.duration_sec > 0$q$ || nl ||
    $q$    and (c.started_at at time zone 'Europe/Rome')::date between p_from and p_to$q$ || nl ||
    $q$    and lower(split_part(e.name, ' ', 1)) = any (v_team);$q$ || nl || nl ||
    $q$  -- ===== INTERVALLI: tutte le attività insieme =====$q$,
    $q$select operatore, 'formazione', e_ms - duration_minutes * 60000::bigint, e_ms from _wl_form$q$ || nl ||
    $q$  union all$q$ || nl ||
    $q$  select operatore, 'chiamata', s_ms, e_ms from _wl_call;$q$,
    $q$ore_ticket_stimate, ore_lavoro_equivalenti, ore_chiamate, chiamate_gestite)$q$,
    $q$  ca as (select operatore, (to_timestamp(s_ms / 1000.0) at time zone 'Europe/Rome')::date as giorno,$q$ || nl ||
    $q$                sum((e_ms - s_ms) / 3600000.0) as ore, count(*) as n from _wl_call group by 1, 2),$q$ || nl ||
    $q$  keys as (select operatore, giorno from occ union select operatore, giorno from pres$q$,
    $q$union select operatore, giorno from tk union select operatore, giorno from fo$q$ || nl ||
    $q$           union select operatore, giorno from ca)$q$,
    $q$round((coalesce(att.ore, 0) + coalesce(tk.ore, 0) + coalesce(fo.ore, 0) + coalesce(ca.ore, 0))::numeric, 2),$q$ || nl ||
    $q$         round(coalesce(ca.ore, 0)::numeric, 2), coalesce(ca.n, 0)$q$,
    $q$  left join tk    on tk.operatore = k.operatore and tk.giorno = k.giorno$q$ || nl ||
    $q$  left join ca    on ca.operatore = k.operatore and ca.giorno = k.giorno$q$
  ];
  for i in 1 .. array_length(pats, 1) loop
    if position(pats[i] in d) = 0 then
      raise exception 'punto % non trovato nella funzione: %', i, pats[i];
    end if;
    d := replace(d, pats[i], reps[i]);
  end loop;
  execute d;
  raise notice 'recompute_daily_workload aggiornata (% punti)', array_length(pats, 1);
end
$do$;
