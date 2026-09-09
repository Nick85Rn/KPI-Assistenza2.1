// src/pages/ResetPasswordForm.jsx
//
// Mostrata quando l'utente arriva sul sito dopo aver cliccato il link
// di reset ricevuto via email. Supabase autentica automaticamente la
// sessione con il token di recovery presente nell'URL (gestito da
// supabase-js stesso, detectSessionInUrl è attivo di default): qui
// serve solo far scegliere la nuova password e salvarla.

import { useState } from "react";
import { supabase } from "../supabaseClient";
import { KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ResetPasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [conferma, setConferma] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fatto, setFatto] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== conferma) {
      setError("Le due password non coincidono.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError("Impossibile aggiornare la password. Riprova.");
      return;
    }
    setFatto(true);
  }

  return (
    <div className="h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-3">
            <KeyRound size={22} color="white" />
          </div>
          <div className="font-bold text-lg text-slate-900">Imposta nuova password</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          {fatto ? (
            <div className="text-center py-2">
              <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
              <div className="text-sm font-medium text-slate-900 mb-1">
                Password aggiornata
              </div>
              <div className="text-xs text-slate-500 mb-4">
                Da questo momento puoi accedere con la nuova password.
              </div>
              <button
                onClick={onDone}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Vai alla dashboard
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Nuova password
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Conferma password
                </label>
                <input
                  type="password"
                  required
                  value={conferma}
                  onChange={(e) => setConferma(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? "Salvataggio..." : "Salva nuova password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
