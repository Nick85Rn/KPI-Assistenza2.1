// src/api/chatbotSettings.js
//
// Legge il flag chatbot_settings.is_active: se false, il sito mostra
// la chat Zoho diretta invece della chat AI (interruttore di
// sicurezza, gestito da chi ha accesso alla dashboard KPI).
//
// Chiamata REST diretta (come askAi.js): questo progetto non usa la
// libreria supabase-js, solo fetch dirette con la chiave anon.
//
// In caso di errore di rete, il default è `true` (chatbot ATTIVO):
// un problema di connessione non deve improvvisamente nascondere la
// chat AI a tutti i visitatori — è un fallback "verso il più ricco",
// non verso il più cauto.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function isChatbotActive() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return true;

  try {
    const url = `${SUPABASE_URL}/rest/v1/chatbot_settings?select=is_active&id=eq.1`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return true;
    const rows = await res.json();
    if (!rows?.length) return true;
    return rows[0].is_active !== false;
  } catch (err) {
    console.error('isChatbotActive error (fallback: attivo):', err);
    return true;
  }
}
