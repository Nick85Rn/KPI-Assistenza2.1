// src/hooks/useDashboardData.js
// Hook unificato: dato un periodo, restituisce TUTTI i dati della dashboard.

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getTicketKpis,
  getChatKpis,
  getFormazioneKpis,
  getLastSyncByPart,
  getChatHeatmap,
  getTopVisitors,
  getFormazioneDetails,
  getAssistenzaDetails,
} from "../api/zohoData";

/**
 * @param {Object} params
 * @param {Date}   params.start, params.end       - periodo corrente
 * @param {Date}   params.prevStart, params.prevEnd
 * @param {Date}   params.yoyStart, params.yoyEnd
 * @param {Object} params.extras                  - flags
 * @param {bool}   params.extras.heatmap
 * @param {bool}   params.extras.topVisitors
 * @param {bool}   params.extras.formazioneDetails
 * @param {bool}   params.extras.assistenzaDetails
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
    heatmap: null,
    topVisitors: null,
    formazioneDetails: null,
    assistenzaDetails: null,
  });

  const requestIdRef = useRef(0);

  const extrasKey = JSON.stringify({
    heatmap: !!extras.heatmap,
    topVisitors: !!extras.topVisitors,
    formazioneDetails: !!extras.formazioneDetails,
    assistenzaDetails: !!extras.assistenzaDetails,
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
      const wantFormazione = !!extras.formazioneDetails;
      const wantAssistenza = !!extras.assistenzaDetails;

      const [
        curAss, curSvi, curChat, curForm,
        prevAss, prevSvi, prevChat, prevForm,
        yoyAss, yoySvi, yoyChat, yoyForm,
        lastSync,
        heatmapData,
        topVisitorsData,
        formazioneDetailsData,
        assistenzaDetailsData,
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
        wantFormazione ? getFormazioneDetails(cur) : Promise.resolve(null),
        wantAssistenza ? getAssistenzaDetails(cur) : Promise.resolve(null),
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
        formazioneDetails: formazioneDetailsData,
        assistenzaDetails: assistenzaDetailsData,
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
