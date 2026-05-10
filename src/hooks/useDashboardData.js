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
  getSviluppoDetails,
} from "../api/zohoData";

/**
 * @param {Object} params
 * @param {Object} params.extras - flags
 *   - heatmap, topVisitors, formazioneDetails, assistenzaDetails, sviluppoDetails
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
    sviluppoDetails: null,
  });

  const requestIdRef = useRef(0);

  const extrasKey = JSON.stringify({
    heatmap: !!extras.heatmap,
    topVisitors: !!extras.topVisitors,
    formazioneDetails: !!extras.formazioneDetails,
    assistenzaDetails: !!extras.assistenzaDetails,
    sviluppoDetails: !!extras.sviluppoDetails,
  });

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const cur = { start, end };
      const prev = (prevStart && prevEnd) ? { start: prevStart, end: prevEnd } : null;
      const yoy = (yoyStart && yoyEnd) ? { start: yoyStart, end: yoyEnd } : null;

      const [
        curAss, curSvi, curChat, curForm,
        prevAss, prevSvi, prevChat, prevForm,
        yoyAss, yoySvi, yoyChat, yoyForm,
        lastSync,
        heatmapData,
        topVisitorsData,
        formazioneDetailsData,
        assistenzaDetailsData,
        sviluppoDetailsData,
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
        extras.heatmap ? getChatHeatmap(cur) : Promise.resolve(null),
        extras.topVisitors ? getTopVisitors(cur, 10) : Promise.resolve(null),
        extras.formazioneDetails ? getFormazioneDetails(cur) : Promise.resolve(null),
        extras.assistenzaDetails ? getAssistenzaDetails(cur) : Promise.resolve(null),
        extras.sviluppoDetails ? getSviluppoDetails(cur) : Promise.resolve(null),
      ]);

      if (reqId !== requestIdRef.current) return;

      setState({
        loading: false,
        error: null,
        current: { assistenza: curAss, sviluppo: curSvi, chat: curChat, formazione: curForm },
        previous: prev ? { assistenza: prevAss, sviluppo: prevSvi, chat: prevChat, formazione: prevForm } : null,
        yoy: yoy ? { assistenza: yoyAss, sviluppo: yoySvi, chat: yoyChat, formazione: yoyForm } : null,
        lastSync,
        heatmap: heatmapData,
        topVisitors: topVisitorsData,
        formazioneDetails: formazioneDetailsData,
        assistenzaDetails: assistenzaDetailsData,
        sviluppoDetails: sviluppoDetailsData,
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
