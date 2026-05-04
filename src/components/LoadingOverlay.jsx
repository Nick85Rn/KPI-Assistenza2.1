// src/components/LoadingOverlay.jsx
// Overlay semi-trasparente da sovrapporre alla pagina durante un re-fetch.
// Si attiva con la prop `visible`. Quando inattivo, non occupa spazio.

import { Loader2 } from "lucide-react";

export default function LoadingOverlay({ visible, label = "Aggiornamento dati..." }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pointer-events-none">
      {/* Tendina semi-trasparente (lascia leggibili i contenuti dietro) */}
      <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] pointer-events-auto" />

      {/* Card centrale con spinner */}
      <div className="relative mt-32 bg-white border border-slate-200 rounded-lg shadow-lg px-5 py-4 flex items-center gap-3 pointer-events-auto">
        <Loader2 size={20} className="animate-spin text-blue-600" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
    </div>
  );
}
