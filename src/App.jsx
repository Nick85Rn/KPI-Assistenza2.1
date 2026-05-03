// src/App.jsx — versione stabile minimal: parte SENZA hooks per isolare il bug

import { useState } from "react";
import { Database, CheckCircle2, AlertCircle } from "lucide-react";

export default function App() {
  const [tested, setTested] = useState({});
  const [errors, setErrors] = useState({});

  const test = async (name, fn) => {
    try {
      const result = await fn();
      setTested((t) => ({ ...t, [name]: result }));
      setErrors((e) => ({ ...e, [name]: null }));
    } catch (err) {
      setTested((t) => ({ ...t, [name]: null }));
      setErrors((e) => ({ ...e, [name]: err?.stack || err?.message || String(err) }));
    }
  };

  const tests = [
    {
      name: "1. supabaseClient",
      fn: async () => {
        const mod = await import("./supabaseClient");
        return `OK: client = ${typeof mod.supabase}`;
      },
    },
    {
      name: "2. lib/format",
      fn: async () => {
        const m = await import("./lib/format");
        return `OK: ${Object.keys(m).join(", ")}`;
      },
    },
    {
      name: "3. lib/periods",
      fn: async () => {
        const m = await import("./lib/periods");
        const b = m.periodBounds("month", new Date());
        return `OK: bounds = ${b.start.toISOString().slice(0,10)} → ${b.end.toISOString().slice(0,10)}`;
      },
    },
    {
      name: "4. api/zohoData",
      fn: async () => {
        const m = await import("./api/zohoData");
        return `OK: ${Object.keys(m).join(", ")}`;
      },
    },
    {
      name: "5. hooks/useSyncStatus (solo import)",
      fn: async () => {
        const m = await import("./hooks/useSyncStatus");
        return `OK: ${typeof m.useSyncStatus}`;
      },
    },
    {
      name: "6. hooks/useDashboardData (solo import)",
      fn: async () => {
        const m = await import("./hooks/useDashboardData");
        return `OK: ${typeof m.useDashboardData}`;
      },
    },
    {
      name: "7. components/Sidebar (solo import)",
      fn: async () => {
        const m = await import("./components/Sidebar");
        return `OK: NAV_ITEMS=${m.NAV_ITEMS?.length} voci`;
      },
    },
    {
      name: "8. components/SyncButton (solo import)",
      fn: async () => {
        const m = await import("./components/SyncButton");
        return `OK: default = ${typeof m.default}`;
      },
    },
    {
      name: "9. components/TimeframeSelector (solo import)",
      fn: async () => {
        const m = await import("./components/TimeframeSelector");
        return `OK: default = ${typeof m.default}`;
      },
    },
    {
      name: "10. components/KPICard (solo import)",
      fn: async () => {
        const m = await import("./components/KPICard");
        return `OK: default = ${typeof m.default}`;
      },
    },
    {
      name: "11. pages/Cruscotto (solo import)",
      fn: async () => {
        const m = await import("./pages/Cruscotto");
        return `OK: default = ${typeof m.default}`;
      },
    },
    {
      name: "12. Query Supabase: getLastSyncByPart",
      fn: async () => {
        const m = await import("./api/zohoData");
        const r = await m.getLastSyncByPart();
        return `OK: ${Object.keys(r ?? {}).length} fonti, valore = ${JSON.stringify(r).slice(0,200)}`;
      },
    },
    {
      name: "13. Query Supabase: getChatKpis",
      fn: async () => {
        const m = await import("./api/zohoData");
        const r = await m.getChatKpis({ start: new Date("2026-04-01"), end: new Date("2026-04-30") });
        return `OK: ${r?.chats_total ?? 0} chat totali`;
      },
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
            <Database size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Diagnostica Dashboard 2.0</h1>
            <p className="text-sm text-slate-500">Esegui i test in ordine. Il primo che fallisce ci dice dov'è il bug.</p>
          </div>
        </div>

        <div className="space-y-2">
          {tests.map((t) => (
            <div key={t.name} className="flex items-start gap-3 py-2 border-b border-slate-100">
              <button
                onClick={() => test(t.name, t.fn)}
                className="px-3 py-1 bg-slate-900 text-white rounded text-xs hover:bg-slate-700 flex-shrink-0"
              >
                Test
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{t.name}</div>
                {tested[t.name] && (
                  <div className="flex items-start gap-2 mt-1 text-xs text-green-700">
                    <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" />
                    <span className="break-all">{tested[t.name]}</span>
                  </div>
                )}
                {errors[t.name] && (
                  <div className="flex items-start gap-2 mt-1 text-xs text-red-700">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                    <pre className="whitespace-pre-wrap break-all">{errors[t.name]}</pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          📌 Esegui i test <strong>uno alla volta dall'alto verso il basso</strong>. 
          Se uno fallisce mandami screenshot dell'errore. Quando trovi il colpevole, lo fixiamo subito.
        </div>
      </div>
    </div>
  );
}
