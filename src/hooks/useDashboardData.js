// src/hooks/useDashboardData.js
// Hook unificato: dato un periodo, restituisce TUTTI i dati della dashboard.
// Gestisce loading, error, e refresh manuale tramite refresh().

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getTicketKpis,
  getChatKpis,
  getFormazioneKpis,
  getLastSyncByPart,
} from "../api/zohoData";

/**
 * @param {Object} params
 * @param {Date} params.start - inizio periodo
 * @param {Date} params.end   - fine periodo
 * @param {Date} params.prevStart - inizio periodo precedente (per confronti)
 * @param {Date} params.prevEnd   - fine periodo precedente
 * @param {Date} params.yoyStart  - inizio stesso periodo anno scorso (stagionalità)
 * @param {Date} params.yoyEnd    - fine stesso periodo anno scorso
 */
export function useDashboardData({ start, end, prevStart, prevEnd, yoyStart, yoyEnd }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    current: null,   // dati periodo attuale
    previous: null,  // dati periodo precedente (per indicatori vs prec)
    yoy: null,       // dati stesso periodo anno scorso
    lastSync: null,  // info sync per fonte
  });

  // Per evitare race condition se l'utente cambia rapidamente periodo
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // Prepara le 3 finestre temporali
      const cur = { start, end };
      const prev = (prevStart && prevEnd) ? { start: prevStart, end: prevEnd } : null;
      const yoy = (yoyStart && yoyEnd) ? { start: yoyStart, end: yoyEnd } : null;

      // Lanciamo tutte le query in parallelo (Promise.all)
      const [
        curAss, curSvi, curChat, curForm,
        prevAss, prevSvi, prevChat, prevForm,
        yoyAss, yoySvi, yoyChat, yoyForm,
        lastSync,
      ] = await Promise.all([
        // Periodo corrente
        getTicketKpis("assistenza", cur),
        getTicketKpis("sviluppo", cur),
        getChatKpis(cur),
        getFormazioneKpis(cur),
        // Periodo precedente (oppure null se non richiesto)
        prev ? getTicketKpis("assistenza", prev) : Promise.resolve(null),
        prev ? getTicketKpis("sviluppo", prev)   : Promise.resolve(null),
        prev ? getChatKpis(prev)                  : Promise.resolve(null),
        prev ? getFormazioneKpis(prev)            : Promise.resolve(null),
        // Anno scorso stesso periodo
        yoy ? getTicketKpis("assistenza", yoy) : Promise.resolve(null),
        yoy ? getTicketKpis("sviluppo", yoy)   : Promise.resolve(null),
        yoy ? getChatKpis(yoy)                  : Promise.resolve(null),
        yoy ? getFormazioneKpis(yoy)            : Promise.resolve(null),
        // Stato sync
        getLastSyncByPart(),
      ]);

      // Se nel frattempo l'utente ha cambiato periodo, scartiamo il risultato
      if (reqId !== requestIdRef.current) return;

      setState({
        loading: false,
        error: null,
        current: {
          assistenza: curAss,
          sviluppo: curSvi,
          chat: curChat,
          formazione: curForm,
        },
        previous: prev ? {
          assistenza: prevAss,
          sviluppo: prevSvi,
          chat: prevChat,
          formazione: prevForm,
        } : null,
        yoy: yoy ? {
          assistenza: yoyAss,
          sviluppo: yoySvi,
          chat: yoyChat,
          formazione: yoyForm,
        } : null,
        lastSync,
      });
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      console.error("useDashboardData error:", err);
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.message ?? String(err),
      }));
    }
  }, [
    start?.getTime(), end?.getTime(),
    prevStart?.getTime(), prevEnd?.getTime(),
    yoyStart?.getTime(), yoyEnd?.getTime(),
  ]);

  // Carica all'avvio e quando cambia il periodo
  useEffect(() => {
    load();
  }, [load]);

  // Esposto al chiamante per "ricarica i dati senza cambiare periodo"
  // (utile dopo aver premuto il pulsante Aggiorna che lancia le sync)
  const refresh = useCallback(() => load(), [load]);

  return { ...state, refresh };
}
