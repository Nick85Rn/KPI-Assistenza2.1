// src/App.jsx — VERSIONE TEST DEFINITIVO

import { useState, useMemo, Component } from "react";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import TimeframeSelector from "./components/TimeframeSelector";
import SyncButton from "./components/SyncButton";
import { useDashboardData } from "./hooks/useDashboardData";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { periodBounds, previousPeriod, yoyPeriod, formatPeriodLabel } from "./lib/periods";
import { AlertTriangle } from "lucide-react";

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

  const data = useDashboardData(ranges) || {};
  const sync = useSyncStatus() || {};

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
                Periodo: {formatPeriodLabel(period.type, period.anchor)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <TimeframeSelector
                type={period.type}
                anchor={period.anchor}
                onChange={setPeriod}
              />
              <SyncButton
                running={!!sync.running}
                onClick={() => sync.runSync?.(data.refresh)}
              />
            </div>
          </div>
        </header>

        <div className="flex-1 px-8 py-6">
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Pagina di test (vuota)
            </h2>
            <p className="text-slate-600 mb-6">
              Se vedi questo riquadro, l'header funziona. 
              Il bug è solo nel rendering della pagina contenuto.
            </p>
            
            <div className="text-left bg-slate-50 border rounded p-4 text-xs space-y-1 max-w-md mx-auto">
              <div><strong>data.loading:</strong> {String(data.loading)}</div>
              <div><strong>data.error:</strong> {data.error ? String(data.error) : "null"}</div>
              <div><strong>data.current esiste:</strong> {String(!!data.current)}</div>
              <div><strong>data.previous esiste:</strong> {String(!!data.previous)}</div>
              <div><strong>data.yoy esiste:</strong> {String(!!data.yoy)}</div>
              <div><strong>data.lastSync esiste:</strong> {String(!!data.lastSync)}</div>
              <div><strong>sync.statuses esiste:</strong> {String(!!sync.statuses)}</div>
              <div><strong>sync.sources esiste:</strong> {String(!!sync.sources)}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
