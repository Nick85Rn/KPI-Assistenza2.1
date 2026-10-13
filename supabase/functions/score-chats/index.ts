// supabase/functions/score-chats/index.ts
//
// Valuta con Claude le chat di assistenza non ancora valutate e salva i
// punteggi in chat_quality (alimenta la scheda "Qualità chat").
//
// Richiede i secret: ANTHROPIC_API_KEY (obbligatorio), SCORING_MODEL (opzionale).
// Legge da chat_faq (chat_id, created_time, conversation_text).
// Uso: GET/POST .../functions/v1/score-chats?limit=20&days=14
//   limit = quante chat valutare per chiamata (default 20, max 40)
//   days  = quanto indietro guardare (default 14)
//   from  = in alternativa a days, data di partenza "YYYY-MM-DD" (recupero storico)
//   ids   = elenco di chat_id separati da virgola: le rivaluta anche se già valutate (calibrazione)
// Le chat già valutate vengono saltate: si può richiamare finché scored = 0.

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const MODEL = Deno.env.get("SCORING_MODEL") ?? "claude-sonnet-5-5";
const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MAX_CHARS = 14000; // trascrizioni più lunghe: inizio + fine

const SYSTEM = `Sei un revisore della qualità dell'assistenza clienti di Pienissimo (software gestionale per ristoranti).
Ricevi la trascrizione di una chat tra un cliente e il team di assistenza ("Operatore:" = team, "Bot <Nome>: Ciao buongiorno!" è solo un saluto automatico e NON identifica chi ha risposto).
Valuta la CONVERSAZIONE nel suo complesso, non singole persone. Non nominare mai persone nelle note.

Punteggi 0-2. PARTI SEMPRE DA 2 e scendi solo se nella conversazione c'è un difetto concreto e citabile. Un'assistenza normale, cortese e che risolve il problema prende 2 su tutto: non cercare il pelo nell'uovo e non abbassare "per prudenza".
- 2 = nessun difetto rilevante (è il voto atteso per la grande maggioranza delle chat).
- 1 = difetto reale ma non grave (es. risposta secca ad un cliente nervoso, una domanda inutile, informazione imprecisa poi corretta, promessa senza tempi).
- 0 = problema serio (scortesia, errore che danneggia il cliente, cliente ignorato, chat lasciata aperta senza alcun seguito).

Criteri:
- tono: cortesia e accoglienza. Il registro colloquiale e informale (es. "okok", frasi brevi) è normale in una chat e NON è un difetto. Serve empatia esplicita solo se il cliente è arrabbiato o in difficoltà.
- comprensione: ha capito il problema e risposto a quello che il cliente chiedeva.
- correttezza: informazioni tecnicamente giuste. Abbassa solo per errori o contraddizioni evidenti, non per mancanza di dettagli superflui. Credenziali scritte in chiaro = 0.
- chiusura: il cliente ha avuto la risposta o sa cosa succederà dopo. Una chat in cui il cliente ringrazia o dice che va bene è chiusa bene (2) anche senza formule di commiato. Abbassa solo se la richiesta resta senza esito o senza seguito.

esito: "risolta" | "parziale" | "non_risolta" | "non_verificabile" (giudicalo dalla conversazione, non dal flag di sistema).
soddisfazione stimata dal cliente: "alta" | "media" | "bassa".
nota: max 220 caratteri, cosa è successo di rilevante, senza nomi di persone, clienti o locali.
azione: max 120 caratteri, azione concreta suggerita; stringa vuota se nulla da fare.

Rispondi SOLO con un oggetto JSON:
{"tono":0-2,"comprensione":0-2,"correttezza":0-2,"chiusura":0-2,"esito":"...","soddisfazione":"...","nota":"...","azione":"..."}`;

const ESITI = ["risolta", "parziale", "non_risolta", "non_verificabile"];
const SODD = ["alta", "media", "bassa"];

function shorten(t: string): string {
  if (t.length <= MAX_CHARS) return t;
  const head = Math.floor(MAX_CHARS * 0.7);
  return t.slice(0, head) + "\n[...conversazione abbreviata...]\n" + t.slice(-(MAX_CHARS - head));
}

const clamp = (v: unknown) => Math.max(0, Math.min(2, Math.round(Number(v))));

async function scoreOnce(text: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [
        { role: "user", content: shorten(text) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const raw = body.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("risposta senza JSON: " + raw.slice(0, 80));
  const j = JSON.parse(m[0]);
  if (!ESITI.includes(j.esito) || !SODD.includes(j.soddisfazione)) throw new Error("valori non validi");
  return {
    tono: clamp(j.tono),
    comprensione: clamp(j.comprensione),
    correttezza: clamp(j.correttezza),
    chiusura: clamp(j.chiusura),
    esito: j.esito,
    soddisfazione: j.soddisfazione,
    nota: String(j.nota ?? "").slice(0, 300),
    azione: String(j.azione ?? "").slice(0, 200),
  };
}

async function score(text: string) {
  try {
    return await scoreOnce(text);
  } catch (_e) {
    return await scoreOnce(text); // un secondo tentativo
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY mancante" }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 40);
  const days = Number(url.searchParams.get("days") ?? 14);
  const from = url.searchParams.get("from");
  const since = from && /^\d{4}-\d{2}-\d{2}$/.test(from)
    ? `${from}T00:00:00Z`
    : new Date(Date.now() - days * 86400000).toISOString();

  const idsParam = url.searchParams.get("ids");
  let todo: { chat_id: unknown; created_time: string; conversation_text: string }[] = [];

  if (idsParam) {
    // Modalità calibrazione: rivaluta esattamente queste chat.
    const ids = idsParam.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40);
    const { data } = await supabaseAdmin
      .from("chat_faq").select("chat_id, created_time, conversation_text").in("chat_id", ids);
    todo = (data ?? []).filter((c) => (c.conversation_text ?? "").length > 0);
  } else {
    // 1) Elenco leggero (solo id e data) delle chat nel periodo, a pagine.
    const candidates: { chat_id: unknown; created_time: string }[] = [];
    for (let start = 0; start < 10000; start += 1000) {
      const { data, error } = await supabaseAdmin
        .from("chat_faq")
        .select("chat_id, created_time")
        .gte("created_time", since)
        .order("created_time", { ascending: false })
        .range(start, start + 999);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      candidates.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    // 2) Tolgo quelle già valutate.
    const done: { chat_id: string }[] = [];
    for (let start = 0; start < 20000; start += 1000) {
      const { data } = await supabaseAdmin
        .from("chat_quality").select("chat_id").gte("created_time", since).range(start, start + 999);
      done.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const doneSet = new Set(done.map((d) => d.chat_id));
    const pending = candidates.filter((c) => !doneSet.has(String(c.chat_id)));

    // 3) Scarico il testo a blocchi finché trovo abbastanza chat con conversazione vera
    //    (almeno ~900 caratteri: le altre sono saluti o chat perse e vengono saltate).
    for (let i = 0; i < pending.length && todo.length < limit; i += 50) {
      const ids = pending.slice(i, i + 50).map((c) => String(c.chat_id));
      const { data } = await supabaseAdmin
        .from("chat_faq").select("chat_id, created_time, conversation_text").in("chat_id", ids);
      for (const c of data ?? []) {
        if ((c.conversation_text ?? "").length > 900 && todo.length < limit) todo.push(c);
      }
    }

  }

  let ok = 0;
  const errors: string[] = [];

  async function handle(c: { chat_id: unknown; created_time: string; conversation_text: string }) {
    try {
      const s = await score(c.conversation_text);
      // Chat condivisa: più saluti automatici con nomi diversi = passaggio tra colleghi.
      const saluti = new Set(
        [...c.conversation_text.matchAll(/^Bot ([^:\n]+?): Ciao/gm)].map((m) => m[1].trim()),
      );
      const { error: upErr } = await supabaseAdmin.from("chat_quality").upsert({
        chat_id: String(c.chat_id),
        created_time: c.created_time,
        ...s,
        chat_condivisa: saluti.size > 1,
        source: "ai",
        model: MODEL,
        scored_at: new Date().toISOString(),
      });
      if (upErr) throw new Error(upErr.message);
      ok++;
    } catch (e) {
      errors.push(`${c.chat_id}: ${(e as Error).message}`);
    }
  }

  // 5 valutazioni in parallelo per restare nei tempi della funzione.
  const CONCURRENCY = 5;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(handle));
  }

  return new Response(
    JSON.stringify({ scored: ok, picked: todo.length, errors: errors.slice(0, 5) }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
