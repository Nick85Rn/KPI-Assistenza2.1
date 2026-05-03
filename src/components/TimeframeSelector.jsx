// src/components/TimeframeSelector.jsx
// Selettore Settimana / Mese / Anno con navigazione avanti/indietro.

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatPeriodLabel, shiftAnchor } from "../lib/periods";

const TYPES = [
  { key: "week",  label: "Settimana" },
  { key: "month", label: "Mese" },
  { key: "year",  label: "Anno" },
];

export default function TimeframeSelector({ type, anchor, onChange }) {
  const isCurrent = isAnchorCurrent(type, anchor);

  const setType = (newType) => {
    onChange?.({ type: newType, anchor: new Date() });
  };

  const shift = (direction) => {
    const newAnchor = shiftAnchor(type, anchor, direction);
    onChange?.({ type, anchor: newAnchor });
  };

  const goToToday = () => {
    onChange?.({ type, anchor: new Date() });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex bg-slate-100 rounded-lg p-1">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors
              ${type === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => shift(-1)}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          aria-label="Periodo precedente"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="px-3 py-1.5 min-w-[200px] text-center">
          <div className="text-sm font-semibold text-slate-900">
            {formatPeriodLabel(type, anchor)}
          </div>
        </div>

        <button
          onClick={() => shift(+1)}
          disabled={isCurrent}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Periodo successivo"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {!isCurrent && (
        <button
          onClick={goToToday}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Calendar size={14} />
          Oggi
        </button>
      )}
    </div>
  );
}

function isAnchorCurrent(type, anchor) {
  if (!(anchor instanceof Date)) return false;
  const now = new Date();
  switch (type) {
    case "week": {
      const d1 = isoWeekKey(anchor);
      const d2 = isoWeekKey(now);
      return d1 === d2;
    }
    case "month":
      return anchor.getFullYear() === now.getFullYear()
          && anchor.getMonth() === now.getMonth();
    case "year":
      return anchor.getFullYear() === now.getFullYear();
    default:
      return false;
  }
}

function isoWeekKey(d) {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  const day = (tmp.getDay() + 6) % 7;
  tmp.setDate(tmp.getDate() - day);
  return `${tmp.getFullYear()}-${tmp.getMonth()}-${tmp.getDate()}`;
}
