import { useEffect, useState } from "react";
import {
  X,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  ThumbsDown,
  ThumbsUp,
  Minus,
} from "lucide-react";
import { getChatsByCategory } from "../api/zohoData";
import { formatNumber, formatDateTime, formatSeconds } from "../lib/format";
import Loading from "./Loading";

const ZOHO_SALESIQ_BASE = "https://salesiq.zoho.eu/pienissimosoftwaresrl/allchats";
const PAGE_SIZE = 100;

function SentimentBadge({ sentiment }) {
  if (sentiment === "urgente") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-700">
        <AlertTriangle size={11} />
        Urgente
      </span>
    );
  }
  if (sentiment === "negativo") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-orange-100 text-orange-700">
        <ThumbsDown size={11} />
        Negativo
      </span>
    );
  }
  if (sentiment === "positivo") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700">
        <ThumbsUp size={11} />
        Positivo
      </span>
    );
  }
  if (sentiment === "neutro") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
        <Minus size={11} />
        Neutro
      </span>
    );
  }
  return null;
}

function ResolvedBadge({ resolved }) {
  if (resolved === true) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700">
        Si
      </span>
    );
  }
  if (resolved === false) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700">
        No
      </span>
    );
  }
  return null;
}

function ChatRow({ chat }) {
  const zohoUrl = ZOHO_SALESIQ_BASE + "/" + chat.chat_id;
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-700 whitespace-nowrap text-xs">
        {formatDateTime(chat.created_time)}
      </td>
      <td className="px-4 py-3 text-slate-900 max-w-[200px] truncate">
        {chat.visitor_name || "(anonimo)"}
      </td>
      <td className="px-4 py-3 text-slate-600 max-w-[280px]">
        <div className="truncate">{chat.subcategory || "-"}</div>
      </td>
      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
        {chat.operator || <span className="text-slate-400 italic">non gestita</span>}
      </td>
      <td className="px-4 py-3 text-right text-slate-600 tabular-nums whitespace-nowrap">
        {chat.duration_seconds ? formatSeconds(chat.duration_seconds) : "-"}
      </td>
      <td className="px-4 py-3 text-center">
        <SentimentBadge sentiment={chat.sentiment} />
      </td>
      <td className="px-4 py-3 text-center">
        <ResolvedBadge resolved={chat.resolved} />
      </td>
      <td className="px-4 py-3 text-right">
        
          href={zohoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline text-xs font-medium"
        >
          Apri
          <ExternalLink size={12} />
        </a>
      </td>
    </tr>
  );
}

export default function ChatDrillDownModal({
  isOpen,
  onClose,
  category,
  subcategory,
  period,
}) {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sentimentFilter, setSentimentFilter] = useState(null);
  const [resolvedFilter, setResolvedFilter] = useState(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!isOpen || !category) return;
    setRows([]);
    setOffset(0);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category, subcategory, sentimentFilter, resolvedFilter]);

  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  async function loadPage(newOffset, replace) {
    setLoading(true);
    try {
      const result = await getChatsByCategory({
        category: category,
        subcategory: subcategory,
        period: period,
        sentimentFilter: sentimentFilter,
        resolvedFilter: resolvedFilter,
        limit: PAGE_SIZE,
        offset: newOffset,
      });
      const newRows = result.rows;
      const count = result.totalCount;
      setRows((prev) => (replace ? newRows : prev.concat(newRows)));
      setTotalCount(count);
      setOffset(newOffset + newRows.length);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const hasMore = rows.length < totalCount;
  const titleText = subcategory ? subcategory : "Tutte le chat " + category;

  const sentimentOptions = [
    { val: null, label: "Tutti" },
    { val: "urgente", label: "Urgente" },
    { val: "negativo", label: "Negativo" },
    { val: "neutro", label: "Neutro" },
    { val: "positivo", label: "Positivo" },
  ];

  const resolvedOptions = [
    { val: null, label: "Tutte" },
    { val: true, label: "Solo Si" },
    { val: false, label: "Solo No" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl my-8 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4 sticky top-0 bg-white rounded-t-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-indigo-100 text-indigo-700">
                {category}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 truncate">{titleText}</h2>
            <div className="text-sm text-slate-600 mt-2">
              <strong>{formatNumber(totalCount)}</strong> chat trovate
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700"
            aria-label="Chiudi"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-2">Sentiment:</span>
          {sentimentOptions.map((opt) => {
            const isActive = sentimentFilter === opt.val;
            const cls = isActive
              ? "px-3 py-1 rounded-md text-xs font-medium bg-indigo-600 text-white"
              : "px-3 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:border-indigo-300";
            return (
              <button key={String(opt.val)} onClick={() => setSentimentFilter(opt.val)} className={cls}>
                {opt.label}
              </button>
            );
          })}
          <div className="w-px h-5 bg-slate-300 mx-2" />
          <span className="text-xs font-medium text-slate-500 mr-2">Risolte:</span>
          {resolvedOptions.map((opt) => {
            const isActive = resolvedFilter === opt.val;
            const cls = isActive
              ? "px-3 py-1 rounded-md text-xs font-medium bg-indigo-600 text-white"
              : "px-3 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:border-indigo-300";
            return (
              <button key={String(opt.val)} onClick={() => setResolvedFilter(opt.val)} className={cls}>
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && rows.length === 0 ? (
            <Loading size="md" label="Caricamento chat..." />
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <MessageSquare className="mx-auto mb-3 text-slate-300" size={32} />
              <div className="font-medium">Nessuna chat trovata</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Data</th>
                  <th className="text-left px-4 py-3 font-semibold">Visitatore</th>
                  <th className="text-left px-4 py-3 font-semibold">Sottocategoria</th>
                  <th className="text-left px-4 py-3 font-semibold">Operatore</th>
                  <th className="text-center px-4 py-3 font-semibold">Durata</th>
                  <th className="text-center px-4 py-3 font-semibold">Sentiment</th>
                  <th className="text-center px-4 py-3 font-semibold">Risolta</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((chat) => (
                  <ChatRow key={chat.chat_id} chat={chat} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {hasMore ? (
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-center">
            <button
              onClick={() => loadPage(offset, false)}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Caricamento..." : "Carica altre 100"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
