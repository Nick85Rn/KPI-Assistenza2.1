-- Valutazione qualita' chat: lettura delle trascrizioni complete da zoho_raw_chats.
-- Sostituisce la lettura da chat_faq, che e' un sottoinsieme (chat "pulite" per la
-- base di conoscenza, senza reclami/fatturazione/legale) e non si aggiorna da sola.
-- Gia' eseguito su Supabase il 14/10/2026.

create or replace function public.quality_render_chat(p_transcript jsonb)
returns text language sql immutable as $$
  select string_agg(
    case e->'sender'->>'type' when 'visitor' then 'Cliente: ' else 'Operatore: ' end
      || coalesce(nullif(e->'message'->>'text',''), '[allegato] ' || coalesce(e->'message'->>'comment','')),
    E'\n' order by (e->>'time')::numeric)
  from jsonb_array_elements(case when jsonb_typeof(p_transcript->'messages')='array' then p_transcript->'messages' else '[]'::jsonb end) e
  where e->'sender'->>'type' in ('visitor','operator')
    and (coalesce(e->'message'->>'text','') <> '' or e->>'type' = 'file');
$$;

-- Quanti operatori diversi hanno scritto davvero (il saluto automatico non conta).
create or replace function public.quality_operators(p_transcript jsonb)
returns int language sql immutable as $$
  select count(distinct e->'sender'->>'name')::int
  from jsonb_array_elements(case when jsonb_typeof(p_transcript->'messages')='array' then p_transcript->'messages' else '[]'::jsonb end) e
  where e->'sender'->>'type' = 'operator' and coalesce(e->'message'->>'text','') <> '';
$$;

-- Chat reali (cliente + operatore, testo minimo) non ancora valutate, dalla piu' recente.
create or replace function public.quality_pending_chats(p_since timestamptz, p_limit int)
returns table(chat_id text, created_time timestamptz, conversation_text text, operatori int)
language sql stable security definer set search_path = public as $$
  select r.chat_id::text, r.created_time, t.txt, t.ops
  from zoho_raw_chats r
  cross join lateral (select quality_render_chat(r.transcript) as txt, quality_operators(r.transcript) as ops) t
  where r.created_time >= p_since
    and jsonb_typeof(r.transcript->'messages') = 'array'
    and not exists (select 1 from chat_quality q where q.chat_id = r.chat_id::text)
    and t.ops >= 1
    and t.txt like '%Cliente:%'
    and length(t.txt) >= 450
  order by r.created_time desc
  limit p_limit;
$$;

-- Le stesse chat, scelte per id (calibrazione / rivalutazione).
create or replace function public.quality_chat_texts(p_ids text[])
returns table(chat_id text, created_time timestamptz, conversation_text text, operatori int)
language sql stable security definer set search_path = public as $$
  select r.chat_id::text, r.created_time, quality_render_chat(r.transcript), quality_operators(r.transcript)
  from zoho_raw_chats r where r.chat_id::text = any(p_ids);
$$;

-- Contengono testi con dati dei clienti: solo il servizio interno (service role).
revoke all on function public.quality_pending_chats(timestamptz, int) from public, anon, authenticated;
revoke all on function public.quality_chat_texts(text[]) from public, anon, authenticated;
grant execute on function public.quality_pending_chats(timestamptz, int) to service_role;
grant execute on function public.quality_chat_texts(text[]) to service_role;
