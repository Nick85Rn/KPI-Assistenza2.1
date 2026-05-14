// src/hooks/useSyncStatus.js
// Gestisce lo stato della sincronizzazione completa con Zoho.
// Chiama 5 Edge Functions in sequenza:
//   1. zoho-sync-desk          (ticket Assistenza + Sviluppo)
//   2. zoho-sync-salesiq       (chat + heatmap)
//   3. zoho-sync-crm           (formazioni)
//   4. zoho-sync-desk-sla      (SLA dei ticket)
//   5. zoho-sync-open-tickets  (backlog real-time)

import { useState, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SYNC_SOURCES = [
  { key: "desk",          label: "Ticket",        endpoint: "zoho-sync-desk" },
  { key: "salesiq",       label: "Chat",          endpoint: "zoho-sync-salesiq" },
  { key: "crm",           label: "Formazione",    endpoint: "zoho-sync-crm" },
  { key: "desk-sla",      label: "SLA ticket",    endpoint: "zoho-sync-desk-sla" },
  { key: "open-tickets",  label: "Backlog vivo",  endpoint: "zoho-sync-open-tickets" },
];

export function useSyncStatus() {
  const [statuses, setStatuses] = useState({});
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState(null);

  const setOne = (key, patch) => {
    setStatuses((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  const runSync = useCallback(async (onComplete) => {
    if (running) return;
    setRunning(true);

    // Reset stato di tutti
    const initialStatuses = {};
    for (const s of SYNC_SOURCES) {
      initialStatuses[s.key] = { state: "pending", label: s.label };
    }
    setStatuses(initialStatuses);

    for (const source of SYNC_SOURCES) {
      setOne(source.key, { state: "running" });

      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/${source.endpoint}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
          },
        );

        const json = await res.json();

        if (json.ok === false || !res.ok) {
          setOne(source.key, {
            state: "error",
            message: json.error ?? `HTTP ${res.status}`,
          });
        } else {
          // Estrai record sincronizzati se disponibile
          let recordCount = null;
          if (typeof json.records_synced === "number") {
            recordCount = json.records_synced;
          } else if (json.assistenza?.total != null || json.sviluppo?.total != null) {
            // zoho-sync-open-tickets
            recordCount = (json.assistenza?.total ?? 0) + (json.sviluppo?.total ?? 0);
          }
          setOne(source.key, {
            state: "success",
            count: recordCount,
          });
        }
      } catch (err) {
        setOne(source.key, {
          state: "error",
          message: err?.message ?? String(err),
        });
      }
    }

    setRunning(false);
    setLastRunAt(new Date());

    // Notifica al frontend di ricaricare i dati
    if (typeof onComplete === "function") {
      try { await onComplete(); } catch (e) { console.error(e); }
    }
  }, [running]);

  return {
    statuses,
    sources: SYNC_SOURCES,
    running,
    lastRunAt,
    runSync,
  };
}
