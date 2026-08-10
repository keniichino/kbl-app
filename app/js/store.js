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
  recurrentes: 'kbl.recurrentes',
  ahorros: 'kbl.ahorros',
  inversiones: 'kbl.inversiones',
  medios: 'kbl.medios_pago',
  uid: 'kbl.uid', // dueño de los datos locales actuales (para detectar cambio de cuenta)
};

let notify = () => {};
let currentUid = null; // user autenticado; el server igual valida vía RLS

// Borra todos los datos locales (al cerrar sesión o al entrar con otra cuenta
// en el mismo dispositivo, para no mezclar datos de dos usuarios).
export function clearLocalData() {
  [KEYS.sessions, KEYS.active, KEYS.gastos, KEYS.notas, KEYS.cuotas,
   KEYS.recurrentes, KEYS.ahorros, KEYS.inversiones, KEYS.medios].forEach(
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

// Empuja a Supabase sin bloquear la UI. Un fallo no rompe nada (local-first),
// pero sí queda en consola: cuando faltaba la columna `tarjeta` en `gastos`,
// cada upsert fallaba en silencio y no había forma de darse cuenta.
function push(consulta, contexto) {
  consulta.then(
    (res) => {
      if (res && res.error) console.warn(`[sync] ${contexto}:`, res.error.message);
    },
    (err) => console.warn(`[sync] ${contexto}:`, (err && err.message) || err)
  );
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
  push(
    supabase
      .from('foco_sessions')
      .upsert(toRemote(session), { onConflict: 'start_ts', ignoreDuplicates: true }),
    'foco_sessions upsert'
  );
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
  push(
    supabase
      .from('foco_active')
      .upsert({
        user_id: currentUid,
        start_ts: session ? new Date(session.startTs).toISOString() : null,
        duration_min: session ? session.durationMin : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }),
    'foco_active upsert'
  );
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
      supabase.from('recurrentes').select('*'),
      supabase.from('ahorros').select('*'),
      supabase.from('medios_pago').select('*'),
      supabase.from('inversiones').select('*'),
    ]);
    const timeout = new Promise((_, rej) => setTimeout(rej, 3500, 'timeout'));
    const [sess, act, gastosR, notasR, cuotasR, recuR, ahoR, medR, invR] = await Promise.race([pull, timeout]);
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
    // Recurrentes se editan (subís el monto del alquiler): last-write-wins por `updated`.
    if (recuR.data) mergeListPull('recurrentes', KEYS.recurrentes, recuR.data, fromRemoteRecurrente, toRemoteRecurrente,
      (local, remote) => local.updated > Date.parse(remote.updated_at));
    if (ahoR.data) mergeListPull('ahorros', KEYS.ahorros, ahoR.data, fromRemoteAhorro, toRemoteAhorro);
    // Medios de pago: se editan (cargás el día de cierre real), last-write-wins por `updated`.
    if (medR.data) mergeListPull('medios_pago', KEYS.medios, medR.data, fromRemoteMedio, toRemoteMedio,
      (local, remote) => local.updated > Date.parse(remote.updated_at));
    // La tabla `inversiones` es nueva: si todavía no corriste el SQL, esto
    // devuelve error y la app sigue andando con el módulo vacío en vez de
    // romper el pull entero de las demás tablas.
    if (invR?.data) mergeListPull('inversiones', KEYS.inversiones, invR.data, fromRemoteInversion, toRemoteInversion);
    else if (invR?.error) console.warn('[sync] inversiones:', invR.error.message, '— ¿falta correr supabase/inversiones-setup.sql?');
  } catch (err) {
    // Offline o timeout es esperable y la app sigue andando con lo local; lo
    // logueamos igual para poder distinguirlo de un error real del servidor.
    console.warn('[sync] pull inicial:', err === 'timeout' ? 'timeout, seguimos con datos locales' : err);
  }

  // Realtime idempotente: si initSync corre más de una vez (p. ej. reintento de
  // login o re-arranque sin reload), removemos los canales previos antes de
  // recrearlos. Las versiones nuevas de supabase-js tiran
  // "cannot add postgres_changes callbacks ... after subscribe()" si se hace
  // .on() sobre un canal que ya existe y está suscripto (reusar el mismo nombre
  // devolvía ese canal ya vivo). Limpiar primero evita el error.
  await supabase.removeAllChannels();

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
  suscribirLista('recurrentes', KEYS.recurrentes, fromRemoteRecurrente, 'recurrentes');
  suscribirLista('ahorros', KEYS.ahorros, fromRemoteAhorro, 'ahorros');
  suscribirLista('medios_pago', KEYS.medios, fromRemoteMedio, 'medios_pago');
  suscribirLista('inversiones', KEYS.inversiones, fromRemoteInversion, 'inversiones');
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
  moneda: g.moneda || 'ARS',
  fecha: g.fecha,
  // null = gasto propio. 'pendiente'/'cobrado' = lo pagaste por otro.
  reintegro: g.reintegro || null,
  reintegro_de: g.reintegro_de || null,
  created_at: new Date(g.ts).toISOString(),
});
const fromRemoteGasto = (r) => ({
  id: r.id,
  monto: Number(r.monto),
  descripcion: r.descripcion || '',
  categoria: r.categoria,
  tarjeta: r.tarjeta || null,
  moneda: r.moneda || 'ARS',   // los gastos viejos vienen sin moneda: son pesos
  fecha: r.fecha,
  reintegro: r.reintegro || null,
  reintegro_de: r.reintegro_de || '',
  ts: Date.parse(r.created_at),
});

export function getGastos() {
  return read(KEYS.gastos, []);
}

export function addGasto(gasto) {
  const all = getGastos();
  all.push(gasto);
  write(KEYS.gastos, all);
  push(supabase.from('gastos').upsert(toRemoteGasto(gasto), { onConflict: 'id' }), 'gastos upsert');
  return gasto;
}

export function removeGasto(id) {
  write(KEYS.gastos, getGastos().filter((g) => g.id !== id));
  push(supabase.from('gastos').delete().eq('id', id), 'gastos delete');
}

/** Cambios puntuales sobre un gasto ya cargado (hoy: recategorizar). */
export function updateGasto(id, cambios) {
  const actualizado = getGastos().map((g) => (g.id === id ? { ...g, ...cambios } : g));
  write(KEYS.gastos, actualizado);
  push(supabase.from('gastos').update(cambios).eq('id', id), 'gastos update');
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
  push(supabase.from('notas').upsert(toRemoteNota(nota), { onConflict: 'id' }), 'notas upsert');
  return nota;
}

export function removeNota(id) {
  write(KEYS.notas, getNotas().filter((n) => n.id !== id));
  push(supabase.from('notas').delete().eq('id', id), 'notas delete');
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
      push(supabase.from(tableName).upsert(toRemote(l), { onConflict: 'id' }), `${tableName} re-push (local más nuevo)`);
      resultado.push(l);
    } else {
      resultado.push(fromRemote(r));
    }
  }

  // Ítems creados offline en este dispositivo (no están en el server): empujar y conservar
  for (const l of local) {
    if (!remoteIds.has(l.id)) {
      push(supabase.from(tableName).upsert(toRemote(l), { onConflict: 'id' }), `${tableName} push (creado offline)`);
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
  moneda: c.moneda || 'ARS',
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
  moneda: r.moneda || 'ARS',   // las cuotas viejas no tienen el campo: son pesos
  created_at: r.created_at,
});

export function getCuotas() {
  return read(KEYS.cuotas, []);
}

export function addCuota(cuota) {
  const all = getCuotas();
  all.push(cuota);
  write(KEYS.cuotas, all);
  push(supabase.from('cuotas').upsert(toRemoteCuota(cuota), { onConflict: 'id' }), 'cuotas upsert');
  return cuota;
}

export function removeCuota(id) {
  write(KEYS.cuotas, getCuotas().filter((c) => c.id !== id));
  push(supabase.from('cuotas').delete().eq('id', id), 'cuotas delete');
}

export function updateCuotaEstado(id, estado) {
  const all = getCuotas().map((c) => c.id === id ? { ...c, estado } : c);
  write(KEYS.cuotas, all);
  push(supabase.from('cuotas').update({ estado }).eq('id', id), 'cuotas update estado');
}

/**
 * Cambios sobre una cuota ya cargada. Lo usa el circuito de "ya pagué":
 * avanzar `cuota_actual` y correr `fecha_primer_venc` un mes es lo que hace
 * que la deuda baje de verdad y no sólo por el paso del calendario.
 */
export function updateCuota(id, cambios) {
  const all = getCuotas().map((c) => (c.id === id ? { ...c, ...cambios } : c));
  write(KEYS.cuotas, all);
  push(supabase.from('cuotas').update(cambios).eq('id', id), 'cuotas update');
}

// --- Recurrentes: ingresos, gastos fijos y suscripciones ---
// Un renglón por concepto que se repite todos los meses. `historial` guarda
// cuánto valió cada mes ({"2026-07": 480000}), que es lo que después permite
// ver qué subió y qué bajó sin depender de la memoria.

const toRemoteRecurrente = (r) => ({
  id: r.id,
  tipo: r.tipo,
  nombre: r.nombre,
  categoria: r.categoria || null,
  monto: r.monto,
  moneda: r.moneda || 'ARS',
  dia: r.dia ?? null,
  medio: r.medio || null,
  estado: r.estado || 'activo',
  coincide: r.coincide || null,
  historial: r.historial || {},
  created_at: r.created_at,
  updated_at: new Date(r.updated).toISOString(),
});
const fromRemoteRecurrente = (r) => ({
  id: r.id,
  tipo: r.tipo,
  nombre: r.nombre,
  categoria: r.categoria || '',
  monto: Number(r.monto),
  moneda: r.moneda || 'ARS',
  dia: r.dia ?? null,
  medio: r.medio || '',
  estado: r.estado || 'activo',
  coincide: r.coincide || '',
  historial: r.historial || {},
  created_at: r.created_at,
  updated: Date.parse(r.updated_at),
});

export function getRecurrentes() {
  return read(KEYS.recurrentes, []);
}

export function upsertRecurrente(rec) {
  const item = { ...rec, updated: Date.now() };
  const all = getRecurrentes().filter((r) => r.id !== item.id);
  all.push(item);
  write(KEYS.recurrentes, all);
  push(supabase.from('recurrentes').upsert(toRemoteRecurrente(item), { onConflict: 'id' }), 'recurrentes upsert');
  return item;
}

export function removeRecurrente(id) {
  write(KEYS.recurrentes, getRecurrentes().filter((r) => r.id !== id));
  push(supabase.from('recurrentes').delete().eq('id', id), 'recurrentes delete');
}

// --- Ahorros: movimientos (aportes y retiros), no saldo ---
// El stock se calcula sumando; así queda el rastro de cuándo pusiste plata y
// cuándo tuviste que sacarla.

const toRemoteAhorro = (a) => ({
  id: a.id,
  fecha: a.fecha,
  monto: a.monto,
  moneda: a.moneda || 'ARS',
  tipo: a.tipo || 'aporte',
  destino: a.destino || null,
  nota: a.nota || null,
  created_at: new Date(a.ts).toISOString(),
});
const fromRemoteAhorro = (r) => ({
  id: r.id,
  fecha: r.fecha,
  monto: Number(r.monto),
  moneda: r.moneda || 'ARS',
  tipo: r.tipo || 'aporte',
  destino: r.destino || '',
  nota: r.nota || '',
  ts: Date.parse(r.created_at),
});

export function getAhorros() {
  return read(KEYS.ahorros, []);
}

export function addAhorro(mov) {
  const all = getAhorros();
  all.push(mov);
  write(KEYS.ahorros, all);
  push(supabase.from('ahorros').upsert(toRemoteAhorro(mov), { onConflict: 'id' }), 'ahorros upsert');
  return mov;
}

export function removeAhorro(id) {
  write(KEYS.ahorros, getAhorros().filter((a) => a.id !== id));
  push(supabase.from('ahorros').delete().eq('id', id), 'ahorros delete');
}

// --- Inversiones: operaciones, no saldo ---
// Una fila por operación del broker. La distinción que importa: `bruto` es lo
// que quedó invertido (cantidad × precio) y `neto` lo que salió de tu caja
// (bruto + comisiones + gastos). La diferencia es costo de transacción, y es
// plata que no vuelve — por eso se guarda separada en vez de sumarla al costo.

const toRemoteInversion = (i) => ({
  id: i.id,
  fecha: i.fecha,
  tipo: i.tipo,
  instrumento: i.instrumento,
  clase: i.clase || null,
  cantidad: i.cantidad,
  precio_unitario: i.precio_unitario,
  moneda: i.moneda || 'ARS',
  comisiones: i.comisiones || 0,
  gastos_op: i.gastos_op || 0,
  broker: i.broker || null,
  nota: i.nota || null,
  tesis: i.tesis || null,
  precio_objetivo: i.precio_objetivo ?? null,
  fecha_objetivo: i.fecha_objetivo || null,
  invalidacion: i.invalidacion || null,
  created_at: new Date(i.ts).toISOString(),
});
const fromRemoteInversion = (r) => ({
  id: r.id,
  fecha: r.fecha,
  tipo: r.tipo,
  instrumento: r.instrumento,
  clase: r.clase || '',
  cantidad: Number(r.cantidad),
  precio_unitario: Number(r.precio_unitario),
  moneda: r.moneda || 'ARS',
  comisiones: Number(r.comisiones) || 0,
  gastos_op: Number(r.gastos_op) || 0,
  broker: r.broker || '',
  nota: r.nota || '',
  tesis: r.tesis || '',
  precio_objetivo: r.precio_objetivo != null ? Number(r.precio_objetivo) : null,
  fecha_objetivo: r.fecha_objetivo || '',
  invalidacion: r.invalidacion || '',
  ts: Date.parse(r.created_at),
});

export function getInversiones() {
  return read(KEYS.inversiones, []);
}

export function addInversion(op) {
  const all = getInversiones();
  all.push(op);
  write(KEYS.inversiones, all);
  push(supabase.from('inversiones').upsert(toRemoteInversion(op), { onConflict: 'id' }), 'inversiones upsert');
  return op;
}

export function removeInversion(id) {
  write(KEYS.inversiones, getInversiones().filter((i) => i.id !== id));
  push(supabase.from('inversiones').delete().eq('id', id), 'inversiones delete');
}

// --- Medios de pago: bancos + tarjetas, con día de cierre y vencimiento ---
// Reemplaza los valores fijos que antes vivían hardcodeados en cuotas.js/
// fincore.js/gastos.js. Se puede ampliar desde la app (nuevo banco, nueva
// tarjeta) sin tocar código.

const toRemoteMedio = (m) => ({
  id: m.id,
  banco: m.banco || null,
  nombre: m.nombre,
  key: m.key,
  dia_cierre: m.diaCierre ?? null,
  dia_vencimiento: m.diaVencimiento ?? null,
  activo: m.activo !== false,
  created_at: m.created_at,
  updated_at: new Date(m.updated).toISOString(),
});
const fromRemoteMedio = (r) => ({
  id: r.id,
  banco: r.banco || '',
  nombre: r.nombre,
  key: r.key,
  diaCierre: r.dia_cierre ?? null,
  diaVencimiento: r.dia_vencimiento ?? null,
  activo: r.activo !== false,
  created_at: r.created_at,
  updated: Date.parse(r.updated_at),
});

export function getMediosPago() {
  return read(KEYS.medios, []);
}

export function upsertMedioPago(medio) {
  const item = { ...medio, updated: Date.now() };
  const all = getMediosPago().filter((m) => m.id !== item.id);
  all.push(item);
  write(KEYS.medios, all);
  push(supabase.from('medios_pago').upsert(toRemoteMedio(item), { onConflict: 'id' }), 'medios_pago upsert');
  return item;
}

export function removeMedioPago(id) {
  write(KEYS.medios, getMediosPago().filter((m) => m.id !== id));
  push(supabase.from('medios_pago').delete().eq('id', id), 'medios_pago delete');
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
