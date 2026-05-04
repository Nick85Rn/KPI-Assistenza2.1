// src/components/SectionTitle.jsx
// Titolo di sezione riusabile in tutte le pagine.
// Usato sia in Cruscotto che nelle pagine future (Reparto Chat, Formazione, ...)

export default function SectionTitle({ title, hint, action }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {hint && <div className="text-sm text-slate-500 mt-0.5">{hint}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
