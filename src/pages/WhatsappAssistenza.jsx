// src/pages/WhatsappAssistenza.jsx
//
// KPI del dipartimento Zoho Desk "WhatsApp Assistenza" — ticket
// generati dai messaggi WhatsApp inviati al numero assistenza.
// La vista è condivisa con gli altri dipartimenti a ticket.

import { MessageCircle } from "lucide-react";
import DepartmentTickets from "../components/DepartmentTickets";

export default function WhatsappAssistenza({ data }) {
  const safeData = data || {};
  return (
    <DepartmentTickets
      data={{
        loading: safeData.loading,
        error: safeData.error,
        kpis: safeData.whatsappAssistenza,
      }}
      title="WhatsApp Assistenza"
      subtitle="Ticket generati dai messaggi WhatsApp al numero assistenza"
      emptyHint="Nessun ticket WhatsApp registrato nel periodo selezionato. Prova ad ampliare il periodo."
      icon={MessageCircle}
      loadingLabel="Caricamento ticket WhatsApp..."
    />
  );
}
