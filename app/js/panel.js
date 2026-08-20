// ====== Panel financiero ======
// Lo que Gastos y Cuotas no muestran: la ESTRUCTURA. Cuánto de lo que sale
// cada mes es estructural (fijo), cuánto es deuda ya comprometida, cuánto es
// discrecional y cuánto queda.
//
// DOS BASES DE CÁLCULO. `gastos` y `cuotas` miden cosas distintas (gastos =
// cuándo consumiste, cuotas = cuándo lo pagás) y sumarlas juntas duplica
// (criterio acordado, ver TAREAS.md). Entonces:
//   · CAJA    → lo que sale del bolsillo este mes: fijos + suscripciones +
//               gastos que NO son de tarjeta + las cuotas que vencen + el
//               resumen de la tarjeta (todo lo que compraste en un pago con
//               crédito y te cobran ahora, sea de este mes o del anterior).
//   · CONSUMO → lo que consumiste este mes: fijos + suscripciones + todos los
//               gastos del mes, sin cuotas ni resumen.
// Nunca se mezclan.
//
// Pesos y dólares tampoco se suman a ciegas: se acumulan por separado y el
// equivalente en pesos se calcula a la cotización elegida (ver cotizacion.js).

import {
  getGastos, getCuotas, getRecurrentes, upsertRecurrente, removeRecurrente,
  getAhorros, addAhorro, updateGasto, getInversiones,
} from './store.js';
import { initInversiones, renderInversiones, renderTesis } from './inversiones.js';
import { estadoMercado, renderMercado } from './mercado.js';
import { aPesos, casaActual, siguienteCasa, onCotizacion, ahorroVsTarjeta } from './cotizacion.js';
import { confirmar } from './dialog.js';
import { detectar, descartar } from './detecciones.js';
import { permiso, pedirPermiso, explicacion, notificar } from './avisos.js';
import {
  mediosCredito, mediosCreditoPorBanco, crearMedioCredito,
  actualizarMedioCredito, borrarMedioCredito,
} from './medios-credito.js';
import {
  fmtARS, fmtUSD, fmtMoneda, fmtCorto, pct, variacion, escapar,
  MES_HOY, hoyIso, addMes, labelMes,
  cero, sumar, masMontos, hayUsd,
  MEDIOS, medioDe, TIPOS,
  vigenteEn, montoEn, contexto, fotoDelMes, deudaPendiente, hitosDeAumento,
  indicadores, ritmoDisponible, pendientesDeReintegro,
} from './fincore.js';

const $ = (sel) => document.querySelector(sel);

/** Equivalente total en pesos. Si todavía no bajó la cotización, los USD no se suman. */
const equiv = (v) => v.ars + (aPesos(v.usd) || 0);
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
let mesDeuda = MES_HOY;     // mes cuyo detalle de cuotas se está mirando

/** Foto del mes con las filas ya ordenadas por peso, listas para pintar. */
function foto(mes, ctx) {
  const f = fotoDelMes(mes, ctx, base);
  const porMonto = (a, b) => enPesos(b.monto, b.r.moneda) - enPesos(a.monto, a.r.moneda);
  f.filasFijos.sort(porMonto);
  f.filasSubs.sort(porMonto);
  return f;
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
  { key: 'tarjetaPeriodo', label: 'Resumen tarjeta', color: 'var(--fin-tarjeta)' },
  { key: 'variable', label: 'Variable', color: 'var(--fin-var)' },
];

/** Serie visible según la base. En CONSUMO no participan del total ni las
 * cuotas (son compras de meses anteriores) ni el resumen de la tarjeta (esos
 * consumos ya están contados en Fijos, Suscripciones y Variable, cada uno en
 * el mes en que se compró). */
const SOLO_CAJA = new Set(['cuotas', 'tarjetaPeriodo']);
const seriesVisibles = () => (base === 'caja' ? SERIES : SERIES.filter((s) => !SOLO_CAJA.has(s.key)));

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

  // Entra a la izquierda, sale a la derecha. Antes el hero mostraba un solo
  // numero gigante (lo que sale) y el ingreso en letra chica abajo: al cargar
  // un sueldo parecia que se habia sumado a los gastos.
  const columnaEntra = ing
    ? `<div class="fin-hero-lado">
         <span class="fin-hero-key">Entra</span>
         <div class="fin-hero-val fin-hero-val--entra">${fmtARS.format(foto.ingresos.ars)}</div>
         ${hayUsd(foto.ingresos) ? `<div class="fin-hero-usd">+ ${fmtUSD.format(foto.ingresos.usd)}</div>` : ''}
       </div>`
    : `<div class="fin-hero-lado">
         <span class="fin-hero-key">Entra</span>
         <button class="fin-cta" id="fin-cta-ingreso">Cargá tu ingreso →</button>
       </div>`;

  return `
    <div class="fin-hero">
      <div class="fin-hero-duo">
        ${columnaEntra}
        <div class="fin-hero-lado fin-hero-lado--sale">
          <span class="fin-hero-key">${base === 'caja' ? 'Sale' : 'Consumís'} ${delta(total, previa ? equiv(previa.egreso) : 0)}</span>
          <div class="fin-hero-val">${fmtARS.format(foto.egreso.ars)}</div>
          ${hayUsd(foto.egreso) ? `<div class="fin-hero-usd">+ ${fmtUSD.format(foto.egreso.usd)}
            ${aPesos(foto.egreso.usd) ? `<span class="cotiz-eq" role="button" tabindex="0" title="Tocá para cambiar de cotización">≈ ${fmtARS.format(aPesos(foto.egreso.usd))} <span class="cotiz-casa">${casaActual().label}</span></span>` : ''}</div>
            ${aPesos(foto.egreso.usd) ? `<div class="fin-hero-suma">= ${fmtARS.format(equiv(foto.egreso))} en total</div>` : ''}` : ''}
        </div>
      </div>
      <div class="fin-alloc">${segmentos}${libre}</div>
      ${ing ? `<div class="fin-hero-linea">
         <span>De cada peso que entra se va ${pct(Math.min(total / ing, 1))}</span>
         <span class="${disp >= 0 ? 'fin-ok' : 'fin-mal'}">
           ${disp >= 0 ? 'Te queda' : 'Te faltan'} <b>${fmtARS.format(Math.abs(disp))}</b>
         </span>
       </div>` : ''}
      <div class="fin-desglose">${desglose || '<div class="fin-vacio-inline">Sin movimientos en este mes.</div>'}</div>
      ${base === 'consumo' && equiv(foto.cuotas) ? `
        <div class="fin-hero-aparte">
          <span class="fin-hero-aparte-punto" style="background:var(--fin-cuota)"></span>
          <span class="fin-hero-aparte-label">Cuotas que pagás este mes</span>
          <span class="fin-hero-aparte-monto">${plata(foto.cuotas)}</span>
        </div>
        <div class="fin-hero-aclara">
          Va aparte porque son compras de <b>meses anteriores</b>: sumarlas acá contaría dos
          veces la misma plata (una cuando compraste, otra cuando la pagás).
          En <b>Caja</b> sí entran, que es lo que realmente sale del bolsillo este mes.
        </div>` : ''}
      ${base === 'caja' && equiv(foto.tarjetaPeriodo) ? `
        <div class="fin-hero-aclara">
          <b>Resumen tarjeta</b> es todo lo que compraste en un pago con crédito y te cobran
          este mes, fijos y suscripciones incluidos${equiv(foto.estructuralTarjeta)
            ? ` (${fmtARS.format(equiv(foto.estructuralTarjeta))} son de ésos)` : ''}.
          En <b>Consumo</b> los ves separados y en el mes en que los compraste.
        </div>` : ''}
    </div>`;
}

/** Los ingresos tienen su propia sección: si no, cargás uno y no lo ves. */
function renderIngresos(foto, ctx) {
  const filas = foto.filasIngresos;
  if (!filas.length) {
    return `<div class="fin-card">
      <div class="fin-card-head"><h2>Ingresos</h2></div>
      <div class="fin-vacio">
        <p>No cargaste ningún ingreso.</p>
        <p class="fin-vacio-sub">Sin esto el panel te dice cuánto gastás, pero no si te alcanza. Sueldo, freelance, un alquiler que cobrés.</p>
      </div>
    </div>`;
  }
  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Ingresos</h2>
        <span class="fin-card-sub">${filas.length} fuente${filas.length !== 1 ? 's' : ''}</span>
      </div>
      ${renderFilas(filas, ctx, { tipo: 'ingreso' })}
      ${filas.length > 1 ? `
        <div class="fin-total">
          <span class="fin-total-label">Total</span>
          <span class="fin-total-delta">${delta(equiv(foto.ingresos), ctx.previa ? equiv(ctx.previa.ingresos) : 0, { bueno: 'suba' })}</span>
          <span class="fin-total-monto fin-ok">${plata(foto.ingresos)}</span>
        </div>` : ''}
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
      valor: fmtCorto(equiv(foto.estructuralTotal)),
      sub: `${delta(equiv(foto.estructuralTotal), previa ? equiv(previa.estructuralTotal) : 0)} ${ing ? `<span class="fin-tile-nota">${pct(equiv(foto.estructuralTotal) / ing)} del ingreso</span>` : ''}`,
      spark: sparkline(fotos.map((f) => equiv(f.estructuralTotal)), 'var(--fin-fijo)'),
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

/**
 * Cuadro de indicadores. No repite montos: muestra los COCIENTES, que es lo
 * que se puede comparar contra un estándar y contra vos mismo del mes pasado.
 * Cada uno trae su semáforo y una línea que explica qué se considera sano —
 * sin eso, un número suelto como "0,4×" no le dice nada a nadie.
 */
function renderIndicadores(fotos, ctx) {
  const ind = indicadores(mesSel, ctx, ctx.foto, equiv, { fotos });
  const conDatos = ind.filter((i) => i.valor != null && isFinite(i.valor));
  if (!conDatos.length) {
    return `<div class="fin-card">
      <div class="fin-card-head"><h2>Indicadores</h2></div>
      <div class="fin-vacio">
        <p>Faltan datos para calcular los ratios.</p>
        <p class="fin-vacio-sub">Con el ingreso y los gastos fijos cargados aparecen acá:
          carga de deuda, cobertura, tasa de ahorro y cuántos meses aguantás sin ingreso.</p>
      </div>
    </div>`;
  }

  const abierto = abiertos.has('indicadores');
  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Indicadores</h2>
        <button class="fin-link" data-accion="toggle" data-id="indicadores">
          ${abierto ? 'Ocultar la letra chica' : '¿Qué significan?'}
        </button>
      </div>
      <div class="fin-indicadores">
        ${ind.map((i) => `
          <div class="fin-ind fin-ind--${i.estado || 'sin'}">
            <div class="fin-ind-label">${i.label}</div>
            <div class="fin-ind-valor">${i.texto}</div>
            <div class="fin-ind-detalle">${i.detalle}</div>
            ${abierto ? `<div class="fin-ind-ayuda">${i.ayuda}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

/** El número más accionable del mes: cuánto te queda por día. */
function renderRitmo(ctx) {
  if (mesSel !== MES_HOY) return '';           // sólo tiene sentido en el mes corriente
  const r = ritmoDisponible(ctx.foto, equiv);
  if (!r) return '';
  const enRojo = r.porDia <= 0;
  const ritmoAlto = r.gastadoPorDia > r.porDia && !enRojo;
  const tope = Math.max(r.porDia, r.gastadoPorDia, 1);

  return `
    <div class="fin-ritmo ${enRojo ? 'fin-ritmo--rojo' : ''}">
      <div class="fin-ritmo-head">
        <div>
          <div class="fin-ritmo-key">Te queda por día</div>
          <div class="fin-ritmo-val">${enRojo ? fmtARS.format(0) : fmtARS.format(r.porDia)}</div>
        </div>
        <div class="fin-ritmo-meta">
          <div>${fmtARS.format(Math.max(0, r.libre))} libres</div>
          <div>${r.restan} día${r.restan !== 1 ? 's' : ''} hasta fin de mes</div>
        </div>
      </div>
      <div class="fin-ritmo-barras">
        <div class="fin-ritmo-fila">
          <span class="fin-ritmo-etq">Podés</span>
          <span class="fin-ritmo-track"><i class="fin-ritmo-bar fin-ritmo-bar--puede"
            style="width:${Math.max(2, (Math.max(0, r.porDia) / tope) * 100).toFixed(1)}%"></i></span>
          <span class="fin-ritmo-num">${fmtARS.format(Math.max(0, r.porDia))}</span>
        </div>
        <div class="fin-ritmo-fila">
          <span class="fin-ritmo-etq">Venís</span>
          <span class="fin-ritmo-track"><i class="fin-ritmo-bar ${ritmoAlto || enRojo ? 'fin-ritmo-bar--alto' : 'fin-ritmo-bar--ok'}"
            style="width:${Math.max(2, (r.gastadoPorDia / tope) * 100).toFixed(1)}%"></i></span>
          <span class="fin-ritmo-num">${fmtARS.format(r.gastadoPorDia)}</span>
        </div>
      </div>
      <div class="fin-ritmo-nota">
        ${enRojo
          ? 'Ya comprometiste todo lo que entra. Cada peso de acá a fin de mes sale de ahorros o de la tarjeta del mes que viene.'
          : ritmoAlto
            ? `A tu ritmo actual te faltarían <b>${fmtARS.format((r.gastadoPorDia - r.porDia) * r.restan)}</b> para llegar.`
            : 'Vas dentro de lo que te podés permitir.'}
      </div>
    </div>`;
}

/** Filas de conceptos (ingresos, fijos o suscripciones) con su historial. */
function renderFilas(filas, ctx, { tipo }) {
  const meses = ctx.meses;
  const esIngreso = tipo === 'ingreso';
  return filas.map(({ r, monto, porTarjeta }) => {
    const serie = meses.map((m) => (vigenteEn(r, m, ctx) ? montoEn(r, m, ctx) : 0));
    const prev = serie.at(-2) || 0;
    const abierto = abiertos.has(r.id);
    const medio = medioDe(r.medio);
    const color = esIngreso ? 'var(--fin-ok)'
      : tipo === 'suscripcion' ? 'var(--fin-sub)' : 'var(--fin-fijo)';
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
          <span class="fin-fila-monto${esIngreso ? ' fin-ok' : ''}">${esIngreso ? '+ ' : ''}${fmtMoneda(monto, r.moneda)}</span>
          <span class="fin-fila-delta">${delta(monto, prev, { chico: true, bueno: esIngreso ? 'suba' : 'baja' })}</span>
        </button>
        <div class="fin-fila-meta">
          ${r.dia ? `<span>${esIngreso ? 'cobrás el' : 'día'} ${r.dia}</span>` : ''}
          ${medio ? `<span>${medio.emoji} ${medio.label}</span>` : ''}
          ${r.moneda === 'USD' && aPesos(monto) ? `<span>≈ ${fmtARS.format(aPesos(monto))}</span>` : ''}
          ${porTarjeta && base === 'caja'
            ? '<span class="fin-badge fin-badge--tarjeta" title="Lo cobra el resumen de la tarjeta: ya está contado dentro de Resumen tarjeta, por eso no se suma otra vez acá">💳 lo paga el resumen</span>'
            : ''}
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
            ${(() => {
              const hitos = hitosDeAumento(r);
              if (!hitos.length) return '';
              return `<div class="fin-hitos">
                <div class="fin-hitos-label">${esIngreso ? 'Historial de aumentos' : 'Cambios de monto'}</div>
                ${hitos.map((h) => `
                  <div class="fin-hito">
                    <span class="fin-hito-mes">${labelMes(h.mes, { corto: true })} ${h.mes.slice(0, 4)}</span>
                    <span class="fin-hito-monto">${fmtMoneda(h.monto, r.moneda)}</span>
                    ${delta(h.monto, h.previo, { bueno: esIngreso ? 'suba' : 'baja', chico: true })}
                  </div>`).join('')}
              </div>`;
            })()}
            ${enEdicion ? `
              <div class="fin-edit">
                <input class="fin-edit-input" id="fin-edit-input" type="text" inputmode="decimal"
                       value="${monto}" aria-label="Nuevo monto">
                <button class="fin-btn fin-btn--ok" data-accion="guardar" data-id="${r.id}">Guardar en ${labelMes(mesSel, { corto: true })}</button>
                <button class="fin-btn" data-accion="cancelar">Cancelar</button>
              </div>`
            : `
              <div class="fin-acciones">
                <button class="fin-btn" data-accion="editar" data-id="${r.id}">${esIngreso ? '✎ Actualizar sueldo/ingreso' : '✎ Actualizar monto'}</button>
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
          <span class="fin-total-delta">${delta(equiv(foto.fijosTotal), totalPrev)}</span>
          <span class="fin-total-monto">${plata(foto.fijosTotal)}</span>
        </div>
        ${hayUsd(foto.fijosTotal) && aPesos(foto.fijosTotal.usd) ? `
          <div class="fin-total-eq">
            <span class="fin-total-eq-label">Todo junto, a ${casaActual().label} de hoy</span>
            <span class="fin-total-eq-monto cotiz-eq" role="button" tabindex="0"
                  title="Tocá para cambiar de cotización">${fmtARS.format(equiv(foto.fijosTotal))}</span>
          </div>` : ''}
        ${equiv(foto.fijosTarjeta) ? `
          <div class="fin-subtotal">
            <span>De eso, <b>${fmtARS.format(equiv(foto.fijosTarjeta))}</b> lo cobra el resumen de la tarjeta</span>
            <span class="fin-subtotal-nota">ya contado en Cuotas — no se suma dos veces</span>
          </div>` : ''}
        <div class="fin-nota">
          ${ing ? `Te comés <b>${pct(equiv(foto.fijosTotal) / ing)}</b> del ingreso antes de gastar un peso. ` : ''}
          Anualizado: <b>${fmtARS.format(equiv(foto.fijosTotal) * 12)}</b>.
        </div>` : ''}
    </div>`;
}

function renderSubs(foto, ctx) {
  const ing = equiv(foto.ingresos);
  const totalUsd = foto.subsTotal.usd;
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
          <span class="fin-total-delta">${delta(equiv(foto.subsTotal), ctx.previa ? equiv(ctx.previa.subsTotal) : 0)}</span>
          <span class="fin-total-monto">${plata(foto.subsTotal)}</span>
        </div>
        ${hayUsd(foto.subsTotal) && aPesos(foto.subsTotal.usd) ? `
          <div class="fin-total-eq">
            <span class="fin-total-eq-label">Todo junto, a ${casaActual().label} de hoy</span>
            <span class="fin-total-eq-monto cotiz-eq" role="button" tabindex="0"
                  title="Tocá para cambiar de cotización">${fmtARS.format(equiv(foto.subsTotal))}</span>
          </div>` : ''}
        ${equiv(foto.subsTarjeta) ? `
          <div class="fin-subtotal">
            <span>De eso, <b>${fmtARS.format(equiv(foto.subsTarjeta))}</b> lo cobra el resumen de la tarjeta</span>
            <span class="fin-subtotal-nota">ya contado en Cuotas — no se suma dos veces</span>
          </div>` : ''}
        <div class="fin-nota">
          En un año son <b>${fmtARS.format(equiv(foto.subsTotal) * 12)}</b>${ing ? ` · ${pct(equiv(foto.subsTotal) / ing)} del ingreso` : ''}.
          ${comp ? `<br>Los ${fmtUSD.format(totalUsd)} en dólares te salen <b>${fmtARS.format(comp.propio)}</b> comprando ${casaActual().label};
            si los paga la tarjeta, ${fmtARS.format(comp.conTarjeta)} → <b class="fin-ok">ahorrás ${fmtARS.format(comp.ahorro)}</b>.` : ''}
        </div>` : ''}
    </div>`;
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

  // Si el mes elegido quedó fuera de la ventana (cambiaste de mes, o se pagó
  // la última cuota), vuelve al primero con deuda en vez de mostrar vacío.
  if (!futuros.some(([m]) => m === mesDeuda)) mesDeuda = futuros[0][0];

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
          <button class="fin-mini-col ${m === mesDeuda ? 'fin-mini-col--sel' : ''}"
                  data-accion="ver-mes-deuda" data-mes="${m}"
                  title="${labelMes(m)}: ${fmtARS.format(equiv(v))}">
            <div class="fin-mini-plot"><div class="fin-mini-bar ${m === pico[0] ? 'fin-mini-bar--pico' : ''}"
                 style="height:${((equiv(v) / tope) * 100).toFixed(1)}%"></div></div>
            <div class="fin-mini-mes">${labelMes(m, { corto: true })}</div>
            <div class="fin-mini-monto">${fmtCorto(equiv(v))}</div>
          </button>`).join('')}
      </div>
      ${(() => {
        // Detalle del mes elegido: qué compras componen esa barra. Antes el
        // monto sólo estaba en el `title` del hover, que en el celular no
        // existe — la pregunta "¿cuánto pago en octubre y por qué?" no tenía
        // respuesta en ninguna pantalla.
        const sel = cal.get(mesDeuda);
        if (!sel || !sel.items?.length) return '';
        const items = sel.items.slice().sort((a, b) => b.monto - a.monto);
        const ingMes = equiv(ctx.foto.ingresos);
        // Las barras son de CAJA (lo que cobra cada mes) pero el "Saldo total"
        // de arriba es deuda (lo que falta pagar). Si el mes elegido ya tiene
        // cuotas cobradas, la diferencia se dice en vez de dejarla implícita.
        const yaPago = cero();
        for (const it of sel.items) if (it.pagada) sumar(yaPago, it.monto, it.moneda);
        return `
          <div class="fin-deuda-mes">
            <div class="fin-deuda-mes-head">
              <span>En <b>${labelMes(mesDeuda)}</b> pagás</span>
              <span class="fin-deuda-mes-total">${plata(sel)}${
                ingMes ? `<span class="fin-deuda-mes-pct">${pct(equiv(sel) / ingMes)} del ingreso</span>` : ''}</span>
            </div>
            ${equiv(yaPago) ? `<div class="fin-deuda-mes-nota">De eso, <b>${plata(yaPago)}</b> ya salió de tu cuenta.</div>` : ''}
            ${items.map((i) => `
              <div class="fin-deuda-item">
                <span class="fin-deuda-item-desc">${escapar(i.desc)}
                  <span class="fin-deuda-item-cuota">cuota ${i.n} de ${i.total}${
                    i.n === i.total ? ' · última' : ''}${i.pagada ? ' · ya pagada' : ''}</span></span>
                <span class="fin-deuda-item-monto">${fmtMoneda(i.monto, i.moneda)}</span>
              </div>`).join('')}
          </div>`;
      })()}
      <div class="fin-nota">
        Mes más pesado: <b>${labelMes(pico[0])}</b> con ${fmtARS.format(equiv(pico[1]))}.
        La última cuota vence en <b>${labelMes(ultimo[0])}</b>: desde ${labelMes(addMes(ultimo[0], 1))} no arrastrás deuda.
      </div>
    </div>`;
}

/**
 * El ahorro pasó a tener pantalla propia (`ahorro.js`): curva proyectada,
 * objetivos con progreso real, stock y fugas. Acá queda el número y la puerta.
 *
 * Antes esta tarjeta traía su propia "meta del X% del ingreso", que competía
 * con los objetivos de la otra pantalla: dos metas distintas para la misma
 * plata. La que sobrevive es la de Ahorro, porque tiene plata real detrás.
 */
function renderAhorro(fotos, ctx) {
  const stock = cero();
  for (const a of ctx.ahorros) {
    if (a.fecha.slice(0, 7) > mesSel) continue;      // respeta el mes que estás mirando
    sumar(stock, a.tipo === 'retiro' ? -a.monto : a.monto, a.moneda);
  }
  const neto = equiv(ctx.foto.aportes) - equiv(ctx.foto.retiros);
  const ing = equiv(ctx.foto.ingresos);

  return `
    <a class="fin-card fin-card--link" href="#/plata/ahorro">
      <div class="fin-card-head">
        <h2>Ahorro</h2>
        <span class="fin-card-sub">ver curva y objetivos ›</span>
      </div>
      <div class="fin-duo">
        <div><div class="fin-duo-key">Acumulado</div><div class="fin-duo-val">${plata(stock)}
          ${hayUsd(stock) && aPesos(stock.usd) ? `<span class="fin-duo-nota">total ≈ ${fmtARS.format(equiv(stock))} a ${casaActual().label}</span>` : ''}</div></div>
        <div><div class="fin-duo-key">Este mes</div><div class="fin-duo-val ${neto >= 0 ? '' : 'fin-mal'}">${fmtARS.format(neto)}
          ${ing ? `<span class="fin-duo-nota">tasa ${pct(neto / ing)}</span>` : ''}</div></div>
      </div>
    </a>`;
}

/**
 * Plata que adelantaste por otros. No es un gasto tuyo ni un ahorro: es un
 * préstamo sin registrar que hasta ahora desaparecía dentro de "variable" y
 * hacía parecer caros meses que no lo fueron.
 */
function renderReintegros(ctx) {
  const grupos = pendientesDeReintegro(ctx.gastos);
  const cobradoMes = equiv(ctx.foto.ajenoCobrado);
  if (!grupos.length && !cobradoMes) return '';

  const total = grupos.reduce((a, g) => a + equiv(g.total), 0);
  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Te deben</h2>
        <span class="fin-card-sub">plata que pusiste vos</span>
      </div>
      ${grupos.length ? `
        <div class="fin-duo">
          <div><div class="fin-duo-key">Pendiente</div>
            <div class="fin-duo-val fin-mal">${fmtARS.format(total)}</div></div>
          <div><div class="fin-duo-key">De</div>
            <div class="fin-duo-val">${grupos.length} ${grupos.length === 1 ? 'persona' : 'personas'}</div></div>
        </div>
        <div class="fin-deudores">
          ${grupos.map((g) => `
            <div class="fin-deudor">
              <span class="fin-deudor-quien">${escapar(g.quien)}
                <span class="fin-deudor-desde">hace ${g.dias} día${g.dias !== 1 ? 's' : ''} · ${g.items.length} ${g.items.length === 1 ? 'gasto' : 'gastos'}</span>
              </span>
              <span class="fin-deudor-monto">${plata(g.total)}</span>
            </div>
            ${g.items.slice(0, 3).map((it) => `
              <div class="fin-deudor-item">
                <span>${escapar(it.descripcion) || 'Gasto'} · ${labelMes(it.fecha.slice(0, 7), { corto: true })} ${it.fecha.slice(8)}</span>
                <span>${fmtMoneda(it.monto, it.moneda)}</span>
              </div>`).join('')}
          `).join('')}
        </div>` : ''}
      <div class="fin-nota">
        ${cobradoMes ? `Este mes te devolvieron <b class="fin-ok">${fmtARS.format(cobradoMes)}</b>. ` : ''}
        Nada de esto cuenta como tu gasto${grupos.length ? ' — pero si no vuelve, en algún momento lo es' : ''}.
        Se marca con 🤝 en cada gasto.
      </div>
    </div>`;
}

/** Bancos y tarjetas: día de cierre y vencimiento de cada uno. Sin esto
 * configurado, un gasto con esa tarjeta sigue agrupando por mes calendario
 * (ver periodoDeGasto en fincore.js) — no hay nada que se rompa por no
 * cargarlo todavía. */
function renderMediosCredito() {
  const grupos = mediosCreditoPorBanco();
  if (!grupos.size) {
    return `<div class="fin-card">
      <div class="fin-card-head"><h2>Bancos y tarjetas</h2></div>
      <div class="fin-vacio">
        <p>Todavía no sincronizaron tus medios de pago.</p>
        <p class="fin-vacio-sub">Esperá a que la app se conecte a internet, o agregá uno nuevo abajo.</p>
      </div>
    </div>`;
  }
  return `<div class="fin-card">
    <div class="fin-card-head">
      <h2>Bancos y tarjetas</h2>
      <span class="fin-card-sub">cierre y vencimiento de cada una</span>
    </div>
    ${[...grupos.entries()].map(([banco, medios]) => `
      <div class="fin-medio-banco">
        <div class="fin-medio-banco-nombre">${escapar(banco)}</div>
        ${medios.map((m) => `
          <div class="fin-medio-fila">
            <span class="fin-medio-emoji">${m.emoji}</span>
            <span class="fin-medio-nombre">${escapar(m.nombre)}</span>
            <label class="fin-medio-dia">cierre
              <input type="number" min="1" max="31" inputmode="numeric"
                     data-medio-id="${m.id}" data-campo="diaCierre" value="${m.diaCierre ?? ''}">
            </label>
            <label class="fin-medio-dia">vence
              <input type="number" min="1" max="31" inputmode="numeric"
                     data-medio-id="${m.id}" data-campo="diaVencimiento" value="${m.diaVencimiento ?? ''}">
            </label>
            <button class="fin-medio-del" data-medio-borrar="${m.id}" aria-label="Borrar ${escapar(m.nombre)}">✕</button>
          </div>`).join('')}
      </div>`).join('')}
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
  const fotos = meses.map((m) => foto(m, ctx));
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

// ---------- Alertas ----------
// La bandeja es el canal principal: no pide permisos, no depende de un
// servidor y está donde ya estás mirando los números.

let alertasActuales = new Map();
let verTodas = false;

function renderAlertas(alertas) {
  alertasActuales = new Map(alertas.map((a) => [a.id, a]));

  const estado = permiso();
  // Si ya lo bloqueó, el botón no puede hacer nada: se muestra la explicación
  // de cómo desbloquearlo en vez de un botón que no responde.
  const botonAvisos = (estado === 'granted' || estado === 'denied' || estado === 'no-soportado')
    ? ''
    : `<button class="fin-link" data-hacer="avisos">🔔 Activar avisos</button>`;

  if (!alertas.length) {
    return `<div class="fin-card">
      <div class="fin-card-head"><h2>Alertas</h2>${botonAvisos}</div>
      <div class="fin-alerta-limpio">✓ Nada raro para marcarte. Reviso suscripciones repetidas,
        aumentos, días caros, duplicados y vencimientos cada vez que abrís el panel.</div>
    </div>`;
  }

  const visibles = verTodas ? alertas : alertas.slice(0, 4);
  const ocultas = alertas.length - visibles.length;

  return `<div class="fin-card">
    <div class="fin-card-head">
      <h2>Alertas <span class="fin-alerta-cuenta">${alertas.length}</span></h2>
      ${botonAvisos}
    </div>
    ${visibles.map((a) => `
      <div class="fin-alerta fin-alerta--${a.nivel}">
        <span class="fin-alerta-icono">${a.icono}</span>
        <div class="fin-alerta-cuerpo">
          <div class="fin-alerta-titulo">${escapar(a.titulo)}</div>
          <div class="fin-alerta-detalle">${a.detalle}</div>
          <div class="fin-alerta-acciones">
            ${a.accion ? `<button class="fin-btn fin-btn--ok" data-hacer="accion" data-alerta="${a.id}">${a.accion.label}</button>` : ''}
            <button class="fin-btn" data-hacer="descartar" data-alerta="${a.id}">Listo, ya sé</button>
          </div>
        </div>
      </div>`).join('')}
    ${ocultas > 0 ? `<button class="fin-ver-mas" data-hacer="ver-todas">Ver ${ocultas} más</button>` : ''}
    ${estado === 'granted' ? '' : `<div class="fin-nota">${explicacion()}</div>`}
  </div>`;
}

/** Globo con la cantidad de alertas accionables sobre la pestaña del Panel. */
function pintarBadge(alertas) {
  const n = alertas.filter((a) => a.nivel !== 'info').length;
  const tab = document.querySelector('.tab[data-view="panel"]');
  if (!tab) return;
  let globo = tab.querySelector('.tab-badge');
  if (!n) { globo?.remove(); return; }
  if (!globo) {
    globo = document.createElement('span');
    globo.className = 'tab-badge';
    tab.appendChild(globo);
  }
  globo.textContent = n > 9 ? '9+' : String(n);
}

async function accionAlerta(hacer, id) {
  if (hacer === 'ver-todas') { verTodas = true; return render(); }

  if (hacer === 'avisos') {
    const r = await pedirPermiso();
    if (r === 'granted') notificar([...alertasActuales.values()]);
    return render();
  }

  const a = alertasActuales.get(id);
  if (!a) return;

  if (hacer === 'descartar') { descartar(id); return render(); }

  if (hacer === 'accion') {
    if (a.accion.tipo === 'ir') {
      return document.querySelector(`.tab[data-view="${a.accion.vista}"]`)?.click();
    }
    if (a.accion.tipo === 'recategorizar') {
      for (const arr of a.accion.datos.arreglos) updateGasto(arr.id, { categoria: arr.categoria });
      descartar(id);
      return render();
    }
    if (a.accion.tipo === 'crear-recurrente') {
      const d = a.accion.datos;
      upsertRecurrente(fusionarConcepto({
        tipo: d.tipo,
        nombre: d.nombre,
        categoria: '',
        monto: d.monto,
        moneda: d.moneda,
        dia: d.dia ?? null,
        medio: d.medio || null,
        estado: 'activo',
        // Guardamos con qué texto matchear para que los gastos ya cargados
        // pasen a contarse como este concepto y no se dupliquen.
        coincide: d.coincide,
        historial: { [MES_HOY]: d.monto },
        created_at: new Date().toISOString(),
      }));
      descartar(id);
      return render();
    }
  }
}

/**
 * Mercado. Se pinta aparte del render principal porque depende de una llamada
 * de red: si esperara, todo el panel quedaría en blanco hasta que responda una
 * API que además es de terceros y puede estar caída.
 */
let mercadoCache = null;
async function pintarMercado(ctx, forzar = false) {
  const el = $('#fin-mercado');
  if (!el) return;
  // El "te quedan libres" conecta el precio con tu realidad: sin eso es una
  // cotización más, de las que hay en cualquier lado.
  const r = ritmoDisponible(ctx.foto, equiv);
  const libre = r && r.libre > 0 ? r.libre : null;

  if (mercadoCache && !forzar) {
    el.innerHTML = renderMercado(mercadoCache, { libre });
    return;
  }
  el.innerHTML = `<div class="fin-card"><div class="fin-card-head"><h2>Mercado</h2></div>
    <div class="fin-vacio-inline">Buscando precios…</div></div>`;
  try {
    mercadoCache = await estadoMercado({ forzar });
    el.innerHTML = renderMercado(mercadoCache, { libre });
  } catch (e) {
    el.innerHTML = renderMercado({ error: String(e.message || e), activos: [] });
  }
}

// ---------- Render principal ----------

function render() {
  const ctx = contexto({
    gastos: getGastos(),
    cuotas: getCuotas(),
    recurrentes: getRecurrentes(),
    ahorros: getAhorros(),
    medios: mediosCredito(),
    inversiones: getInversiones(),
  });

  const meses = Array.from({ length: 6 }, (_, i) => addMes(mesSel, i - 5));
  ctx.meses = meses;
  const fotos = meses.map((m) => foto(m, ctx));
  ctx.foto = fotos.at(-1);
  ctx.previa = fotos.at(-2);

  $('#fin-mes-label').textContent = labelMes(mesSel);
  $('#fin-mes-next').disabled = mesSel >= MES_HOY;
  $('#panel-sub').textContent = 'Qué entra, qué sale y qué queda';
  document.querySelectorAll('#fin-base .seg-btn')
    .forEach((b) => b.classList.toggle('selected', b.dataset.base === base));

  // Las alertas siempre se calculan sobre el mes corriente, aunque estés
  // mirando uno viejo: "el resumen vence en 3 días" no depende de qué mes
  // tengas abierto.
  const alertas = detectar(ctx, mesSel === MES_HOY ? ctx.foto : foto(MES_HOY, ctx));
  $('#fin-alertas').innerHTML = renderAlertas(alertas);
  pintarBadge(alertas);

  $('#fin-hero').innerHTML = renderHero(ctx.foto, ctx.previa);
  $('#fin-kpis').innerHTML = renderKpis(fotos, ctx);
  $('#fin-ritmo').innerHTML = renderRitmo(ctx);
  $('#fin-indicadores').innerHTML = renderIndicadores(fotos, ctx);
  $('#fin-ingresos').innerHTML = renderIngresos(ctx.foto, ctx);
  $('#fin-fijos').innerHTML = renderFijos(ctx.foto, ctx);
  $('#fin-subs').innerHTML = renderSubs(ctx.foto, ctx);
  $('#fin-deuda').innerHTML = renderDeuda(ctx);
  $('#fin-ahorro').innerHTML = renderAhorro(fotos, ctx);
  $('#fin-reintegros').innerHTML = renderReintegros(ctx);
  renderInversiones();
  renderTesis();
  pintarMercado(ctx);
  $('#fin-medios').innerHTML = renderMediosCredito();
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

/**
 * Resuelve sobre qué fila hay que escribir. Si ya existe un concepto con el
 * mismo nombre, se escribe encima en vez de crear otro.
 *
 * Hacía falta porque `upsertRecurrente` deduplica **por id**, y los dos lugares
 * que dan de alta un concepto generaban un `randomUUID()` nuevo cada vez: el
 * "upsert" era siempre un insert. Alcanzaba con que la alerta reapareciera
 * (se descarta en local, así que otro dispositivo la vuelve a mostrar) para
 * que cada toque dejara un duplicado. Así aparecieron tres "Claude".
 *
 * El historial previo se conserva y sólo se pisa el mes que llega: son montos
 * mes a mes que no se pueden reconstruir. El `estado` también se respeta —
 * un concepto que pausaste a propósito no se reactiva solo.
 */
function fusionarConcepto(datos) {
  const nombre = (datos.nombre || '').trim().toLowerCase();
  const previo = getRecurrentes().find((r) => (r.nombre || '').trim().toLowerCase() === nombre);
  if (!previo) return { ...datos, id: crypto.randomUUID() };
  return {
    ...previo,
    ...datos,
    id: previo.id,
    created_at: previo.created_at,
    estado: previo.estado,
    coincide: datos.coincide || previo.coincide,
    historial: { ...previo.historial, ...datos.historial },
  };
}

function guardarConcepto() {
  const nombre = $('#fin-nombre').value.trim();
  const monto = parseMonto($('#fin-monto').value);
  if (!nombre) return $('#fin-nombre').focus();
  if (!monto || monto <= 0) return $('#fin-monto').focus();
  const dia = parseInt($('#fin-dia').value, 10);

  upsertRecurrente(fusionarConcepto({
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
  }));

  $('#fin-nombre').value = '';
  $('#fin-monto').value = '';
  $('#fin-dia').value = '';
  $('#fin-form-concepto').removeAttribute('open');
  render();
}

function guardarMedio() {
  const nombre = $('#medio-nombre').value.trim();
  if (!nombre) return $('#medio-nombre').focus();
  const banco = $('#medio-banco').value.trim();
  const diaCierre = $('#medio-cierre').value ? Math.max(1, Math.min(31, parseInt($('#medio-cierre').value, 10))) : null;
  const diaVencimiento = $('#medio-vencimiento').value ? Math.max(1, Math.min(31, parseInt($('#medio-vencimiento').value, 10))) : null;

  crearMedioCredito({ banco, nombre, diaCierre, diaVencimiento });

  $('#medio-banco').value = '';
  $('#medio-nombre').value = '';
  $('#medio-cierre').value = '';
  $('#medio-vencimiento').value = '';
  $('#fin-form-medio').removeAttribute('open');
  render();
}

async function accionMedio(hacer, id) {
  if (hacer === 'borrar') {
    const ok = await confirmar({
      titulo: '¿Borrar este medio de pago?',
      mensaje: 'Los gastos y cuotas ya cargados con esta tarjeta no se borran, pero dejan de tener cierre configurado.',
      accion: 'Borrar',
      destructivo: true,
    });
    if (ok) { borrarMedioCredito(id); render(); }
  }
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

  // Alta y edición de bancos/tarjetas
  $('#btn-medio-guardar').addEventListener('click', guardarMedio);
  $('#fin-medios').addEventListener('change', (e) => {
    const inp = e.target.closest('[data-medio-id]');
    if (!inp) return;
    const { medioId, campo } = inp.dataset;
    const v = inp.value === '' ? null : Math.max(1, Math.min(31, parseInt(inp.value, 10) || 1));
    inp.value = v ?? '';
    actualizarMedioCredito(medioId, { [campo]: v });
    render();
  });

  // Meta de ahorro (preferencia local, no viaja a la nube)
  const meta = $('#fin-meta-input');
  meta.value = cfg().meta ?? 20;
  meta.addEventListener('change', () => {
    const v = Math.max(0, Math.min(100, Number(meta.value) || 0));
    meta.value = v;
    setCfg({ meta: v });
    render();
  });

  // Delegación: alertas, filas, atajos y cotización
  $('#view-panel').addEventListener('click', (e) => {
    if (e.target.closest('.cotiz-eq')) return siguienteCasa();
    const alerta = e.target.closest('[data-hacer]');
    if (alerta) return accionAlerta(alerta.dataset.hacer, alerta.dataset.alerta);
    const borrarMedio = e.target.closest('[data-medio-borrar]');
    if (borrarMedio) return accionMedio('borrar', borrarMedio.dataset.medioBorrar);
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    const { accion, id } = btn.dataset;
    if (accion === 'ir-cuotas') return document.querySelector('.tab[data-view="cuotas"]').click();
    if (accion === 'ver-mes-deuda') { mesDeuda = btn.dataset.mes; return render(); }
    if (accion === 'refrescar-mercado') {
      const ctxA = contexto({
        gastos: getGastos(), cuotas: getCuotas(), recurrentes: getRecurrentes(),
        ahorros: getAhorros(), medios: mediosCredito(), inversiones: getInversiones(),
      });
      ctxA.foto = fotoDelMes(mesSel, ctxA, base);
      return pintarMercado(ctxA, true);
    }
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

  initInversiones();
  // Una operación nueva mueve indicadores y alertas: se repinta el panel entero.
  document.addEventListener('kbl:inversion-guardada', () => render());
  // La meta de ahorro ahora también se toca desde Ajustes.
  document.addEventListener('kbl:ajustes-cambiaron', () => {
    const meta = $('#fin-meta-input');
    if (meta) meta.value = cfg().meta ?? 20;
    render();
  });

  render();
  // Un solo intento de notificar por arranque, y sólo si ya dio permiso.
  notificar([...alertasActuales.values()]).catch(() => {});
}

export { render as renderPanel };
