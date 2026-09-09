// src/AuthGate.jsx
//
// Punto di ingresso dell'autenticazione: decide cosa mostrare in base
// allo stato della sessione Supabase.
//   - sessione in verifica  -> schermata di caricamento
//   - nessuna sessione      -> Login
//   - link di reset appena cliccato (evento PASSWORD_RECOVERY) -> form
//     per impostare la nuova password
//   - sessione valida       -> il contenuto vero dell'app (render prop,
//                              riceve la sessione come argomento)
//
// Nessuna registrazione pubblica: gli account si creano a mano su
// Supabase (Authentication > Users > Add user). Vedi anche le note di
// deploy sulla configurazione "Enable email signups" (da disattivare).

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login";
import ResetPasswordForm from "./pages/ResetPasswordForm";
import Loading from "./components/Loading";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = in verifica
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loading size="lg" label="Verifica accesso..." />
      </div>
    );
  }

  if (recoveryMode) {
    return <ResetPasswordForm onDone={() => setRecoveryMode(false)} />;
  }

  if (!session) {
    return <Login />;
  }

  return children(session);
}
