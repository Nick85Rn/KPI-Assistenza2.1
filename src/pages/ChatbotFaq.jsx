// src/pages/ChatbotFaq.jsx
//
// Efficacia del chatbot AI (pienissimo-faq, assistenza.pienissimo.pro).
// 3 tab:
//   - Panoramica: funnel aggregato (chi risolve da solo, escalation, feedback)
//   - Conversazioni: elenco sessioni + trascrizione completa cliccabile
//   - Senza risposta: domande fuori knowledge base / con feedback negativo,
//     materiale pratico per colmare le lacune delle FAQ
//
// Diversa dalla pagina "Analisi Chat" (chat SalesIQ con operatore umano,
// tabella zoho_raw_chats): questa guarda al chatbot AI proprietario
// (chat_ai_interactions).

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
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  MessageCircle,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import {
  getChatbotFunnel,
  getChatSessions,
  getChatSessionDetail,
  getUnansweredQuestions,
} from "../api/zohoData";
import { formatNumber, formatPercent, formatSeconds, formatDateTime } from "../lib/format";

const TABS = [
  { key: "panoramica", label: "Panoramica" },
  { key: "conversazioni", label: "Conversazioni" },
  { key: "senza-risposta", label: "Senza risposta" },
];

export default function ChatbotFaq({ period }) {
  const [tab, setTab] = useState("panoramica");
  // Se una domanda "senza risposta" viene aperta, salviamo qui il
  // session_id per portare l'utente direttamente alla trascrizione
  // completa in tab Conversazioni, senza dover ricercare la sessione.
  const [jumpToSession, setJumpToSession] = useState(null);

  function openSessionFromElsewhere(sessionId) {
    setJumpToSession(sessionId);
    setTab("conversazioni");
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Chatbot AI — Efficacia"
        hint="Assistente AI su assistenza.pienissimo.pro — dati indipendenti dalla chat SalesIQ con operatore"
      />

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "panoramica" && <PanoramicaTab period={period} />}
      {tab === "conversazioni" && (
        <ConversazioniTab
          period={period}
          jumpToSession={jumpToSession}
          onConsumeJump={() => setJumpToSession(null)}
        />
      )}
      {tab === "senza-risposta" && (
        <SenzaRispostaTab period={period} onOpenSession={openSessionFromElsewhere} />
      )}
    </div>
  );
}

// =====================================================
// TAB 1 — Panoramica (funnel aggregato)
// =====================================================

function PanoramicaTab({ period }) {
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
    return () => { cancelled = true; };
  }, [period.start?.getTime(), period.end?.getTime()]);

  if (loading) return <Loading size="lg" label="Caricamento dati chatbot..." />;

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
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
        Nessuna sessione registrata nel periodo selezionato. Prova ad ampliare il periodo.
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
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Panoramica</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Sessioni totali" value={sessioniTotali} icon={MessageSquareText} formatter={formatNumber} />
          <KPICard
            label="Risolte da sole" value={pctRisolteAutonome}
            hint={`${formatNumber(sessioniRisolteAutonome)} sessioni mai escalate`}
            icon={Bot} intent="positive" formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Escalate a operatore" value={pctEscalate}
            hint={`${formatNumber(sessioniConBanner)} sessioni`}
            icon={UserCheck} intent="neutral" formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard label="Durata media sessione" value={Number(f.durata_media_sessione_sec)} icon={Clock} formatter={formatSeconds} />
        </div>
        <div className="mt-2 text-xs text-slate-400">
          "Risolte da sole" è una stima indiretta: sessioni che non hanno mai fatto scattare
          il banner operatore. Non garantisce che il cliente fosse soddisfatto, solo che non
          ha richiesto/ricevuto un'escalation.
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Esito delle escalation ({formatNumber(sessioniConBanner)} sessioni con banner mostrato)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Accettate" value={pctAccettati}
            hint={`${formatNumber(f.banner_accettati)} — passate a Zoho`}
            icon={CheckCircle2} intent="positive" formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Rifiutate" value={pctRifiutati}
            hint={`${formatNumber(f.banner_rifiutati)} — hanno continuato con l'AI`}
            icon={XCircle} intent="neutral" formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Chiuse senza scegliere" value={pctChiusiSenzaScegliere}
            hint={`${formatNumber(f.banner_chiusi_senza_scegliere)} — "Nuova conversazione" senza rispondere al banner`}
            icon={MinusCircle} intent="negative" formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard
            label="Senza esito registrato" value={pctSenzaEsito}
            hint={`${formatNumber(f.banner_senza_esito)} — probabile abbandono silenzioso`}
            icon={AlertCircle} intent="negative" formatter={(v) => formatPercent(v, 1)}
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

      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Qualità risposte e feedback</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Confidence media" value={Number(f.confidence_media)} icon={HelpCircle} formatter={(v) => formatPercent(v, 0)} />
          <KPICard
            label="Domande fuori base di conoscenza" value={pctFuoriKb}
            hint={`${formatNumber(f.interazioni_fuori_kb)} su ${formatNumber(interazioniTotali)} interazioni`}
            icon={AlertCircle} intent="negative" formatter={(v) => formatPercent(v, 1)}
          />
          <KPICard label="Feedback positivo" value={Number(f.sessioni_feedback_positivo)} icon={ThumbsUp} intent="positive" formatter={formatNumber} />
          <KPICard label="Feedback negativo" value={Number(f.sessioni_feedback_negativo)} icon={ThumbsDown} intent="negative" formatter={formatNumber} />
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

// =====================================================
// Badge esito/feedback — riusati sia in Conversazioni sia altrove
// =====================================================

const ESITO_STYLE = {
  non_escalato: { label: "Risolto da solo", cls: "bg-emerald-50 text-emerald-700" },
  accettato: { label: "Accettato", cls: "bg-blue-50 text-blue-700" },
  rifiutato: { label: "Rifiutato", cls: "bg-slate-100 text-slate-600" },
  chiuso_senza_scegliere: { label: "Chiuso senza scegliere", cls: "bg-amber-50 text-amber-700" },
  senza_esito: { label: "Senza esito", cls: "bg-red-50 text-red-700" },
};

function EsitoBadge({ esito }) {
  const s = ESITO_STYLE[esito] || { label: esito || "—", cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function FeedbackBadge({ feedback }) {
  if (!feedback) return <span className="text-slate-300 text-xs">—</span>;
  if (feedback === "positivo") return <ThumbsUp size={14} className="text-emerald-600" />;
  if (feedback === "negativo") return <ThumbsDown size={14} className="text-red-500" />;
  return <span className="text-xs text-slate-500">misto</span>;
}

// =====================================================
// TAB 2 — Conversazioni (elenco sessioni + trascrizione)
// =====================================================

function ConversazioniTab({ period, jumpToSession, onConsumeJump }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ sessioni: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    setPage(0);
  }, [period.start?.getTime(), period.end?.getTime()]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChatSessions(period, page).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setData(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [period.start?.getTime(), period.end?.getTime(), page]);

  // Apertura diretta da un'altra tab (es. click su una domanda in
  // "Senza risposta"): apriamo subito la trascrizione, senza passare
  // dall'elenco.
  useEffect(() => {
    if (jumpToSession) {
      setSelectedSession(jumpToSession);
      onConsumeJump();
    }
  }, [jumpToSession]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedSession) {
    return (
      <SessionDetailView
        sessionId={selectedSession}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  if (loading) return <Loading size="lg" label="Caricamento conversazioni..." />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
        {formatNumber(data.total)} conversazioni nel periodo selezionato
      </div>

      {data.sessioni.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          Nessuna conversazione nel periodo selezionato.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {data.sessioni.map((s) => (
            <button
              key={s.session_id}
              onClick={() => setSelectedSession(s.session_id)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-4"
            >
              <MessageCircle size={16} className="text-slate-300 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-900 truncate font-medium">
                  {s.prima_domanda || "(nessuna domanda registrata)"}
                </div>
                <div className="text-xs text-slate-400">
                  {formatDateTime(s.prima_interazione)} · {formatNumber(s.n_interazioni)} scambi
                </div>
              </div>
              <FeedbackBadge feedback={s.feedback} />
              <EsitoBadge esito={s.esito} />
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50 disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Prec.
          </button>
          <span>Pagina {page + 1} di {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50 disabled:opacity-30"
          >
            Succ. <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================
// Trascrizione completa di una sessione — condivisa tra le tab
// Conversazioni e Senza risposta.
// =====================================================

function SessionDetailView({ sessionId, onBack }) {
  const [interazioni, setInterazioni] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChatSessionDetail(sessionId).then(({ interazioni, error }) => {
      if (cancelled) return;
      if (error) setError(error);
      else setInterazioni(interazioni);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <ArrowLeft size={14} /> Torna all'elenco
        </button>
      </div>

      {loading ? (
        <div className="p-8"><Loading size="md" label="Caricamento trascrizione..." /></div>
      ) : error ? (
        <div className="p-6 text-center text-sm text-red-700">Errore: {error}</div>
      ) : !interazioni || interazioni.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">Nessuna interazione trovata per questa sessione.</div>
      ) : (
        <div className="p-5 space-y-5">
          {interazioni.map((m) => (
            <div key={m.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-indigo-600 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5">
                  {m.question}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-slate-100 text-slate-800 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5">
                  {m.answer}
                  <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>{formatDateTime(m.created_at)}</span>
                    {!m.in_kb && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">fuori KB</span>
                    )}
                    {m.user_feedback === "helpful" && <ThumbsUp size={12} className="text-emerald-600" />}
                    {m.user_feedback === "not_helpful" && <ThumbsDown size={12} className="text-red-500" />}
                    {m.operator_requested && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        banner mostrato{m.operator_trigger_reason === "appointment_link" ? " (fast-track)" : ""}
                      </span>
                    )}
                    {m.operator_accepted_at && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">→ operatore accettato</span>
                    )}
                    {m.operator_declined_at && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">→ operatore rifiutato</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// TAB 3 — Domande senza risposta
// =====================================================

function SenzaRispostaTab({ period, onOpenSession }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ domande: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(0);
  }, [period.start?.getTime(), period.end?.getTime()]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUnansweredQuestions(period, page).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setData(res);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [period.start?.getTime(), period.end?.getTime(), page]);

  if (loading) return <Loading size="lg" label="Caricamento domande..." />;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        Domande fuori base di conoscenza o con feedback 👎 esplicito — materiale pratico
        per capire cosa manca nelle FAQ. Clicca una riga per vedere l'intera conversazione.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm text-slate-500">
          {formatNumber(data.total)} domande nel periodo selezionato
        </div>

        {data.domande.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Nessuna domanda senza risposta in questo periodo — buon segno.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.domande.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenSession(d.session_id)}
                className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm text-slate-900 font-medium">{d.question}</div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!d.in_kb && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                        fuori KB
                      </span>
                    )}
                    {d.user_feedback === "not_helpful" && <ThumbsDown size={13} className="text-red-500" />}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{d.answer}</div>
                <div className="text-[11px] text-slate-400 mt-1.5">{formatDateTime(d.created_at)}</div>
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronLeft size={14} /> Prec.
            </button>
            <span>Pagina {page + 1} di {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50 disabled:opacity-30"
            >
              Succ. <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
