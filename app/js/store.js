// ====== Capa de datos: local-first + sync Supabase ======
// Lecturas siempre desde localStorage (instantáneas, funcionan offline).
// Escrituras: localStorage + push a Supabase en segundo plano.
// Realtime: cambios hechos en otro dispositivo llegan por WebSocket,
// se aplican a localStorage y se avisa a la UI vía callback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const KEYS = {
  sessions: 'kbl.foco.sessions',
  active: 'kbl.foco.active',
  gastos: 'kbl.gastos',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let notify = () => {};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const toRemote = (s) => ({
  id: s.id,
  start_ts: new Date(s.startTs).toISOString(),
  duration_min: s.durationMin,
  completed: s.completed,
});

const fromRemote = (r) => ({
  id: r.id,
  startTs: Date.parse(r.start_ts),
  durationMin: r.duration_min,
  completed: r.completed,
});

// --- Sesiones terminadas: [{ id, startTs, durationMin, completed }] ---

export function getSessions() {
  return read(KEYS.sessions, []);
}

export function addSession(session) {
  const all = getSessions();
  if (!all.some((s) => s.id === session.id)) {
    all.push(session);
    write(KEYS.sessions, all);
  }
  // onConflict start_ts: si ambos dispositivos completan la misma sesión, queda una sola
  supabase
    .from('foco_sessions')
    .upsert(toRemote(session), { onConflict: 'start_ts', ignoreDuplicates: true })
    .then(() => {}, () => {});
  return session;
}

// --- Sesión activa: { startTs, durationMin } | null (fila única id=1) ---

export function getActive() {
  return read(KEYS.active, null);
}

export function setActive(session) {
  if (session === null) localStorage.removeItem(KEYS.active);
  else write(KEYS.active, session);
  supabase
    .from('foco_active')
    .update({
      start_ts: session ? new Date(session.startTs).toISOString() : null,
      duration_min: session ? session.durationMin : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .then(() => {}, () => {});
}

// --- Sync ---

function applyRemoteActive(row) {
  if (row && row.start_ts) {
    write(KEYS.active, { startTs: Date.parse(row.start_ts), durationMin: row.duration_min });
  } else {
    localStorage.removeItem(KEYS.active);
  }
}

export async function initSync(onRemoteChange) {
  if (onRemoteChange) notify = onRemoteChange;

  // Pull inicial con timeout: sin red, la app arranca igual con lo local
  try {
    const pull = Promise.all([
      supabase.from('foco_sessions').select('*').order('start_ts'),
      supabase.from('foco_active').select('*').eq('id', 1).maybeSingle(),
    ]);
    const timeout = new Promise((_, rej) => setTimeout(rej, 3500, 'timeout'));
    const [sess, act] = await Promise.race([pull, timeout]);
    if (sess.data) write(KEYS.sessions, sess.data.map(fromRemote));
    if (!act.error) {
      const local = getActive();
      if (act.data?.start_ts) applyRemoteActive(act.data);
      else if (local) setActive(local); // sesión iniciada offline: gana lo local y se empuja
    }
  } catch {
    /* offline: seguimos con localStorage */
  }

  // Cambios en vivo desde el otro dispositivo
  supabase
    .channel('kbl-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'foco_sessions' }, (p) => {
      if (!p.new?.id) return;
      const all = getSessions();
      if (!all.some((s) => s.id === p.new.id)) {
        all.push(fromRemote(p.new));
        write(KEYS.sessions, all);
        notify('sessions');
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'foco_active' }, (p) => {
      applyRemoteActive(p.new);
      notify('active');
    })
    .subscribe();
}

// --- Gastos: [{ id, monto, descripcion, categoria, fecha, ts }] ---
// Por ahora SOLO local (device-privado). El sync a Supabase se activa
// junto con Auth + RLS: plata sin login sería legible públicamente.

export function getGastos() {
  return read(KEYS.gastos, []);
}

export function addGasto(gasto) {
  const all = getGastos();
  all.push(gasto);
  write(KEYS.gastos, all);
  return gasto;
}

export function removeGasto(id) {
  write(KEYS.gastos, getGastos().filter((g) => g.id !== id));
}

// --- Estadísticas derivadas ---

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getStats() {
  const sessions = getSessions().filter((s) => s.completed);
  const now = Date.now();
  const today = startOfDay(now);
  const weekAgo = today - 6 * 86400000;

  const minutesToday = sessions
    .filter((s) => s.startTs >= today)
    .reduce((acc, s) => acc + s.durationMin, 0);

  const minutesWeek = sessions
    .filter((s) => s.startTs >= weekAgo)
    .reduce((acc, s) => acc + s.durationMin, 0);

  const days = new Set(sessions.map((s) => startOfDay(s.startTs)));
  let streak = 0;
  let cursor = days.has(today) ? today : today - 86400000;
  while (days.has(cursor)) {
    streak++;
    cursor -= 86400000;
  }

  return { minutesToday, minutesWeek, streak, trees: sessions.length };
}
