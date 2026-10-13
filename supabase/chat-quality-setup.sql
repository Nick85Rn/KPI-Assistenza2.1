-- supabase/chat-quality-setup.sql
-- Scheda "Qualità chat" (Fase 1: vista di team, senza nomi).
-- Eseguire una volta nel SQL Editor di Supabase.
--
-- Punteggi 0-2 per dimensione: 2 = buono, 1 = migliorabile, 0 = critico.
-- La tabella non contiene trascrizioni né nomi di operatori: solo punteggi,
-- una nota sintetica e l'id della chat (per ritrovarla in Zoho SalesIQ).

create table if not exists public.chat_quality (
  chat_id        text primary key,
  created_time   timestamptz not null,
  tono           smallint not null check (tono between 0 and 2),
  comprensione   smallint not null check (comprensione between 0 and 2),
  correttezza    smallint not null check (correttezza between 0 and 2),
  chiusura       smallint not null check (chiusura between 0 and 2),
  esito          text not null check (esito in ('risolta','parziale','non_risolta','non_verificabile')),
  soddisfazione  text not null check (soddisfazione in ('alta','media','bassa')),
  nota           text,
  azione         text,
  source         text not null default 'ai' check (source in ('manual','ai')),
  model          text,
  scored_at      timestamptz not null default now()
);

create index if not exists chat_quality_created_idx on public.chat_quality (created_time);

alter table public.chat_quality enable row level security;

-- Lettura per gli utenti loggati in dashboard; scrittura solo da Edge Function
-- (service_role bypassa RLS).
drop policy if exists "chat_quality_read" on public.chat_quality;
create policy "chat_quality_read" on public.chat_quality
  for select to authenticated using (true);

-- Campione iniziale: 40 chat (14 ago - 12 ott 2026), valutate con la griglia.
insert into public.chat_quality
  (chat_id, created_time, tono, comprensione, correttezza, chiusura, esito, soddisfazione, nota, azione, source)
values
('143986000002809192', '2026-10-01 13:17:20+00', 1, 1, 2, 1, 'risolta', 'alta', 'Richiesta orari >23:45 non disponibile, "sollecitiamo" senza riferimento di tracciamento; poi ha tolto lui il mittente SMS (proattivo). Prime risposte secche ("orario di cosa?").', 'Registrare la richiesta come miglioria con ticket', 'manual'),
('143986000002628033', '2026-09-01 12:42:32+00', 2, 1, 2, 0, 'parziale', 'media', 'Errore 131053 diagnosticato "a intuito" (immagine) prima di verificare; passaggio tra due operatori; la chat termina senza esito chiaro.', 'Chiudere sempre con conferma esplicita dell''esito', 'manual'),
('143986000002722123', '2026-09-17 11:31:39+00', 2, 2, 1, 2, 'risolta', 'alta', 'Workaround iframe valido, ma non dice chiaramente che l''anteprima del link non è personalizzabile. Cliente ha atteso con avviso "45 minuti" in coda.', 'Rivedere il messaggio di attesa mostrato al cliente', 'manual'),
('143986000002802254', '2026-10-02 13:21:53+00', 2, 2, 2, 2, 'risolta', 'alta', 'Sessione AnyDesk difficile (permessi Mac), alternativa via link Zoho proposta con pazienza. Il cliente chiama per nome un operatore diverso dal saluto automatico.', '', 'manual'),
('143986000002526341', '2026-08-14 11:52:24+00', 2, 1, 2, 1, 'risolta', 'alta', 'Cliente dice di aver già ricevuto "no al pacchetto formazione marketing". Operatore chiede la ragione sociale ma non chiude il discorso Silver/formazione.', 'Proporre Silver / formazione livello 2 quando emerge il bisogno', 'manual'),
('143986000002655029', '2026-09-04 11:23:23+00', 2, 2, 1, 1, 'parziale', 'media', 'Formazione fissata bene, ma scontrini POS che non arrivano: rimandato "a lato Posby" senza escalation. Chiusura con formula standard.', 'Escalation integrazione POS; ticket', 'manual'),
('143986000002808213', '2026-10-01 14:31:42+00', 2, 2, 2, 2, 'risolta', 'alta', 'Onesto sui limiti del menu. Tono molto confidenziale: concorda che la grafica è "retrò/limitata" (rischio reputazione prodotto).', 'Linee guida su come parlare dei limiti prodotto', 'manual'),
('143986000002758062', '2026-09-23 13:02:23+00', 1, 1, 1, 0, 'parziale', 'media', '22.000 contatti da altro CRM: cliente aveva già aperto ticket senza esito, l''operatore non lo riconosce, non indaga la causa, non dà tempi. Sentiment DB negativo.', 'Escalation tecnica con causa; richiamare il ticket precedente', 'manual'),
('143986000002737011', '2026-09-21 07:46:33+00', 2, 2, 2, 2, 'risolta', 'alta', 'Ottima: domanda sullo storico del numero, spiega coexistence, rassicura sui template.', 'Usare come esempio positivo', 'manual'),
('143986000002638156', '2026-09-03 14:29:07+00', 2, 1, 2, 1, 'non_verificabile', 'media', 'Sequenza lunga di istruzioni a messaggi brevi; la chat finisce senza conferma del cliente.', 'Riepilogo finale + conferma', 'manual'),
('143986000002620075', '2026-08-31 10:52:57+00', 2, 2, 1, 2, 'risolta', 'alta', 'Consiglia di lasciare "Utility" su un messaggio chiaramente promozionale: rischio di ricategorizzazione Meta e costo maggiore.', 'Verificare policy e dare indicazione corretta ai colleghi', 'manual'),
('143986000002741017', '2026-09-21 08:49:16+00', 2, 2, 2, 2, 'risolta', 'alta', 'Problema centralino con numero estero risolto con insistenza; propone audio personalizzati. Cliente entusiasta. Il saluto automatico non corrisponde a chi ha risposto.', 'Esempio positivo', 'manual'),
('143986000002852066', '2026-10-09 13:59:20+00', 2, 2, 2, 2, 'risolta', 'alta', 'Rapida, chiede i riferimenti, sistema la bozza. Causa non spiegata.', '', 'manual'),
('143986000002804261', '2026-10-02 08:30:27+00', 2, 2, 2, 2, 'risolta', 'alta', 'Più problemi (Yealink, voce, template, deviazioni) gestiti in sequenza fino alla prova finale.', 'Esempio positivo', 'manual'),
('143986000002520349', '2026-08-14 14:05:04+00', 1, 2, 2, 2, 'risolta', 'alta', 'Risposte corrette ma molto secche e a tratti criptiche.', '', 'manual'),
('143986000002703023', '2026-09-11 13:22:02+00', 2, 2, 1, 2, 'risolta', 'alta', 'Costi e processo API chiari. Poi afferma che i messaggi inviati dall''app WhatsApp sarebbero a pagamento: molto probabilmente impreciso.', 'Verificare e correggere il testo in KB', 'manual'),
('143986000002607142', '2026-08-31 15:19:01+00', 1, 2, 2, 1, 'risolta', 'alta', 'Dice onestamente che la logica richiesta non si può fare e propone alternativa. Registro informale ("emmm"); "lo proponiamo" senza ticket.', 'Registrare miglioria', 'manual'),
('143986000002852058', '2026-10-09 11:31:43+00', 1, 2, 2, 1, 'risolta', 'media', 'Spiegazione corretta (Zucchetti non gestisce ingredienti). Non riconosce l''impatto avuto dalla sincronizzazione; tono asciutto.', 'Avviso al cliente prima della sync', 'manual'),
('143986000002805236', '2026-10-02 08:18:55+00', 0, 1, 1, 0, 'parziale', 'bassa', 'Il cliente si è trovato un ospite non avvisato. Nessuna empatia né scuse; causa del mancato invio non spiegata; nessuna escalation. Sentiment DB negativo.', 'Formazione su gestione reclami; indagare consegna messaggi', 'manual'),
('143986000002856043', '2026-10-09 08:59:23+00', 2, 2, 2, 2, 'risolta', 'alta', 'Diagnosi ordinata, numero errato individuato e corretto. Da capire come il numero sbagliato sia arrivato al cliente.', 'Verifica interna sul processo di attivazione', 'manual'),
('143986000002636087', '2026-09-02 15:39:12+00', 2, 2, 2, 2, 'risolta', 'alta', 'Corretta e completa.', '', 'manual'),
('143986000002796013', '2026-09-25 13:56:32+00', 1, 1, 1, 0, 'parziale', 'media', 'Non risponde su cosa fa Bussola e non offre la videochiamata richiesta: possibile lead non gestito.', 'Passare a commerciale/formazione', 'manual'),
('143986000002546008', '2026-08-20 11:56:35+00', 2, 2, 1, 2, 'risolta', 'alta', 'Spiegazione chiara, ma prima formula la regola ("ogni 3 visite, anno solare") e poi la corregge. Manca un manuale sulla logica delle fiammelle.', 'Creare scheda KB sulle fiammelle', 'manual'),
('143986000002656013', '2026-09-04 09:14:30+00', 2, 2, 2, 2, 'risolta', 'media', 'Diagnosi esatta (anagrafica ≠ tessera fidelity) e rimedio manuale.', '', 'manual'),
('143986000002638056', '2026-09-02 08:57:38+00', 2, 2, 2, 2, 'risolta', 'media', 'Onesto sui limiti (solo ChatGPT per risposte alle recensioni). Cliente deluso ma informato.', 'Registrare richiesta Claude', 'manual'),
('143986000002652020', '2026-09-04 09:12:55+00', 1, 2, 1, 1, 'parziale', 'media', 'Wildcard @@telefonolocale@@ che non compare nella mail non viene approfondita come possibile bug; suggerisce AI esterna per HTML.', 'Verificare il bug wildcard', 'manual'),
('143986000002802276', '2026-10-02 13:37:11+00', 2, 2, 2, 2, 'risolta', 'alta', 'Tre saluti automatici in poche righe (passaggi tra operatori): per il cliente confusionario.', 'Ridurre passaggi', 'manual'),
('143986000002716110', '2026-09-18 09:28:13+00', 2, 2, 2, 2, 'risolta', 'alta', 'Alternative corrette, raccoglie la richiesta di miglioria (esclusione per data).', 'Esempio positivo', 'manual'),
('143986000002786006', '2026-09-25 11:46:44+00', 2, 2, 2, 1, 'parziale', 'media', 'Corretto sull''attesa, ma "provo a sollecitare" senza esito noto; stima "paio di giorni" con richiesta già a 4.', 'Controllare che il sollecito sia partito', 'manual'),
('143986000002867011', '2026-10-12 09:02:14+00', 1, 0, 1, 0, 'non_risolta', 'bassa', 'Credenziali scritte in chiaro in chat; incomprensione sul problema (login intermittente iPad); causa (utente admin cancellato) detta in fondo e di seconda mano; nessuna conferma finale. Sentiment DB negativo.', 'Mai credenziali in chat; mascherare nei trascritti', 'manual'),
('143986000002802286', '2026-10-02 12:27:50+00', 2, 1, 2, 1, 'parziale', 'media', 'Export presenze senza straordinari: nessun workaround né miglioria registrata; risposte un po'' contraddittorie.', 'Registrare miglioria / indicare soluzione', 'manual'),
('143986000002523471', '2026-08-18 13:53:12+00', 2, 1, 2, 2, 'risolta', 'alta', 'Molto paziente. Prima istruzione confusa ("spunta su trip anziché Google").', '', 'manual'),
('143986000002858010', '2026-10-08 14:39:18+00', 2, 2, 2, 2, 'risolta', 'alta', 'Conosce le policy Google/TripAdvisor e offre alternative (tag fan/neutrale).', 'Esempio positivo', 'manual'),
('143986000002611089', '2026-08-31 07:20:26+00', 2, 2, 2, 1, 'risolta', 'alta', 'Lunga diagnosi con esito positivo. Il cliente cita un problema già segnalato in precedenza prima di Ferragosto: non c''è traccia di un follow-up.', 'Verificare la segnalazione precedente', 'manual'),
('143986000002529338', '2026-08-14 09:31:58+00', 2, 2, 2, 2, 'risolta', 'alta', 'Chat molto lunga (letti solo inizio e fine). Incolla una guida generata da AI con markdown grezzo.', 'Rielaborare i testi incollati', 'manual'),
('143986000002628086', '2026-09-02 11:44:18+00', 2, 2, 2, 2, 'risolta', 'alta', 'Proattivo: rimanda lui il template a Meta e indica l''ID giusto. Cliente scrive in maiuscolo.', 'Esempio positivo', 'manual'),
('143986000002809251', '2026-10-02 12:34:53+00', 2, 2, 2, 2, 'risolta', 'alta', 'Corretto (prenotazioni Google = assegnazione manuale). Prima risposta mancante nel trascritto.', '', 'manual'),
('143986000002764071', '2026-09-24 08:10:27+00', 2, 2, 2, 2, 'risolta', 'alta', 'Motivo 131026 spiegato bene. Messaggio dell''operatore etichettato "Cliente" nel trascritto.', '', 'manual'),
('143986000002570102', '2026-08-24 10:59:57+00', 2, 2, 2, 1, 'risolta', 'media', 'Cliente stressato (maiuscolo); operatore calmo e metodico. Causa non spiegata, nessuna prova finale.', '', 'manual'),
('143986000002809460', '2026-10-08 07:22:13+00', 2, 2, 2, 2, 'risolta', 'alta', 'Individua l''anomalia del nuovo form e la segnala; offre due strade.', 'Esempio positivo', 'manual')
on conflict (chat_id) do nothing;
