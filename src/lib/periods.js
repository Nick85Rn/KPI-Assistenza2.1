// src/lib/periods.js
// Gestisce i 3 periodi (settimana / mese / anno) e calcola le finestre di confronto:
//   - current   : il periodo selezionato
//   - previous  : il periodo immediatamente precedente (settimana scorsa, mese scorso, anno scorso)
//   - yoy       : "year over year" - stesso periodo dell'anno scorso (utile per stagionalità)

import {
  startOfISOWeek, endOfISOWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  subWeeks, subMonths, subYears,
  addWeeks, addMonths, addYears,
  format, getISOWeek, getYear,
} from "date-fns";
import { it } from "date-fns/locale";

/**
 * Tipi di periodo supportati.
 * Aggiungerne nuovi richiede aggiornare le 3 funzioni: bounds, prev, yoy.
 */
export const PERIOD_TYPES = ["week", "month", "year"];

/**
 * Restituisce le date di inizio e fine del periodo "ancora" (cioè quello
 * contenente la data passata).
 */
export function periodBounds(type, anchor = new Date()) {
  const d = anchor instanceof Date ? anchor : new Date(anchor);
  switch (type) {
    case "week":
      return { start: startOfISOWeek(d), end: endOfISOWeek(d) };
    case "month":
      return { start: startOfMonth(d), end: endOfMonth(d) };
    case "year":
      return { start: startOfYear(d), end: endOfYear(d) };
    default:
      throw new Error(`Tipo periodo non valido: ${type}`);
  }
}

/**
 * Periodo immediatamente precedente.
 * week -> settimana scorsa, month -> mese scorso, year -> anno scorso
 */
export function previousPeriod(type, anchor = new Date()) {
  const d = anchor instanceof Date ? anchor : new Date(anchor);
  let prevAnchor;
  switch (type) {
    case "week":  prevAnchor = subWeeks(d, 1);  break;
    case "month": prevAnchor = subMonths(d, 1); break;
    case "year":  prevAnchor = subYears(d, 1);  break;
    default: throw new Error(`Tipo periodo non valido: ${type}`);
  }
  return periodBounds(type, prevAnchor);
}

/**
 * Stesso periodo dell'anno scorso (year-over-year).
 * Utile per stagionalità: "questa settimana vs stessa settimana 2025".
 */
export function yoyPeriod(type, anchor = new Date()) {
  const d = anchor instanceof Date ? anchor : new Date(anchor);
  return periodBounds(type, subYears(d, 1));
}

/**
 * Spostamento avanti/indietro nel periodo (per i pulsanti < / > nel selettore).
 */
export function shiftAnchor(type, anchor, direction = -1) {
  const d = anchor instanceof Date ? anchor : new Date(anchor);
  switch (type) {
    case "week":  return direction < 0 ? subWeeks(d, 1)  : addWeeks(d, 1);
    case "month": return direction < 0 ? subMonths(d, 1) : addMonths(d, 1);
    case "year":  return direction < 0 ? subYears(d, 1)  : addYears(d, 1);
    default: throw new Error(`Tipo periodo non valido: ${type}`);
  }
}

/**
 * Etichetta human-readable del periodo per il selettore in alto.
 * Esempi:
 *   week  -> "Sett. 18 (27 Apr – 3 Mag 2026)"
 *   month -> "Aprile 2026"
 *   year  -> "2026"
 */
export function formatPeriodLabel(type, anchor = new Date()) {
  const d = anchor instanceof Date ? anchor : new Date(anchor);
  const { start, end } = periodBounds(type, d);
  switch (type) {
    case "week": {
      const wn = getISOWeek(start);
      const startStr = format(start, "d MMM", { locale: it });
      const endStr   = format(end,   "d MMM yyyy", { locale: it });
      return `Sett. ${wn} (${startStr} – ${endStr})`;
    }
    case "month":
      return format(start, "LLLL yyyy", { locale: it })
        .replace(/^./, (c) => c.toUpperCase());
    case "year":
      return String(getYear(start));
    default:
      return "";
  }
}

/**
 * Helper: converte un Date in stringa YYYY-MM-DD (per query Supabase su .gte/.lte).
 */
export function toYmd(d) {
  if (!(d instanceof Date)) d = new Date(d);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
