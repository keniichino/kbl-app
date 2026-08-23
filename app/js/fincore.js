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
// `mpc` (dinero en cuenta de Mercado Pago) y `nx` (prepaga Naranja X) son
// plata que YA salió: no tienen resumen ni cierre. Si quedaran del lado
// crédito, sus gastos desaparecerían de la caja del mes.
const NO_CREDITO = new Set(['efectivo', 'debito', 'transferencia', 'caja', 'mpc', 'nx']);

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
    // `!g.reintegro`: si pagás DOS suscripciones iguales y una te la devuelven
    // (dos cuentas de Claude, una de un amigo), sumar las dos declararía un
    // gasto fijo del doble del real. Lo que te reintegran no es tu costo.
    (g) => ctx.match.get(g.id) === r.id && !g.reintegro && (g.moneda || 'ARS') === r.moneda
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
 * Sin conexión directa con el banco, una suscripción sólo se sabía cobrada
 * cuando su gasto ya estaba cargado — así que el período abierto siempre se
 * quedaba corto (Netflix, Spotify, etc. cobran a fin de mes y hasta entonces
 * no sumaban nada). Acá cada suscripción de esta tarjeta cuenta desde ya: si
 * su gasto real de este período existe, ese monto manda; si no llegó
 * todavía, se usa el monto declarado del concepto. En cuanto el gasto real
 * aparece, se lo excluye del resto (`matcheados`) para no contarlo dos veces.
 *
 * `soloPendiente` saca las cuotas que ya se marcaron pagadas (para la alerta
 * de vencimiento, que sólo quiere avisar por lo que falta). Los gastos —
 * reales o proyectados por suscripción — no tienen ese concepto: se resuelve
 * a nivel resumen con `pagos_resumen`, no acá.
 */
export function resumenPeriodo(tarjeta, periodo, ctx, { soloPendiente = false } = {}) {
  const cuotas = cero();
  const compras = cero();
  for (const i of (ctx.calCuotas.get(periodo)?.items || [])) {
    if (i.tarjeta !== tarjeta) continue;
    if (soloPendiente && i.pagada) continue;
    sumar(cuotas, i.monto, i.moneda);
  }

  const matcheados = new Set();
  for (const r of ctx.recurrentes) {
    if (r.tipo !== 'suscripcion') continue;
    if (medioDeConcepto(r, periodo, ctx) !== tarjeta) continue;
    if (!vigenteEn(r, periodo, ctx)) continue;
    const reales = (ctx.gastosPorPeriodo.get(periodo) || []).filter(
      (g) => ctx.match.get(g.id) === r.id && !g.reintegro && (g.moneda || 'ARS') === r.moneda
    );
    reales.forEach((g) => matcheados.add(g.id));
    const monto = reales.length ? reales.reduce((a, g) => a + g.monto, 0) : montoDeclarado(r, periodo);
    if (monto) sumar(compras, monto, r.moneda);
  }

  for (const g of (ctx.gastosPorPeriodo?.get(periodo) || [])) {
    if (g.tarjeta !== tarjeta || g.reintegro || matcheados.has(g.id)) continue;
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
    // El reintegro se evalúa ANTES que el match, y el orden importa: al revés,
    // un gasto que coincide con un concepto declarado (la segunda cuenta de
    // Claude, que paga un amigo) salía por el `continue` del match y su
    // reintegro no se miraba nunca. Marcarlo "te lo deben" no hacía nada.
    if (g.reintegro) {
      sumar(g.reintegro === 'cobrado' ? ajenoCobrado : ajenoPend, g.monto, g.moneda);
      continue;
    }
    if (ctx.match.has(g.id)) continue;               // ya contado como concepto
    sumar(varConsumo, g.monto, g.moneda);
    if (!credito.has(g.tarjeta)) sumar(varCaja, g.monto, g.moneda);
  }

  // Los consumos en 1 pago con tarjeta viven SÓLO en `gastos` (los planes en
  // cuotas viven en `cuotas` y su compra original no está acá). El resumen los
  // cobra junto, así que en base CAJA salen del bolsillo el mes en que vence
  // ese período. Sin esto la Visa desaparecía de Caja: no entra en `varCaja`
  // (es crédito) ni en `cuotas` (no es un plan), y agosto/2026 daba ~$0 cuando
  // en realidad se debitaban $1.897.243.
  // Usa `resumenPeriodo` (misma cuenta que Cuotas) en vez de sumar `gastos`
  // directo: así una suscripción de tarjeta que todavía no cobró este período
  // ya cuenta con su monto declarado, en vez de aparecer recién cuando el
  // gasto real se carga.
  const tarjetaPeriodo = cero();
  for (const key of credito) {
    const { compras } = resumenPeriodo(key, mes, ctx);
    sumar(tarjetaPeriodo, compras.ars, 'ARS');
    sumar(tarjetaPeriodo, compras.usd, 'USD');
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

// ---------- Curva de ahorro ----------
// La pregunta que contesta: "si sigo viviendo como vengo viviendo, ¿cuánta
// plata me sobra cada mes de acá en adelante, y cuánto junto en total?".

export const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Lo que se gasta en un mes sin decidirlo cada vez (súper, comida, transporte,
 * salidas), en pesos equivalentes.
 *
 * MEDIANA y no promedio: un mes con una compra grande arrastraría el promedio
 * para arriba durante medio año. Y sólo meses CERRADOS — el mes en curso está
 * a medio hacer y bajaría el número justo cuando más importa que no mienta.
 */
export function variableTipico(ctx, eq, { meses = 3, hasta = MES_HOY } = {}) {
  const vals = [];
  for (let i = 1; i <= meses; i++) {
    const v = eq(fotoDelMes(addMes(hasta, -i), ctx, 'consumo').varConsumo);
    if (v > 0) vals.push(v);
  }
  return mediana(vals);
}

/**
 * Ahorro posible mes a mes y su acumulado.
 *
 * Por mes: ingreso − egreso de caja YA conocido − el consumo variable que
 * todavía no ocurrió. Ese último término es la parte delicada: los meses
 * futuros no tienen gastos cargados, así que sin él la curva diría que sobra
 * todo el sueldo. Y no se puede sumar de una porque los primeros meses SÍ
 * traen consumo real — el resumen de tarjeta ya cerrado. Por eso se resta
 * sólo lo que FALTA para llegar al ritmo típico, nunca menos de cero.
 */
export function curvaAhorro(ctx, eq, { meses = 12, desde = MES_HOY } = {}) {
  const tipico = variableTipico(ctx, eq);
  const filas = [];
  let acumulado = 0;

  for (let i = 0; i < meses; i++) {
    const mes = addMes(desde, i);
    const f = fotoDelMes(mes, ctx, 'caja');
    const ingreso = eq(f.ingresos);
    const comprometido = eq(f.egresoCaja);
    // Consumo variable que este mes ya tiene contabilizado: lo que sale por
    // caja + los consumos de tarjeta cuyo resumen vence justo este mes.
    const yaIncluido = eq(f.varCaja) + eq(f.tarjetaPeriodo);
    const faltante = Math.max(0, tipico - yaIncluido);
    const ahorro = ingreso - comprometido - faltante;
    acumulado += ahorro;
    filas.push({
      mes, ingreso, comprometido, faltante, ahorro, acumulado,
      cuotas: eq(f.cuotas),
      estructural: eq(f.estructuralTotal),
      tarjeta: eq(f.tarjetaPeriodo),
      tasa: ingreso ? ahorro / ingreso : 0,
    });
  }
  return { tipico, filas };
}

/**
 * Suscripciones declaradas contra la realidad de los últimos meses.
 *
 * Tres estados y cada uno es una acción distinta:
 *   · `ok`        — se cobró, y por lo que decís que sale.
 *   · `desviada`  — se cobró por otra plata (más de 15% de diferencia): el
 *                   monto declarado quedó viejo y toda proyección que lo use
 *                   está mal.
 *   · `fantasma`  — no se cobró en los últimos `dias`. O la diste de baja y
 *                   sigue inflando el gasto fijo, o el cargo cambió de nombre.
 */
export function auditarSubs(ctx, eq, { dias = 95, hoy = hoyIso() } = {}) {
  const subs = ctx.recurrentes.filter((r) => r.tipo === 'suscripcion' && r.estado !== 'pausado');
  const porRec = new Map();
  for (const g of ctx.gastos) {
    const rid = ctx.match.get(g.id);
    if (!rid || diasEntre(g.fecha, hoy) > dias || g.fecha > hoy) continue;
    if (!porRec.has(rid)) porRec.set(rid, []);
    porRec.get(rid).push(g);
  }

  return subs.map((r) => {
    const vistos = (porRec.get(r.id) || []).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const declarado = Number(r.monto) || 0;
    if (!vistos.length) return { r, estado: 'fantasma', declarado, real: 0, vistos, ultima: null };

    // Se compara contra el último mes cobrado completo: una suscripción puede
    // cobrar dos veces en el mismo mes (prorrateos de Apple, por ejemplo) y
    // mirar un solo cargo la haría parecer más barata de lo que es.
    const ultimoMes = vistos[0].fecha.slice(0, 7);
    const delMes = vistos.filter((g) => g.fecha.slice(0, 7) === ultimoMes);
    const real = delMes.reduce((a, g) => a + Number(g.monto), 0);
    const mismaMoneda = (delMes[0].moneda || 'ARS') === r.moneda;
    const desvio = declarado ? Math.abs(real - declarado) / declarado : 1;
    const estado = (!mismaMoneda || desvio > 0.15) ? 'desviada' : 'ok';
    return {
      r, estado, declarado, real, vistos, ultima: vistos[0].fecha,
      moneda: delMes[0].moneda || 'ARS', mismaMoneda, mes: ultimoMes,
    };
  }).sort((a, b) => {
    // Primero lo accionable: lo que está mal declarado, después lo que parece
    // dado de baja, y al final lo que ya está bien.
    const orden = { desviada: 0, fantasma: 1, ok: 2 };
    return (orden[a.estado] - orden[b.estado])
      || eq({ ars: b.moneda === 'USD' ? 0 : b.real, usd: b.moneda === 'USD' ? b.real : 0 })
       - eq({ ars: a.moneda === 'USD' ? 0 : a.real, usd: a.moneda === 'USD' ? a.real : 0 });
  });
}

/** Costo mensual de todas las suscripciones activas, separado por moneda. */
export function costoSubs(ctx, mes = MES_HOY) {
  const total = cero();
  for (const r of ctx.recurrentes) {
    if (r.tipo !== 'suscripcion' || !vigenteEn(r, mes, ctx)) continue;
    sumar(total, montoEn(r, mes, ctx), r.moneda);
  }
  return total;
}

/**
 * Cuánto tarda un objetivo en cumplirse al ritmo de ahorro proyectado.
 * Devuelve el mes en que se completa, o null si con esta curva no llega.
 */
export function etaObjetivo(faltante, curva) {
  if (faltante <= 0) return { mes: null, cumplido: true };
  let acum = 0;
  for (const f of curva.filas) {
    if (f.ahorro <= 0) continue;
    acum += f.ahorro;
    if (acum >= faltante) return { mes: f.mes, cumplido: false };
  }
  return { mes: null, cumplido: false };
}
