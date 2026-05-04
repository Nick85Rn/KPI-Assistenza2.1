// src/api/zohoData.js
// Layer dati: tutte le query Supabase per la Dashboard 2.0.
// Convenzione:
//   - Ogni funzione riceve un oggetto { start, end } (Date) e ritorna dati aggregati.
//   - Le funzioni *Kpis ritornano oggetti scalari pronti per le KPI cards.
//   - Le funzioni *Trend ritornano array di {date, value} per i grafici.
//   - Errori e dati mancanti -> ritorniamo valori sicuri (0, [], null) così la UI
//     non si rompe se manca una tabella.

import { supabase } from "../supabaseClient";
import { toYmd } from "../lib/periods";

// ============================================================
// HELPER GENERICI
// ============================================================

function asNum(v, fallback = 0) {
  if (v == null || isNaN(Number(v))) return fallback;
  return Number(v);
}

function asDateRange({ start, end }) {
  return { from: toYmd(start), to: toYmd(end) };
}

// ============================================================
// TICKET DESK (Assistenza + Sviluppo)
// ============================================================

/**
 * Aggregati ticket di un dipartimento per il periodo dato.
 * dept: "assistenza" | "sviluppo"
 */
export async function getTicketKpis(dept, period) {
  const table = dept === "sviluppo" ? "zoho_daily_sviluppo" : "zoho_daily_assistenza";
  const { from, to } = asDateRange(period);

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    console.error(`getTicketKpis(${dept}):`, error.message);
    return emptyTicketKpis();
  }
  return aggregateTicketRows(data ?? []);
}

function emptyTicketKpis() {
  return {
    new_tickets: 0,
    closed_tickets: 0,
    waiting_tickets: 0,
    backlog: 0,
    satisfaction_good: 0,
    satisfaction_ok: 0,
    satisfaction_bad: 0,
    avg_first_response_sec: null,
    avg_resolution_sec: null,
    sla_sample_size: 0,
    days: [],
  };
}

function aggregateTicketRows(rows) {
  if (rows.length === 0) return emptyTicketKpis();

  const sum = (key) => rows.reduce((a, r) => a + asNum(r[key]), 0);
  const last = (key) => asNum(rows[rows.length - 1][key]);
  // Media pesata su sla_sample_size, per essere onesti quando alcuni giorni
  // hanno pochi ticket.
  const weightedAvg = (key) => {
    let totSec = 0, totN = 0;
    for (const r of rows) {
      const sec = r[key];
      const n = asNum(r.sla_sample_size);
      if (sec != null && n > 0) { totSec += sec * n; totN += n; }
    }
    return totN > 0 ? Math.round(totSec / totN) : null;
  };

  return {
    new_tickets: sum("new_tickets"),
    closed_tickets: sum("closed_tickets"),
    waiting_tickets: sum("waiting_tickets"),
    backlog: last("backlog"), // backlog = stato all'ultimo giorno del periodo
    satisfaction_good: sum("satisfaction_good"),
    satisfaction_ok: sum("satisfaction_ok"),
    satisfaction_bad: sum("satisfaction_bad"),
    avg_first_response_sec: weightedAvg("avg_first_response_sec"),
    avg_resolution_sec: weightedAvg("avg_resolution_sec"),
    sla_sample_size: sum("sla_sample_size"),
    days: rows,
  };
}

// ============================================================
// CHAT SALESIQ
// ============================================================

/**
 * Aggregati chat di tutti gli operatori per il periodo dato.
 * Legge da zoho_daily_chats (vista filtrata sulle chat valide).
 */
export async function getChatKpis(period) {
  const { from, to } = asDateRange(period);

  const { data, error } = await supabase
    .from("zoho_daily_chats")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    console.error("getChatKpis:", error.message);
    return emptyChatKpis();
  }

  const rows = data ?? [];
  if (rows.length === 0) return emptyChatKpis();

  const sumChats = rows.reduce((a, r) => a + asNum(r.chats_count), 0);
  const sumAttended = rows.reduce((a, r) => a + asNum(r.chats_attended), 0);
  const sumMissed = rows.reduce((a, r) => a + asNum(r.chats_missed), 0);
  const totWaitWeighted = rows.reduce(
    (a, r) => a + asNum(r.avg_waiting_sec) * asNum(r.chats_attended), 0,
  );
  const totDurWeighted = rows.reduce(
    (a, r) => a + asNum(r.avg_duration_sec) * asNum(r.chats_count), 0,
  );

  // Top operatori del periodo
  const byOp = new Map();
  for (const r of rows) {
    const op = r.operator || "(senza operatore)";
    if (!byOp.has(op)) {
      byOp.set(op, {
        operator: op,
        chats: 0,
        attended: 0,
        missed: 0,
        wait_w: 0,
        wait_n: 0,
        dur_w: 0,
        dur_n: 0,
        total_dur_sec: 0,
      });
    }
    const o = byOp.get(op);
    o.chats += asNum(r.chats_count);
    o.attended += asNum(r.chats_attended);
    o.missed += asNum(r.chats_missed);
    if (r.avg_waiting_sec != null) {
      o.wait_w += asNum(r.avg_waiting_sec) * asNum(r.chats_attended);
      o.wait_n += asNum(r.chats_attended);
    }
    if (r.avg_duration_sec != null) {
      o.dur_w += asNum(r.avg_duration_sec) * asNum(r.chats_count);
      o.dur_n += asNum(r.chats_count);
    }
    o.total_dur_sec += asNum(r.total_duration_sec);
  }

  const operators = Array.from(byOp.values())
    .map((o) => ({
      operator: o.operator,
      chats: o.chats,
      attended: o.attended,
      missed: o.missed,
      avg_wait_sec: o.wait_n > 0 ? Math.round(o.wait_w / o.wait_n) : null,
      avg_duration_sec: o.dur_n > 0 ? Math.round(o.dur_w / o.dur_n) : null,
      total_duration_sec: o.total_dur_sec,
    }))
    .sort((a, b) => b.chats - a.chats);

  return {
    chats_total: sumChats,
    chats_attended: sumAttended,
    chats_missed: sumMissed,
    avg_waiting_sec: sumAttended > 0 ? Math.round(totWaitWeighted / sumAttended) : null,
    avg_duration_sec: sumChats > 0 ? Math.round(totDurWeighted / sumChats) : null,
    operators,
    days: rows,
  };
}

function emptyChatKpis() {
  return {
    chats_total: 0,
    chats_attended: 0,
    chats_missed: 0,
    avg_waiting_sec: null,
    avg_duration_sec: null,
    operators: [],
    days: [],
  };
}

// ============================================================
// FORMAZIONE CRM
// ============================================================

export async function getFormazioneKpis(period) {
  const { from, to } = asDateRange(period);

  const { data, error } = await supabase
    .from("zoho_daily_formazioni")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    console.error("getFormazioneKpis:", error.message);
    return emptyFormazioneKpis();
  }

  const rows = data ?? [];
  if (rows.length === 0) return emptyFormazioneKpis();

  const totalRecords = rows.reduce((a, r) => a + asNum(r.count_records), 0);
  const totalMinutes = rows.reduce((a, r) => a + asNum(r.total_minutes), 0);

  // Top operatori per ore di formazione
  const byOp = new Map();
  for (const r of rows) {
    const op = r.operator || "(senza operatore)";
    if (!byOp.has(op)) byOp.set(op, { operator: op, count: 0, minutes: 0 });
    const o = byOp.get(op);
    o.count += asNum(r.count_records);
    o.minutes += asNum(r.total_minutes);
  }
  const operators = Array.from(byOp.values()).sort((a, b) => b.minutes - a.minutes);

  // Distribuzione per topic
  const byTopic = new Map();
  for (const r of rows) {
    const t = r.topic || "(senza topic)";
    if (!byTopic.has(t)) byTopic.set(t, { topic: t, count: 0, minutes: 0 });
    const o = byTopic.get(t);
    o.count += asNum(r.count_records);
    o.minutes += asNum(r.total_minutes);
  }
  const topics = Array.from(byTopic.values()).sort((a, b) => b.minutes - a.minutes);

  return {
    total_records: totalRecords,
    total_minutes: totalMinutes,
    avg_duration_min: totalRecords > 0 ? Math.round(totalMinutes / totalRecords) : null,
    operators,
    topics,
    days: rows,
  };
}

function emptyFormazioneKpis() {
  return {
    total_records: 0,
    total_minutes: 0,
    avg_duration_min: null,
    operators: [],
    topics: [],
    days: [],
  };
}

// ============================================================
// SYNC LOG: ultimo aggiornamento per fonte
// ============================================================

export async function getLastSyncByPart() {
  const { data, error } = await supabase
    .from("zoho_sync_log")
    .select("source, status, started_at, finished_at, records_synced, error_message")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getLastSyncByPart:", error.message);
    return {};
  }

  // Tieni solo l'ultimo per source
  const result = {};
  for (const row of data ?? []) {
    if (!result[row.source]) result[row.source] = row;
  }
  return result;
}

// ============================================================
// HEALTHCHECK: la dashboard è connessa al DB?
// ============================================================

export async function pingSupabase() {
  const { error } = await supabase.from("zoho_credentials").select("source").limit(1);
  return !error;
}
// ============================================================
// HEATMAP CHAT (7×24 = giorno settimana × ora del giorno)
// ============================================================

/**
 * Aggrega la heatmap per il periodo dato.
 * Restituisce una matrice 7×24 con i conteggi.
 */
export async function getChatHeatmap(period) {
  const { from, to } = asDateRange(period);

  const { data, error } = await supabase
    .from("zoho_chat_heatmap")
    .select("day_of_week, hour_of_day, chats_count, attended_count")
    .gte("date", from)
    .lte("date", to);

  if (error) {
    console.error("getChatHeatmap:", error.message);
    return emptyHeatmap();
  }

  // Costruisce matrice 7×24
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ chats: 0, attended: 0 })),
  );

  let totalChats = 0;
  let maxCellChats = 0;

  for (const row of data ?? []) {
    const d = row.day_of_week;
    const h = row.hour_of_day;
    if (d < 0 || d > 6 || h < 0 || h > 23) continue;
    grid[d][h].chats += asNum(row.chats_count);
    grid[d][h].attended += asNum(row.attended_count);
    totalChats += asNum(row.chats_count);
    if (grid[d][h].chats > maxCellChats) maxCellChats = grid[d][h].chats;
  }

  return { grid, totalChats, maxCellChats };
}

function emptyHeatmap() {
  return {
    grid: Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ chats: 0, attended: 0 })),
    ),
    totalChats: 0,
    maxCellChats: 0,
  };
}

// ============================================================
// TOP VISITATORI (clienti che chattano di più)
// ============================================================

/**
 * Top N clienti per numero di chat nel periodo.
 */
export async function getTopVisitors(period, limit = 10) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  // Chat valide del periodo, raggruppate per visitor_name
  const { data, error } = await supabase
    .from("zoho_raw_chats")
    .select("visitor_name, created_time, operator, duration_seconds")
    .gte("created_time", fromIso)
    .lte("created_time", toIso)
    .not("visitor_name", "is", null);

  if (error) {
    console.error("getTopVisitors:", error.message);
    return [];
  }

  // ============================================================
// FORMAZIONE - DETTAGLI ESTESI (top clienti, topic, trend)
// ============================================================

// Lista delle "company" che in realtà sono categorie tecniche interne, non clienti veri.
// Le mostriamo nei top con un tag "Interno".
const INTERNAL_COMPANIES = new Set([
  "App Clienti Pienissimo PRO",
  "Test P.pro Assistenza",
]);

/**
 * Estrae nome e P.IVA dal formato "IT12345678901 - NOME AZIENDA".
 */
function splitCompanyName(raw) {
  if (!raw) return { name: "(senza nome)", vat: null };
  const m = raw.match(/^(IT\d{10,12})\s*[-–]\s*(.+)$/);
  if (m) return { name: m[2].trim(), vat: m[1] };
  return { name: raw.trim(), vat: null };
}

/**
 * Restituisce i dettagli estesi della formazione per il periodo:
 *   - top 10 clienti (per ore)
 *   - distribuzione per topic (categorie Zoho)
 *   - trend mensile (sessioni e ore per mese)
 */
/**
 * Restituisce i dettagli estesi della formazione per il periodo:
 *   - top 10 clienti (per ore)
 *   - distribuzione per topic (le sessioni senza topic compaiono come "Tipologia non presente")
 *   - trend mensile (sessioni e ore per mese)
 */
export async function getFormazioneDetails(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await supabase
    .from("zoho_raw_formazione")
    .select("company, topic, duration_minutes, created_time")
    .gte("created_time", fromIso)
    .lte("created_time", toIso);

  if (error) {
    console.error("getFormazioneDetails:", error.message);
    return emptyFormazioneDetails();
  }

  const rows = data ?? [];
  const NO_TOPIC_LABEL = "Tipologia non presente";

  // ---- Top clienti ----
  const byCompany = new Map();
  for (const r of rows) {
    if (!r.company) continue;
    const key = r.company.trim();
    if (!byCompany.has(key)) {
      const { name, vat } = splitCompanyName(key);
      byCompany.set(key, {
        company: key,
        name,
        vat,
        is_internal: INTERNAL_COMPANIES.has(key),
        sessions: 0,
        minutes: 0,
      });
    }
    const o = byCompany.get(key);
    o.sessions += 1;
    o.minutes += asNum(r.duration_minutes);
  }
  const topClients = Array.from(byCompany.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  // ---- Distribuzione topic (incluse "non taggate") ----
  const byTopic = new Map();
  for (const r of rows) {
    const raw = (r.topic || "").trim();
    const t = raw || NO_TOPIC_LABEL;
    if (!byTopic.has(t)) {
      byTopic.set(t, {
        topic: t,
        sessions: 0,
        minutes: 0,
        is_untagged: t === NO_TOPIC_LABEL,
      });
    }
    const o = byTopic.get(t);
    o.sessions += 1;
    o.minutes += asNum(r.duration_minutes);
  }
  // Ordino per sessioni desc, MA "Tipologia non presente" sempre in fondo
  const topics = Array.from(byTopic.values()).sort((a, b) => {
    if (a.is_untagged && !b.is_untagged) return 1;
    if (!a.is_untagged && b.is_untagged) return -1;
    return b.sessions - a.sessions;
  });

  // ---- Trend mensile ----
  const byMonth = new Map();
  for (const r of rows) {
    if (!r.created_time) continue;
    const d = new Date(r.created_time);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, { month: key, sessions: 0, minutes: 0 });
    const o = byMonth.get(key);
    o.sessions += 1;
    o.minutes += asNum(r.duration_minutes);
  }
  const trend = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

  return {
    top_clients: topClients,
    topics,
    trend,
    total_sessions: rows.length,
  };
}

function emptyFormazioneDetails() {
  return {
    top_clients: [],
    topics: [],
    trend: [],
    total_sessions: 0,
  };
}
  const rows = data ?? [];

  // ---- Top clienti ----
  const byCompany = new Map();
  for (const r of rows) {
    if (!r.company) continue;
    const key = r.company.trim();
    if (!byCompany.has(key)) {
      const { name, vat } = splitCompanyName(key);
      byCompany.set(key, {
        company: key,
        name,
        vat,
        is_internal: INTERNAL_COMPANIES.has(key),
        sessions: 0,
        minutes: 0,
      });
    }
    const o = byCompany.get(key);
    o.sessions += 1;
    o.minutes += asNum(r.duration_minutes);
  }
  const topClients = Array.from(byCompany.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  // ---- Distribuzione topic (escluso vuoto) ----
  const byTopic = new Map();
  let untaggedCount = 0;
  let untaggedMinutes = 0;
  for (const r of rows) {
    const t = (r.topic || "").trim();
    if (!t) {
      untaggedCount += 1;
      untaggedMinutes += asNum(r.duration_minutes);
      continue;
    }
    if (!byTopic.has(t)) byTopic.set(t, { topic: t, sessions: 0, minutes: 0 });
    const o = byTopic.get(t);
    o.sessions += 1;
    o.minutes += asNum(r.duration_minutes);
  }
  const topics = Array.from(byTopic.values()).sort((a, b) => b.sessions - a.sessions);

  // ---- Trend mensile ----
  const byMonth = new Map();
  for (const r of rows) {
    if (!r.created_time) continue;
    const d = new Date(r.created_time);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, { month: key, sessions: 0, minutes: 0 });
    const o = byMonth.get(key);
    o.sessions += 1;
    o.minutes += asNum(r.duration_minutes);
  }
  const trend = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

  return {
    top_clients: topClients,
    topics,
    trend,
    untagged: {
      sessions: untaggedCount,
      minutes: untaggedMinutes,
      pct_of_total: rows.length > 0 ? untaggedCount / rows.length : 0,
    },
    total_sessions: rows.length,
  };
}

function emptyFormazioneDetails() {
  return {
    top_clients: [],
    topics: [],
    trend: [],
    untagged: { sessions: 0, minutes: 0, pct_of_total: 0 },
    total_sessions: 0,
  };
}

  // Aggrego in JS (la lista filtra anche le ghost)
  const byVisitor = new Map();
  for (const r of data ?? []) {
    if (!r.visitor_name) continue;
    const isGhost = !r.operator && (r.duration_seconds == null || r.duration_seconds < 1);
    if (isGhost) continue;
    const v = r.visitor_name.trim();
    if (!byVisitor.has(v)) {
      byVisitor.set(v, { visitor: v, chats: 0, last_chat: null });
    }
    const o = byVisitor.get(v);
    o.chats += 1;
    if (!o.last_chat || new Date(r.created_time) > new Date(o.last_chat)) {
      o.last_chat = r.created_time;
    }
  }

  return Array.from(byVisitor.values())
    .sort((a, b) => b.chats - a.chats)
    .slice(0, limit);
}
