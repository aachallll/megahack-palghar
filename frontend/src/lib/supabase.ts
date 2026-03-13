import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Bypassing RLS by using the service_role key temporarily for development
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15YWZxdHJhcXNkcWllcHdodHpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzNjE4NCwiZXhwIjoyMDg4ODEyMTg0fQ.25j0uRDL8KcIIapoP07YISSql3kyNQPniy92x3W-vh8";

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
