// src/hooks/useDashboardData.js
// Hook unificato: dato un periodo, restituisce TUTTI i dati della dashboard.
// Gestisce loading, error, e refresh manuale tramite refresh().
// 
// Opzione `extras`: per le pagine che hanno bisogno di dati aggiuntivi
// (heatmap, top visitors, ecc.) — caricati solo per il periodo corrente.

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getTicketKpis,
  getChatKpis,
  getFormazioneKpis,
  getLastSyncByPart,
  getChatHeatmap,
  getTopVisitors,
} from "../api/zohoData";

/**
 * @param {Object} params
 * @param {Date}   params.start, params.end       - periodo corrente
 * @param {Date}   params.prevStart, params.prevEnd - periodo precedente
 * @param {Date}   params.yoyStart, params.yoyEnd   - stesso periodo anno scorso
 * @param {Object} params.extras                  - flags per caricare dati extra
 * @param {bool}   params.extras.heatmap          - carica heatmap chat 7x24
 * @param {bool}   params.extras.topVisitors      - carica top 10 visitatori
 */
export function useDashboardData({
  start, end, prevStart, prevEnd, yoyStart, yoyEnd,
  extras = {},
}) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    current: null,
    previous: null,
    yoy: null,
    lastSync: null,
    heatmap: null,        // matrice 7×24 + totalChats + maxCellChats
    topVisitors: null,    // array di {visitor, chats, last_chat}
  });

  const requestIdRef = useRef(0);

  // Estraggo le opzioni extras come stringa per il dependency array dell'effetto
  const extrasKey = JSON.stringify({
    heatmap: !!extras.heatmap,
    topVisitors: !!extras.topVisitors,
  });

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const cur = { start, end };
      const prev = (prevStart && prevEnd) ? { start: prevStart, end: prevEnd } : null;
      const yoy = (yoyStart && yoyEnd) ? { start: yoyStart, end: yoyEnd } : null;

      const wantHeatmap = !!extras.heatmap;
      const wantTopVisitors = !!extras.topVisitors;

      const [
        curAss, curSvi, curChat, curForm,
        prevAss, prevSvi, prevChat, prevForm,
        yoyAss, yoySvi, yoyChat, yoyForm,
        lastSync,
        heatmapData,
        topVisitorsData,
      ] = await Promise.all([
        getTicketKpis("assistenza", cur),
        getTicketKpis("sviluppo", cur),
        getChatKpis(cur),
        getFormazioneKpis(cur),
        prev ? getTicketKpis("assistenza", prev) : Promise.resolve(null),
        prev ? getTicketKpis("sviluppo", prev)   : Promise.resolve(null),
        prev ? getChatKpis(prev)                  : Promise.resolve(null),
        prev ? getFormazioneKpis(prev)            : Promise.resolve(null),
        yoy ? getTicketKpis("assistenza", yoy) : Promise.resolve(null),
        yoy ? getTicketKpis("sviluppo", yoy)   : Promise.resolve(null),
        yoy ? getChatKpis(yoy)                  : Promise.resolve(null),
        yoy ? getFormazioneKpis(yoy)            : Promise.resolve(null),
        getLastSyncByPart(),
        wantHeatmap ? getChatHeatmap(cur) : Promise.resolve(null),
        wantTopVisitors ? getTopVisitors(cur, 10) : Promise.resolve(null),
      ]);

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
        heatmap: heatmapData,
        topVisitors: topVisitorsData,
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
    extrasKey,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  return { ...state, refresh };
}
