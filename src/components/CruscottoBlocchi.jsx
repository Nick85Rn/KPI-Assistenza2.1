// src/components/CruscottoBlocchi.jsx
//
// Quattro blocchi del Cruscotto nati dopo la prima versione della home:
//   1. Chiamate               (team assistenza + receptionist digitale)
//   2. Mail e WhatsApp        (ticket dei due canali)
//   3. Carico di lavoro       (occupazione e persone necessarie)
//   4. Qualità chat (AI)      (vista di team, nessun nome di operatore)
//
// Ogni blocco carica i propri dati: se uno non risponde, gli altri restano
// visibili. I numeri sono gli stessi delle schede di dettaglio (stesse
// funzioni di calcolo), così dal Cruscotto si può "aprire" la scheda e ritrovarli.

import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  PhoneIncoming,
  Clock,
  Mail,
  MessageCircle,
  Inbox,
  CheckCircle2,
  Timer,
  Gauge,
  Users,
  MessagesSquare,
  ClipboardCheck,
  ThumbsUp,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Info,
  Bot,
} from "lucide-react";
import KPICard from "./KPICard";
import SectionTitle from "./SectionTitle";
import { withoutAutomatic } from "./DepartmentTickets";
import { getCalls } from "../api/callsData";
import { getDeptTicketKpis, getMailAutomaticStats } from "../api/zohoData";
import { getWorkloadDaily, getWorkloadSettings } from "../api/workloadData";
import { getChatQuality } from "../api/chatQuality";
import { summarize, settingsMap, occupancyBand } from "../lib/workload";
import { summarizeQuality } from "../lib/quality";
import { formatNumber, formatSeconds } from "../lib/format";

// Le chiamate sono registrate in Zoho CRM dal 15/09/2026: prima non ci sono dati.
const CALLS_FROM = "2026-09-15";
// Sotto questa soglia le valutazioni di qualità sono poche per trarre conclusioni.
const MIN_QUALITY_CHATS = 10;

const GRID = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4";

const longDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
};

// Carica dati in modo indipendente. `loader` viene rieseguito quando cambiano `deps`.
function useLoad(loader, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e?.message ?? String(e) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Cornice di un blocco: titolo, link alla scheda di dettaglio, stati di caricamento/errore.
function Block({ title, hint, page, onNavigate, state, children }) {
  const action = onNavigate && page ? (
    <button
      onClick={() => onNavigate(page)}
      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
    >
      Apri la scheda <ArrowRight size={14} />
    </button>
  ) : null;

  return (
    <section>
      <SectionTitle title={title} hint={hint} action={action} />
      {state.error ? (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Dati non disponibili al momento: {state.error}</span>
        </div>
      ) : state.loading && !state.data ? (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-8 text-center text-sm text-slate-500">
          Caricamento…
        </div>
      ) : (
        <div className={`transition-opacity ${state.loading ? "opacity-60" : "opacity-100"}`}>{children}</div>
      )}
    </section>
  );
}

function Note({ children }) {
  return (
    <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
      <Info size={13} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export default function CruscottoBlocchi({ period, prevPeriod, data, onNavigate }) {
  return (
    <>
      <ChiamateBlock period={period} prevPeriod={prevPeriod} onNavigate={onNavigate} />
      <MailWhatsappBlock period={period} prevPeriod={prevPeriod} data={data} onNavigate={onNavigate} />
      <CaricoBlock period={period} prevPeriod={prevPeriod} onNavigate={onNavigate} />
      <QualitaBlock period={period} prevPeriod={prevPeriod} onNavigate={onNavigate} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Chiamate                                                         */
/* ------------------------------------------------------------------ */

function callStats(list) {
  const team = list.filter((c) => c.perimetro === "Assistenza");
  let answered = 0, inbound = 0, outbound = 0, talk = 0;
  for (const c of team) {
    if (c.outcome !== "Risposta") continue;
    answered++;
    talk += c.duration_sec || 0;
    if (c.direction === "Entrata") inbound++; else outbound++;
  }
  const bot = list.filter((c) => c.perimetro === "Receptionist digitale");
  // 802 = "Agent Busy": il cliente ha trovato gli operatori occupati
  const busy = bot.filter((c) => c.extension === "802").length;
  return {
    answered, inbound, outbound, talk,
    avg: answered > 0 ? talk / answered : null,
    botTotal: bot.length, busy,
  };
}

function fmtTalk(sec) {
  if (!sec) return "0m";
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

function fmtCallDur(sec) {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ChiamateBlock({ period, prevPeriod, onNavigate }) {
  // Il periodo di confronto si usa solo se e' tutto coperto dai dati delle chiamate.
  const prevOk = prevPeriod.from >= CALLS_FROM;
  const state = useLoad(
    async () => {
      const [cur, prev] = await Promise.all([
        getCalls(period.from, period.to),
        prevOk ? getCalls(prevPeriod.from, prevPeriod.to) : Promise.resolve(null),
      ]);
      return { cur: callStats(cur), prev: prev ? callStats(prev) : null };
    },
    [period.from, period.to, prevPeriod.from, prevPeriod.to],
  );
  const c = state.data?.cur;
  const p = state.data?.prev;

  return (
    <Block
      title="Chiamate"
      hint="Telefonate con risposta del team assistenza (dal centralino, via Zoho CRM)"
      page="chiamate"
      onNavigate={onNavigate}
      state={state}
    >
      {c && (
        <>
          <div className={GRID}>
            <KPICard
              label="Chiamate con risposta"
              value={c.answered}
              previous={p?.answered}
              icon={Phone}
              intent="neutral"
              formatter={formatNumber}
              showYoy={false}
              hint={`${formatNumber(c.inbound)} in entrata, ${formatNumber(c.outbound)} in uscita`}
            />
            <KPICard
              label="Tempo al telefono"
              value={c.talk}
              previous={p?.talk}
              icon={Clock}
              intent="neutral"
              formatter={fmtTalk}
              showYoy={false}
              hint="Somma delle conversazioni"
            />
            <KPICard
              label="Durata media"
              value={c.avg}
              previous={p?.avg}
              icon={PhoneIncoming}
              intent="neutral"
              formatter={fmtCallDur}
              showYoy={false}
              hint="Minuti:secondi per chiamata"
            />
            <KPICard
              label="Chiamate con operatori occupati"
              value={c.busy}
              previous={p?.busy}
              icon={Bot}
              intent="negative"
              formatter={formatNumber}
              showYoy={false}
              hint={`Il receptionist digitale ha risposto perché gli operatori erano occupati (su ${formatNumber(c.botTotal)} chiamate al receptionist)`}
            />
          </div>
          {period.from < CALLS_FROM && (
            <Note>
              Le chiamate sono registrate dal {longDate(CALLS_FROM)}: nel periodo prima di questa data non ci sono dati.
            </Note>
          )}
          {period.from >= CALLS_FROM && !prevOk && (
            <Note>
              Il confronto con il periodo precedente non è disponibile: inizia prima del {longDate(CALLS_FROM)}, quando
              le chiamate non erano ancora registrate.
            </Note>
          )}
        </>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Mail e WhatsApp                                                  */
/* ------------------------------------------------------------------ */

const pctClosed = (k) => (k && k.tickets_total > 0 ? Math.round((k.tickets_closed / k.tickets_total) * 1000) / 10 : null);

function ChannelRow({ label, icon, cur, prev }) {
  const Icon = icon;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        <Icon size={14} /> {label}
      </div>
      <div className={GRID}>
        <KPICard
          label="Ticket ricevuti"
          value={cur?.tickets_total ?? 0}
          previous={prev?.tickets_total}
          icon={Inbox}
          intent="neutral"
          formatter={formatNumber}
          showYoy={false}
        />
        <KPICard
          label="Ancora aperti"
          value={cur?.tickets_open ?? 0}
          previous={prev?.tickets_open}
          icon={AlertCircle}
          intent="negative"
          formatter={formatNumber}
          showYoy={false}
          hint="Non ancora chiusi o risolti"
        />
        <KPICard
          label="% chiusi"
          value={pctClosed(cur)}
          previous={pctClosed(prev)}
          icon={CheckCircle2}
          intent="positive"
          suffix="%"
          showYoy={false}
          hint={cur ? `${formatNumber(cur.tickets_closed)} ticket chiusi` : null}
        />
        <KPICard
          label="Tempo medio 1ª risposta"
          value={cur?.avg_first_response_sec}
          previous={prev?.avg_first_response_sec}
          icon={Timer}
          intent="negative"
          formatter={formatSeconds}
          showYoy={false}
        />
      </div>
    </div>
  );
}

function MailWhatsappBlock({ period, prevPeriod, data, onNavigate }) {
  // Periodo corrente: gia' caricato dalla home. Confronto: lo carico qui (query leggere).
  const state = useLoad(
    async () => {
      const [mail, wa, auto] = await Promise.all([
        getDeptTicketKpis("zoho_daily_mail_assistenza", { start: prevPeriod.start, end: prevPeriod.end }),
        getDeptTicketKpis("zoho_daily_whatsapp_assistenza", { start: prevPeriod.start, end: prevPeriod.end }),
        getMailAutomaticStats({ start: prevPeriod.start, end: prevPeriod.end }),
      ]);
      return { mail: { ...mail, automatic: auto }, wa };
    },
    [prevPeriod.from, prevPeriod.to],
  );

  // Come nella scheda "Mail assistenza": di default le mail automatiche sono escluse.
  const mailCur = useMemo(() => {
    const k = data?.mailAssistenza;
    if (!k) return null;
    return k.automatic?.total > 0 ? withoutAutomatic(k) : k;
  }, [data?.mailAssistenza]);
  const mailPrev = useMemo(() => {
    const k = state.data?.mail;
    if (!k) return null;
    return k.automatic?.total > 0 ? withoutAutomatic(k) : k;
  }, [state.data]);

  // Finche' i dati del periodo corrente (home) non sono pronti, mostro il caricamento
  const ready = {
    error: state.error,
    loading: state.loading || !!data?.loading,
    data: data?.mailAssistenza ? true : null,
  };
  const autoCount = data?.mailAssistenza?.automatic?.total ?? 0;

  return (
    <Block
      title="Mail e WhatsApp"
      hint="Ticket arrivati su assistenza@ e via WhatsApp nel periodo"
      state={ready}
      page="mail-assistenza"
      onNavigate={onNavigate}
    >
      <div className="space-y-6">
        <ChannelRow label="Mail assistenza@" icon={Mail} cur={mailCur} prev={mailPrev} />
        <ChannelRow label="WhatsApp" icon={MessageCircle} cur={data?.whatsappAssistenza} prev={state.data?.wa} />
      </div>
      {autoCount > 0 && (
        <Note>
          Per le mail sono escluse le {formatNumber(autoCount)} mail automatiche del periodo (notifiche di sistema,
          feedback chat, attivazioni): sono contate nella scheda Mail assistenza.
        </Note>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Carico di lavoro                                                 */
/* ------------------------------------------------------------------ */

const fmt1 = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function CaricoBlock({ period, prevPeriod, onNavigate }) {
  const state = useLoad(
    async () => {
      const [settings, cur, prev] = await Promise.all([
        getWorkloadSettings(),
        getWorkloadDaily(period.from, period.to),
        getWorkloadDaily(prevPeriod.from, prevPeriod.to),
      ]);
      const S = settingsMap(settings);
      return { cur: summarize(cur, S), prev: summarize(prev, S) };
    },
    [period.from, period.to, prevPeriod.from, prevPeriod.to],
  );
  const c = state.data?.cur;
  const p = state.data?.prev;
  const pctVal = (s) => (s?.occupazione == null ? null : Math.round(s.occupazione * 100));

  return (
    <Block
      title="Carico di lavoro"
      hint="Quanto tempo il team è occupato rispetto a quello disponibile (chat, ticket, chiamate, formazione)"
      page="carico-lavoro"
      onNavigate={onNavigate}
      state={state}
    >
      {c && c.nOpDays === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-8 text-center text-sm text-slate-500">
          Nessun dato di carico nel periodo selezionato.
        </div>
      )}
      {c && c.nOpDays > 0 && (
        <>
          <div className={GRID}>
            <KPICard
              label="Occupazione del team"
              value={pctVal(c)}
              previous={p?.nOpDays > 0 ? pctVal(p) : null}
              icon={Gauge}
              intent="neutral"
              suffix="%"
              showYoy={false}
              hint={`${occupancyBand(c.occupazione, c.params).label} (obiettivo ${c.params.tMin}–${c.params.tMax}%)`}
            />
            <KPICard
              label="Persone necessarie"
              value={c.personeNecessarie == null ? null : Math.round(c.personeNecessarie * 10) / 10}
              previous={p?.nOpDays > 0 && p.personeNecessarie != null ? Math.round(p.personeNecessarie * 10) / 10 : null}
              icon={Users}
              intent="neutral"
              formatter={fmt1}
              showYoy={false}
              hint={`Presenti in media: ${fmt1(c.operatoriMedi)}. Per restare entro il ${c.params.tMax}%`}
            />
            <KPICard
              label="Ore occupate"
              value={Math.round(c.oreOccupate * 10) / 10}
              previous={p?.nOpDays > 0 ? Math.round(p.oreOccupate * 10) / 10 : null}
              icon={Timer}
              intent="neutral"
              formatter={fmt1}
              suffix="h"
              showYoy={false}
              hint={`${fmt1(c.oreOccPerGiorno)} h al giorno in media`}
            />
            <KPICard
              label="Chat in parallelo"
              value={c.chat.concMedie == null ? null : Math.round(c.chat.concMedie * 10) / 10}
              previous={p?.chat.concMedie == null ? null : Math.round(p.chat.concMedie * 10) / 10}
              icon={MessagesSquare}
              intent="neutral"
              formatter={fmt1}
              showYoy={false}
              hint={`Picco di ${c.chat.picco} chat contemporanee (massimo previsto ${c.params.maxChat})`}
            />
          </div>
          {prevPeriod.from < CALLS_FROM && (
            <Note>
              Il periodo di confronto inizia prima del {longDate(CALLS_FROM)}, quando le chiamate non erano ancora
              registrate: la sua occupazione è leggermente sottostimata.
            </Note>
          )}
        </>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Qualità chat (AI)                                                */
/* ------------------------------------------------------------------ */

function QualitaBlock({ period, prevPeriod, onNavigate }) {
  const state = useLoad(
    async () => {
      const [cur, prev] = await Promise.all([
        getChatQuality(period.from, period.to),
        getChatQuality(prevPeriod.from, prevPeriod.to),
      ]);
      return { cur: summarizeQuality(cur), prev: summarizeQuality(prev) };
    },
    [period.from, period.to, prevPeriod.from, prevPeriod.to],
  );
  const c = state.data?.cur;
  const p = state.data?.prev;
  const hasPrev = p && p.n >= MIN_QUALITY_CHATS;
  const round = (v) => (v == null ? null : Math.round(v));

  return (
    <Block
      title="Qualità chat (AI)"
      hint="Valutazione automatica di tono, comprensione, correttezza e chiusura. Vista di team, senza nomi"
      page="qualita-chat"
      onNavigate={onNavigate}
      state={state}
    >
      {c && c.n === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-8 text-center text-sm text-slate-500">
          Nessuna chat valutata nel periodo selezionato.
        </div>
      )}
      {c && c.n > 0 && (
        <>
          <div className={GRID}>
            <KPICard
              label="Chat valutate"
              value={c.n}
              previous={p?.n}
              icon={ClipboardCheck}
              intent="neutral"
              formatter={formatNumber}
              showYoy={false}
              hint={`${formatNumber(c.daRivedere)} da rivedere`}
            />
            <KPICard
              label="Qualità media"
              value={round(c.qualita)}
              previous={hasPrev ? round(p.qualita) : null}
              icon={ThumbsUp}
              intent="positive"
              suffix="/100"
              showYoy={false}
              hint="Media dei 4 punteggi"
            />
            <KPICard
              label="Risolte davvero"
              value={round(c.pctRisolte)}
              previous={hasPrev ? round(p.pctRisolte) : null}
              icon={CheckCircle2}
              intent="positive"
              suffix="%"
              showYoy={false}
              hint={`${formatNumber(c.risolte)} chat`}
            />
            <KPICard
              label="Con almeno un punto critico"
              value={round(c.pctCritiche)}
              previous={hasPrev ? round(p.pctCritiche) : null}
              icon={AlertTriangle}
              intent="negative"
              suffix="%"
              showYoy={false}
              hint={`${formatNumber(c.critiche)} chat`}
            />
          </div>
          {c.n < MIN_QUALITY_CHATS && (
            <Note>
              Sono state valutate solo {c.n} chat: con un campione così piccolo le percentuali sono poco affidabili.
            </Note>
          )}
        </>
      )}
    </Block>
  );
}
