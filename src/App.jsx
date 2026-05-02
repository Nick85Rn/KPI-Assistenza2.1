// src/App.jsx
// Punto di ingresso della Dashboard 2.0.
// Orchestra: sidebar, selettore periodo, pulsante sync, render pagina attiva.

import { useState, useMemo } from "react";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import TimeframeSelector from "./components/TimeframeSelector";
import SyncButton from "./components/SyncButton";
import Loading from "./components/Loading";
import Cruscotto from "./pages/Cruscotto";
import { useDashboardData } from "./hooks/useDashboardData";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { periodBounds, previousPeriod, yoyPeriod, formatPeriodLabel } from "./lib/periods";
import { formatRelative } from "./lib/format";
import { Construction } from "lucide-react";

export default function App() {
  // Stato globale dell'app: pagina attiva + periodo selezionato
  const [activePage, setActivePage] = useState("cruscotto");
  const [period, setPeriod] = useState({ type: "month", anchor: new Date() });

  // Calcola i bounds dei 3 periodi (current, previous, yoy)
  const ranges = useMemo(() => {
    const cur = periodBounds(period.type, period.anchor);
    const prev = previousPeriod(period.type, period.anchor);
    const yoy = yoyPeriod(period.type, period.anchor);
    return {
      start: cur.start,    end: cur.end,
      prevStart: prev.start, prevEnd: prev.end,
      yoyStart: yoy.start,   yoyEnd: yoy.end,
    };
  }, [period.type, period.anchor.getTime()]);

  // Hook unificato per i dati
  const data = useDashboardData(ranges);

  // Hook per il pulsante sync (collegato al refresh dati)
  const sync = useSyncStatus();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar active={activePage} onChange={setActivePage} />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header sticky in alto */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {NAV_ITEMS.find((n) => n.key === activePage)?.label ?? "Dashboard"}
              </h1>
              <div className="text-sm text-slate-500 mt-0.5">
                Periodo: <span className="font-medium text-slate-700">
                  {formatPeriodLabel(period.type, period.anchor)}
                </span>
                {data?.lastSync && Object.keys(data.lastSync).length > 0 && (
                  <span className="ml-3 text-slate-400">
                    · Ultima sincronizzazione: {getMostRecentSync(data.lastSync)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <TimeframeSelector
                type={period.type}
                anchor={period.anchor}
                onChange={setPeriod}
              />
              <SyncButton
                statuses={sync.statuses}
                sources={sync.sources}
                running={sync.running}
                lastRunAt={sync.lastRunAt}
                onClick={() => sync.runSync(data.refresh)}
              />
            </div>
          </div>
        </header>

        {/* Contenuto pagina */}
        <div className="flex-1 px-8 py-6">
          {data.loading && !data.current ? (
            <Loading size="lg" label="Caricamento dati Zoho..." />
          ) : (
            <PageContent activePage={activePage} data={data} />
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Smista la pagina attiva al componente corretto.
 */
function PageContent({ activePage, data }) {
  switch (activePage) {
    case "cruscotto":
      return <Cruscotto data={data} />;
    case "chat":
    case "formazione":
    case "assistenza":
    case "sviluppo":
    case "report":
    case "timesheet":
      return <Placeholder pageKey={activePage} />;
    default:
      return <Placeholder pageKey={activePage} />;
  }
}

/**
 * Placeholder per le sezioni in costruzione.
 */
function Placeholder({ pageKey }) {
  const item = NAV_ITEMS.find((n) => n.key === pageKey);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-700 mb-4">
        <Construction size={26} />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">
        {item?.label ?? pageKey}
      </h2>
      <p className="text-slate-600 max-w-md mx-auto">
        Sezione in costruzione. Verrà aggiunta nelle prossime sessioni di sviluppo.
      </p>
      <p className="text-sm text-slate-400 mt-4">
        Per ora puoi vedere i dati nel <span className="font-medium">Cruscotto</span>.
      </p>
    </div>
  );
}

/**
 * Restituisce la più recente data di sync formattata come "2 minuti fa".
 */
function getMostRecentSync(lastSyncByPart) {
  if (!lastSyncByPart || typeof lastSyncByPart !== "object") return "—";
  let mostRecent = null;
  for (const v of Object.values(lastSyncByPart)) {
    if (!v?.finished_at) continue;
    const t = new Date(v.finished_at).getTime();
    if (!mostRecent || t > mostRecent.time) {
      mostRecent = { time: t, iso: v.finished_at };
    }
  }
  return mostRecent ? formatRelative(mostRecent.iso) : "—";
}
