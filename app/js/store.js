// ====== Capa de datos: local-first + sync Supabase ======
// Lecturas siempre desde localStorage (instantáneas, funcionan offline).
// Escrituras: localStorage + push a Supabase en segundo plano.
// Realtime: cambios hechos en otro dispositivo llegan por WebSocket,
// se aplican a localStorage y se avisa a la UI vía callback.

import { supabase } from './supabaseClient.js';

const KEYS = {
  sessions: 'kbl.foco.sessions',
  active: 'kbl.foco.active',
  gastos: 'kbl.gastos',
  notas: 'kbl.notas',
  cuotas: 'kbl.cuotas',
  uid: 'kbl.uid', // dueño de los datos locales actuales (para detectar cambio de cuenta)
};

let notify = () => {};
let currentUid = null; // user autenticado; el server igual valida vía RLS

// Borra todos los datos locales (al cerrar sesión o al entrar con otra cuenta
// en el mismo dispositivo, para no mezclar datos de dos usuarios).
export function clearLocalData() {
  [KEYS.sessions, KEYS.active, KEYS.gastos, KEYS.notas, KEYS.cuotas].forEach(
    (k) => localStorage.removeItem(k)
  );
}

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
  if (!currentUid) return; // sin sesión no hay a dónde empujar
  // Una fila por usuario (PK = user_id): upsert en vez de update a id=1.
  supabase
    .from('foco_active')
    .upsert({
      user_id: currentUid,
      start_ts: session ? new Date(session.startTs).toISOString() : null,
      duration_min: session ? session.durationMin : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
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

  // Quién es el usuario logueado. Si es distinto al dueño de los datos locales
  // (cambió de cuenta en este dispositivo), limpiamos lo local antes de traer
  // lo suyo, para no mezclar los datos de dos personas.
  const { data: { user } } = await supabase.auth.getUser();
  currentUid = user?.id ?? null;
  if (currentUid && localStorage.getItem(KEYS.uid) !== currentUid) {
    clearLocalData();
    localStorage.setItem(KEYS.uid, currentUid);
  }

  // Pull inicial con timeout: sin red, la app arranca igual con lo local
  try {
    const pull = Promise.all([
      supabase.from('foco_sessions').select('*').order('start_ts'),
      supabase.from('foco_active').select('*').maybeSingle(), // RLS filtra a la fila del usuario
      supabase.from('gastos').select('*'),
      supabase.from('notas').select('*'),
      supabase.from('cuotas').select('*'),
    ]);
    const timeout = new Promise((_, rej) => setTimeout(rej, 3500, 'timeout'));
    const [sess, act, gastosR, notasR, cuotasR] = await Promise.race([pull, timeout]);
    if (sess.data) write(KEYS.sessions, sess.data.map(fromRemote));
    if (!act.error) {
      const local = getActive();
      if (act.data?.start_ts) applyRemoteActive(act.data);
      else if (local) setActive(local); // sesión iniciada offline: gana lo local y se empuja
    }
    if (gastosR.data) mergeListPull('gastos', KEYS.gastos, gastosR.data, fromRemoteGasto, toRemoteGasto);
    // Notas: last-write-wins por `updated`, así una edición hecha offline no la
    // pisa la versión vieja que estaba en la nube.
    if (notasR.data) mergeListPull('notas', KEYS.notas, notasR.data, fromRemoteNota, toRemoteNota,
      (local, remote) => local.updated > Date.parse(remote.updated_at));
    if (cuotasR.data) mergeListPull('cuotas', KEYS.cuotas, cuotasR.data, fromRemoteCuota, toRemoteCuota);
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
  suscribirLista('cuotas', KEYS.cuotas, fromRemoteCuota, 'cuotas');
}

// --- Gastos: [{ id, monto, descripcion, categoria, fecha, ts }] ---
// Sync con Supabase. El aislamiento por usuario lo garantiza RLS en el server
// (user_id = auth.uid()); el cliente ni manda user_id, lo pone el default.

const toRemoteGasto = (g) => ({
  id: g.id,
  monto: g.monto,
  descripcion: g.descripcion || null,
  categoria: g.categoria,
  tarjeta: g.tarjeta || null,
  fecha: g.fecha,
  created_at: new Date(g.ts).toISOString(),
});
const fromRemoteGasto = (r) => ({
  id: r.id,
  monto: Number(r.monto),
  descripcion: r.descripcion || '',
  categoria: r.categoria,
  tarjeta: r.tarjeta || null,
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

// localGana(localItem, remoteRow) → true si la versión local debe prevalecer
// sobre la remota del mismo id (last-write-wins). Opcional: sin él, la remota
// siempre gana (comportamiento para tablas que no se editan, como gastos).
function mergeListPull(tableName, key, remoteRows, fromRemote, toRemote, localGana) {
  const local = read(key, []);
  const remoteIds = new Set(remoteRows.map((r) => r.id));
  const resultado = [];

  // Filas que existen en el servidor: normalmente gana la remota; pero si hay
  // una local del mismo id más nueva, gana la local y la re-empujamos.
  for (const r of remoteRows) {
    const l = local.find((x) => x.id === r.id);
    if (l && localGana && localGana(l, r)) {
      supabase.from(tableName).upsert(toRemote(l), { onConflict: 'id' }).then(() => {}, () => {});
      resultado.push(l);
    } else {
      resultado.push(fromRemote(r));
    }
  }

  // Ítems creados offline en este dispositivo (no están en el server): empujar y conservar
  for (const l of local) {
    if (!remoteIds.has(l.id)) {
      supabase.from(tableName).upsert(toRemote(l), { onConflict: 'id' }).then(() => {}, () => {});
      resultado.push(l);
    }
  }

  write(key, resultado);
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

// --- Cuotas: [{ id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, created_at }] ---

const toRemoteCuota = (c) => ({
  id: c.id,
  descripcion: c.descripcion,
  tarjeta: c.tarjeta,
  monto_cuota: c.monto_cuota,
  cuota_actual: c.cuota_actual,
  cuota_total: c.cuota_total,
  fecha_primer_venc: c.fecha_primer_venc,
  estado: c.estado,
  created_at: c.created_at,
});
const fromRemoteCuota = (r) => ({
  id: r.id,
  descripcion: r.descripcion,
  tarjeta: r.tarjeta,
  monto_cuota: Number(r.monto_cuota),
  cuota_actual: Number(r.cuota_actual),
  cuota_total: Number(r.cuota_total),
  fecha_primer_venc: r.fecha_primer_venc,
  estado: r.estado,
  created_at: r.created_at,
});

export function getCuotas() {
  return read(KEYS.cuotas, []);
}

export function addCuota(cuota) {
  const all = getCuotas();
  all.push(cuota);
  write(KEYS.cuotas, all);
  supabase.from('cuotas').upsert(toRemoteCuota(cuota), { onConflict: 'id' }).then(() => {}, () => {});
  return cuota;
}

export function removeCuota(id) {
  write(KEYS.cuotas, getCuotas().filter((c) => c.id !== id));
  supabase.from('cuotas').delete().eq('id', id).then(() => {}, () => {});
}

export function updateCuotaEstado(id, estado) {
  const all = getCuotas().map((c) => c.id === id ? { ...c, estado } : c);
  write(KEYS.cuotas, all);
  supabase.from('cuotas').update({ estado }).eq('id', id).then(() => {}, () => {});
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
