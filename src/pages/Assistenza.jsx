// src/pages/Assistenza.jsx
// Pagina Assistenza: backlog vivo + KPI volumetrici + KPI SLA + distribuzioni + assignee + trend.

import {
  Headphones,
  TrendingUp,
  CheckCircle2,
  Timer,
  Clock,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  Mail,
  Globe,
  HelpCircle,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { formatNumber, formatSeconds } from "../lib/format";

export default function Assistenza({ data }) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const current = safeData.current || null;
  const previous = safeData.previous || null;
  const yoy = safeData.yoy || null;
  const details = safeData.assistenzaDetails || null;

  if (loading && !current) {
    return <Loading size="lg" label="Caricamento dati Assistenza..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore nel caricamento</div>
        <div className="text-sm text-red-700 mt-1">{error}</div>
      </div>
    );
  }

  if (!current) return null;

  const cur = current.assistenza || {};
  const prev = (previous && previous.assistenza) || {};
  const ya = (yoy && yoy.assistenza) || {};

  const channels = Array.isArray(details?.channels) ? details.channels : [];
  const statuses = Array.isArray(details?.statuses) ? details.statuses : [];
  const assignees = Array.isArray(details?.assignees) ? details.assignees : [];
  const trend = Array.isArray(details?.trend) ? details.trend : [];
  const backlogTotal = details?.backlog_total ?? null;

  // % Risoluzione: chiusi/nuovi del periodo
  const pctResolution = cur.new_tickets > 0
    ? Math.min(cur.closed_tickets / cur.new_tickets, 1)
    : null;
  const prevPctResolution = prev.new_tickets > 0
    ? Math.min(prev.closed_tickets / prev.new_tickets, 1)
    : null;
  const yaPctResolution = ya.new_tickets > 0
    ? Math.min(ya.closed_tickets / ya.new_tickets, 1)
    : null;

  return (
    <div className="space-y-8">
      {/* Banner backlog VIVO (sempre lo stesso indipendentemente dal periodo) */}
      {backlogTotal != null && (
        <BacklogBanner count={backlogTotal} />
      )}

      {/* Sezione: KPI volumetrici */}
      <section>
        <SectionTitle
          title="Assistenza"
          hint="Dipartimento Pienissimo Software Srl. Ticket aperti dai clienti."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Nuovi nel periodo"
            value={cur.new_tickets ?? 0}
            previous={prev.new_tickets}
            yoy={ya.new_tickets}
            icon={Headphones}
            intent="neutral"
            formatter={formatNumber}
          />
          <KPICard
            label="Chiusi nel periodo"
            value={cur.closed_tickets ?? 0}
            previous={prev.closed_tickets}
            yoy={ya.closed_tickets}
            icon={CheckCircle2}
            intent="positive"
            formatter={formatNumber}
          />
          <KPICard
            label="Backlog massimo periodo"
            value={cur.max_backlog ?? 0}
            previous={prev.max_backlog}
            yoy={ya.max_backlog}
            icon={TrendingUp}
            intent="negative"
            formatter={formatNumber}
            hint="Picco ticket aperti raggiunto nel periodo"
          />
          <KPICard
            label="% Risoluzione"
            value={pctResolution != null ? Math.round(pctResolution * 1000) / 10 : null}
            previous={prevPctResolution != null ? Math.round(prevPctResolution * 1000) / 10 : null}
            yoy={yaPctResolution != null ? Math.round(yaPctResolution * 1000) / 10 : null}
            icon={CheckCircle2}
            intent="positive"
            suffix="%"
            hint="Chiusi / Nuovi nel periodo"
          />
        </div>
      </section>

      {/* Sezione: SLA Performance */}
      <section>
        <SectionTitle
          title="Performance & SLA"
          hint="Tempi di risposta e risoluzione"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="1ª risposta media"
            value={cur.avg_first_response_sec}
            previous={prev.avg_first_response_sec}
            yoy={ya.avg_first_response_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint={cur.sla_sample_size
              ? `Su ${formatNumber(cur.sla_sample_size)} ticket`
              : null}
          />
          <KPICard
            label="Risposta media"
            value={cur.avg_response_sec}
            previous={prev.avg_response_sec}
            yoy={ya.avg_response_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint="Tempo medio tra le risposte successive"
          />
          <KPICard
            label="Risoluzione media"
            value={cur.avg_resolution_sec}
            previous={prev.avg_resolution_sec}
            yoy={ya.avg_resolution_sec}
            icon={Clock}
            intent="negative"
            formatter={formatSeconds}
            hint="Dalla creazione alla chiusura"
          />
          <KPICard
            label="Sample size SLA"
            value={cur.sla_sample_size ?? 0}
            previous={prev.sla_sample_size}
            yoy={ya.sla_sample_size}
            icon={CheckCircle2}
            intent="neutral"
            formatter={formatNumber}
            hint="Ticket con SLA calcolato"
          />
        </div>
      </section>

      {/* Sezione: Distribuzione canali */}
      {channels.length > 0 && (
        <section>
          <SectionTitle
            title="Canali di apertura"
            hint="Da dove arrivano i ticket nel periodo"
          />
          <ChannelBreakdown channels={channels} />
        </section>
      )}

      {/* Sezione: Distribuzione status */}
      {statuses.length > 0 && (
        <section>
          <SectionTitle
            title="Stato dei ticket creati"
            hint="Distribuzione attuale dei ticket creati nel periodo"
          />
          <StatusBreakdown statuses={statuses} />
        </section>
      )}

      {/* Sezione: Top assignee */}
      {assignees.length > 0 && (
        <section>
          <SectionTitle
            title="Operatori"
            hint="Performance per operatore Pienissimo nel periodo"
          />
          <AssigneeTable assignees={assignees} />
        </section>
      )}

      {/* Sezione: Trend giornaliero */}
      {trend.length > 1 && (
        <section>
          <SectionTitle
            title="Trend giornaliero"
            hint="Andamento giorno per giorno (creati, chiusi, backlog di fine giornata)"
          />
          <TrendTable trend={trend} />
        </section>
      )}
    </div>
  );
}

// =============================================================
// Sotto-componenti
// =============================================================

function BacklogBanner({ count }) {
  const isCritical = count > 30;
  const isWarning = count > 10;
  return (
    <div className={`border rounded-lg p-4 flex items-center gap-4
      ${isCritical
        ? "bg-red-50 border-red-200"
        : isWarning
          ? "bg-amber-50 border-amber-200"
          : "bg-emerald-50 border-emerald-200"}`}
    >
      <div className={`p-3 rounded-full
        ${isCritical
          ? "bg-red-100 text-red-700"
          : isWarning
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700"}`}
      >
        <AlertTriangle size={22} />
      </div>
      <div className="flex-1">
        <div className={`text-xs font-medium uppercase tracking-wider
          ${isCritical ? "text-red-700" : isWarning ? "text-amber-700" : "text-emerald-700"}`}>
          Ticket attualmente aperti
        </div>
        <div className={`text-2xl font-bold mt-0.5
          ${isCritical ? "text-red-900" : isWarning ? "text-amber-900" : "text-emerald-900"}`}>
          {formatNumber(count)} {count === 1 ? "ticket" : "ticket"} non chiusi
        </div>
        <div className="text-xs text-slate-600 mt-1">
          Conteggio in tempo reale, indipendente dal periodo selezionato
        </div>
      </div>
    </div>
  );
}

function channelIcon(name) {
  const lower = (name ?? "").toLowerCase();
  if (lower === "chat") return MessageSquare;
  if (lower === "email") return Mail;
  if (lower === "web") return Globe;
  return HelpCircle;
}

function ChannelBreakdown({ channels }) {
  const total = channels.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Canale</th>
            <th className="px-4 py-3 font-semibold w-1/2">Distribuzione</th>
            <th className="text-right px-4 py-3 font-semibold">Ticket</th>
            <th className="text-right px-4 py-3 font-semibold">% sul totale</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {channels.map((c) => {
            const Icon = channelIcon(c.channel);
            const pct = (c.count / total) * 100;
            return (
              <tr key={c.channel} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-600">
                      <Icon size={14} />
                    </div>
                    <span className="font-medium text-slate-900">{c.channel}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(c.count)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBreakdown({ statuses }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Status</th>
            <th className="text-right px-4 py-3 font-semibold">Ticket</th>
            <th className="text-right px-4 py-3 font-semibold">Tipo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {statuses.map((s) => {
            let badgeClass = "bg-slate-100 text-slate-700";
            let badgeText = "Altro";
            if (s.is_closed) {
              badgeClass = "bg-green-100 text-green-700";
              badgeText = "Chiuso";
            } else if (s.is_open) {
              badgeClass = "bg-amber-100 text-amber-700";
              badgeText = "Aperto";
            }
            return (
              <tr key={s.status} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{s.status}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(s.count)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${badgeClass}`}>
                    {badgeText}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssigneeTable({ assignees }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Operatore</th>
            <th className="text-right px-4 py-3 font-semibold">Ticket</th>
            <th className="text-right px-4 py-3 font-semibold">Chiusi</th>
            <th className="text-right px-4 py-3 font-semibold">% Chiusura</th>
            <th className="text-right px-4 py-3 font-semibold">1ª risposta</th>
            <th className="text-right px-4 py-3 font-semibold">Risoluzione</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {assignees.map((a, idx) => {
            const isUnassigned = a.assignee === "(non assegnato)";
            const pct = a.pct_closed != null ? Math.round(a.pct_closed * 100) : null;
            return (
              <tr
                key={a.assignee || idx}
                className={`hover:bg-slate-50 transition-colors ${isUnassigned ? "bg-slate-50/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className={`font-medium ${isUnassigned ? "text-slate-500 italic" : "text-slate-900"}`}>
                    {a.assignee}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(a.tickets)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatNumber(a.closed)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {pct != null ? (
                    <span className={
                      pct >= 90 ? "text-green-700 font-medium"
                      : pct >= 70 ? "text-amber-700"
                      : "text-red-700"
                    }>
                      {pct}%
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {a.avg_first_response_sec != null ? formatSeconds(a.avg_first_response_sec) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {a.avg_resolution_sec != null ? formatSeconds(a.avg_resolution_sec) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrendTable({ trend }) {
  // Mostro solo gli ultimi 30 giorni se sono di più
  const display = trend.slice(-30);
  const maxVal = Math.max(...display.map((t) => Math.max(t.new_tickets, t.closed_tickets)), 1);

  const formatDayLabel = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const days = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
    const months = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Giorno</th>
            <th className="px-4 py-3 font-semibold w-2/5">Volume</th>
            <th className="text-right px-4 py-3 font-semibold">Nuovi</th>
            <th className="text-right px-4 py-3 font-semibold">Chiusi</th>
            <th className="text-right px-4 py-3 font-semibold">Backlog</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {display.map((t) => {
            const newPct = (t.new_tickets / maxVal) * 100;
            const closedPct = (t.closed_tickets / maxVal) * 100;
            return (
              <tr key={t.date} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-700">
                  {formatDayLabel(t.date)}
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${newPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${closedPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-medium">
                  {formatNumber(t.new_tickets)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">
                  {formatNumber(t.closed_tickets)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatNumber(t.backlog)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {trend.length > 30 && (
        <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 border-t border-slate-200">
          Mostrati gli ultimi 30 giorni di {trend.length} totali
        </div>
      )}
    </div>
  );
}
