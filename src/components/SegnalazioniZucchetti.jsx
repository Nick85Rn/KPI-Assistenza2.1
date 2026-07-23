// src/pages/SegnalazioniZucchetti.jsx
//
// KPI del dipartimento Zoho Desk "Segnalazioni Zucchetti".
// La vista è condivisa con gli altri dipartimenti a ticket.

import { Flag } from "lucide-react";
import DepartmentTickets from "../components/DepartmentTickets";

export default function SegnalazioniZucchetti({ data }) {
  const safeData = data || {};
  return (
    <DepartmentTickets
      data={{
        loading: safeData.loading,
        error: safeData.error,
        kpis: safeData.segnalazioniZucchetti,
      }}
      title="Segnalazioni Zucchetti"
      subtitle="Ticket aperti verso il supporto Zucchetti"
      emptyHint="Nessuna segnalazione registrata nel periodo selezionato. Prova ad ampliare il periodo."
      icon={Flag}
      loadingLabel="Caricamento segnalazioni Zucchetti..."
    />
  );
}
