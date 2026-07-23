// src/pages/MailAssistenza.jsx
//
// KPI del dipartimento Zoho Desk "Mail assistenza@" — i ticket che
// arrivano via email su assistenza@pienissimo.pro.
//
// Fonte dati: tabella aggregata zoho_daily_mail_assistenza, popolata da
// recompute_daily_mail_assistenza() dopo ogni sync della Edge Function
// zoho-sync-desk.

import {
  Mail,
  Inbox,
  Timer,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { formatNumber, formatSeconds } from "../lib/format";

// Stati considerati "ancora da lavorare". Zoho consente stati custom per
// dipartimento, quindi teniamo una lista ampia: tutto ciò che non è in
// questa lista viene conteggiato come chiuso/risolto.
const OPEN_STATUSES = [
  "Aperto",
  "Open",
  "In attesa",
  "On Hold",
  "Ticket aperto",
  "Ticket Ri-Aperto",
];

function isOpenStatus(status) {
  if (!status) return false;
  return OPEN_STATUSES.some(
    (s) => s.toLowerCase() === String(status).toLowerCase(),
  );
}

export default function MailAssistenza({ data }) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const kpis = safeData.mailAssistenza || null;

  if (loading && !kpis) {
    return <Loading size="lg" label="Caricamento ticket mail assistenza..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }

  if (!kpis || kpis.tickets_total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <Mail className="mx-auto mb-3 text-slate-400" size={40} />
        <div className="font-semibold text-slate-700">
          Nessun ticket mail nel periodo selezionato
        </div>
        <div className="text-sm text-slate-500 mt-2">
          Il dipartimento "Mail assistenza@" raccoglie le richieste inviate a
          assistenza@pienissimo.pro. Prova ad ampliare il periodo.
        </div>
      </div>
    );
  }

  const pctChiusi =
    kpis.tickets_total > 0
      ? Math.round((kpis.tickets_closed / kpis.tickets_total) * 1000) / 10
      : null;

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle
          title="Ticket via email"
          hint="Richieste arrivate su assistenza@pienissimo.pro"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Ticket totali"
            value={kpis.tickets_total}
            icon={Mail}
            intent="neutral"
            formatter={formatNumber}
            hint="Ticket creati nel periodo"
          />
          <KPICard
            label="Ancora aperti"
            value={kpis.tickets_open}
            icon={Inbox}
            intent="negative"
            formatter={formatNumber}
            hint="Non ancora chiusi o risolti"
          />
          <KPICard
            label="% Chiusi"
            value={pctChiusi}
            icon={CheckCircle2}
            intent="positive"
            suffix="%"
            hint={`${formatNumber(kpis.tickets_closed)} ticket chiusi`}
          />
          <KPICard
            label="Tempo medio 1ª risposta"
            value={kpis.avg_first_response_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint="Dalla ricezione mail alla prima risposta"
          />
        </div>
      </section>

      <section>
        <SectionTitle
          title="Distribuzione per stato"
          hint="Come si distribuiscono i ticket email tra i vari stati Zoho"
        />
        <StatusBreakdown items={kpis.byStatus} total={kpis.tickets_total} />
      </section>

      {kpis.byDay.length > 0 && (
        <section>
          <SectionTitle
            title="Andamento giornaliero"
            hint="Ticket email ricevuti giorno per giorno"
          />
          <DailyTable rows={kpis.byDay} />
        </section>
      )}
    </div>
  );
}

function StatusBreakdown({ items, total }) {
  const maxCount = Math.max(...items.map((i) => i.tickets), 1);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Stato</th>
            <th className="px-4 py-3 font-semibold w-1/3">Volume</th>
            <th className="text-right px-4 py-3 font-semibold">Ticket</th>
            <th className="text-right px-4 py-3 font-semibold">% Tot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((s) => {
            const barPct = (s.tickets / maxCount) * 100;
            const pct = total > 0 ? (s.tickets / total) * 100 : 0;
            const open = isOpenStatus(s.status);
            return (
              <tr key={s.status} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                      open ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  {s.status}
                </td>
                <td className="px-4 py-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        open ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatNumber(s.tickets)}
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

function DailyTable({ rows }) {
  // Mostra gli ultimi 30 giorni, dal più recente
  const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const maxCount = Math.max(...recent.map((r) => r.tickets), 1);

  const formatDate = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Giorno</th>
            <th className="px-4 py-3 font-semibold w-1/2">Volume</th>
            <th className="text-right px-4 py-3 font-semibold">Ticket</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {recent.map((r) => (
            <tr key={r.date} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-900">{formatDate(r.date)}</td>
              <td className="px-4 py-2.5">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${(r.tickets / maxCount) * 100}%` }}
                  />
                </div>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                {formatNumber(r.tickets)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
