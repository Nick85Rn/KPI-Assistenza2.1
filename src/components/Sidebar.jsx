// src/components/Sidebar.jsx
// Sidebar di navigazione con voci live/soon e badge opzionali.

import {
  LayoutGrid,
  MessageSquare,
  GraduationCap,
  Headphones,
  Code2,
  Bot,
  FileText,
  Settings,
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "cruscotto",    label: "Cruscotto",     icon: LayoutGrid,    live: true  },
  { key: "chat",         label: "Reparto Chat",  icon: MessageSquare, live: true  },
  { key: "formazione",   label: "Formazione",    icon: GraduationCap, live: true  },
  { key: "assistenza",   label: "Assistenza",    icon: Headphones,    live: true  },
  { key: "sviluppo",     label: "Sviluppo",      icon: Code2,         live: true  },
  { key: "analisi-chat", label: "Analisi Chat",  icon: Bot,           live: true, badge: "AI" },
  { key: "report",       label: "Report",        icon: FileText,      live: true  },
  { key: "impostazioni", label: "Impostazioni",  icon: Settings,      live: true  },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="w-60 bg-slate-900 text-slate-100 flex-shrink-0 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
              <path d="M3 12a9 3 0 0 0 18 0"/>
            </svg>
          </div>
          <div>
            <div className="font-bold text-base leading-tight">Pienissimo.bi</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
              Dashboard 2.0
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const isClickable = item.live;
          return (
            <button
              key={item.key}
              onClick={() => isClickable && onChange?.(item.key)}
              disabled={!isClickable}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive
                  ? "bg-slate-800 text-white font-semibold"
                  : isClickable
                    ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                    : "text-slate-500 cursor-not-allowed opacity-60"
                }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon size={17} className="flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
              {!item.live && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                  Soon
                </span>
              )}
              {item.live && item.badge && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800 text-[10px] text-slate-500">
        Connesso a Zoho via Supabase
      </div>
    </aside>
  );
}
