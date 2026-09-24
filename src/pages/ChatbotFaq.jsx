// src/pages/ChatbotFaq.jsx
//
// Efficacia del chatbot AI (pienissimo-faq, assistenza.pienissimo.pro):
// chi risolve da solo, chi viene escalato a un operatore, esito
// dell'escalation, feedback ricevuto, qualità delle risposte.
//
// Diversa dalla pagina "Analisi Chat" (che analizza le chat SalesIQ con
// operatore umano, tabella zoho_raw_chats): questa pagina guarda al
// nostro chatbot AI proprietario (chat_ai_interactions).
//
// Filtrata per periodo (Giorno/Settimana/Mese/Anno) tramite RPC, come
// il resto della dashboard.

import { useEffect, useState } from "react";
import {
  Bot,
  MessageSquareText,
  UserCheck,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Zap,
  HelpCircle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertCircle,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { getChatbotFunnel } from "../api/zohoData";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";

export default function ChatbotFaq({ period }) {
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChatbotFunnel(period).then(({ funnel, error }) => {
      if (cancelled) return;
      if (error) setError(error);
      else setFunnel(funnel);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [period.start?.getTime(), period.end?.getTime()]);

  if (loading) {
    return <Loading size="lg" label="Caricamento dati chatbot..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }

  if (!funnel || Number(funnel.sessioni_totali) === 0) {
    return (
      <div className="space-y-6">
        <SectionTitle
          title="Chatbot AI — Efficacia"
          hint="Assistente AI su assistenza.pienissimo.pro"
        />
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Nessuna sessione registrata nel periodo selezionato. Prova ad ampliare il periodo.
        </div>
      </div>
    );
  }

  const f = funnel;
  const sessioniTotali = Number(f.sessioni_totali) || 0;
  const sessioniConBanner = Number(f.sessioni_con_banner) || 0;
  const sessioniRisolteAutonome = Number(f.sessioni_risolte_autonome) || 0;

  const pctRisolteAutonome = sessioniTotali > 0 ? sessioniRisolteAutonome / sessioniTotali : null;
  const pctEscalate = sessioniTotali > 0 ? sessioniConBanner / sessioniTotali : null;

  const pctAccettati = sessioniConBanner > 0 ? Number(f.banner_accettati) / sessioniConBanner : null;
  const pctRifiutati = sessioniConBanner > 0 ? Number(f.banner_rifiutati) / sessioniConBanner : null;
  const pctChiusiSenzaScegliere = sessioniConBanner > 0 ? Number(f.banner_chiusi_senza_scegliere) / sessioniConBanner : null;
  const pctSenzaEsito = sessioniConBanner > 0 ? Number(f.banner_senza_esito) / sessioniConBanner : null;

  const interazioniTotali = Number(f.interazioni_totali) || 0;
  const pctFuoriKb = interazioniTotali > 0 ? Number(f.interazioni_fuori_kb) / interazioniTotali : null;

  const totaleFeedback = Number(f.sessioni_feedback_positivo) + Number(f.sessioni_feedback_negativo);
  const pctFeedbackDato = sessioniTotali > 0 ? totaleFeedback / sessioniTotali : null;

  return (
    <div className="space-y-8">
      <SectionTitle
        title="Chatbot AI — Efficacia"
        hint="Assistente AI su assistenza.pienissimo.pro — dati indipendenti dalla chat SalesIQ con operatore"
      />

      {/* Panoramica generale */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Panoramica</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Sessioni totali"
            value={sessioniTotali}
            icon={MessageSquareText}
            formatter={formatNumber}
          />
          <KPICard
            label="Risolte da sole"
            value={pctRisolteAutonome}
            hint={`${formatNumber(sessioniRisolteAutonome)} sessioni mai escalate`}
            icon={Bot}
            intent="positive"
            formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Escalate a operatore"
            value={pctEscalate}
            hint={`${formatNumber(sessioniConBanner)} sessioni`}
            icon={UserCheck}
            intent="neutral"
            formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Durata media sessione"
            value={Number(f.durata_media_sessione_sec)}
            icon={Clock}
            formatter={formatSeconds}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400">
          "Risolte da sole" è una stima indiretta: sessioni che non hanno mai fatto scattare
          il banner operatore. Non garantisce che il cliente fosse soddisfatto, solo che non
          ha richiesto/ricevuto un'escalation.
        </div>
      </section>

      {/* Esito escalation */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Esito delle escalation ({formatNumber(sessioniConBanner)} sessioni con banner mostrato)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Accettate"
            value={pctAccettati}
            hint={`${formatNumber(f.banner_accettati)} — passate a Zoho`}
            icon={CheckCircle2}
            intent="positive"
            formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Rifiutate"
            value={pctRifiutati}
            hint={`${formatNumber(f.banner_rifiutati)} — hanno continuato con l'AI`}
            icon={XCircle}
            intent="neutral"
            formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Chiuse senza scegliere"
            value={pctChiusiSenzaScegliere}
            hint={`${formatNumber(f.banner_chiusi_senza_scegliere)} — "Nuova conversazione" senza rispondere al banner`}
            icon={MinusCircle}
            intent="negative"
            formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Senza esito registrato"
            value={pctSenzaEsito}
            hint={`${formatNumber(f.banner_senza_esito)} — probabile abbandono silenzioso`}
            icon={AlertCircle}
            intent="negative"
            formatter={(v) => formatPercent(v, 1)}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Zap size={14} className="text-amber-500 flex-shrink-0" />
          Di cui <b className="mx-1">{formatNumber(f.banner_fast_track)}</b> fast-track
          (richiesta link/appuntamento già fissato, banner immediato) e{" "}
          <b className="mx-1">{formatNumber(f.banner_normali)}</b> tramite il percorso
          normale (insistenza/max turni).
        </div>
      </section>

      {/* Qualità risposte e feedback */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Qualità risposte e feedback</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Confidence media"
            value={Number(f.confidence_media)}
            icon={HelpCircle}
            formatter={(v) => formatPercent(v, 0)}
          />
          <KPICard
            label="Domande fuori base di conoscenza"
            value={pctFuoriKb}
            hint={`${formatNumber(f.interazioni_fuori_kb)} su ${formatNumber(interazioniTotali)} interazioni`}
            icon={AlertCircle}
            intent="negative"
            formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Feedback positivo"
            value={Number(f.sessioni_feedback_positivo)}
            icon={ThumbsUp}
            intent="positive"
            formatter={formatNumber}
          />
          <KPICard
            label="Feedback negativo"
            value={Number(f.sessioni_feedback_negativo)}
            icon={ThumbsDown}
            intent="negative"
            formatter={formatNumber}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Solo {pctFeedbackDato != null ? formatPercent(pctFeedbackDato, 1) : "—"} delle
          sessioni riceve un feedback esplicito (👍/👎) — con un tasso così basso, i numeri
          sopra vanno letti come indicativi, non rappresentativi dell'intero traffico.
        </div>
      </section>
    </div>
  );
}
