import { createClient } from '@supabase/supabase-js';

// Sostituisci con i tuoi dati veri presi da Supabase Settings -> API
const supabaseUrl = 'https://oqqqoedxzflnebjozhqu.supabase.co';
const supabaseKey = 'sb_publishable_OJPkNNwpEYADYc1cAeX3aQ_qUOoX3sx';

export const supabase = createClient(supabaseUrl, supabaseKey);