// ====== Autenticación: email + contraseña, multi-usuario ======
// La app es local-first: una vez logueado, la sesión queda persistida y la
// app abre incluso offline. El login solo hace falta la primera vez (o tras
// cerrar sesión). Todo el aislamiento de datos lo garantiza RLS en el server.
import { supabase } from './supabaseClient.js';

// Sesión actual (o null). Offline devuelve la persistida en localStorage.
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getUserId() {
  const s = await getSession();
  return s?.user?.id ?? null;
}

export function onAuthChange(cb) {
  // Se dispara en SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED
  supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // Si "Confirm email" está activo en Supabase, data.session viene null hasta
  // que el usuario confirma por mail. Lo señalamos para avisar en la UI.
  return { session: data.session, needsConfirm: !data.session };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Traduce los errores de Supabase a mensajes en criollo para la UI.
export function mensajeError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ese email ya tiene cuenta. Probá entrar.';
  if (m.includes('password') && m.includes('6')) return 'La contraseña necesita al menos 6 caracteres.';
  if (m.includes('email') && m.includes('valid')) return 'Ese email no parece válido.';
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'No hay conexión con el servidor (¿el proyecto Supabase está despierto?).';
  }
  return err?.message || 'Algo falló. Probá de nuevo.';
}
