// supabase/functions/zoho-oauth-callback/index.ts
//
// Endpoint che Zoho richiama dopo l'Accept dell'utente.
// Riceve un ?code=... nell'URL, lo scambia con un refresh_token,
// e salva tutto nella tabella zoho_credentials.
//
// Configurazione necessaria nelle env var della Edge Function:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REDIRECT_URI       (deve essere identico a quello impostato in api-console.zoho.eu)
//   ZOHO_ACCOUNTS_URL       (default: https://accounts.zoho.eu)
//   ZOHO_API_DOMAIN         (default: https://www.zohoapis.eu)

import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // 1. Gestione CORS preflight
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const errorParam = url.searchParams.get("error");

    // Caso: l'utente ha cliccato "Rifiuta" su Zoho
    if (errorParam) {
      return htmlResponse(
        false,
        `Zoho ha restituito un errore: ${errorParam}. Riprova l'autorizzazione.`,
      );
    }

    if (!code) {
      return htmlResponse(
        false,
        "Parametro 'code' mancante nell'URL. Questa pagina va aperta solo dopo l'autorizzazione Zoho.",
      );
    }

    // 2. Leggi le configurazioni dalle env var
    const clientId = Deno.env.get("ZOHO_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
    const redirectUri = Deno.env.get("ZOHO_REDIRECT_URI");
    const accountsUrl =
      Deno.env.get("ZOHO_ACCOUNTS_URL") ?? "https://accounts.zoho.eu";
    const apiDomainDefault =
      Deno.env.get("ZOHO_API_DOMAIN") ?? "https://www.zohoapis.eu";

    if (!clientId || !clientSecret || !redirectUri) {
      return htmlResponse(
        false,
        "Configurazione mancante: imposta ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET e ZOHO_REDIRECT_URI nelle env var della Edge Function.",
      );
    }

    // 3. Scambia il code con il refresh token
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(`${accountsUrl}/oauth/v2/token?${params}`, {
      method: "POST",
    });
    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok || tokenJson.error) {
      return htmlResponse(
        false,
        `Errore da Zoho: ${tokenJson.error ?? "sconosciuto"}. ` +
          `Causa frequente: il code è scaduto (vale 60s) o è già stato usato.`,
      );
    }

    if (!tokenJson.refresh_token) {
      return htmlResponse(
        false,
        "Zoho ha risposto con access_token ma SENZA refresh_token. " +
          "Probabilmente l'app è già stata autorizzata in passato. " +
          "Soluzione: revoca l'autorizzazione su accounts.zoho.eu/home#sessions/userauthtoken " +
          "e riautorizza.",
      );
    }

    // 4. Salva (upsert) nella tabella zoho_credentials, riga 'global'
    const { error } = await supabaseAdmin
      .from("zoho_credentials")
      .upsert(
        {
          source: "global",
          refresh_token: tokenJson.refresh_token,
          client_id: clientId,
          api_domain: tokenJson.api_domain ?? apiDomainDefault,
          accounts_url: accountsUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source" },
      );

    if (error) {
      return htmlResponse(
        false,
        `Refresh token ottenuto, ma errore salvando su Supabase: ${error.message}`,
      );
    }

    // 5. Successo
    return htmlResponse(
      true,
      "Refresh token salvato correttamente. Da ora la dashboard può sincronizzare i dati Zoho.",
    );
  } catch (err) {
    return htmlResponse(false, `Errore inatteso: ${(err as Error).message}`);
  }
});

/**
 * Genera una pagina HTML semplice per dare un feedback visivo all'utente
 * dopo il redirect da Zoho.
 */
function htmlResponse(success: boolean, message: string): Response {
  const title = success ? "✅ Autorizzazione completata" : "❌ Errore";
  const color = success ? "#16a34a" : "#dc2626";
  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>${title} - KPI Assistenza</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px;
           margin: 80px auto; padding: 24px; line-height: 1.6; color: #1f2937; }
    h1 { color: ${color}; margin-bottom: 8px; }
    .msg { background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 16px; }
    .next { margin-top: 24px; font-size: 0.9em; color: #6b7280; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="msg">${message}</div>
  ${success
    ? `<p class="next">Puoi chiudere questa scheda e tornare alla
       <a href="https://assistenzapienissimokpi.netlify.app/">dashboard</a>.</p>`
    : `<p class="next">Se l'errore persiste, verifica la configurazione delle variabili d'ambiente
       nella Edge Function su Supabase.</p>`}
</body>
</html>`;
  return new Response(html, {
    status: success ? 200 : 400,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
});
