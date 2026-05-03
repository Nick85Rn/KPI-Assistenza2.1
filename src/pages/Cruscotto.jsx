// src/pages/Cruscotto.jsx — versione di test, KPI minimi senza tabelle

import {
  MessageSquare,
  Headphones,
  Code2,
  GraduationCap,
  AlertCircle,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import { formatNumber } from "../lib/format";

export default function Cruscotto({ data }) {
  // Massima protezione: ogni accesso ha fallback
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const current = safeData.current || null;
  const previous = safeData.previous || null;
  const yoy = safeData.yoy || null;

  if (loading && !current) {
    return <Loading size="lg" label="Caricamento dati Zoho..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <AlertCircle className="text-red-500" size={20} />
          <span className="font-semibold text-red-900">Errore</span>
        </div>
        <pre className="text-xs text-red-700 whitespace-pre-wrap">{String(error)}</pre>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-900">
        Nessun dato per il periodo selezionato.
      </div>
    );
  }

  // Estrai con fallback ovunque
  const cur = {
    chat: current.chat || {},
    assistenza: current.assistenza || {},
    sviluppo: current.sviluppo || {},
    formazione: current.formazione || {},
  };
  const prev = {
    chat: (previous && previous.chat) || {},
    assistenza: (previous && previous.assistenza) || {},
    sviluppo: (previous && previous.sviluppo) || {},
    formazione: (previous && previous.formazione) || {},
  };
  const ya = {
    chat: (yoy && yoy.chat) || {},
    assistenza: (yoy && yoy.assistenza) || {},
    sviluppo: (yoy && yoy.sviluppo) || {},
    formazione: (yoy && yoy.formazione) || {},
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Volume di lavoro</h2>
        <p className="text-sm text-slate-500 mb-4">Quanto è stato gestito nel periodo</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Chat gestite"
            value={cur.chat.chats_total ?? 0}
            previous={prev.chat.chats_total}
            yoy={ya.chat.chats_total}
            icon={MessageSquare}
            intent="positive"
            formatter={formatNumber}
          />
          <KPICard
            label="Ticket Assistenza"
            value={cur.assistenza.new_tickets ?? 0}
            previous={prev.assistenza.new_tickets}
            yoy={ya.assistenza.new_tickets}
            icon={Headphones}
            intent="neutral"
            formatter={formatNumber}
          />
          <KPICard
            label="Ticket Sviluppo"
            value={cur.sviluppo.new_tickets ?? 0}
            previous={prev.sviluppo.new_tickets}
            yoy={ya.sviluppo.new_tickets}
            icon={Code2}
            intent="neutral"
            formatter={formatNumber}
          />
          <KPICard
            label="Sessioni formazione"
            value={cur.formazione.total_records ?? 0}
            previous={prev.formazione.total_records}
            yoy={ya.formazione.total_records}
            icon={GraduationCap}
            intent="positive"
            formatter={formatNumber}
          />
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
        ✅ Cruscotto base caricato. Tabelle e altre sezioni le aggiungiamo dopo.
      </div>
    </div>
  );
}
