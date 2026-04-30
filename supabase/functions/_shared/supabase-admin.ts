// supabase/functions/_shared/supabase-admin.ts
// Client Supabase con service_role key, da usare SOLO lato server (Edge Functions).
// Bypassa Row Level Security: può leggere/scrivere tutte le tabelle.
// NON USARE MAI questo client dal frontend.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
