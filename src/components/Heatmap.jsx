// src/components/Heatmap.jsx
// Heatmap 7×24 (giorno settimana × ora del giorno).
// Ogni cella è colorata in base al numero di chat ricevute in quella fascia.

import { useState } from "react";
import { formatNumber } from "../lib/format";

const DAYS_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * @param data {Object}        - oggetto con grid 7×24, totalChats, maxCellChats
 * @param data.grid {Array}    - matrice [day][hour] con {chats, attended}
 * @param data.totalChats {int}
 * @param data.maxCellChats {int}
 */
export default function Heatmap({ data }) {
  const [hovered, setHovered] = useState(null);

  if (!data || !data.grid) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
        Nessun dato disponibile per la heatmap.
      </div>
    );
  }

  const { grid, totalChats, maxCellChats } = data;

  if (totalChats === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
        Nessuna chat nel periodo selezionato.
      </div>
    );
  }

  // Determina il colore della cella in base all'intensità (0..1)
  const cellColor = (count) => {
    if (count === 0 || maxCellChats === 0) return "#F8FAFC"; // slate-50
    const intensity = count / maxCellChats;
    // Scala blu progressiva
    if (intensity < 0.15) return "#DBEAFE"; // blue-100
    if (intensity < 0.30) return "#BFDBFE"; // blue-200
    if (intensity < 0.50) return "#93C5FD"; // blue-300
    if (intensity < 0.70) return "#60A5FA"; // blue-400
    if (intensity < 0.85) return "#3B82F6"; // blue-500
    return "#1D4ED8"; // blue-700
  };

  const cellTextColor = (count) => {
    if (count === 0 || maxCellChats === 0) return "#94A3B8"; // slate-400
    const intensity = count / maxCellChats;
    return intensity > 0.50 ? "#FFFFFF" : "#1E293B";
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Distribuzione chat per fascia oraria
          </div>
          <div className="text-sm text-slate-600 mt-0.5">
            Totale: {formatNumber(totalChats)} chat · Picco: {formatNumber(maxCellChats)} chat/ora
          </div>
        </div>
        {hovered && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 font-medium text-slate-700">
            <span className="text-slate-500">{DAYS_LABELS[hovered.day]} {hovered.hour}:00 → </span>
            <strong>{formatNumber(hovered.chats)} chat</strong>
            {hovered.attended > 0 && (
              <span className="text-slate-500"> ({formatNumber(hovered.attended)} accettate)</span>
            )}
          </div>
        )}
      </div>

      {/* Grid: ore in colonne (header) + giorni in righe */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Header ore */}
          <div className="flex items-end gap-[2px] mb-1 ml-10">
            {HOURS.map((h) => (
              <div
                key={h}
                className="w-7 text-[10px] text-center text-slate-400 font-medium"
              >
                {h % 3 === 0 ? `${String(h).padStart(2, "0")}` : ""}
              </div>
            ))}
          </div>

          {/* Righe per giorno */}
          {DAYS_LABELS.map((dayLabel, dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-[2px] mb-[2px]">
              <div className="w-10 text-xs text-slate-500 font-medium text-right pr-2">
                {dayLabel}
              </div>
              {HOURS.map((h) => {
                const cell = grid[dayIdx]?.[h] ?? { chats: 0, attended: 0 };
                const isHovered = hovered?.day === dayIdx && hovered?.hour === h;
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHovered({ day: dayIdx, hour: h, ...cell })}
                    onMouseLeave={() => setHovered(null)}
                    className={`w-7 h-7 rounded-sm flex items-center justify-center text-[9px] font-medium cursor-default transition-transform
                      ${isHovered ? "scale-125 ring-2 ring-slate-900 ring-offset-1 z-10 relative" : ""}`}
                    style={{
                      backgroundColor: cellColor(cell.chats),
                      color: cellTextColor(cell.chats),
                    }}
                    title={`${dayLabel} ${h}:00 — ${cell.chats} chat`}
                  >
                    {cell.chats > 0 ? cell.chats : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
        <span>Meno</span>
        <div className="flex gap-[2px]">
          {[0, 0.15, 0.30, 0.50, 0.70, 0.85, 1].map((i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: cellColor(i * maxCellChats || (i > 0 ? 1 : 0)) }}
            />
          ))}
        </div>
        <span>Più</span>
      </div>
    </div>
  );
}
