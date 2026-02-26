/* eslint-disable */
import * as XLSX from 'xlsx';
import { isValid, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';

// --- NORMALIZZAZIONE IDENTITÀ ---
const normalizeOperatorName = (name) => {
  if (!name) return '';
  const cleanName = String(name).trim();
  
  const aliases = {
    'nicola pellicioni': 'Nicola',
    'emanuele rosti': 'Emanuele',
    'filippo rossi': 'Filippo',
    'marta f': 'Marta',
    'nouha m': 'Nouha',
    'giuseppe u': 'Giuseppe'
  };

  const key = cleanName.toLowerCase();
  if (aliases[key]) return aliases[key];

  const firstName = cleanName.split(' ')[0];
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
};

// --- HELPERS TEMPI E DATE ---
const parseDurationToMinutes = (val) => {
  if (!val || typeof val !== 'string') return 0;
  const cleanVal = val.replace(' hrs', '').trim();
  const parts = cleanVal.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 60) + parts[1] + (parts[2] / 60);
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return 0;
};

const cleanDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000));
  const d = new Date(val);
  return isValid(d) ? d : null;
};

const findTimeRangeInText = (text) => {
  const regex = /([A-Z][a-z]{2} \d{1,2}, \d{4}).*?-.*?([A-Z][a-z]{2} \d{1,2}, \d{4})/;
  const matches = text.match(regex);
  if (matches && matches[1] && matches[2]) {
    const start = parse(matches[1], 'MMM dd, yyyy', new Date(), { locale: enUS });
    const end = parse(matches[2], 'MMM dd, yyyy', new Date(), { locale: enUS });
    if (isValid(start) && isValid(end)) return { start, end };
  }
  return null;
};

export const parseExcel = async (file, type) => {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let isBinary = (bytes[0] === 0x50 && bytes[1] === 0x4B) || (bytes[0] === 0xD0 && bytes[1] === 0xCF);
    let workbook, rangeFound = null;

    if (isBinary) {
      workbook = XLSX.read(buffer, { type: 'array' });
    } else {
      const textDecoder = new TextDecoder("utf-8");
      const textData = textDecoder.decode(buffer);
      workbook = XLSX.read(textData, { type: 'string' });
      rangeFound = findTimeRangeInText(textData);
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) throw new Error("File vuoto");
    return processData(rows, type, rangeFound);
  } catch (err) { throw new Error(`Errore Lettura: ${err.message}`); }
};

const processData = (rawData, type, rangeFound) => {
  let cleanData = [];
  const findHeader = (keys) => {
    for (let i = 0; i < Math.min(rawData.length, 50); i++) {
      const rowStr = Array.isArray(rawData[i]) ? rawData[i].join(' ').toLowerCase() : '';
      if (keys.every(k => rowStr.includes(k.toLowerCase()))) return i;
    }
    return -1;
  };

  if (type === 'chat') {
    let hIdx = findHeader(['Name', 'Accepted']);
    if (hIdx === -1) hIdx = findHeader(['Operator', 'Picked Up']);
    if (hIdx === -1) throw new Error("Header Chat non trovato");
    
    const headers = rawData[hIdx].map(h => String(h).toLowerCase());
    const idxName = headers.findIndex(h => h.includes('name') || h.includes('operator'));
    let idxAcc = headers.findIndex(h => h.includes('picked')); 
    if (idxAcc === -1) idxAcc = headers.findIndex(h => h.includes('involved'));
    if (idxAcc === -1) idxAcc = headers.findIndex(h => h.includes('accepted'));
    
    const idxAvgTime = headers.findIndex(h => h.includes('average response') || h.includes('avg response'));
    const idxDur = headers.findIndex(h => h.includes('average chat duration') || h.includes('avg duration'));
    const idxHr = headers.findIndex(h => h.includes('hours') || h.includes('time'));

    for (let i = hIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!Array.isArray(row)) continue;
      
      const rawOp = row[idxName];
      // Ignoriamo le righe di sistema e gli admin
      if (!rawOp || String(rawOp).match(/Total|Portal|Generated|Admin/i)) continue;
      
      const op = normalizeOperatorName(rawOp);
      
      cleanData.push({ 
        operator: op, 
        chats_accepted: Number(row[idxAcc]) || 0, 
        hours_worked: row[idxHr],
        avg_response_time: parseDurationToMinutes(row[idxAvgTime]), 
        avg_duration: parseDurationToMinutes(row[idxDur])
      });
    }
  }
  else if (type === 'formazioni') {
    const hIdx = findHeader(['Durata', 'Creato']);
    if (hIdx === -1) throw new Error("Header Formazioni non trovato");
    const headers = rawData[hIdx].map(h => String(h).toLowerCase());
    const idxOp = headers.findIndex(h => h.includes('creato'));
    const idxDur = headers.findIndex(h => h.includes('durata'));
    const idxDate = headers.findIndex(h => h.includes('ora') || h.includes('data'));
    const idxAzienda = headers.findIndex(h => h.includes('azienda')); 
    const idxDesc = headers.findIndex(h => h.includes('nota') || h.includes('desc'));

    for (let i = hIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!Array.isArray(row)) continue;
      const date = cleanDate(row[idxDate]);
      if (date && row[idxOp]) {
        
        const op = normalizeOperatorName(row[idxOp]);
        
        cleanData.push({ 
          date: date.toISOString(), 
          operator: op, 
          duration: Number(row[idxDur] || 0),
          topic: `${row[idxAzienda] || 'Cliente'} | ${row[idxDesc] || ''}`
        });
      }
    }
  }
  else if (type === 'assistenza' || type === 'sviluppo') {
    let hIdx = findHeader(['Nuovo Ticket']);
    if (hIdx === -1) hIdx = findHeader(['Ticket']); // Paracadute per export in inglese
    if (hIdx === -1) throw new Error("Header Ticket non trovato");
    
    const headers = rawData[hIdx].map(h => String(h).toLowerCase());
    const idxDate = headers.findIndex(h => h === 'data' || h === 'date'); // Aggiunto 'date'
    const idxNew = headers.findIndex(h => h.includes('nuovo') || h.includes('new'));
    const idxClo = headers.findIndex(h => h.includes('chiusi') || h.includes('closed'));
    const idxBack = headers.findIndex(h => h.includes('backlog'));
    const idxFirstResp = headers.findIndex(h => h.includes('prima risposta') || h.includes('first response'));
    const idxResolution = headers.findIndex(h => h.includes('risoluzione') || h.includes('resolution'));

    for (let i = hIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!Array.isArray(row)) continue;
      const date = cleanDate(row[idxDate]);
      if (date) {
        cleanData.push({ 
          date: date.toISOString(), 
          new_tickets: Number(row[idxNew] || 0), 
          closed_tickets: Number(row[idxClo] || 0), 
          backlog: Number(row[idxBack] || 0), 
          first_response_time: parseDurationToMinutes(row[idxFirstResp]), 
          resolution_time: parseDurationToMinutes(row[idxResolution])
        });
      }
    }
  }
  return { rows: cleanData, range: rangeFound, count: cleanData.length };
};