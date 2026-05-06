// src/pages/Formazione.jsx
// Pagina Formazione: KPI, distribuzione tipo attività, top formatori,
// top 10 clienti, trend mensile.

import {
  GraduationCap,
  Clock,
  Users,
  Calendar,
  AlertCircle,
  Building2,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { formatNumber, formatMinutes } from "../lib/format";

export default function Formazione({ data }) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const current = safeData.current || null;
  const previous = safeData.previous || null;
  const yoy = safeData.yoy || null;
  const details = safeData.formazioneDetails || null;

  if (loading && !current) {
    return <Loading size="lg" label="Caricamento dati Formazione..." />;
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

  const cur = current.formazione || {};
  const prev = (previous && previous.formazione) || {};
  const ya = (yoy && yoy.formazione) || {};

  const operators = Array.isArray(cur.operators) ? cur.operators : [];
  const topClients = Array.isArray(details?.top_clients) ? details.top_clients : [];
  const topics = Array.isArray(details?.topics) ? details.topics : [];
  const trend = Array.isArray(details?.trend) ? details.trend : [];

  // Conversioni utili
  const toHours = (min) => min != null ? Math.round(min / 60 * 10) / 10 : null;

  const totalHours = toHours(cur.total_minutes);
  const prevTotalHours = toHours(prev.total_minutes);
  const yaTotalHours = toHours(ya.total_minutes);

  return (
    <div className="space-y-8">
      {/* Sezione: KPI sintetici */}
      <section>
        <SectionTitle
          title="Formazione"
          hint="Sessioni di formazione e assistenza tecnica registrate in Zoho CRM"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Sessioni totali"
            value={cur.total_records ?? 0}
            previous={prev.total_records}
            yoy={ya.total_records}
            icon={GraduationCap}
            intent="positive"
            formatter={formatNumber}
          />
          <KPICard
            label="Ore totali"
            value={totalHours}
            previous={prevTotalHours}
            yoy={yaTotalHours}
            icon={Clock}
            intent="positive"
            suffix="h"
          />
          <KPICard
            label="Durata media"
            value={cur.avg_duration_min}
            previous={prev.avg_duration_min}
            yoy={ya.avg_duration_min}
            icon={Calendar}
            intent="neutral"
            formatter={(v) => `${v}m`}
          />
          <KPICard
            label="Operatori attivi"
            value={operators.length}
            previous={Array.isArray(prev.operators) ? prev.operators.length : null}
            yoy={Array.isArray(ya.operators) ? ya.operators.length : null}
            icon={Users}
            intent="neutral"
            formatter={formatNumber}
          />
        </div>
      </section>

      {/* Sezione: Distribuzione per tipo attività */}
      {topics.length > 0 && (
        <section>
          <SectionTitle
            title="Distribuzione per tipo attività"
            hint="Categorie native di Zoho CRM. La voce 'Tipologia non presente' raccoglie le sessioni senza tag."
          />
          <TopicBreakdown topics={topics} />
        </section>
      )}

      {/* Sezione: Top formatori */}
      {operators.length > 0 && (
        <section>
          <SectionTitle
            title="Top formatori"
            hint={`${operators.length} operatori attivi nel periodo`}
          />
          <OperatorTable operators={operators} />
        </section>
      )}

      {/* Sezione: Top 10 clienti */}
      {topClients.length > 0 && (
        <section>
          <SectionTitle
            title="Top 10 clienti per ore di formazione"
            hint="I clienti su cui si è investito più tempo nel periodo. Le voci con badge 'Interno' sono categorie tecniche, non clienti reali."
          />
          <TopClientsTable clients={topClients} />
        </section>
      )}

      {/* Sezione: Trend mensile */}
      {trend.length > 1 && (
        <section>
          <SectionTitle
            title="Trend mensile"
            hint="Andamento mese per mese delle sessioni nel periodo selezionato"
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

function TopicBreakdown({ topics }) {
  const maxSessions = Math.max(...topics.map((t) => t.sessions), 1);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Tipologia</th>
            <th className="px-4 py-3 font-semibold w-1/3">Distribuzione</th>
            <th className="text-right px-4 py-3 font-semibold">Sessioni</th>
            <th className="text-right px-4 py-3 font-semibold">Ore totali</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {topics.map((t) => {
            const pct = (t.sessions / maxSessions) * 100;
            const isUntagged = t.is_untagged;
            return (
              <tr
                key={t.topic}
                className={`hover:bg-slate-50 transition-colors ${isUntagged ? "bg-slate-50/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className={`font-medium ${isUntagged ? "text-slate-500 italic" : "text-slate-900"}`}>
                    {t.topic}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isUntagged ? "bg-slate-300" : "bg-blue-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(t.sessions)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatMinutes(t.minutes)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OperatorTable({ operators }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Operatore</th>
            <th className="text-right px-4 py-3 font-semibold">Sessioni</th>
            <th className="text-right px-4 py-3 font-semibold">Tempo totale</th>
            <th className="text-right px-4 py-3 font-semibold">Durata media</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {operators.map((op) => (
            <tr key={op.operator || Math.random()} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-900">{op.operator || "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold">
                {formatNumber(op.count ?? 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {formatMinutes(op.minutes ?? 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {op.count > 0 ? formatMinutes(Math.round((op.minutes || 0) / op.count)) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopClientsTable({ clients }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold w-12">#</th>
            <th className="text-left px-4 py-3 font-semibold">Cliente</th>
            <th className="text-right px-4 py-3 font-semibold">Sessioni</th>
            <th className="text-right px-4 py-3 font-semibold">Ore totali</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {clients.map((c, idx) => {
            const hours = c.minutes != null ? Math.round(c.minutes / 60 * 10) / 10 : 0;
            return (
              <tr key={c.company || idx} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0 mt-0.5">
                      <Building2 size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 truncate" title={c.name}>
                          {c.name}
                        </span>
                        {c.is_internal && (
                          <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            Interno
                          </span>
                        )}
                      </div>
                      {c.vat && (
                        <div className="text-xs text-slate-400 mt-0.5">{c.vat}</div>
                      )}
                      {!c.vat && c.is_internal && (
                        <div className="text-xs text-slate-400 mt-0.5">Categoria interna</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(c.sessions)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {hours} h
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
  const maxSessions = Math.max(...trend.map((t) => t.sessions), 1);

  // Formato YYYY-MM → "Apr 2026"
  const monthLabel = (key) => {
    const [y, m] = key.split("-");
    const months = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Mese</th>
            <th className="px-4 py-3 font-semibold w-1/3">Volume</th>
            <th className="text-right px-4 py-3 font-semibold">Sessioni</th>
            <th className="text-right px-4 py-3 font-semibold">Ore</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {trend.map((t) => {
            const pct = (t.sessions / maxSessions) * 100;
            const hours = Math.round(t.minutes / 60 * 10) / 10;
            return (
              <tr key={t.month} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {monthLabel(t.month)}
                </td>
                <td className="px-4 py-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(t.sessions)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {hours} h
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
