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

/** true se l'utente loggato può vedere la vista per collaboratore. */
export async function canViewOperatorQuality() {
  const { data, error } = await supabase.rpc("quality_viewer_ok");
  if (error) return false; // funzione non ancora creata: vista nascosta
  return data === true;
}

/** Valutazioni con operatore (solo per utenti in quality_viewers). */
export async function getChatQualityByOperator(from, to) {
  const { data, error } = await supabase.rpc("get_chat_quality_by_operator", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data ?? [];
}
