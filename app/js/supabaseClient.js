// ====== Cliente Supabase único y compartido ======
// Auth y datos usan el MISMO client: así la sesión que abre el login viaja
// automáticamente en cada consulta de store.js (y en los canales de Realtime).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,      // guarda la sesión en localStorage → entra offline
    autoRefreshToken: true,
    detectSessionInUrl: false, // no usamos magic link / OAuth con redirect
  },
});
