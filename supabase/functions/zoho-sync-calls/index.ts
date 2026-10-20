// supabase/functions/zoho-sync-calls/index.ts
//
// Sincronizza le chiamate registrate dal centralino 3CX nel modulo Calls di
// Zoho CRM verso la tabella zoho_calls (scheda "Chiamate" del cruscotto).
//
// Cosa ricava da ogni chiamata (il centralino scrive tutto nella Descrizione):
//   uscita : "dd/mm/yyyy hh:mm: Answered|Unanswered outgoing call from 234 to 3331234567 Rossi, Mario (IT0123 - Ragione Sociale) (01:39)"
//   entrata: "dd/mm/yyyy hh:mm: Answered incoming call from 3331234567 Rossi, Mario (IT0123 - Ragione Sociale) to 800 (00:04)"
//   persa  : "... Missed call from 3331234567 ... to 801"   oppure Call_Type "Non risposta" (Subject "Chiamata persa da NOME (+39...)")
// L'operatore è l'interno (3 cifre): il nome e il reparto stanno in call_extensions.
//
// Accesso protetto: solo x-cron-secret (lavori programmati) o utente autorizzato.
//
// Modalità:
//   ?action=peek        -> 3 record grezzi di esempio (verifica dei campi)
//   ?since=YYYY-MM-DD   -> recupero dalla data indicata (backfill)
//   (default)           -> ultimi 14 giorni

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CRM_HOST = "https://www.zohoapis.eu";
const PAGE_LIMIT = 200;
const MAX_PAGES = 60; // 60 x 200 = 12.000 chiamate
const LOOKBACK_DAYS = 14;
const FIELDS = [
  "Subject", "Call_Type", "Call_Start_Time", "Call_Duration_in_seconds",
  "Call_Result", "Description", "Who_Id", "What_Id", "Owner", "Created_Time", "$se_module",
].join(",");

function supa() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Segreto dei lavori programmati oppure utente autorizzato.
async function isAuthorized(req: Request): Promise<boolean> {
  try {
    const sb = supa();
    const secret = req.headers.get("x-cron-secret");
    if (secret) {
      const { data } = await sb.rpc("check_cron_secret", { p_secret: secret });
      if (data === true) return true;
    }
    const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
    if (m) {
      const { data } = await sb.auth.getUser(m[1]);
      const email = data?.user?.email;
      if (email) {
        const { data: ok } = await sb.rpc("internal_user_allowed", { p_email: email });
        if (ok === true) return true;
      }
    }
  } catch (_) { /* in dubbio, si nega */ }
  return false;
}

async function getAccessToken(): Promise<string> {
  const sb = supa();
  const { data, error } = await sb
    .from("zoho_credentials")
    .select("refresh_token, client_id, accounts_url, access_token, access_token_expires_at")
    .eq("source", "global")
    .single();
  if (error || !data) throw new Error("Credenziali Zoho non trovate.");

  if (data.access_token && data.access_token_expires_at) {
    const expiresAt = new Date(data.access_token_expires_at).getTime();
    if (expiresAt > Date.now() + 5 * 60 * 1000) return data.access_token;
  }

  const params = new URLSearchParams({
    refresh_token: data.refresh_token,
    client_id: data.client_id,
    client_secret: Deno.env.get("ZOHO_CLIENT_SECRET")!,
    grant_type: "refresh_token",
  });
  const r = await fetch(`${data.accounts_url}/oauth/v2/token?${params}`, { method: "POST" });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Refresh token Zoho fallito: ${JSON.stringify(j)}`);
  const expiresInSec: number = j.expires_in ?? 3600;
  await sb.from("zoho_credentials").update({
    access_token: j.access_token,
    access_token_expires_at: new Date(Date.now() + expiresInSec * 900).toISOString(),
  }).eq("source", "global");
  return j.access_token as string;
}

async function crmGet(path: string, token: string): Promise<unknown> {
  const r = await fetch(`${CRM_HOST}${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (r.status === 204) return { data: [] };
  if (!r.ok) throw new Error(`CRM GET ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

interface CrmCall {
  id: string;
  Subject?: string;
  Call_Type?: string;
  Call_Start_Time?: string;
  Call_Duration_in_seconds?: number;
  Call_Result?: string | null;
  Description?: string | null;
  Who_Id?: { id?: string; name?: string } | null;
  What_Id?: { id?: string; name?: string } | null;
  Owner?: { name?: string } | null;
  Created_Time?: string;
  "$se_module"?: string;
}

const MODULE_LABEL: Record<string, string> = {
  Contacts: "Contatto", Leads: "Lead", Accounts: "Azienda", Deals: "Trattativa",
};

const cleanPhone = (s: string | null | undefined) => (s ?? "").replace(/[^\d+]/g, "") || null;

// Estrae "(PIVA - Ragione sociale)" dal testo del centralino.
function parseCompany(text: string): { vat: string | null; company: string | null } {
  const m = text.match(/\(((?:[A-Z]{2})?\d{6,})\s*-\s*([^)]+)\)?/);
  return m ? { vat: m[1], company: m[2].trim() } : { vat: null, company: null };
}

export function mapCall(c: CrmCall) {
  const start = c.Call_Start_Time ?? c.Created_Time;
  if (!start) return null;
  const desc = c.Description ?? "";
  const subject = c.Subject ?? "";
  const type = c.Call_Type ?? "";
  const isOutbound = /uscit|outbound/i.test(type);

  let extension: string | null = null;
  let phone: string | null = null;
  let rest = "";
  let outcome: "Risposta" | "Senza risposta" | "Persa";

  if (isOutbound) {
    const m = desc.match(/from\s+(\d{3})\s+to\s+(\+?\d[\d ]{5,})\s*(.*)$/);
    if (m) {
      extension = m[1];
      phone = cleanPhone(m[2]);
      rest = m[3];
    }
    outcome = /Unanswered/i.test(desc) || c.Call_Result === "Failed" ? "Senza risposta" : "Risposta";
  } else {
    const m = desc.match(/from\s+(\+?\d[\d ]{5,})\s*(.*?)\s+to\s+(\d{3})(?:\s*\(\d{2}:\d{2}(?::\d{2})?\))?\s*$/);
    if (m) {
      phone = cleanPhone(m[1]);
      rest = m[2];
      extension = m[3];
    } else {
      // "Chiamata persa da NOME (+39...)": nessun interno
      const p = subject.match(/\((\+?\d+)\)\s*$/);
      phone = cleanPhone(p?.[1]);
      rest = subject.replace(/^Chiamata persa da\s*/i, "").replace(/\s*\(\+?\d+\)\s*$/, "");
    }
    outcome = /Missed/i.test(desc) || /non risposta|missed/i.test(type) ? "Persa" : "Risposta";
  }

  const { vat, company } = parseCompany(rest);
  const restName = rest.replace(/\s*\([^)]*\)?\s*$/, "").trim().replace(/^,|,$/g, "").trim();
  const who = c.Who_Id ?? null;
  const contactName = who?.name || restName || c.What_Id?.name || null;
  const customer = company || contactName || "(sconosciuto)";
  const module = c["$se_module"];

  return {
    zoho_call_id: c.id,
    started_at: new Date(start).toISOString(),
    direction: isOutbound ? "Uscita" : "Entrata",
    outcome,
    duration_sec: Math.max(0, Math.round(c.Call_Duration_in_seconds ?? 0)),
    extension,
    customer,
    contact_name: company ? contactName : null,
    vat_number: vat,
    customer_phone: phone,
    record_type: who?.id || c.What_Id?.id ? (module ? (MODULE_LABEL[module] ?? module) : null) : null,
    zoho_who_id: who?.id ?? c.What_Id?.id ?? null,
    zoho_owner: c.Owner?.name ?? null,
    synced_at: new Date().toISOString(),
  };
}

async function fetchPage(token: string, pageToken?: string) {
  const base = `/crm/v8/Calls?fields=${encodeURIComponent(FIELDS)}&per_page=${PAGE_LIMIT}` +
    `&sort_by=Created_Time&sort_order=desc`;
  const path = pageToken ? `${base}&page_token=${pageToken}` : base;
  return (await crmGet(path, token)) as {
    data?: CrmCall[];
    info?: { more_records?: boolean; next_page_token?: string };
  };
}

async function runPeek() {
  const token = await getAccessToken();
  const res = await fetchPage(token);
  return { samples: (res.data ?? []).slice(0, 3), info: res.info };
}

async function runSync(sinceIso: string) {
  const sb = supa();
  const { data: logRow } = await sb
    .from("zoho_sync_log")
    .insert({ source: "crm_calls", status: "running" })
    .select()
    .single();

  try {
    const token = await getAccessToken();
    const sinceMs = new Date(sinceIso).getTime();
    let pageToken: string | undefined;
    let pages = 0;
    let synced = 0;
    let skipped = 0;
    let reachedOld = false;

    while (!reachedOld && pages < MAX_PAGES) {
      pages++;
      const res = await fetchPage(token, pageToken);
      const batch = res.data ?? [];
      if (batch.length === 0) break;

      const rows: NonNullable<ReturnType<typeof mapCall>>[] = [];
      for (const c of batch) {
        const created = new Date(c.Created_Time ?? c.Call_Start_Time ?? 0).getTime();
        if (created < sinceMs) { reachedOld = true; continue; }
        const row = mapCall(c);
        if (row) rows.push(row); else skipped++;
      }
      if (rows.length) {
        const { error } = await sb.from("zoho_calls").upsert(rows, { onConflict: "zoho_call_id" });
        if (error) throw new Error(`Errore upsert zoho_calls: ${error.message}`);
        synced += rows.length;
      }
      if (res.info?.more_records !== true || !res.info?.next_page_token) break;
      pageToken = res.info.next_page_token;
    }

    if (logRow) {
      await sb.from("zoho_sync_log").update({
        status: "success", records_synced: synced, finished_at: new Date().toISOString(),
      }).eq("id", logRow.id);
    }
    return { ok: true, records_synced: synced, skipped, pages, since: sinceIso };
  } catch (err) {
    const msg = (err as Error).message;
    if (logRow) {
      await sb.from("zoho_sync_log").update({
        status: "error", error_message: msg, finished_at: new Date().toISOString(),
      }).eq("id", logRow.id);
    }
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await isAuthorized(req))) {
    return new Response(JSON.stringify({ ok: false, error: "Non autorizzato" }, null, 2), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const url = new URL(req.url);
    let result;
    if (url.searchParams.get("action") === "peek") {
      result = await runPeek();
    } else {
      const since = url.searchParams.get("since");
      const sinceIso = since && /^\d{4}-\d{2}-\d{2}$/.test(since)
        ? `${since}T00:00:00+00:00`
        : new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
      result = await runSync(sinceIso);
    }
    return new Response(JSON.stringify(result, null, 2), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }, null, 2), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
