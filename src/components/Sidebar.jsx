// src/components/Sidebar.jsx
// Sidebar di sinistra con logo + menu di navigazione.

import {
  LayoutDashboard,
  MessageSquare,
  GraduationCap,
  Headphones,
  Code2,
  FileText,
  Calendar,
  Database,
} from "lucide-react";

// Le voci della Dashboard 2.0. L'ordine è quello che vedrà l'utente.
// La proprietà "live" indica se la pagina è già implementata.
export const NAV_ITEMS = [
  { key: "cruscotto",  label: "Cruscotto",     icon: LayoutDashboard, live: true  },
  { key: "chat",       label: "Reparto Chat",  icon: MessageSquare,   live: true  },
  { key: "formazione", label: "Formazione",    icon: GraduationCap,   live: false },
  { key: "assistenza", label: "Assistenza",    icon: Headphones,      live: false },
  { key: "sviluppo",   label: "Sviluppo",      icon: Code2,           live: false },
  { key: "report",     label: "Report",        icon: FileText,        live: false },
  { key: "timesheet",  label: "Timesheet",     icon: Calendar,        live: false },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
          <Database size={20} className="text-white" />
        </div>
        <div>
          <div className="text-lg font-bold text-slate-900 leading-tight">Pienissimo.bi</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Dashboard 2.0</div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <li key={item.key}>
                <button
                  onClick={() => onChange?.(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left
                    ${isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                    }`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {!item.live && (
                    <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded
                      ${isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                      Soon
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100 text-[10px] text-slate-400">
        Connesso a Zoho via Supabase
      </div>
    </aside>
  );
}
