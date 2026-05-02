// src/components/SyncButton.jsx
// Pulsante "Aggiorna da Zoho" + popover con stato live di ogni sync.

import { useState, useEffect, useRef } from "react";
import { RefreshCw, Check, AlertCircle, Loader2 } from "lucide-react";
import { formatRelative } from "../lib/format";

function StatusIcon({ state }) {
  if (state === "running") return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (state === "success") return <Check size={14} className="text-green-500" />;
  if (state === "error")   return <AlertCircle size={14} className="text-red-500" />;
  return <span className="w-[14px] h-[14px] rounded-full bg-slate-200 inline-block" />;
}

export default function SyncButton({ statuses, sources, running, lastRunAt, onClick }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  // Fallback sicuri: nei primissimi render statuses/sources potrebbero essere undefined
  const safeStatuses = statuses ?? {};
  const safeSources = Array.isArray(sources) ? sources : [];

  // Chiude il popover cliccando fuori
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Calcola lo stato globale per il colore del pulsante
  const statusValues = Object.values(safeStatuses);
  const allDone = !running && lastRunAt && statusValues.length > 0 &&
    statusValues.every((s) => s?.state === "success" || s?.state === "idle");
  const hasError = statusValues.some((s) => s?.state === "error");

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => {
          if (running) { setOpen(true); return; }
          onClick?.();
          setOpen(true);
        }}
        disabled={running}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors
          ${running
            ? "bg-blue-50 text-blue-700 border-blue-200 cursor-wait"
            : hasError
              ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              : allDone
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
      >
        <RefreshCw size={15} className={running ? "animate-spin" : ""} />
        {running ? "Sincronizzazione..." : "Aggiorna da Zoho"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900">Stato sincronizzazione</div>
            {lastRunAt && (
              <div className="text-xs text-slate-500 mt-0.5">
                Ultima esecuzione: {formatRelative(lastRunAt.toISOString())}
              </div>
            )}
          </div>
          <ul className="p-2">
            {safeSources.map((src) => {
              const s = safeStatuses[src.key] ?? { state: "idle", message: "" };
              return (
                <li key={src.key} className="flex items-start gap-3 px-2 py-2 rounded hover:bg-slate-50">
                  <div className="mt-0.5"><StatusIcon state={s.state} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{src.label}</div>
                    {s.message && (
                      <div className={`text-xs mt-0.5 truncate
                        ${s.state === "error" ? "text-red-600" : "text-slate-500"}`}
                        title={s.message}>
                        {s.message}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="p-3 border-t border-slate-100 text-xs text-slate-500">
            Ogni fonte si sincronizza a turno. Il processo può durare 1-2 minuti.
          </div>
        </div>
      )}
    </div>
  );
}
