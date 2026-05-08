// src/lib/periods.js
// Logica calcolo periodi temporali per la dashboard.
// Gestisce: day, week, month, year + confronti vs precedente e vs anno scorso.

import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  addDays, addWeeks, addMonths, addYears,
  subDays, subWeeks, subMonths, subYears,
  format,
  getISOWeek,
} from "date-fns";
import { it } from "date-fns/locale";

export const PERIOD_TYPES = ["day", "week", "month", "year"];

/**
 * Restituisce {start, end} per un dato periodo + ancora.
 * - day: l'intera giornata (00:00 → 23:59)
 * - week: lunedì → domenica (settimana ISO)
 * - month: 1 → ultimo del mese
 * - year: 1 gennaio → 31 dicembre
 */
export function periodBounds(type, anchor) {
  const a = anchor instanceof Date ? anchor : new Date();
  switch (type) {
    case "day":
      return { start: startOfDay(a), end: endOfDay(a) };
    case "week":
      return {
        start: startOfWeek(a, { weekStartsOn: 1 }),  // 1 = lunedì
        end: endOfWeek(a, { weekStartsOn: 1 }),
      };
    case "month":
      return { start: startOfMonth(a), end: endOfMonth(a) };
    case "year":
      return { start: startOfYear(a), end: endOfYear(a) };
    default:
      return { start: startOfMonth(a), end: endOfMonth(a) };
  }
}

/**
 * Periodo immediatamente precedente.
 * - day: ieri
 * - week: settimana scorsa
 * - month: mese scorso
 * - year: anno scorso
 */
export function previousPeriod(type, anchor) {
  const a = anchor instanceof Date ? anchor : new Date();
  switch (type) {
    case "day":   return periodBounds("day",   subDays(a, 1));
    case "week":  return periodBounds("week",  subWeeks(a, 1));
    case "month": return periodBounds("month", subMonths(a, 1));
    case "year":  return periodBounds("year",  subYears(a, 1));
    default:      return periodBounds(type, subMonths(a, 1));
  }
}

/**
 * Stesso periodo dell'anno precedente (year-over-year).
 */
export function yoyPeriod(type, anchor) {
  const a = anchor instanceof Date ? anchor : new Date();
  return periodBounds(type, subYears(a, 1));
}

/**
 * Sposta l'ancora avanti/indietro di N unità di periodo.
 * direction: -1 = indietro, +1 = avanti
 */
export function shiftAnchor(type, anchor, direction) {
  const a = anchor instanceof Date ? anchor : new Date();
  const sign = direction >= 0 ? 1 : -1;
  switch (type) {
    case "day":   return addDays(a, sign);
    case "week":  return addWeeks(a, sign);
    case "month": return addMonths(a, sign);
    case "year":  return addYears(a, sign);
    default:      return addMonths(a, sign);
  }
}

/**
 * Etichetta human-readable del periodo.
 * - day: "lun 4 mag 2026"
 * - week: "Sett. 18 (4-10 mag 2026)"
 * - month: "Maggio 2026"
 * - year: "2026"
 */
export function formatPeriodLabel(type, anchor) {
  const a = anchor instanceof Date ? anchor : new Date();
  switch (type) {
    case "day":
      return format(a, "EEE d MMM yyyy", { locale: it });
    case "week": {
      const { start, end } = periodBounds("week", a);
      const weekNum = getISOWeek(a);
      const sameMonth = start.getMonth() === end.getMonth();
      const sameYear = start.getFullYear() === end.getFullYear();
      if (sameMonth && sameYear) {
        return `Sett. ${weekNum} (${format(start, "d", { locale: it })}-${format(end, "d MMM yyyy", { locale: it })})`;
      }
      if (sameYear) {
        return `Sett. ${weekNum} (${format(start, "d MMM", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })})`;
      }
      return `Sett. ${weekNum} (${format(start, "d MMM yyyy", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })})`;
    }
    case "month":
      return format(a, "MMMM yyyy", { locale: it }).replace(/^\w/, (c) => c.toUpperCase());
    case "year":
      return format(a, "yyyy", { locale: it });
    default:
      return format(a, "MMMM yyyy", { locale: it });
  }
}

/**
 * Converte una Date in YYYY-MM-DD nel timezone locale.
 */
export function toYmd(d) {
  if (!(d instanceof Date)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
