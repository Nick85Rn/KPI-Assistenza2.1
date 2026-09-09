// src/pages/Login.jsx
//
// Schermata di accesso: email + password, gestite da Supabase Auth.
// Nessuna registrazione pubblica: gli account vengono creati a mano
// dall'amministratore su Supabase (Authentication > Users > Add user).

import { useState } from "react";
import { supabase } from "../supabaseClient";
import { LogIn, AlertCircle, CheckCircle2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [mostraReset, setMostraReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetInviato, setResetInviato] = useState(false);
  const [resetError, setResetError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      // Messaggio generico: non specificare se è l'email o la password
      // ad essere sbagliata, per non facilitare tentativi mirati.
      setError("Credenziali non valide. Controlla email e password.");
    }
    // Se il login va a buon fine, AuthGate se ne accorge da solo
    // tramite onAuthStateChange e mostra la dashboard.
  }

  async function handleResetSubmit(e) {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    setResetLoading(false);
    if (error) {
      setResetError("Impossibile inviare l'email. Riprova tra qualche minuto.");
    } else {
      setResetInviato(true);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
              <path d="M3 12a9 3 0 0 0 18 0"/>
            </svg>
          </div>
          <div className="font-bold text-lg text-slate-900">Pienissimo.bi</div>
          <div className="text-xs uppercase tracking-wider text-slate-400 mt-0.5">
            Dashboard 2.0
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          {!mostraReset ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <LogIn size={16} />
                {loading ? "Accesso in corso..." : "Accedi"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMostraReset(true);
                  setResetInviato(false);
                  setResetError(null);
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-indigo-600"
              >
                Password dimenticata?
              </button>
            </form>
          ) : (
            <div>
              {resetInviato ? (
                <div className="text-center py-2">
                  <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
                  <div className="text-sm font-medium text-slate-900 mb-1">
                    Email inviata
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    Controlla la casella di {email || "posta"} e clicca sul link
                    per impostare una nuova password.
                  </div>
                  <button
                    onClick={() => setMostraReset(false)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Torna al login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div className="text-xs text-slate-500 mb-1">
                    Inserisci la tua email: ti manderemo un link per impostare
                    una nuova password.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {resetError && (
                    <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={14} className="flex-shrink-0" />
                      {resetError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {resetLoading ? "Invio in corso..." : "Invia link di reset"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMostraReset(false)}
                    className="w-full text-center text-xs text-slate-500 hover:text-indigo-600"
                  >
                    Torna al login
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
