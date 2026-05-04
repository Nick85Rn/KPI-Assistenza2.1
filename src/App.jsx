// src/App.jsx — versione produzione con overlay di caricamento

import { useState, useMemo, Component } from "react";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import TimeframeSelector from "./components/TimeframeSelector";
import SyncButton from "./components/SyncButton";
import Loading from "./components/Loading";
import LoadingOverlay from "./components/LoadingOverlay";
import Cruscotto from "./pages/Cruscotto";
import RepartoChat from "./pages/RepartoChat";
import { useDashboardData } from "./hooks/useDashboardData";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { periodBounds, previousPeriod, yoyPeriod, formatPeriodLabel } from "./lib/periods";
import { formatRelative } from "./lib/format";
import { Construction, AlertTriangle } from "lucide-react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary catch:", error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-2xl w-full bg-white border border-red-200 rounded-lg p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={22} />
              </div>
              <h1 className="text-xl font-bold">Errore</h1>
            </div>
            <pre className="bg-slate-50 border rounded p-4 text-xs text-red-700 overflow-auto whitespace-pre-wrap break-all">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            {this.state.info?.componentStack && (
              <details className="mt-4" open>
                <summary className="text-sm cursor-pointer font-medium">Stack componenti</summary>
                <pre className="mt-2 bg-slate-50 border rounded p-3 text-xs text-slate-600 overflow-auto whitespace-pre-wrap">
                  {this.state.info.componentStack}
                </pre>
              </details>
            )}
            <button onClick={() => location.reload()} className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm">
              Ricarica
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const [activePage, setActivePage] = useState("cruscotto");
  const [period, setPeriod] = useState({ type: "month", anchor: new Date() });

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

  const extras = useMemo(() => {
    if (activePage === "chat") {
      return { heatmap: true, topVisitors: true };
    }
    return {};
  }, [activePage]);

  const data = useDashboardData({ ...ranges, extras }) || {};
  const sync = useSyncStatus() || {};

  const lastSync = data.lastSync && typeof data.lastSync === "object" ? data.lastSync : {};
  const hasSyncInfo = Object.keys(lastSync).length > 0;

  // L'overlay appare quando stiamo aggiornando MA abbiamo già dati visibili
  // Per il primo caricamento usiamo invece il <Loading /> standard
  const showOverlay = !!data.loading && !!data.current;
  const overlayLabel = sync.running
    ? "Sincronizzazione con Zoho in corso..."
    : "Aggiornamento dati...";

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar active={activePage} onChange={setActivePage} />

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-8 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold">
                {NAV_ITEMS.find((n) => n.key === activePage)?.label ?? "Dashboard"}
              </h1>
              <div className="text-sm text-slate-500 mt-0.5">
                Periodo: <span className="font-medium text-slate-700">
                  {formatPeriodLabel(period.type, period.anchor)}
                </span>
                {hasSyncInfo && (
                  <span className="ml-3 text-slate-400">
                    · Ultima sincronizzazione: {getMostRecentSync(lastSync)}
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
                running={!!sync.running}
                lastRunAt={sync.lastRunAt}
                onClick={() => sync.runSync?.(data.refresh)}
              />
            </div>
          </div>
        </header>

        <div className="flex-1 px-8 py-6">
          <ErrorBoundary>
            <PageContent activePage={activePage} data={data} />
          </ErrorBoundary>
        </div>
      </main>

      {/* Overlay globale - sopra a tutto */}
      <LoadingOverlay visible={showOverlay} label={overlayLabel} />
    </div>
  );
}

function PageContent({ activePage, data }) {
  if (data.loading && !data.current) {
    return <Loading size="lg" label="Caricamento dati Zoho..." />;
  }
  switch (activePage) {
    case "cruscotto":
      return <Cruscotto data={data} />;
    case "chat":
      return <RepartoChat data={data} />;
    default:
      return <Placeholder pageKey={activePage} />;
  }
}

function Placeholder({ pageKey }) {
  const item = NAV_ITEMS.find((n) => n.key === pageKey);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-700 mb-4">
        <Construction size={26} />
      </div>
      <h2 className="text-xl font-bold mb-2">{item?.label ?? pageKey}</h2>
      <p className="text-slate-600">Sezione in costruzione.</p>
    </div>
  );
}

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

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
