-- supabase/dept-responders.sql
--
-- Chi risponde e chi chiude i ticket di un reparto Zoho Desk (solo conteggi
-- per persona). Usata dalla dashboard nella sezione "Mail Assistenza".
--
-- "Chi chiude" è una STIMA: Zoho non dice chi ha premuto "chiudi", quindi il
-- ticket è attribuito a chi ha scritto l'ultima risposta (direction='out')
-- prima della chiusura. Due righe speciali:
--   - 'Chiuso senza risposta': nessuna risposta registrata in Zoho Desk
--   - 'Dati in aggiornamento': i messaggi del ticket non sono ancora stati letti
--
-- Richiede che zoho-sync-desk-threads sia aggiornato ogni giorno
-- (cron pg_cron 'zoho-sync-desk-threads-daily').
--
-- SECURITY DEFINER perché zoho_ticket_threads ha RLS senza policy: la
-- funzione restituisce solo nomi e conteggi, mai testi o email.

create or replace function public.get_dept_responders(p_dept text, p_from date, p_to date)
returns table(persona text, risposte int, ticket_gestiti int, ticket_chiusi int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_table text;
begin
  v_table := case p_dept
    when 'assistenza' then 'zoho_raw_assistenza'
    when 'sviluppo' then 'zoho_raw_sviluppo'
    when 'mail_assistenza' then 'zoho_raw_mail_assistenza'
    when 'segnalazioni_zucchetti' then 'zoho_raw_segnalazioni_zucchetti'
    when 'whatsapp_assistenza' then 'zoho_raw_whatsapp_assistenza'
    else null end;
  if v_table is null then
    raise exception 'reparto non valido: %', p_dept;
  end if;

  return query execute format($q$
    with risp as (
      select t.author_name as persona,
             count(*)::int as risposte,
             count(distinct t.ticket_id)::int as ticket_gestiti
      from zoho_ticket_threads t
      where t.dept = %1$L and t.direction = 'out' and t.author_name is not null
        and t.created_time >= %2$L::date and t.created_time < (%3$L::date + 1)
      group by t.author_name
    ),
    chiusi as (
      select coalesce(
               u.author_name,
               case when r.threads_synced_at is null then 'Dati in aggiornamento'
                    else 'Chiuso senza risposta' end
             ) as persona,
             count(*)::int as ticket_chiusi
      from %4$I r
      left join lateral (
        select t.author_name
        from zoho_ticket_threads t
        where t.ticket_id = r.ticket_id and t.dept = %1$L
          and t.direction = 'out' and t.author_name is not null
          and t.created_time <= r.closed_time + interval '5 minutes'
        order by t.created_time desc
        limit 1
      ) u on true
      where r.closed_time >= %2$L::date and r.closed_time < (%3$L::date + 1)
      group by 1
    )
    select coalesce(a.persona, b.persona)::text,
           coalesce(a.risposte, 0)::int,
           coalesce(a.ticket_gestiti, 0)::int,
           coalesce(b.ticket_chiusi, 0)::int
    from risp a
    full join chiusi b on a.persona = b.persona
    order by 4 desc, 2 desc
  $q$, p_dept, p_from, p_to, v_table);
end;
$fn$;

revoke all on function public.get_dept_responders(text, date, date) from public, anon;
grant execute on function public.get_dept_responders(text, date, date) to authenticated;
