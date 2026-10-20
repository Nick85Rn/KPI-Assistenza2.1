// src/api/callsData.js
// Accesso ai dati della pagina "Chiamate": la vista v_zoho_calls unisce le chiamate
// sincronizzate da Zoho CRM (zoho-sync-calls) con nome e reparto dell'interno
// (tabella call_extensions). Vedi supabase/calls-setup.sql.

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

/** Chiamate nel periodo. from/to = "YYYY-MM-DD" (giorni locali, estremi inclusi). */
export function getCalls(from, to) {
  const start = new Date(`${from}T00:00:00`).toISOString();
  const end = new Date(`${to}T23:59:59.999`).toISOString();
  return fetchAll(() =>
    supabase
      .from("v_zoho_calls")
      .select(
        "zoho_call_id, started_at, direction, outcome, duration_sec, extension, operator_name, perimetro, customer, contact_name, vat_number, customer_phone, record_type",
      )
      .gte("started_at", start)
      .lte("started_at", end)
      .order("started_at", { ascending: false })
      .order("zoho_call_id", { ascending: false }),
  );
}
