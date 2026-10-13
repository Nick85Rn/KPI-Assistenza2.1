// src/pages/QualitaChat.jsx
//
// Qualità delle chat di assistenza — vista di TEAM (Fase 1).
// Ogni chat è valutata su 4 dimensioni (tono, comprensione, correttezza,
// chiusura) con punteggio 0-2, più esito reale e soddisfazione stimata.
// La pagina non mostra nomi di operatori né trascrizioni: serve a capire
// dove migliorare come reparto e quali chat rivedere insieme.

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  ClipboardCheck, CheckCircle2, ThumbsUp, AlertTriangle, AlertCircle, Info, Search,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { getChatQuality, canViewOperatorQuality, getChatQualityByOperator } from "../api/chatQuality";
import { formatNumber, formatDateTime } from "../lib/format";

const MIN_CHATS = 10; // sotto questa soglia mostriamo i dati con un avviso

const DIMENSIONS = [
  { key: "tono", label: "Tono e accoglienza" },
  { key: "comprensione", label: "Comprensione del problema" },
  { key: "correttezza", label: "Correttezza tecnica" },
  { key: "chiusura", label: "Chiusura e follow-up" },
];

const ESITI = [
  { key: "risolta", label: "Risolta", bar: "bg-green-500" },
  { key: "parziale", label: "Risolta in parte", bar: "bg-amber-400" },
  { key: "non_risolta", label: "Non risolta", bar: "bg-red-500" },
  { key: "non_verificabile", label: "Non verificabile", bar: "bg-slate-300" },
];

const SODDISFAZIONE = [
  { key: "alta", label: "Alta", bar: "bg-green-500" },
  { key: "media", label: "Media", bar: "bg-amber-400" },
  { key: "bassa", label: "Bassa", bar: "bg-red-500" },
];

const pct = (n, tot) => (tot > 0 ? (n / tot) * 100 : 0);

function weekStart(iso) {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // lunedì = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Punteggio complessivo 0-100 di una chat (media delle 4 dimensioni).
const chatScore = (r) => ((r.tono + r.comprensione + r.correttezza + r.chiusura) / 8) * 100;

export default function QualitaChat({ period }) {
  const [tab, setTab] = useState("team");
  const [canOperators, setCanOperators] = useState(false);

  useEffect(() => {
    canViewOperatorQuality().then(setCanOperators);
  }, []);

  return (
    <div className="space-y-6">
      {canOperators && (
        <div className="flex gap-2 border-b border-slate-200">
          {[["team", "Team"], ["operatori", "Per collaboratore"]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? "border-indigo-600 text-indigo-700 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {tab === "operatori" && canOperators ? <OperatorView period={period} /> : <TeamView period={period} />}
    </div>
  );
}

function TeamView({ period }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [onlyReview, setOnlyReview] = useState(true);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    getChatQuality(period.from, period.to)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [period.from, period.to]);

  const stats = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const n = rows.length;
    const dims = DIMENSIONS.map((d) => {
      const c = { 2: 0, 1: 0, 0: 0 };
      rows.forEach((r) => { c[r[d.key]]++; });
      return { ...d, buono: c[2], migliorabile: c[1], critico: c[0], media: (rows.reduce((s, r) => s + r[d.key], 0) / n / 2) * 100 };
    });
    const esiti = ESITI.map((e) => ({ ...e, n: rows.filter((r) => r.esito === e.key).length }));
    const soddisf = SODDISFAZIONE.map((e) => ({ ...e, n: rows.filter((r) => r.soddisfazione === e.key).length }));
    const qualita = rows.reduce((s, r) => s + chatScore(r), 0) / n;
    const risolte = esiti.find((e) => e.key === "risolta").n;
    const alte = soddisf.find((e) => e.key === "alta").n;
    const critiche = rows.filter((r) => Math.min(r.tono, r.comprensione, r.correttezza, r.chiusura) === 0).length;

    const byWeek = new Map();
    rows.forEach((r) => {
      const w = weekStart(r.created_time);
      const k = w.toISOString().slice(0, 10);
      if (!byWeek.has(k)) byWeek.set(k, { k, date: w, sum: 0, n: 0 });
      const o = byWeek.get(k);
      o.sum += chatScore(r);
      o.n++;
    });
    const trend = Array.from(byWeek.values())
      .sort((a, b) => a.k.localeCompare(b.k))
      .map((o) => ({
        label: o.date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
        qualita: Math.round(o.sum / o.n),
        chat: o.n,
      }));

    return { n, dims, esiti, soddisf, qualita, risolte, alte, critiche, trend };
  }, [rows]);

  const toReview = useMemo(() => {
    if (!rows) return [];
    const list = rows
      .filter((r) => !onlyReview || Math.min(r.tono, r.comprensione, r.correttezza, r.chiusura) < 2 || r.esito !== "risolta")
      .map((r) => ({ ...r, score: chatScore(r) }))
      .sort((a, b) => a.score - b.score);
    return list;
  }, [rows, onlyReview]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
        <div className="text-sm text-red-700 mt-1">
          Verifica di aver eseguito <code>supabase/chat-quality-setup.sql</code>.
        </div>
      </div>
    );
  }
  if (rows === null) return <Loading size="lg" label="Caricamento valutazioni..." />;
  if (!stats) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <ClipboardCheck className="mx-auto mb-3 text-slate-400" size={40} />
        <div className="font-semibold text-slate-700">Nessuna chat valutata nel periodo</div>
        <div className="text-sm text-slate-500 mt-2">Prova a selezionare un periodo più ampio.</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Banner n={stats.n} />

      <section>
        <SectionTitle title="Indicatori di team" hint="Sulle chat valutate nel periodo" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Chat valutate" value={stats.n} icon={ClipboardCheck} formatter={formatNumber} />
          <KPICard label="Qualità media" value={Math.round(stats.qualita)} icon={ThumbsUp} intent="positive" suffix="/100"
            hint="Media dei 4 punteggi" />
          <KPICard label="Risolte davvero" value={pct(stats.risolte, stats.n).toFixed(0)} icon={CheckCircle2} intent="positive" suffix="%"
            hint={`${formatNumber(stats.risolte)} chat`} />
          <KPICard label="Con almeno un punto critico" value={pct(stats.critiche, stats.n).toFixed(0)} icon={AlertTriangle} intent="negative" suffix="%"
            hint={`${formatNumber(stats.critiche)} chat`} />
        </div>
      </section>

      <section>
        <SectionTitle title="Le quattro dimensioni" hint="Quante chat sono andate bene, da migliorare o critiche" />
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <Legend />
          {stats.dims.map((d) => (
            <div key={d.key}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="font-medium text-slate-800">{d.label}</span>
                <span className="text-xs text-slate-500">punteggio medio {Math.round(d.media)}/100</span>
              </div>
              <StackedBar
                parts={[
                  { n: d.buono, cls: "bg-green-500", label: "Buono" },
                  { n: d.migliorabile, cls: "bg-amber-400", label: "Migliorabile" },
                  { n: d.critico, cls: "bg-red-500", label: "Critico" },
                ]}
                total={stats.n}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <SectionTitle title="Esito reale" hint="Letto dalla conversazione, non dal flag «risolta» di Zoho" />
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <StackedBar parts={stats.esiti.map((e) => ({ n: e.n, cls: e.bar, label: e.label }))} total={stats.n} />
            <ul className="text-sm space-y-1">
              {stats.esiti.map((e) => (
                <li key={e.key} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><i className={`inline-block w-2.5 h-2.5 rounded-sm ${e.bar}`} />{e.label}</span>
                  <span className="text-slate-600">{e.n} · {pct(e.n, stats.n).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <SectionTitle title="Soddisfazione stimata" hint="Dai messaggi finali del cliente" />
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <StackedBar parts={stats.soddisf.map((e) => ({ n: e.n, cls: e.bar, label: e.label }))} total={stats.n} />
            <ul className="text-sm space-y-1">
              {stats.soddisf.map((e) => (
                <li key={e.key} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><i className={`inline-block w-2.5 h-2.5 rounded-sm ${e.bar}`} />{e.label}</span>
                  <span className="text-slate-600">{e.n} · {pct(e.n, stats.n).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {stats.trend.length >= 3 && (
        <section>
          <SectionTitle title="Andamento settimanale" hint="Qualità media per settimana (chat valutate nella settimana nel tooltip)" />
          <div className="bg-white border border-slate-200 rounded-lg p-5" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.trend} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip formatter={(v, _n, p) => [`${v}/100 (${p.payload.chat} chat)`, "Qualità"]} />
                <Line type="monotone" dataKey="qualita" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          title="Chat da rivedere insieme"
          hint="Ordinate dalla più critica. L'id si cerca in Zoho SalesIQ."
          action={
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
              Solo chat con criticità
            </label>
          }
        />
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Chat</th>
                <th className="text-left px-4 py-2">Punteggio</th>
                <th className="text-left px-4 py-2">Esito</th>
                <th className="text-left px-4 py-2">Cosa è successo</th>
                <th className="text-left px-4 py-2">Azione suggerita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {toReview.slice(0, 50).map((r) => (
                <tr key={r.chat_id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{formatDateTime(r.created_time)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500"><Search size={11} />{r.chat_id}</span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="inline-flex gap-1">
                      {[r.tono, r.comprensione, r.correttezza, r.chiusura].map((v, i) => (
                        <i key={i} title={DIMENSIONS[i].label} className={`inline-block w-3 h-3 rounded-sm ${v === 2 ? "bg-green-500" : v === 1 ? "bg-amber-400" : "bg-red-500"}`} />
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{ESITI.find((e) => e.key === r.esito)?.label}</td>
                  <td className="px-4 py-2 text-slate-700 min-w-[260px]">{r.nota}</td>
                  <td className="px-4 py-2 text-slate-600 min-w-[180px]">{r.azione}</td>
                </tr>
              ))}
              {toReview.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Nessuna chat da rivedere nel periodo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-slate-400 mt-2">
          I quattro quadratini sono: tono · comprensione · correttezza · chiusura (verde buono, giallo migliorabile, rosso critico).
        </div>
      </section>
    </div>
  );
}

function Banner({ n }) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-5">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-full bg-indigo-100 text-indigo-700"><Info size={20} /></div>
        <div className="text-sm text-slate-700">
          <div className="text-xs font-medium uppercase tracking-wider text-indigo-700 mb-1">Vista di team</div>
          Valutazione fatta da un'AI sulla conversazione, con una griglia fissa. È uno strumento per capire dove
          migliorare come reparto e scegliere quali chat rivedere insieme, non una classifica delle persone.
          Non mostra nomi né trascrizioni. {n < MIN_CHATS && (
            <b className="text-amber-700"> Poche chat nel periodo ({n}): il dato è solo indicativo.</b>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-slate-500">
      {[["bg-green-500", "Buono"], ["bg-amber-400", "Migliorabile"], ["bg-red-500", "Critico"]].map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5"><i className={`inline-block w-2.5 h-2.5 rounded-sm ${c}`} />{l}</span>
      ))}
    </div>
  );
}

function StackedBar({ parts, total }) {
  return (
    <div className="flex h-5 rounded overflow-hidden bg-slate-100 gap-0.5">
      {parts.filter((p) => p.n > 0).map((p) => (
        <div
          key={p.label}
          className={`${p.cls} text-[11px] text-white font-medium flex items-center justify-center`}
          style={{ width: `${pct(p.n, total)}%` }}
          title={`${p.label}: ${p.n} (${pct(p.n, total).toFixed(0)}%)`}
        >
          {pct(p.n, total) >= 8 ? p.n : ""}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Vista per collaboratore (solo per chi è in quality_viewers)
// ============================================================

const MIN_OP = 20; // sotto questa soglia il dato è solo indicativo

function OperatorView({ period }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    getChatQualityByOperator(period.from, period.to)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [period.from, period.to]);

  const ops = useMemo(() => {
    if (!rows) return [];
    const by = new Map();
    let shared = 0;
    rows.forEach((r) => {
      if (r.chat_condivisa) { shared++; return; }
      if (!by.has(r.operator)) by.set(r.operator, []);
      by.get(r.operator).push(r);
    });
    const list = Array.from(by.entries()).map(([name, rs]) => {
      const n = rs.length;
      const avg = (k) => (rs.reduce((s, r) => s + r[k], 0) / n / 2) * 100;
      return {
        name, n, rs,
        qualita: rs.reduce((s, r) => s + chatScore(r), 0) / n,
        tono: avg("tono"), comprensione: avg("comprensione"), correttezza: avg("correttezza"), chiusura: avg("chiusura"),
        risolte: pct(rs.filter((r) => r.esito === "risolta").length, n),
        alta: pct(rs.filter((r) => r.soddisfazione === "alta").length, n),
        critiche: rs.filter((r) => Math.min(r.tono, r.comprensione, r.correttezza, r.chiusura) === 0).length,
      };
    }).sort((a, b) => b.n - a.n);
    return { list, shared };
  }, [rows]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }
  if (rows === null) return <Loading size="lg" label="Caricamento valutazioni..." />;
  if (!ops.list || ops.list.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">
        Nessuna chat valutata con operatore nel periodo.
      </div>
    );
  }

  const cell = (v, low) => <td className={`px-3 py-2 text-right tabular-nums ${low ? "text-slate-400" : ""}`}>{Math.round(v)}</td>;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 flex gap-3">
        <Info size={18} className="flex-shrink-0 mt-0.5" />
        <div>
          Vista riservata. I punteggi sono una lettura automatica delle conversazioni: servono per scegliere cosa rivedere
          insieme a ciascuno, non come classifica. Con meno di {MIN_OP} chat il dato è solo indicativo (numeri in grigio).
          Le {ops.shared} chat passate tra più colleghi non sono contate.
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Collaboratore</th>
              <th className="text-right px-3 py-2">Chat</th>
              <th className="text-right px-3 py-2">Qualità</th>
              <th className="text-right px-3 py-2">Tono</th>
              <th className="text-right px-3 py-2">Comprensione</th>
              <th className="text-right px-3 py-2">Correttezza</th>
              <th className="text-right px-3 py-2">Chiusura</th>
              <th className="text-right px-3 py-2">Risolte %</th>
              <th className="text-right px-3 py-2">Soddisf. alta %</th>
              <th className="text-right px-3 py-2">Con punti critici</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ops.list.map((o) => {
              const low = o.n < MIN_OP;
              const isOpen = open === o.name;
              return (
                <OperatorRows key={o.name} o={o} low={low} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : o.name)} cell={cell} />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400">Punteggi da 0 a 100 (100 = tutte le chat buone). Clic su una riga per vedere le chat da rivedere.</div>
    </div>
  );
}

function OperatorRows({ o, low, isOpen, onToggle, cell }) {
  const review = o.rs
    .filter((r) => Math.min(r.tono, r.comprensione, r.correttezza, r.chiusura) < 2 || r.esito !== "risolta")
    .map((r) => ({ ...r, score: chatScore(r) }))
    .sort((a, b) => a.score - b.score);
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-slate-50">
        <td className="px-3 py-2 font-medium text-slate-800">{o.name}{low && <span className="ml-2 text-[10px] uppercase text-amber-600">pochi dati</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums">{o.n}</td>
        {cell(o.qualita, low)}{cell(o.tono, low)}{cell(o.comprensione, low)}{cell(o.correttezza, low)}{cell(o.chiusura, low)}
        {cell(o.risolte, low)}{cell(o.alta, low)}
        <td className={`px-3 py-2 text-right tabular-nums ${low ? "text-slate-400" : ""}`}>{o.critiche}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} className="bg-slate-50 px-4 py-3">
            {review.length === 0 ? (
              <div className="text-sm text-slate-500">Nessuna chat con criticità nel periodo.</div>
            ) : (
              <ul className="space-y-2">
                {review.slice(0, 8).map((r) => (
                  <li key={r.chat_id} className="text-sm">
                    <span className="inline-flex gap-1 mr-2 align-middle">
                      {[r.tono, r.comprensione, r.correttezza, r.chiusura].map((v, i) => (
                        <i key={i} title={DIMENSIONS[i].label} className={`inline-block w-3 h-3 rounded-sm ${v === 2 ? "bg-green-500" : v === 1 ? "bg-amber-400" : "bg-red-500"}`} />
                      ))}
                    </span>
                    <span className="font-mono text-xs text-slate-500 mr-2">{r.chat_id}</span>
                    <span className="text-slate-700">{r.nota}</span>
                    {r.azione && <span className="text-slate-500"> — {r.azione}</span>}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
