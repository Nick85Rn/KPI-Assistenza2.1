import {
  MessageSquare, AlertTriangle, XCircle, ThumbsDown,
  Sparkles, AlertCircle, Bot,
} from "lucide-react";
import KPICard from "../components/KPICard";
import Loading from "../components/Loading";
import SectionTitle from "../components/SectionTitle";
import { formatNumber } from "../lib/format";

export default function AnalisiChat({ data }) {
  const safeData = data || {};
  const loading = safeData.loading;
  const error = safeData.error;
  const analysis = safeData.chatAnalysis || null;

  if (loading && !analysis) return <Loading size="lg" label="Caricamento analisi chat..." />;
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="mx-auto mb-2 text-red-500" size={32} />
        <div className="text-red-900 font-semibold">Errore: {error}</div>
      </div>
    );
  }
  if (!analysis || analysis.total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <Bot className="mx-auto mb-3 text-slate-400" size={40} />
        <div className="font-semibold text-slate-700">Nessuna chat categorizzata nel periodo</div>
        <div className="text-sm text-slate-500 mt-2">
          Le chat vengono categorizzate automaticamente dal LLM. Verifica il periodo selezionato.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AIBanner total={analysis.total} />
      <section>
        <SectionTitle title="Indicatori globali" hint="Vista d'insieme di tutte le chat categorizzate" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Chat categorizzate" value={analysis.total} icon={MessageSquare}
            intent="neutral" formatter={formatNumber} />
          <KPICard label="% Urgenti" value={analysis.pct_urgent.toFixed(1)} icon={AlertTriangle}
            intent="negative" suffix="%" hint={`${formatNumber(analysis.urgent_total)} chat`} />
          <KPICard label="% Non risolte" value={analysis.pct_unresolved.toFixed(1)} icon={XCircle}
            intent="negative" suffix="%" hint={`${formatNumber(analysis.unresolved_total)} chat`} />
          <KPICard label="% Negative" value={analysis.pct_negative.toFixed(1)} icon={ThumbsDown}
            intent="negative" suffix="%" hint={`${formatNumber(analysis.negative_total)} chat`} />
        </div>
      </section>

      <section>
        <SectionTitle title="Distribuzione categorie"
          hint="Quante chat per ogni categoria, e quanto sono problematiche" />
        <CategoryBreakdown categories={analysis.categories} total={analysis.total} />
      </section>

      {analysis.top_subcategories.length > 0 && (
        <section>
          <SectionTitle title="Top sottocategorie problematiche"
            hint="Le 20 sottocategorie con più ticket urgenti o non risolti" />
          <SubcategoryTable items={analysis.top_subcategories} />
        </section>
      )}

      {analysis.trend.length > 0 && (
        <section>
          <SectionTitle title="Trend mensile per categoria"
            hint="Andamento delle chat categorizzate per mese" />
          <TrendByCategory trend={analysis.trend} />
        </section>
      )}
    </div>
  );
}

function AIBanner({ total }) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-5">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-full bg-indigo-100 text-indigo-700">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-indigo-700">
            Analisi automatica AI (Claude Haiku 4.5)
          </div>
          <div className="text-2xl font-bold text-indigo-900 mt-1">
            {formatNumber(total)} chat categorizzate
          </div>
          <div className="text-xs text-indigo-700 mt-1">
            Categoria, sottocategoria, sentiment e stato di risoluzione assegnati automaticamente
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryBreakdown({ categories, total }) {
  const maxCount = Math.max(...categories.map((c) => c.total), 1);
  const sentimentColor = (pct) => pct > 25 ? "text-red-700 font-semibold" : pct > 10 ? "text-amber-700" : "text-slate-600";
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Categoria</th>
            <th className="px-4 py-3 font-semibold w-1/3">Volume</th>
            <th className="text-right px-4 py-3 font-semibold">Chat</th>
            <th className="text-right px-4 py-3 font-semibold">% Tot</th>
            <th className="text-right px-4 py-3 font-semibold">% Urgenti</th>
            <th className="text-right px-4 py-3 font-semibold">% Non Ris.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {categories.map((c) => {
            const barPct = (c.total / maxCount) * 100;
            return (
              <tr key={c.category} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{c.category}</td>
                <td className="px-4 py-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${barPct}%` }} />
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatNumber(c.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{c.pct.toFixed(1)}%</td>
                <td className={`px-4 py-3 text-right tabular-nums ${sentimentColor(c.pct_urgent)}`}>
                  {c.pct_urgent.toFixed(1)}%
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${sentimentColor(c.pct_unresolved)}`}>
                  {c.pct_unresolved.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SubcategoryTable({ items }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Sottocategoria</th>
            <th className="text-left px-4 py-3 font-semibold">Categoria</th>
            <th className="text-right px-4 py-3 font-semibold">Tot</th>
            <th className="text-right px-4 py-3 font-semibold">Urgenti</th>
            <th className="text-right px-4 py-3 font-semibold">Non Risolte</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((s, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-900">{s.subcategory}</td>
              <td className="px-4 py-3">
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">
                  {s.category}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatNumber(s.total)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-red-700 font-medium">
                {s.urgent > 0 ? formatNumber(s.urgent) : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-amber-700 font-medium">
                {s.unresolved > 0 ? formatNumber(s.unresolved) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendByCategory({ trend }) {
  // Pivot: months as columns, categories as rows
  const months = [...new Set(trend.map((t) => t.month))].sort();
  const categories = [...new Set(trend.map((t) => t.category))];

  const matrix = new Map();
  for (const t of trend) {
    if (!matrix.has(t.category)) matrix.set(t.category, new Map());
    matrix.get(t.category).set(t.month, t.count);
  }

  const totals = categories.map((c) => ({
    cat: c,
    total: months.reduce((sum, m) => sum + (matrix.get(c)?.get(m) || 0), 0),
  })).sort((a, b) => b.total - a.total);

  const maxValue = Math.max(...trend.map((t) => t.count), 1);

  const monthLabel = (m) => {
    const [year, month] = m.split("-");
    const names = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${names[parseInt(month) - 1]} ${year.slice(2)}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Categoria</th>
            {months.map((m) => (
              <th key={m} className="text-right px-3 py-3 font-semibold">{monthLabel(m)}</th>
            ))}
            <th className="text-right px-4 py-3 font-semibold">Totale</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {totals.map(({ cat, total }) => (
            <tr key={cat} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{cat}</td>
              {months.map((m) => {
                const v = matrix.get(cat)?.get(m) || 0;
                const intensity = v / maxValue;
                const bg = v > 0
                  ? `rgba(99, 102, 241, ${0.1 + intensity * 0.5})`
                  : "transparent";
                return (
                  <td key={m} className="text-right px-3 py-2 tabular-nums"
                      style={{ backgroundColor: bg }}>
                    {v > 0 ? formatNumber(v) : "—"}
                  </td>
                );
              })}
              <td className="text-right px-4 py-3 tabular-nums font-bold">{formatNumber(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
