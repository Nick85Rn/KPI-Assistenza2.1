// src/components/KPICard.jsx
// Card KPI con valore principale + confronti vs precedente e vs anno scorso.
//
// Uso tipico:
//   <KPICard
//     label="Ticket aperti"
//     value={current.assistenza.new_tickets}
//     previous={previous?.assistenza.new_tickets}
//     yoy={yoy?.assistenza.new_tickets}
//     icon={Headphones}
//     intent="neutral"  // o "positive" / "negative"
//     formatter={formatNumber}
//   />

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { percentChange, formatPercent } from "../lib/format";

/**
 * @param label       string                — testo descrittivo del KPI
 * @param value       number                — valore corrente
 * @param previous    number | null | undef — valore periodo precedente
 * @param yoy         number | null | undef — valore stesso periodo anno scorso
 * @param icon        LucideIcon | null     — icona in alto a destra
 * @param formatter   function              — formatta il valore principale (default: identity)
 * @param intent      "positive" | "negative" | "neutral"
 *                    indica se "in crescita" è positivo (es. ticket chiusi)
 *                    o negativo (es. ticket aperti). default: "neutral"
 * @param suffix      string                — suffisso opzionale (es. "min", "h")
 * @param hint        string                — sottotitolo opzionale
 * @param onClick     function              — se passato, la card è cliccabile (futuro drill-down)
 */
export default function KPICard({
  label,
  value,
  previous,
  yoy,
  icon: Icon,
  formatter = (v) => v,
  intent = "neutral",
  suffix,
  hint,
  onClick,
}) {
  const hasValue = value != null && !isNaN(value);
  const valueDisplay = hasValue ? formatter(value) : "—";

  const deltaPrev = percentChange(value, previous);
  const deltaYoy = percentChange(value, yoy);

  const clickable = typeof onClick === "function";

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-lg p-5 transition-all
        ${clickable ? "cursor-pointer hover:border-slate-300 hover:shadow-sm" : ""}`}
    >
      {/* Riga superiore: icona + etichetta */}
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {Icon && (
          <div className="p-2 rounded-md bg-slate-50 text-slate-600">
            <Icon size={16} />
          </div>
        )}
      </div>

      {/* Valore principale */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <div className="text-3xl font-bold text-slate-900 leading-none">
          {valueDisplay}
        </div>
        {suffix && hasValue && (
          <div className="text-sm font-medium text-slate-500">{suffix}</div>
        )}
      </div>

      {/* Sottotitolo opzionale */}
      {hint && (
        <div className="text-xs text-slate-500 mb-3">{hint}</div>
      )}

      {/* Confronti */}
      <div className="space-y-1 pt-3 border-t border-slate-100">
        <DeltaRow label="vs periodo precedente" delta={deltaPrev} intent={intent} />
        <DeltaRow label="vs anno scorso"        delta={deltaYoy}  intent={intent} />
      </div>
    </div>
  );
}

/**
 * Riga di confronto: " vs xxx     ↗ +12.5% "
 */
function DeltaRow({ label, delta, intent }) {
  const hasData = delta != null && !isNaN(delta);

  // Colore: positivo/negativo dipende dall'intent della metrica
  let color = "text-slate-400";
  let Icon = Minus;
  if (hasData) {
    if (Math.abs(delta) < 0.005) {
      color = "text-slate-500";
      Icon = Minus;
    } else if (delta > 0) {
      Icon = TrendingUp;
      color = intent === "negative" ? "text-red-600"
            : intent === "positive" ? "text-green-600"
            : "text-blue-600";
    } else {
      Icon = TrendingDown;
      color = intent === "negative" ? "text-green-600"
            : intent === "positive" ? "text-red-600"
            : "text-orange-600";
    }
  }

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`flex items-center gap-1 font-medium ${color}`}>
        <Icon size={12} />
        {hasData ? formatPercent(Math.abs(delta), 1) : "n/d"}
      </span>
    </div>
  );
}
