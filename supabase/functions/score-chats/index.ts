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

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";

const MODEL = Deno.env.get("SCORING_MODEL") ?? "claude-sonnet-5-5";
const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MAX_CHARS = 14000; // trascrizioni più lunghe: inizio + fine

const SYSTEM = `Sei un revisore della qualità dell'assistenza clienti di Pienissimo (software gestionale per ristoranti).
Ricevi la trascrizione di una chat tra un cliente e il team di assistenza ("Operatore:" = team, "Bot <Nome>: Ciao buongiorno!" è solo un saluto automatico e NON identifica chi ha risposto).
Valuta la CONVERSAZIONE nel suo complesso, non singole persone. Non nominare mai persone nelle note.

Punteggi 0-2 (2 = buono, 1 = migliorabile, 0 = critico):
- tono: accoglienza, cortesia, empatia (nei reclami serve riconoscere il disagio), registro adeguato.
- comprensione: ha capito il problema, ha fatto le domande giuste senza giri inutili.
- correttezza: risposte tecnicamente corrette, nessuna informazione dubbia o contraddittoria, nessuna credenziale scritta in chiaro.
- chiusura: esito confermato, promesse con tempi o ticket, escalation quando serve, opportunità (formazione, upsell) colte; 0 se la chat finisce aperta o con promesse vaghe.

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

async function score(text: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: shorten(text) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const raw = body.content?.[0]?.text ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("risposta senza JSON");
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
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Chat recenti con una conversazione vera (almeno ~900 caratteri), già valutate escluse.
  const { data: chats, error } = await supabaseAdmin
    .from("chat_faq")
    .select("chat_id, created_time, conversation_text")
    .gte("created_time", since)
    .not("conversation_text", "is", null)
    .order("created_time", { ascending: false })
    .limit(500);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const ids = (chats ?? []).map((c) => String(c.chat_id));
  const { data: done } = await supabaseAdmin.from("chat_quality").select("chat_id").in("chat_id", ids);
  const doneSet = new Set((done ?? []).map((d) => d.chat_id));
  const todo = (chats ?? [])
    .filter((c) => !doneSet.has(String(c.chat_id)) && (c.conversation_text ?? "").length > 900)
    .slice(0, limit);

  let ok = 0;
  const errors: string[] = [];
  for (const c of todo) {
    try {
      const s = await score(c.conversation_text);
      const { error: upErr } = await supabaseAdmin.from("chat_quality").upsert({
        chat_id: String(c.chat_id),
        created_time: c.created_time,
        ...s,
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

  return new Response(
    JSON.stringify({ scored: ok, candidates: todo.length, errors: errors.slice(0, 5) }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
