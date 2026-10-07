// src/lib/workload.js
// Calcoli della pagina "Carico di lavoro". Funzioni pure (nessun accesso ai dati):
// partono dalle righe giornaliere gia' calcolate dal database e dai parametri
// di calcolo (workload_settings), cosi' i numeri mostrati sono tracciabili.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** [{chiave, valore, valore_testo}] -> { chiave: valore | valore_testo } */
export function settingsMap(rows) {
  const out = {};
  for (const r of rows ?? []) {
    out[r.chiave] = r.valore != null ? Number(r.valore) : r.valore_testo;
  }
  return out;
}

export function opDisplayName(op) {
  if (!op) return "";
  return op.charAt(0).toUpperCase() + op.slice(1);
}

const sumBy = (rows, key) => rows.reduce((a, r) => a + num(r[key]), 0);

/**
 * Riepilogo del periodo a livello di team, per operatore e per giorno.
 * @param daily  righe di zoho_daily_workload
 * @param S      parametri (settingsMap)
 */
export function summarize(daily, S) {
  const disp = num(S.ore_disponibili_giorno) || 6.5;
  const tMin = num(S.occupazione_target_min) || 75;
  const tMax = num(S.occupazione_target_max) || 85;
  const maxChat = num(S.chat_max_contemporanee) || 5;
  const minApertura = num(S.min_apertura_sviluppo);
  const minSvil = num(S.min_risposta_sviluppo);

  const rows = daily ?? [];
  const giorni = new Set(rows.map((r) => r.giorno));
  const nDays = giorni.size;
  const nOpDays = rows.length;

  const oreOccupate = sumBy(rows, "ore_occupate");
  const capacita = nOpDays * disp;
  const occupazione = capacita > 0 ? oreOccupate / capacita : null;

  const operatoriMedi = nDays > 0 ? nOpDays / nDays : 0;
  const oreOccPerGiorno = nDays > 0 ? oreOccupate / nDays : 0;
  const personeNecessarie = nDays > 0 ? oreOccPerGiorno / (disp * (tMax / 100)) : null;

  // Chat
  const presidio = sumBy(rows, "ore_chat_presidio");
  const concMedie = presidio > 0
    ? rows.reduce((a, r) => a + num(r.chat_contemporanee_medie) * num(r.ore_chat_presidio), 0) / presidio
    : null;
  const picco = rows.reduce((m, r) => Math.max(m, num(r.picco_chat)), 0);
  const minOltre = sumBy(rows, "min_oltre_max_chat");
  const chatGestite = sumBy(rows, "chat_gestite");

  // Ore di lavoro per canale (somma delle attivita', senza unire le sovrapposizioni)
  const aperture = sumBy(rows, "aperture_sviluppo");
  const rispSvil = sumBy(rows, "risp_sviluppo");
  const oreSviluppo = (aperture * minApertura + rispSvil * minSvil) / 60;
  const oreTicketTutte = sumBy(rows, "ore_ticket_stimate");
  const canali = {
    chat: sumBy(rows, "ore_chat_attive"),
    ticket: Math.max(0, oreTicketTutte - oreSviluppo),
    sviluppo: oreSviluppo,
    formazione: sumBy(rows, "ore_formazione"),
  };
  const conteggi = {
    chat: chatGestite,
    assistenza: sumBy(rows, "risp_assistenza"),
    mail: sumBy(rows, "risp_mail"),
    whatsapp: sumBy(rows, "risp_whatsapp"),
    zucchetti: sumBy(rows, "risp_zucchetti"),
    sviluppo: rispSvil,
    aperture,
    formazione: sumBy(rows, "sessioni_formazione"),
  };

  // Per operatore
  const perOp = new Map();
  for (const r of rows) {
    const o = perOp.get(r.operatore) ?? {
      operatore: r.operatore, giorni: 0, oreOccupate: 0,
      chat: 0, ticket: 0, sviluppo: 0, formazione: 0, minOltre: 0, picco: 0, chatGestite: 0,
    };
    o.giorni += 1;
    o.oreOccupate += num(r.ore_occupate);
    o.chat += num(r.ore_chat_attive);
    const svil = (num(r.aperture_sviluppo) * minApertura + num(r.risp_sviluppo) * minSvil) / 60;
    o.sviluppo += svil;
    o.ticket += Math.max(0, num(r.ore_ticket_stimate) - svil);
    o.formazione += num(r.ore_formazione);
    o.minOltre += num(r.min_oltre_max_chat);
    o.picco = Math.max(o.picco, num(r.picco_chat));
    o.chatGestite += num(r.chat_gestite);
    perOp.set(r.operatore, o);
  }
  const operatori = [...perOp.values()]
    .map((o) => ({ ...o, occupazione: o.giorni > 0 ? o.oreOccupate / (o.giorni * disp) : null }))
    .sort((a, b) => b.oreOccupate - a.oreOccupate);

  // Per giorno (trend)
  const perDay = new Map();
  for (const r of rows) {
    const d = perDay.get(r.giorno) ?? { giorno: r.giorno, operatori: 0, oreOccupate: 0 };
    d.operatori += 1;
    d.oreOccupate += num(r.ore_occupate);
    perDay.set(r.giorno, d);
  }
  const trend = [...perDay.values()]
    .sort((a, b) => (a.giorno < b.giorno ? -1 : 1))
    .map((d) => ({ ...d, occupazione: d.operatori > 0 ? d.oreOccupate / (d.operatori * disp) : null }));

  const calcolatoIl = rows.reduce((m, r) => (r.calcolato_il && r.calcolato_il > m ? r.calcolato_il : m), "");

  return {
    params: { disp, tMin, tMax, maxChat },
    nDays, nOpDays, operatoriMedi,
    oreOccupate, capacita, occupazione, oreOccPerGiorno, personeNecessarie,
    oreOccPerOperatoreGiorno: nOpDays > 0 ? oreOccupate / nOpDays : null,
    chat: { presidio, concMedie, picco, minOltre, chatGestite,
            minOltrePerOpGiorno: nOpDays > 0 ? minOltre / nOpDays : null },
    canali, conteggi, operatori, trend, calcolatoIl,
  };
}

/** Fascia di occupazione: sotto / in fascia / sopra / saturazione */
export function occupancyBand(frac, params) {
  if (frac == null) return { key: "nd", label: "Dati non disponibili" };
  const pct = frac * 100;
  if (pct < params.tMin) return { key: "sotto", label: "Sotto la fascia sostenibile" };
  if (pct <= params.tMax) return { key: "ok", label: "In fascia sostenibile" };
  if (pct < 95) return { key: "alta", label: "Sopra la fascia sostenibile" };
  return { key: "saturo", label: "Saturazione" };
}

/**
 * Mappa dei picchi: occupazione media per giorno della settimana e ora.
 * Valore = quota di tempo occupato sugli operatori con attivita' quel giorno,
 * mediata sui giorni dello stesso tipo presenti nel periodo.
 */
export function buildHeatmap(hourly, daily) {
  const opsPerDay = new Map();
  for (const r of daily ?? []) opsPerDay.set(r.giorno, (opsPerDay.get(r.giorno) ?? 0) + 1);

  const dow = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domenica
    return wd === 0 ? 7 : wd; // 1 = lunedi ... 7 = domenica
  };

  const daysPerDow = new Map();
  for (const g of opsPerDay.keys()) daysPerDow.set(dow(g), (daysPerDow.get(dow(g)) ?? 0) + 1);

  const slot = new Map(); // "g|ora" -> secondi totali
  for (const r of hourly ?? []) {
    const k = `${r.giorno}|${r.ora}`;
    slot.set(k, (slot.get(k) ?? 0) + num(r.sec_occupati));
  }

  const acc = new Map(); // "dow|ora" -> somma frazioni
  let minH = 24, maxH = -1;
  for (const [k, sec] of slot) {
    const [g, ora] = k.split("|");
    const ops = opsPerDay.get(g);
    if (!ops) continue;
    const key = `${dow(g)}|${Number(ora)}`;
    acc.set(key, (acc.get(key) ?? 0) + sec / (3600 * ops));
    minH = Math.min(minH, Number(ora));
    maxH = Math.max(maxH, Number(ora));
  }
  if (maxH < 0) return { cells: [], hours: [], days: [] };

  const days = [...daysPerDow.keys()].sort((a, b) => a - b);
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  const cells = [];
  for (const d of days) {
    for (const h of hours) {
      const v = (acc.get(`${d}|${h}`) ?? 0) / (daysPerDow.get(d) || 1);
      cells.push({ dow: d, ora: h, value: Math.min(1, v) });
    }
  }
  return { cells, hours, days };
}

/** Chat ricevute / perse / attesa media dal periodo (segnali di saturazione). */
export function summarizeSaturation(rows) {
  const r = rows ?? [];
  const chats = sumBy(r, "chats_count");
  const perse = sumBy(r, "chats_missed");
  const attesa = chats > 0
    ? r.reduce((a, x) => a + num(x.avg_waiting_sec) * num(x.chats_count), 0) / chats
    : null;
  return { chats, perse, percPerse: chats > 0 ? perse / chats : null, attesaMediaSec: attesa };
}
