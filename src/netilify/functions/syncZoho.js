import { createClient } from '@supabase/supabase-js';

export const handler = async (event, context) => {
  try {
    // --- CHIAVI ZOHO ---
    const ZOHO_CLIENT_ID = '1000.A62V1KP5LEPIX0CRFZ7YF3UE7JMMVR';
    const ZOHO_CLIENT_SECRET = 'ebc5d7613aede1e5108486b29d66d9cfa29d29e10e';
    const ZOHO_REFRESH_TOKEN = '1000.8f3e969822f623cd9c5d08dbdde895cf.026a8f50452a04252180d040d890310b';
    
    // ⚠️ INSERISCI QUI IL TUO ORG ID (Esempio: '674512390')
    const ZOHO_ORG_ID = '20103492490'; 

    const DEP_SVILUPPO = '191335000000007061';
    const DEP_ASSISTENZA = '191335000000288383';

    // 1. Rinnova l'Access Token
    const tokenUrl = `https://accounts.zoho.eu/oauth/v2/token?refresh_token=${ZOHO_REFRESH_TOKEN}&client_id=${ZOHO_CLIENT_ID}&client_secret=${ZOHO_CLIENT_SECRET}&grant_type=refresh_token`;
    const tokenRes = await fetch(tokenUrl, { method: 'POST' });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) throw new Error("Errore credenziali Zoho");
    const accessToken = tokenData.access_token;

    const fetchZoho = async (params) => {
      const res = await fetch(`https://desk.zoho.eu/api/v1/tickets?${params}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'orgId': ZOHO_ORG_ID }
      });
      return res.json();
    };

    // 2. Data di oggi per i filtri
    const today = new Date().toISOString().split('T')[0];

    // Funzione che analizza i ticket scaricati dal dipartimento
    const processTickets = async (depId) => {
      // Peschiamo gli ultimi 50 ticket modificati per estrarre la fotografia di oggi
      const data = await fetchZoho(`departmentId=${depId}&limit=50&sortBy=-modifiedTime`);
      const tickets = data.data || [];

      let new_tickets = 0;
      let closed_tickets = 0;
      let backlog = 0;

      tickets.forEach(t => {
        const created = t.createdTime ? t.createdTime.split('T')[0] : null;
        const closed = t.closedTime ? t.closedTime.split('T')[0] : null;

        if (created === today) new_tickets++;
        if (closed === today) closed_tickets++;
        if (t.status === 'Open' || t.status === 'On Hold') backlog++;
      });

      return { date: today, new_tickets, closed_tickets, backlog, first_response_time: 15, resolution_time: 120 };
    };

    const statAssistenza = await processTickets(DEP_ASSISTENZA);
    const statSviluppo = await processTickets(DEP_SVILUPPO);

    // 3. Salva i dati analizzati su Supabase
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

    await supabase.from('ticket_assistenza').upsert(statAssistenza, { onConflict: 'date' });
    await supabase.from('ticket_sviluppo').upsert(statSviluppo, { onConflict: 'date' });

    return { statusCode: 200, body: JSON.stringify({ success: true, message: "Dati estratti da Zoho Desk e salvati con successo!" }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};