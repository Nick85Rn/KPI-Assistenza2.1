// src/components/OrariChatbot.jsx
//
// Pannello "Orari e WhatsApp" (dentro Impostazioni).
//
//  - Per ogni giorno (lun-dom) e per i festivi: fascia del chatbot AI e
//    fascia in cui compare il pulsante WhatsApp.
//  - Fuori fascia il sito apre direttamente la chat Zoho: se la chat e'
//    chiusa, Zoho raccoglie un ticket. Non si mostra nessun avviso di
//    chiusura.
//  - Numero e testo del messaggio WhatsApp, festivi nazionali automatici,
//    festivi/chiusure aggiuntive.
//  - Anteprima: cosa vedrebbe un cliente adesso, o in un giorno/ora a scelta
//    (usa la stessa funzione del sito, chat_availability).
//
// Tutti gli orari sono orario italiano.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Plus,
  Trash2,
  MessageCircle,
  Bot,
  Copy,
} from "lucide-react";

const GIORNI = [
  { id: 1, nome: "Lunedì" },
  { id: 2, nome: "Martedì" },
  { id: 3, nome: "Mercoledì" },
  { id: 4, nome: "Giovedì" },
  { id: 5, nome: "Venerdì" },
  { id: 6, nome: "Sabato" },
  { id: 7, nome: "Domenica" },
  { id: 8, nome: "Festivi" },
];

const DEFAULT_ROW = {
  chatbot_attivo: true,
  chatbot_dalle: "00:00",
  chatbot_alle: "23:59",
  whatsapp_attivo: false,
  whatsapp_dalle: "09:00",
  whatsapp_alle: "18:00",
};

// Il database restituisce "09:00:00": nei campi orario serve "09:00".
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

function rowsFromDb(data) {
  const byId = new Map((data ?? []).map((r) => [r.giorno, r]));
  return GIORNI.map((g) => {
    const r = byId.get(g.id);
    return {
      giorno: g.id,
      chatbot_attivo: r ? r.chatbot_attivo : DEFAULT_ROW.chatbot_attivo,
      chatbot_dalle: r ? hhmm(r.chatbot_dalle) : DEFAULT_ROW.chatbot_dalle,
      chatbot_alle: r ? hhmm(r.chatbot_alle) : DEFAULT_ROW.chatbot_alle,
      whatsapp_attivo: r ? r.whatsapp_attivo : g.id >= 6,
      whatsapp_dalle: r ? hhmm(r.whatsapp_dalle) : DEFAULT_ROW.whatsapp_dalle,
      whatsapp_alle: r ? hhmm(r.whatsapp_alle) : DEFAULT_ROW.whatsapp_alle,
    };
  });
}

function rowError(r) {
  if (r.chatbot_attivo && r.chatbot_dalle > r.chatbot_alle) return "chatbot";
  if (r.whatsapp_attivo && r.whatsapp_dalle > r.whatsapp_alle) return "whatsapp";
  return null;
}

export default function OrariChatbotSection() {
  const [rows, setRows] = useState(() => rowsFromDb([]));
  const [settings, setSettings] = useState({
    whatsapp_numero: "393713429482",
    whatsapp_messaggio: "Ciao, ho bisogno di assistenza su Pienissimo Pro.",
    festivi_nazionali_auto: true,
  });
  const [festivi, setFestivi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState(null); // null | "success" | "error"
  const [errorMsg, setErrorMsg] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [orari, sett, fest] = await Promise.all([
      supabase.from("chatbot_orari").select("*").order("giorno"),
      supabase
        .from("chatbot_settings")
        .select("whatsapp_numero, whatsapp_messaggio, festivi_nazionali_auto")
        .eq("id", 1)
        .single(),
      supabase.from("chatbot_festivi").select("*").order("data"),
    ]);
    const err = orari.error || sett.error || fest.error;
    if (err) {
      setErrorMsg(
        /does not exist|schema cache|column/i.test(err.message)
          ? "Tabelle non ancora create: esegui chat-orari-whatsapp.sql in Supabase."
          : err.message,
      );
    } else {
      setRows(rowsFromDb(orari.data));
      setSettings({
        whatsapp_numero: sett.data.whatsapp_numero ?? "",
        whatsapp_messaggio: sett.data.whatsapp_messaggio ?? "",
        festivi_nazionali_auto: sett.data.festivi_nazionali_auto !== false,
      });
      setFestivi(fest.data ?? []);
      setDirty(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function patchRow(giorno, patch) {
    setRows((prev) => prev.map((r) => (r.giorno === giorno ? { ...r, ...patch } : r)));
    setDirty(true);
  }
  function patchSettings(patch) {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }
  function copyMondayToWeekdays() {
    setRows((prev) => {
      const lun = prev.find((r) => r.giorno === 1);
      return prev.map((r) => (r.giorno >= 2 && r.giorno <= 5 ? { ...lun, giorno: r.giorno } : r));
    });
    setDirty(true);
  }

  const numeroPulito = settings.whatsapp_numero.replace(/\D/g, "");
  const invalidRows = rows.filter((r) => rowError(r));
  const numeroNonValido = settings.whatsapp_numero.trim() !== "" && numeroPulito.length < 8;
  const canSave = dirty && !saving && invalidRows.length === 0 && !numeroNonValido && numeroPulito !== "";

  async function handleSave() {
    setSaving(true);
    setSaveState(null);
    setErrorMsg(null);
    const now = new Date().toISOString();

    const { error: e1 } = await supabase.from("chatbot_orari").upsert(
      rows.map((r) => ({ ...r, updated_at: now })),
      { onConflict: "giorno" },
    );
    const { error: e2 } = e1
      ? { error: null }
      : await supabase
          .from("chatbot_settings")
          .update({
            whatsapp_numero: numeroPulito,
            whatsapp_messaggio: settings.whatsapp_messaggio.trim(),
            festivi_nazionali_auto: settings.festivi_nazionali_auto,
            updated_at: now,
          })
          .eq("id", 1);

    setSaving(false);
    if (e1 || e2) {
      setSaveState("error");
      setErrorMsg((e1 || e2).message);
      return;
    }
    setSaveState("success");
    setDirty(false);
    setPreviewKey((k) => k + 1);
    setTimeout(() => setSaveState(null), 3000);
  }

  // ---- Festivi aggiuntivi: salvataggio immediato ----
  const [nuovaData, setNuovaData] = useState("");
  const [nuovaDescr, setNuovaDescr] = useState("");
  const [festiviError, setFestiviError] = useState(null);

  async function addFestivo() {
    if (!nuovaData) return;
    setFestiviError(null);
    const { error } = await supabase
      .from("chatbot_festivi")
      .upsert({ data: nuovaData, descrizione: nuovaDescr.trim() }, { onConflict: "data" });
    if (error) { setFestiviError(error.message); return; }
    setFestivi((prev) =>
      [...prev.filter((f) => f.data !== nuovaData), { data: nuovaData, descrizione: nuovaDescr.trim() }]
        .sort((a, b) => a.data.localeCompare(b.data)),
    );
    setNuovaData("");
    setNuovaDescr("");
    setPreviewKey((k) => k + 1);
  }
  async function removeFestivo(data) {
    setFestiviError(null);
    const { error } = await supabase.from("chatbot_festivi").delete().eq("data", data);
    if (error) { setFestiviError(error.message); return; }
    setFestivi((prev) => prev.filter((f) => f.data !== data));
    setPreviewKey((k) => k + 1);
  }

  const [previewKey, setPreviewKey] = useState(0);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-6 flex items-center text-slate-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Caricamento orari...
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <CalendarClock size={18} className="text-indigo-600" />
          Orari e WhatsApp
        </h2>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Salva orari
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Orario italiano. <b>Chatbot AI</b>: fuori fascia il sito apre direttamente la chat Zoho (se la chat è
        chiusa, Zoho raccoglie un ticket) e non compare alcun avviso di chiusura. <b>WhatsApp</b>: il pulsante
        compare nel sito e nel widget solo nei giorni e nelle fasce attivi, come alternativa alla chat. L'interruttore
        "Chatbot attivo" qui sopra resta quello generale: se è spento, il chatbot è spento sempre.
      </p>

      {errorMsg && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {errorMsg}
        </div>
      )}

      {/* Tabella orari */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-500">
              <th className="text-left font-semibold py-2 pr-3 w-24">Giorno</th>
              <th className="text-left font-semibold py-2 pr-3">
                <span className="inline-flex items-center gap-1.5"><Bot size={13} /> Chatbot AI</span>
              </th>
              <th className="text-left font-semibold py-2">
                <span className="inline-flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const g = GIORNI.find((x) => x.id === r.giorno);
              const err = rowError(r);
              return (
                <tr key={r.giorno} className={r.giorno === 8 ? "bg-slate-50/60" : ""}>
                  <td className="py-2.5 pr-3 font-medium text-slate-800">
                    {g.nome}
                    {r.giorno === 8 && <div className="text-[11px] font-normal text-slate-500">al posto del giorno</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <FasciaEditor
                      label={`Chatbot ${g.nome}`}
                      attivo={r.chatbot_attivo}
                      dalle={r.chatbot_dalle}
                      alle={r.chatbot_alle}
                      invalid={err === "chatbot"}
                      onChange={(p) => patchRow(r.giorno, {
                        ...(p.attivo !== undefined && { chatbot_attivo: p.attivo }),
                        ...(p.dalle !== undefined && { chatbot_dalle: p.dalle }),
                        ...(p.alle !== undefined && { chatbot_alle: p.alle }),
                      })}
                    />
                  </td>
                  <td className="py-2.5">
                    <FasciaEditor
                      label={`WhatsApp ${g.nome}`}
                      attivo={r.whatsapp_attivo}
                      dalle={r.whatsapp_dalle}
                      alle={r.whatsapp_alle}
                      invalid={err === "whatsapp"}
                      onChange={(p) => patchRow(r.giorno, {
                        ...(p.attivo !== undefined && { whatsapp_attivo: p.attivo }),
                        ...(p.dalle !== undefined && { whatsapp_dalle: p.dalle }),
                        ...(p.alle !== undefined && { whatsapp_alle: p.alle }),
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <button onClick={copyMondayToWeekdays} className="inline-flex items-center gap-1.5 hover:text-slate-800">
          <Copy size={12} /> Applica il lunedì a martedì–venerdì
        </button>
        {invalidRows.length > 0 && (
          <span className="text-red-700">Controlla gli orari evidenziati: "dalle" deve precedere "alle".</span>
        )}
      </div>

      {/* WhatsApp: numero e messaggio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Numero WhatsApp</span>
          <input
            type="text"
            value={settings.whatsapp_numero}
            onChange={(e) => patchSettings({ whatsapp_numero: e.target.value })}
            placeholder="393713429482"
            className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm ${numeroNonValido ? "border-red-400" : "border-slate-200"}`}
          />
          <span className="text-xs text-slate-500">Con prefisso internazionale, senza + (es. 39 per l'Italia).</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Messaggio precompilato</span>
          <input
            type="text"
            value={settings.whatsapp_messaggio}
            onChange={(e) => patchSettings({ whatsapp_messaggio: e.target.value })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
          <span className="text-xs text-slate-500">Dal sito si aggiunge anche l'ultima domanda del cliente, che può modificare prima di inviare.</span>
        </label>
      </div>

      {/* Festivi */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Festivi</h3>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.festivi_nazionali_auto}
              onChange={(e) => patchSettings({ festivi_nazionali_auto: e.target.checked })}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            Festivi nazionali automatici
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Capodanno, Epifania, Lunedì dell'Angelo, 25 aprile, 1° maggio, 2 giugno, Ferragosto, Ognissanti,
          Immacolata, Natale e Santo Stefano (la Pasqua, domenica, ha già le sue regole). Qui sotto aggiungi altri
          giorni: patrono, ferie aziendali, chiusure straordinarie. Si salvano subito.
        </p>

        <div className="flex flex-wrap items-end gap-2 mt-3">
          <label className="text-xs text-slate-600">
            Data
            <input type="date" value={nuovaData} onChange={(e) => setNuovaData(e.target.value)}
              className="mt-1 block px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </label>
          <label className="text-xs text-slate-600 flex-1 min-w-[180px]">
            Descrizione
            <input type="text" value={nuovaDescr} onChange={(e) => setNuovaDescr(e.target.value)}
              placeholder="es. San Gaudenzo"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </label>
          <button onClick={addFestivo} disabled={!nuovaData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40">
            <Plus size={14} /> Aggiungi
          </button>
        </div>
        {festiviError && <div className="mt-2 text-xs text-red-700">{festiviError}</div>}

        {festivi.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {festivi.map((f) => (
              <li key={f.data} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-800">
                    {new Date(f.data + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  {f.descrizione && <span className="text-slate-500"> · {f.descrizione}</span>}
                </span>
                <button onClick={() => removeFestivo(f.data)} aria-label={`Rimuovi ${f.data}`}
                  className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saveState === "success" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 size={14} /> Salvato.</div>
      )}
      {saveState === "error" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-red-700"><AlertCircle size={14} /> {errorMsg || "Errore nel salvataggio."}</div>
      )}

      <Anteprima refreshKey={previewKey} dirty={dirty} />
    </section>
  );
}

function FasciaEditor({ label, attivo, dalle, alle, invalid, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
      <input
        type="checkbox"
        checked={attivo}
        onChange={(e) => onChange({ attivo: e.target.checked })}
        aria-label={`${label}: attivo`}
        className="w-4 h-4 rounded accent-indigo-600"
      />
      <input
        type="time"
        value={dalle}
        disabled={!attivo}
        onChange={(e) => onChange({ dalle: e.target.value })}
        aria-label={`${label}: dalle`}
        className={`w-[7.25rem] px-2 py-1 rounded-md border text-sm disabled:bg-slate-50 disabled:text-slate-300 ${invalid ? "border-red-400" : "border-slate-200"}`}
      />
      <span className="text-slate-400">–</span>
      <input
        type="time"
        value={alle}
        disabled={!attivo}
        onChange={(e) => onChange({ alle: e.target.value })}
        aria-label={`${label}: alle`}
        className={`w-[7.25rem] px-2 py-1 rounded-md border text-sm disabled:bg-slate-50 disabled:text-slate-300 ${invalid ? "border-red-400" : "border-slate-200"}`}
      />
    </div>
  );
}

// Cosa vedrebbe un cliente adesso, o in un momento a scelta. Usa la stessa
// funzione del sito (chat_availability), quindi e' la prova reale delle
// regole SALVATE (non di quelle in modifica).
function Anteprima({ refreshKey, dirty }) {
  const [quando, setQuando] = useState(""); // "" = adesso
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const args = quando ? { p_at: new Date(quando).toISOString() } : {};
    supabase.rpc("chat_availability", args).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setErr(error.message); setRes(null); }
      else { setErr(null); setRes(data); }
    });
    return () => { alive = false; };
  }, [quando, refreshKey]);

  const tipo = useMemo(
    () => ({ feriale: "Giorno feriale", weekend: "Fine settimana", festivo: "Festivo" }[res?.giorno_tipo] ?? ""),
    [res],
  );

  return (
    <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Anteprima: cosa vede il cliente</h3>
        <label className="text-xs text-slate-600 flex items-center gap-2">
          Quando
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)}
            className="px-2 py-1 rounded-md border border-slate-200 text-sm bg-white" />
          {quando && <button onClick={() => setQuando("")} className="text-slate-500 hover:text-slate-800 underline">adesso</button>}
        </label>
      </div>

      {err && <div className="mt-2 text-xs text-red-700">{err}</div>}
      {res && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <Voce label="Momento" value={`${res.ora_locale?.replace(" ", " alle ")}${res.festivo ? " · " + res.festivo : ""}`} sub={tipo} />
          <Voce label="Sito assistenza" ok={res.chatbot_attivo}
            value={res.chatbot_attivo ? "Chatbot AI" : "Chat Zoho diretta (o ticket)"} />
          <Voce label="Pulsante WhatsApp" ok={res.whatsapp} value={res.whatsapp ? "Visibile" : "Nascosto"} />
        </div>
      )}
      {dirty && (
        <div className="mt-3 text-xs text-amber-700">Hai modifiche non salvate: l'anteprima mostra le regole salvate.</div>
      )}
      <div className="mt-2 text-[11px] text-slate-400">Il campo "Quando" usa l'orario del tuo computer.</div>
    </div>
  );
}

function Voce({ label, value, sub, ok }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
        {ok !== undefined && (
          <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
        )}
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
