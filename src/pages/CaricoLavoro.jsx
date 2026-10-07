// src/pages/CaricoLavoro.jsx
//
// Carico di lavoro del team Assistenza — pagina pensata per la presentazione
// alla direzione. Mostra quanto tempo il team e' occupato rispetto alle ore
// disponibili, dove va il tempo, quando si concentra il carico e, in fondo,
// TUTTI i parametri usati nel calcolo (tabella workload_settings): la
// direzione vede il metro di valutazione con cui sono stati prodotti i numeri.
//
// Dati: zoho_daily_workload / zoho_hourly_workload, calcolati ogni notte da
// recompute_daily_workload (vedi carico-lavoro-setup.sql).

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  Gauge,
  Users,
  MessagesSquare,
  Clock,
  Printer,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  Info,
  Table2,
  BarChart3,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import {
  getWorkloadSettings,
  getWorkloadDaily,
  getWorkloadHourly,
  getChatSaturation,
} from "../api/workloadData";
import {
  settingsMap,
  summarize,
  occupancyBand,
  buildHeatmap,
  summarizeSaturation,
  opDisplayName,
} from "../lib/workload";
import { formatNumber, formatDateTime, formatSeconds } from "../lib/format";

// Situazione di partenza: 6 operatori, prima della nuova assunzione (ottobre 2026).
const BASE = { from: "2026-09-07", to: "2026-10-05", label: "7 set – 5 ott 2026" };

// Colori: palette categorica validata (blu, arancio, acqua, giallo) + inchiostri neutri.
const C = {
  chat: "#2a78d6",
  ticket: "#eb6834",
  sviluppo: "#1baf7a",
  formazione: "#eda100",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  band: "#eceae4",
};
const STATUS = { ok: "#0ca30c", alta: "#fab219", saturo: "#d03b3b", sotto: "#898781", nd: "#898781" };

// Scala sequenziale a un solo colore (blu) per la mappa dei picchi.
const HEAT = [
  { max: 0.15, bg: "#cde2fb", fg: "#0b0b0b" },
  { max: 0.3, bg: "#b7d3f6", fg: "#0b0b0b" },
  { max: 0.45, bg: "#86b6ef", fg: "#0b0b0b" },
  { max: 0.6, bg: "#5598e7", fg: "#0b0b0b" },
  { max: 0.75, bg: "#2a78d6", fg: "#ffffff" },
  { max: 0.9, bg: "#1c5cab", fg: "#ffffff" },
  { max: 1.01, bg: "#104281", fg: "#ffffff" },
];
const heatStep = (v) => HEAT.find((s) => v < s.max) ?? HEAT[HEAT.length - 1];
const DOW = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const fmt = (n, d = 1) =>
  n == null || Number.isNaN(n)
    ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (f, d = 0) => (f == null ? "—" : `${fmt(f * 100, d)}%`);
const shortDate = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const longDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
};

export default function CaricoLavoro({ period }) {
  const [mode, setMode] = useState("selezionato"); // "selezionato" | "base"
  const [showNames, setShowNames] = useState(false);
  const [settingsRows, setSettingsRows] = useState(null);
  const [cur, setCur] = useState(null);
  const [base, setBase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const range = mode === "base" ? { from: BASE.from, to: BASE.to } : { from: period.from, to: period.to };

  // Parametri di calcolo: una volta sola
  useEffect(() => {
    let alive = true;
    getWorkloadSettings()
      .then((r) => alive && setSettingsRows(r))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);

  // Situazione di partenza (per il confronto): una volta sola
  useEffect(() => {
    let alive = true;
    Promise.all([getWorkloadDaily(BASE.from, BASE.to), getChatSaturation(BASE.from, BASE.to)])
      .then(([daily, sat]) => alive && setBase({ daily, sat }))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Periodo in esame: ricarico quando cambia. Mantengo il render precedente
  // (opacita' ridotta) mentre arrivano i nuovi dati.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getWorkloadDaily(range.from, range.to),
      getWorkloadHourly(range.from, range.to),
      getChatSaturation(range.from, range.to),
    ])
      .then(([daily, hourly, sat]) => {
        if (!alive) return;
        setCur({ daily, hourly, sat });
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range.from, range.to]);

  const S = useMemo(() => settingsMap(settingsRows ?? []), [settingsRows]);
  const sum = useMemo(() => (cur ? summarize(cur.daily, S) : null), [cur, S]);
  const baseSum = useMemo(() => (base ? summarize(base.daily, S) : null), [base, S]);
  const heat = useMemo(() => (cur ? buildHeatmap(cur.hourly, cur.daily) : null), [cur]);
  const sat = useMemo(() => (cur ? summarizeSaturation(cur.sat) : null), [cur]);

  if (error && !cur) return <SetupHint message={error} />;
  if (!cur || !sum || settingsRows == null) return <Loading size="lg" label="Calcolo del carico di lavoro..." />;

  const empty = sum.nOpDays === 0;
  const label = (op, idx) => (showNames ? opDisplayName(op) : `Operatore ${idx + 1}`);
  const band = occupancyBand(sum.occupazione, sum.params);

  return (
    <div className={`space-y-8 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
      <PrintStyles />

      {/* Intestazione + controlli */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="hidden print:block text-xs uppercase tracking-wider text-slate-500 mb-1">
            Pienissimo · Team Assistenza
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Carico di lavoro del team Assistenza</h2>
          <p className="text-sm text-slate-600 mt-1">
            {longDate(range.from)} – {longDate(range.to)} · {fmt(sum.operatoriMedi, 1)} operatori presenti in media
            {sum.calcolatoIl && (
              <span className="text-slate-400"> · dati calcolati il {formatDateTime(sum.calcolatoIl)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap no-print">
          <div className="inline-flex bg-slate-100 rounded-lg p-1">
            {[
              ["selezionato", "Periodo selezionato"],
              ["base", `Partenza · ${BASE.label}`],
            ].map(([k, t]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNames((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            title="Per la direzione si consiglia la vista anonima"
          >
            {showNames ? <EyeOff size={15} /> : <Eye size={15} />}
            {showNames ? "Nascondi i nomi" : "Mostra i nomi"}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            <Printer size={15} />
            Stampa / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Aggiornamento non riuscito: {error}. Sono mostrati gli ultimi dati caricati.</span>
        </div>
      )}

      {empty ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <div className="font-semibold text-slate-800">Nessun dato di carico nel periodo selezionato</div>
          <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
            I dati vengono calcolati ogni notte. Per un primo calcolo, o dopo aver cambiato un parametro, esegui in
            Supabase: <code className="bg-slate-100 px-1.5 py-0.5 rounded">select recompute_daily_workload(current_date - 90, current_date);</code>
          </p>
        </div>
      ) : (
        <>
          {/* Indicatori principali */}
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 print-avoid">
            <OccupancyTile sum={sum} band={band} />
            <StatTile
              icon={Users}
              label="Persone necessarie"
              value={fmt(sum.personeNecessarie, 1)}
              suffix="a tempo pieno"
              hint={`Presenti in media: ${fmt(sum.operatoriMedi, 1)}. Per restare entro il ${sum.params.tMax}% di occupazione.`}
            />
            <StatTile
              icon={MessagesSquare}
              label="Chat gestite in parallelo"
              value={fmt(sum.chat.concMedie, 1)}
              suffix="in media"
              hint={`Picco di ${sum.chat.picco} chat contemporanee. Il team ne prevede al massimo ${sum.params.maxChat}.`}
            />
            <StatTile
              icon={Clock}
              label="Tempo occupato per operatore"
              value={fmt(sum.oreOccPerOperatoreGiorno, 1)}
              suffix={`ore al giorno su ${fmt(sum.params.disp, 1)} disponibili`}
              hint="Almeno un'attività in corso: chat, ticket, mail, WhatsApp o formazione."
            />
          </section>

          {/* Andamento */}
          <section className="print-avoid">
            <SectionTitle
              title="Andamento dell'occupazione"
              hint="Quota di tempo occupato rispetto alle ore disponibili, giorno per giorno. La fascia grigia è quella sostenibile."
            />
            <ChartCard
              table={{
                columns: ["Giorno", "Operatori", "Ore occupate", "Occupazione"],
                rows: sum.trend.map((d) => [shortDate(d.giorno), d.operatori, fmt(d.oreOccupate, 1), pct(d.occupazione)]),
              }}
            >
              <TrendChart trend={sum.trend} params={sum.params} />
            </ChartCard>
          </section>

          {/* Dove va il tempo */}
          <section className="print-avoid">
            <SectionTitle
              title="Dove va il tempo"
              hint="Ore di lavoro per operatore, in media per giorno di presenza, divise per tipo di attività. Le attività svolte in parallelo si sommano: il totale può superare il tempo occupato."
            />
            <ChartCard
              table={{
                columns: ["Operatore", "Chat", "Ticket e mail", "Sviluppo", "Formazione", "Giorni"],
                rows: sum.operatori.map((o, i) => [
                  label(o.operatore, i),
                  fmt(o.chat / o.giorni, 1),
                  fmt(o.ticket / o.giorni, 1),
                  fmt(o.sviluppo / o.giorni, 1),
                  fmt(o.formazione / o.giorni, 1),
                  o.giorni,
                ]),
              }}
            >
              <ChannelsChart operatori={sum.operatori} label={label} />
            </ChartCard>
            <VolumeStrip c={sum.conteggi} />
          </section>

          {/* Quando */}
          <section className="print-avoid">
            <SectionTitle
              title="Quando si concentra il carico"
              hint="Quota media di tempo occupato per giorno della settimana e ora, sugli operatori presenti."
            />
            <HeatmapCard heat={heat} />
          </section>

          {/* Distribuzione */}
          <section className="print-avoid">
            <SectionTitle
              title="Distribuzione tra le persone"
              hint="Occupazione di ciascun operatore rispetto alle ore disponibili. Le due linee delimitano la fascia sostenibile."
            />
            <ChartCard
              table={{
                columns: ["Operatore", "Occupazione", "Ore occupate", "Giorni", "Picco chat"],
                rows: sum.operatori.map((o, i) => [label(o.operatore, i), pct(o.occupazione), fmt(o.oreOccupate, 1), o.giorni, o.picco]),
              }}
            >
              <OperatorsChart operatori={sum.operatori} label={label} params={sum.params} />
            </ChartCard>
          </section>

          {/* Saturazione */}
          <section className="print-avoid">
            <SectionTitle
              title="Segnali di saturazione"
              hint="Indicatori che mostrano quando il team lavora oltre la propria capacità."
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatTile
                icon={MessagesSquare}
                label={`Oltre ${sum.params.maxChat} chat contemporanee`}
                value={fmt(sum.chat.minOltre / 60, 1)}
                suffix="ore nel periodo"
                hint={`Pari a ${fmt(sum.chat.minOltrePerOpGiorno, 1)} minuti per operatore al giorno oltre il limite previsto.`}
              />
              <StatTile
                icon={AlertTriangle}
                label="Chat non accettate"
                value={sat?.percPerse == null ? "—" : pct(sat.percPerse, 1)}
                suffix={sat?.chats ? `su ${formatNumber(sat.chats)} chat` : ""}
                hint="Chat arrivate e non prese in carico da un operatore."
              />
              <StatTile
                icon={Clock}
                label="Attesa media del cliente"
                value={sat?.attesaMediaSec == null ? "—" : formatSeconds(sat.attesaMediaSec)}
                suffix="prima della risposta"
                hint="Tempo medio tra l'arrivo della chat e la presa in carico."
              />
            </div>
          </section>

          {/* Confronto con la partenza */}
          {(range.from !== BASE.from || range.to !== BASE.to) && baseSum && baseSum.nOpDays > 0 && (
            <section className="print-avoid">
              <SectionTitle
                title="Confronto con la situazione di partenza"
                hint={`Partenza: ${BASE.label}, con ${fmt(baseSum.operatoriMedi, 1)} operatori presenti in media. Serve a misurare l'effetto delle nuove assunzioni.`}
              />
              <CompareTable cur={sum} base={baseSum} />
            </section>
          )}
        </>
      )}

      <MethodSection settings={settingsRows} S={S} params={sum.params} />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Componenti di presentazione                                              */
/* ----------------------------------------------------------------------- */

function PrintStyles() {
  return (
    <style>{`
      @media print {
        aside, header, .no-print { display: none !important; }
        html, body, #root, .h-screen { height: auto !important; overflow: visible !important; }
        main { overflow: visible !important; }
        .print-avoid { break-inside: avoid; }
      }
    `}</style>
  );
}

function SetupHint({ message }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-10 max-w-2xl">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-700 mb-3">
        <AlertCircle size={22} />
      </div>
      <h2 className="text-lg font-bold text-slate-900">Dati del carico di lavoro non ancora disponibili</h2>
      <p className="text-sm text-slate-600 mt-2">
        Le tabelle non sono state trovate. Esegui in Supabase il file <b>carico-lavoro-setup.sql</b> e poi
        {" "}<code className="bg-slate-100 px-1.5 py-0.5 rounded">select recompute_daily_workload(current_date - 90, current_date);</code>
      </p>
      <p className="text-xs text-slate-400 mt-3">Dettaglio tecnico: {message}</p>
    </div>
  );
}

function StatusChip({ band }) {
  const Icon = band.key === "ok" ? CheckCircle2 : band.key === "alta" ? AlertTriangle : band.key === "saturo" ? OctagonAlert : Info;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
      <Icon size={13} style={{ color: STATUS[band.key] }} />
      {band.label}
    </span>
  );
}

function StatTile({ icon: Icon, label, value, suffix, hint }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
        {Icon && (
          <div className="p-2 rounded-md bg-slate-50 text-slate-600">
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="text-4xl font-bold text-slate-900 leading-none">{value}</div>
        {suffix && <div className="text-sm font-medium text-slate-500">{suffix}</div>}
      </div>
      {hint && <div className="text-xs text-slate-500 mt-3 leading-relaxed">{hint}</div>}
    </div>
  );
}

function OccupancyTile({ sum, band }) {
  const { tMin, tMax } = sum.params;
  const frac = sum.occupazione;
  const w = frac == null ? 0 : Math.min(100, frac * 100);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">Occupazione del team</div>
        <div className="p-2 rounded-md bg-slate-50 text-slate-600">
          <Gauge size={16} />
        </div>
      </div>
      <div className="text-4xl font-bold text-slate-900 leading-none">{pct(frac)}</div>

      {/* Barra con fascia sostenibile */}
      <div className="relative h-2.5 rounded-full bg-slate-100 mt-4 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-y-0" style={{ left: `${tMin}%`, width: `${tMax - tMin}%`, background: C.band }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: C.chat }} />
      </div>
      <div className="relative h-4 text-[10px] text-slate-400 mt-1">
        <span className="absolute -translate-x-1/2" style={{ left: `${tMin}%` }}>{tMin}%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${tMax}%` }}>{tMax}%</span>
      </div>

      <div className="mt-2">
        <StatusChip band={band} />
      </div>
      <div className="text-xs text-slate-500 mt-3 leading-relaxed">
        {fmt(sum.oreOccupate, 0)} ore occupate su {fmt(sum.capacita, 0)} disponibili.
      </div>
    </div>
  );
}

// Contenitore di un grafico con vista "Tabella" equivalente (accessibilita').
function ChartCard({ children, table }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex justify-end mb-2 no-print">
        <button
          onClick={() => setAsTable((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
        >
          {asTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
          {asTable ? "Vedi il grafico" : "Vedi la tabella"}
        </button>
      </div>
      {asTable ? <DataTable columns={table.columns} rows={table.rows} /> : children}
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 sticky top-0">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, i) => (
                <td key={i} className={`px-3 py-2 ${i === 0 ? "text-left text-slate-800" : "text-right tabular-nums text-slate-700"}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const axisTick = { fontSize: 12, fill: C.muted };

function TrendChart({ trend, params }) {
  const data = trend.map((d) => ({ giorno: shortDate(d.giorno), occupazione: d.occupazione == null ? null : +(d.occupazione * 100).toFixed(1) }));
  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <ReferenceArea y1={params.tMin} y2={params.tMax} fill={C.band} fillOpacity={0.8} ifOverflow="extendDomain"
            label={{ value: "Fascia sostenibile", position: "insideTopLeft", fill: C.muted, fontSize: 11 }} />
          <XAxis dataKey="giorno" tick={axisTick} tickLine={false} axisLine={{ stroke: C.axis }} minTickGap={24} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(v) => [`${fmt(v, 0)}%`, "Occupazione"]} labelFormatter={(l) => `Giorno ${l}`} />
          <Line type="monotone" dataKey="occupazione" name="Occupazione" stroke={C.chat} strokeWidth={2}
            dot={{ r: 3, fill: C.chat, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChannelsChart({ operatori, label }) {
  const data = operatori.map((o, i) => ({
    name: label(o.operatore, i),
    chat: +(o.chat / o.giorni).toFixed(2),
    ticket: +(o.ticket / o.giorni).toFixed(2),
    sviluppo: +(o.sviluppo / o.giorni).toFixed(2),
    formazione: +(o.formazione / o.giorni).toFixed(2),
  }));
  const height = Math.max(220, data.length * 46 + 70);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barSize={18}>
          <CartesianGrid stroke={C.grid} horizontal={false} />
          <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: C.axis }} tickFormatter={(v) => `${v} h`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.ink2 }} tickLine={false} axisLine={false} width={104} />
          <Tooltip formatter={(v, n) => [`${fmt(v, 1)} h al giorno`, n]} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Legend verticalAlign="bottom" iconType="square" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => <span style={{ color: C.ink2 }}>{v}</span>} />
          <Bar dataKey="chat" name="Chat (lavoro attivo)" stackId="a" fill={C.chat} stroke="#fff" strokeWidth={2} />
          <Bar dataKey="ticket" name="Ticket, mail e WhatsApp" stackId="a" fill={C.ticket} stroke="#fff" strokeWidth={2} />
          <Bar dataKey="sviluppo" name="Sviluppo" stackId="a" fill={C.sviluppo} stroke="#fff" strokeWidth={2} />
          <Bar dataKey="formazione" name="Formazione" stackId="a" fill={C.formazione} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OperatorsChart({ operatori, label, params }) {
  const data = operatori
    .map((o, i) => ({ name: label(o.operatore, i), occupazione: o.occupazione == null ? 0 : +(o.occupazione * 100).toFixed(0) }))
    .sort((a, b) => b.occupazione - a.occupazione);
  const height = Math.max(200, data.length * 40 + 50);
  const maxVal = Math.max(100, ...data.map((d) => d.occupazione));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barSize={16}>
          <CartesianGrid stroke={C.grid} horizontal={false} />
          <XAxis type="number" domain={[0, Math.ceil(maxVal / 10) * 10]} tick={axisTick} tickLine={false} axisLine={{ stroke: C.axis }} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.ink2 }} tickLine={false} axisLine={false} width={104} />
          <Tooltip formatter={(v) => [`${v}%`, "Occupazione"]} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <ReferenceLine x={params.tMin} stroke={C.muted} strokeWidth={1} />
          <ReferenceLine x={params.tMax} stroke={C.muted} strokeWidth={1} />
          <Bar dataKey="occupazione" name="Occupazione" fill={C.chat} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="occupazione" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 12, fill: C.ink2 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VolumeStrip({ c }) {
  const items = [
    ["Chat gestite", c.chat],
    ["Risposte su ticket Assistenza", c.assistenza],
    ["Risposte su mail", c.mail],
    ["Messaggi WhatsApp", c.whatsapp],
    ["Risposte Zucchetti", c.zucchetti],
    ["Aperture verso sviluppo", c.aperture],
    ["Aggiornamenti su ticket sviluppo", c.sviluppo],
    ["Sessioni di formazione", c.formazione],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 mt-4 px-1">
      {items.map(([t, v]) => (
        <div key={t}>
          <div className="text-xl font-bold text-slate-900">{formatNumber(v)}</div>
          <div className="text-xs text-slate-500">{t}</div>
        </div>
      ))}
    </div>
  );
}

function HeatmapCard({ heat }) {
  const [hover, setHover] = useState(null);
  if (!heat || heat.cells.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
        Nessun dato orario disponibile per il periodo.
      </div>
    );
  }
  const { cells, hours, days } = heat;
  const byKey = new Map(cells.map((c) => [`${c.dow}|${c.ora}`, c.value]));
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3 min-h-[28px]">
        <div className="text-xs text-slate-500">Percentuale media di tempo occupato</div>
        {hover && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 font-medium text-slate-700">
            {DOW[hover.dow]} {hover.ora}:00–{hover.ora + 1}:00 · <strong>{pct(hover.value)}</strong> occupato
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `44px repeat(${hours.length}, minmax(34px, 1fr))` }}>
            <div />
            {hours.map((h) => (
              <div key={h} className="text-[11px] text-slate-400 text-center pb-1">{h}</div>
            ))}
            {days.map((d) => (
              <HeatRow key={d} d={d} hours={hours} byKey={byKey} onHover={setHover} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
        <span>Meno occupato</span>
        <div className="flex">
          {HEAT.map((s) => (
            <div key={s.bg} className="w-6 h-3" style={{ background: s.bg }} />
          ))}
        </div>
        <span>Più occupato</span>
      </div>
    </div>
  );
}

function HeatRow({ d, hours, byKey, onHover }) {
  return (
    <>
      <div className="text-xs text-slate-500 flex items-center">{DOW[d]}</div>
      {hours.map((h) => {
        const v = byKey.get(`${d}|${h}`) ?? 0;
        const s = heatStep(v);
        return (
          <div
            key={h}
            tabIndex={0}
            onMouseEnter={() => onHover({ dow: d, ora: h, value: v })}
            onFocus={() => onHover({ dow: d, ora: h, value: v })}
            onMouseLeave={() => onHover(null)}
            className="h-9 rounded-[3px] flex items-center justify-center text-[11px] font-medium outline-none focus:ring-2 focus:ring-slate-400"
            style={{ background: s.bg, color: s.fg }}
            title={`${DOW[d]} ${h}:00 — ${pct(v)}`}
          >
            {v >= 0.01 ? Math.round(v * 100) : ""}
          </div>
        );
      })}
    </>
  );
}

function CompareTable({ cur, base }) {
  const diffPt = (a, b) => (a == null || b == null ? "—" : `${a - b >= 0 ? "+" : "−"}${fmt(Math.abs(a - b) * 100, 1)} pt`);
  const diff = (a, b, d = 1) => (a == null || b == null ? "—" : `${a - b >= 0 ? "+" : "−"}${fmt(Math.abs(a - b), d)}`);
  const rows = [
    ["Occupazione del team", pct(base.occupazione), pct(cur.occupazione), diffPt(cur.occupazione, base.occupazione)],
    ["Ore occupate per operatore al giorno", fmt(base.oreOccPerOperatoreGiorno, 1), fmt(cur.oreOccPerOperatoreGiorno, 1), diff(cur.oreOccPerOperatoreGiorno, base.oreOccPerOperatoreGiorno)],
    ["Operatori presenti in media", fmt(base.operatoriMedi, 1), fmt(cur.operatoriMedi, 1), diff(cur.operatoriMedi, base.operatoriMedi)],
    ["Persone necessarie a tempo pieno", fmt(base.personeNecessarie, 1), fmt(cur.personeNecessarie, 1), diff(cur.personeNecessarie, base.personeNecessarie)],
    ["Chat in parallelo (media)", fmt(base.chat.concMedie, 2), fmt(cur.chat.concMedie, 2), diff(cur.chat.concMedie, base.chat.concMedie, 2)],
    ["Picco di chat contemporanee", base.chat.picco, cur.chat.picco, diff(cur.chat.picco, base.chat.picco, 0)],
    ["Minuti oltre il limite per operatore al giorno", fmt(base.chat.minOltrePerOpGiorno, 1), fmt(cur.chat.minOltrePerOpGiorno, 1), diff(cur.chat.minOltrePerOpGiorno, base.chat.minOltrePerOpGiorno)],
  ];
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Indicatore</th>
            <th className="text-right px-4 py-3 font-semibold">Partenza</th>
            <th className="text-right px-4 py-3 font-semibold">Periodo selezionato</th>
            <th className="text-right px-4 py-3 font-semibold">Differenza</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r[0]}>
              <td className="px-4 py-3 text-slate-800">{r[0]}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r[1]}</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{r[2]}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Metodo di calcolo: tutti i valori usati, letti da workload_settings      */
/* ----------------------------------------------------------------------- */

function formatSettingValue(r) {
  if (r.valore_testo) {
    return r.unita === "elenco"
      ? r.valore_testo.split(",").map((s) => opDisplayName(s.trim())).join(", ")
      : r.valore_testo;
  }
  if (r.valore == null) return "come registrato";
  const v = Number(r.valore);
  switch (r.unita) {
    case "ore": return `${fmt(v, v % 1 ? 1 : 0)} ore`;
    case "%": return `${fmt(v, 0)}%`;
    case "secondi": return `${fmt(v, 0)} s (${fmt(v / 60, v % 60 ? 1 : 0)} min)`;
    case "minuti": return `${fmt(v, 0)} min`;
    case "chat": return `${fmt(v, 0)} chat`;
    case "0/1": return v === 1 ? "Sì" : "No";
    default: return fmt(v, 0);
  }
}

function MethodSection({ settings, S, params }) {
  const groups = [];
  for (const r of settings ?? []) {
    let g = groups.find((x) => x.nome === r.gruppo);
    if (!g) { g = { nome: r.gruppo, righe: [] }; groups.push(g); }
    g.righe.push(r);
  }
  const { disp, tMin, tMax, maxChat } = params;
  const capResp = fmt(S.chat_cap_risposta_sec ?? 120, 0);
  const capSess = fmt((S.chat_cap_sessione_sec ?? 5400) / 60, 0);

  const defs = [
    ["Occupazione", `Tempo occupato ÷ tempo disponibile. Il tempo occupato è il tempo in cui l'operatore ha almeno un'attività in corso (una chat aperta, una risposta a ticket, mail o WhatsApp, una sessione di formazione). Le attività che si sovrappongono si contano una sola volta, quindi l'occupazione non supera mai il 100%. Il tempo disponibile è ${fmt(disp, 1)} ore per ogni giorno in cui l'operatore ha registrato attività.`],
    ["Fascia sostenibile", `Tra il ${tMin}% e il ${tMax}%: è l'intervallo indicato come sano nei contact center. Sopra il ${tMax}% non resta margine per i picchi di richieste.`],
    ["Chat in carico", `Una chat è in carico a un operatore dalla sua prima all'ultima risposta, per un massimo di ${capSess} minuti. Le chat contemporanee sono quelle in carico alla stessa persona nello stesso momento; il team ne prevede al massimo ${maxChat}.`],
    ["Lavoro attivo in chat", `Dietro ogni risposta si contano i secondi trascorsi dal messaggio precedente, fino a un massimo di ${capResp} secondi. Le attese del cliente non sono lavoro e non vengono contate.`],
    ["Ticket, mail e WhatsApp", "Ogni risposta inviata da un operatore vale un tempo standard (vedi tabella sotto), collocato subito prima dell'orario di invio. Sono stime iniziali, da validare con un campionamento sul team."],
    ["Formazione", "Si usa la durata registrata dagli operatori nella sezione Formazione, senza stime."],
    ["Persone necessarie", `Ore occupate dal team in un giorno ÷ (${fmt(disp, 1)} ore disponibili × ${tMax}%). Indica quante persone a tempo pieno servono per restare entro il limite superiore della fascia sostenibile.`],
  ];

  return (
    <section className="space-y-4 print-avoid">
      <SectionTitle
        title="Come sono calcolati i numeri"
        hint="Il metro di valutazione usato in questa pagina. I valori qui sotto sono gli stessi che il sistema applica nel calcolo."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
          <BookOpen size={16} className="text-slate-500" />
          Definizioni
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-x-6 gap-y-3 text-sm">
          {defs.map(([t, d]) => (
            <div key={t} className="contents">
              <dt className="font-medium text-slate-900">{t}</dt>
              <dd className="text-slate-600 leading-relaxed">{d}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Parametro</th>
              <th className="text-right px-4 py-3 font-semibold whitespace-nowrap">Valore</th>
              <th className="text-left px-4 py-3 font-semibold">A cosa serve</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.nome} g={g} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 text-sm">
          <div className="font-semibold text-slate-900 mb-2">Da dove arrivano i dati</div>
          <ul className="space-y-1.5 text-slate-600 list-disc pl-5">
            <li>Chat: orario e autore di ogni messaggio nelle trascrizioni di Zoho SalesIQ.</li>
            <li>Ticket, mail, WhatsApp, Zucchetti e sviluppo: risposte degli operatori sui ticket di Zoho Desk (autore e orario).</li>
            <li>Formazione: sessioni registrate dagli operatori nella sezione Formazione.</li>
            <li>Aggiornamento automatico ogni mattina alle 5:10 (UTC).</li>
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 text-sm">
          <div className="font-semibold text-slate-900 mb-2">Cosa i numeri non includono</div>
          <ul className="space-y-1.5 text-slate-600 list-disc pl-5">
            <li>Indagini e verifiche senza traccia nei sistemi, test, riunioni e supporto tra colleghi.</li>
            <li>Telefonate e attività svolte fuori da Zoho.</li>
            <li>I giorni in cui un operatore non ha alcuna attività registrata non entrano nel tempo disponibile: ferie e permessi non pesano, ma nemmeno i giorni di lavoro senza tracce.</li>
            <li>Per questi motivi i valori vanno letti come una misura minima del carico reale.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function GroupRows({ g }) {
  return (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.nome}</td>
      </tr>
      {g.righe.map((r) => (
        <tr key={r.chiave} className="border-t border-slate-100 align-top">
          <td className="px-4 py-3 text-slate-800">{r.etichetta}</td>
          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{formatSettingValue(r)}</td>
          <td className="px-4 py-3 text-slate-600 leading-relaxed">{r.descrizione}</td>
        </tr>
      ))}
    </>
  );
}
