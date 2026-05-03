// src/components/SyncButton.jsx — VERSIONE DUMMY per test

import { RefreshCw } from "lucide-react";

export default function SyncButton({ onClick, running }) {
  return (
    <button
      onClick={() => onClick?.()}
      disabled={running}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
    >
      <RefreshCw size={15} className={running ? "animate-spin" : ""} />
      {running ? "Sincronizzazione..." : "Aggiorna da Zoho"}
    </button>
  );
}
