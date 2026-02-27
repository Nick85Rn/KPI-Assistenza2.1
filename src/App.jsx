/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  Database, Users, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  RefreshCw, X, FileText, ClipboardCheck, Trophy, Target, Clock, Tag, Bug, Zap, CheckCircle2, Copy, UploadCloud, GraduationCap, Timer, AlertTriangle, XCircle, Activity, Building, CalendarDays, Plus, Trash2, PieChart as PieChartIcon
} from 'lucide-react';
import { 
  format, subWeeks, addWeeks, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, subMonths, addMonths,
  startOfYear, endOfYear, subYears, addYears, eachMonthOfInterval,
  isWithinInterval, getISOWeek, eachDayOfInterval, startOfDay, endOfDay, parseISO 
} from 'date-fns';
import { it } from 'date-fns/locale'; 
import { supabase } from './supabaseClient';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#64748b'];

// --- FORMATTERS E CORAZZA DATE ---
const formatNumber = (num) => { if (!num || isNaN(num)) return 0; return Math.ceil(num).toLocaleString('it-IT'); };
const formatTime = (mins) => { 
  if (!mins || isNaN(mins)) return "0m"; 
  if (mins < 60) return `${Math.ceil(mins)}m`; 
  return `${Math.floor(mins / 60)}h ${Math.ceil(mins % 60)}m`; 
};
const formatSeconds = (secs) => {
  if (!secs || isNaN(secs)) return "0s";
  if (secs < 60) return `${Math.ceil(secs)}s`;
  return `${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`;
};
const safeInRange = (dateString, start, end) => { 
  if (!dateString) return false; 
  let str = String(dateString);
  if (str.length === 10 && str.indexOf('-') === 4) { str += 'T12:00:00'; } 
  const d = new Date(str);
  if (isNaN(d.getTime())) return false; 
  return d >= startOfDay(start) && d <= endOfDay(end); 
};

// --- UX COMPONENTS ---
const KPICard = ({ label, current, previous, unit = '', invert = false, type = 'number', icon: Icon, colorClass }) => {
  const diff = current - previous;
  const isPositive = invert ? diff <= 0 : diff >= 0;
  const trendColor = diff === 0 ? 'text-slate-400 bg-slate-100' : isPositive ? 'text-emerald-600 bg-emerald-100' : 'text-rose-600 bg-rose-100';
  let displayCurrent = type === 'time' ? formatTime(current) : type === 'seconds' ? formatSeconds(current) : formatNumber(current);
  let displayDiff = type === 'time' ? formatTime(Math.abs(diff)) : type === 'seconds' ? formatSeconds(Math.abs(diff)) : formatNumber(Math.abs(diff));

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        {Icon && <Icon size={16} className={`${colorClass} opacity-50 group-hover:opacity-100 transition-opacity`} />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-black text-slate-800 tracking-tight">{displayCurrent}</span>
        <span className="text-xs font-bold text-slate-400">{unit}</span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${trendColor}`}>
          {diff > 0 ? <TrendingUp size={12}/> : diff < 0 ? <TrendingDown size={12}/> : null}
          {displayDiff}
        </div>
        <span className="text-[10px] font-medium text-slate-400">vs prec.</span>
      </div>
    </div>
  );
};

const SectionTitle = ({ icon: Icon, title, colorClass, bgClass, subtitle }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className={`p-2 rounded-xl ${bgClass} shadow-sm`}><Icon size={20} className={colorClass} /></div>
    <div>
      <h2 className="text-lg font-black text-slate-800 tracking-wide">{title}</h2>
      {subtitle && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</p>}
    </div>
  </div>
);

const ChartContainer = ({ title, children, isEmpty, height = 320 }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm w-full flex flex-col" style={{height: `${height}px`}}>
    <h3 className="font-bold text-slate-800 mb-6 flex-shrink-0 text-sm uppercase tracking-wide">{title}</h3>
    <div className="flex-1 w-full relative min-h-0">
      {isEmpty ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 bg-slate-50 rounded-xl border border-dashed border-slate-200 m-2">
          <span className="text-xs font-bold px-4 py-2 text-slate-400 text-center">Nessun dato in questo periodo</span>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%' }}>
          <ResponsiveContainer width="99%" height="100%" minWidth={0}>{children}</ResponsiveContainer>
        </div>
      )}
    </div>
  </div>
);

// Voci di default iniziali per evitare caricamenti a vuoto
const DEFAULT_ACTIVITY_TYPES = ['Formazione Cliente', 'Call con Zucchetti', 'Riunione Pienissimo', 'Riunione Zucchetti'];

// --- MAIN APP ---
export default function App() {
  const [view, setView] = useState('dashboard');
  const [timeframe, setTimeframe] = useState('week'); 
  const [data, setData] = useState({ chat: [], form: [], ast: [], dev: [], timesheet: [], activityTypes: DEFAULT_ACTIVITY_TYPES });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [modalContent, setModalContent] = useState(null);

  // STATI PER IL TIMESHEET E LA NUOVA ATTIVITA'
  const [tsModalOpen, setTsModalOpen] = useState(false);
  const [newActivityOpen, setNewActivityOpen] = useState(false);
  const [newActivityName, setNewActivityName] = useState('');
  
  // Il form ora viene inizializzato sempre con una voce fissa per sicurezza
  const [tsForm, setTsForm] = useState({ 
    date: format(new Date(), 'yyyy-MM-dd'), 
    startTime: '09:00', 
    endTime: '10:00', 
    activityType: DEFAULT_ACTIVITY_TYPES[0], 
    notes: '' 
  });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const fetchPaginated = async (table, orderBy = null) => {
        try {
          let allRecords = [];
          let from = 0; const step = 1000;
          while (true) {
            let query = supabase.from(table).select('*').range(from, from + step - 1);
            if (orderBy) query = query.order(orderBy.col, { ascending: orderBy.asc });
            const { data, error } = await query;
            if (error) throw error;
            allRecords = [...allRecords, ...data];
            if (data.length < step) break; 
            from += step;
          }
          return allRecords;
        } catch (e) { return []; }
      };

      const [c, f, a, d, ts, actTypes] = await Promise.all([
        fetchPaginated('zoho_raw_chats'),
        fetchPaginated('zoho_raw_formazione'),
        fetchPaginated('zoho_daily_assistenza'),
        fetchPaginated('zoho_daily_sviluppo'),
        fetchPaginated('nicola_timesheet', { col: 'date', asc: false }),
        fetchPaginated('nicola_activity_types', { col: 'name', asc: true })
      ]);

      let types = actTypes && actTypes.length > 0 ? actTypes.map(x => x.name) : DEFAULT_ACTIVITY_TYPES;
      types = [...new Set(types)].sort(); // Rimuove doppioni e ordina alfabeticamente

      setData({ chat: c, form: f, ast: a, dev: d, timesheet: ts, activityTypes: types });
      setLastUpdated(new Date());
    } catch (err) { 
      setModalContent({ type: 'error', title: 'Errore Database', message: err.message });
    } finally { 
      setLoading(false); 
    }
  };

  // Funzione per aprire la modale garantendo che il menu a tendina abbia un valore selezionato REALE
  const handleOpenTsModal = () => {
    setTsForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00',
      endTime: '10:00',
      activityType: data.activityTypes.length > 0 ? data.activityTypes[0] : DEFAULT_ACTIVITY_TYPES[0],
      notes: ''
    });
    setTsModalOpen(true);
  };

  const handleSaveTimesheet = async (e) => {
    e.preventDefault();
    if (!tsForm.date || !tsForm.startTime || !tsForm.endTime) {
      setModalContent({ type: 'warning', title: 'Campi Obbligatori', message: 'Inserisci la data e gli orari di inizio e fine.' });
      return;
    }

    const calcHours = (start, end) => {
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      let diff = (eH * 60 + eM) - (sH * 60 + sM);
      if (diff < 0) diff += 24 * 60; 
      return +(diff / 60).toFixed(2);
    };

    const hours = calcHours(tsForm.startTime, tsForm.endTime);
    if (hours <= 0) {
      setModalContent({ type: 'warning', title: 'Orari Errati', message: 'L\'orario di fine deve essere successivo a quello di inizio.' });
      return;
    }

    // Ultimo check di sicurezza: se per qualche motivo il form fosse vuoto, peschiamo la prima opzione
    const finalActivityType = tsForm.activityType || (data.activityTypes.length > 0 ? data.activityTypes[0] : 'Generico');

    try {
      setLoading(true);
      const { error } = await supabase.from('nicola_timesheet').insert([{
        date: tsForm.date, 
        start_time: tsForm.startTime,
        end_time: tsForm.endTime,
        hours: hours, 
        activity_type: finalActivityType,
        notes: tsForm.notes || ''
      }]);
      if (error) throw error;
      
      setTsModalOpen(false);
      setModalContent({ type: 'success', title: 'Salvato', message: 'Attività salvata nel tuo Timesheet.' });
      fetchAll();
    } catch (err) { setModalContent({ type: 'error', title: 'Errore Salvataggio', message: err.message });
    } finally { setLoading(false); }
  };

  const handleAddActivityType = async () => {
    const addedName = newActivityName.trim();
    if (!addedName) return;
    try {
        setLoading(true);
        const { error } = await supabase.from('nicola_activity_types').insert([{ name: addedName }]);
        // Ignoriamo l'errore se la voce esiste già per evitare blocchi
        
        setNewActivityOpen(false);
        setNewActivityName('');
        
        const newTypes = [...new Set([...data.activityTypes, addedName])].sort();
        setData(prev => ({...prev, activityTypes: newTypes}));
        setTsForm(prev => ({...prev, activityType: addedName})); // Seleziona automaticamente la nuova voce creata
    } catch (e) {
        setModalContent({type: 'error', title: 'Errore Database', message: e.message});
    } finally { setLoading(false); }
  };

  const handleDeleteTimesheet = async (id) => {
    if (!window.confirm("Vuoi davvero eliminare questa attività?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('nicola_timesheet').delete().eq('id', id);
      if (error) throw error;
      fetchAll();
    } catch (err) { setModalContent({ type: 'error', title: 'Errore', message: err.message });
    } finally { setLoading(false); }
  };

  const parseCSVAdvanced = (csvText) => {
    const rows = []; let currentRow = []; let currentCell = ''; let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i]; const nextChar = csvText[i + 1];
      if (inQuotes) {
        if (char === '"' && nextChar === '"') { currentCell += '"'; i++; } else if (char === '"') { inQuotes = false; } else { currentCell += char; }
      } else {
        if (char === '"') { inQuotes = true; } else if (char === ',') { currentRow.push(currentCell.trim()); currentCell = ''; } else if (char === '\n' || char === '\r') {
          if (char === '\r' && nextChar === '\n') i++; 
          currentRow.push(currentCell.trim());
          if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
          currentRow = []; currentCell = '';
        } else { currentCell += char; }
      }
    }
    if (currentRow.length > 0 || currentCell !== '') { currentRow.push(currentCell.trim()); rows.push(currentRow); }
    return rows;
  };

  const handleChatImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      if (text.includes("Brand Performance") || text.includes("Chats Owned")) {
        setModalContent({ type: 'warning', title: 'File Errato', message: "Questo è il report aggregato.\n\nPer questa sezione usa il file 'Cronologia' esportato dalla sezione Conversazioni." });
        e.target.value = ''; return;
      }
      try {
        setLoading(true);
        const parsedRows = parseCSVAdvanced(text);
        let headerIdx = -1;
        for (let i = 0; i < Math.min(15, parsedRows.length); i++) { if (parsedRows[i].some(col => col.includes('ID della conversazione'))) { headerIdx = i; break; } }
        if (headerIdx === -1) throw new Error("Intestazioni non trovate nel file.");
        const headers = parsedRows[headerIdx]; const records = [];
        for (let i = headerIdx + 1; i < parsedRows.length; i++) {
          const values = parsedRows[i]; if (values.length < 5) continue; 
          const getVal = (col) => { const idx = headers.indexOf(col); return idx !== -1 ? values[idx] : null; };
          const chatId = getVal('ID della conversazione'); if (!chatId) continue;
          records.push({
            chat_id: chatId, operator: getVal('Partecipante') || 'Bot',
            created_time: getVal('Ora di creazione (in millisecondi)') ? new Date(Number(getVal('Ora di creazione (in millisecondi)'))).toISOString() : null,
            closed_time: getVal('Ora di fine (in millisecondi)') ? new Date(Number(getVal('Ora di fine (in millisecondi)'))).toISOString() : null,
            waiting_time_seconds: Number(getVal('Risposta da parte del primo agente dopo (in secondi)')) || Number(getVal('Primo tempo di prima risposta dell’agente (in secondi)')) || 0
          });
        }
        for (let i = 0; i < records.length; i += 1000) { await supabase.from('zoho_raw_chats').upsert(records.slice(i, i + 1000), { onConflict: 'chat_id' }); }
        setModalContent({ type: 'success', title: 'Importazione Completata', message: 'La Cronologia delle Chat è stata importata con successo.' });
        fetchAll(); 
      } catch (err) { setModalContent({ type: 'error', title: 'Errore di Importazione', message: err.message }); } finally { setLoading(false); e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const handleFormazioneImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      try {
        setLoading(true);
        const parsedRows = parseCSVAdvanced(text);
        let headerIdx = -1;
        for (let i = 0; i < Math.min(10, parsedRows.length); i++) { if (parsedRows[i].some(col => col.includes('Durata Formazione'))) { headerIdx = i; break; } }
        if (headerIdx === -1) throw new Error("Intestazioni non trovate. Assicurati che sia il 'Report Assistenza Tecnica_per operatore.csv'.");
        const headers = parsedRows[headerIdx]; const records = [];
        const parseItalianDate = (dateStr) => {
          if (!dateStr) return null;
          const months = { 'gen': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mag': 4, 'giu': 5, 'lug': 6, 'ago': 7, 'set': 8, 'ott': 9, 'nov': 10, 'dic': 11 };
          const match = dateStr.match(/([a-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})/i);
          if (match) { const [, month, day, year, hour, minute] = match; const m = months[month.toLowerCase()]; if (m !== undefined) return new Date(year, m, day, hour, minute).toISOString(); }
          return null;
        };
        const classifyTopic = (title, desc) => {
          const t = (title + " " + desc).toLowerCase();
          if (t.includes('voice pro') || t.includes('centralino')) return 'Centralino / Voice Pro';
          if (t.includes('api') || t.includes('whatsapp') || t.includes('wa') || t.includes('meta')) return 'WhatsApp & API';
          if (t.includes('app clienti') || t.includes('app lite') || t.includes('build') || t.includes('store') || t.includes('apple') || t.includes('google')) return 'Sviluppo App Clienti';
          if (t.includes('magazzino') || t.includes('mansionario') || t.includes('mansionissimo') || t.includes('attività') || t.includes('utenti')) return 'Gestionale & Magazzino';
          if (t.includes('fidelity') || t.includes('marketing') || t.includes('template') || t.includes('portfolio') || t.includes('promo') || t.includes('referral') || t.includes('winback') || t.includes('qr code')) return 'Marketing & Fidelity';
          if (t.includes('bug') || t.includes('lavori') || t.includes('assistenza') || t.includes('ticket')) return 'Assistenza Pura';
          return 'Formazione Generale';
        };
        for (let i = headerIdx + 1; i < parsedRows.length; i++) {
          const values = parsedRows[i]; if (values.length < 5) continue; 
          const getVal = (col) => { const idx = headers.findIndex(h => h.includes(col)); return idx !== -1 ? values[idx] : ''; };
          const title = getVal('Nome Nota Reparto Tecnico'); const company = getVal('Azienda'); const creator = getVal('Creato da') || getVal('Proprietario di Nota Reparto Tecnico');
          const desc = getVal('Descrizione'); const duration = parseInt(getVal('Durata Formazione (in minuti)'), 10) || 0; const createdAt = getVal('Ora creazione');
          if (!title && !company) continue;
          records.push({ topic: classifyTopic(title, desc), original_title: title, company: company, operator: creator, description: desc, duration_minutes: duration, created_time: parseItalianDate(createdAt) || new Date().toISOString() });
        }
        if (records.length === 0) throw new Error("Nessuna riga valida trovata.");
        for (let i = 0; i < records.length; i += 500) { await supabase.from('zoho_raw_formazione').insert(records.slice(i, i + 500)); }
        setModalContent({ type: 'success', title: 'Classificazione Completata', message: `Sono state analizzate e salvate ${records.length} sessioni di formazione.` });
        fetchAll(); 
      } catch (err) { setModalContent({ type: 'error', title: 'Errore Formazione', message: err.message }); } finally { setLoading(false); e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const handleDailyTicketsImport = async (e, tableName) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      if (!text.includes("Tempo prima risposta") || !text.includes("Backlog")) {
        setModalContent({ type: 'warning', title: 'File Errato', message: "Assicurati di aver caricato il file corretto: 'ReportOverview'." });
        e.target.value = ''; return;
      }
      try {
        setLoading(true);
        const rows = parseCSVAdvanced(text);
        let headerIdx = -1;
        for(let i=0; i<Math.min(10, rows.length); i++) { if(rows[i].some(c => c.includes('Nuovo Ticket'))) { headerIdx = i; break; } }
        if (headerIdx === -1) throw new Error("Intestazioni non trovate.");
        const headers = rows[headerIdx]; const records = [];
        const parseSLA = (slaStr) => {
          if (!slaStr) return 0; const match = slaStr.match(/(\d+):(\d+)/);
          if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
          return 0;
        };
        for(let i=headerIdx+1; i<rows.length; i++) {
          const vals = rows[i]; if(vals.length < 5) continue;
          const getVal = (col) => { const idx = headers.findIndex(h => h.includes(col)); return idx !== -1 ? vals[idx] : null; };
          const dateStr = getVal('Data'); if(!dateStr) continue;
          records.push({
            date: dateStr,
            new_tickets: parseInt(getVal('Nuovo Ticket')||0, 10), waiting_tickets: parseInt(getVal('Ticket In attesa')||0, 10), closed_tickets: parseInt(getVal('Ticket chiusi')||0, 10), backlog: parseInt(getVal('Backlog')||0, 10),
            satisfaction_good: parseInt(getVal('Buono')||0, 10), satisfaction_ok: parseInt(getVal('OK')||0, 10), satisfaction_bad: parseInt(getVal('Insufficiente')||0, 10),
            sla_first_response_mins: parseSLA(getVal('Tempo prima risposta')), sla_response_mins: parseSLA(getVal('Tempo di risposta')), sla_resolution_mins: parseSLA(getVal('Tempo di risoluzione'))
          });
        }
        if (records.length === 0) throw new Error("Nessuna riga valida trovata.");
        for (let i = 0; i < records.length; i += 500) { await supabase.from(tableName).upsert(records.slice(i, i + 500), { onConflict: 'date' }); }
        setModalContent({ type: 'success', title: 'Ticket Aggiornati', message: "Statistiche e SLA aggiornati con successo nel database." });
        fetchAll(); 
      } catch (err) { setModalContent({ type: 'error', title: 'Errore Importazione Ticket', message: err.message }); } finally { setLoading(false); e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const handlePrevPeriod = () => setCurrentDate(prev => timeframe === 'week' ? subWeeks(prev, 1) : timeframe === 'month' ? subMonths(prev, 1) : subYears(prev, 1));
  const handleNextPeriod = () => setCurrentDate(prev => timeframe === 'week' ? addWeeks(prev, 1) : timeframe === 'month' ? addMonths(prev, 1) : addYears(prev, 1));

  const periods = useMemo(() => {
    if (timeframe === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 }); const e = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { curr: { start: s, end: e, label: `Sett. ${getISOWeek(currentDate)} (${format(s, 'dd MMM', {locale: it})} - ${format(e, 'dd MMM', {locale: it})})` }, prev: { start: subWeeks(s, 1), end: subWeeks(e, 1) } };
    } else if (timeframe === 'month') {
      const s = startOfMonth(currentDate); const e = endOfMonth(currentDate);
      return { curr: { start: s, end: e, label: format(currentDate, 'MMMM yyyy', {locale: it}).toUpperCase() }, prev: { start: subMonths(s, 1), end: subMonths(e, 1) } };
    } else {
      const s = startOfYear(currentDate); const e = endOfYear(currentDate);
      return { curr: { start: s, end: e, label: `ANNO ${format(currentDate, 'yyyy')}` }, prev: { start: subYears(s, 1), end: subYears(e, 1) } };
    }
  }, [currentDate, timeframe]);

  // --- KPI ENGINE ---
  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const chats = data.chat.filter(x => safeInRange(x.created_time, start, end));
      const forms = data.form.filter(x => safeInRange(x.created_time, start, end));
      const astSorted = [...data.ast].sort((a,b) => new Date(a.date) - new Date(b.date));
      const devSorted = [...data.dev].sort((a,b) => new Date(a.date) - new Date(b.date));
      const astPeriod = astSorted.filter(x => safeInRange(x.date, start, end));
      const devPeriod = devSorted.filter(x => safeInRange(x.date, start, end));
      const tsPeriod = data.timesheet.filter(x => safeInRange(x.date, start, end));

      return { 
        chatVol: chats.length, chatWait: chats.length > 0 ? chats.reduce((a,b) => a + (Number(b.waiting_time_seconds)||0), 0) / chats.length : 0, 
        formCount: forms.length, formMins: forms.reduce((a,b) => a + (Number(b.duration_minutes)||0), 0),
        astIn: astPeriod.reduce((a,b) => a + b.new_tickets, 0), astOut: astPeriod.reduce((a,b) => a + b.closed_tickets, 0), 
        astSlaFirst: astPeriod.length ? astPeriod.reduce((a,b) => a + b.sla_first_response_mins, 0) / astPeriod.length : 0, 
        astSlaResp: astPeriod.length ? astPeriod.reduce((a,b) => a + b.sla_response_mins, 0) / astPeriod.length : 0, 
        astSlaRes: astPeriod.length ? astPeriod.reduce((a,b) => a + b.sla_resolution_mins, 0) / astPeriod.length : 0, 
        astBacklog: astPeriod.length ? astPeriod[astPeriod.length - 1].backlog : 0,
        devIn: devPeriod.reduce((a,b) => a + b.new_tickets, 0), devOut: devPeriod.reduce((a,b) => a + b.closed_tickets, 0), 
        devSlaFirst: devPeriod.length ? devPeriod.reduce((a,b) => a + b.sla_first_response_mins, 0) / devPeriod.length : 0, 
        devSlaResp: devPeriod.length ? devPeriod.reduce((a,b) => a + b.sla_response_mins, 0) / devPeriod.length : 0, 
        devSlaRes: devPeriod.length ? devPeriod.reduce((a,b) => a + b.sla_resolution_mins, 0) / devPeriod.length : 0, 
        devBacklog: devPeriod.length ? devPeriod[devPeriod.length - 1].backlog : 0,
        tsHours: tsPeriod.reduce((a,b) => a + Number(b.hours), 0)
      };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods]);

  const insightsTickets = useMemo(() => {
    const agg = (periodData) => {
      let good = 0, ok = 0, bad = 0, wait = 0;
      periodData.forEach(r => { good += r.satisfaction_good; ok += r.satisfaction_ok; bad += r.satisfaction_bad; wait += r.waiting_tickets; });
      return { good, ok, bad, waitAvg: periodData.length ? Math.round(wait/periodData.length) : 0 };
    };
    return { ast: agg(data.ast.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end))), dev: agg(data.dev.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end))) };
  }, [data, periods.curr]);

  const insightsChat = useMemo(() => {
    const chats = data.chat.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    
    const opsMap = {};
    const heatMap = { "09:00": 0, "10:00": 0, "11:00": 0, "12:00": 0, "13:00": 0, "14:00": 0, "15:00": 0, "16:00": 0, "17:00": 0, "18:00": 0, "19:00": 0 };
    const respMap = { '< 30 sec': 0, '30 - 45 sec': 0, '45 - 60 sec': 0, '60 - 90 sec': 0, '90 - 120 sec': 0, '> 120 sec': 0 };
    const weekMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 }; 

    chats.forEach(c => {
       const op = c.operator || 'Non Assegnato';
       let dur = 0;
       if (c.closed_time && c.created_time) { dur = (new Date(c.closed_time) - new Date(c.created_time)) / 1000; }

       if(!opsMap[op]) opsMap[op] = { name: op, count: 0, waitSum: 0, durSum: 0 };
       opsMap[op].count++; 
       opsMap[op].waitSum += (Number(c.waiting_time_seconds)||0);
       opsMap[op].durSum += dur;

       if (c.created_time) {
          const d = new Date(c.created_time);
          const h = d.getHours();
          const labels = { 9: "09:00", 10: "10:00", 11: "11:00", 12: "12:00", 13: "13:00", 14: "14:00", 15: "15:00", 16: "16:00", 17: "17:00", 18: "18:00", 19: "19:00" };
          if (labels[h]) heatMap[labels[h]]++;
          
          weekMap[d.getDay()]++; 
       }

       const w = Number(c.waiting_time_seconds) || 0;
       if (w < 30) respMap['< 30 sec']++;
       else if (w <= 45) respMap['30 - 45 sec']++;
       else if (w <= 60) respMap['45 - 60 sec']++;
       else if (w <= 90) respMap['60 - 90 sec']++;
       else if (w <= 120) respMap['90 - 120 sec']++;
       else respMap['> 120 sec']++;
    });

    const leaderboard = Object.values(opsMap).map(o => ({ name: o.name, count: o.count, avgWait: o.count > 0 ? o.waitSum / o.count : 0, avgDur: o.count > 0 ? o.durSum / o.count : 0 })).sort((a,b) => b.count - a.count);
    const heatmapData = Object.keys(heatMap).map(k => ({ range: k, picked_up: heatMap[k] }));
    const respData = Object.keys(respMap).map(k => ({ bucket: k, count: respMap[k] })).filter(x => x.count > 0); 
    const weekDaysData = [
      { day: 'Lun', volume: weekMap[1] }, { day: 'Mar', volume: weekMap[2] }, { day: 'Mer', volume: weekMap[3] },
      { day: 'Gio', volume: weekMap[4] }, { day: 'Ven', volume: weekMap[5] }, { day: 'Sab', volume: weekMap[6] }, { day: 'Dom', volume: weekMap[0] }
    ];

    return { leaderboard, heatmapData, respData, weekDaysData };
  }, [data.chat, periods.curr]);

  const insightsFormazione = useMemo(() => {
    const forms = data.form.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const opsMap = {}; const topicMap = {}; const compMap = {};
    
    forms.forEach(f => {
      const op = f.operator || 'Sconosciuto'; const t = f.topic || 'Generale'; const dur = Number(f.duration_minutes) || 0;
      const comp = f.company || 'Sconosciuta';

      if (!opsMap[op]) opsMap[op] = { name: op, count: 0, mins: 0 }; opsMap[op].count++; opsMap[op].mins += dur;
      if (!topicMap[t]) topicMap[t] = { name: t, count: 0, mins: 0 }; topicMap[t].count++; topicMap[t].mins += dur;
      if (!compMap[comp]) compMap[comp] = { name: comp, count: 0, mins: 0 }; compMap[comp].count++; compMap[comp].mins += dur;
    });

    const topComps = Object.values(compMap)
      .sort((a,b) => b.mins - a.mins)
      .filter(c => c.name !== 'Sconosciuta' && c.name.trim() !== '')
      .map(c => {
         let cleanName = c.name;
         if (cleanName.includes(' - ')) { cleanName = cleanName.split(' - ').slice(1).join(' - '); }
         return { ...c, cleanName };
      })
      .slice(0, 10);

    return { topOps: Object.values(opsMap).sort((a,b) => b.mins - a.mins), topTopics: Object.values(topicMap).sort((a,b) => b.count - a.count), topComps };
  }, [data.form, periods.curr]);

  const trends = useMemo(() => {
    if (timeframe === 'year') {
      return eachMonthOfInterval({ start: periods.curr.start, end: periods.curr.end }).map(month => {
        const mStart = startOfMonth(month); const mEnd = endOfMonth(month);
        const dateLabel = format(month, 'MMM', {locale: it}).toUpperCase();
        const astMonth = data.ast.filter(x => safeInRange(x.date, mStart, mEnd));
        const devMonth = data.dev.filter(x => safeInRange(x.date, mStart, mEnd));
        return {
          date: dateLabel,
          chatVol: data.chat.filter(x => safeInRange(x.created_time, mStart, mEnd)).length,
          astIn: astMonth.reduce((a,b) => a + b.new_tickets, 0), astOut: astMonth.reduce((a,b) => a + b.closed_tickets, 0),
          devIn: devMonth.reduce((a,b) => a + b.new_tickets, 0), devOut: devMonth.reduce((a,b) => a + b.closed_tickets, 0),
        };
      });
    } else {
      return eachDayOfInterval({ start: periods.curr.start, end: periods.curr.end }).map(day => {
        const dStart = startOfDay(day); const dEnd = endOfDay(day);
        const dateLabel = timeframe === 'week' ? format(day, 'EEE', {locale: it}) : format(day, 'd MMM', {locale: it});
        const dayStr = format(day, 'yyyy-MM-dd');
        const astDay = data.ast.find(x => x.date.startsWith(dayStr)) || { new_tickets: 0, closed_tickets: 0 };
        const devDay = data.dev.find(x => x.date.startsWith(dayStr)) || { new_tickets: 0, closed_tickets: 0 };
        return {
          date: dateLabel,
          chatVol: data.chat.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
          astIn: astDay.new_tickets, astOut: astDay.closed_tickets,
          devIn: devDay.new_tickets, devOut: devDay.closed_tickets,
        };
      });
    }
  }, [data, periods.curr, timeframe]);

  // TIMESHEET CHART
  const tsInsights = useMemo(() => {
    const list = data.timesheet.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end));
    const map = {};
    list.forEach(x => {
        const t = x.activity_type || 'Generico';
        if (!map[t]) map[t] = { name: t, hours: 0 };
        map[t].hours += Number(x.hours);
    });
    return Object.values(map).sort((a,b) => b.hours - a.hours);
  }, [data.timesheet, periods.curr]);

  // LISTA GLOBALE TIMESHEET CORRENTE
  const currentTimesheetList = data.timesheet.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end));

  // Dati grafici comparativi per il Report Executive
  const execChartData = [
    { name: 'Chat', Corrente: kpi.curr.chatVol, Precedente: kpi.prev.chatVol },
    { name: 'Formazioni', Corrente: kpi.curr.formCount, Precedente: kpi.prev.formCount },
    { name: 'Ticket Ast.', Corrente: kpi.curr.astIn, Precedente: kpi.prev.astIn },
    { name: 'Ticket Svil.', Corrente: kpi.curr.devIn, Precedente: kpi.prev.devIn },
  ];

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden relative">
      
      {/* MODALE GLOBALE MESSAGGI */}
      {modalContent && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              {modalContent.type === 'success' && <CheckCircle2 size={56} className="text-emerald-500 mb-4" />}
              {modalContent.type === 'warning' && <AlertTriangle size={56} className="text-amber-500 mb-4" />}
              {modalContent.type === 'error' && <XCircle size={56} className="text-rose-500 mb-4" />}
              <h3 className="text-xl font-black text-slate-800 mb-2">{modalContent.title}</h3>
              <p className="text-slate-500 text-sm whitespace-pre-wrap leading-relaxed mb-8">{modalContent.message}</p>
              <button onClick={() => setModalContent(null)} className={`px-8 py-3 rounded-xl font-bold text-white transition-all w-full shadow-lg ${modalContent.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : modalContent.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'}`}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE NUOVA ATTIVITA (SOPRA IL TIMESHEET) */}
      {newActivityOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <h3 className="text-md font-black text-slate-800 mb-4">Nuova Categoria Attività</h3>
            <input type="text" value={newActivityName} onChange={e => setNewActivityName(e.target.value)} placeholder="Es. Supporto Marketing" className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setNewActivityOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl transition-all">Annulla</button>
              <button onClick={handleAddActivityType} disabled={loading} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all">Aggiungi</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE INSERIMENTO TIMESHEET */}
      {tsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><CalendarDays className="text-teal-600"/> Nuova Attività</h3>
              <button onClick={() => setTsModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><X size={16}/></button>
            </div>
            <form onSubmit={handleSaveTimesheet} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data</label>
                <input type="date" value={tsForm.date} onChange={e => setTsForm({...tsForm, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dalle ore</label>
                    <input type="time" value={tsForm.startTime} onChange={e => setTsForm({...tsForm, startTime: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all" required />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alle ore</label>
                    <input type="time" value={tsForm.endTime} onChange={e => setTsForm({...tsForm, endTime: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipologia Attività</label>
                <div className="flex gap-2">
                    <select value={tsForm.activityType} onChange={e => setTsForm({...tsForm, activityType: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer">
                        {data.activityTypes.map((t, i) => ( <option key={i} value={t}>{t}</option> ))}
                    </select>
                    <button type="button" onClick={() => setNewActivityOpen(true)} className="bg-teal-50 text-teal-600 border border-teal-100 px-4 rounded-xl hover:bg-teal-100 transition-colors flex items-center justify-center" title="Aggiungi nuova tipologia">
                        <Plus size={18} />
                    </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Note / Descrizione</label>
                <textarea value={tsForm.notes} onChange={e => setTsForm({...tsForm, notes: e.target.value})} placeholder="Dettagli di cosa è stato fatto..." rows={3} className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none"></textarea>
              </div>
              <div className="pt-4">
                <button type="submit" disabled={loading} className={`w-full ${loading ? 'bg-slate-400' : 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20'} text-white font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2`}>
                  {loading ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Salva nel Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-20 shrink-0">
        <div className="p-6 overflow-y-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-slate-900 p-2 rounded-xl shadow-md"><Database className="text-white" size={18} /></div>
            <h1 className="font-black text-lg tracking-tight">Pienissimo<span className="text-blue-600">.bi</span></h1>
          </div>
          <nav className="space-y-1.5 border-b border-slate-100 pb-4 mb-4">
            {[ 
              { id: 'dashboard', icon: LayoutDashboard, label: 'Panoramica' }, 
              { id: 'chat', icon: Users, label: 'Reparto Chat' }, 
              { id: 'formazione', icon: GraduationCap, label: 'Formazione' },
              { id: 'assistenza', icon: AlertCircle, label: 'Assistenza' }, 
              { id: 'sviluppo', icon: Code, label: 'Sviluppo' }
            ].map(item => (
              <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all font-bold text-sm ${view === item.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <item.icon size={18} className={view === item.id ? 'text-white' : 'text-slate-400'} /> {item.label}
              </button>
            ))}
          </nav>
          <div className="space-y-1.5 border-b border-slate-100 pb-4 mb-4">
            <button onClick={() => setView('report')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all font-bold text-sm ${view === 'report' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
              <PieChartIcon size={18} className={view === 'report' ? 'text-white' : 'text-rose-500'} /> Report Executive
            </button>
          </div>
          <div>
            <button onClick={() => setView('timesheet')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all font-bold text-sm ${view === 'timesheet' ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
              <CalendarDays size={18} className={view === 'timesheet' ? 'text-white' : 'text-teal-500'} /> Time sheet Nicola
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* TOPBAR */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 sticky top-0 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
              <button onClick={() => setTimeframe('week')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === 'week' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Settimana</button>
              <button onClick={() => setTimeframe('month')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === 'month' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Mese</button>
              <button onClick={() => setTimeframe('year')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === 'year' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Anno</button>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
              <button onClick={handlePrevPeriod} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronLeft size={16}/></button>
              <span className="text-xs font-black px-4 uppercase tracking-widest text-slate-700">{periods.curr.label}</span>
              <button onClick={handleNextPeriod} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-end justify-center h-[36px]">
              <span className="text-[10px] text-slate-400 font-medium">Ultimo CSV: {format(lastUpdated, 'HH:mm')}</span>
              <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> DB Attivo</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8 pb-32">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* SEZIONE REPORT EXECUTIVE TABS */}
            {view === 'report' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-end mb-6">
                  <SectionTitle icon={PieChartIcon} title="Report Executive" subtitle="Sintesi manageriale esportabile" colorClass="text-rose-600" bgClass="bg-rose-100" />
                  <button onClick={() => {
                    const c = kpi.curr; const p = kpi.prev;
                    const formatTrend = (curr, prev, invert = false) => {
                        const diff = curr - prev; if (diff === 0) return `➖ Stabile`;
                        const isGood = invert ? diff < 0 : diff > 0; const sign = diff > 0 ? '+' : '-';
                        return `${isGood ? '🟢' : '🔴'} ${sign}${Math.abs(diff)}`;
                    };
                    const text = `📊 REPORT DIREZIONALE PIENISSIMO
🗓️ Periodo: ${periods.curr.label}

📝 SINTESI GENERALE:
In questo periodo il team ha gestito ${c.chatVol} chat (attesa media ${formatSeconds(c.chatWait)}) ed erogato ${c.formCount} sessioni di formazione ai clienti. Il reparto Assistenza ha ricevuto ${c.astIn} nuovi ticket, chiudendone ${c.astOut} (SLA Risoluzione: ${formatTime(c.astSlaRes)}), mentre il team Sviluppo ha preso in carico ${c.devIn} task tecnici, risolvendone ${c.devOut}.

⚡ TENDENZE (VS PRECEDENTE):
• Volumi Chat: ${c.chatVol} (${formatTrend(c.chatVol, p.chatVol)})
• Formazioni Erogate: ${c.formCount} (${formatTrend(c.formCount, p.formCount)})
• Nuovi Ticket Assistenza: ${c.astIn} (${formatTrend(c.astIn, p.astIn, true)})
• Segnalazioni Sviluppo: ${c.devIn} (${formatTrend(c.devIn, p.devIn, true)})

🛠️ STATUS E BACKLOG
• Backlog Ticket Clienti: ${c.astBacklog}
• Backlog Bug/Sviluppo: ${c.devBacklog}
-----------------------------------------
Generato automaticamente da Pienissimo.bi`;
                    navigator.clipboard.writeText(text);
                    setCopied(true); setTimeout(() => setCopied(false), 2000);
                  }} className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 transition-all mb-5">
                    {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />} {copied ? 'Testo Copiato!' : 'Copia Testo per Riunione'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <KPICard label="Chat Gestite" current={kpi.curr.chatVol} previous={kpi.prev.chatVol} icon={Users} colorClass="text-blue-500" />
                  <KPICard label="Formazioni Erogate" current={kpi.curr.formCount} previous={kpi.prev.formCount} icon={GraduationCap} colorClass="text-purple-500" />
                  <KPICard label="Nuovi Ticket Clienti" current={kpi.curr.astIn} previous={kpi.prev.astIn} invert icon={AlertCircle} colorClass="text-emerald-500" />
                  <KPICard label="Nuovi Bug / Dev" current={kpi.curr.devIn} previous={kpi.prev.devIn} invert icon={Code} colorClass="text-amber-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-3xl p-8 relative shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                      <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-xl"><ClipboardCheck size={22} className="text-rose-600"/></div>
                      <h3 className="font-bold uppercase text-sm tracking-widest text-slate-800">Testo Riassuntivo (Anteprima)</h3>
                    </div>
                    <div className="text-slate-700 font-medium text-[14px] leading-relaxed whitespace-pre-wrap font-sans">
                      {`In questo periodo il team ha gestito ${kpi.curr.chatVol} chat (attesa media ${formatSeconds(kpi.curr.chatWait)}) ed erogato ${kpi.curr.formCount} sessioni di formazione ai clienti. 

Il reparto Assistenza ha ricevuto ${kpi.curr.astIn} nuovi ticket, chiudendone ${kpi.curr.astOut} (SLA Risoluzione: ${formatTime(kpi.curr.astSlaRes)}), mentre il team Sviluppo ha preso in carico ${kpi.curr.devIn} task tecnici, risolvendone ${kpi.curr.devOut}.

⚡ TENDENZE (VS PRECEDENTE):
• Chat: ${kpi.curr.chatVol} (${kpi.curr.chatVol >= kpi.prev.chatVol ? '🟢 +' : '🔴 -'}${Math.abs(kpi.curr.chatVol - kpi.prev.chatVol)})
• Formazioni: ${kpi.curr.formCount} (${kpi.curr.formCount >= kpi.prev.formCount ? '🟢 +' : '🔴 -'}${Math.abs(kpi.curr.formCount - kpi.prev.formCount)})
• Ticket Assistenza: ${kpi.curr.astIn} (${kpi.curr.astIn <= kpi.prev.astIn ? '🟢 -' : '🔴 +'}${Math.abs(kpi.curr.astIn - kpi.prev.astIn)})
• Ticket Sviluppo: ${kpi.curr.devIn} (${kpi.curr.devIn <= kpi.prev.devIn ? '🟢 -' : '🔴 +'}${Math.abs(kpi.curr.devIn - kpi.prev.devIn)})`}
                    </div>
                  </div>

                  <ChartContainer title="Comparazione Volumi (Corrente vs Precedente)" isEmpty={execChartData.every(x => x.Corrente === 0 && x.Precedente === 0)} height={400}>
                    <BarChart data={execChartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:11, fill:'#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      <Legend verticalAlign="top" height={36} iconType="circle"/>
                      <Bar dataKey="Precedente" fill="#cbd5e1" radius={[4,4,0,0]} barSize={25}/>
                      <Bar dataKey="Corrente" fill="#f43f5e" radius={[4,4,0,0]} barSize={25}/>
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            )}

            {/* SEZIONE TIMESHEET NICOLA */}
            {view === 'timesheet' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-end mb-6">
                  <SectionTitle icon={CalendarDays} title="Time sheet Operativo" subtitle="Area Personale - Responsabile Assistenza Tecnica" colorClass="text-teal-600" bgClass="bg-teal-100" />
                  <button onClick={handleOpenTsModal} className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-teal-600/20 transition-all mb-5">
                    <Plus size={18} /> Aggiungi Attività
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <KPICard label={`Ore Totali (${timeframe === 'year' ? 'Anno' : timeframe === 'month' ? 'Mese' : 'Sett.'})`} current={kpi.curr.tsHours} previous={kpi.prev.tsHours} unit="h" icon={Timer} colorClass="text-teal-500" />
                  </div>
                  <div className="lg:col-span-2">
                    <ChartContainer title="Distribuzione Ore per Tipologia Attività" isEmpty={tsInsights.length === 0} height={180}>
                      <BarChart data={tsInsights} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize:11, fill:'#64748b'}} width={120} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}}/>
                        <Bar dataKey="hours" fill="#14b8a6" radius={[0,4,4,0]} name="Ore Impiegate" barSize={25}/>
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-6">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2"><Activity size={16} className="text-teal-500"/> Registro Attività (Dettaglio)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-white">
                          <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase w-32">Data</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase w-32">Orario</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase w-48">Attività</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase">Note</th>
                          <th className="px-6 py-4 w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentTimesheetList.length === 0 ? (
                          <tr><td colSpan="5" className="px-6 py-12 text-center text-sm font-medium text-slate-400 bg-slate-50/50">Nessuna attività registrata in questo periodo.</td></tr>
                        ) : (
                          currentTimesheetList.map((entry) => (
                            <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                              <td className="px-6 py-4 text-sm font-bold text-slate-700 whitespace-nowrap">{format(parseISO(entry.date), 'dd MMM yyyy', {locale: it})}</td>
                              <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                                <span className="font-bold text-slate-800">{entry.start_time?.substring(0,5)}</span> - <span className="font-bold text-slate-800">{entry.end_time?.substring(0,5)}</span>
                                <span className="ml-2 text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-md font-bold">{entry.hours}h</span>
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-teal-700">{entry.activity_type || 'Generico'}</td>
                              <td className="px-6 py-4 text-sm text-slate-600 break-words">{entry.notes || '-'}</td>
                              <td className="px-6 py-4 text-right">
                                <button onClick={() => handleDeleteTimesheet(entry.id)} className="text-slate-300 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100" title="Elimina record">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SEZIONE DASHBOARD PANORAMICA */}
            {view === 'dashboard' && (
              <div className="space-y-10">
                <section>
                  <SectionTitle icon={Users} title="Performance Chat" colorClass="text-blue-600" bgClass="bg-blue-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <KPICard label="Chat Gestite" current={kpi.curr.chatVol} previous={kpi.prev.chatVol} icon={Target} colorClass="text-blue-500" />
                      <KPICard label="Attesa Media Storica" current={kpi.curr.chatWait} previous={kpi.prev.chatWait} type="seconds" invert icon={Clock} colorClass="text-blue-500" />
                    </div>
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-blue-200" onClick={() => setView('chat')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Top Operatori (Attivi nel periodo)</h3>
                      <div className="flex-1 space-y-3">
                        {insightsChat.leaderboard.length === 0 ? <p className="text-xs text-slate-400">Nessun dato nel periodo selezionato</p> : 
                          insightsChat.leaderboard.slice(0,3).map((op, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <div><span className="text-sm font-bold text-slate-800">{op.name}</span><div className="text-[10px] text-slate-500 mt-0.5">Risp. {formatSeconds(op.avgWait)} • Durata: {formatTime(op.avgDur/60)}</div></div>
                              <span className="bg-blue-50 text-blue-700 font-black text-xs px-2 py-1 rounded-md">{op.count} chat</span>
                            </div>
                          ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-blue-500 uppercase tracking-wider">Vedi Leaderboard Completa &rarr;</div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={GraduationCap} title="Formazione Clienti" colorClass="text-purple-600" bgClass="bg-purple-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <KPICard label="Sessioni Erogate" current={kpi.curr.formCount} previous={kpi.prev.formCount} icon={GraduationCap} colorClass="text-purple-500" />
                      <KPICard label="Ore Totali" current={kpi.curr.formMins} previous={kpi.prev.formMins} type="time" icon={Timer} colorClass="text-purple-500" />
                    </div>
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-purple-200" onClick={() => setView('formazione')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Tag size={14} className="text-purple-500"/> Classifica Formatori</h3>
                      <div className="flex-1 space-y-3">
                        {insightsFormazione.topOps.length === 0 ? <p className="text-xs text-slate-400">Nessun dato nel periodo selezionato</p> : 
                          insightsFormazione.topOps.slice(0,3).map((op, i) => (
                          <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                            <span className="text-sm font-bold text-slate-800">{op.name}</span>
                            <span className="bg-purple-50 text-purple-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(op.mins)} ({op.count} appt)</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-purple-500 uppercase tracking-wider">Vedi Analisi &rarr;</div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={AlertCircle} title="Supporto Tecnico (Assistenza)" colorClass="text-emerald-600" bgClass="bg-emerald-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Ticket Aperti" current={kpi.curr.astIn} previous={kpi.prev.astIn} invert icon={AlertCircle} colorClass="text-emerald-500" />
                      <KPICard label="Ticket Chiusi" current={kpi.curr.astOut} previous={kpi.prev.astOut} icon={CheckCircle2} colorClass="text-emerald-500" />
                      <KPICard label="Backlog Attivo" current={kpi.curr.astBacklog} previous={kpi.prev.astBacklog} invert icon={Tag} colorClass="text-emerald-500" />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-emerald-200 transition-all" onClick={() => setView('assistenza')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Clock size={14} className="text-emerald-500"/> Tempi SLA Assistenza</h3>
                      <div className="flex-1 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-700 truncate pr-2">Prima Risposta</span>
                          <span className="bg-emerald-50 text-emerald-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(kpi.curr.astSlaFirst)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-700 truncate pr-2">Risp. Successive</span>
                          <span className="bg-emerald-50 text-emerald-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(kpi.curr.astSlaResp)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-700 truncate pr-2">Risoluzione</span>
                          <span className="bg-emerald-50 text-emerald-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(kpi.curr.astSlaRes)}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Vai alla Sezione &rarr;</div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={Code} title="Sviluppo & Bug Fixing" colorClass="text-amber-600" bgClass="bg-amber-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Segnalazioni Sviluppo" current={kpi.curr.devIn} previous={kpi.prev.devIn} invert icon={Bug} colorClass="text-amber-500" />
                      <KPICard label="Bug Risolti" current={kpi.curr.devOut} previous={kpi.prev.devOut} icon={Zap} colorClass="text-amber-500" />
                      <KPICard label="Backlog Tecnico" current={kpi.curr.devBacklog} previous={kpi.prev.devBacklog} invert icon={Tag} colorClass="text-amber-500" />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-amber-200 transition-all" onClick={() => setView('sviluppo')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Clock size={14} className="text-amber-500"/> Tempi SLA Sviluppo</h3>
                      <div className="flex-1 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-700 truncate pr-2">Prima Risposta</span>
                          <span className="bg-amber-50 text-amber-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(kpi.curr.devSlaFirst)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-700 truncate pr-2">Risp. Successive</span>
                          <span className="bg-amber-50 text-amber-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(kpi.curr.devSlaResp)}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-700 truncate pr-2">Risoluzione</span>
                          <span className="bg-amber-50 text-amber-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(kpi.curr.devSlaRes)}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-amber-500 uppercase tracking-wider">Vai alla Sezione &rarr;</div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* SEZIONE CHAT */}
            {view === 'chat' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle icon={Users} title="Analisi Operativa Reparto Chat" colorClass="text-blue-600" bgClass="bg-blue-100" />
                
                <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-lg mb-6 border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-500/20 p-3 rounded-xl"><UploadCloud size={24} className="text-blue-400"/></div>
                    <div>
                      <h3 className="text-white font-bold text-sm md:text-base">Sincronizza Storico Chat</h3>
                      <p className="text-slate-400 text-xs mt-1">Carica il file "Cronologia" per aggiornare Volumi, Heatmap e Classifiche automaticamente.</p>
                    </div>
                  </div>
                  <label className={`mt-4 md:mt-0 flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white cursor-pointer rounded-xl text-sm font-bold shadow-blue-900/50 transition-all`}><FileText size={16} /> Seleziona CSV<input type="file" accept=".csv" className="hidden" onChange={handleChatImport}/></label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title={`Trend Chat Gestite (${timeframe === 'year' ? 'Annuale' : timeframe === 'month' ? 'Mensile' : 'Settimanale'})`} isEmpty={trends.every(t => t.chatVol === 0)}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#64748b', textTransform:'capitalize'}} interval={timeframe === 'month' ? 'preserveStartEnd' : 0} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}}/>
                        <Bar dataKey="chatVol" fill="#3b82f6" radius={[4,4,0,0]} name="Chat Gestite" barSize={timeframe === 'month' || timeframe === 'year' ? 12 : 40}/>
                      </BarChart>
                    </ChartContainer>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase flex items-center gap-2"><Clock size={16} className="text-blue-500"/> Tempi Attesa Iniziale</h3>
                    {insightsChat.respData.length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessun dato nel periodo</p> :
                      <div className="flex-1 w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={insightsChat.respData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="count" nameKey="bucket">
                              {insightsChat.respData.map((entry, index) => {
                                const c = entry.bucket === '< 30 sec' ? '#10b981' : entry.bucket === '30 - 45 sec' ? '#84cc16' : entry.bucket === '45 - 60 sec' ? '#eab308' : entry.bucket === '60 - 90 sec' ? '#f59e0b' : entry.bucket === '90 - 120 sec' ? '#f97316' : '#ef4444';
                                return <Cell key={`cell-${index}`} fill={c} />;
                              })}
                            </Pie>
                            <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '10px'}}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    }
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* MAPPA DI CALORE ORARIA (09:00 - 19:00) */}
                  <ChartContainer title="Mappa di Calore Oraria" isEmpty={insightsChat.heatmapData.every(x => x.picked_up === 0)}>
                    <AreaChart data={insightsChat.heatmapData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPicked" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}}/>
                      <Area type="monotone" dataKey="picked_up" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPicked)" name="Chat Prese" />
                    </AreaChart>
                  </ChartContainer>

                  {/* PICCHI SETTIMANALI SUL GIORNO */}
                  <ChartContainer title="Picchi Settimanali sui Giorni" isEmpty={insightsChat.weekDaysData.every(x => x.volume === 0)}>
                    <BarChart data={insightsChat.weekDaysData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize:11, fill:'#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}}/>
                      <Bar dataKey="volume" fill="#8b5cf6" radius={[4,4,0,0]} name="Volume Chat" barSize={35}/>
                    </BarChart>
                  </ChartContainer>
                </div>

                {/* TABELLONA OPERATORI ALLARGATA */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm w-full">
                  <h3 className="font-bold text-slate-800 mb-6 text-sm uppercase flex items-center gap-2"><Trophy size={16} className="text-amber-500"/> Leaderboard Operatori</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase">Operatore</th>
                          <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase text-center">Chat Gestite</th>
                          <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase text-center">Attesa Media</th>
                          <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase text-right">Durata Media Chat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insightsChat.leaderboard.length === 0 ? <tr><td colSpan="4" className="py-8 text-center text-xs text-slate-400">Nessun dato nel periodo.</td></tr> :
                          insightsChat.leaderboard.map((op, i) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="py-4 text-sm font-bold text-slate-800 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs">{op.name.charAt(0)}</div>
                              {op.name}
                            </td>
                            <td className="py-4 text-center"><span className="bg-blue-50 text-blue-700 font-black text-sm px-3 py-1.5 rounded-lg">{op.count}</span></td>
                            <td className="py-4 text-center text-sm font-bold text-slate-600">{formatSeconds(op.avgWait)}</td>
                            <td className="py-4 text-right text-sm font-medium text-slate-500">{formatTime(op.avgDur/60)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SEZIONE ASSISTENZA */}
            {view === 'assistenza' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle icon={AlertCircle} title="Analisi Dettagliata Ticket Assistenza" colorClass="text-emerald-600" bgClass="bg-emerald-100" />
                <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-lg mb-6 border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-500/20 p-3 rounded-xl"><UploadCloud size={24} className="text-emerald-400"/></div>
                    <div>
                      <h3 className="text-white font-bold text-sm md:text-base">Aggiorna Statistiche Assistenza</h3>
                      <p className="text-slate-400 text-xs mt-1">Carica il file "ReportOverview" del supporto clienti.</p>
                    </div>
                  </div>
                  <label className={`mt-4 md:mt-0 flex items-center gap-2 px-6 py-3 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer shadow-emerald-900/50'} text-white rounded-xl text-sm font-bold transition-all`}>
                    <FileText size={16} /> Carica CSV
                    <input type="file" accept=".csv" className="hidden" onChange={(e) => handleDailyTicketsImport(e, 'zoho_daily_assistenza')} disabled={loading} />
                  </label>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title={`Trend Ticket Assistenza (${timeframe === 'year' ? 'Annuale' : timeframe === 'month' ? 'Mensile' : 'Settimanale'})`} isEmpty={trends.every(t => t.astIn === 0 && t.astOut === 0)}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#64748b', textTransform:'capitalize'}} interval={timeframe === 'month' ? 'preserveStartEnd' : 0} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend verticalAlign="top" height={36} iconType="circle"/>
                        <Bar dataKey="astIn" fill="#94a3b8" radius={[4,4,0,0]} name="Nuovi Aperti" barSize={timeframe === 'month' || timeframe === 'year' ? 12 : 30}/>
                        <Bar dataKey="astOut" fill="#10b981" radius={[4,4,0,0]} name="Risolti" barSize={timeframe === 'month' || timeframe === 'year' ? 12 : 30}/>
                      </BarChart>
                    </ChartContainer>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex-shrink-0 text-sm uppercase tracking-wide flex items-center gap-2"><Clock size={16} className="text-emerald-500"/> Tempi SLA & Soddisfazione</h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-4">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Prima Risp.</p><p className="text-sm font-black text-slate-800">{formatTime(kpi.curr.astSlaFirst)}</p></div>
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Risp. Succ.</p><p className="text-sm font-black text-slate-800">{formatTime(kpi.curr.astSlaResp)}</p></div>
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Risoluzione</p><p className="text-sm font-black text-emerald-600">{formatTime(kpi.curr.astSlaRes)}</p></div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Gradimento Clienti</p>
                        <div className="flex items-center justify-between px-1">
                          <div className="text-center"><span className="block text-emerald-500 font-black text-lg">{insightsTickets.ast.good}</span><span className="text-[10px] text-slate-500 font-bold uppercase">Buono</span></div>
                          <div className="text-center"><span className="block text-amber-500 font-black text-lg">{insightsTickets.ast.ok}</span><span className="text-[10px] text-slate-500 font-bold uppercase">Medio</span></div>
                          <div className="text-center"><span className="block text-rose-500 font-black text-lg">{insightsTickets.ast.bad}</span><span className="text-[10px] text-slate-500 font-bold uppercase">Scarso</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SEZIONE SVILUPPO */}
            {view === 'sviluppo' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle icon={Code} title="Analisi Dettagliata Sviluppo & Bug" colorClass="text-amber-600" bgClass="bg-amber-100" />
                <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-lg mb-6 border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="bg-amber-500/20 p-3 rounded-xl"><UploadCloud size={24} className="text-amber-400"/></div>
                    <div>
                      <h3 className="text-white font-bold text-sm md:text-base">Aggiorna Statistiche Sviluppo</h3>
                      <p className="text-slate-400 text-xs mt-1">Carica il file "ReportOverview" del team programmatori.</p>
                    </div>
                  </div>
                  <label className={`mt-4 md:mt-0 flex items-center gap-2 px-6 py-3 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 cursor-pointer shadow-amber-900/50'} text-white rounded-xl text-sm font-bold transition-all`}>
                    <FileText size={16} /> Carica CSV
                    <input type="file" accept=".csv" className="hidden" onChange={(e) => handleDailyTicketsImport(e, 'zoho_daily_sviluppo')} disabled={loading} />
                  </label>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title={`Trend Ticket Sviluppo (${timeframe === 'year' ? 'Annuale' : timeframe === 'month' ? 'Mensile' : 'Settimanale'})`} isEmpty={trends.every(t => t.devIn === 0 && t.devOut === 0)}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#64748b', textTransform:'capitalize'}} interval={timeframe === 'month' ? 'preserveStartEnd' : 0} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend verticalAlign="top" height={36} iconType="circle"/>
                        <Bar dataKey="devIn" fill="#94a3b8" radius={[4,4,0,0]} name="Nuovi Segnalati" barSize={timeframe === 'month' || timeframe === 'year' ? 12 : 30}/>
                        <Bar dataKey="devOut" fill="#f59e0b" radius={[4,4,0,0]} name="Bug Corretti" barSize={timeframe === 'month' || timeframe === 'year' ? 12 : 30}/>
                      </BarChart>
                    </ChartContainer>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex-shrink-0 text-sm uppercase tracking-wide flex items-center gap-2"><Clock size={16} className="text-amber-500"/> Tempi SLA & Attese</h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-4">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Prima Risp.</p><p className="text-sm font-black text-slate-800">{formatTime(kpi.curr.devSlaFirst)}</p></div>
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Risp. Succ.</p><p className="text-sm font-black text-slate-800">{formatTime(kpi.curr.devSlaResp)}</p></div>
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Risoluzione</p><p className="text-sm font-black text-amber-600">{formatTime(kpi.curr.devSlaRes)}</p></div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center"><p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ticket Sospesi / Attesa</p><p className="text-xl font-black text-amber-500">{insightsTickets.dev.waitAvg} in media</p></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SEZIONE FORMAZIONE */}
            {view === 'formazione' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle icon={GraduationCap} title="Analisi Dettagliata Formazione" colorClass="text-purple-600" bgClass="bg-purple-100" />
                
                <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-lg mb-6 border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="bg-purple-500/20 p-3 rounded-xl"><UploadCloud size={24} className="text-purple-400"/></div>
                    <div>
                      <h3 className="text-white font-bold text-sm md:text-base">Carica Report Formazioni</h3>
                      <p className="text-slate-400 text-xs mt-1">Carica il CSV "Report Assistenza Tecnica_per operatore". L'IA estrarrà Aziende, Argomenti e Minuti.</p>
                    </div>
                  </div>
                  <label className={`mt-4 md:mt-0 flex items-center gap-2 px-6 py-3 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 cursor-pointer shadow-purple-900/50'} text-white rounded-xl text-sm font-bold transition-all`}>
                    <FileText size={16} /> Seleziona CSV
                    <input type="file" accept=".csv" className="hidden" onChange={handleFormazioneImport} disabled={loading}/>
                  </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase flex items-center gap-2"><Activity size={16} className="text-purple-500"/> Macro-Argomenti (IA)</h3>
                    {insightsFormazione.topTopics.length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessun dato</p> :
                    <div className="flex-1 w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={insightsFormazione.topTopics} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="count" nameKey="name">
                            {insightsFormazione.topTopics.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                          </Pie>
                          <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize:'10px'}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>}
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase flex items-center gap-2"><Building size={16} className="text-rose-500"/> Top Aziende Assistite</h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-2">
                      {insightsFormazione.topComps.length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessun dato presente</p> :
                        insightsFormazione.topComps.map((comp, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="overflow-hidden mr-3">
                            <p className="text-xs font-bold text-slate-800 truncate" title={comp.cleanName}>{comp.cleanName}</p>
                            <p className="text-[10px] font-medium text-slate-500 mt-0.5">{comp.count} sessioni</p>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <p className="text-sm font-black text-rose-600">{formatTime(comp.mins)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase flex items-center gap-2"><Trophy size={16} className="text-blue-500"/> Classifica Formatori</h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-2">
                      {insightsFormazione.topOps.length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessun dato presente</p> :
                        insightsFormazione.topOps.map((op, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{op.name}</p>
                            <p className="text-[10px] font-medium text-slate-500 mt-0.5">{op.count} appuntamenti</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-blue-600">{formatTime(op.mins)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </main>
      </div>
    </div>
  );
}