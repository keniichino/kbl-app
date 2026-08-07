// ====== Núcleo de cálculo financiero ======
// Lógica pura, sin DOM: la comparten el Panel (que la pinta) y el motor de
// Detecciones (que la audita). Vive acá para que no existan dos versiones de
// "cuánto valió el alquiler en junio" que se puedan desincronizar.

// ---------- Formato ----------

export const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
export const fmtUSD = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
export const fmtMoneda = (m, moneda) => (moneda === 'USD' ? fmtUSD : fmtARS).format(m);

/** Abreviado para lugares angostos ($ 1,2 M). En tablas siempre va completo. */
export function fmtCorto(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return '$ ' + (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
  if (abs >= 1e4) return '$ ' + Math.round(n / 1e3) + ' k';
  return fmtARS.format(n);
}

export const pct = (n) => (n * 100).toFixed(n >= 0.1 || n <= -0.1 ? 0 : 1).replace('.', ',') + '%';

/**
 * Magnitud de un cambio. Arriba de 3x el porcentaje deja de decir algo
 * ("500% por encima"), así que ahí se pasa a múltiplo: "×6,0".
 */
export function variacion(actual, previo) {
  const p = (actual - previo) / Math.abs(previo);
  return Math.abs(p) > 3
    ? '×' + Math.abs(actual / previo).toFixed(1).replace('.', ',')
    : pct(Math.abs(p));
}

export function escapar(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- Meses y fechas ----------

export const pad2 = (n) => String(n).padStart(2, '0');
export const mesDeFecha = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const MES_HOY = mesDeFecha(new Date());

// Fecha local, NO toISOString(): a la noche en Argentina el UTC ya es el día
// siguiente y el movimiento quedaba fechado mañana.
export const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function addMes(key, n) {
  const [y, m] = key.split('-').map(Number);
  return mesDeFecha(new Date(y, m - 1 + n, 1));
}

export function addMesesFecha(fechaIso, n) {
  const d = new Date(fechaIso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export const diasEntre = (isoA, isoB) =>
  Math.round((new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / 86400000);

// A mano y no con toLocaleDateString: el formato largo de es-AR es
// "agosto de 2026" y el capitalize del CSS lo deja en "Agosto De 2026".
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function labelMes(key, { corto = false } = {}) {
  const [y, m] = key.split('-').map(Number);
  return corto ? MESES_CORTOS[m - 1] : `${MESES[m - 1]} ${y}`;
}

/** "martes 4" / "hoy" / "ayer" — para hablar de un día sin sonar a sistema. */
export function labelDia(iso) {
  const d = new Date(iso + 'T00:00:00');
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dif = Math.round((hoy - d) / 86400000);
  if (dif === 0) return 'hoy';
  if (dif === 1) return 'ayer';
  return `${DIAS[d.getDay()]} ${d.getDate()}`;
}

// ---------- Plata en dos monedas ----------
// Pesos y dólares nunca se suman a ciegas: se acumulan por separado y el
// equivalente se calcula recién al mostrar, con la cotización elegida.

export const cero = () => ({ ars: 0, usd: 0 });

export const sumar = (acc, monto, moneda) => {
  if (moneda === 'USD') acc.usd += monto; else acc.ars += monto;
  return acc;
};

export const masMontos = (...vs) =>
  vs.reduce((a, v) => ({ ars: a.ars + v.ars, usd: a.usd + v.usd }), cero());

export const hayUsd = (v) => v.usd > 0.005;

// ---------- Catálogos ----------

// Tarjetas de crédito: sus consumos se pagan por resumen, o sea por `cuotas`.
// En base CAJA no se cuentan como gasto del mes (si no, se duplican).
export const TARJETAS_CREDITO = new Set(['visa', 'mac', 'mp']);

export const MEDIOS = [
  { key: 'visa', emoji: '💳', label: 'Visa' },
  { key: 'mac', emoji: '⬛', label: 'Mac' },
  { key: 'mp', emoji: '🔵', label: 'MP' },
  { key: 'debito', emoji: '🏦', label: 'Débito' },
  { key: 'efectivo', emoji: '💵', label: 'Efectivo' },
];
export const medioDe = (k) => MEDIOS.find((m) => m.key === k);

export const TIPOS = {
  ingreso: { label: 'Ingreso', emoji: '💰' },
  fijo: { label: 'Gasto fijo', emoji: '🏠' },
  suscripcion: { label: 'Suscripción', emoji: '🔁' },
};

// ---------- Matcheo gasto ↔ concepto ----------

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Palabras que identifican al concepto dentro de la descripción de un gasto. */
export function llavesDe(r) {
  return (r.coincide ? r.coincide.split(',') : [r.nombre])
    .map(norm).filter((k) => k.length >= 3);
}

/**
 * Mapa gastoId → recurrenteId. Un gasto que matchea un concepto declarado ya
 * está contado por el concepto: no se vuelve a sumar como variable, y además
 * sirve para que el historial del concepto salga del gasto real y no de lo
 * declarado a mano.
 */
export function matchear(gastos, recurrentes) {
  const conceptos = recurrentes
    .filter((r) => r.tipo !== 'ingreso')
    .map((r) => ({ r, llaves: llavesDe(r) }))
    .filter((c) => c.llaves.length);
  const mapa = new Map();
  if (!conceptos.length) return mapa;
  for (const g of gastos) {
    const d = norm(g.descripcion);
    if (!d) continue;
    const hit = conceptos.find((c) => c.llaves.some((k) => d.includes(k)));
    if (hit) mapa.set(g.id, hit.r.id);
  }
  return mapa;
}

// ---------- Recurrentes: cuánto valió cada mes ----------

/**
 * Vale para ese mes: activo desde su alta, o pausado pero con historial.
 * Si le pasás el contexto, también vale cuando hay gastos de ese mes que
 * matchean el concepto: un fijo que declaraste hoy pero venías pagando hace
 * medio año tiene que mostrar ese medio año, no arrancar en cero.
 */
export function vigenteEn(r, mes, ctx) {
  const h = r.historial || {};
  if (h[mes] != null) return true;
  if (ctx && (ctx.gastosPorMes.get(mes) || []).some((g) => ctx.match.get(g.id) === r.id)) return true;
  if (r.estado !== 'activo') return false;
  const alta = (r.created_at || '').slice(0, 7);
  return !alta || mes >= alta;
}

/** Monto declarado para ese mes: el del historial, si no el último anterior, si no el vigente. */
export function montoDeclarado(r, mes) {
  const h = r.historial || {};
  if (h[mes] != null) return Number(h[mes]) || 0;
  const previas = Object.keys(h).filter((k) => k < mes).sort();
  if (previas.length) return Number(h[previas[previas.length - 1]]) || 0;
  return Number(r.monto) || 0;
}

/** Monto efectivo del mes: si hay gastos cargados que matchean, mandan ellos. */
export function montoEn(r, mes, ctx) {
  const reales = (ctx.gastosPorMes.get(mes) || []).filter(
    (g) => ctx.match.get(g.id) === r.id && (g.moneda || 'ARS') === r.moneda
  );
  if (reales.length) return reales.reduce((a, g) => a + g.monto, 0);
  return montoDeclarado(r, mes);
}

/** Todo el historial declarado, ordenado por mes. Un ingreso (ej. sueldo) no
 * tiene gasto que lo matchee, así que esto es la única fuente de verdad. */
export function historialCompleto(r) {
  return Object.entries(r.historial || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, monto]) => ({ mes, monto: Number(monto) || 0 }));
}

/** Sólo los meses donde el monto cambió de verdad — los aumentos reales,
 * no cada mes que se repite el mismo valor. */
export function hitosDeAumento(r) {
  const serie = historialCompleto(r);
  const hitos = [];
  let previo = null;
  for (const { mes, monto } of serie) {
    if (previo != null && monto !== previo) hitos.push({ mes, monto, previo });
    previo = monto;
  }
  return hitos;
}

// ---------- Cuotas: calendario completo ----------

/**
 * `fecha_primer_venc` es el vencimiento de `cuota_actual` (la próxima a pagar),
 * así que el plan entero se reconstruye hacia atrás y hacia adelante. Las
 * cuotas anteriores a `cuota_actual` sirven para graficar la carga de deuda
 * que YA pagaste.
 *
 * OJO — sólo se reconstruye hacia atrás para meses ya cerrados. Del mes
 * corriente en adelante se cuenta exactamente lo mismo que el módulo Cuotas
 * (de `cuota_actual` para arriba). Sin esa guarda, una cuota que vence el 1°
 * del mes que viene metía su cuota anterior en el mes actual y el Panel
 * mostraba $2.087.600 donde Cuotas mostraba $1.924.600: dos pantallas de la
 * misma app contradiciéndose, que es peor que un número redondeado de más.
 */
export function calendarioCuotas(cuotas) {
  const porMes = new Map();
  for (const c of cuotas) {
    if (c.estado !== 'activa') continue;
    for (let n = 1; n <= c.cuota_total; n++) {
      const mes = addMesesFecha(c.fecha_primer_venc, n - c.cuota_actual);
      if (n < c.cuota_actual && mes >= MES_HOY) continue;   // ya pagada, no la cobran nunca más
      if (!porMes.has(mes)) porMes.set(mes, { ...cero(), items: [] });
      const acc = porMes.get(mes);
      sumar(acc, c.monto_cuota, c.moneda);
      acc.items.push({ desc: c.descripcion, n, total: c.cuota_total, monto: c.monto_cuota, moneda: c.moneda, tarjeta: c.tarjeta });
    }
  }
  return porMes;
}

/**
 * A qué período de facturación pertenece un gasto, según el día de cierre
 * del medio con el que se pagó (ej. Visa cierra el 6 → un gasto del 7 ya es
 * del período siguiente). Sin medio, o sin día de cierre configurado en ese
 * medio, es el mes calendario de siempre — cero cambio de comportamiento
 * hasta que el día de cierre real se cargue en "Bancos y tarjetas".
 */
export function periodoDeGasto(fechaIso, medio) {
  const mesCalendario = fechaIso.slice(0, 7);
  if (!medio || medio.diaCierre == null) return mesCalendario;
  const dia = Number(fechaIso.slice(8, 10));
  return dia > medio.diaCierre ? addMesesFecha(fechaIso, 1) : mesCalendario;
}

// ---------- Contexto y foto del mes ----------

/** Índices y mapas que usan todos los cálculos. Se arma una vez por render.
 * `medios`: lista de medios de pago (ver medios-credito.js) para resolver el
 * día de cierre de cada gasto con tarjeta; opcional, sin ella se comporta
 * como antes (mes calendario puro). */
export function contexto({ gastos, cuotas, recurrentes, ahorros, medios = [] }) {
  const gastosPorMes = new Map();
  for (const g of gastos) {
    const medio = medios.find((md) => md.key === g.tarjeta);
    const m = periodoDeGasto(g.fecha, medio);
    if (!gastosPorMes.has(m)) gastosPorMes.set(m, []);
    gastosPorMes.get(m).push(g);
  }
  return {
    gastos, cuotas, recurrentes, ahorros, gastosPorMes,
    match: matchear(gastos, recurrentes),
    calCuotas: calendarioCuotas(cuotas),
  };
}

/**
 * Todo lo del mes, en las dos bases de cálculo (ver panel.js para el porqué):
 * caja = lo que sale del bolsillo; consumo = lo que consumiste.
 */
export function fotoDelMes(mes, ctx, base = 'caja') {
  const ingresos = cero(), fijos = cero(), subs = cero();
  const varCaja = cero(), varConsumo = cero(), aportes = cero(), retiros = cero();
  const filasFijos = [], filasSubs = [], filasIngresos = [];

  for (const r of ctx.recurrentes) {
    if (!vigenteEn(r, mes, ctx)) continue;
    const m = montoEn(r, mes, ctx);
    if (!m) continue;
    if (r.tipo === 'ingreso') { sumar(ingresos, m, r.moneda); filasIngresos.push({ r, monto: m }); }
    else if (r.tipo === 'suscripcion') { sumar(subs, m, r.moneda); filasSubs.push({ r, monto: m }); }
    else { sumar(fijos, m, r.moneda); filasFijos.push({ r, monto: m }); }
  }

  for (const g of (ctx.gastosPorMes.get(mes) || [])) {
    if (ctx.match.has(g.id)) continue;               // ya contado como concepto
    sumar(varConsumo, g.monto, g.moneda);
    if (!TARJETAS_CREDITO.has(g.tarjeta)) sumar(varCaja, g.monto, g.moneda);
  }

  const cuotas = ctx.calCuotas.get(mes) || cero();

  for (const a of ctx.ahorros) {
    if (a.fecha.slice(0, 7) !== mes) continue;
    sumar(a.tipo === 'retiro' ? retiros : aportes, a.monto, a.moneda);
  }

  const estructural = masMontos(fijos, subs);
  const egresoCaja = masMontos(estructural, cuotas, varCaja);
  const egresoConsumo = masMontos(estructural, varConsumo);
  const egreso = base === 'caja' ? egresoCaja : egresoConsumo;
  const variable = base === 'caja' ? varCaja : varConsumo;

  return {
    mes, ingresos, fijos, subs, estructural, cuotas,
    varCaja, varConsumo, variable, egreso, egresoCaja, egresoConsumo,
    aportes, retiros,
    disponible: { ars: ingresos.ars - egreso.ars, usd: ingresos.usd - egreso.usd },
    filasFijos, filasSubs, filasIngresos,
  };
}

/** Saldo de deuda: todas las cuotas que quedan por pagar desde `mes` inclusive. */
export function deudaPendiente(mes, cal) {
  const acc = cero();
  for (const [m, v] of cal) if (m >= mes) { acc.ars += v.ars; acc.usd += v.usd; }
  return acc;
}
