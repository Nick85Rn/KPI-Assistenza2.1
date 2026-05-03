// src/components/Loading.jsx
// Spinner riusabile in tutta la dashboard.
// Tre dimensioni: sm (inline), md (default), lg (full section)

import { Loader2 } from "lucide-react";

export default function Loading({ size = "md", label = "Caricamento..." }) {
  const sizes = {
    sm: { icon: 14, container: "py-2", text: "text-xs" },
    md: { icon: 20, container: "py-6", text: "text-sm" },
    lg: { icon: 32, container: "py-16", text: "text-base" },
  };
  const cfg = sizes[size] ?? sizes.md;

  return (
    <div className={`flex items-center justify-center gap-2 text-slate-400 ${cfg.container}`}>
      <Loader2 size={cfg.icon} className="animate-spin" />
      {label && <span className={cfg.text}>{label}</span>}
    </div>
  );
}
