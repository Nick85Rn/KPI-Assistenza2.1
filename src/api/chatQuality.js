// src/api/chatQuality.js
// Dati della scheda "Qualità chat" (tabella chat_quality, vedi
// supabase/chat-quality-setup.sql). Vista di team: nessun nome di operatore.

import { supabase } from "../supabaseClient";

const PAGE = 1000;

/** Valutazioni delle chat create tra from e to ("YYYY-MM-DD", inclusi). */
export async function getChatQuality(from, to) {
  const out = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("chat_quality")
      .select("chat_id, created_time, tono, comprensione, correttezza, chiusura, esito, soddisfazione, nota, azione, source")
      .gte("created_time", `${from}T00:00:00`)
      .lte("created_time", `${to}T23:59:59`)
      .order("created_time", { ascending: true })
      .range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
