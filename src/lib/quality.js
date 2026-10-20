// src/lib/quality.js
// Calcoli condivisi sulla "Qualità chat": stessi numeri della scheda dedicata,
// usabili anche dal Cruscotto. Funzioni pure sulle righe di chat_quality.

/** Punteggio 0-100 di una chat: media delle quattro dimensioni (0-2 ciascuna). */
export const chatScore = (r) => ((r.tono + r.comprensione + r.correttezza + r.chiusura) / 8) * 100;

const minDim = (r) => Math.min(r.tono, r.comprensione, r.correttezza, r.chiusura);

/**
 * Indicatori di team su un elenco di chat valutate.
 * daRivedere = chat con almeno una dimensione non "buona" o non risolta davvero
 * (stesso criterio dell'elenco "Chat da rivedere" della scheda).
 */
export function summarizeQuality(rows) {
  const list = rows ?? [];
  const n = list.length;
  if (n === 0) return { n: 0, qualita: null, risolte: 0, pctRisolte: null, critiche: 0, pctCritiche: null, daRivedere: 0 };
  const qualita = list.reduce((s, r) => s + chatScore(r), 0) / n;
  const risolte = list.filter((r) => r.esito === "risolta").length;
  const critiche = list.filter((r) => minDim(r) === 0).length;
  const daRivedere = list.filter((r) => minDim(r) < 2 || r.esito !== "risolta").length;
  return {
    n, qualita, risolte, pctRisolte: (risolte / n) * 100,
    critiche, pctCritiche: (critiche / n) * 100, daRivedere,
  };
}
