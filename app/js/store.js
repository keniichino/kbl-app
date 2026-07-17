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
  notas: 'kbl.notas',
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
      supabase.from('gastos').select('*'),
      supabase.from('notas').select('*'),
    ]);
    const timeout = new Promise((_, rej) => setTimeout(rej, 3500, 'timeout'));
    const [sess, act, gastosR, notasR] = await Promise.race([pull, timeout]);
    if (sess.data) write(KEYS.sessions, sess.data.map(fromRemote));
    if (!act.error) {
      const local = getActive();
      if (act.data?.start_ts) applyRemoteActive(act.data);
      else if (local) setActive(local); // sesión iniciada offline: gana lo local y se empuja
    }
    if (gastosR.data) mergeListPull('gastos', KEYS.gastos, gastosR.data, fromRemoteGasto, toRemoteGasto);
    if (notasR.data) mergeListPull('notas', KEYS.notas, notasR.data, fromRemoteNota, toRemoteNota);
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

  suscribirLista('gastos', KEYS.gastos, fromRemoteGasto, 'gastos');
  suscribirLista('notas', KEYS.notas, fromRemoteNota, 'notas');
}

// --- Gastos: [{ id, monto, descripcion, categoria, fecha, ts }] ---
// Sync con Supabase (misma tabla abierta que Foco, sin login todavía).
// Nota de privacidad: hasta que exista Auth+RLS, cualquiera con la anon
// key pública del repo podría leer esta tabla. Aceptado por Keni para
// uso personal; se cierra con candado real cuando entren más usuarios.

const toRemoteGasto = (g) => ({
  id: g.id,
  monto: g.monto,
  descripcion: g.descripcion || null,
  categoria: g.categoria,
  fecha: g.fecha,
  created_at: new Date(g.ts).toISOString(),
});
const fromRemoteGasto = (r) => ({
  id: r.id,
  monto: Number(r.monto),
  descripcion: r.descripcion || '',
  categoria: r.categoria,
  fecha: r.fecha,
  ts: Date.parse(r.created_at),
});

export function getGastos() {
  return read(KEYS.gastos, []);
}

export function addGasto(gasto) {
  const all = getGastos();
  all.push(gasto);
  write(KEYS.gastos, all);
  supabase.from('gastos').upsert(toRemoteGasto(gasto), { onConflict: 'id' }).then(() => {}, () => {});
  return gasto;
}

export function removeGasto(id) {
  write(KEYS.gastos, getGastos().filter((g) => g.id !== id));
  supabase.from('gastos').delete().eq('id', id).then(() => {}, () => {});
}

// --- Notas: [{ id, titulo, contenido, updated }] ---
// Mismo modelo de sync que Gastos (ver nota de privacidad arriba).

const toRemoteNota = (n) => ({
  id: n.id,
  titulo: n.titulo || null,
  contenido: n.contenido || null,
  updated_at: new Date(n.updated).toISOString(),
});
const fromRemoteNota = (r) => ({
  id: r.id,
  titulo: r.titulo || '',
  contenido: r.contenido || '',
  updated: Date.parse(r.updated_at),
});

export function getNotas() {
  return read(KEYS.notas, []);
}

export function upsertNota(nota) {
  const all = getNotas().filter((n) => n.id !== nota.id);
  all.push(nota);
  write(KEYS.notas, all);
  supabase.from('notas').upsert(toRemoteNota(nota), { onConflict: 'id' }).then(() => {}, () => {});
  return nota;
}

export function removeNota(id) {
  write(KEYS.notas, getNotas().filter((n) => n.id !== id));
  supabase.from('notas').delete().eq('id', id).then(() => {}, () => {});
}

// --- Sync genérico para tablas-lista (gastos, notas): merge local+remoto
// al arrancar, y aplica INSERT/UPDATE/DELETE en vivo del otro dispositivo.

function mergeListPull(tableName, key, remoteRows, fromRemote, toRemote) {
  const local = read(key, []);
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  const localIds = new Set(local.map((l) => l.id));

  // Ítems creados offline en este dispositivo: empujarlos al servidor
  for (const l of local) {
    if (!remoteIds.has(l.id)) {
      supabase.from(tableName).upsert(toRemote(l), { onConflict: 'id' }).then(() => {}, () => {});
    }
  }

  const soloLocal = local.filter((l) => !remoteIds.has(l.id));
  write(key, [...soloLocal, ...remoteRows.map(fromRemote)]);
}

function suscribirLista(tableName, key, fromRemote, kind) {
  supabase
    .channel(`kbl-${tableName}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (p) => {
      const all = read(key, []);
      if (p.eventType === 'DELETE') {
        write(key, all.filter((x) => x.id !== p.old.id));
      } else {
        const item = fromRemote(p.new);
        write(key, [...all.filter((x) => x.id !== item.id), item]);
      }
      notify(kind);
    })
    .subscribe();
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
