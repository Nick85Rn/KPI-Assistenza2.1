// src/pages/Cruscotto.jsx — VERSIONE TEST: dump dei dati senza componenti

export default function Cruscotto({ data }) {
  const safeData = data || {};
  const current = safeData.current;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Diagnostica dati Cruscotto</h2>
        
        <div className="space-y-3 text-sm">
          <Section label="data.loading">{String(safeData.loading)}</Section>
          <Section label="data.error">{safeData.error ? String(safeData.error) : "null"}</Section>
          
          <Section label="data.current">
            {current ? (
              <pre className="text-xs bg-slate-50 border rounded p-3 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(current, null, 2).slice(0, 2000)}...
              </pre>
            ) : "null"}
          </Section>
        </div>
      </div>
      
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-md font-bold mb-3">Test rendering KPI singoli</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="chat.chats_total" value={current?.chat?.chats_total} />
          <Field label="assistenza.new_tickets" value={current?.assistenza?.new_tickets} />
          <Field label="sviluppo.new_tickets" value={current?.sviluppo?.new_tickets} />
          <Field label="formazione.total_records" value={current?.formazione?.total_records} />
          <Field label="chat.operators (lunghezza)" value={current?.chat?.operators?.length} />
          <Field label="formazione.operators (lunghezza)" value={current?.formazione?.operators?.length} />
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-slate-900">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-lg mt-1">{value === undefined ? "(undefined)" : value === null ? "(null)" : String(value)}</div>
    </div>
  );
}
