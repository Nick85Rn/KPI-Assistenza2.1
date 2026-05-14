// src/lib/reportGenerator.js
// Genera report PDF e testo email partendo dai dati aggregati.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatSeconds, formatMinutes, formatNumber, normalizeOperatorName } from "./format";

// ============================================================
// HELPERS
// ============================================================

const COLORS = {
  primary: [15, 23, 42],         // slate-900
  secondary: [71, 85, 105],      // slate-600
  accent: [59, 130, 246],        // blue-500
  success: [16, 185, 129],       // emerald-500
  warning: [245, 158, 11],       // amber-500
  danger: [220, 38, 38],         // red-600
  light: [241, 245, 249],        // slate-100
  text: [30, 41, 59],            // slate-800
};

const MARGIN = 20;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

function fmtPeriodLabel(period, periodType) {
  const fromD = new Date(period.from);
  const toD = new Date(period.to);
  const months = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

  if (periodType === "day") {
    return `${fromD.getDate()} ${months[fromD.getMonth()]} ${fromD.getFullYear()}`;
  }
  if (periodType === "month") {
    return `${months[fromD.getMonth()]} ${fromD.getFullYear()}`;
  }
  if (periodType === "year") {
    return `Anno ${fromD.getFullYear()}`;
  }
  // Per settimana/trimestre/custom
  const fromStr = `${fromD.getDate()} ${months[fromD.getMonth()].slice(0,3).toLowerCase()}`;
  const toStr = `${toD.getDate()} ${months[toD.getMonth()].slice(0,3).toLowerCase()} ${toD.getFullYear()}`;
  return `${fromStr} - ${toStr}`;
}

function fmtGeneratedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ============================================================
// GENERAZIONE PDF
// ============================================================

export function generatePdf(reportData, periodType) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  // ---- HEADER ----
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_WIDTH, 35, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Report Operativo", MARGIN, 18);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Pienissimo Software Srl", MARGIN, 26);

  doc.setFontSize(10);
  doc.text(
    fmtPeriodLabel(reportData.period, periodType),
    PAGE_WIDTH - MARGIN, 18,
    { align: "right" }
  );
  doc.text(
    "Generato il " + fmtGeneratedAt(reportData.generated_at),
    PAGE_WIDTH - MARGIN, 26,
    { align: "right" }
  );

  y = 50;

  // ---- ESECUTIVE SUMMARY ----
  doc.setTextColor(...COLORS.text);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Sintesi del periodo", MARGIN, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.secondary);
  const summary = buildSummaryText(reportData, periodType);
  const summaryLines = doc.splitTextToSize(summary, CONTENT_WIDTH);
  doc.text(summaryLines, MARGIN, y);
  y += summaryLines.length * 5 + 5;

  // ---- PUNTI DI ATTENZIONE ----
  if (reportData.attention_points && reportData.attention_points.length > 0) {
    doc.setFillColor(254, 243, 199); // amber-100
    doc.rect(MARGIN, y, CONTENT_WIDTH, 8 + (reportData.attention_points.length * 5), "F");

    y += 6;
    doc.setTextColor(146, 64, 14); // amber-800
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Punti di attenzione", MARGIN + 3, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const point of reportData.attention_points) {
      const pointLines = doc.splitTextToSize("• " + point, CONTENT_WIDTH - 6);
      doc.text(pointLines, MARGIN + 3, y);
      y += pointLines.length * 4;
    }
    y += 6;
  }

  // ---- KPI GRID ----
  y = checkPageBreak(doc, y, 50);
  doc.setTextColor(...COLORS.text);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Indicatori chiave", MARGIN, y);
  y += 7;

  const kpis = [
    { label: "Chat gestite",       value: formatNumber(reportData.chat.chats_total) },
    { label: "Ticket Assistenza",  value: formatNumber(reportData.assistenza.new_tickets) },
    { label: "Sessioni formazione", value: formatNumber(reportData.formazione.total_records) },
    { label: "Ticket Sviluppo",     value: formatNumber(reportData.sviluppo.new_tickets) },
  ];

  const boxW = (CONTENT_WIDTH - 6) / 4;
  const boxH = 22;
  for (let i = 0; i < kpis.length; i++) {
    const x = MARGIN + (i * (boxW + 2));
    doc.setFillColor(...COLORS.light);
    doc.rect(x, y, boxW, boxH, "F");

    doc.setTextColor(...COLORS.secondary);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(kpis[i].label.toUpperCase(), x + 3, y + 5);

    doc.setTextColor(...COLORS.text);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(kpis[i].value, x + 3, y + 16);
  }
  y += boxH + 8;

  // ---- SEZIONE 1: ASSISTENZA ----
  y = renderSection(doc, y, "1. Assistenza ai clienti", () => {
    const kpi1 = `Nuovi: ${formatNumber(reportData.assistenza.new_tickets)}  ·  ` +
                 `Chiusi: ${formatNumber(reportData.assistenza.closed_tickets)}  ·  ` +
                 `Backlog massimo nel periodo: ${formatNumber(reportData.assistenza.max_backlog)}`;
    const kpi2 = `Tempo medio 1ª risposta: ${formatSeconds(reportData.assistenza.avg_first_response_sec) || "n/d"}`;
    const channelLine = reportData.assistenza.channels?.length
      ? `Canali principali: ${reportData.assistenza.channels.slice(0, 3).map(c => `${c.channel} (${c.count})`).join(", ")}`
      : null;
    const backlogLine = reportData.assistenza.backlog_current?.total != null
      ? `Backlog attuale (in tempo reale): ${formatNumber(reportData.assistenza.backlog_current.total)} ticket aperti`
      : null;
    return [kpi1, kpi2, channelLine, backlogLine].filter(Boolean);
  });

  if (reportData.assistenza.top_operators && reportData.assistenza.top_operators.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      head: [["Operatore", "Ticket", "Chiusi", "% Chiusura"]],
      body: reportData.assistenza.top_operators.map((o) => [
        normalizeOperatorName(o.assignee) || "(non assegnato)",
        formatNumber(o.tickets),
        formatNumber(o.closed),
        o.pct_closed != null ? `${Math.round(o.pct_closed * 100)}%` : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY + 8;
  } else {
    y += 5;
  }

  // ---- SEZIONE 2: CHAT ----
  y = checkPageBreak(doc, y, 60);
  y = renderSection(doc, y, "2. Servizio Chat", () => {
    const accepted = reportData.chat.chats_total > 0
      ? Math.round((reportData.chat.chats_attended / reportData.chat.chats_total) * 100)
      : 0;
    const kpi1 = `Chat totali: ${formatNumber(reportData.chat.chats_total)}  ·  ` +
                 `Accettate: ${accepted}%  ·  Perse: ${formatNumber(reportData.chat.chats_missed)}`;
    const kpi2 = `Tempo medio attesa: ${formatSeconds(reportData.chat.avg_waiting_sec) || "n/d"}  ·  ` +
                 `Durata media: ${formatSeconds(reportData.chat.avg_duration_sec) || "n/d"}`;
    return [kpi1, kpi2];
  });

  if (reportData.chat.top_operators && reportData.chat.top_operators.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      head: [["Operatore", "Chat", "Tempo medio attesa", "Durata media"]],
      body: reportData.chat.top_operators.map((o) => [
        normalizeOperatorName(o.operator) || "(senza nome)",
        formatNumber(o.chats),
        o.avg_wait_sec != null ? formatSeconds(o.avg_wait_sec) : "—",
        o.avg_duration_sec != null ? formatSeconds(o.avg_duration_sec) : "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY + 8;
  } else {
    y += 5;
  }

  // ---- SEZIONE 3: FORMAZIONE ----
  y = checkPageBreak(doc, y, 60);
  y = renderSection(doc, y, "3. Formazione erogata", () => {
    const hours = (reportData.formazione.total_minutes / 60).toFixed(1);
    const kpi1 = `Sessioni: ${formatNumber(reportData.formazione.total_records)}  ·  ` +
                 `Ore totali: ${hours}h  ·  Durata media: ${formatMinutes(reportData.formazione.avg_duration_min) || "n/d"}`;
    return [kpi1];
  });

  if (reportData.formazione.top_clients && reportData.formazione.top_clients.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      head: [["Cliente", "Sessioni", "Ore"]],
      body: reportData.formazione.top_clients.map((c) => [
        c.is_internal ? `${c.name} (interno)` : c.name,
        formatNumber(c.sessions),
        (c.minutes / 60).toFixed(1) + "h",
      ]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY + 8;
  } else {
    y += 5;
  }

  // ---- SEZIONE 4: SVILUPPO ----
  y = checkPageBreak(doc, y, 60);
  y = renderSection(doc, y, "4. Richieste a Sviluppo", () => {
    const kpi1 = `Nuovi: ${formatNumber(reportData.sviluppo.new_tickets)}  ·  ` +
                 `Chiusi: ${formatNumber(reportData.sviluppo.closed_tickets)}`;
    const kpi2 = `Tempo medio risoluzione: ${formatSeconds(reportData.sviluppo.avg_resolution_sec) || "n/d"}`;
    const backlogLine = reportData.sviluppo.backlog_current?.total != null
      ? `Backlog attuale: ${formatNumber(reportData.sviluppo.backlog_current.total)} ticket aperti`
      : null;
    const reopenedLine = reportData.sviluppo.reopened_count > 0
      ? `Ticket riaperti nel periodo: ${reportData.sviluppo.reopened_count} (indicatore qualità)`
      : null;
    return [kpi1, kpi2, backlogLine, reopenedLine].filter(Boolean);
  });

  if (reportData.sviluppo.top_operators && reportData.sviluppo.top_operators.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      head: [["Sviluppatore", "Totali", "Chiusi", "Aperti"]],
      body: reportData.sviluppo.top_operators.map((o) => [
        normalizeOperatorName(o.assignee) || "(non assegnato)",
        formatNumber(o.tickets),
        formatNumber(o.closed),
        formatNumber(o.open),
      ]),
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ---- FOOTER ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.secondary);
    doc.text(
      "Fonte: Zoho Desk, Zoho SalesIQ, Zoho CRM",
      MARGIN, 290
    );
    doc.text(
      `Pagina ${i} di ${pageCount}`,
      PAGE_WIDTH - MARGIN, 290,
      { align: "right" }
    );
  }

  return doc;
}

// ----- Helper rendering -----

function renderSection(doc, y, title, getLines) {
  doc.setTextColor(...COLORS.text);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, MARGIN, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.secondary);

  const lines = getLines();
  for (const line of lines) {
    const splitLines = doc.splitTextToSize(line, CONTENT_WIDTH);
    doc.text(splitLines, MARGIN, y);
    y += splitLines.length * 4.5;
  }

  return y;
}

function checkPageBreak(doc, y, needed) {
  if (y + needed > 280) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

// ----- Summary text -----

function buildSummaryText(data, periodType) {
  const periodWord = {
    day: "questa giornata",
    week: "questa settimana",
    month: "questo mese",
    year: "quest'anno",
  }[periodType] || "il periodo selezionato";

  const parts = [];
  parts.push(`Nel ${periodWord} sono state gestite ${formatNumber(data.chat.chats_total)} chat`);
  parts.push(`aperti ${formatNumber(data.assistenza.new_tickets)} nuovi ticket di assistenza`);
  parts.push(`erogate ${formatNumber(data.formazione.total_records)} sessioni di formazione`);
  parts.push(`registrati ${formatNumber(data.sviluppo.new_tickets)} ticket verso Sviluppo`);

  return parts.join(", ") + ".";
}

// ============================================================
// GENERAZIONE TESTO EMAIL
// ============================================================

export function generateEmailText(reportData, periodType) {
  const periodLabel = fmtPeriodLabel(reportData.period, periodType);
  const hours = (reportData.formazione.total_minutes / 60).toFixed(1);
  const accepted = reportData.chat.chats_total > 0
    ? Math.round((reportData.chat.chats_attended / reportData.chat.chats_total) * 100)
    : 0;

  const lines = [];

  lines.push(`Oggetto: Report operativo - ${periodLabel}`);
  lines.push("");
  lines.push("Buongiorno,");
  lines.push("");
  lines.push(`In allegato il report operativo per ${periodLabel}.`);
  lines.push("");
  lines.push("SINTESI:");
  lines.push(`• Chat gestite: ${formatNumber(reportData.chat.chats_total)} (${accepted}% accettate)`);
  lines.push(`• Ticket Assistenza nuovi: ${formatNumber(reportData.assistenza.new_tickets)} - chiusi: ${formatNumber(reportData.assistenza.closed_tickets)}`);
  lines.push(`• Sessioni formazione: ${formatNumber(reportData.formazione.total_records)} (${hours}h totali)`);
  lines.push(`• Ticket Sviluppo nuovi: ${formatNumber(reportData.sviluppo.new_tickets)} - chiusi: ${formatNumber(reportData.sviluppo.closed_tickets)}`);
  lines.push("");

  if (reportData.attention_points && reportData.attention_points.length > 0) {
    lines.push("PUNTI DI ATTENZIONE:");
    for (const point of reportData.attention_points) {
      lines.push(`• ${point}`);
    }
    lines.push("");
  }

  lines.push("Il report completo con il dettaglio per operatore e cliente è disponibile in allegato.");
  lines.push("");
  lines.push("Cordiali saluti");

  return lines.join("\n");
}

// ============
