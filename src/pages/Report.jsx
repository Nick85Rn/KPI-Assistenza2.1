// src/pages/Report.jsx
// Pagina Report: anteprima del periodo selezionato + pulsanti per scaricare PDF / copiare testo email.

import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Mail,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { getReportData } from "../api/zohoData";
import { downloadPdf, generateEmailText } from "../lib/reportGenerator";
import { formatNumber, formatSeconds } from "../lib/format";
import SectionTitle from "../components/SectionTitle";

export default function Report({ period, periodType }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getReportData(period)
      .then((data) => {
        if (!cancelled) {
          setReportData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? String(err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [period.start?.getTime(), period.end?.getTime()]);

  const handleDownloadPdf = async () => {
    if (!reportData) return;
    setPdfGenerating(true);
    try {
      await new Promise((r) => setTimeout(r, 100)); // permette al loader di apparire
      downloadPdf(reportData, periodType);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleCopyEmail = async () => {
    if (!reportData) return;
    const text = generateEmailText(reportData, periodType);
    try {
      await navigator.clipboard.writeText(text);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2500);
    } catch (err) {
      setError("Impossibile copiare negli appunti: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 animate-spin text-slate-400" size={32} />
          <div className="text-slate-500">Aggregazione dati per il report...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore nella generazione del report</div>
        <div className="text-sm text-red-700 mt-1">{error}</div>
      </div>
    );
  }

  if (!reportData) return null;

  return (
    <div className="space-y-6">
      {/* Pulsanti azione */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 flex items-center gap-2">
            <FileText size={18} />
            Report pronto
          </div>
          <div className="text-sm text-slate-600 mt-1">
            Anteprima qui sotto. Scarica il PDF o copia il testo email per il management.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {pdfGenerating ? (
              <><Loader2 size={16} className="animate-spin" /> Generazione...</>
            ) : (
              <><Download size={16} /> Scarica PDF</>
            )}
          </button>
          <button
            onClick={handleCopyEmail}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            {emailCopied ? (
              <><Check size={16} className="text-green-600" /> Copiato!</>
            ) : (
              <><Copy size={16} /> Copia testo email</>
            )}
          </button>
        </div>
      </div>

      {/* Anteprima */}
      <ReportPreview data={reportData} periodType={periodType} />
    </div>
  );
}

// =====================================================
// Anteprima del report
// =====================================================

function ReportPreview({ data, periodType }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white px-8 py-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Report Operativo</h2>
          <div className="text-slate-300 text-sm mt-1">Pienissimo Software Srl</div>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">{periodLabel(data.period, periodType)}</div>
          <div className="text-slate-300 mt-1">Generato il {fmtGeneratedAtIt(data.generated_at)}</div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Sintesi */}
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Sintesi del periodo</h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            {buildSummary(data, periodType)}
          </p>
        </section>

        {/* Punti di attenzione */}
        {data.attention_points && data.attention_points.length > 0 && (
          <section className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <h4 className="font-bold text-amber-900 text-sm mb-2">Punti di attenzione</h4>
            <ul className="text-sm text-amber-900 space-y-1">
              {data.attention_points.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </section>
        )}

        {/* KPI grid */}
        <section>
          <h3 className="text-lg font-bold text-slate-900 mb-3">Indicatori chiave</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiBox label="Chat gestite" value={formatNumber(data.chat.chats_total)} />
            <KpiBox label="Ticket Assistenza" value={formatNumber(data.assistenza.new_tickets)} />
            <KpiBox label="Sessioni formazione" value={formatNumber(data.formazione.total_records)} />
            <KpiBox label="Ticket Sviluppo" value={formatNumber(data.sviluppo.new_tickets)} />
          </div>
        </section>

        {/* 4 sezioni */}
        <SectionDetail
          n="1"
          title="Assistenza ai clienti"
          lines={[
            `Nuovi: ${formatNumber(data.assistenza.new_tickets)} · Chiusi: ${formatNumber(data.assistenza.closed_tickets)} · Backlog massimo: ${formatNumber(data.assistenza.max_backlog)}`,
            `Tempo medio 1ª risposta: ${formatSeconds(data.assistenza.avg_first_response_sec) || "n/d"}`,
            data.assistenza.backlog_current?.total != null
              ? `Backlog attuale (in tempo reale): ${formatNumber(data.assistenza.backlog_current.total)} ticket aperti`
              : null,
          ]}
        />

        <SectionDetail
          n="2"
          title="Servizio Chat"
          lines={[
            `Chat totali: ${formatNumber(data.chat.chats_total)} · Accettate: ${data.chat.chats_total > 0 ? Math.round((data.chat.chats_attended / data.chat.chats_total) * 100) : 0}%`,
            `Tempo medio attesa: ${formatSeconds(data.chat.avg_waiting_sec) || "n/d"} · Durata media: ${formatSeconds(data.chat.avg_duration_sec) || "n/d"}`,
          ]}
        />

        <SectionDetail
          n="3"
          title="Formazione erogata"
          lines={[
            `Sessioni: ${formatNumber(data.formazione.total_records)} · Ore totali: ${(data.formazione.total_minutes / 60).toFixed(1)}h`,
            `Top cliente: ${data.formazione.top_clients?.[0]?.name || "n/d"} (${data.formazione.top_clients?.[0]?.sessions || 0} sessioni)`,
          ]}
        />

        <SectionDetail
          n="4"
          title="Richieste a Sviluppo"
          lines={[
            `Nuovi: ${formatNumber(data.sviluppo.new_tickets)} · Chiusi: ${formatNumber(data.sviluppo.closed_tickets)}`,
            data.sviluppo.backlog_current?.total != null
              ? `Backlog attuale: ${formatNumber(data.sviluppo.backlog_current.total)} ticket aperti`
              : null,
            data.sviluppo.reopened_count > 0
              ? `Ticket riaperti nel periodo: ${data.sviluppo.reopened_count}`
              : null,
          ]}
        />

        {/* Footer */}
        <div className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          Fonte: Zoho Desk, Zoho SalesIQ, Zoho CRM
        </div>
      </div>
    </div>
  );
}

function KpiBox({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function SectionDetail({ n, title, lines }) {
  const filtered = lines.filter(Boolean);
  return (
    <section>
      <h4 className="font-bold text-slate-900 mb-2">{n}. {title}</h4>
      <div className="text-sm text-slate-700 space-y-1">
        {filtered.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </section>
  );
}

// ----- Helpers -----

function periodLabel(period, type) {
  const fromD = new Date(period.from);
  const toD = new Date(period.to);
  const months = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

  if (type === "day") return `${fromD.getDate()} ${months[fromD.getMonth()]} ${fromD.getFullYear()}`;
  if (type === "month") return `${months[fromD.getMonth()]} ${fromD.getFullYear()}`;
  if (type === "year") return `Anno ${fromD.getFullYear()}`;
  const fromStr = `${fromD.getDate()} ${months[fromD.getMonth()].slice(0,3).toLowerCase()}`;
  const toStr = `${toD.getDate()} ${months[toD.getMonth()].slice(0,3).toLowerCase()} ${toD.getFullYear()}`;
  return `${fromStr} - ${toStr}`;
}

function fmtGeneratedAtIt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildSummary(data, periodType) {
  const periodWord = {
    day: "questa giornata",
    week: "questa settimana",
    month: "questo mese",
    year: "quest'anno",
  }[periodType] || "il periodo selezionato";

  return `Nel ${periodWord} sono state gestite ${formatNumber(data.chat.chats_total)} chat, ` +
    `aperti ${formatNumber(data.assistenza.new_tickets)} nuovi ticket di assistenza, ` +
    `erogate ${formatNumber(data.formazione.total_records)} sessioni di formazione e ` +
    `registrati ${formatNumber(data.sviluppo.new_tickets)} ticket verso Sviluppo.`;
}
