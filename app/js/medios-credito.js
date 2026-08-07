// ====== Medios de pago con ciclo de facturación ======
// Bancos + tarjetas de crédito, cada uno con SU día de cierre y SU día de
// vencimiento (ej. Galicia Visa cierra el 6, Mercado Pago otro día). Única
// fuente de verdad para cuotas.js, gastos.js y fincore.js — antes cada uno
// tenía su propia copia hardcodeada de la lista de tarjetas.
//
// No confundir con MEDIOS/medioDe de fincore.js: eso es "cómo pagás este
// gasto fijo" (efectivo, débito, tarjeta...) para los `recurrentes`. Esto es
// específicamente las tarjetas de crédito que tienen resumen y cierre.

import { getMediosPago, upsertMedioPago, removeMedioPago } from './store.js';
import { norm } from './fincore.js';

// Antes de la primera sync (o instalación nueva sin red todavía) los
// selectores no pueden quedar vacíos. Son sólo para MOSTRAR — nunca se editan
// ni se les hace upsert con este id falso.
const FALLBACK = [
  { id: null, banco: 'Galicia', nombre: 'Visa', key: 'visa', diaCierre: null, diaVencimiento: null, activo: true },
  { id: null, banco: 'Galicia', nombre: 'Mastercard', key: 'mac', diaCierre: null, diaVencimiento: null, activo: true },
  { id: null, banco: 'Mercado Pago', nombre: 'Mercado Pago', key: 'mp', diaCierre: null, diaVencimiento: null, activo: true },
  { id: null, banco: '', nombre: 'Efectivo', key: 'efectivo', diaCierre: null, diaVencimiento: null, activo: true },
];

const EMOJIS = { visa: '💳', mac: '⬛', mp: '🔵', efectivo: '💵' };
const emojiDe = (key) => EMOJIS[key] || '🏦';

/** Lo que pintan los selectores de tarjeta (chips en Gastos/Cuotas). Sólo lectura. */
export function mediosCredito() {
  const propios = getMediosPago();
  const base = propios.length ? propios : FALLBACK;
  return base.filter((m) => m.activo !== false).map((m) => ({ ...m, emoji: emojiDe(m.key) }));
}

export function medioCreditoPorKey(key) {
  return mediosCredito().find((m) => m.key === key) || null;
}

/** Agrupados por banco, para la administración en el Panel. Sin fallback:
 * si todavía no sincronizó nada real, se muestra vacío en vez de datos que
 * no se pueden editar. */
export function mediosCreditoPorBanco() {
  const grupos = new Map();
  for (const m of getMediosPago().filter((m) => m.activo !== false)) {
    const banco = m.banco || 'Sin banco';
    if (!grupos.has(banco)) grupos.set(banco, []);
    grupos.get(banco).push({ ...m, emoji: emojiDe(m.key) });
  }
  return grupos;
}

const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Nuevo banco/tarjeta. El `key` se genera del nombre y no se repite. */
export function crearMedioCredito({ banco, nombre, diaCierre, diaVencimiento }) {
  const base = slug(nombre) || 'medio';
  const existentes = new Set(getMediosPago().map((m) => m.key));
  let key = base, n = 2;
  while (existentes.has(key)) key = `${base}-${n++}`;
  return upsertMedioPago({
    id: crypto.randomUUID(),
    banco: banco || '',
    nombre,
    key,
    diaCierre: diaCierre ?? null,
    diaVencimiento: diaVencimiento ?? null,
    activo: true,
    created_at: new Date().toISOString(),
  });
}

export function actualizarMedioCredito(id, cambios) {
  const actual = getMediosPago().find((m) => m.id === id);
  if (!actual) return null;
  return upsertMedioPago({ ...actual, ...cambios });
}

export function borrarMedioCredito(id) {
  removeMedioPago(id);
}
