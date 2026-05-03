// src/pages/Cruscotto.jsx — VERSIONE MINIMA ASSOLUTA

export default function Cruscotto() {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <h2 className="text-lg font-bold">Cruscotto vuoto</h2>
      <p className="text-sm text-slate-600 mt-2">
        Se vedi questo messaggio, il routing funziona. Il bug era nel rendering del contenuto.
      </p>
    </div>
  );
}
