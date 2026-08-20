// ====== Módulo Ahorro ======
// El Panel contesta "cómo vengo". Esto contesta la otra mitad: "cómo voy a
// venir, y me alcanza para lo que quiero".
//
// Tres piezas, y ninguna es un número inventado:
//   · CURVA    — ahorro posible mes a mes y acumulado, con el egreso real ya
//                comprometido (resúmenes formados + cuotas firmadas) y el
//                consumo variable al ritmo que traés.
//   · OBJETIVOS— metas con progreso REAL: la barra sale de los aportes
//                cargados, no de un porcentaje escrito a mano. Cada una dice
//                en qué mes cae si mantenés la curva.
//   · FUGAS    — de dónde saldría la plata: suscripciones mal declaradas o
//                fantasma, y el gasto variable por categoría.
//
// Comparte `fincore.js` con el Panel a propósito: si "cuánto sobra en octubre"
// diera distinto en dos pantallas, las dos dejarían de servir.

import {
  getGastos, getCuotas, getRecurrentes, getAhorros, getInversiones,
  getObjetivos, upsertObjetivo, removeObjetivo, addAhorro, upsertRecurrente,
} from './store.js';
import { mediosCredito } from './medios-credito.js';
import { aPesos, casaActual } from './cotizacion.js';
import { confirmar, pedirTexto } from './dialog.js';
import {
  fmtARS, fmtUSD, fmtMoneda, fmtCorto, pct, escapar,
  MES_HOY, hoyIso, addMes, labelMes, contexto, fotoDelMes,
  cero, sumar, hayUsd, curvaAhorro, auditarSubs, costoSubs, etaObjetivo, variableTipico,
} from './fincore.js';

const $ = (sel) => document.querySelector(sel);
const equiv = (v) => v.ars + (aPesos(v.usd) || 0);
const eq = equiv;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const MESES_CURVA = 12;

function ctxActual() {
  return contexto({
    gastos: getGastos(), cuotas: getCuotas(), recurrentes: getRecurrentes(),
    ahorros: getAhorros(), medios: mediosCredito(), inversiones: getInversiones(),
  });
}

// ---------- Gráfico de la curva ----------
// Barras = ahorro de cada mes (rojo si es negativo). Línea = acumulado, que
// es lo que de verdad importa cuando la pregunta es "¿llego a juntar X?".

function grafico(filas) {
  const W = 320, H = 120, PAD = 14;
  const ahorros = filas.map((f) => f.ahorro);
  const acums = filas.map((f) => f.acumulado);
  const max = Math.max(...ahorros, ...acums, 0);
  const min = Math.min(...ahorros, ...acums, 0);
  const rango = (max - min) || 1;
  const y = (v) => PAD + (1 - (v - min) / rango) * (H - PAD * 2);
  const bw = (W - PAD * 2) / filas.length;

  const barras = filas.map((f, i) => {
    const x = PAD + i * bw + bw * 0.18;
    const w = bw * 0.64;
    const y0 = y(0), y1 = y(f.ahorro);
    return `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}"
      width="${w.toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}"
      rx="2" fill="${f.ahorro >= 0 ? 'var(--fin-ok, #2fa36b)' : 'var(--fin-mal, #d9534f)'}"
      opacity=".55"/>`;
  }).join('');

  const pts = filas.map((f, i) => `${(PAD + i * bw + bw / 2).toFixed(1)},${y(f.acumulado).toFixed(1)}`).join(' ');
  const cero0 = y(0);

  return `<svg class="ah-graf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="Ahorro mensual y acumulado, próximos ${filas.length} meses">
    <line x1="0" y1="${cero0.toFixed(1)}" x2="${W}" y2="${cero0.toFixed(1)}"
      stroke="currentColor" stroke-width=".5" opacity=".35" stroke-dasharray="3 3"/>
    ${barras}
    <polyline points="${pts}" fill="none" stroke="var(--fin-ahorro, #4a8fe7)" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// ---------- Secciones ----------

/**
 * Stock acumulado y movimientos. Vivía en el Panel; se mudó acá para que el
 * ahorro tenga UN solo lugar en la app. El Panel dejó un acceso, no una copia:
 * dos tarjetas de ahorro con cuentas parecidas era la garantía de que en algún
 * momento dijeran cosas distintas.
 */
/** Meta de tasa de ahorro (% del ingreso). La misma que se edita en el Panel. */
function metaPct() {
  try { return Number(JSON.parse(localStorage.getItem('kbl.panel'))?.meta ?? 20); } catch { return 20; }
}

function renderStock(ctx) {
  const stock = cero();
  for (const a of ctx.ahorros) {
    if (a.fecha.slice(0, 7) > MES_HOY) continue;
    sumar(stock, a.tipo === 'retiro' ? -a.monto : a.monto, a.moneda);
  }
  const f = fotoDelMes(MES_HOY, ctx, 'caja');
  const neto = eq(f.aportes) - eq(f.retiros);
  const ing = eq(f.ingresos);
  const ultimos = ctx.ahorros.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
  // Dos cosas distintas y complementarias: la META es un ritmo (% del ingreso,
  // todos los meses) y los OBJETIVOS son montos concretos. Antes la meta vivía
  // en el Panel y los objetivos acá, sin verse nunca juntos.
  const meta = metaPct();
  const objetivoMes = ing * (meta / 100);
  const avance = objetivoMes ? Math.min(neto / objetivoMes, 1) : 0;

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Lo que ya juntaste</h2>
        <span class="fin-card-sub">stock acumulado</span>
      </div>
      <div class="fin-duo">
        <div>
          <div class="fin-duo-key">Acumulado</div>
          <div class="fin-duo-val">${fmtARS.format(stock.ars)}
            ${hayUsd(stock) ? `<span class="fin-duo-nota">+ ${fmtUSD.format(stock.usd)}</span>` : ''}</div>
        </div>
        <div>
          <div class="fin-duo-key">Este mes</div>
          <div class="fin-duo-val ${neto >= 0 ? '' : 'fin-mal'}">${fmtARS.format(neto)}
            ${ing ? `<span class="fin-duo-nota">tasa ${pct(neto / ing)}</span>` : ''}</div>
        </div>
      </div>
      ${ing ? `
        <div class="fin-meta">
          <div class="fin-meta-head">
            <span>Meta: <b>${meta}%</b> del ingreso (${fmtARS.format(objetivoMes)})</span>
            <span class="${neto >= objetivoMes ? 'fin-ok' : 'fin-soft'}">${
              neto >= objetivoMes ? '✓ cumplida' : `faltan ${fmtARS.format(objetivoMes - neto)}`}</span>
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
        </div>` : `
        <div class="fin-vacio">
          <p>Todavía no registraste ningún aporte.</p>
          <p class="fin-vacio-sub">Cada vez que apartes plata (o compres dólares), cargalo acá:
            es lo que convierte la curva de arriba en algo que podés verificar.</p>
        </div>`}
    </div>`;
}

function renderCurva(curva, ctx) {
  const f0 = curva.filas[0];
  const fin = curva.filas[curva.filas.length - 1];
  // El primer mes negativo es la señal que importa: hasta ahí no sobra nada.
  const duros = curva.filas.filter((f) => f.ahorro < 0);
  const primerAlivio = curva.filas.find((f, i) => i > 0 && f.ahorro > 0 && curva.filas[i - 1].ahorro <= 0);

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Curva de ahorro</h2>
        <span class="fin-card-sub">próximos ${MESES_CURVA} meses</span>
      </div>

      <div class="fin-duo">
        <div>
          <div class="fin-duo-key">Este mes</div>
          <div class="fin-duo-val ${f0.ahorro >= 0 ? '' : 'fin-mal'}">${fmtARS.format(f0.ahorro)}
            ${f0.ingreso ? `<span class="fin-duo-nota">tasa ${pct(f0.tasa)}</span>` : ''}</div>
        </div>
        <div>
          <div class="fin-duo-key">Acumulado a ${labelMes(fin.mes, { corto: true })} ${fin.mes.slice(0, 4)}</div>
          <div class="fin-duo-val ${fin.acumulado >= 0 ? 'fin-ok' : 'fin-mal'}">${fmtARS.format(fin.acumulado)}</div>
        </div>
      </div>

      ${grafico(curva.filas)}

      <div class="ah-leyenda">
        <span><i class="ah-chip ah-chip--barra"></i> ahorro del mes</span>
        <span><i class="ah-chip ah-chip--linea"></i> acumulado</span>
      </div>

      ${duros.length ? `
        <div class="fin-nota fin-nota--alerta">
          ${duros.length === 1
            ? `<b>${labelMes(duros[0].mes)}</b> cierra en rojo por ${fmtARS.format(-duros[0].ahorro)}.`
            : `<b>${duros.length} meses</b> cierran en rojo (${duros.map((d) => labelMes(d.mes, { corto: true })).join(', ')}).`}
          ${primerAlivio ? ` A partir de <b>${labelMes(primerAlivio.mes)}</b> empieza a sobrar.` : ''}
        </div>` : ''}

      <div class="ah-tabla">
        <div class="ah-fila ah-fila--head">
          <span>Mes</span><span>Comprometido</span><span>Variable</span><span>Sobra</span><span>Acumulado</span>
        </div>
        ${curva.filas.map((f) => `
          <div class="ah-fila">
            <span class="ah-mes">${labelMes(f.mes, { corto: true })}<small>${f.mes.slice(2, 4)}</small></span>
            <span>${fmtCorto(f.comprometido)}</span>
            <span class="fin-soft">${f.faltante ? '+' + fmtCorto(f.faltante) : '—'}</span>
            <span class="${f.ahorro >= 0 ? 'fin-ok' : 'fin-mal'}">${fmtCorto(f.ahorro)}</span>
            <span class="${f.acumulado >= 0 ? '' : 'fin-mal'}">${fmtCorto(f.acumulado)}</span>
          </div>`).join('')}
      </div>

      <div class="fin-nota">
        <b>Comprometido</b> es lo que ya no podés no pagar: resúmenes formados, cuotas firmadas,
        fijos y suscripciones. <b>Variable</b> es lo que falta para llegar a tu ritmo real de gasto
        (${fmtARS.format(curva.tipico)} por mes, mediana de los últimos 3 meses cerrados).
        ${curva.tipico ? '' : ' <b>Sin ritmo calculado todavía</b>: hacen falta meses cerrados con gastos cargados.'}
      </div>
    </div>`;
}

function renderObjetivos(objetivos, curva, ctx) {
  const ahorros = ctx.ahorros;
  const activos = objetivos.filter((o) => o.estado === 'activo' || o.estado === 'cumplido');

  const conProgreso = activos.map((o) => {
    const propios = ahorros.filter((a) => a.objetivoId === o.id && (a.moneda || 'ARS') === o.moneda);
    const acumulado = propios.reduce((s, a) => s + (a.tipo === 'retiro' ? -a.monto : a.monto), 0);
    const faltante = Math.max(0, o.monto - acumulado);
    const avance = o.monto ? Math.min(acumulado / o.monto, 1) : 0;
    // El ETA se calcula en pesos: si la meta es en dólares hay que llevarla.
    const faltanteArs = o.moneda === 'USD' ? (aPesos(faltante) || 0) : faltante;
    const eta = faltanteArs ? etaObjetivo(faltanteArs, curva) : { mes: null, cumplido: true };
    return { o, acumulado, faltante, avance, eta, faltanteArs };
  }).sort((a, b) => (a.o.prioridad - b.o.prioridad) || (b.avance - a.avance));

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Objetivos</h2>
        <button class="fin-btn" id="ah-nuevo-objetivo">+ Nuevo</button>
      </div>

      <form class="ah-form" id="ah-form" hidden>
        <input class="ah-in" name="nombre" placeholder="Fondo de emergencia" required maxlength="60" autocomplete="off">
        <div class="ah-form-fila">
          <input class="ah-in ah-in--monto" name="monto" placeholder="500000" inputmode="decimal" required>
          <label class="ah-radio"><input type="radio" name="moneda" value="ARS" checked><span>$</span></label>
          <label class="ah-radio"><input type="radio" name="moneda" value="USD"><span>US$</span></label>
        </div>
        <div class="ah-form-fila">
          <input class="ah-in" name="fecha" type="date" aria-label="Para cuándo (opcional)">
          <select class="ah-in" name="prioridad" aria-label="Prioridad">
            <option value="1">Alta</option>
            <option value="2" selected>Media</option>
            <option value="3">Baja</option>
          </select>
        </div>
        <div class="ah-form-btns">
          <button type="button" class="fin-btn" id="ah-cancelar">Cancelar</button>
          <button type="submit" class="fin-btn fin-btn--ok">Guardar</button>
        </div>
      </form>

      ${conProgreso.length ? conProgreso.map(({ o, acumulado, faltante, avance, eta }) => {
        const listo = faltante <= 0;
        const tarde = o.fecha && eta.mes && eta.mes > o.fecha.slice(0, 7);
        return `
          <div class="ah-obj ${listo ? 'ah-obj--listo' : ''}">
            <div class="ah-obj-head">
              <span class="ah-obj-nombre">
                <span class="ah-obj-prio" title="Prioridad">${'●'.repeat(4 - o.prioridad)}</span>
                ${escapar(o.nombre)}
              </span>
              <span class="ah-obj-monto">${fmtMoneda(acumulado, o.moneda)} <small>/ ${fmtMoneda(o.monto, o.moneda)}</small></span>
            </div>
            <div class="fin-meta-barra"><div class="fin-meta-fill" style="width:${(avance * 100).toFixed(1)}%"></div></div>
            <div class="ah-obj-pie">
              ${listo
                ? `<span class="fin-ok">✓ cumplido</span>`
                : `<span class="fin-soft">faltan ${fmtMoneda(faltante, o.moneda)}</span>
                   <span class="${tarde ? 'fin-mal' : 'fin-soft'}">
                     ${eta.mes
                       ? `a este ritmo: ${labelMes(eta.mes)}`
                       : 'a este ritmo no llega'}
                     ${o.fecha ? ` · querías ${labelMes(o.fecha.slice(0, 7), { corto: true })} ${o.fecha.slice(0, 4)}` : ''}
                   </span>`}
              <span class="ah-obj-acciones">
                <button class="fin-btn" data-aportar="${o.id}">Aporté</button>
                <button class="fin-btn fin-btn--del" data-borrar-obj="${o.id}">✕</button>
              </span>
            </div>
          </div>`;
      }).join('') : `
        <div class="fin-vacio">
          <p>Sin objetivos cargados.</p>
          <p class="fin-vacio-sub">Poné una meta con monto y fecha, y la curva de arriba te dice
            en qué mes cae si mantenés el ritmo — o si directamente no llega.</p>
        </div>`}
    </div>`;
}

function renderFugas(ctx, curva) {
  const subs = auditarSubs(ctx, eq);
  const costo = costoSubs(ctx);
  const problemas = subs.filter((s) => s.estado !== 'ok');

  // Gasto variable por categoría: mediana de los últimos 3 meses cerrados.
  const cats = new Map();
  for (let i = 1; i <= 3; i++) {
    const mes = addMes(MES_HOY, -i);
    for (const g of (ctx.gastosPorMes.get(mes) || [])) {
      if (ctx.match.has(g.id) || g.reintegro) continue;
      const k = g.categoria || 'otros';
      if (!cats.has(k)) cats.set(k, new Map());
      const porMes = cats.get(k);
      porMes.set(mes, (porMes.get(mes) || 0) + (g.moneda === 'USD' ? (aPesos(g.monto) || 0) : g.monto));
    }
  }
  const EMOJI = {
    comida: '🍔', super: '🛒', transporte: '🚗', salidas: '🎉',
    servicios: '🔁', educacion: '🎓', casa: '🏠', salud: '💊',
    impuestos: '🧾', otros: '📦',
  };
  const filasCat = [...cats.entries()].map(([k, porMes]) => {
    const vals = [1, 2, 3].map((i) => porMes.get(addMes(MES_HOY, -i)) || 0);
    const orden = vals.slice().sort((a, b) => a - b);
    return { k, tipico: orden[1], vals };   // mediana de 3
  }).filter((f) => f.tipico > 0).sort((a, b) => b.tipico - a.tipico);
  const totalCat = filasCat.reduce((s, f) => s + f.tipico, 0);

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>De dónde sale</h2>
        <span class="fin-card-sub">lo que se puede mover</span>
      </div>

      <div class="fin-duo">
        <div>
          <div class="fin-duo-key">Suscripciones</div>
          <div class="fin-duo-val">${fmtARS.format(costo.ars)}
            ${hayUsd(costo) ? `<span class="fin-duo-nota">+ ${fmtUSD.format(costo.usd)}${
              // Sin cotización bajada, `aPesos` da 0 y el "≈" mostraría los
              // pesos solos como si fueran el total: mejor no decir nada.
              aPesos(costo.usd) ? ` ≈ ${fmtARS.format(equiv(costo))}` : ''
            }</span>` : ''}</div>
        </div>
        <div>
          <div class="fin-duo-key">Variable típico</div>
          <div class="fin-duo-val">${fmtARS.format(curva.tipico)}<span class="fin-duo-nota">por mes</span></div>
        </div>
      </div>

      ${problemas.length ? `
        <div class="ah-subs">
          <div class="ah-subs-titulo">${problemas.length} ${problemas.length > 1 ? 'suscripciones' : 'suscripción'} para revisar</div>
          ${problemas.map((s) => `
            <div class="ah-sub">
              <span class="ah-sub-nombre">${escapar(s.r.nombre)}</span>
              ${s.estado === 'fantasma'
                ? `<span class="ah-sub-estado fin-soft">no se cobró hace 3 meses</span>
                   <span class="ah-sub-monto">${fmtMoneda(s.declarado, s.r.moneda)}</span>`
                : `<span class="ah-sub-estado ${s.real > s.declarado || !s.mismaMoneda ? 'fin-mal' : 'fin-ok'}">
                     declarás ${fmtMoneda(s.declarado, s.r.moneda)} · te cobran ${fmtMoneda(s.real, s.moneda)}</span>
                   <button class="fin-btn" data-fix-sub="${s.r.id}"
                     data-monto="${s.real}" data-moneda="${s.moneda}">Corregir</button>`}
            </div>`).join('')}
          <div class="fin-nota">Una suscripción mal declarada mueve toda la curva: el gasto fijo
            entra en cada uno de los ${MESES_CURVA} meses proyectados.</div>
        </div>` : `
        <div class="fin-nota fin-nota--ok">✓ Las ${subs.length} suscripciones declaradas coinciden con lo que te cobran.</div>`}

      ${filasCat.length ? `
        <div class="ah-cats">
          <div class="ah-subs-titulo">Gasto variable por rubro <small>mediana de 3 meses</small></div>
          ${filasCat.map((f) => `
            <div class="ah-cat">
              <span class="ah-cat-nombre">${EMOJI[f.k] || '📦'} ${f.k}</span>
              <span class="ah-cat-barra"><i style="width:${((f.tipico / (filasCat[0].tipico || 1)) * 100).toFixed(1)}%"></i></span>
              <span class="ah-cat-monto">${fmtCorto(f.tipico)}</span>
              <span class="ah-cat-pct fin-soft">${totalCat ? pct(f.tipico / totalCat) : ''}</span>
            </div>`).join('')}
          <div class="fin-nota">Bajar un 10% el rubro más grande son
            <b>${fmtARS.format(filasCat[0].tipico * 0.1)}</b> por mes,
            ${fmtARS.format(filasCat[0].tipico * 0.1 * 12)} en un año.</div>
        </div>` : ''}
    </div>`;
}

// ---------- Altas ----------

/**
 * Number() a la argentina. Los tres se escriben y los tres valen lo mismo:
 * "1.500.000", "1500000" y "1.500.000,50".
 *
 * La regla del punto: con coma presente es separador de miles, siempre. Sin
 * coma, es de miles cuando hay más de uno o cuando lo siguen exactamente 3
 * dígitos — acá nadie escribe "1.500" para decir uno coma cinco.
 */
function aNumero(str) {
  const limpio = String(str || '').replace(/[^\d.,-]/g, '');
  if (limpio.includes(',')) return Number(limpio.replace(/\./g, '').replace(',', '.'));
  const puntos = (limpio.match(/\./g) || []).length;
  if (puntos > 1 || /\.\d{3}$/.test(limpio)) return Number(limpio.replace(/\./g, ''));
  return Number(limpio);
}

function guardarObjetivo(form) {
  const d = new FormData(form);
  const nombre = String(d.get('nombre') || '').trim();
  const monto = aNumero(d.get('monto'));
  if (!nombre || !monto || monto <= 0) return;

  upsertObjetivo({
    id: uid(),
    nombre,
    monto,
    moneda: d.get('moneda') === 'USD' ? 'USD' : 'ARS',
    fecha: String(d.get('fecha') || ''),
    prioridad: Number(d.get('prioridad')) || 2,
    estado: 'activo',
    nota: '',
    updated: Date.now(),
  });
  render();
}

async function aportar(objetivoId) {
  const obj = getObjetivos().find((o) => o.id === objetivoId);
  if (!obj) return;
  const txt = await pedirTexto({
    titulo: `Aporte a "${obj.nombre}"`,
    mensaje: `¿Cuánto pusiste? En ${obj.moneda === 'USD' ? 'dólares' : 'pesos'}.`,
    placeholder: '50000',
    accion: 'Sumar',
  });
  const monto = aNumero(txt);
  if (!monto || monto <= 0) return;

  addAhorro({
    id: uid(),
    fecha: hoyIso(),
    monto,
    moneda: obj.moneda,
    tipo: 'aporte',
    destino: obj.nombre,
    objetivoId: obj.id,
    nota: '',
    ts: Date.now(),
  });
  render();
}

async function borrarObjetivo(id) {
  const obj = getObjetivos().find((o) => o.id === id);
  if (!obj) return;
  const ok = await confirmar({
    titulo: `¿Borrar "${obj.nombre}"?`,
    mensaje: 'Los aportes NO se borran: quedan como ahorro general.',
    accion: 'Borrar',
    destructivo: true,
  });
  if (!ok) return;
  removeObjetivo(id);
  render();
}

/** Pone en el recurrente lo que la tarjeta cobra de verdad. */
function corregirSub(id, monto, moneda) {
  const r = getRecurrentes().find((x) => x.id === id);
  if (!r) return;
  upsertRecurrente({ ...r, monto: Number(monto), moneda, updated: Date.now() });
  render();
}

// ---------- Render ----------

export function renderAhorro() {
  const cont = $('#ahorro-cont');
  if (!cont) return;

  const ctx = ctxActual();
  const curva = curvaAhorro(ctx, eq, { meses: MESES_CURVA });
  const objetivos = getObjetivos();

  const sinIngreso = !curva.filas[0].ingreso;
  cont.innerHTML = sinIngreso
    ? `<div class="fin-card"><div class="fin-vacio">
         <p>Falta declarar el ingreso.</p>
         <p class="fin-vacio-sub">Sin ingreso no hay ahorro posible que calcular.
           Cargalo en Panel → Ingresos y esta pantalla se arma sola.</p></div></div>`
    : renderCurva(curva, ctx) + renderObjetivos(objetivos, curva, ctx)
      + renderStock(ctx) + renderFugas(ctx, curva);

  const sub = $('#ahorro-sub');
  if (sub) {
    sub.textContent = sinIngreso
      ? 'sin ingreso declarado'
      : `ritmo actual: ${fmtARS.format(curva.tipico)}/mes de gasto variable`;
  }
}

const render = renderAhorro;

export function initAhorro() {
  const cont = $('#ahorro-cont');
  if (!cont) return;

  cont.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'ah-nuevo-objetivo') {
      const form = $('#ah-form');
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('[name=nombre]').focus();
      return;
    }
    if (t.id === 'ah-cancelar') { $('#ah-form').hidden = true; return; }
    if (t.dataset.aportar) return void aportar(t.dataset.aportar);
    if (t.dataset.borrarObj) return void borrarObjetivo(t.dataset.borrarObj);
    if (t.dataset.fixSub) return void corregirSub(t.dataset.fixSub, t.dataset.monto, t.dataset.moneda);
  });

  // El form se re-crea en cada render, así que el listener va en el contenedor.
  cont.addEventListener('submit', (e) => {
    if (e.target.id !== 'ah-form') return;
    e.preventDefault();
    guardarObjetivo(e.target);
  });
}
