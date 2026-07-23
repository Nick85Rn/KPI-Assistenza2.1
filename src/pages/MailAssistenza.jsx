// src/pages/MailAssistenza.jsx
//
// KPI del dipartimento Zoho Desk "Mail assistenza@" — i ticket che
// arrivano via email su assistenza@pienissimo.pro.
// La vista è condivisa con gli altri dipartimenti a ticket.

import { Mail } from "lucide-react";
import DepartmentTickets from "../components/DepartmentTickets";

export default function MailAssistenza({ data }) {
  const safeData = data || {};
  return (
    <DepartmentTickets
      data={{
        loading: safeData.loading,
        error: safeData.error,
        kpis: safeData.mailAssistenza,
      }}
      title="Ticket via email"
      subtitle="Richieste arrivate su assistenza@pienissimo.pro"
      emptyHint={
        'Il dipartimento "Mail assistenza@" raccoglie le richieste inviate a ' +
        "assistenza@pienissimo.pro. Prova ad ampliare il periodo."
      }
      icon={Mail}
      loadingLabel="Caricamento ticket mail assistenza..."
    />
  );
}
