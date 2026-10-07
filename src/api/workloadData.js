// src/api/workloadData.js
// Accesso ai dati della pagina "Carico di lavoro" (tabelle calcolate da
// recompute_daily_workload, vedi carico-lavoro-setup.sql).

import { supabase } from "../supabaseClient";

const PAGE = 1000;

// Supabase restituisce al massimo 1000 righe per richiesta: scarico a pagine.
async function fetchAll(buildQuery) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Parametri di calcolo (mostrati alla direzione e usati dal ricalcolo). */
export async function getWorkloadSettings() {
  const { data, error } = await supabase
    .from("workload_settings")
    .select("*")
    .order("ordine", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Una riga per operatore e giorno. from/to = "YYYY-MM-DD". */
export function getWorkloadDaily(from, to) {
  return fetchAll(() =>
    supabase
      .from("zoho_daily_workload")
      .select("*")
      .gte("giorno", from)
      .lte("giorno", to)
      .order("giorno", { ascending: true })
      .order("operatore", { ascending: true }),
  );
}

/** Secondi di occupazione per operatore, giorno e ora. */
export function getWorkloadHourly(from, to) {
  return fetchAll(() =>
    supabase
      .from("zoho_hourly_workload")
      .select("giorno, ora, operatore, sec_occupati")
      .gte("giorno", from)
      .lte("giorno", to)
      .order("giorno", { ascending: true })
      .order("ora", { ascending: true })
      .order("operatore", { ascending: true }),
  );
}

/** Chat ricevute / perse / attesa media (segnali di saturazione). */
export function getChatSaturation(from, to) {
  return fetchAll(() =>
    supabase
      .from("zoho_daily_chats")
      .select("date, department, operator, chats_count, chats_attended, chats_missed, avg_waiting_sec")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true }),
  );
}
