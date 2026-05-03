// src/pages/Cruscotto.jsx
// La home della Dashboard 2.0: KPI principali + confronti vs precedente e vs YoY.

import {
  MessageSquare,
  Headphones,
  Code2,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
  Timer,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import { formatNumber, formatSeconds, formatMinutes } from "../lib/format";

export default function Cruscotto({ data }) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const current = safeData.current || null;
  const previous = safeData.previous || null;
  const yoy = safeData.yoy || null;

  if (loading && !current) {
    return <Loading size="lg" label="Caricamento dati Zoho..." />;
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

  // Estrai con fallback ovunque
  const cur = {
    chat: current.chat || {},
    assistenza: current.assistenza || {},
    sviluppo: current.sviluppo || {},
    formazione: current.formazione || {},
  };
  const prev = {
    chat: (previous && previous.chat) || {},
    assistenza: (previous && previous.assistenza) || {},
    sviluppo: (previous && previous.sviluppo) || {},
    formazione: (previous && previous.formazione) || {},
  };
  const ya = {
    chat: (yoy && yoy.chat) || {},
    assistenza: (yoy && yoy.assistenza) || {},
    sviluppo: (yoy && yoy.sviluppo) || {},
    formazione: (yoy && yoy.formazione) || {},
  };

  const chatOps = Array.isArray(cur.chat.operators) ? cur.chat.operators : [];
  const formOps = Array.isArray(cur.formazione.operators) ? cur.formazione.operators : [];

  return (
    <div className="space-y-8">
      {/* Sezione: Volume di lavoro */}
      <section>
        <SectionTitle
          title="Volume di lavoro"
          hint="Quanto è stato gestito nel periodo selezionato"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Chat gestite"
            value={cur.chat.chats_total ?? 0}
            previous={prev.chat.chats_total}
            yoy={ya.chat.chats_total}
            icon={MessageSquare}
            intent="positive"
            formatter={formatNumber}
            hint={cur.chat.chats_attended != null
              ? `${formatNumber(cur.chat.chats_attended)} accettate, ${formatNumber(cur.chat.chats_missed ?? 0)} perse`
              : null}
          />
          <KPICard
            label="Ticket Assistenza nuovi"
            value={cur.assistenza.new_tickets ?? 0}
            previous={prev.assistenza.new_tickets}
            yoy={ya.assistenza.new_tickets}
            icon={Headphones}
            intent="neutral"
            formatter={formatNumber}
          />
          <KPICard
            label="Ticket Sviluppo nuovi"
            value={cur.sviluppo.new_tickets ?? 0}
            previous={prev.sviluppo.new_tickets}
            yoy={ya.sviluppo.new_tickets}
            icon={Code2}
            intent="neutral"
            formatter={formatNumber}
          />
          <KPICard
            label="Ore di formazione"
            value={cur.formazione.total_minutes != null
              ? Math.round(cur.formazione.total_minutes / 60 * 10) / 10
              : 0}
            previous={prev.formazione.total_minutes != null
              ? Math.round(prev.formazione.total_minutes / 60 * 10) / 10
              : null}
            yoy={ya.formazione.total_minutes != null
              ? Math.round(ya.formazione.total_minutes / 60 * 10) / 10
              : null}
            icon={GraduationCap}
            intent="positive"
            suffix="h"
            hint={cur.formazione.total_records
              ? `${formatNumber(cur.formazione.total_records)} sessioni`
              : null}
          />
        </div>
      </section>

      {/* Sezione: Performance & SLA */}
      <section>
        <SectionTitle
          title="Performance & SLA"
          hint="Quanto rapidamente vengono gestite le richieste"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Chat: tempo attesa medio"
            value={cur.chat.avg_waiting_sec}
            previous={prev.chat.avg_waiting_sec}
            yoy={ya.chat.avg_waiting_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint="Dal momento in cui il cliente apre la chat"
          />
          <KPICard
            label="Assistenza: 1ª risposta"
            value={cur.assistenza.avg_first_response_sec}
            previous={prev.assistenza.avg_first_response_sec}
            yoy={ya.assistenza.avg_first_response_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint={cur.assistenza.sla_sample_size
              ? `Su ${formatNumber(cur.assistenza.sla_sample_size)} ticket`
              : null}
          />
          <KPICard
            label="Assistenza: ticket chiusi"
            value={cur.assistenza.closed_tickets ?? 0}
            previous={prev.assistenza.closed_tickets}
            yoy={ya.assistenza.closed_tickets}
            icon={CheckCircle2}
            intent="positive"
            formatter={formatNumber}
          />
          <KPICard
            label="Sviluppo: ticket chiusi"
            value={cur.sviluppo.closed_tickets ?? 0}
            previous={prev.sviluppo.closed_tickets}
            yoy={ya.sviluppo.closed_tickets}
            icon={CheckCircle2}
            intent="positive"
            formatter={formatNumber}
          />
        </div>
      </section>

      {/* Sezione: Top operatori chat */}
      {chatOps.length > 0 && (
        <section>
          <SectionTitle
            title="Top operatori chat"
            hint="Ordinati per numero di chat gestite nel periodo"
          />
          <OperatorTable operators={chatOps.slice(0, 8)} />
        </section>
      )}

      {/* Sezione: Top operatori formazione */}
      {formOps.length > 0 && (
        <section>
          <SectionTitle
            title="Top formatori"
            hint="Operatori con più ore di formazione registrate"
          />
          <FormazioneTable operators={formOps.slice(0, 8)} />
        </section>
      )}
    </div>
  );
}

function SectionTitle({ title, hint }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {hint && <div className="text-sm text-slate-500 mt-0.5">{hint}</div>}
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
            <th className="text-right px-4 py-3 font-semibold">Chat</th>
            <th className="text-right px-4 py-3 font-semibold">Accettate</th>
            <th className="text-right px-4 py-3 font-semibold">Tempo medio attesa</th>
            <th className="text-right px-4 py-3 font-semibold">Durata media chat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {operators.map((op) => (
            <tr key={op.operator || Math.random()} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-900">{op.operator || "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(op.chats ?? 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                {formatNumber(op.attended ?? 0)}
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

function FormazioneTable({ operators }) {
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
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(op.count ?? 0)}</td>
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
