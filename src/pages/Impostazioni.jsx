// src/pages/Impostazioni.jsx
//
// Pannello per configurare il messaggio di benvenuto del widget
// installato sul Backoffice clienti. Il widget legge questi valori
// da Supabase (tabella widget_settings) in lettura pubblica.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Save, CheckCircle2, AlertCircle, Loader2, Eye } from "lucide-react";

export default function Impostazioni() {
  const [form, setForm] = useState({
    welcome_title: "",
    welcome_message: "",
    button_label: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState(null); // null | "success" | "error"
  const [errorMsg, setErrorMsg] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("widget_settings")
      .select("welcome_title, welcome_message, button_label, is_active, updated_at")
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
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">
            Widget Backoffice — Messaggio di benvenuto
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

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={16} />
            {errorMsg}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
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
      </section>

      {/* Anteprima live */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={16} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">
            Anteprima widget
          </h3>
        </div>
        <div className="bg-slate-50 rounded-lg p-8 flex justify-end">
          <div className="w-72 bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
            <div className="font-bold text-base text-slate-900 mb-2">
              {form.welcome_title || "Ciao! 👋"}
            </div>
            <div className="text-sm text-slate-600 mb-4 whitespace-pre-wrap">
              {form.welcome_message || "Hai bisogno di aiuto? Siamo qui per te."}
            </div>
            <button
              type="button"
              disabled
              className="w-full bg-indigo-600 text-white text-sm font-medium rounded-lg py-2.5 cursor-default"
            >
              {form.button_label || "Vai all'assistenza"}
            </button>
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
