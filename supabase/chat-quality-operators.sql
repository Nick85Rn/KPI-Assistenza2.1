-- supabase/chat-quality-operators.sql
-- Fase 2 della scheda "Qualità chat": vista per collaboratore, visibile solo
-- agli utenti elencati in quality_viewers.
-- Eseguire DOPO supabase/chat-quality-setup.sql, una volta, nel SQL Editor.

-- 1) Chat passate tra più colleghi: non contano nei punteggi individuali.
alter table public.chat_quality add column if not exists chat_condivisa boolean not null default false;

-- Le 4 chat del campione iniziale dove hanno lavorato più persone.
update public.chat_quality set chat_condivisa = true
where chat_id in ('143986000002628033', '143986000002636087', '143986000002802276', '143986000002529338');

-- 2) Chi può vedere la vista per collaboratore.
create table if not exists public.quality_viewers (email text primary key);
alter table public.quality_viewers enable row level security;  -- nessuna policy: solo le funzioni sotto la leggono

-- >>> INSERIRE QUI L'EMAIL CON CUI SI ACCEDE ALLA DASHBOARD <<<
-- insert into public.quality_viewers (email) values ('nome@dominio.it') on conflict do nothing;

create or replace function public.quality_viewer_ok()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.quality_viewers
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 3) Valutazioni con operatore, solo per chi è in quality_viewers.
create or replace function public.get_chat_quality_by_operator(p_from date, p_to date)
returns table (
  chat_id text, created_time timestamptz, operator text,
  tono smallint, comprensione smallint, correttezza smallint, chiusura smallint,
  esito text, soddisfazione text, nota text, azione text, chat_condivisa boolean
)
language sql stable security definer set search_path = public
as $$
  select q.chat_id, q.created_time, r.operator,
         q.tono, q.comprensione, q.correttezza, q.chiusura,
         q.esito, q.soddisfazione, q.nota, q.azione, q.chat_condivisa
  from public.chat_quality q
  join public.zoho_raw_chats r on r.chat_id::text = q.chat_id
  where public.quality_viewer_ok()
    and r.operator is not null
    and q.created_time >= p_from
    and q.created_time < (p_to + 1);
$$;

revoke all on function public.quality_viewer_ok() from public;
revoke all on function public.get_chat_quality_by_operator(date, date) from public;
grant execute on function public.quality_viewer_ok() to authenticated;
grant execute on function public.get_chat_quality_by_operator(date, date) to authenticated;
