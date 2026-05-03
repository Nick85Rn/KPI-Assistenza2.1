// src/App.jsx — versione finale con ErrorBoundary + tracker

import { useState, useMemo, Component } from "react";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import TimeframeSelector from "./components/TimeframeSelector";
import SyncButton from "./components/SyncButton";
import Loading from "./components/Loading";
import Cruscotto from "./pages/Cruscotto";
import { useDashboardData } from "./hooks/useDashboardData";
import { useSyncStatus } from "./hooks/useSyncStatus";
import { periodBounds, previousPeriod, yoyPeriod, formatPeriodLabel } from "./lib/periods";
import { formatRelative } from "./lib/format";
import { Construction, AlertTriangle } from "lucide-react";

// =========================================================
// ERROR BOUNDARY
// =========================================================
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
          <div className="max-w-2xl w-full bg-white border border-red-200 rounded-lg p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={22} />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Errore nella dashboard</h1>
            </div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-4 text-xs text-red-700 overflow-auto whitespace-pre-wrap break-all">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            {this.state.info?.componentStack && (
              <details className="mt-4" open>
                <summary className="text-sm text-slate-600 cursor-pointer font-medium">Stack componenti (clicca per dettagli)</summary>
                <pre className="mt-2 bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-600 overflow-auto whitespace-pre-wrap">
                  {this.state.info.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => location.reload()}
              className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
            >
              Ricarica pagina
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// =========================================================
// APP - mounting graduale
// =========================================================
function AppInner() {
  const [activePage, setActivePage] = useState("cruscotto");
  const [period, setPeriod] = useState({ type: "month", anchor: new Date() });
  
  // Mount progressivo: parti con tutti i componenti spenti, accendili uno alla volta
  const [mountFlags, setMountFlags] = useState({
    sidebar: true,
    header: true,
    timeframeSelector: true,
    syncButton: true,
    dataHook: true,
    syncHook: true,
    cruscotto: true,
  });
  
  const toggle = (key) => setMountFlags((f) => ({ ...f, [key]: !f[key] }));

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {mountFlags.sidebar && <Sidebar active={activePage} onChange={setActivePage} />}

      <main className="flex-1 min-w-0 flex flex-col">
        {mountFlags.header && (
          <ErrorBoundary>
            <Header
              activePage={activePage}
              period={period}
              setPeriod={setPeriod}
              mountFlags={mountFlags}
            />
          </ErrorBoundary>
        )}

        <div className="flex-1 px-8 py-6">
          {/* Pannello di controllo debug — visibile in alto */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs">
            <div className="font-semibold text-amber-900 mb-2">🔧 Pannello debug — spegni un componente per testare</div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(mountFlags).map((k) => (
                <button
                  key={k}
                  onClick={() => toggle(k)}
                  className={`px-2 py-1 text-[10px] rounded font-medium border
                    ${mountFlags[k]
                      ? "bg-green-100 text-green-800 border-green-300"
                      : "bg-slate-100 text-slate-500 border-slate-300"}`}
                >
                  {mountFlags[k] ? "✓" : "✗"} {k}
                </button>
              ))}
            </div>
          </div>

          {mountFlags.cruscotto ? (
            <ErrorBoundary>
              <CruscottoSection
                period={period}
                useDataHook={mountFlags.dataHook}
                activePage={activePage}
              />
            </ErrorBoundary>
          ) : (
            <div className="p-8 bg-white border rounded text-center text-slate-500">
              Cruscotto non montato (debug)
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Header({ activePage, period, setPeriod, mountFlags }) {
  const sync = mountFlags.syncHook ? useSyncStatus() : null;
  
  return (
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
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mountFlags.timeframeSelector && (
            <TimeframeSelector
              type={period.type}
              anchor={period.anchor}
              onChange={setPeriod}
            />
          )}
          {mountFlags.syncButton && sync && (
            <SyncButton
              statuses={sync.statuses ?? {}}
              sources={Array.isArray(sync.sources) ? sync.sources : []}
              running={!!sync.running}
              lastRunAt={sync.lastRunAt ?? null}
              onClick={() => sync.runSync?.()}
            />
          )}
        </div>
      </div>
    </header>
  );
}

function CruscottoSection({ period, useDataHook, activePage }) {
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

  // Hook condizionale: violiamo le rules of hooks intenzionalmente, ma dato che 
  // useDataHook è uno stato stabile (cambia solo da pannello debug), va bene per testing
  const data = useDataHook ? useDashboardData(ranges) : { loading: false, current: null };

  if (activePage !== "cruscotto") {
    return <Placeholder pageKey={activePage} />;
  }

  if (data?.loading && !data.current) {
    return <Loading size="lg" label="Caricamento dati Zoho..." />;
  }

  return <Cruscotto data={data ?? {}} />;
}

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
        Sezione in costruzione.
      </p>
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
