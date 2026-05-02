// src/hooks/useSyncStatus.js
// Gestisce l'invocazione delle 4 Edge Functions di sync Zoho.
// Espone uno stato per fonte: "idle" | "running" | "success" | "error"
// e una funzione runSync() che le lancia in cascata.

import { useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

// Le 4 fonti che possiamo sincronizzare. L'ordine conta: Desk e SalesIQ sono
// veloci, CRM è medio, SLA dipende da Desk.
const SOURCES = [
  { key: "desk",     label: "Ticket Desk",     fn: "zoho-sync-desk",     params: "" },
  { key: "salesiq",  label: "Chat SalesIQ",    fn: "zoho-sync-salesiq",  params: "" }, // sync incrementale
  { key: "crm",      label: "Formazione CRM",  fn: "zoho-sync-crm",      params: "" },
  { key: "desk_sla", label: "SLA Ticket",      fn: "zoho-sync-desk-sla", params: "?from=2026-01-01" },
];

const SUPABASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL)
  || "https://oqqqoedxzflnebjozhqu.supabase.co";

function buildEndpoint(source) {
  return `${SUPABASE_URL}/functions/v1/${source.fn}${source.params}`;
}

export function useSyncStatus() {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(SOURCES.map((s) => [s.key, { state: "idle", message: "" }])),
  );
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(null);

  const updateStatus = useCallback((key, state, message = "") => {
    setStatuses((prev) => ({ ...prev, [key]: { state, message } }));
  }, []);

  /**
   * Lancia le 4 sync in cascata (NON in parallelo: alcune dipendono dalla cache token,
   * e mantenere serialità riduce il rischio di rate limit Zoho).
   * Al termine, chiama onComplete() (di solito refresh() del useDashboardData).
   */
  const runSync = useCallback(async (onComplete) => {
    if (running) return;
    setRunning(true);
    setLastRunAt(new Date());

    // Reset stati a "running" tranne quelli ancora da partire (idle)
    setStatuses(Object.fromEntries(
      SOURCES.map((s) => [s.key, { state: "idle", message: "" }]),
    ));

    let anyError = false;

    for (const source of SOURCES) {
      updateStatus(source.key, "running", "Sincronizzazione in corso...");
      try {
        const res = await fetch(buildEndpoint(source), { method: "GET" });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || json.ok === false) {
          updateStatus(
            source.key,
            "error",
            json.error || `HTTP ${res.status}`,
          );
          anyError = true;
          // Continua comunque con le altre, una sync rotta non blocca le altre
          continue;
        }

        // Costruzione messaggio di successo human-readable
        let msg = "Completato";
        if (typeof json.total === "number") msg = `${json.total} record`;
        else if (typeof json.records_synced === "number") msg = `${json.records_synced} record`;
        else if (typeof json.synced_in_this_call === "number") {
          msg = `${json.synced_in_this_call} record (questa pagina)`;
        } else if (typeof json.total_unique_records === "number") {
          msg = `${json.total_unique_records} record`;
        } else if (typeof json.total_ok === "number") {
          msg = `${json.total_ok} ticket aggiornati`;
        }

        updateStatus(source.key, "success", msg);
      } catch (err) {
        updateStatus(source.key, "error", err?.message ?? String(err));
        anyError = true;
      }
    }

    setRunning(false);

    // Se almeno una sync è andata bene, ricarica i dati della dashboard
    if (typeof onComplete === "function") {
      try {
        await onComplete();
      } catch (e) {
        console.error("onComplete refresh error:", e);
      }
    }

    return { ok: !anyError };
  }, [running, updateStatus]);

  return {
    statuses,    // {desk: {state, message}, salesiq: {...}, crm: {...}, desk_sla: {...}}
    sources: SOURCES, // metadata per la UI (label, key)
    running,     // true se almeno una sync sta girando
    lastRunAt,   // timestamp ultimo click su Aggiorna
    runSync,     // function: runSync(onComplete?)
  };
}
