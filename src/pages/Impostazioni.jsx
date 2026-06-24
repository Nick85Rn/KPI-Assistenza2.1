// src/pages/Impostazioni.jsx
//
// Pannello per configurare il widget installato sul Backoffice
// clienti: testi, aspetto (colore/posizione/dimensioni/font), icona
// e URL della pagina di assistenza. Il widget (widget.js, servito da
// pienissimo-faq) legge questi valori da Supabase in lettura pubblica.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Save, CheckCircle2, AlertCircle, Loader2, Eye, MessageCircle, Copy, Code2, Upload, Trash2 } from "lucide-react";

const FONT_OPTIONS = [
  { value: "system", label: "Predefinito (sistema)", css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" },
  { value: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { value: "georgia", label: "Georgia (serif)", css: "Georgia, 'Times New Roman', serif" },
  { value: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { value: "courier", label: "Courier (monospace)", css: "'Courier New', Courier, monospace" },
];

function fontCssFor(value) {
  return (FONT_OPTIONS.find((f) => f.value === value) || FONT_OPTIONS[0]).css;
}

const WIDGET_SCRIPT_URL = "https://faqpienissimo.netlify.app/widget.js";
const WIDGET_SNIPPET = `<script src="${WIDGET_SCRIPT_URL}" async></script>`;

const MAX_ICON_SIZE_BYTES = 1024 * 1024; // 1 MB
const ALLOWED_ICON_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

const DEFAULT_FORM = {
  welcome_title: "",
  welcome_message: "",
  button_label: "",
  is_active: true,
  position: "bottom-right",
  primary_color: "#1E6EAA",
  button_size: 56,
  font_family: "system",
  landing_url: "",
  icon_url: null,
};

export default function Impostazioni() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState(null); // null | "success" | "error"
  const [errorMsg, setErrorMsg] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconError, setIconError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("widget_settings")
      .select(
        "welcome_title, welcome_message, button_label, is_active, position, primary_color, button_size, font_family, landing_url, icon_url, updated_at"
      )
      .eq("id", 1)
      .single();

    if (error) {
      setErrorMsg(`Errore nel caricamento: ${error.message}`);
      setLoading(false);
      return;
    }

    setForm({
      welcome_title: data.welcome_title ?? "",
      welcome_message: data.welcome_message ?? "",
      button_label: data.button_label ?? "",
      is_active: data.is_active ?? true,
      position: data.position ?? "bottom-right",
      primary_color: data.primary_color ?? "#1E6EAA",
      button_size: data.button_size ?? 56,
      font_family: data.font_family ?? "system",
      landing_url: data.landing_url ?? "",
      icon_url: data.icon_url ?? null,
    });
    setUpdatedAt(data.updated_at ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveState(null);
  }

  async function handleCopySnippet() {
    try {
      await navigator.clipboard.writeText(WIDGET_SNIPPET);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Impossibile copiare:", err);
    }
  }

  async function handleIconUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset input, permette di riselezionare lo stesso file in seguito
    if (!file) return;

    setIconError(null);

    if (!ALLOWED_ICON_TYPES.includes(file.type)) {
      setIconError("Formato non supportato. Usa PNG, JPG, SVG o WEBP.");
      return;
    }
    if (file.size > MAX_ICON_SIZE_BYTES) {
      setIconError("File troppo grande. Il limite è 1 MB.");
      return;
    }

    setUploadingIcon(true);

    // Nome file fisso (non basato sull'originale): sovrascrive sempre la
    // stessa icona, niente accumulo di file orfani nel bucket nel tempo.
    const ext = file.name.split(".").pop() || "png";
    const path = `widget-icon.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("widget-assets")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setIconError(`Errore upload: ${uploadError.message}`);
      setUploadingIcon(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("widget-assets")
      .getPublicUrl(path);

    // Cache-busting: aggiunge un timestamp così il widget (e il browser)
    // non mostrino una versione vecchia in cache dopo una sovrascrittura.
    const freshUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: dbError } = await supabase
      .from("widget_settings")
      .update({ icon_url: freshUrl, updated_at: new Date().toISOString() })
      .eq("id", 1);

    setUploadingIcon(false);

    if (dbError) {
      setIconError(`Errore salvataggio: ${dbError.message}`);
      return;
    }

    setForm((prev) => ({ ...prev, icon_url: freshUrl }));
    setUpdatedAt(new Date().toISOString());
  }

  async function handleIconRemove() {
    setUploadingIcon(true);
    setIconError(null);

    const { error: dbError } = await supabase
      .from("widget_settings")
      .update({ icon_url: null, updated_at: new Date().toISOString() })
      .eq("id", 1);

    setUploadingIcon(false);

    if (dbError) {
      setIconError(`Errore: ${dbError.message}`);
      return;
    }

    setForm((prev) => ({ ...prev, icon_url: null }));
    setUpdatedAt(new Date().toISOString());
    // Nota: non rimuoviamo il file dal bucket (resterebbe come storico),
    // semplicemente non viene più referenziato da widget_settings.
  }

  async function handleSave() {
    setSaving(true);
    setSaveState(null);
    setErrorMsg(null);

    const { error } = await supabase
      .from("widget_settings")
      .update({
        welcome_title: form.welcome_title,
        welcome_message: form.welcome_message,
        button_label: form.button_label,
        is_active: form.is_active,
        position: form.position,
        primary_color: form.primary_color,
        button_size: form.button_size,
        font_family: form.font_family,
        landing_url: form.landing_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    setSaving(false);

    if (error) {
      setSaveState("error");
      setErrorMsg(error.message);
      return;
    }

    setSaveState("success");
    setUpdatedAt(new Date().toISOString());
    setTimeout(() => setSaveState(null), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Caricamento impostazioni...
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* ============ TESTI ============ */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">
            Widget Backoffice — Testi
          </h2>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => handleChange("is_active", e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            Widget attivo
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Questo messaggio viene mostrato quando un cliente apre il widget di
          assistenza nel Backoffice. Usalo per comunicazioni importanti
          (manutenzioni programmate, novità, avvisi urgenti).
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Titolo
            </label>
            <input
              type="text"
              value={form.welcome_title}
              onChange={(e) => handleChange("welcome_title", e.target.value)}
              placeholder="Ciao! 👋"
              maxLength={80}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Messaggio
            </label>
            <textarea
              value={form.welcome_message}
              onChange={(e) => handleChange("welcome_message", e.target.value)}
              placeholder="Hai bisogno di aiuto? Siamo qui per te."
              rows={4}
              maxLength={500}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <div className="text-xs text-slate-400 mt-1 text-right">
              {form.welcome_message.length}/500
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Testo del bottone
            </label>
            <input
              type="text"
              value={form.button_label}
              onChange={(e) => handleChange("button_label", e.target.value)}
              placeholder="Vai all'assistenza"
              maxLength={40}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
      </section>

      {/* ============ ASPETTO ============ */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Aspetto</h2>
        <p className="text-sm text-slate-500 mb-6">
          Colore, posizione, dimensioni e font del widget.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Colore principale
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => handleChange("primary_color", e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={form.primary_color}
                onChange={(e) => handleChange("primary_color", e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Posizione
            </label>
            <select
              value={form.position}
              onChange={(e) => handleChange("position", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="bottom-right">Basso a destra</option>
              <option value="bottom-left">Basso a sinistra</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Dimensione bottone ({form.button_size}px)
            </label>
            <input
              type="range"
              min={40}
              max={80}
              step={2}
              value={form.button_size}
              onChange={(e) => handleChange("button_size", Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>40px</span>
              <span>80px</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Font
            </label>
            <select
              value={form.font_family}
              onChange={(e) => handleChange("font_family", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Icona del bottone (opzionale)
          </label>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: form.primary_color }}
            >
              {form.icon_url ? (
                <img src={form.icon_url} alt="Icona widget" className="w-8 h-8 object-contain" />
              ) : (
                <MessageCircle size={24} color="white" strokeWidth={2} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
                {uploadingIcon ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {form.icon_url ? "Cambia icona" : "Carica icona"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleIconUpload}
                  disabled={uploadingIcon}
                  className="hidden"
                />
              </label>

              {form.icon_url && (
                <button
                  type="button"
                  onClick={handleIconRemove}
                  disabled={uploadingIcon}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Rimuovi
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            PNG, JPG, SVG o WEBP — max 1 MB. Se non carichi nulla, viene usata l'icona predefinita.
          </p>
          {iconError && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 mt-2">
              <AlertCircle size={12} />
              {iconError}
            </div>
          )}
        </div>
      </section>

      {/* ============ COMPORTAMENTO ============ */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Comportamento</h2>
        <p className="text-sm text-slate-500 mb-6">
          Dove porta il bottone "{form.button_label || "Vai all'assistenza"}" del popup.
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            URL pagina di assistenza
          </label>
          <input
            type="url"
            value={form.landing_url}
            onChange={(e) => handleChange("landing_url", e.target.value)}
            placeholder="https://faqpienissimo.netlify.app/landing"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">
            Si apre in una nuova tab quando il cliente clicca il bottone nel popup.
          </p>
        </div>
      </section>

      {/* ============ CODICE DI INSTALLAZIONE ============ */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Code2 size={18} className="text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">
            Codice di installazione
          </h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Da consegnare al team Sviluppo: va incollato una sola volta, subito
          prima della chiusura del tag <code className="bg-slate-100 px-1 rounded">&lt;/body&gt;</code> nel
          template del Backoffice. Aspetto e testi del widget si aggiornano
          automaticamente da qui sopra — non serve toccare di nuovo il codice
          per le modifiche future.
        </p>

        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto font-mono">
            {WIDGET_SNIPPET}
          </pre>
          <button
            onClick={handleCopySnippet}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-medium rounded-md transition-colors"
          >
            {copySuccess ? (
              <>
                <CheckCircle2 size={13} />
                Copiato
              </>
            ) : (
              <>
                <Copy size={13} />
                Copia
              </>
            )}
          </button>
        </div>
      </section>

      {errorMsg && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Salvataggio..." : "Salva modifiche"}
        </button>

        {saveState === "success" && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 size={16} />
            Salvato
          </span>
        )}

        {updatedAt && (
          <span className="text-xs text-slate-400 ml-auto">
            Ultimo aggiornamento: {new Date(updatedAt).toLocaleString("it-IT")}
          </span>
        )}
      </div>

      {/* ============ ANTEPRIMA LIVE ============ */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={16} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">
            Anteprima widget
          </h3>
        </div>
        <div
          className="bg-slate-50 rounded-lg p-8 relative"
          style={{ minHeight: 260, fontFamily: fontCssFor(form.font_family) }}
        >
          {/* Popup */}
          <div
            className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5 absolute"
            style={{
              width: 280,
              bottom: form.button_size + 36,
              [form.position === "bottom-left" ? "left" : "right"]: 24,
            }}
          >
            <div className="font-bold text-base text-slate-900 mb-2">
              {form.welcome_title || "Ciao! 👋"}
            </div>
            <div className="text-sm text-slate-600 mb-4 whitespace-pre-wrap">
              {form.welcome_message || "Hai bisogno di aiuto? Siamo qui per te."}
            </div>
            <button
              type="button"
              disabled
              className="w-full text-white text-sm font-medium rounded-lg py-2.5 cursor-default"
              style={{ background: form.primary_color }}
            >
              {form.button_label || "Vai all'assistenza"}
            </button>
          </div>

          {/* Bottone flottante */}
          <div
            className="rounded-full shadow-lg flex items-center justify-center absolute overflow-hidden"
            style={{
              width: form.button_size,
              height: form.button_size,
              background: form.primary_color,
              bottom: 24,
              [form.position === "bottom-left" ? "left" : "right"]: 24,
            }}
          >
            {form.icon_url ? (
              <img
                src={form.icon_url}
                alt=""
                style={{ width: form.button_size * 0.6, height: form.button_size * 0.6, objectFit: "contain" }}
              />
            ) : (
              <MessageCircle size={form.button_size * 0.45} color="white" strokeWidth={2} />
            )}
          </div>
        </div>
        {!form.is_active && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            ⚠️ Il widget è attualmente disattivato — non comparirà nel Backoffice
          </div>
        )}
      </section>
    </div>
  );
}
