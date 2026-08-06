// ====== Panel financiero ======
// Lo que Gastos y Cuotas no muestran: la ESTRUCTURA. Cuánto de lo que sale
// cada mes es estructural (fijo), cuánto es deuda ya comprometida, cuánto es
// discrecional y cuánto queda.
//
// DOS BASES DE CÁLCULO. `gastos` y `cuotas` miden cosas distintas (gastos =
// cuándo consumiste, cuotas = cuándo lo pagás) y sumarlas juntas duplica
// (criterio acordado, ver TAREAS.md). Entonces:
//   · CAJA    → lo que sale del bolsillo este mes: fijos + suscripciones +
//               cuotas del mes + gastos que NO son de tarjeta de crédito.
//   · CONSUMO → lo que consumiste este mes: fijos + suscripciones + todos los
//               gastos del mes, sin cuotas.
// Nunca se mezclan.
//
// Pesos y dólares tampoco se suman a ciegas: se acumulan por separado y el
// equivalente en pesos se calcula a la cotización elegida (ver cotizacion.js).

import {
  getGastos, getCuotas, getRecurrentes, upsertRecurrente, removeRecurrente,
  getAhorros, addAhorro,
} from './store.js';
import { aPesos, casaActual, siguienteCasa, onCotizacion, ahorroVsTarjeta } from './cotizacion.js';
import { confirmar } from './dialog.js';

const $ = (sel) => document.querySelector(sel);

// ---------- Formato ----------

const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const fmtUSD = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const fmtMoneda = (m, moneda) => (moneda === 'USD' ? fmtUSD : fmtARS).format(m);

// Los tiles son angostos: ahí el número va abreviado ($ 1,2 M), pero en las
// tablas siempre va completo, que es donde uno controla contra el resumen.
function fmtCorto(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return '$ ' + (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
  if (abs >= 1e4) return '$ ' + Math.round(n / 1e3) + ' k';
  return fmtARS.format(n);
}

const pct = (n) => (n * 100).toFixed(n >= 0.1 || n <= -0.1 ? 0 : 1).replace('.', ',') + '%';

/**
 * Magnitud de un cambio. Arriba de 3x el porcentaje deja de decir algo
 * ("500% por encima"), así que ahí se pasa a múltiplo: "×6,0".
 */
function variacion(actual, previo) {
  const p = (actual - previo) / Math.abs(previo);
  return Math.abs(p) > 3
    ? '×' + Math.abs(actual / previo).toFixed(1).replace('.', ',')
    : pct(Math.abs(p));
}

function escapar(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- Meses ----------

const pad2 = (n) => String(n).padStart(2, '0');
const mesDeFecha = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const MES_HOY = mesDeFecha(new Date());
// Fecha local, NO toISOString(): a la noche en Argentina el UTC ya es el día
// siguiente y el movimiento quedaba fechado mañana.
const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

function addMes(key, n) {
  const [y, m] = key.split('-').map(Number);
  return mesDeFecha(new Date(y, m - 1 + n, 1));
}

// A mano y no con toLocaleDateString: el formato largo de es-AR es
// "agosto de 2026" y el capitalize del CSS lo deja en "Agosto De 2026".
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function labelMes(key, { corto = false } = {}) {
  const [y, m] = key.split('-').map(Number);
  return corto ? MESES_CORTOS[m - 1] : `${MESES[m - 1]} ${y}`;
}

function addMesesFecha(fechaIso, n) {
  const d = new Date(fechaIso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// ---------- Plata en dos monedas ----------

const cero = () => ({ ars: 0, usd: 0 });
const sumar = (acc, monto, moneda) => {
  if (moneda === 'USD') acc.usd += monto; else acc.ars += monto;
  return acc;
};
const masMontos = (...vs) => vs.reduce((a, v) => ({ ars: a.ars + v.ars, usd: a.usd + v.usd }), cero());
/** Equivalente total en pesos. Si todavía no bajó la cotización, los USD no se suman. */
const equiv = (v) => v.ars + (aPesos(v.usd) || 0);
const hayUsd = (v) => v.usd > 0.005;
/** Un monto suelto llevado a pesos, para poder ordenar filas de distinta moneda. */
const enPesos = (monto, moneda) => (moneda === 'USD' ? (aPesos(monto) || monto) : monto);

/** "$ 1.234.567" + la línea de dólares aparte cuando corresponde. */
function plata(v) {
  const base = fmtARS.format(v.ars);
  if (!hayUsd(v)) return base;
  return `${base} <span class="fin-usd">+ ${fmtUSD.format(v.usd)}</span>`;
}

// ---------- Config local (preferencias de vista) ----------

const CFG = 'kbl.panel';
function cfg() {
  try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch { return {}; }
}
function setCfg(parcial) {
  localStorage.setItem(CFG, JSON.stringify({ ...cfg(), ...parcial }));
}

let base = cfg().base === 'consumo' ? 'consumo' : 'caja';
let mesSel = MES_HOY;
let abiertos = new Set();   // filas expandidas
let editando = null;        // id del recurrente con el monto en edición

// ---------- Normalización / matcheo ----------

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Tarjetas de crédito: sus consumos se pagan por resumen, o sea por `cuotas`.
// En base CAJA no se cuentan como gasto del mes (si no, se duplican).
const TARJETAS_CREDITO = new Set(['visa', 'mac', 'mp']);

const MEDIOS = [
  { key: 'visa', emoji: '💳', label: 'Visa' },
  { key: 'mac', emoji: '⬛', label: 'Mac' },
  { key: 'mp', emoji: '🔵', label: 'MP' },
  { key: 'debito', emoji: '🏦', label: 'Débito' },
  { key: 'efectivo', emoji: '💵', label: 'Efectivo' },
];
const medioDe = (k) => MEDIOS.find((m) => m.key === k);

const TIPOS = {
  ingreso: { label: 'Ingreso', emoji: '💰' },
  fijo: { label: 'Gasto fijo', emoji: '🏠' },
  suscripcion: { label: 'Suscripción', emoji: '🔁' },
};

/** Palabras que identifican al concepto dentro de la descripción de un gasto. */
function llavesDe(r) {
  return (r.coincide ? r.coincide.split(',') : [r.nombre])
    .map(norm).filter((k) => k.length >= 3);
}

/**
 * Mapa gastoId → recurrenteId. Un gasto que matchea un concepto declarado ya
 * está contado por el concepto: no se vuelve a sumar como variable, y además
 * sirve para que el historial del concepto salga del gasto real y no de lo
 * declarado a mano.
 */
function matchear(gastos, recurrentes) {
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

/** Vale para ese mes: activo desde su alta, o pausado pero con historial cargado. */
function vigenteEn(r, mes) {
  const h = r.historial || {};
  if (h[mes] != null) return true;
  if (r.estado !== 'activo') return false;
  const alta = (r.created_at || '').slice(0, 7);
  return !alta || mes >= alta;
}

/** Monto declarado para ese mes: el del historial, si no el último anterior, si no el vigente. */
function montoDeclarado(r, mes) {
  const h = r.historial || {};
  if (h[mes] != null) return Number(h[mes]) || 0;
  const previas = Object.keys(h).filter((k) => k < mes).sort();
  if (previas.length) return Number(h[previas[previas.length - 1]]) || 0;
  return Number(r.monto) || 0;
}

/** Monto efectivo del mes: si hay gastos cargados que matchean, mandan ellos. */
function montoEn(r, mes, ctx) {
  const reales = (ctx.gastosPorMes.get(mes) || []).filter(
    (g) => ctx.match.get(g.id) === r.id && (g.moneda || 'ARS') === r.moneda
  );
  if (reales.length) return reales.reduce((a, g) => a + g.monto, 0);
  return montoDeclarado(r, mes);
}

// ---------- Cuotas: calendario completo ----------

/**
 * `fecha_primer_venc` es el vencimiento de `cuota_actual` (la próxima a pagar),
 * así que el plan entero se reconstruye hacia atrás y hacia adelante. Eso
 * permite ver la carga de deuda de meses pasados, no sólo la futura.
 */
function calendarioCuotas(cuotas) {
  const porMes = new Map();
  for (const c of cuotas) {
    if (c.estado !== 'activa') continue;
    for (let n = 1; n <= c.cuota_total; n++) {
      const mes = addMesesFecha(c.fecha_primer_venc, n - c.cuota_actual);
      if (!porMes.has(mes)) porMes.set(mes, { ...cero(), items: [] });
      const acc = porMes.get(mes);
      sumar(acc, c.monto_cuota, c.moneda);
      acc.items.push({ desc: c.descripcion, n, total: c.cuota_total, monto: c.monto_cuota, moneda: c.moneda, tarjeta: c.tarjeta });
    }
  }
  return porMes;
}

// ---------- Foto del mes ----------

function fotoDelMes(mes, ctx) {
  const ingresos = cero(), fijos = cero(), subs = cero();
  const varCaja = cero(), varConsumo = cero(), aportes = cero(), retiros = cero();
  const filasFijos = [], filasSubs = [];

  for (const r of ctx.recurrentes) {
    if (!vigenteEn(r, mes)) continue;
    const m = montoEn(r, mes, ctx);
    if (!m) continue;
    if (r.tipo === 'ingreso') sumar(ingresos, m, r.moneda);
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
    filasFijos: filasFijos.sort((a, b) => enPesos(b.monto, b.r.moneda) - enPesos(a.monto, a.r.moneda)),
    filasSubs: filasSubs.sort((a, b) => enPesos(b.monto, b.r.moneda) - enPesos(a.monto, a.r.moneda)),
  };
}

// ---------- Piezas visuales ----------

function sparkline(vals, color) {
  const n = vals.length;
  if (n < 2 || vals.every((v) => !v)) return '<span class="spark-vacio"></span>';
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const rango = (max - min) || 1;
  const W = 100, H = 30;
  const pts = vals.map((v, i) => [(i / (n - 1)) * W, H - 3 - ((v - min) / rango) * (H - 8)]);
  const linea = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="${linea} ${W},${H} 0,${H}" fill="${color}" opacity=".13"/>
    <polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${pts[n - 1][0].toFixed(1)}" cy="${pts[n - 1][1].toFixed(1)}" r="3" fill="${color}"/>
  </svg>`;
}

/**
 * Chip de variación. `bueno` dice de qué lado está lo deseable: en un gasto,
 * que baje; en un ingreso o un ahorro, que suba.
 */
function delta(actual, previo, { bueno = 'baja', chico = false } = {}) {
  if (!previo) return actual ? `<span class="fin-delta fin-delta--nuevo">nuevo</span>` : '';
  const dif = actual - previo;
  if (!dif) return `<span class="fin-delta fin-delta--igual">=</span>`;
  const p = dif / Math.abs(previo);
  if (Math.abs(p) < 0.005) return `<span class="fin-delta fin-delta--igual">=</span>`;
  const subio = dif > 0;
  const malo = bueno === 'baja' ? subio : !subio;
  return `<span class="fin-delta ${malo ? 'fin-delta--malo' : 'fin-delta--bien'} ${chico ? 'fin-delta--chico' : ''}">
    ${subio ? '▲' : '▼'} ${variacion(actual, previo)}</span>`;
}

function tile({ label, valor, sub = '', spark = '', color = 'var(--fin-fijo)' }) {
  return `<div class="fin-tile">
    <div class="fin-tile-label">${label}</div>
    <div class="fin-tile-val">${valor}</div>
    <div class="fin-tile-sub">${sub}</div>
    <div class="fin-tile-spark">${spark}</div>
    <div class="fin-tile-borde" style="background:${color}"></div>
  </div>`;
}

const SERIES = [
  { key: 'fijos', label: 'Fijos', color: 'var(--fin-fijo)' },
  { key: 'subs', label: 'Suscripciones', color: 'var(--fin-sub)' },
  { key: 'cuotas', label: 'Cuotas', color: 'var(--fin-cuota)' },
  { key: 'variable', label: 'Variable', color: 'var(--fin-var)' },
];

/** Serie visible según la base: en CONSUMO las cuotas no participan del total. */
const seriesVisibles = () => (base === 'caja' ? SERIES : SERIES.filter((s) => s.key !== 'cuotas'));

function leyenda() {
  return `<div class="fin-leyenda">${seriesVisibles()
    .map((s) => `<span class="fin-leyenda-item"><i style="background:${s.color}"></i>${s.label}</span>`)
    .join('')}<span class="fin-leyenda-item"><i class="fin-leyenda-linea"></i>Ingreso</span></div>`;
}

/** Columnas apiladas: un mes por columna, con la marca del ingreso encima. */
function barrasApiladas(fotos, { conIngreso = true } = {}) {
  const series = seriesVisibles();
  const alturas = fotos.map((f) => Math.max(equiv(f.egreso), conIngreso ? equiv(f.ingresos) : 0));
  const tope = Math.max(...alturas, 1);
  return `<div class="fin-barras">${fotos.map((f) => {
    const total = equiv(f.egreso);
    const hTotal = (total / tope) * 100;
    const ing = equiv(f.ingresos);
    const esActual = f.mes === MES_HOY;
    return `<div class="fin-col ${esActual ? 'fin-col--hoy' : ''}" title="${labelMes(f.mes)}: ${fmtARS.format(total)}">
      <div class="fin-col-plot">
        <div class="fin-col-stack" style="height:${hTotal.toFixed(1)}%">
          ${series.map((s) => {
            const v = equiv(f[s.key]);
            if (!v) return '';
            return `<div class="fin-seg" style="height:${((v / (total || 1)) * 100).toFixed(1)}%;background:${s.color}"></div>`;
          }).join('')}
        </div>
        ${conIngreso && ing ? `<div class="fin-marca-ing" style="bottom:${Math.min((ing / tope) * 100, 100).toFixed(1)}%"></div>` : ''}
      </div>
      <div class="fin-col-mes">${labelMes(f.mes, { corto: true })}</div>
      <div class="fin-col-monto">${fmtCorto(total)}</div>
    </div>`;
  }).join('')}</div>`;
}

// ---------- Secciones ----------

function renderHero(foto, previa) {
  const series = seriesVisibles();
  const total = equiv(foto.egreso);
  const ing = equiv(foto.ingresos);
  const refBarra = Math.max(total, ing) || 1;
  const disp = ing - total;

  const segmentos = series.map((s) => {
    const v = equiv(foto[s.key]);
    if (!v) return '';
    return `<div class="fin-alloc-seg" style="width:${((v / refBarra) * 100).toFixed(2)}%;background:${s.color}"
      title="${s.label}: ${fmtARS.format(v)}"></div>`;
  }).join('');
  const libre = ing > total ? `<div class="fin-alloc-seg fin-alloc-libre" style="width:${((disp / refBarra) * 100).toFixed(2)}%"></div>` : '';

  const desglose = series.filter((s) => equiv(foto[s.key])).map((s) => `
    <div class="fin-desg">
      <span class="fin-desg-punto" style="background:${s.color}"></span>
      <span class="fin-desg-label">${s.label}</span>
      <span class="fin-desg-pct">${total ? pct(equiv(foto[s.key]) / total) : '—'}</span>
      <span class="fin-desg-monto">${plata(foto[s.key])}</span>
    </div>`).join('');

  const lineaIngreso = ing
    ? `<div class="fin-hero-linea">
         <span>Ingreso ${plata(foto.ingresos)}</span>
         <span class="${disp >= 0 ? 'fin-ok' : 'fin-mal'}">
           ${disp >= 0 ? 'Queda' : 'Faltan'} <b>${fmtARS.format(Math.abs(disp))}</b>
           ${ing ? `· ${pct(Math.abs(disp) / ing)}` : ''}
         </span>
       </div>`
    : `<button class="fin-cta" id="fin-cta-ingreso">Cargá tu ingreso mensual para ver cuánto te queda →</button>`;

  return `
    <div class="fin-hero">
      <div class="fin-hero-top">
        <span class="fin-hero-key">${base === 'caja' ? 'Sale este mes' : 'Consumido este mes'}</span>
        ${delta(total, previa ? equiv(previa.egreso) : 0)}
      </div>
      <div class="fin-hero-val">${fmtARS.format(foto.egreso.ars)}</div>
      ${hayUsd(foto.egreso) ? `<div class="fin-hero-usd">+ ${fmtUSD.format(foto.egreso.usd)}
        <span class="cotiz-eq" role="button" tabindex="0" title="Tocá para cambiar de cotización">≈ ${fmtARS.format(aPesos(foto.egreso.usd) || 0)} <span class="cotiz-casa">${casaActual().label}</span></span></div>` : ''}
      <div class="fin-alloc">${segmentos}${libre}</div>
      ${lineaIngreso}
      <div class="fin-desglose">${desglose || '<div class="fin-vacio-inline">Sin movimientos en este mes.</div>'}</div>
    </div>`;
}

function renderKpis(fotos, ctx) {
  const foto = fotos.at(-1);
  const previa = fotos.at(-2);
  const ing = equiv(foto.ingresos);

  const prom3 = (sel) => {
    const ult = fotos.slice(-4, -1).map((f) => equiv(f[sel]));
    return ult.length ? ult.reduce((a, b) => a + b, 0) / ult.length : 0;
  };

  const saldoDeuda = equiv(deudaPendiente(mesSel, ctx.calCuotas));
  const ahorroNeto = equiv(foto.aportes) - equiv(foto.retiros);
  const tasa = ing ? ahorroNeto / ing : null;

  return `<div class="fin-tiles">
    ${tile({
      label: 'Fijo + suscrip.',
      valor: fmtCorto(equiv(foto.estructural)),
      sub: `${delta(equiv(foto.estructural), previa ? equiv(previa.estructural) : 0)} ${ing ? `<span class="fin-tile-nota">${pct(equiv(foto.estructural) / ing)} del ingreso</span>` : ''}`,
      spark: sparkline(fotos.map((f) => equiv(f.estructural)), 'var(--fin-fijo)'),
      color: 'var(--fin-fijo)',
    })}
    ${tile({
      label: 'Variable',
      valor: fmtCorto(equiv(foto.variable)),
      sub: `${delta(equiv(foto.variable), prom3('variable'))} <span class="fin-tile-nota">vs prom. 3 meses</span>`,
      spark: sparkline(fotos.map((f) => equiv(f.variable)), 'var(--fin-var)'),
      color: 'var(--fin-var)',
    })}
    ${tile({
      label: 'Cuotas del mes',
      valor: fmtCorto(equiv(foto.cuotas)),
      sub: saldoDeuda ? `<span class="fin-tile-nota">saldo ${fmtCorto(saldoDeuda)}</span>` : '<span class="fin-tile-nota">sin deuda</span>',
      spark: sparkline(fotos.map((f) => equiv(f.cuotas)), 'var(--fin-cuota)'),
      color: 'var(--fin-cuota)',
    })}
    ${tile({
      label: 'Ahorro',
      valor: fmtCorto(ahorroNeto),
      sub: tasa == null
        ? '<span class="fin-tile-nota">cargá el ingreso</span>'
        : `${delta(ahorroNeto, previa ? equiv(previa.aportes) - equiv(previa.retiros) : 0, { bueno: 'suba' })} <span class="fin-tile-nota">tasa ${pct(tasa)}</span>`,
      spark: sparkline(fotos.map((f) => equiv(f.aportes) - equiv(f.retiros)), 'var(--fin-ahorro)'),
      color: 'var(--fin-ahorro)',
    })}
  </div>`;
}

/** Filas de conceptos (fijos o suscripciones) con su historial desplegable. */
function renderFilas(filas, ctx, { tipo }) {
  const meses = ctx.meses;
  return filas.map(({ r, monto }) => {
    const serie = meses.map((m) => (vigenteEn(r, m) ? montoEn(r, m, ctx) : 0));
    const prev = serie.at(-2) || 0;
    const abierto = abiertos.has(r.id);
    const medio = medioDe(r.medio);
    const color = tipo === 'suscripcion' ? 'var(--fin-sub)' : 'var(--fin-fijo)';
    const enEdicion = editando === r.id;

    return `
      <div class="fin-fila ${abierto ? 'fin-fila--abierta' : ''}" data-id="${r.id}">
        <button class="fin-fila-top" data-accion="toggle" data-id="${r.id}">
          <span class="fin-fila-nombre">
            ${escapar(r.nombre)}
            ${r.estado !== 'activo' ? '<span class="fin-badge fin-badge--pausa">en pausa</span>' : ''}
            ${r.moneda === 'USD' ? '<span class="fin-badge fin-badge--usd">USD</span>' : ''}
          </span>
          <span class="fin-fila-spark">${sparkline(serie, color)}</span>
          <span class="fin-fila-monto">${fmtMoneda(monto, r.moneda)}</span>
          <span class="fin-fila-delta">${delta(monto, prev, { chico: true })}</span>
        </button>
        <div class="fin-fila-meta">
          ${r.dia ? `<span>día ${r.dia}</span>` : ''}
          ${medio ? `<span>${medio.emoji} ${medio.label}</span>` : ''}
          ${r.moneda === 'USD' && aPesos(monto) ? `<span>≈ ${fmtARS.format(aPesos(monto))}</span>` : ''}
        </div>
        ${abierto ? `
          <div class="fin-fila-detalle">
            <div class="fin-hist">
              ${meses.map((m, i) => `
                <div class="fin-hist-col ${m === mesSel ? 'fin-hist-col--sel' : ''}">
                  <div class="fin-hist-monto">${serie[i] ? fmtCorto(r.moneda === 'USD' ? (aPesos(serie[i]) || serie[i]) : serie[i]) : '—'}</div>
                  <div class="fin-hist-mes">${labelMes(m, { corto: true })}</div>
                </div>`).join('')}
            </div>
            ${enEdicion ? `
              <div class="fin-edit">
                <input class="fin-edit-input" id="fin-edit-input" type="text" inputmode="decimal"
                       value="${monto}" aria-label="Nuevo monto">
                <button class="fin-btn fin-btn--ok" data-accion="guardar" data-id="${r.id}">Guardar en ${labelMes(mesSel, { corto: true })}</button>
                <button class="fin-btn" data-accion="cancelar">Cancelar</button>
              </div>`
            : `
              <div class="fin-acciones">
                <button class="fin-btn" data-accion="editar" data-id="${r.id}">✎ Actualizar monto</button>
                <button class="fin-btn" data-accion="pausar" data-id="${r.id}">${r.estado === 'activo' ? '⏸ Pausar' : '▶ Reactivar'}</button>
                <button class="fin-btn fin-btn--del" data-accion="borrar" data-id="${r.id}">✕ Borrar</button>
              </div>`}
          </div>` : ''}
      </div>`;
  }).join('');
}

function renderFijos(foto, ctx) {
  const ing = equiv(foto.ingresos);
  const totalPrev = ctx.previa ? equiv(ctx.previa.fijos) : 0;
  const cuerpo = foto.filasFijos.length
    ? renderFilas(foto.filasFijos, ctx, { tipo: 'fijo' })
    : `<div class="fin-vacio">
         <p>Todavía no cargaste gastos fijos.</p>
         <p class="fin-vacio-sub">Alquiler, expensas, luz, internet, colegio. Son los que definen tu piso mensual — y los que suben sin que te des cuenta.</p>
       </div>`;

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Gastos fijos</h2>
        <span class="fin-card-sub">${foto.filasFijos.length} concepto${foto.filasFijos.length !== 1 ? 's' : ''}</span>
      </div>
      ${cuerpo}
      ${foto.filasFijos.length ? `
        <div class="fin-total">
          <span class="fin-total-label">Total fijo</span>
          <span class="fin-total-delta">${delta(equiv(foto.fijos), totalPrev)}</span>
          <span class="fin-total-monto">${plata(foto.fijos)}</span>
        </div>
        <div class="fin-nota">
          ${ing ? `Te comés <b>${pct(equiv(foto.fijos) / ing)}</b> del ingreso antes de gastar un peso. ` : ''}
          Anualizado: <b>${fmtARS.format(equiv(foto.fijos) * 12)}</b>.
        </div>` : ''}
    </div>`;
}

function renderSubs(foto, ctx) {
  const ing = equiv(foto.ingresos);
  const totalUsd = foto.subs.usd;
  const comp = totalUsd ? ahorroVsTarjeta(totalUsd) : null;
  const cuerpo = foto.filasSubs.length
    ? renderFilas(foto.filasSubs, ctx, { tipo: 'suscripcion' })
    : `<div class="fin-vacio">
         <p>Sin suscripciones cargadas.</p>
         <p class="fin-vacio-sub">Netflix, Spotify, ChatGPT, Adobe, el gimnasio. Chicas de a una, pesadas juntas: acá se ve el anualizado.</p>
       </div>`;

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Suscripciones</h2>
        <span class="fin-card-sub">${foto.filasSubs.length} activa${foto.filasSubs.length !== 1 ? 's' : ''}</span>
      </div>
      ${cuerpo}
      ${foto.filasSubs.length ? `
        <div class="fin-total">
          <span class="fin-total-label">Por mes</span>
          <span class="fin-total-delta">${delta(equiv(foto.subs), ctx.previa ? equiv(ctx.previa.subs) : 0)}</span>
          <span class="fin-total-monto">${plata(foto.subs)}</span>
        </div>
        <div class="fin-nota">
          En un año son <b>${fmtARS.format(equiv(foto.subs) * 12)}</b>${ing ? ` · ${pct(equiv(foto.subs) / ing)} del ingreso` : ''}.
          ${comp ? `<br>Los ${fmtUSD.format(totalUsd)} en dólares te salen <b>${fmtARS.format(comp.propio)}</b> comprando ${casaActual().label};
            si los paga la tarjeta, ${fmtARS.format(comp.conTarjeta)} → <b class="fin-ok">ahorrás ${fmtARS.format(comp.ahorro)}</b>.` : ''}
        </div>` : ''}
    </div>`;
}

/** Saldo de deuda: todas las cuotas que quedan por pagar desde `mes` inclusive. */
function deudaPendiente(mes, cal = calendarioCuotas(getCuotas())) {
  const acc = cero();
  for (const [m, v] of cal) if (m >= mes) { acc.ars += v.ars; acc.usd += v.usd; }
  return acc;
}

function renderDeuda(ctx) {
  const cal = ctx.calCuotas;
  const futuros = [...cal.entries()].filter(([m]) => m >= mesSel).sort(([a], [b]) => a.localeCompare(b));
  if (!futuros.length) {
    return `<div class="fin-card">
      <div class="fin-card-head"><h2>Deuda</h2></div>
      <div class="fin-vacio"><p>Sin cuotas pendientes. 🎉</p>
      <p class="fin-vacio-sub">Nada comprometido para los meses que vienen.</p></div>
    </div>`;
  }

  const saldo = deudaPendiente(mesSel, cal);
  const pico = futuros.reduce((a, b) => (equiv(b[1]) > equiv(a[1]) ? b : a));
  const ultimo = futuros.at(-1);
  const tope = Math.max(...futuros.slice(0, 8).map(([, v]) => equiv(v)), 1);
  const esteMes = cal.get(mesSel) || cero();
  const ing = equiv(ctx.foto.ingresos);

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Deuda en cuotas</h2>
        <button class="fin-link" data-accion="ir-cuotas">Ver detalle ›</button>
      </div>
      <div class="fin-duo">
        <div><div class="fin-duo-key">Saldo total</div><div class="fin-duo-val">${plata(saldo)}</div></div>
        <div><div class="fin-duo-key">Este mes</div><div class="fin-duo-val">${plata(esteMes)}${ing ? `<span class="fin-duo-nota">${pct(equiv(esteMes) / ing)} del ingreso</span>` : ''}</div></div>
      </div>
      <div class="fin-mini-barras">
        ${futuros.slice(0, 8).map(([m, v]) => `
          <div class="fin-mini-col" title="${labelMes(m)}: ${fmtARS.format(equiv(v))}">
            <div class="fin-mini-plot"><div class="fin-mini-bar ${m === pico[0] ? 'fin-mini-bar--pico' : ''}"
                 style="height:${((equiv(v) / tope) * 100).toFixed(1)}%"></div></div>
            <div class="fin-mini-mes">${labelMes(m, { corto: true })}</div>
          </div>`).join('')}
      </div>
      <div class="fin-nota">
        Mes más pesado: <b>${labelMes(pico[0])}</b> con ${fmtARS.format(equiv(pico[1]))}.
        La última cuota vence en <b>${labelMes(ultimo[0])}</b>: desde ${labelMes(addMes(ultimo[0], 1))} no arrastrás deuda.
      </div>
    </div>`;
}

function renderAhorro(fotos, ctx) {
  const ahorros = ctx.ahorros;
  const stock = cero();
  for (const a of ahorros) {
    if (a.fecha.slice(0, 7) > mesSel) continue;      // respeta el mes que estás mirando
    if (a.tipo === 'retiro') sumar(stock, -a.monto, a.moneda);
    else sumar(stock, a.monto, a.moneda);
  }
  const foto = ctx.foto;
  const neto = equiv(foto.aportes) - equiv(foto.retiros);
  const ing = equiv(foto.ingresos);
  const meta = Number(cfg().meta ?? 20);
  const objetivo = ing * (meta / 100);
  const avance = objetivo ? Math.min(neto / objetivo, 1) : 0;
  const ultimos = ahorros.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Ahorro</h2>
        <span class="fin-card-sub">stock acumulado</span>
      </div>
      <div class="fin-duo">
        <div><div class="fin-duo-key">Acumulado</div><div class="fin-duo-val">${plata(stock)}
          ${hayUsd(stock) && aPesos(stock.usd) ? `<span class="fin-duo-nota">total ≈ ${fmtARS.format(equiv(stock))} a ${casaActual().label}</span>` : ''}</div></div>
        <div><div class="fin-duo-key">Este mes</div><div class="fin-duo-val ${neto >= 0 ? '' : 'fin-mal'}">${fmtARS.format(neto)}
          ${ing ? `<span class="fin-duo-nota">tasa ${pct(neto / ing)}</span>` : ''}</div></div>
      </div>
      ${ing ? `
        <div class="fin-meta">
          <div class="fin-meta-head">
            <span>Meta: <b>${meta}%</b> del ingreso (${fmtARS.format(objetivo)})</span>
            <span class="${neto >= objetivo ? 'fin-ok' : 'fin-soft'}">${neto >= objetivo ? '✓ cumplida' : `faltan ${fmtARS.format(objetivo - neto)}`}</span>
          </div>
          <div class="fin-meta-barra"><div class="fin-meta-fill" style="width:${(avance * 100).toFixed(1)}%"></div></div>
        </div>` : ''}
      ${ultimos.length ? `
        <div class="fin-movs">
          ${ultimos.map((a) => `
            <div class="fin-mov">
              <span class="fin-mov-icon">${a.tipo === 'retiro' ? '↙' : '↗'}</span>
              <span class="fin-mov-desc">${escapar(a.destino) || (a.tipo === 'retiro' ? 'Retiro' : 'Aporte')}
                <span class="fin-mov-fecha">${new Date(a.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span></span>
              <span class="fin-mov-monto ${a.tipo === 'retiro' ? 'fin-mal' : 'fin-ok'}">${a.tipo === 'retiro' ? '−' : '+'}${fmtMoneda(a.monto, a.moneda)}</span>
            </div>`).join('')}
        </div>` : `<div class="fin-vacio"><p>Sin movimientos de ahorro.</p>
          <p class="fin-vacio-sub">Registrá cada vez que apartás plata (o comprás dólares) y el panel te dice qué tasa de ahorro sostenés.</p></div>`}
    </div>`;
}

function renderFlujo(fotos) {
  const conIngreso = fotos.some((f) => equiv(f.ingresos));
  const prom = fotos.reduce((a, f) => a + equiv(f.egreso), 0) / (fotos.length || 1);
  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Flujo de 6 meses</h2>
        <span class="fin-card-sub">${base === 'caja' ? 'base caja' : 'base consumo'}</span>
      </div>
      ${barrasApiladas(fotos, { conIngreso })}
      ${leyenda()}
      <div class="fin-nota">Promedio mensual: <b>${fmtARS.format(prom)}</b>.
        ${(() => {
          const ult = equiv(fotos.at(-1).egreso);
          if (!prom) return '';
          const d = (ult - prom) / prom;
          if (Math.abs(d) < 0.05) return ' Este mes estás en línea con tu promedio.';
          return d > 0
            ? ` Este mes estás <b class="fin-mal">${variacion(ult, prom)} por encima</b> del promedio.`
            : ` Este mes estás <b class="fin-ok">${variacion(ult, prom)} por debajo</b> del promedio.`;
        })()}
      </div>
    </div>`;
}

function renderProyeccion(ctx) {
  const meses = Array.from({ length: 6 }, (_, i) => addMes(MES_HOY, i + 1));
  const fotos = meses.map((m) => fotoDelMes(m, ctx));
  const hayAlgo = fotos.some((f) => equiv(f.egreso));
  if (!hayAlgo) return '';
  const tope = Math.max(...fotos.map((f) => Math.max(equiv(f.egreso), equiv(f.ingresos))), 1);

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Lo que ya está comprometido</h2>
        <span class="fin-card-sub">próximos 6 meses</span>
      </div>
      <div class="fin-proy">
        ${fotos.map((f) => {
          const comp = equiv(masMontos(f.estructural, f.cuotas));
          const ing = equiv(f.ingresos);
          const margen = ing - comp;
          return `
            <div class="fin-proy-fila">
              <span class="fin-proy-mes">${labelMes(f.mes, { corto: true })} ${f.mes.slice(0, 4)}</span>
              <span class="fin-proy-barra"><i style="width:${((comp / tope) * 100).toFixed(1)}%"></i></span>
              <span class="fin-proy-monto">${fmtCorto(comp)}</span>
              <span class="fin-proy-margen ${margen >= 0 ? 'fin-ok' : 'fin-mal'}">${ing ? (margen >= 0 ? '+' : '') + fmtCorto(margen) : '—'}</span>
            </div>`;
        }).join('')}
      </div>
      <div class="fin-nota">Fijos + suscripciones + cuotas ya firmadas, contra tu ingreso actual.
        La última columna es lo que te quedaría libre si no gastaras nada más.</div>
    </div>`;
}

// ---------- Render principal ----------

function render() {
  const gastos = getGastos();
  const cuotas = getCuotas();
  const recurrentes = getRecurrentes();
  const ahorros = getAhorros();

  const gastosPorMes = new Map();
  for (const g of gastos) {
    const m = g.fecha.slice(0, 7);
    if (!gastosPorMes.has(m)) gastosPorMes.set(m, []);
    gastosPorMes.get(m).push(g);
  }

  const meses = Array.from({ length: 6 }, (_, i) => addMes(mesSel, i - 5));
  const ctx = {
    gastos, cuotas, recurrentes, ahorros, gastosPorMes, meses,
    match: matchear(gastos, recurrentes),
    calCuotas: calendarioCuotas(cuotas),
  };

  const fotos = meses.map((m) => fotoDelMes(m, ctx));
  ctx.foto = fotos.at(-1);
  ctx.previa = fotos.at(-2);

  $('#fin-mes-label').textContent = labelMes(mesSel);
  $('#fin-mes-next').disabled = mesSel >= MES_HOY;
  $('#panel-sub').textContent = base === 'caja'
    ? 'Lo que sale del bolsillo este mes'
    : 'Lo que consumiste este mes';
  document.querySelectorAll('#fin-base .seg-btn')
    .forEach((b) => b.classList.toggle('selected', b.dataset.base === base));

  $('#fin-hero').innerHTML = renderHero(ctx.foto, ctx.previa);
  $('#fin-kpis').innerHTML = renderKpis(fotos, ctx);
  $('#fin-fijos').innerHTML = renderFijos(ctx.foto, ctx);
  $('#fin-subs').innerHTML = renderSubs(ctx.foto, ctx);
  $('#fin-deuda').innerHTML = renderDeuda(ctx);
  $('#fin-ahorro').innerHTML = renderAhorro(fotos, ctx);
  $('#fin-flujo').innerHTML = renderFlujo(fotos);
  $('#fin-proyeccion').innerHTML = renderProyeccion(ctx);

  const inp = $('#fin-edit-input');
  if (inp) { inp.focus(); inp.select(); }
}

// ---------- Altas y ediciones ----------

const parseMonto = (txt) => parseFloat((txt || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''));

function separadorMiles(input) {
  input.addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^\d,]/g, '');
    const [ent, ...resto] = v.split(',');
    e.target.value = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (resto.length ? ',' + resto.join('').slice(0, 2) : '');
  });
}

let tipoNuevo = 'fijo';
let monedaNuevo = 'ARS';
let medioNuevo = null;
let monedaAhorro = 'ARS';
let tipoAhorro = 'aporte';

function guardarConcepto() {
  const nombre = $('#fin-nombre').value.trim();
  const monto = parseMonto($('#fin-monto').value);
  if (!nombre) return $('#fin-nombre').focus();
  if (!monto || monto <= 0) return $('#fin-monto').focus();
  const dia = parseInt($('#fin-dia').value, 10);

  upsertRecurrente({
    id: crypto.randomUUID(),
    tipo: tipoNuevo,
    nombre,
    categoria: '',
    monto,
    moneda: monedaNuevo,
    dia: dia >= 1 && dia <= 31 ? dia : null,
    medio: medioNuevo,
    estado: 'activo',
    coincide: '',
    historial: { [MES_HOY]: monto },
    created_at: new Date().toISOString(),
  });

  $('#fin-nombre').value = '';
  $('#fin-monto').value = '';
  $('#fin-dia').value = '';
  $('#fin-form-concepto').removeAttribute('open');
  render();
}

function guardarAhorro() {
  const monto = parseMonto($('#ahorro-monto').value);
  if (!monto || monto <= 0) return $('#ahorro-monto').focus();
  const fecha = $('#ahorro-fecha').value || hoyIso();
  addAhorro({
    id: crypto.randomUUID(),
    fecha,
    monto,
    moneda: monedaAhorro,
    tipo: tipoAhorro,
    destino: $('#ahorro-destino').value.trim(),
    nota: '',
    ts: Date.now(),
  });
  $('#ahorro-monto').value = '';
  $('#ahorro-destino').value = '';
  $('#fin-form-ahorro').removeAttribute('open');
  render();
}

async function accionFila(accion, id) {
  const rec = getRecurrentes().find((r) => r.id === id);

  if (accion === 'toggle') {
    if (abiertos.has(id)) { abiertos.delete(id); editando = null; } else abiertos.add(id);
    return render();
  }
  if (!rec) return;

  if (accion === 'editar') { editando = id; return render(); }
  if (accion === 'cancelar') { editando = null; return render(); }

  if (accion === 'guardar') {
    const monto = parseMonto($('#fin-edit-input').value);
    if (!monto || monto <= 0) return;
    // Se registra en el mes que estás mirando; si es el actual, además pasa a
    // ser el valor vigente hacia adelante.
    const historial = { ...(rec.historial || {}), [mesSel]: monto };
    upsertRecurrente({ ...rec, historial, monto: mesSel >= MES_HOY ? monto : rec.monto });
    editando = null;
    return render();
  }

  if (accion === 'pausar') {
    upsertRecurrente({ ...rec, estado: rec.estado === 'activo' ? 'pausado' : 'activo' });
    return render();
  }

  if (accion === 'borrar') {
    const ok = await confirmar({
      titulo: `¿Borrar "${rec.nombre}"?`,
      mensaje: 'Se pierde también su historial de montos.',
      accion: 'Borrar',
      destructivo: true,
    });
    if (ok) { abiertos.delete(id); removeRecurrente(id); render(); }
  }
}

// ---------- Init ----------

export function initPanel() {
  onCotizacion(() => {
    if (document.querySelector('#view-panel')?.classList.contains('active')) render();
  });

  // Navegación de meses
  $('#fin-mes-prev').addEventListener('click', () => { mesSel = addMes(mesSel, -1); abiertos.clear(); render(); });
  $('#fin-mes-next').addEventListener('click', () => {
    if (mesSel >= MES_HOY) return;
    mesSel = addMes(mesSel, 1); abiertos.clear(); render();
  });

  // Base de cálculo
  $('#fin-base').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    base = btn.dataset.base;
    setCfg({ base });
    render();
  });

  // Alta de concepto: tipo / moneda / medio
  $('#fin-tipo').innerHTML = Object.entries(TIPOS)
    .map(([k, t]) => `<button type="button" class="chip ${k === tipoNuevo ? 'selected' : ''}" data-tipo="${k}">${t.emoji} ${t.label}</button>`)
    .join('');
  $('#fin-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    tipoNuevo = b.dataset.tipo;
    $('#fin-tipo').querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c === b));
    $('#fin-nombre').placeholder = tipoNuevo === 'ingreso' ? 'Sueldo, freelance…'
      : tipoNuevo === 'suscripcion' ? 'Netflix, ChatGPT, gimnasio…' : 'Alquiler, expensas, luz…';
  });

  $('#fin-medio').innerHTML = MEDIOS
    .map((m) => `<button type="button" class="chip cat-chip" data-medio="${m.key}">${m.emoji} ${m.label}</button>`)
    .join('');
  $('#fin-medio').addEventListener('click', (e) => {
    const b = e.target.closest('[data-medio]');
    if (!b) return;
    const key = b.dataset.medio;
    medioNuevo = medioNuevo === key ? null : key;
    $('#fin-medio').querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', medioNuevo && c === b));
  });

  $('#fin-moneda').addEventListener('click', (e) => {
    const op = e.target.closest('.seg-op');
    if (!op) return;
    monedaNuevo = op.dataset.moneda;
    $('#fin-moneda').querySelectorAll('.seg-op').forEach((b) => b.classList.toggle('selected', b === op));
    $('#fin-monto').placeholder = monedaNuevo === 'USD' ? 'US$ 0' : '$ 0';
  });

  separadorMiles($('#fin-monto'));
  separadorMiles($('#ahorro-monto'));
  $('#btn-fin-guardar').addEventListener('click', guardarConcepto);

  // Alta de movimiento de ahorro
  $('#ahorro-moneda').addEventListener('click', (e) => {
    const op = e.target.closest('.seg-op');
    if (!op) return;
    monedaAhorro = op.dataset.moneda;
    $('#ahorro-moneda').querySelectorAll('.seg-op').forEach((b) => b.classList.toggle('selected', b === op));
  });
  $('#ahorro-tipo').addEventListener('click', (e) => {
    const op = e.target.closest('.seg-btn');
    if (!op) return;
    tipoAhorro = op.dataset.mov;
    $('#ahorro-tipo').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('selected', b === op));
  });
  $('#ahorro-fecha').value = hoyIso();
  $('#btn-ahorro-guardar').addEventListener('click', guardarAhorro);

  // Meta de ahorro (preferencia local, no viaja a la nube)
  const meta = $('#fin-meta-input');
  meta.value = cfg().meta ?? 20;
  meta.addEventListener('change', () => {
    const v = Math.max(0, Math.min(100, Number(meta.value) || 0));
    meta.value = v;
    setCfg({ meta: v });
    render();
  });

  // Delegación: filas, atajos y cotización
  $('#view-panel').addEventListener('click', (e) => {
    if (e.target.closest('.cotiz-eq')) return siguienteCasa();
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    const { accion, id } = btn.dataset;
    if (accion === 'ir-cuotas') return document.querySelector('.tab[data-view="cuotas"]').click();
    accionFila(accion, id);
  });

  $('#fin-hero').addEventListener('click', (e) => {
    if (!e.target.closest('#fin-cta-ingreso')) return;
    tipoNuevo = 'ingreso';
    $('#fin-tipo').querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.tipo === 'ingreso'));
    $('#fin-form-concepto').setAttribute('open', '');
    $('#fin-form-concepto').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#fin-nombre').focus();
  });

  render();
}

export { render as renderPanel };
