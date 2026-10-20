// src/pages/Chiamate.jsx
//
// Chiamate telefoniche del team Assistenza, registrate dal centralino 3CX in Zoho CRM.
// Per ogni chiamata: nominativo (chi ha chiamato o risposto), durata, direzione
// (entrata / uscita) e cliente di riferimento.
//
// Dati: vista v_zoho_calls (tabella zoho_calls, sincronizzata da zoho-sync-calls, +
// call_extensions per nome e reparto dell'interno). Vedi supabase/calls-setup.sql.
//
// Perimetro "Assistenza" = interni segnati come Assistenza in call_extensions.
// Per spostare una persona basta aggiornare quella tabella.

import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  Timer,
  Bot,
  Search,
  Download,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { getCalls } from "../api/callsData";
import { formatNumber } from "../lib/format";

const PAGE_SIZE = 50;
const SCOPES = [
  ["Assistenza", "Team assistenza"],
  ["Receptionist digitale", "Receptionist digitale"],
  ["tutte", "Tutte le chiamate"],
];

// Durata di una chiamata: m:ss (oltre l'ora h:mm:ss)
function fmtDur(sec) {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// Tempo complessivo, per i totali: "13h 51m"
function fmtTotal(sec) {
  if (!sec) return "0m";
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

const fmtWhen = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
};

// Solo le chiamate con risposta contano come tempo di conversazione:
// per le altre la durata e' solo tempo di squillo.
const talkSec = (c) => (c.outcome === "Risposta" ? c.duration_sec : 0);

export default function Chiamate({ period }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState("Assistenza");
  const [operator, setOperator] = useState("");
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCalls(period.from, period.to)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [period.from, period.to]);

  // Chiamate del perimetro scelto (prima dei filtri di dettaglio)
  const inScope = useMemo(
    () => (rows ?? []).filter((c) => scope === "tutte" || c.perimetro === scope),
    [rows, scope],
  );

  const operators = useMemo(
    () => [...new Set(inScope.map((c) => c.operator_name))].sort((a, b) => a.localeCompare(b, "it")),
    [inScope],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inScope.filter((c) => {
      if (operator && c.operator_name !== operator) return false;
      if (direction && c.direction !== direction) return false;
      if (!q) return true;
      return [c.customer, c.contact_name, c.vat_number, c.customer_phone, c.operator_name]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [inScope, operator, direction, search]);

  // Cambiando filtri si torna alla prima pagina
  useEffect(() => { setPage(0); }, [scope, operator, direction, search, period.from, period.to]);

  const totals = useMemo(() => summarize(filtered), [filtered]);
  const perOperator = useMemo(() => byOperator(inScope), [inScope]);
  const receptionist = useMemo(
    () => (rows ?? []).filter((c) => c.perimetro === "Receptionist digitale"),
    [rows],
  );

  if (error && !rows) return <SetupHint message={error} />;
  if (!rows) return <Loading size="lg" label="Caricamento chiamate..." />;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className={`space-y-8 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
      {/* Intestazione + perimetro */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Chiamate</h2>
          <p className="text-sm text-slate-600 mt-1">
            Chi ha chiamato o risposto, quanto è durata, se in entrata o in uscita e con quale cliente.
            Dati del centralino registrati in Zoho CRM.
          </p>
        </div>
        <div className="inline-flex bg-slate-100 rounded-lg p-1">
          {SCOPES.map(([k, t]) => (
            <button
              key={k}
              onClick={() => { setScope(k); setOperator(""); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                scope === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Aggiornamento non riuscito: {error}. Sono mostrati gli ultimi dati caricati.</span>
        </div>
      )}

      {/* Indicatori */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Tile icon={Phone} label="Chiamate" value={formatNumber(totals.total)} />
        <Tile icon={PhoneIncoming} label="In entrata" value={formatNumber(totals.inbound)}
          hint={`${formatNumber(totals.inboundAnswered)} con risposta`} />
        <Tile icon={PhoneOutgoing} label="In uscita" value={formatNumber(totals.outbound)}
          hint={totals.outbound ? `${Math.round((totals.outboundAnswered / totals.outbound) * 100)}% con risposta` : "—"} />
        <Tile icon={Clock} label="Tempo in conversazione" value={fmtTotal(totals.talk)} hint="Solo chiamate con risposta" />
        <Tile icon={Timer} label="Durata media" value={totals.answered ? fmtDur(totals.talk / totals.answered) : "—"}
          hint="Per chiamata con risposta" />
      </section>

      {scope === "Assistenza" && receptionist.length > 0 && <ReceptionistNote rows={receptionist} />}

      {/* Per operatore */}
      {perOperator.length > 0 && (
        <section>
          <SectionTitle title="Per operatore" hint="Nel perimetro selezionato. Clicca un nome per filtrare l'elenco." />
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Nominativo</th>
                  <th className="text-right px-4 py-2">Chiamate</th>
                  <th className="text-right px-4 py-2">In entrata</th>
                  <th className="text-right px-4 py-2">In uscita</th>
                  <th className="text-right px-4 py-2">Tempo in conversazione</th>
                  <th className="text-right px-4 py-2">Durata media</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perOperator.map((o) => (
                  <tr key={o.name} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setOperator(operator === o.name ? "" : o.name)}
                        className={`font-medium hover:underline ${operator === o.name ? "text-indigo-700" : "text-slate-900"}`}
                      >
                        {o.name}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(o.total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(o.inbound)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(o.outbound)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtTotal(o.talk)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{o.answered ? fmtDur(o.talk / o.answered) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Elenco chiamate */}
      <section>
        <SectionTitle
          title="Elenco chiamate"
          hint={`${formatNumber(filtered.length)} chiamate nel periodo selezionato`}
          action={
            <button
              onClick={() => exportCsv(filtered, period)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download size={15} />
              Scarica CSV
            </button>
          }
        />

        <div className="flex items-center gap-3 flex-wrap mb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca cliente, P.IVA, numero…"
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-72 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="">Tutti gli operatori</option>
            {operators.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="">Entrata e uscita</option>
            <option value="Entrata">Solo in entrata</option>
            <option value="Uscita">Solo in uscita</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
            Nessuna chiamata con questi filtri nel periodo selezionato.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Data e ora</th>
                  <th className="text-left px-4 py-2">Nominativo</th>
                  <th className="text-left px-4 py-2">Direzione</th>
                  <th className="text-right px-4 py-2">Durata</th>
                  <th className="text-left px-4 py-2">Cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c) => (
                  <tr key={c.zoho_call_id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600 tabular-nums">{fmtWhen(c.started_at)}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-medium text-slate-900">{c.operator_name}</td>
                    <td className="px-4 py-2 whitespace-nowrap"><DirectionBadge call={c} /></td>
                    <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                      {fmtDur(c.duration_sec)}
                      {c.outcome !== "Risposta" && (
                        <div className="text-[11px] text-slate-400">
                          {c.outcome === "Persa" ? "persa" : "senza risposta"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{c.customer}</div>
                      <div className="text-xs text-slate-500">
                        {[c.contact_name, c.vat_number, c.customer_phone].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} di {formatNumber(filtered.length)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                aria-label="Pagina precedente"
              >
                <ChevronLeft size={16} />
              </button>
              <span>Pagina {page + 1} di {pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={page >= pages - 1}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                aria-label="Pagina successiva"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Le chiamate perse in entrata sono registrate in Zoho solo in parte: il numero reale è più alto.
        La durata delle chiamate senza risposta è solo tempo di squillo e non conta come conversazione.
      </p>
    </div>
  );
}

function summarize(list) {
  const t = { total: list.length, inbound: 0, outbound: 0, inboundAnswered: 0, outboundAnswered: 0, answered: 0, talk: 0 };
  for (const c of list) {
    const answered = c.outcome === "Risposta";
    if (c.direction === "Entrata") { t.inbound++; if (answered) t.inboundAnswered++; }
    else { t.outbound++; if (answered) t.outboundAnswered++; }
    if (answered) t.answered++;
    t.talk += talkSec(c);
  }
  return t;
}

function byOperator(list) {
  const m = new Map();
  for (const c of list) {
    const o = m.get(c.operator_name) ?? { name: c.operator_name, total: 0, inbound: 0, outbound: 0, answered: 0, talk: 0 };
    o.total++;
    if (c.direction === "Entrata") o.inbound++; else o.outbound++;
    if (c.outcome === "Risposta") o.answered++;
    o.talk += talkSec(c);
    m.set(c.operator_name, o);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

function DirectionBadge({ call }) {
  const inbound = call.direction === "Entrata";
  const Icon = inbound ? PhoneIncoming : PhoneOutgoing;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        inbound ? "bg-blue-50 text-blue-800" : "bg-orange-50 text-orange-800"
      }`}
    >
      <Icon size={12} />
      {inbound ? "Entrata" : "Uscita"}
    </span>
  );
}

function Tile({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
        <div className="p-2 rounded-md bg-slate-50 text-slate-600"><Icon size={16} /></div>
      </div>
      <div className="text-3xl font-bold text-slate-900 leading-none">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}
    </div>
  );
}

// Il receptionist digitale risponde alle chiamate in entrata: 802 = tutti gli agenti
// occupati, 801 = fuori orario. E' un segnale della domanda di assistenza telefonica.
function ReceptionistNote({ rows }) {
  const busy = rows.filter((c) => c.extension === "802").length;
  const closed = rows.filter((c) => c.extension === "801").length;
  return (
    <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-4 py-3 text-sm">
      <Bot size={18} className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-semibold">Receptionist digitale: {formatNumber(rows.length)} chiamate in entrata</span> nel
        periodo, non gestite da una persona.{" "}
        <span className="font-semibold">{formatNumber(busy)}</span> con tutti gli agenti occupati,{" "}
        <span className="font-semibold">{formatNumber(closed)}</span> fuori orario. Per vederle nell&apos;elenco scegli
        &quot;Receptionist digitale&quot; in alto.
      </div>
    </div>
  );
}

function SetupHint({ message }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
      <div className="font-semibold text-slate-800">Impossibile caricare le chiamate</div>
      <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
        {message}. Se è la prima volta, esegui in Supabase lo script <code className="bg-slate-100 px-1.5 py-0.5 rounded">supabase/calls-setup.sql</code> e
        lancia la sincronizzazione dal pulsante in alto.
      </p>
    </div>
  );
}

function exportCsv(list, period) {
  // Punto e virgola e BOM: si apre correttamente in Excel in italiano
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Data e ora", "Nominativo", "Direzione", "Esito", "Durata", "Cliente", "Persona", "P.IVA", "Numero"];
  const lines = list.map((c) =>
    [fmtWhen(c.started_at), c.operator_name, c.direction, c.outcome, fmtDur(c.duration_sec), c.customer, c.contact_name, c.vat_number, c.customer_phone]
      .map(esc).join(";"),
  );
  const blob = new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chiamate_${period.from}_${period.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
