// src/api/zohoData.js
// Layer di accesso ai dati Zoho via Supabase - Dashboard 2.0
// Con paginazione automatica per superare il limite di 1000 record di Supabase

import { supabase } from "../supabaseClient";

// ============================================================
// HELPERS
// ============================================================

export function toYmd(d) {
  if (!(d instanceof Date)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function asDateRange(period) {
  return { from: toYmd(period.start), to: toYmd(period.end) };
}

function asNum(v) {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Esegue una query Supabase scaricando TUTTI i record con paginazione (range).
 * Supabase limita default a 1000 righe per query. Questa funzione fa più chiamate.
 */
async function fetchAllPaginated(queryBuilder, pageSize = 1000) {
  let allRows = [];
  let pageFrom = 0;
  let hasMore = true;

  while (hasMore) {
    const pageTo = pageFrom + pageSize - 1;
    const { data, error } = await queryBuilder(pageFrom, pageTo);

    if (error) return { data: null, error };
    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    allRows = allRows.concat(data);

    if (data.length < pageSize) {
      hasMore = false;
    } else {
      pageFrom += pageSize;
    }
  }

  return { data: allRows, error: null };
}

const INTERNAL_COMPANIES = new Set([
  "App Clienti Pienissimo PRO",
  "Test P.pro Assistenza",
]);

function splitCompanyName(raw) {
  if (!raw) return { name: "(senza nome)", vat: null };
  const m = raw.match(/^(IT\d{10,12})\s*[-–]\s*(.+)$/);
  if (m) return { name: m[2].trim(), vat: m[1] };
  return { name: raw.trim(), vat: null };
}

function normalizeOperatorName(name) {
  if (!name) return name;
  return name
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ")
    .trim();
}

const ASSISTENZA_OPEN_STATUSES = ["Aperto", "In attesa"];
const ASSISTENZA_CLOSED_STATUSES = ["Chiuso", "Chiuso da Assistenza"];

const SVILUPPO_OPEN_STATUSES = [
  "Ticket aperto", "In attesa", "Ticket Ri-Aperto", "Passato a Assistenza per check",
];
const SVILUPPO_CLOSED_STATUSES = [
  "Chiuso da Assistenza", "Chiuso. Cliente informato",
  "Chiuso. Ticket Risolto", "Chiuso. Ticket Non Risolto",
];

const SVI_AGE_BUCKETS = [
  { key: "0-7",      label: "0-7 giorni",    min: 0,   max: 7 },
  { key: "7-30",     label: "7-30 giorni",   min: 7,   max: 30 },
  { key: "30-90",    label: "30-90 giorni",  min: 30,  max: 90 },
  { key: "90-180",   label: "90-180 giorni", min: 90,  max: 180 },
  { key: "180-365",  label: "180gg-1 anno",  min: 180, max: 365 },
  { key: "over-365", label: "Oltre 1 anno",  min: 365, max: Infinity },
];

function ageBucketFor(daysOld) {
  for (const b of SVI_AGE_BUCKETS) {
    if (daysOld >= b.min && daysOld < b.max) return b.key;
  }
  return "over-365";
}

// ============================================================
// PING
// ============================================================

export async function pingSupabase() {
  const { error } = await supabase
    .from("zoho_credentials")
    .select("source", { head: true, count: "exact" });
  return !error;
}

// ============================================================
// TICKET KPIs
// (rimosso filtro isAssistenzaNoise - conta tutto come Zoho)
// ============================================================

export async function getTicketKpis(which, period) {
  const tableName = which === "sviluppo" ? "zoho_daily_sviluppo" : "zoho_daily_assistenza";
  const rawTable = which === "sviluppo" ? "zoho_raw_sviluppo" : "zoho_raw_assistenza";
  const { from, to } = asDateRange(period);

  const { data: daily, error: dailyErr } = await supabase
    .from(tableName)
    .select("date, new_tickets, closed_tickets, backlog")
    .gte("date", from).lte("date", to)
    .order("date", { ascending: true });

  if (dailyErr) {
    console.error(`getTicketKpis ${which} daily:`, dailyErr.message);
    return emptyTicketKpis();
  }

  let new_tickets = 0, closed_tickets = 0, max_backlog = 0;
  for (const row of daily ?? []) {
    new_tickets += asNum(row.new_tickets);
    closed_tickets += asNum(row.closed_tickets);
    if (asNum(row.backlog) > max_backlog) max_backlog = asNum(row.backlog);
  }

  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  // SLA con paginazione (senza filtro saluti)
  const { data: slaRows } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from(rawTable)
      .select("first_response_sec, avg_response_sec, resolution_sec")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .not("first_response_sec", "is", null)
      .range(pageFrom, pageTo)
  );

  let sumFirst = 0, sumResp = 0, sumRes = 0;
  let countFirst = 0, countResp = 0, countRes = 0;

  for (const r of slaRows ?? []) {
    if (r.first_response_sec != null) {
      sumFirst += asNum(r.first_response_sec);
      countFirst++;
    }
    if (r.avg_response_sec != null) {
      sumResp += asNum(r.avg_response_sec);
      countResp++;
    }
    if (r.resolution_sec != null) {
      sumRes += asNum(r.resolution_sec);
      countRes++;
    }
  }

  return {
    new_tickets, closed_tickets, max_backlog,
    avg_first_response_sec: countFirst > 0 ? Math.round(sumFirst / countFirst) : null,
    avg_response_sec: countResp > 0 ? Math.round(sumResp / countResp) : null,
    avg_resolution_sec: countRes > 0 ? Math.round(sumRes / countRes) : null,
    sla_sample_size: countFirst,
  };
}

function emptyTicketKpis() {
  return {
    new_tickets: 0, closed_tickets: 0, max_backlog: 0,
    avg_first_response_sec: null, avg_response_sec: null, avg_resolution_sec: null,
    sla_sample_size: 0,
  };
}

// ============================================================
// CHAT KPIs - da zoho_daily_chats (aggregato pre-calcolato)
// ============================================================

export async function getChatKpis(period) {
  const { from, to } = asDateRange(period);

  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_daily_chats")
      .select("date, department, operator, chats_count, chats_attended, chats_missed, avg_waiting_sec, avg_duration_sec, total_duration_sec")
      .gte("date", from).lte("date", to)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getChatKpis:", error.message);
    return emptyChatKpis();
  }

  const rows = data ?? [];
  if (rows.length === 0) return emptyChatKpis();

  const MISSED_PLACEHOLDER = "(non assegnato)";

  let chats_total = 0, chats_attended = 0, chats_missed = 0;
  let sumWaitWeighted = 0, countWait = 0;
  let sumDurWeighted = 0, countDur = 0;
  const byOp = new Map();

  for (const r of rows) {
    const count = asNum(r.chats_count);
    const attended = asNum(r.chats_attended);
    const missed = asNum(r.chats_missed);

    chats_total += count;
    chats_attended += attended;
    chats_missed += missed;

    if (r.avg_waiting_sec != null && attended > 0) {
      sumWaitWeighted += asNum(r.avg_waiting_sec) * attended;
      countWait += attended;
    }
    if (r.avg_duration_sec != null && attended > 0) {
      sumDurWeighted += asNum(r.avg_duration_sec) * attended;
      countDur += attended;
    }

    if (r.operator && r.operator !== MISSED_PLACEHOLDER) {
      const opKey = r.operator;
      if (!byOp.has(opKey)) {
        byOp.set(opKey, {
          operator: opKey,
          chats: 0,
          attended: 0,
          missed: 0,
          _sumWaitWeighted: 0,
          _countWait: 0,
          _sumDurWeighted: 0,
          _countDur: 0,
        });
      }
      const o = byOp.get(opKey);
      o.chats += count;
      o.attended += attended;
      o.missed += missed;
      if (r.avg_waiting_sec != null && attended > 0) {
        o._sumWaitWeighted += asNum(r.avg_waiting_sec) * attended;
        o._countWait += attended;
      }
      if (r.avg_duration_sec != null && attended > 0) {
        o._sumDurWeighted += asNum(r.avg_duration_sec) * attended;
        o._countDur += attended;
      }
    }
  }

  const operators = Array.from(byOp.values())
    .map((o) => ({
      operator: o.operator,
      chats: o.chats,
      attended: o.attended,
      missed: o.missed,
      avg_wait_sec: o._countWait > 0 ? Math.round(o._sumWaitWeighted / o._countWait) : null,
      avg_duration_sec: o._countDur > 0 ? Math.round(o._sumDurWeighted / o._countDur) : null,
    }))
    .sort((a, b) => b.chats - a.chats);

  return {
    chats_total,
    chats_attended,
    chats_missed,
    avg_waiting_sec: countWait > 0 ? Math.round(sumWaitWeighted / countWait) : null,
    avg_duration_sec: countDur > 0 ? Math.round(sumDurWeighted / countDur) : null,
    operators,
  };
}

function emptyChatKpis() {
  return {
    chats_total: 0, chats_attended: 0, chats_missed: 0,
    avg_waiting_sec: null, avg_duration_sec: null, operators: [],
  };
}

// ============================================================
// CHAT FUORI ORARIO (senza operatore/durata)
// ============================================================

export async function getChatFuoriOrarioKpis(period) {
  const { from, to } = asDateRange(period);

  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_daily_chats_fuori_orario")
      .select("date, department, chats_count")
      .gte("date", from).lte("date", to)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getChatFuoriOrarioKpis:", error.message);
    return { chats_total: 0, byDepartment: [] };
  }

  const rows = data ?? [];
  if (rows.length === 0) return { chats_total: 0, byDepartment: [] };

  let chats_total = 0;
  const byDept = new Map();

  for (const r of rows) {
    const count = asNum(r.chats_count);
    chats_total += count;

    const deptKey = r.department || "(senza dipartimento)";
    byDept.set(deptKey, (byDept.get(deptKey) || 0) + count);
  }

  const byDepartment = Array.from(byDept.entries())
    .map(([department, chats]) => ({ department, chats }))
    .sort((a, b) => b.chats - a.chats);

  return { chats_total, byDepartment };
}

// ============================================================
// FORMAZIONE KPIs - con paginazione
// ============================================================

export async function getFormazioneKpis(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_formazione")
      .select("operator, duration_minutes, created_time")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getFormazioneKpis:", error.message);
    return emptyFormazioneKpis();
  }

  const rows = (data ?? []).filter((r) => asNum(r.duration_minutes) >= 5);
  const total_records = rows.length;
  let total_minutes = 0;
  const byOp = new Map();

  for (const r of rows) {
    const dur = asNum(r.duration_minutes);
    total_minutes += dur;
    if (r.operator) {
      if (!byOp.has(r.operator)) {
        byOp.set(r.operator, { operator: r.operator, count: 0, minutes: 0 });
      }
      const o = byOp.get(r.operator);
      o.count++; o.minutes += dur;
    }
  }

  const operators = Array.from(byOp.values()).sort((a, b) => b.minutes - a.minutes);
  const avg_duration_min = total_records > 0 ? Math.round(total_minutes / total_records) : null;

  return { total_records, total_minutes, avg_duration_min, operators };
}

function emptyFormazioneKpis() {
  return { total_records: 0, total_minutes: 0, avg_duration_min: null, operators: [] };
}

// ============================================================
// ULTIMA SYNC PER FONTE
// ============================================================

export async function getLastSyncByPart() {
  const { data, error } = await supabase
    .from("zoho_sync_log")
    .select("source, status, finished_at, records_synced")
    .eq("status", "success").not("finished_at", "is", null)
    .order("finished_at", { ascending: false }).limit(50);

  if (error) {
    console.error("getLastSyncByPart:", error.message);
    return {};
  }

  const result = {};
  for (const row of data ?? []) {
    if (!result[row.source]) result[row.source] = row;
  }
  return result;
}

// ============================================================
// HEATMAP CHAT
// ============================================================

export async function getChatHeatmap(period) {
  const { from, to } = asDateRange(period);
  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_chat_heatmap")
      .select("day_of_week, hour_of_day, chats_count, attended_count")
      .gte("date", from).lte("date", to)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getChatHeatmap:", error.message);
    return emptyHeatmap();
  }

  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ chats: 0, attended: 0 })),
  );
  let totalChats = 0, maxCellChats = 0;

  for (const row of data ?? []) {
    const d = row.day_of_week, h = row.hour_of_day;
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
    totalChats: 0, maxCellChats: 0,
  };
}

// ============================================================
// TOP VISITATORI CHAT - con paginazione
// ============================================================

export async function getTopVisitors(period, limit = 10) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_chats")
      .select("visitor_name, created_time, operator, duration_seconds")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .not("visitor_name", "is", null)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getTopVisitors:", error.message);
    return [];
  }

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
    .sort((a, b) => b.chats - a.chats).slice(0, limit);
}

// ============================================================
// FORMAZIONE - DETTAGLI - con paginazione
// ============================================================

export async function getFormazioneDetails(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_formazione")
      .select("company, topic, duration_minutes, created_time")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getFormazioneDetails:", error.message);
    return emptyFormazioneDetails();
  }

  const rows = (data ?? []).filter((r) => asNum(r.duration_minutes) >= 5);
  const NO_TOPIC_LABEL = "Tipologia non presente";

  const byCompany = new Map();
  for (const r of rows) {
    if (!r.company) continue;
    const key = r.company.trim();
    if (!byCompany.has(key)) {
      const { name, vat } = splitCompanyName(key);
      byCompany.set(key, {
        company: key, name, vat,
        is_internal: INTERNAL_COMPANIES.has(key),
        sessions: 0, minutes: 0,
      });
    }
    const o = byCompany.get(key);
    o.sessions += 1; o.minutes += asNum(r.duration_minutes);
  }
  const topClients = Array.from(byCompany.values())
    .sort((a, b) => b.minutes - a.minutes).slice(0, 10);

  const byTopic = new Map();
  for (const r of rows) {
    const raw = (r.topic || "").trim();
    const t = raw || NO_TOPIC_LABEL;
    if (!byTopic.has(t)) {
      byTopic.set(t, { topic: t, sessions: 0, minutes: 0, is_untagged: t === NO_TOPIC_LABEL });
    }
    const o = byTopic.get(t);
    o.sessions += 1; o.minutes += asNum(r.duration_minutes);
  }
  const topics = Array.from(byTopic.values()).sort((a, b) => {
    if (a.is_untagged && !b.is_untagged) return 1;
    if (!a.is_untagged && b.is_untagged) return -1;
    return b.sessions - a.sessions;
  });

  const byMonth = new Map();
  for (const r of rows) {
    if (!r.created_time) continue;
    const d = new Date(r.created_time);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, { month: key, sessions: 0, minutes: 0 });
    const o = byMonth.get(key);
    o.sessions += 1; o.minutes += asNum(r.duration_minutes);
  }
  const trend = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

  return { top_clients: topClients, topics, trend, total_sessions: rows.length };
}

function emptyFormazioneDetails() {
  return { top_clients: [], topics: [], trend: [], total_sessions: 0 };
}

// ============================================================
// ASSISTENZA - DETTAGLI ESTESI - con paginazione
// (rimosso filtro isAssistenzaNoise - conta tutto come Zoho)
// ============================================================

export async function getAssistenzaDetails(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data: rows, error: e1 } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_assistenza")
      .select("ticket_id, subject, thread_count, status, channel, assignee, created_time, closed_time, first_response_sec, resolution_sec")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .range(pageFrom, pageTo)
  );

  if (e1) {
    console.error("getAssistenzaDetails created:", e1.message);
    return emptyAssistenzaDetails();
  }
  const allRows = rows ?? [];

  const { data: openRows, error: e2 } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_assistenza")
      .select("status, created_time, assignee, subject, thread_count")
      .in("status", ASSISTENZA_OPEN_STATUSES)
      .range(pageFrom, pageTo)
  );

  let backlogTotal = 0;
  let backlogByStatus = [], oldestDays = null, openUnassignedCount = 0;

  if (!e2 && openRows) {
    backlogTotal = openRows.length;
    const byStatus = new Map();
    let oldestMs = Date.now();

    for (const r of openRows) {
      const s = r.status || "(none)";
      if (!byStatus.has(s)) byStatus.set(s, 0);
      byStatus.set(s, byStatus.get(s) + 1);
      if (!r.assignee) openUnassignedCount++;

      if (r.created_time) {
        const t = new Date(r.created_time).getTime();
        if (!isNaN(t) && t < oldestMs) oldestMs = t;
      }
    }

    backlogByStatus = Array.from(byStatus.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    if (openRows.length > 0) {
      oldestDays = Math.floor((Date.now() - oldestMs) / (1000 * 60 * 60 * 24));
    } else {
      oldestDays = null;
    }
  }

  const { data: syncStatus } = await supabase
    .from("zoho_open_tickets_sync")
    .select("count, last_synced_at").eq("source", "assistenza").maybeSingle();

  const byChannel = new Map();
  for (const r of allRows) {
    const c = r.channel || "(non specificato)";
    if (!byChannel.has(c)) byChannel.set(c, { channel: c, count: 0 });
    byChannel.get(c).count++;
  }
  const channels = Array.from(byChannel.values()).sort((a, b) => b.count - a.count);

  const byStatus2 = new Map();
  for (const r of allRows) {
    const s = r.status || "(non specificato)";
    if (!byStatus2.has(s)) byStatus2.set(s, { status: s, count: 0, is_open: false, is_closed: false });
    const o = byStatus2.get(s);
    o.count++;
    o.is_open = ASSISTENZA_OPEN_STATUSES.includes(s);
    o.is_closed = ASSISTENZA_CLOSED_STATUSES.includes(s);
  }
  const statuses = Array.from(byStatus2.values()).sort((a, b) => b.count - a.count);

  const byAssignee = new Map();
  for (const r of allRows) {
    const a = r.assignee ? normalizeOperatorName(r.assignee) : "(non assegnato)";
    if (!byAssignee.has(a)) {
      byAssignee.set(a, {
        assignee: a, tickets: 0, closed: 0,
        _sumFirst: 0, _countFirst: 0, _sumRes: 0, _countRes: 0,
      });
    }
    const o = byAssignee.get(a);
    o.tickets++;
    if (r.closed_time) o.closed++;
    if (r.first_response_sec != null) { o._sumFirst += asNum(r.first_response_sec); o._countFirst++; }
    if (r.resolution_sec != null) { o._sumRes += asNum(r.resolution_sec); o._countRes++; }
  }
  const assignees = Array.from(byAssignee.values()).map((o) => ({
    assignee: o.assignee, tickets: o.tickets, closed: o.closed,
    pct_closed: o.tickets > 0 ? o.closed / o.tickets : null,
    avg_first_response_sec: o._countFirst > 0 ? Math.round(o._sumFirst / o._countFirst) : null,
    avg_resolution_sec: o._countRes > 0 ? Math.round(o._sumRes / o._countRes) : null,
  })).sort((a, b) => b.tickets - a.tickets);

  const { data: dailyRows } = await supabase
    .from("zoho_daily_assistenza")
    .select("date, new_tickets, closed_tickets, backlog")
    .gte("date", from).lte("date", to)
    .order("date", { ascending: true });

  const trend = (dailyRows ?? []).map((d) => ({
    date: d.date,
    new_tickets: asNum(d.new_tickets),
    closed_tickets: asNum(d.closed_tickets),
    backlog: asNum(d.backlog),
  }));

  return {
    channels, statuses, assignees, trend,
    total_in_period: allRows.length,
    backlog: {
      total: backlogTotal,
      by_status: backlogByStatus, oldest_days: oldestDays,
      unassigned: openUnassignedCount,
      last_synced_at: syncStatus?.last_synced_at ?? null,
    },
  };
}

function emptyAssistenzaDetails() {
  return {
    channels: [], statuses: [], assignees: [], trend: [],
    total_in_period: 0,
    backlog: { total: 0, by_status: [], oldest_days: null, unassigned: 0, last_synced_at: null },
  };
}

// ============================================================
// SVILUPPO - DETTAGLI ESTESI - con paginazione
// ============================================================

export async function getSviluppoDetails(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data: createdRows, error: e1 } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_sviluppo")
      .select("ticket_id, status, channel, assignee, created_time, closed_time, first_response_sec, resolution_sec")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .range(pageFrom, pageTo)
  );

  if (e1) {
    console.error("getSviluppoDetails created:", e1.message);
    return emptySviluppoDetails();
  }
  const rows = createdRows ?? [];

  const { data: openRows, error: e2 } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_sviluppo")
      .select("status, created_time, assignee")
      .in("status", SVILUPPO_OPEN_STATUSES)
      .range(pageFrom, pageTo)
  );

  let backlogTotal = 0, backlogByStatus = [], backlogByAge = [];
  let oldestDays = null, openUnassignedCount = 0;

  if (!e2 && openRows) {
    backlogTotal = openRows.length;

    const byStatus = new Map();
    for (const r of openRows) {
      const s = r.status || "(none)";
      byStatus.set(s, (byStatus.get(s) || 0) + 1);
      if (!r.assignee) openUnassignedCount++;
    }
    backlogByStatus = Array.from(byStatus.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const ageMap = new Map();
    for (const b of SVI_AGE_BUCKETS) {
      ageMap.set(b.key, { key: b.key, label: b.label, count: 0 });
    }
    const now = Date.now();
    let oldestMs = now;

    for (const r of openRows) {
      if (r.created_time) {
        const t = new Date(r.created_time).getTime();
        if (!isNaN(t)) {
          if (t < oldestMs) oldestMs = t;
          const days = Math.floor((now - t) / (1000 * 60 * 60 * 24));
          const bucketKey = ageBucketFor(days);
          if (ageMap.has(bucketKey)) ageMap.get(bucketKey).count++;
        }
      }
    }

    backlogByAge = Array.from(ageMap.values());
    oldestDays = Math.floor((now - oldestMs) / (1000 * 60 * 60 * 24));
  }

  const { data: syncStatus } = await supabase
    .from("zoho_open_tickets_sync")
    .select("count, last_synced_at").eq("source", "sviluppo").maybeSingle();

  const reopenedRows = rows.filter((r) => r.status === "Ticket Ri-Aperto");
  const reopenedCount = reopenedRows.length;

  const byChannel = new Map();
  for (const r of rows) {
    const c = r.channel || "(non specificato)";
    if (!byChannel.has(c)) byChannel.set(c, { channel: c, count: 0 });
    byChannel.get(c).count++;
  }
  const channels = Array.from(byChannel.values()).sort((a, b) => b.count - a.count);

  const byStatus2 = new Map();
  for (const r of rows) {
    const s = r.status || "(non specificato)";
    if (!byStatus2.has(s)) byStatus2.set(s, { status: s, count: 0, is_open: false, is_closed: false });
    const o = byStatus2.get(s);
    o.count++;
    o.is_open = SVILUPPO_OPEN_STATUSES.includes(s);
    o.is_closed = SVILUPPO_CLOSED_STATUSES.includes(s);
  }
  const statuses = Array.from(byStatus2.values()).sort((a, b) => b.count - a.count);

  const byAssignee = new Map();
  for (const r of rows) {
    const a = r.assignee ? normalizeOperatorName(r.assignee) : "(non assegnato)";
    if (!byAssignee.has(a)) {
      byAssignee.set(a, { assignee: a, tickets: 0, closed: 0, open: 0 });
    }
    const o = byAssignee.get(a);
    o.tickets++;
    if (r.closed_time) o.closed++;
    if (SVILUPPO_OPEN_STATUSES.includes(r.status)) o.open++;
  }
  const assignees = Array.from(byAssignee.values())
    .map((o) => ({ ...o, pct_closed: o.tickets > 0 ? o.closed / o.tickets : null }))
    .sort((a, b) => b.tickets - a.tickets);

  const { data: dailyRows } = await supabase
    .from("zoho_daily_sviluppo")
    .select("date, new_tickets, closed_tickets, backlog")
    .gte("date", from).lte("date", to)
    .order("date", { ascending: true });

  const trend = (dailyRows ?? []).map((d) => ({
    date: d.date,
    new_tickets: asNum(d.new_tickets),
    closed_tickets: asNum(d.closed_tickets),
    backlog: asNum(d.backlog),
  }));

  return {
    channels, statuses, assignees, trend,
    total_in_period: rows.length, reopened_count: reopenedCount,
    backlog: {
      total: backlogTotal, by_status: backlogByStatus, by_age: backlogByAge,
      oldest_days: oldestDays, unassigned: openUnassignedCount,
      last_synced_at: syncStatus?.last_synced_at ?? null,
    },
  };
}

function emptySviluppoDetails() {
  return {
    channels: [], statuses: [], assignees: [], trend: [],
    total_in_period: 0, reopened_count: 0,
    backlog: { total: 0, by_status: [], by_age: [], oldest_days: null, unassigned: 0, last_synced_at: null },
  };
}

// ============================================================
// ANALISI CHAT - con paginazione
// ============================================================

export async function getChatAnalysisData(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await fetchAllPaginated((pageFrom, pageTo) =>
    supabase
      .from("zoho_raw_chats")
      .select("chat_id, category, subcategory, sentiment, resolved, created_time, operator, visitor_name")
      .gte("created_time", fromIso).lte("created_time", toIso)
      .not("category", "is", null)
      .range(pageFrom, pageTo)
  );

  if (error) {
    console.error("getChatAnalysisData:", error.message);
    return emptyChatAnalysis();
  }

  const rows = data ?? [];
  const total = rows.length;
  if (total === 0) return emptyChatAnalysis();

  const byCategory = new Map();
  let urgentTotal = 0, negativeTotal = 0, unresolvedTotal = 0;

  for (const r of rows) {
    const cat = r.category || "Altro";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, {
        category: cat, total: 0, urgent: 0, negative: 0,
        unresolved: 0, positive: 0, resolved: 0,
      });
    }
    const o = byCategory.get(cat);
    o.total++;
    if (r.sentiment === "urgente") { o.urgent++; urgentTotal++; }
    if (r.sentiment === "negativo") { o.negative++; negativeTotal++; }
    if (r.sentiment === "positivo") o.positive++;
    if (r.resolved === false) { o.unresolved++; unresolvedTotal++; }
    if (r.resolved === true) o.resolved++;
  }

  const categories = Array.from(byCategory.values()).map((c) => ({
    ...c,
    pct: total > 0 ? (c.total / total) * 100 : 0,
    pct_urgent: c.total > 0 ? (c.urgent / c.total) * 100 : 0,
    pct_unresolved: c.total > 0 ? (c.unresolved / c.total) * 100 : 0,
  })).sort((a, b) => b.total - a.total);

  const bySubcategory = new Map();
  for (const r of rows) {
    if (!r.subcategory) continue;
    const key = `${r.category}::${r.subcategory}`;
    if (!bySubcategory.has(key)) {
      bySubcategory.set(key, {
        category: r.category, subcategory: r.subcategory,
        total: 0, urgent: 0, unresolved: 0,
      });
    }
    const o = bySubcategory.get(key);
    o.total++;
    if (r.sentiment === "urgente") o.urgent++;
    if (r.resolved === false) o.unresolved++;
  }
  const topSubcategories = Array.from(bySubcategory.values())
    .filter((s) => s.total >= 5)
    .sort((a, b) => (b.urgent + b.unresolved) - (a.urgent + a.unresolved))
    .slice(0, 20);

  const byMonth = new Map();
  for (const r of rows) {
    if (!r.created_time) continue;
    const d = new Date(r.created_time);
    if (isNaN(d.getTime())) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const key = `${month}::${r.category}`;
    if (!byMonth.has(key)) byMonth.set(key, { month, category: r.category, count: 0 });
    byMonth.get(key).count++;
  }
  const trend = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

  return {
    total,
    urgent_total: urgentTotal, negative_total: negativeTotal, unresolved_total: unresolvedTotal,
    pct_urgent: total > 0 ? (urgentTotal / total) * 100 : 0,
    pct_unresolved: total > 0 ? (unresolvedTotal / total) * 100 : 0,
    pct_negative: total > 0 ? (negativeTotal / total) * 100 : 0,
    categories, top_subcategories: topSubcategories, trend,
  };
}

function emptyChatAnalysis() {
  return {
    total: 0, urgent_total: 0, negative_total: 0, unresolved_total: 0,
    pct_urgent: 0, pct_unresolved: 0, pct_negative: 0,
    categories: [], top_subcategories: [], trend: [],
  };
}

// ============================================================
// REPORT - DATI AGGREGATI PER PDF/EMAIL
// ============================================================

export async function getReportData(period) {
  const [assistenza, sviluppo, chat, formazione] = await Promise.all([
    getTicketKpis("assistenza", period),
    getTicketKpis("sviluppo", period),
    getChatKpis(period),
    getFormazioneKpis(period),
  ]);

  return { assistenza, sviluppo, chat, formazione };
}

// ============================================================
// DRILL-DOWN: Chat singole per categoria/sottocategoria
// ============================================================

export async function getChatsByCategory({
  category,
  subcategory = null,
  period,
  sentimentFilter = null,
  resolvedFilter = null,
  limit = 100,
  offset = 0,
} = {}) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  let query = supabase
    .from("zoho_raw_chats")
    .select(
      "chat_id, visitor_name, operator, created_time, duration_seconds, category, subcategory, sentiment, resolved, message_count",
      { count: "exact" },
    )
    .eq("category", category)
    .gte("created_time", fromIso)
    .lte("created_time", toIso)
    .order("created_time", { ascending: false })
    .range(offset, offset + limit - 1);

  if (subcategory) query = query.eq("subcategory", subcategory);
  if (sentimentFilter) query = query.eq("sentiment", sentimentFilter);
  if (resolvedFilter !== null) query = query.eq("resolved", resolvedFilter);

  const { data, error, count } = await query;
  if (error) {
    console.error("getChatsByCategory:", error.message);
    return { rows: [], totalCount: 0 };
  }

  return {
    rows: data ?? [],
    totalCount: count ?? 0,
  };
}
