// src/api/zohoData.js
// Layer di accesso ai dati Zoho via Supabase.

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
  return {
    from: toYmd(period.start),
    to: toYmd(period.end),
  };
}

function asNum(v) {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
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
  "Ticket aperto",
  "In attesa",
  "Ticket Ri-Aperto",
  "Passato a Assistenza per check",
];
const SVILUPPO_CLOSED_STATUSES = [
  "Chiuso da Assistenza",
  "Chiuso. Cliente informato",
  "Chiuso. Ticket Risolto",
  "Chiuso. Ticket Non Risolto",
];

const SVI_AGE_BUCKETS = [
  { key: "0-7",       label: "0-7 giorni",     min: 0,    max: 7 },
  { key: "7-30",      label: "7-30 giorni",    min: 7,    max: 30 },
  { key: "30-90",     label: "30-90 giorni",   min: 30,   max: 90 },
  { key: "90-180",    label: "90-180 giorni",  min: 90,   max: 180 },
  { key: "180-365",   label: "180gg-1 anno",   min: 180,  max: 365 },
  { key: "over-365",  label: "Oltre 1 anno",   min: 365,  max: Infinity },
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
// ============================================================

export async function getTicketKpis(which, period) {
  const tableName = which === "sviluppo" ? "zoho_daily_sviluppo" : "zoho_daily_assistenza";
  const rawTable = which === "sviluppo" ? "zoho_raw_sviluppo" : "zoho_raw_assistenza";
  const { from, to } = asDateRange(period);

  const { data: daily, error: dailyErr } = await supabase
    .from(tableName)
    .select("date, new_tickets, closed_tickets, backlog")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (dailyErr) {
    console.error(`getTicketKpis ${which} daily:`, dailyErr.message);
    return emptyTicketKpis();
  }

  let new_tickets = 0;
  let closed_tickets = 0;
  let max_backlog = 0;
  for (const row of daily ?? []) {
    new_tickets += asNum(row.new_tickets);
    closed_tickets += asNum(row.closed_tickets);
    if (asNum(row.backlog) > max_backlog) max_backlog = asNum(row.backlog);
  }

  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data: slaRows } = await supabase
    .from(rawTable)
    .select("first_response_sec, avg_response_sec, resolution_sec")
    .gte("created_time", fromIso)
    .lte("created_time", toIso)
    .not("first_response_sec", "is", null);

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
    new_tickets,
    closed_tickets,
    max_backlog,
    avg_first_response_sec: countFirst > 0 ? Math.round(sumFirst / countFirst) : null,
    avg_response_sec: countResp > 0 ? Math.round(sumResp / countResp) : null,
    avg_resolution_sec: countRes > 0 ? Math.round(sumRes / countRes) : null,
    sla_sample_size: countFirst,
  };
}

function emptyTicketKpis() {
  return {
    new_tickets: 0,
    closed_tickets: 0,
    max_backlog: 0,
    avg_first_response_sec: null,
    avg_response_sec: null,
    avg_resolution_sec: null,
    sla_sample_size: 0,
  };
}

// ============================================================
// CHAT KPIs
// ============================================================

export async function getChatKpis(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await supabase
    .from("vw_chats_valid")
    .select("operator, department, waiting_time_seconds, duration_seconds, created_time")
    .gte("created_time", fromIso)
    .lte("created_time", toIso);

  if (error) {
    console.error("getChatKpis:", error.message);
    return emptyChatKpis();
  }

  const rows = data ?? [];
  const chats_total = rows.length;

  let chats_attended = 0;
  let chats_missed = 0;
  let sumWait = 0, countWait = 0;
  let sumDur = 0, countDur = 0;

  const byOp = new Map();

  for (const r of rows) {
    const hasOp = !!r.operator;
    if (hasOp) chats_attended++;
    else chats_missed++;

    if (r.waiting_time_seconds != null && r.waiting_time_seconds > 0) {
      sumWait += asNum(r.waiting_time_seconds);
      countWait++;
    }
    if (r.duration_seconds != null && r.duration_seconds > 0) {
      sumDur += asNum(r.duration_seconds);
      countDur++;
    }

    if (hasOp) {
      const opKey = r.operator;
      if (!byOp.has(opKey)) {
        byOp.set(opKey, {
          operator: opKey,
          chats: 0, attended: 0, missed: 0,
          _sumWait: 0, _countWait: 0,
          _sumDur: 0, _countDur: 0,
        });
      }
      const o = byOp.get(opKey);
      o.chats++;
      o.attended++;
      if (r.waiting_time_seconds != null && r.waiting_time_seconds > 0) {
        o._sumWait += asNum(r.waiting_time_seconds);
        o._countWait++;
      }
      if (r.duration_seconds != null && r.duration_seconds > 0) {
        o._sumDur += asNum(r.duration_seconds);
        o._countDur++;
      }
    }
  }

  const operators = Array.from(byOp.values())
    .map((o) => ({
      operator: o.operator,
      chats: o.chats,
      attended: o.attended,
      missed: o.missed,
      avg_wait_sec: o._countWait > 0 ? Math.round(o._sumWait / o._countWait) : null,
      avg_duration_sec: o._countDur > 0 ? Math.round(o._sumDur / o._countDur) : null,
    }))
    .sort((a, b) => b.chats - a.chats);

  return {
    chats_total,
    chats_attended,
    chats_missed,
    avg_waiting_sec: countWait > 0 ? Math.round(sumWait / countWait) : null,
    avg_duration_sec: countDur > 0 ? Math.round(sumDur / countDur) : null,
    operators,
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
  };
}

// ============================================================
// FORMAZIONE KPIs
// ============================================================

export async function getFormazioneKpis(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data, error } = await supabase
    .from("zoho_raw_formazione")
    .select("operator, duration_minutes, created_time")
    .gte("created_time", fromIso)
    .lte("created_time", toIso);

  if (error) {
    console.error("getFormazioneKpis:", error.message);
    return emptyFormazioneKpis();
  }

  const rows = data ?? [];
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
      o.count++;
      o.minutes += dur;
    }
  }

  const operators = Array.from(byOp.values())
    .sort((a, b) => b.minutes - a.minutes);

  const avg_duration_min = total_records > 0
    ? Math.round(total_minutes / total_records)
    : null;

  return {
    total_records,
    total_minutes,
    avg_duration_min,
    operators,
  };
}

function emptyFormazioneKpis() {
  return {
    total_records: 0,
    total_minutes: 0,
    avg_duration_min: null,
    operators: [],
  };
}

// ============================================================
// ULTIMA SYNC PER FONTE
// ============================================================

export async function getLastSyncByPart() {
  const { data, error } = await supabase
    .from("zoho_sync_log")
    .select("source, status, finished_at, records_synced")
    .eq("status", "success")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getLastSyncByPart:", error.message);
    return {};
  }

  const result = {};
  for (const row of data ?? []) {
    if (!result[row.source]) {
      result[row.source] = row;
    }
  }
  return result;
}

// ============================================================
// HEATMAP CHAT
// ============================================================

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
// TOP VISITATORI CHAT
// ============================================================

export async function getTopVisitors(period, limit = 10) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

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

// ============================================================
// FORMAZIONE - DETTAGLI
// ============================================================

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

// ============================================================
// ASSISTENZA - DETTAGLI ESTESI
// ============================================================

export async function getAssistenzaDetails(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data: createdRows, error: e1 } = await supabase
    .from("zoho_raw_assistenza")
    .select("ticket_id, status, channel, assignee, created_time, closed_time, first_response_sec, resolution_sec")
    .gte("created_time", fromIso)
    .lte("created_time", toIso);

  if (e1) {
    console.error("getAssistenzaDetails created:", e1.message);
    return emptyAssistenzaDetails();
  }
  const rows = createdRows ?? [];

  const { data: openRows, error: e2 } = await supabase
    .from("zoho_raw_assistenza")
    .select("status, created_time, assignee")
    .in("status", ASSISTENZA_OPEN_STATUSES);

  let backlogTotal = 0;
  let backlogByStatus = [];
  let oldestDays = null;
  let openUnassignedCount = 0;

  if (!e2 && openRows) {
    backlogTotal = openRows.length;

    const byStatus = new Map();
    for (const r of openRows) {
      const s = r.status || "(none)";
      if (!byStatus.has(s)) byStatus.set(s, 0);
      byStatus.set(s, byStatus.get(s) + 1);
      if (!r.assignee) openUnassignedCount++;
    }
    backlogByStatus = Array.from(byStatus.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const now = Date.now();
    let oldestMs = now;
    for (const r of openRows) {
      if (r.created_time) {
        const t = new Date(r.created_time).getTime();
        if (!isNaN(t) && t < oldestMs) oldestMs = t;
      }
    }
    oldestDays = Math.floor((now - oldestMs) / (1000 * 60 * 60 * 24));
  }

  const { data: syncStatus } = await supabase
    .from("zoho_open_tickets_sync")
    .select("count, last_synced_at")
    .eq("source", "assistenza")
    .maybeSingle();

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
    o.is_open = ASSISTENZA_OPEN_STATUSES.includes(s);
    o.is_closed = ASSISTENZA_CLOSED_STATUSES.includes(s);
  }
  const statuses = Array.from(byStatus2.values()).sort((a, b) => b.count - a.count);

  const byAssignee = new Map();
  for (const r of rows) {
    const rawName = r.assignee;
    const a = rawName ? normalizeOperatorName(rawName) : "(non assegnato)";
    if (!byAssignee.has(a)) {
      byAssignee.set(a, {
        assignee: a,
        tickets: 0,
        closed: 0,
        _sumFirst: 0,
        _countFirst: 0,
        _sumRes: 0,
        _countRes: 0,
      });
    }
    const o = byAssignee.get(a);
    o.tickets++;
    if (r.closed_time) o.closed++;
    if (r.first_response_sec != null) {
      o._sumFirst += asNum(r.first_response_sec);
      o._countFirst++;
    }
    if (r.resolution_sec != null) {
      o._sumRes += asNum(r.resolution_sec);
      o._countRes++;
    }
  }
  const assignees = Array.from(byAssignee.values())
    .map((o) => ({
      assignee: o.assignee,
      tickets: o.tickets,
      closed: o.closed,
      pct_closed: o.tickets > 0 ? o.closed / o.tickets : null,
      avg_first_response_sec: o._countFirst > 0 ? Math.round(o._sumFirst / o._countFirst) : null,
      avg_resolution_sec: o._countRes > 0 ? Math.round(o._sumRes / o._countRes) : null,
    }))
    .sort((a, b) => b.tickets - a.tickets);

  const { data: dailyRows } = await supabase
    .from("zoho_daily_assistenza")
    .select("date, new_tickets, closed_tickets, backlog")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  const trend = (dailyRows ?? []).map((d) => ({
    date: d.date,
    new_tickets: asNum(d.new_tickets),
    closed_tickets: asNum(d.closed_tickets),
    backlog: asNum(d.backlog),
  }));

  return {
    channels,
    statuses,
    assignees,
    trend,
    total_in_period: rows.length,
    backlog: {
      total: backlogTotal,
      by_status: backlogByStatus,
      oldest_days: oldestDays,
      unassigned: openUnassignedCount,
      last_synced_at: syncStatus?.last_synced_at ?? null,
    },
  };
}

function emptyAssistenzaDetails() {
  return {
    channels: [],
    statuses: [],
    assignees: [],
    trend: [],
    total_in_period: 0,
    backlog: {
      total: 0,
      by_status: [],
      oldest_days: null,
      unassigned: 0,
      last_synced_at: null,
    },
  };
}

// ============================================================
// SVILUPPO - DETTAGLI ESTESI
// ============================================================

export async function getSviluppoDetails(period) {
  const { from, to } = asDateRange(period);
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data: createdRows, error: e1 } = await supabase
    .from("zoho_raw_sviluppo")
    .select("ticket_id, status, channel, assignee, created_time, closed_time, first_response_sec, resolution_sec")
    .gte("created_time", fromIso)
    .lte("created_time", toIso);

  if (e1) {
    console.error("getSviluppoDetails created:", e1.message);
    return emptySviluppoDetails();
  }
  const rows = createdRows ?? [];

  const { data: openRows, error: e2 } = await supabase
    .from("zoho_raw_sviluppo")
    .select("status, created_time, assignee")
    .in("status", SVILUPPO_OPEN_STATUSES);

  let backlogTotal = 0;
  let backlogByStatus = [];
  let backlogByAge = [];
  let oldestDays = null;
  let openUnassignedCount = 0;

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
          if (ageMap.has(bucketKey)) {
            ageMap.get(bucketKey).count++;
          }
        }
      }
    }

    backlogByAge = Array.from(ageMap.values());
    oldestDays = Math.floor((now - oldestMs) / (1000 * 60 * 60 * 24));
  }

  const { data: syncStatus } = await supabase
    .from("zoho_open_tickets_sync")
    .select("count, last_synced_at")
    .eq("source", "sviluppo")
    .maybeSingle();

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
    if (!byStatus2.has(s)) {
      byStatus2.set(s, { status: s, count: 0, is_open: false, is_closed: false });
    }
    const o = byStatus2.get(s);
    o.count++;
    o.is_open = SVILUPPO_OPEN_STATUSES.includes(s);
    o.is_closed = SVILUPPO_CLOSED_STATUSES.includes(s);
  }
  const statuses = Array.from(byStatus2.values()).sort((a, b) => b.count - a.count);

  const byAssignee = new Map();
  for (const r of rows) {
    const rawName = r.assignee;
    const a = rawName ? normalizeOperatorName(rawName) : "(non assegnato)";
    if (!byAssignee.has(a)) {
      byAssignee.set(a, {
        assignee: a,
        tickets: 0,
        closed: 0,
        open: 0,
      });
    }
    const o = byAssignee.get(a);
    o.tickets++;
    if (r.closed_time) o.closed++;
    if (SVILUPPO_OPEN_STATUSES.includes(r.status)) o.open++;
  }
  const assignees = Array.from(byAssignee.values())
    .map((o) => ({
      ...o,
      pct_closed: o.tickets > 0 ? o.closed / o.tickets : null,
    }))
    .sort((a, b) => b.tickets - a.tickets);

  const { data: dailyRows } = await supabase
    .from("zoho_daily_sviluppo")
    .select("date, new_tickets, closed_tickets, backlog")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  const trend = (dailyRows ?? []).map((d) => ({
    date: d.date,
    new_tickets: asNum(d.new_tickets),
    closed_tickets: asNum(d.closed_tickets),
    backlog: asNum(d.backlog),
  }));

  return {
    channels,
    statuses,
    assignees,
    trend,
    total_in_period: rows.length,
    reopened_count: reopenedCount,
    backlog: {
      total: backlogTotal,
      by_status: backlogByStatus,
      by_age: backlogByAge,
      oldest_days: oldestDays,
      unassigned: openUnassignedCount,
      last_synced_at: syncStatus?.last_synced_at ?? null,
    },
  };
}

function emptySviluppoDetails() {
  return {
    channels: [],
    statuses: [],
    assignees: [],
    trend: [],
    total_in_period: 0,
    reopened_count: 0,
    backlog: {
      total: 0,
      by_status: [],
      by_age: [],
      oldest_days: null,
      unassigned: 0,
      last_synced_at: null,
    },
  };
}
// ============================================================
// REPORT - DATI AGGREGATI PER MANAGEMENT
// ============================================================

/**
 * Aggrega TUTTI i dati di un periodo per generare il report.
 * Restituisce un oggetto strutturato con:
 *   - Volumi sintetici
 *   - Sezione Assistenza (KPI + top operatori)
 *   - Sezione Chat (KPI + top operatori)
 *   - Sezione Formazione (KPI + top clienti)
 *   - Sezione Sviluppo (KPI + backlog)
 *   - Punti di attenzione (insight automatici)
 */
export async function getReportData(period) {
  const { from, to } = asDateRange(period);

  // Recupero in parallelo tutti i KPI principali
  const [
    assistenzaKpis,
    sviluppoKpis,
    chatKpis,
    formazioneKpis,
    assistenzaDetails,
    sviluppoDetails,
    formazioneDetails,
  ] = await Promise.all([
    getTicketKpis("assistenza", period),
    getTicketKpis("sviluppo", period),
    getChatKpis(period),
    getFormazioneKpis(period),
    getAssistenzaDetails(period),
    getSviluppoDetails(period),
    getFormazioneDetails(period),
  ]);

  // Costruisco insight automatici per i "punti di attenzione"
  const attentionPoints = [];

  // Backlog Sviluppo "abbandonato"
  if (sviluppoDetails?.backlog?.by_age) {
    const oldBuckets = sviluppoDetails.backlog.by_age.filter(
      (b) => ["90-180", "180-365", "over-365"].includes(b.key)
    );
    const oldCount = oldBuckets.reduce((sum, b) => sum + b.count, 0);
    if (oldCount > 0) {
      attentionPoints.push(
        `Backlog Sviluppo: ${sviluppoDetails.backlog.total} ticket aperti, ` +
        `di cui ${oldCount} fermi da oltre 90 giorni`
      );
    }
  }

  // Ticket Assistenza non assegnati
  if (assistenzaDetails?.backlog?.unassigned > 0) {
    attentionPoints.push(
      `${assistenzaDetails.backlog.unassigned} ticket Assistenza non assegnati al momento`
    );
  }

  // Ticket Assistenza vecchi
  if (assistenzaDetails?.backlog?.oldest_days > 30) {
    attentionPoints.push(
      `Ticket Assistenza più vecchio aperto da ${assistenzaDetails.backlog.oldest_days} giorni`
    );
  }

  // Ticket riaperti Sviluppo
  if (sviluppoDetails?.reopened_count > 0) {
    attentionPoints.push(
      `${sviluppoDetails.reopened_count} ticket Sviluppo riaperti nel periodo (qualità risoluzione)`
    );
  }

  return {
    period: { from, to },
    generated_at: new Date().toISOString(),
    assistenza: {
      ...assistenzaKpis,
      top_operators: assistenzaDetails?.assignees?.slice(0, 5) ?? [],
      channels: assistenzaDetails?.channels ?? [],
      backlog_current: assistenzaDetails?.backlog ?? null,
    },
    sviluppo: {
      ...sviluppoKpis,
      top_operators: sviluppoDetails?.assignees?.slice(0, 5) ?? [],
      backlog_current: sviluppoDetails?.backlog ?? null,
      reopened_count: sviluppoDetails?.reopened_count ?? 0,
    },
    chat: {
      ...chatKpis,
      top_operators: chatKpis?.operators?.slice(0, 5) ?? [],
    },
    formazione: {
      ...formazioneKpis,
      top_clients: formazioneDetails?.top_clients?.slice(0, 5) ?? [],
      topics_count: formazioneDetails?.topics?.length ?? 0,
    },
    attention_points: attentionPoints,
  };
}
