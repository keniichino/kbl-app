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

export const menosMontos = (a, b) => ({ ars: a.ars - b.ars, usd: a.usd - b.usd });

export const hayUsd = (v) => v.usd > 0.005;

// ---------- Catálogos ----------

// Tarjetas de crédito: sus consumos se pagan por resumen, o sea por `cuotas`.
// En base CAJA no se cuentan como gasto del mes (si no, se duplican).
export const TARJETAS_CREDITO = new Set(['visa', 'mac', 'mp']);

// Lo que NUNCA es crédito, por más que aparezca en la lista de medios.
const NO_CREDITO = new Set(['efectivo', 'debito', 'transferencia', 'caja']);

/**
 * Set de medios que se pagan por resumen. Arranca del legacy hardcodeado y se
 * amplía con las tarjetas que Keni haya cargado en "Bancos y tarjetas": una
 * Amex nueva tiene que duplicar tan poco como la Visa de siempre.
 */
export function setDeCredito(medios = []) {
  const s = new Set(TARJETAS_CREDITO);
  for (const m of medios) {
    if (NO_CREDITO.has(m.key)) { s.delete(m.key); continue; }
    s.add(m.key);
  }
  return s;
}

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
 * así que el plan entero se reconstruye hacia atrás y hacia adelante.
 *
 * Esto es un calendario de CAJA: cada cuota va en el mes en que se cobró o se
 * va a cobrar, esté paga o no. Las que ya pagaste llevan `pagada: true` para
 * que `deudaPendiente()` no las cuente como deuda — son dos preguntas
 * distintas ("cuánto salió en agosto" vs "cuánto debo").
 *
 * Una cuota ya paga nunca puede caer en un mes FUTURO: si pasa, la fecha del
 * plan está mal cargada y contarla inventaría plata. En el mes corriente sí
 * va: la pagaste hace unos días y salió de tu bolsillo igual. (Antes el corte
 * era `>= MES_HOY` y por eso los $383.889 del resumen de Mercado Pago pagado
 * el 10/08 no aparecían en ningún lado.)
 */
export function calendarioCuotas(cuotas) {
  const porMes = new Map();
  for (const c of cuotas) {
    for (let n = 1; n <= c.cuota_total; n++) {
      const mes = addMesesFecha(c.fecha_primer_venc, n - c.cuota_actual);
      const pagada = n < c.cuota_actual || c.estado !== 'activa';
      if (pagada && mes > MES_HOY) continue;
      if (!porMes.has(mes)) porMes.set(mes, { ...cero(), items: [] });
      const acc = porMes.get(mes);
      sumar(acc, c.monto_cuota, c.moneda);
      acc.items.push({ desc: c.descripcion, n, total: c.cuota_total, monto: c.monto_cuota, moneda: c.moneda, tarjeta: c.tarjeta, pagada });
    }
  }
  return porMes;
}

/**
 * Total real que se paga de una tarjeta en un período de facturación: cuotas
 * que vencen ese mes + compras en un pago hechas en ese período (sin
 * reintegros). Antes este cálculo sólo lo hacía la alerta de vencimiento, y
 * sólo a 6 días del vencimiento — acá se puede pedir para cualquier tarjeta y
 * cualquier período, pasado, presente o futuro (para eso están los dos
 * índices de `contexto()`).
 *
 * `soloPendiente` saca las cuotas que ya se marcaron pagadas (para la alerta
 * de vencimiento, que sólo quiere avisar por lo que falta). Los gastos no
 * tienen ese concepto — se resuelve a nivel resumen con `pagos_resumen`, no acá.
 */
export function resumenPeriodo(tarjeta, periodo, ctx, { soloPendiente = false } = {}) {
  const cuotas = cero();
  const compras = cero();
  for (const i of (ctx.calCuotas.get(periodo)?.items || [])) {
    if (i.tarjeta !== tarjeta) continue;
    if (soloPendiente && i.pagada) continue;
    sumar(cuotas, i.monto, i.moneda);
  }
  for (const g of (ctx.gastosPorPeriodo?.get(periodo) || [])) {
    if (g.tarjeta !== tarjeta || g.reintegro) continue;
    sumar(compras, g.monto, g.moneda);
  }
  return { cuotas, compras, total: masMontos(cuotas, compras) };
}

/**
 * Vencimiento real de la cuota que toca este mes, por tarjeta. Sale del día
 * de vencimiento configurado en el medio; si no está cargado, del día que
 * traiga `fecha_primer_venc`. Devuelve Map tarjeta → { iso, dia, monto }.
 */
export function vencimientosDelMes(mes, cuotas, medios = []) {
  const out = new Map();
  for (const c of cuotas) {
    if (c.estado !== 'activa') continue;
    const mesCuota = addMesesFecha(c.fecha_primer_venc, 0);
    if (mesCuota !== mes) continue;
    const medio = medios.find((m) => m.key === c.tarjeta);
    const dia = medio?.diaVencimiento ?? Number(c.fecha_primer_venc.slice(8, 10));
    if (!out.has(c.tarjeta)) {
      const [y, m] = mes.split('-').map(Number);
      // Día 31 en un mes de 30 cae al 1° del siguiente: lo clampeamos al último.
      const ultimo = new Date(y, m, 0).getDate();
      const d = Math.min(dia, ultimo);
      out.set(c.tarjeta, { iso: `${mes}-${pad2(d)}`, dia: d, monto: cero(), cuotas: [] });
    }
    const acc = out.get(c.tarjeta);
    sumar(acc.monto, c.monto_cuota, c.moneda);
    acc.cuotas.push(c);
  }
  return out;
}

/**
 * Cuotas cuyo vencimiento YA pasó y siguen marcadas como no pagadas. Mientras
 * estén así, `cuota_actual` miente ("2 de 9" cuando vas por la 3) y el saldo
 * de deuda queda inflado. Es la razón por la que la deuda "no bajaba sola".
 */
export function cuotasVencidasSinPagar(cuotas, medios = [], hoy = hoyIso()) {
  const out = [];
  for (const c of cuotas) {
    if (c.estado !== 'activa') continue;
    const medio = medios.find((m) => m.key === c.tarjeta);
    const mesVenc = c.fecha_primer_venc.slice(0, 7);
    const dia = medio?.diaVencimiento ?? Number(c.fecha_primer_venc.slice(8, 10));
    const [y, m] = mesVenc.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    const iso = `${mesVenc}-${pad2(Math.min(dia, ultimo))}`;
    const dias = diasEntre(iso, hoy);
    if (dias > 0) out.push({ cuota: c, venc: iso, diasPasados: dias });
  }
  return out;
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
 *
 * Son DOS índices porque las dos bases preguntan cosas distintas:
 *   · `gastosPorMes`     → mes calendario. Cuándo consumiste. Base CONSUMO.
 *   · `gastosPorPeriodo` → período de facturación. Cuándo lo cobra el resumen,
 *                          o sea cuándo sale del bolsillo. Base CAJA.
 * Sin día de cierre cargado en el medio los dos índices son idénticos, así que
 * mientras "Bancos y tarjetas" esté vacío no cambia nada.
 *
 * `medios`: lista de medios de pago (ver medios-credito.js) para resolver el
 * día de cierre de cada gasto con tarjeta; opcional. */
export function contexto({ gastos, cuotas, recurrentes, ahorros, medios = [], inversiones = [] }) {
  const gastosPorMes = new Map();
  const gastosPorPeriodo = new Map();
  for (const g of gastos) {
    const medio = medios.find((md) => md.key === g.tarjeta);
    const cal = g.fecha.slice(0, 7);
    if (!gastosPorMes.has(cal)) gastosPorMes.set(cal, []);
    gastosPorMes.get(cal).push(g);
    const per = periodoDeGasto(g.fecha, medio);
    if (!gastosPorPeriodo.has(per)) gastosPorPeriodo.set(per, []);
    gastosPorPeriodo.get(per).push(g);
  }
  return {
    gastos, cuotas, recurrentes, ahorros, medios, inversiones,
    gastosPorMes, gastosPorPeriodo,
    match: matchear(gastos, recurrentes),
    calCuotas: calendarioCuotas(cuotas),
    credito: setDeCredito(medios),
  };
}

/**
 * Con qué se paga este concepto en este mes. Manda el gasto real si lo hay
 * (es el dato duro del resumen); si no, lo que declaraste al crearlo.
 */
export function medioDeConcepto(r, mes, ctx) {
  const real = (ctx.gastosPorMes.get(mes) || []).find(
    (g) => ctx.match.get(g.id) === r.id && g.tarjeta
  );
  return real ? real.tarjeta : (r.medio || null);
}

/**
 * Todo lo del mes, en las dos bases de cálculo (ver panel.js para el porqué):
 * caja = lo que sale del bolsillo; consumo = lo que consumiste.
 */
export function fotoDelMes(mes, ctx, base = 'caja') {
  const ingresos = cero(), fijosTotal = cero(), subsTotal = cero();
  // La parte de fijos y suscripciones que se paga con tarjeta de crédito ya
  // viaja dentro de `cuotas`: sumarla otra vez en base CAJA era contar dos
  // veces la misma plata. Se acumula aparte para poder restarla.
  const fijosTarjeta = cero(), subsTarjeta = cero();
  const varCaja = cero(), varConsumo = cero(), aportes = cero(), retiros = cero();
  const filasFijos = [], filasSubs = [], filasIngresos = [];
  const credito = ctx.credito || TARJETAS_CREDITO;

  for (const r of ctx.recurrentes) {
    if (!vigenteEn(r, mes, ctx)) continue;
    const m = montoEn(r, mes, ctx);
    if (!m) continue;
    if (r.tipo === 'ingreso') { sumar(ingresos, m, r.moneda); filasIngresos.push({ r, monto: m }); continue; }
    const medio = medioDeConcepto(r, mes, ctx);
    const porTarjeta = credito.has(medio);
    if (r.tipo === 'suscripcion') {
      sumar(subsTotal, m, r.moneda);
      if (porTarjeta) sumar(subsTarjeta, m, r.moneda);
      filasSubs.push({ r, monto: m, porTarjeta, medio });
    } else {
      sumar(fijosTotal, m, r.moneda);
      if (porTarjeta) sumar(fijosTarjeta, m, r.moneda);
      filasFijos.push({ r, monto: m, porTarjeta, medio });
    }
  }

  // Lo que pagaste por otro no es tu consumo, esté cobrado o no. Se acumula
  // aparte: si lo sumáramos, un mes en que adelantaste una multa de $56.775
  // parecería un mes de gasto alto y contaminaría el promedio de variable, la
  // alerta de "día caro" y el ritmo del mes.
  const ajenoPend = cero(), ajenoCobrado = cero();
  for (const g of (ctx.gastosPorMes.get(mes) || [])) {
    if (ctx.match.has(g.id)) continue;               // ya contado como concepto
    if (g.reintegro) {
      sumar(g.reintegro === 'cobrado' ? ajenoCobrado : ajenoPend, g.monto, g.moneda);
      continue;
    }
    sumar(varConsumo, g.monto, g.moneda);
    if (!credito.has(g.tarjeta)) sumar(varCaja, g.monto, g.moneda);
  }

  // Los consumos en 1 pago con tarjeta viven SÓLO en `gastos` (los planes en
  // cuotas viven en `cuotas` y su compra original no está acá). El resumen los
  // cobra junto, así que en base CAJA salen del bolsillo el mes en que vence
  // ese período. Sin esto la Visa desaparecía de Caja: no entra en `varCaja`
  // (es crédito) ni en `cuotas` (no es un plan), y agosto/2026 daba ~$0 cuando
  // en realidad se debitaban $1.897.243.
  const tarjetaPeriodo = cero();
  for (const g of (ctx.gastosPorPeriodo?.get(mes) || [])) {
    if (!credito.has(g.tarjeta)) continue;   // el efectivo ya está en varCaja
    if (g.reintegro) continue;               // lo pagaste por otro: mismo criterio que arriba
    sumar(tarjetaPeriodo, g.monto, g.moneda);
  }

  const cuotas = ctx.calCuotas.get(mes) || cero();

  for (const a of ctx.ahorros) {
    if (a.fecha.slice(0, 7) !== mes) continue;
    sumar(a.tipo === 'retiro' ? retiros : aportes, a.monto, a.moneda);
  }

  // Lo estructural que sale del bolsillo este mes (débito, efectivo,
  // transferencia). El resto lo cobra el resumen y está en `cuotas`.
  const fijosCaja = menosMontos(fijosTotal, fijosTarjeta);
  const subsCaja = menosMontos(subsTotal, subsTarjeta);
  const estructuralTotal = masMontos(fijosTotal, subsTotal);
  const estructuralTarjeta = masMontos(fijosTarjeta, subsTarjeta);
  const estructuralCaja = masMontos(fijosCaja, subsCaja);

  const egresoCaja = masMontos(estructuralCaja, cuotas, varCaja, tarjetaPeriodo);
  const egresoConsumo = masMontos(estructuralTotal, varConsumo);
  const egreso = base === 'caja' ? egresoCaja : egresoConsumo;
  const variable = base === 'caja' ? varCaja : varConsumo;

  return {
    mes, ingresos, cuotas,
    // Ajustados a la base elegida: son los que pintan el hero y el flujo.
    fijos: base === 'caja' ? fijosCaja : fijosTotal,
    subs: base === 'caja' ? subsCaja : subsTotal,
    estructural: base === 'caja' ? estructuralCaja : estructuralTotal,
    // Sin ajustar: el costo estructural real, que no depende de con qué pagues.
    fijosTotal, subsTotal, estructuralTotal,
    fijosTarjeta, subsTarjeta, estructuralTarjeta, fijosCaja, subsCaja, estructuralCaja,
    varCaja, varConsumo, variable, tarjetaPeriodo, egreso, egresoCaja, egresoConsumo,
    aportes, retiros, ajenoPend, ajenoCobrado,
    disponible: { ars: ingresos.ars - egreso.ars, usd: ingresos.usd - egreso.usd },
    filasFijos, filasSubs, filasIngresos,
  };
}

/** Saldo de deuda: lo que queda POR pagar desde `mes` inclusive. Las cuotas
 * del mes corriente que ya pagaste están en el calendario (son plata que
 * salió) pero no son deuda, así que no cuentan acá. */
export function deudaPendiente(mes, cal) {
  const acc = cero();
  for (const [m, v] of cal) {
    if (m < mes) continue;
    for (const it of v.items) if (!it.pagada) sumar(acc, it.monto, it.moneda);
  }
  return acc;
}

// ---------- Plata que pusiste por otro ----------

/**
 * Lo que adelantaste y todavía no te devolvieron, agrupado por quién te lo
 * debe. No es un gasto tuyo, es un préstamo: hasta que no vuelve, es plata
 * que no tenés pero tampoco gastaste.
 */
export function pendientesDeReintegro(gastos) {
  const porQuien = new Map();
  for (const g of gastos) {
    if (g.reintegro !== 'pendiente') continue;
    const quien = (g.reintegro_de || '').trim() || 'Sin anotar';
    if (!porQuien.has(quien)) porQuien.set(quien, { quien, total: cero(), items: [] });
    const acc = porQuien.get(quien);
    sumar(acc.total, g.monto, g.moneda);
    acc.items.push(g);
  }
  for (const v of porQuien.values()) {
    v.items.sort((a, b) => b.fecha.localeCompare(a.fecha));
    v.desde = v.items.at(-1).fecha;
    v.dias = diasEntre(v.desde, hoyIso());
  }
  return [...porQuien.values()].sort((a, b) => b.total.ars - a.total.ars);
}

// ---------- Indicadores ----------
// Los ratios que mira alguien que audita finanzas de verdad, no el detalle de
// cada gasto. La app ya tenía todos los datos: lo que faltaba era el cociente.
//
// `eq` lleva un {ars, usd} a pesos con la cotización elegida (la inyecta quien
// llama, para que este módulo siga sin depender de la red).

/**
 * Cuadro de mando del mes. Cada indicador trae `valor` crudo, el `texto` ya
 * formateado y un `estado` (bien / atencion / mal) para pintarlo. `estado`
 * null = no hay datos suficientes; nunca inventamos un semáforo en verde.
 */
export function indicadores(mes, ctx, foto, eq, { fotos = [] } = {}) {
  const ing = eq(foto.ingresos);
  // `estructural` es el COSTO de tu estructura, no depende de con qué la
  // pagues. Va entero: la parte que va con tarjeta vive en `gastos`, no en
  // `cuotas`, así que sumarla acá no duplica nada (antes se usaba
  // `estructuralCaja` para evitar una duplicación que no existía, y el efecto
  // era que las suscripciones con tarjeta no contaban en ningún lado).
  const estructural = eq(foto.estructuralTotal);
  const cuotasMes = eq(foto.cuotas);
  const variable = eq(foto.varConsumo);
  const comprometido = estructural + cuotasMes;
  const saldoDeuda = eq(deudaPendiente(mes, ctx.calCuotas));

  // Stock de ahorro acumulado hasta el mes que se está mirando.
  const stock = cero();
  for (const a of ctx.ahorros) {
    if (a.fecha.slice(0, 7) > mes) continue;
    sumar(stock, a.tipo === 'retiro' ? -a.monto : a.monto, a.moneda);
  }
  const ahorroStock = eq(stock);
  const ahorroNeto = eq(foto.aportes) - eq(foto.retiros);

  // Costo de vivir un mes: estructura + lo que gastás de variable en promedio.
  const varProm = fotos.length
    ? fotos.map((f) => eq(f.varConsumo)).reduce((a, b) => a + b, 0) / fotos.length
    : variable;
  const costoMensual = estructural + cuotasMes + varProm;

  // Cuándo dejás de arrastrar deuda. Sólo meses con cuotas SIN pagar: si no,
  // el mes corriente ya cobrado corría la fecha de "libre en…" un mes de más.
  const mesesConDeuda = [...ctx.calCuotas.entries()]
    .filter(([m, v]) => m >= mes && v.items.some((it) => !it.pagada))
    .map(([m]) => m).sort();
  const ultimoMes = mesesConDeuda.at(-1) || null;

  const semaforo = (v, bien, mal, invertido = false) => {
    if (v == null || !isFinite(v)) return null;
    if (invertido) return v >= bien ? 'bien' : v <= mal ? 'mal' : 'atencion';
    return v <= bien ? 'bien' : v >= mal ? 'mal' : 'atencion';
  };

  return [
    {
      key: 'dti',
      label: 'Carga de deuda',
      ayuda: 'Cuota del mes sobre ingreso. Arriba de 30% un banco ya te mira feo; arriba de 40% no te presta.',
      valor: ing ? cuotasMes / ing : null,
      texto: ing ? pct(cuotasMes / ing) : '—',
      detalle: ing ? `${fmtARS.format(cuotasMes)} de cuotas sobre ${fmtARS.format(ing)}` : 'Cargá tu ingreso',
      estado: semaforo(ing ? cuotasMes / ing : null, 0.30, 0.40),
    },
    {
      key: 'carga',
      label: 'Ingreso comprometido',
      ayuda: 'Fijos + suscripciones + cuotas antes de gastar un peso. Es tu piso: lo que pase de acá es lo único que podés decidir.',
      valor: ing ? comprometido / ing : null,
      texto: ing ? pct(comprometido / ing) : '—',
      detalle: ing
        ? `Te quedan ${fmtARS.format(ing - comprometido)} libres`
        : 'Cargá tu ingreso',
      estado: semaforo(ing ? comprometido / ing : null, 0.65, 0.85),
    },
    {
      key: 'cobertura',
      label: 'Cobertura de fijos',
      ayuda: 'Cuántas veces tu ingreso cubre tu estructura. Abajo de 1 no llegás ni quedándote en tu casa.',
      valor: estructural ? ing / estructural : null,
      texto: estructural ? `${(ing / estructural).toFixed(1).replace('.', ',')}×` : '—',
      detalle: estructural ? `Estructura de ${fmtARS.format(estructural)}/mes` : 'Sin fijos cargados',
      estado: semaforo(estructural ? ing / estructural : null, 3, 1.5, true),
    },
    {
      key: 'ahorro',
      label: 'Tasa de ahorro',
      ayuda: 'Lo que apartaste este mes sobre lo que entró. Es el único indicador que construye patrimonio.',
      valor: ing ? ahorroNeto / ing : null,
      texto: ing ? pct(ahorroNeto / ing) : '—',
      detalle: ing ? `${fmtARS.format(ahorroNeto)} apartados` : 'Cargá tu ingreso',
      estado: semaforo(ing ? ahorroNeto / ing : null, 0.15, 0.05, true),
    },
    {
      key: 'colchon',
      label: 'Colchón',
      ayuda: 'Meses que aguantás con lo ahorrado si mañana se corta el ingreso. Menos de 3 es zona de riesgo.',
      valor: costoMensual ? ahorroStock / costoMensual : null,
      texto: costoMensual
        ? `${(ahorroStock / costoMensual).toFixed(1).replace('.', ',')} mes${ahorroStock / costoMensual === 1 ? '' : 'es'}`
        : '—',
      detalle: costoMensual
        ? `${fmtARS.format(ahorroStock)} contra ${fmtARS.format(costoMensual)}/mes de vida`
        : 'Faltan datos',
      estado: semaforo(costoMensual ? ahorroStock / costoMensual : null, 6, 3, true),
    },
    {
      key: 'apalanca',
      label: 'Deuda / ingreso',
      ayuda: 'Cuántos sueldos enteros debés hoy en cuotas. No es urgente pero define cuánto margen tenés para lo que venga.',
      valor: ing ? saldoDeuda / ing : null,
      texto: ing ? `${(saldoDeuda / ing).toFixed(1).replace('.', ',')} sueldos` : '—',
      detalle: ultimoMes
        ? `Saldo ${fmtARS.format(saldoDeuda)} · libre en ${labelMes(addMes(ultimoMes, 1))}`
        : 'Sin deuda',
      estado: semaforo(ing ? saldoDeuda / ing : null, 1, 3),
    },
  ];
}

/**
 * Cuánto te queda por día para lo que resta del mes. Es el número más
 * accionable que puede darte una app de gastos: no "gastaste mucho", sino
 * "tenés $X por día hasta fin de mes".
 */
export function ritmoDisponible(foto, eq, hoy = new Date()) {
  const ing = eq(foto.ingresos);
  if (!ing) return null;
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diaHoy = hoy.getDate();
  const restan = Math.max(1, finMes - diaHoy + 1);
  // Lo comprometido se paga sí o sí; lo variable ya gastado, también. Es
  // exactamente el egreso de CAJA: incluye el resumen de la tarjeta que vence
  // este mes, que es la salida más grande y la que no podés no pagar.
  const libre = ing - eq(foto.egresoCaja);
  return {
    libre,
    restan,
    porDia: libre / restan,
    gastadoPorDia: eq(foto.varConsumo) / Math.max(1, diaHoy),
    finMes,
  };
}
