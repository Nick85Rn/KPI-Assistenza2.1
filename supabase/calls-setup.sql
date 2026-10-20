-- supabase/calls-setup.sql
--
-- Scheda "Chiamate" del cruscotto: chiamate registrate dal centralino 3CX in
-- Zoho CRM (modulo Calls), sincronizzate da zoho-sync-calls.
--
-- Tabelle
--   call_extensions  mappa interno -> nome -> perimetro (Assistenza, Receptionist
--                    digitale, Commerciale, Altro reparto). Gli interni non presenti
--                    risultano "Da confermare". Per spostare qualcuno basta aggiornare
--                    la riga: la vista si aggiorna da sola, anche sulle chiamate passate.
--   zoho_calls       una riga per chiamata (id Zoho), con operatore (interno), direzione,
--                    esito, durata e cliente (azienda, persona, P.IVA, numero).
--   v_zoho_calls     zoho_calls + nome operatore + perimetro (e' quella letta dal cruscotto).
--
-- Accesso: solo utenti loggati in sola lettura (contengono numeri di telefono dei clienti).
-- Le scritture le fa solo la Edge Function (service_role).
-- Rieseguibile.

create table if not exists public.call_extensions (
  extension  text primary key,
  name       text not null,
  perimetro  text not null check (perimetro in
             ('Assistenza', 'Receptionist digitale', 'Commerciale', 'Altro reparto')),
  updated_at timestamptz not null default now()
);

insert into public.call_extensions (extension, name, perimetro) values
  ('200', 'Admin User', 'Altro reparto'),
  ('201', 'Nicola Pellicioni', 'Assistenza'),
  ('202', 'Emanuele Rosti', 'Assistenza'),
  ('203', 'Filippo Rossi', 'Assistenza'),
  ('205', 'Michele Bozzelli', 'Altro reparto'),
  ('209', 'Marco Ganzerli', 'Altro reparto'),
  ('212', 'Carmen Troiano', 'Commerciale'),
  ('214', 'Vito Annese', 'Altro reparto'),
  ('215', 'Nicol Pironi', 'Commerciale'),
  ('216', 'Lorenza Antonini', 'Altro reparto'),
  ('217', 'Soma Paul Cantoro', 'Altro reparto'),
  ('218', 'Elisa Migliano', 'Altro reparto'),
  ('220', 'Monia Prestia', 'Altro reparto'),
  ('221', 'Fabrizio Paganelli', 'Altro reparto'),
  ('222', 'Rebecca Marmo', 'Commerciale'),
  ('223', 'Matteo Distaso', 'Altro reparto'),
  ('225', 'Marta Fracassi', 'Altro reparto'),
  ('226', 'Nouha Magdich', 'Assistenza'),
  ('227', 'Margarita Giardi', 'Assistenza'),
  ('229', 'Filippo', 'Altro reparto'),
  ('230', 'Sara Del Sordo', 'Commerciale'),
  ('231', 'Valentina Iaccheri', 'Altro reparto'),
  ('232', 'Fatjon Sabria', 'Altro reparto'),
  ('233', 'Valentina Veronesi', 'Commerciale'),
  ('234', 'Federico Alessandrini', 'Altro reparto'),
  ('235', 'Giorgia Brill', 'Altro reparto'),
  ('236', 'Danila C', 'Altro reparto'),
  ('237', 'Sabatino Rinaldi', 'Altro reparto'),
  ('238', 'Giordano Bruno Luisè', 'Commerciale'),
  ('239', 'Daniela Miotti', 'Assistenza'),
  ('240', 'Martina Pizzoni', 'Commerciale'),
  ('241', 'Davide Stefani', 'Commerciale'),
  ('242', 'Barbara Giordani', 'Commerciale'),
  ('243', 'Marco Montesi', 'Commerciale'),
  ('244', 'Giulia Benedetti', 'Altro reparto'),
  ('245', 'Roberto Cevoli', 'Altro reparto'),
  ('246', 'Sara Succi', 'Altro reparto'),
  ('247', 'Jari Romano', 'Altro reparto'),
  ('248', 'Digital Specialist', 'Altro reparto'),
  ('249', 'Giulia Di Chicco', 'Altro reparto'),
  ('250', 'Giulia Dini', 'Altro reparto'),
  ('252', 'Flavia Pupillo', 'Altro reparto'),
  ('253', 'Luna Mercatali', 'Altro reparto'),
  ('254', 'Leandro Salfo', 'Assistenza'),
  ('299', 'Linknet Test', 'Altro reparto'),
  ('800', 'Receptionist digitale – Welcome', 'Receptionist digitale'),
  ('801', 'Receptionist digitale – Closed (fuori orario)', 'Receptionist digitale'),
  ('802', 'Receptionist digitale – Agent Busy (agenti occupati)', 'Receptionist digitale'),
  ('803', 'Coda Commerciale', 'Commerciale'),
  ('804', 'Coda Amministrazione', 'Altro reparto')
on conflict (extension) do update
  set name = excluded.name, perimetro = excluded.perimetro, updated_at = now();

create table if not exists public.zoho_calls (
  zoho_call_id   text primary key,
  started_at     timestamptz not null,
  direction      text not null check (direction in ('Entrata', 'Uscita')),
  outcome        text not null check (outcome in ('Risposta', 'Senza risposta', 'Persa')),
  duration_sec   integer not null default 0,
  extension      text,                -- interno 3CX (o linea 800-809); null se non rilevabile
  customer       text not null,       -- ragione sociale, altrimenti nome del contatto
  contact_name   text,
  vat_number     text,                -- P.IVA come scritta dal centralino
  customer_phone text,
  record_type    text,                -- Contatto / Lead / Azienda / Trattativa / null
  zoho_who_id    text,
  zoho_owner     text,
  synced_at      timestamptz not null default now()
);
create index if not exists zoho_calls_started_idx on public.zoho_calls (started_at desc);
create index if not exists zoho_calls_extension_idx on public.zoho_calls (extension);

create or replace view public.v_zoho_calls with (security_invoker = true) as
select c.*,
       coalesce(e.name, case when c.extension is null then 'Interno non rilevabile'
                             else 'Interno ' || c.extension end)  as operator_name,
       coalesce(e.perimetro, 'Da confermare')                      as perimetro
from public.zoho_calls c
left join public.call_extensions e on e.extension = c.extension;

alter table public.call_extensions enable row level security;
alter table public.zoho_calls enable row level security;
drop policy if exists "lettura autenticati" on public.call_extensions;
create policy "lettura autenticati" on public.call_extensions for select to authenticated using (true);
drop policy if exists "lettura autenticati" on public.zoho_calls;
create policy "lettura autenticati" on public.zoho_calls for select to authenticated using (true);

revoke all on public.call_extensions, public.zoho_calls, public.v_zoho_calls from anon, authenticated;
grant select on public.call_extensions, public.zoho_calls, public.v_zoho_calls to authenticated;
