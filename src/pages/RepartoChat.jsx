// src/pages/RepartoChat.jsx
// Pagina Reparto Chat: KPI sintetici + heatmap 7×24 + tabella operatori + top clienti.

import {
  MessageSquare,
  Timer,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import Heatmap from "../components/Heatmap";
import SectionTitle from "../components/SectionTitle";
import { formatNumber, formatSeconds, formatRelative } from "../lib/format";

export default function RepartoChat({ data }) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const current = safeData.current || null;
  const previous = safeData.previous || null;
  const yoy = safeData.yoy || null;
  const heatmap = safeData.heatmap;
  const topVisitors = Array.isArray(safeData.topVisitors) ? safeData.topVisitors : [];

  if (loading && !current) {
    return <Loading size="lg" label="Caricamento dati Chat..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore nel caricamento dati</div>
        <div className="text-sm text-red-700 mt-1">{error}</div>
      </div>
    );
  }

  if (!current) return null;

  const cur = current.chat || {};
  const prev = (previous && previous.chat) || {};
  const ya = (yoy && yoy.chat) || {};

  const operators = Array.isArray(cur.operators) ? cur.operators : [];

  // % chat accettate (su totale)
  const pctAttended = cur.chats_total > 0
    ? cur.chats_attended / cur.chats_total
    : null;
  const prevPctAttended = prev.chats_total > 0
    ? prev.chats_attended / prev.chats_total
    : null;
  const yoyPctAttended = ya.chats_total > 0
    ? ya.chats_attended / ya.chats_total
    : null;

  return (
    <div className="space-y-8">
      {/* Sezione KPI riassuntivi */}
      <section>
        <SectionTitle
          title="Reparto Chat"
          hint="Vista d'insieme delle chat gestite via SalesIQ"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Chat totali"
            value={cur.chats_total ?? 0}
            previous={prev.chats_total}
            yoy={ya.chats_total}
            icon={MessageSquare}
            intent="positive"
            formatter={formatNumber}
            hint={cur.chats_attended != null
              ? `${formatNumber(cur.chats_attended)} accettate, ${formatNumber(cur.chats_missed ?? 0)} perse`
              : null}
          />
          <KPICard
            label="Tempo medio attesa"
            value={cur.avg_waiting_sec}
            previous={prev.avg_waiting_sec}
            yoy={ya.avg_waiting_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint="Dalla creazione chat alla presa in carico"
          />
          <KPICard
            label="Durata media chat"
            value={cur.avg_duration_sec}
            previous={prev.avg_duration_sec}
            yoy={ya.avg_duration_sec}
            icon={Clock}
            intent="neutral"
            formatter={formatSeconds}
            hint="Tempo totale dalla creazione alla chiusura"
          />
          <KPICard
            label="% Chat accettate"
            value={pctAttended != null ? Math.round(pctAttended * 1000) / 10 : null}
            previous={prevPctAttended != null ? Math.round(prevPctAttended * 1000) / 10 : null}
            yoy={yoyPctAttended != null ? Math.round(yoyPctAttended * 1000) / 10 : null}
            icon={CheckCircle2}
            intent="positive"
            suffix="%"
          />
        </div>
      </section>

      {/* Heatmap */}
      <section>
        <SectionTitle
          title="Distribuzione oraria"
          hint="Quando arrivano i clienti — utile per pianificare la copertura del team"
        />
        <Heatmap data={heatmap} />
      </section>

      {/* Tabella operatori */}
      {operators.length > 0 && (
        <section>
          <SectionTitle
            title="Performance operatori"
            hint={`${operators.length} operatori attivi nel periodo`}
          />
          <OperatorTableExtended operators={operators} />
        </section>
      )}

      {/* Top clienti */}
      {topVisitors.length > 0 && (
        <section>
          <SectionTitle
            title="Top clienti per chat"
            hint="I 10 clienti che hanno scritto di più nel periodo"
          />
          <TopVisitorsTable visitors={topVisitors} />
        </section>
      )}
    </div>
  );
}

// =============================================================
// Sotto-componenti privati
// =============================================================

function OperatorTableExtended({ operators }) {
  // Calcoliamo qui la % attended per ogni operatore
  const ops = operators.map((op) => ({
    ...op,
    pct_attended: op.chats > 0 ? op.attended / op.chats : null,
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Operatore</th>
            <th className="text-right px-4 py-3 font-semibold">Chat totali</th>
            <th className="text-right px-4 py-3 font-semibold">Accettate</th>
            <th className="text-right px-4 py-3 font-semibold">Perse</th>
            <th className="text-right px-4 py-3 font-semibold">% Acc.</th>
            <th className="text-right px-4 py-3 font-semibold">Attesa media</th>
            <th className="text-right px-4 py-3 font-semibold">Durata media</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ops.map((op) => (
            <tr key={op.operator || Math.random()} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-900">
                {op.operator || "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold">
                {formatNumber(op.chats ?? 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {formatNumber(op.attended ?? 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {formatNumber(op.missed ?? 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {op.pct_attended != null ? (
                  <span className={
                    op.pct_attended >= 0.8 ? "text-green-700 font-medium"
                    : op.pct_attended >= 0.5 ? "text-amber-700"
                    : "text-red-700"
                  }>
                    {(op.pct_attended * 100).toFixed(0)}%
                  </span>
                ) : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {op.avg_wait_sec != null ? formatSeconds(op.avg_wait_sec) : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {op.avg_duration_sec != null ? formatSeconds(op.avg_duration_sec) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopVisitorsTable({ visitors }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold w-12">#</th>
            <th className="text-left px-4 py-3 font-semibold">Cliente</th>
            <th className="text-right px-4 py-3 font-semibold">Chat</th>
            <th className="text-right px-4 py-3 font-semibold">Ultima conversazione</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visitors.map((v, idx) => (
            <tr key={v.visitor || idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <User size={14} />
                  </div>
                  <span className="font-medium text-slate-900 truncate" title={v.visitor}>
                    {v.visitor || "—"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold">
                {formatNumber(v.chats ?? 0)}
              </td>
              <td className="px-4 py-3 text-right text-slate-600 text-xs">
                {v.last_chat ? formatRelative(v.last_chat) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
