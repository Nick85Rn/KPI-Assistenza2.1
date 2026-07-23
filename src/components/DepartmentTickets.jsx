// src/components/DepartmentTickets.jsx
//
// Vista condivisa per i KPI dei dipartimenti Zoho Desk basati su ticket
// (Mail assistenza@, Segnalazioni Zucchetti, ...).
//
// Ogni pagina di dipartimento è un wrapper sottile attorno a questo
// componente: passa titolo, sottotitolo e i KPI già aggregati. Così
// aggiungere un dipartimento non comporta duplicare la vista.

import {
  Mail,
  Inbox,
  Timer,
  Hourglass,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import KPICard from "./KPICard";
import Loading from "./Loading";
import SectionTitle from "./SectionTitle";
import { formatNumber, formatSeconds } from "../lib/format";

// Stati considerati "ancora da lavorare". Zoho consente stati custom per
// dipartimento, quindi teniamo una lista ampia: tutto ciò che non è in
// questa lista viene conteggiato come chiuso/risolto.
const OPEN_STATUSES = [
  "aperto",
  "open",
  "in attesa",
  "on hold",
  "ticket aperto",
  "ticket ri-aperto",
  "passato a assistenza per check",
];

function isOpenStatus(status) {
  if (!status) return false;
  return OPEN_STATUSES.includes(String(status).toLowerCase());
}

export default function DepartmentTickets({
  data,
  title,
  subtitle,
  emptyHint,
  icon: HeaderIcon = Mail,
  loadingLabel = "Caricamento ticket...",
}) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const kpis = safeData.kpis || null;

  if (loading && !kpis) {
    return <Loading size="lg" label={loadingLabel} />;
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
        <HeaderIcon className="mx-auto mb-3 text-slate-400" size={40} />
        <div className="font-semibold text-slate-700">
          Nessun ticket nel periodo selezionato
        </div>
        <div className="text-sm text-slate-500 mt-2">{emptyHint}</div>
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
        <SectionTitle title={title} hint={subtitle} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            label="Ticket totali"
            value={kpis.tickets_total}
            icon={HeaderIcon}
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
            label="Tempo medio risoluzione"
            value={kpis.avg_resolution_sec}
            icon={Hourglass}
            intent="negative"
            formatter={formatSeconds}
            hint="Dall'apertura alla chiusura del ticket"
          />
          <KPICard
            label="Tempo medio 1ª risposta"
            value={kpis.avg_first_response_sec}
            icon={Timer}
            intent="negative"
            formatter={formatSeconds}
            hint="Dalla ricezione alla prima risposta"
          />
        </div>
      </section>

      <section>
        <SectionTitle
          title="Distribuzione per stato"
          hint="Come si distribuiscono i ticket tra i vari stati Zoho"
        />
        <StatusBreakdown items={kpis.byStatus} total={kpis.tickets_total} />
      </section>

      {kpis.byDay.length > 0 && (
        <section>
          <SectionTitle
            title="Andamento giornaliero"
            hint="Ticket ricevuti giorno per giorno"
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
  const recent = [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
  const maxCount = Math.max(...recent.map((r) => r.tickets), 1);

  const formatDay = (iso) => {
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
              <td className="px-4 py-2.5 text-slate-900">{formatDay(r.date)}</td>
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
