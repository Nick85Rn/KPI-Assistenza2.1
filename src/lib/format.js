// src/lib/format.js
// Funzioni di formattazione condivise.

/**
 * Converte secondi in formato leggibile.
 * Esempi: 30 -> "30s", 90 -> "1m 30s", 3661 -> "1h 1m", 90000 -> "25h"
 */
export function formatSeconds(sec) {
  if (sec == null || isNaN(sec)) return "—";
  if (sec < 0) sec = 0;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m}m` : `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}g` : `${d}g ${h % 24}h`;
}

/**
 * Converte minuti in formato leggibile (utile per durata formazione, SLA).
 * Esempi: 30 -> "30m", 90 -> "1h 30m", 600 -> "10h"
 */
export function formatMinutes(min) {
  if (min == null || isNaN(min)) return "—";
  return formatSeconds(min * 60);
}

/**
 * Numero con separatore migliaia italiano. Es: 1234567 -> "1.234.567"
 */
export function formatNumber(n) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT").format(n);
}

/**
 * Percentuale con 1 decimale. Es: 0.234 -> "23.4%"
 */
export function formatPercent(n, decimals = 1) {
  if (n == null || isNaN(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

/**
 * Data ISO -> "13 Apr 2026"
 */
export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Data ISO -> "13 Apr 2026, 14:30"
 */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tempo relativo: "2 minuti fa", "ieri", "3 giorni fa"
 */
export function formatRelative(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "ora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  if (diff < 86400 * 2) return "ieri";
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} giorni fa`;
  return formatDate(iso);
}

/**
 * Differenza percentuale tra due valori (per indicatori "vs precedente").
 * Es: current=120, previous=100 -> 0.20 (cioè +20%)
 */
export function percentChange(current, previous) {
  if (previous == null || previous === 0 || isNaN(previous)) return null;
  if (current == null || isNaN(current)) return null;
  return (current - previous) / previous;
}

/**
 * Normalizza un nome operatore (allineato alla logica DataParser legacy).
 */
export function normalizeOperatorName(name) {
  if (!name) return "(senza operatore)";
  const cleanName = String(name).trim();

  const aliases = {
    "nicola pellicioni": "Nicola",
    "emanuele rosti": "Emanuele",
    "filippo rossi": "Filippo",
    "marta f": "Marta",
    "nouha m": "Nouha",
    "giuseppe u": "Giuseppe",
    "margarita giardi": "Margarita",
    "michele bozzelli": "Michele",
  };

  const key = cleanName.toLowerCase();
  if (aliases[key]) return aliases[key];

  const firstName = cleanName.split(" ")[0];
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
