// supabase/functions/_shared/zoho-token.ts
// Helper per ottenere un access token Zoho valido.
// Strategia: ad ogni chiamata generiamo un access token nuovo dal refresh token.
// È leggermente più "spreco-token" che cachare l'access token, ma:
//  - le Edge Functions sono stateless: tra una chiamata e l'altra il "cache" si perde
//  - Zoho permette ~50 access token al minuto: ampiamente sufficiente
//  - meno codice = meno bug

import { supabaseAdmin } from "./supabase-admin.ts";

export interface ZohoCredentials {
  refresh_token: string;
  client_id: string;
  api_domain: string;       // es. https://www.zohoapis.eu
  accounts_url: string;     // es. https://accounts.zoho.eu
}

/**
 * Legge le credenziali Zoho dalla tabella zoho_credentials (riga source='global').
 */
export async function loadZohoCredentials(): Promise<ZohoCredentials> {
  const { data, error } = await supabaseAdmin
    .from("zoho_credentials")
    .select("refresh_token, client_id, api_domain, accounts_url")
    .eq("source", "global")
    .single();

  if (error || !data) {
    throw new Error(
      `Impossibile leggere zoho_credentials: ${error?.message ?? "riga 'global' non trovata. Hai completato l'OAuth callback?"}`,
    );
  }
  return data as ZohoCredentials;
}

/**
 * Scambia il refresh token con un nuovo access token (validità ~1h).
 * Il client_secret è letto dalle env var della Edge Function.
 */
export async function getZohoAccessToken(): Promise<{
  accessToken: string;
  apiDomain: string;
}> {
  const creds = await loadZohoCredentials();
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  if (!clientSecret) {
    throw new Error(
      "ZOHO_CLIENT_SECRET non impostato nelle variabili d'ambiente della Edge Function.",
    );
  }

  const params = new URLSearchParams({
    refresh_token: creds.refresh_token,
    client_id: creds.client_id,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const url = `${creds.accounts_url}/oauth/v2/token?${params.toString()}`;
  const res = await fetch(url, { method: "POST" });
  const json = await res.json();

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Errore refresh token Zoho: ${JSON.stringify(json)}`,
    );
  }

  return {
    accessToken: json.access_token as string,
    apiDomain: (json.api_domain as string) ?? creds.api_domain,
  };
}

/**
 * Helper per fare richieste API Zoho con l'access token già impostato.
 * Esempio: const data = await zohoFetch('/crm/v8/Notes', { method: 'GET' });
 */
export async function zohoFetch(
  path: string,
  options: RequestInit = {},
  overrideHost?: string, // es. 'https://desk.zoho.eu' o 'https://salesiq.zoho.eu'
): Promise<Response> {
  const { accessToken, apiDomain } = await getZohoAccessToken();
  const baseUrl = overrideHost ?? apiDomain;

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Zoho-oauthtoken ${accessToken}`);

  return fetch(`${baseUrl}${path}`, { ...options, headers });
}
