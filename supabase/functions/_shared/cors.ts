// supabase/functions/_shared/cors.ts
// Header CORS comuni per tutte le Edge Functions.
// Permettiamo richieste dal frontend Netlify e da localhost (sviluppo).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Helper: gestisce automaticamente la preflight request OPTIONS che il browser
// invia prima di una vera POST/GET cross-origin.
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
