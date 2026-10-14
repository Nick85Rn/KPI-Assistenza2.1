-- supabase/mail-automatiche.sql
--
-- Distingue le mail AUTOMATICHE (notifiche di sistema, feedback SalesIQ,
-- attivazioni generate dalla piattaforma...) dalle richieste vere dei clienti
-- nel reparto "Mail assistenza@", così i KPI non vengono gonfiati.
--
-- Un ticket è "automatico" solo se:
--   1) nessuno ha risposto da Zoho Desk (nessun messaggio in uscita), e
--   2) il primo messaggio in ingresso corrisponde a una regola della tabella
--      mail_auto_rules (mittente esatto oppure oggetto che inizia con...).
-- Le richieste vere rimaste senza risposta NON vengono escluse: devono restare
-- visibili nei numeri.
--
-- Per aggiungere una regola:
--   insert into mail_auto_rules(kind, pattern, note)
--   values ('sender', 'nome mittente', 'perché');         -- mittente (esatto, senza maiuscole)
--   values ('subject_regex', '^inizio oggetto', 'perché'); -- oggetto (espressione regolare)
-- poi:  select refresh_mail_automatic();   (si aggiorna comunque ogni mattina)

create table if not exists public.mail_auto_rules (
  id serial primary key,
  kind text not null check (kind in ('sender', 'subject_regex')),
  pattern text not null,
  note text,
  unique (kind, pattern)
);
alter table public.mail_auto_rules enable row level security;

insert into public.mail_auto_rules(kind, pattern, note) values
  ('sender', 'piattaforma', 'Attivazioni generate dalla piattaforma (Voice Pro, Mansionissimo...)'),
  ('sender', 'noreply', 'Mittenti no-reply'),
  ('sender', 'apple', 'Notifiche Apple Account'),
  ('sender', 'twilio', 'Notifiche Twilio'),
  ('sender', 'twilio notifications', 'Notifiche Twilio'),
  ('sender', 'anthropic, pbc', 'Ricevute Anthropic'),
  ('sender', 'elevenlabs', 'Notifiche ElevenLabs'),
  ('subject_regex', '^zoho salesiq', 'Feedback chat SalesIQ (Contento/Neutrale/Scontento)'),
  ('subject_regex', '^automatic message', 'Messaggi automatici (es. cliente cancellato)'),
  ('subject_regex', '^il tuo link sicuro a claude', 'Mail di accesso a Claude.ai'),
  ('subject_regex', '^severity_', 'Avvisi di sistema (feed validation)')
on conflict do nothing;

alter table public.zoho_raw_mail_assistenza
  add column if not exists is_automatic boolean not null default false;

create or replace function public.refresh_mail_automatic()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n integer;
begin
  update zoho_raw_mail_assistenza r
  set is_automatic = (
    r.threads_synced_at is not null
    and not exists (
      select 1 from zoho_ticket_threads o
      where o.dept = 'mail_assistenza' and o.ticket_id = r.ticket_id
        and o.direction = 'out')
    and (
      exists (
        select 1 from mail_auto_rules m
        where m.kind = 'subject_regex' and coalesce(r.subject, '') ~* m.pattern)
      or exists (
        select 1
        from mail_auto_rules m
        join lateral (
          select t.author_name
          from zoho_ticket_threads t
          where t.dept = 'mail_assistenza' and t.ticket_id = r.ticket_id
            and t.direction = 'in'
          order by t.created_time
          limit 1
        ) f on true
        where m.kind = 'sender' and lower(coalesce(f.author_name, '')) = lower(m.pattern))
    )
  )
  where r.is_automatic is distinct from (
    r.threads_synced_at is not null
    and not exists (
      select 1 from zoho_ticket_threads o
      where o.dept = 'mail_assistenza' and o.ticket_id = r.ticket_id
        and o.direction = 'out')
    and (
      exists (
        select 1 from mail_auto_rules m
        where m.kind = 'subject_regex' and coalesce(r.subject, '') ~* m.pattern)
      or exists (
        select 1
        from mail_auto_rules m
        join lateral (
          select t.author_name
          from zoho_ticket_threads t
          where t.dept = 'mail_assistenza' and t.ticket_id = r.ticket_id
            and t.direction = 'in'
          order by t.created_time
          limit 1
        ) f on true
        where m.kind = 'sender' and lower(coalesce(f.author_name, '')) = lower(m.pattern))
    )
  );
  get diagnostics n = row_count;
  return n;
end;
$fn$;
revoke all on function public.refresh_mail_automatic() from public, anon, authenticated;

-- Riepilogo mail automatiche per i ticket CREATI nel periodo.
create or replace function public.get_mail_automatic_summary(p_from date, p_to date)
returns table(
  automatiche int,
  automatiche_chiuse int,
  avg_resolution_sec_vere numeric
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where is_automatic)::int,
    count(*) filter (where is_automatic and closed_time is not null)::int,
    avg(resolution_sec) filter (where not is_automatic and closed_time is not null)
  from zoho_raw_mail_assistenza
  where created_time >= p_from and created_time < (p_to + 1);
$$;
revoke all on function public.get_mail_automatic_summary(date, date) from public, anon;
grant execute on function public.get_mail_automatic_summary(date, date) to authenticated;

-- get_dept_responders con opzione per escludere le mail automatiche
-- (vale solo per mail_assistenza; per gli altri reparti non cambia nulla).
drop function if exists public.get_dept_responders(text, date, date);

create or replace function public.get_dept_responders(
  p_dept text, p_from date, p_to date, p_exclude_auto boolean default false)
returns table(persona text, risposte int, ticket_gestiti int, ticket_chiusi int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_table text;
  v_filter text := '';
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
  if p_exclude_auto and p_dept = 'mail_assistenza' then
    v_filter := ' and not r.is_automatic';
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
        %5$s
      group by 1
    )
    select coalesce(a.persona, b.persona)::text,
           coalesce(a.risposte, 0)::int,
           coalesce(a.ticket_gestiti, 0)::int,
           coalesce(b.ticket_chiusi, 0)::int
    from risp a
    full join chiusi b on a.persona = b.persona
    order by 4 desc, 2 desc
  $q$, p_dept, p_from, p_to, v_table, v_filter);
end;
$fn$;

revoke all on function public.get_dept_responders(text, date, date, boolean) from public, anon;
grant execute on function public.get_dept_responders(text, date, date, boolean) to authenticated;
