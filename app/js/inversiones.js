// ====== Inversiones ======
// La distinción que ordena todo el módulo: lo que SALE de tu caja no es lo
// que QUEDA invertido. En la compra de 40 NFLX salieron $98.512,42 pero
// quedaron $97.920 en el activo; los $592,42 de diferencia son costo de
// transacción y no vuelven nunca.
//
// Por eso `bruto` (cantidad × precio) y los costos viven separados: sumarlos
// al costo unitario haría que el rendimiento se vea mejor de lo que es, y
// además taparía cuánto te sale operar — que en montos chicos es EL problema
// (0,6% de ida y 0,6% de vuelta se come un año de dividendos).
//
// Sin cotizaciones en vivo: la app no dice cuánto vale hoy tu cartera, dice
// cuánto pusiste y cuánto te costó ponerlo. Es lo que se puede afirmar sin
// depender de un feed de precios que puede estar caído o pago.

import { getInversiones, addInversion, removeInversion } from './store.js';
import { confirmar } from './dialog.js';
import { fmtARS, fmtMoneda, pct, escapar, hoyIso } from './fincore.js';
import { aPesos } from './cotizacion.js';

const $ = (sel) => document.querySelector(sel);

export const CLASES = [
  { key: 'cedear', emoji: '🇺🇸', label: 'CEDEAR' },
  { key: 'accion', emoji: '📈', label: 'Acción' },
  { key: 'bono', emoji: '📜', label: 'Bono' },
  { key: 'fci', emoji: '🧺', label: 'FCI' },
  { key: 'cripto', emoji: '₿', label: 'Cripto' },
  { key: 'dolar', emoji: '💵', label: 'Dólar' },
  { key: 'plazofijo', emoji: '🏦', label: 'Plazo fijo' },
];
export const claseDe = (k) => CLASES.find((c) => c.key === k);

/** Lo que salió de la caja por esta operación. */
export const netoDe = (op) =>
  op.cantidad * op.precio_unitario + (op.comisiones || 0) + (op.gastos_op || 0);

/** Lo que quedó invertido de verdad (sin los costos). */
export const brutoDe = (op) => op.cantidad * op.precio_unitario;

export const costosDe = (op) => (op.comisiones || 0) + (op.gastos_op || 0);

/**
 * Posición por instrumento, con costo promedio ponderado. Una venta baja la
 * cantidad al PPP vigente: así el costo del remanente no se distorsiona por
 * haber vendido en un momento bueno o malo.
 */
export function posiciones(inversiones) {
  const orden = inversiones.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const mapa = new Map();
  for (const op of orden) {
    const k = op.instrumento;
    if (!mapa.has(k)) {
      mapa.set(k, {
        instrumento: k, clase: op.clase || '', moneda: op.moneda || 'ARS',
        cantidad: 0, invertido: 0, costos: 0, realizado: 0, ops: 0,
      });
    }
    const p = mapa.get(k);
    p.ops++;
    p.costos += costosDe(op);
    if (op.clase && !p.clase) p.clase = op.clase;

    if (op.tipo === 'compra') {
      p.cantidad += op.cantidad;
      p.invertido += brutoDe(op);
    } else if (op.tipo === 'venta') {
      const ppp = p.cantidad ? p.invertido / p.cantidad : op.precio_unitario;
      const vendidas = Math.min(op.cantidad, p.cantidad);
      p.realizado += (op.precio_unitario - ppp) * vendidas - costosDe(op);
      p.cantidad -= vendidas;
      p.invertido -= ppp * vendidas;
    } else {
      p.realizado += brutoDe(op) - costosDe(op);   // dividendo / renta
    }
  }
  for (const p of mapa.values()) {
    p.ppp = p.cantidad ? p.invertido / p.cantidad : 0;
    if (p.invertido < 0.01) p.invertido = 0;
  }
  return [...mapa.values()].sort((a, b) => b.invertido - a.invertido);
}

/**
 * Cuánto te sale operar. El ratio contra el bruto es el número accionable:
 * arriba de 1% por operación, en montos chicos, el costo se come el retorno
 * esperado antes de empezar.
 */
export function costoDeOperar(inversiones) {
  const compras = inversiones.filter((i) => i.tipo === 'compra' || i.tipo === 'venta');
  const bruto = compras.reduce((a, i) => a + brutoDe(i), 0);
  const costos = compras.reduce((a, i) => a + costosDe(i), 0);
  return {
    bruto, costos, ops: compras.length,
    ratio: bruto ? costos / bruto : 0,
    porOp: compras.length ? costos / compras.length : 0,
  };
}

const eqPesos = (monto, moneda) => (moneda === 'USD' ? (aPesos(monto) || monto) : monto);

// ---------- Punto de equilibrio ----------
// Matemática pura, sin pronóstico: dado lo que pagaste de comisiones, ¿a qué
// precio salís empatado? Es el número que nadie te muestra ANTES de comprar y
// el que decide si una operación tenía sentido desde el arranque.
//
//   Desembolsaste:  N·P + C_compra
//   Al vender a X:  N·X − C_venta
//   Asumiendo la misma tasa de costo en la salida (C = tasa·N·precio):
//   N·X·(1 − tasa) = N·P + C_compra
//   →  X = P · (1 + tasa) / (1 − tasa)
//
// La salida se estima con la tasa de la compra porque es el dato que tenés.
// Si tu broker cobra distinto al vender, el número real es peor, nunca mejor.

export function puntoDeEquilibrio(op) {
  const bruto = brutoDe(op);
  if (!bruto) return null;
  const tasa = costosDe(op) / bruto;
  const precioEmpate = op.precio_unitario * (1 + tasa) / (1 - tasa);
  return {
    tasa,
    precioEmpate,
    subaNecesaria: (precioEmpate - op.precio_unitario) / op.precio_unitario,
    costoIdaYVuelta: precioEmpate * op.cantidad * tasa + costosDe(op),
  };
}

/** Cuánto ganás (neto de costos de salida) si vendés a `precio`. */
export function resultadoA(op, precio) {
  const eq = puntoDeEquilibrio(op);
  if (!eq) return null;
  const entrada = brutoDe(op) + costosDe(op);
  const salida = op.cantidad * precio * (1 - eq.tasa);
  return { neto: salida - entrada, retorno: (salida - entrada) / entrada };
}

// ---------- Tesis ----------
// Escribís por qué comprás ANTES de saber cómo salió. Después la app te dice
// tu tasa de acierto real, que es el único dato que distingue tener criterio
// de acordarte selectivamente de los aciertos.

export const tieneTesis = (op) => !!(op.tesis || op.precio_objetivo || op.fecha_objetivo);

/**
 * Estado de cada tesis contra la posición viva. `cerrada` cuando ya no queda
 * nada de ese instrumento: ahí el resultado es real y cuenta para el score.
 */
export function tesisAbiertas(inversiones, hoy = hoyIso()) {
  const pos = new Map(posiciones(inversiones).map((p) => [p.instrumento, p]));
  return inversiones
    .filter((op) => op.tipo === 'compra' && tieneTesis(op))
    .map((op) => {
      const p = pos.get(op.instrumento);
      const eq = puntoDeEquilibrio(op);
      const cerrada = !p || p.cantidad < 1e-9;
      const dias = Math.round((new Date(hoy + 'T00:00:00') - new Date(op.fecha + 'T00:00:00')) / 86400000);
      const vencida = op.fecha_objetivo && op.fecha_objetivo < hoy && !cerrada;
      const potencial = op.precio_objetivo ? resultadoA(op, op.precio_objetivo) : null;
      return {
        op, eq, cerrada, dias, vencida, potencial,
        // Resultado realizado sólo si la posición se cerró entera.
        resultado: cerrada && p ? p.realizado : null,
        diasObjetivo: op.fecha_objetivo
          ? Math.round((new Date(op.fecha_objetivo + 'T00:00:00') - new Date(hoy + 'T00:00:00')) / 86400000)
          : null,
      };
    })
    .sort((a, b) => Number(a.cerrada) - Number(b.cerrada) || b.op.fecha.localeCompare(a.op.fecha));
}

/**
 * El número incómodo: de las tesis que cerraste, cuántas dieron ganancia neta.
 * Debajo de ~8 casos no se muestra veredicto — con 3 operaciones cualquiera
 * parece Warren Buffett o un desastre, y las dos lecturas serían ruido.
 */
export function scoreDeTesis(inversiones) {
  const cerradas = tesisAbiertas(inversiones).filter((t) => t.cerrada && t.resultado != null);
  if (!cerradas.length) return null;
  const ganadoras = cerradas.filter((t) => t.resultado > 0);
  const diasProm = cerradas.reduce((a, t) => a + t.dias, 0) / cerradas.length;
  const cortas = cerradas.filter((t) => t.dias <= 30);
  const largas = cerradas.filter((t) => t.dias > 90);
  const medRes = (xs) => {
    if (!xs.length) return null;
    const s = xs.map((t) => t.resultado).sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return {
    total: cerradas.length,
    ganadoras: ganadoras.length,
    tasa: ganadoras.length / cerradas.length,
    neto: cerradas.reduce((a, t) => a + t.resultado, 0),
    diasProm,
    medianaCortas: medRes(cortas),
    medianaLargas: medRes(largas),
    nCortas: cortas.length,
    nLargas: largas.length,
    // Con menos de 8 casos no hay señal, sólo anécdota.
    concluyente: cerradas.length >= 8,
  };
}

// ---------- Render ----------

let claseSel = 'cedear';
let tipoSel = 'compra';
let monedaSel = 'ARS';

const parseMonto = (txt) => {
  const limpio = (txt || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
};

const fmtNum = (n, dec = 2) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(n);

function formatearMontoInput(n) {
  const [ent, dec] = String(n.toFixed(2)).split('.');
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec && dec !== '00' ? `,${dec}` : '');
}

export function renderInversiones() {
  const el = $('#fin-inversiones');
  if (!el) return;
  const todas = getInversiones();

  if (!todas.length) {
    el.innerHTML = `<div class="fin-card">
      <div class="fin-card-head"><h2>Inversiones</h2></div>
      <div class="fin-vacio">
        <p>Todavía no cargaste ninguna operación.</p>
        <p class="fin-vacio-sub">Sacale una foto al comprobante del broker y se completa solo:
          instrumento, cantidad, precio, comisiones. Además te avisa si la cuenta no cierra.</p>
      </div>
    </div>`;
    return;
  }

  const pos = posiciones(todas);
  const abiertas = pos.filter((p) => p.cantidad > 0);
  const costo = costoDeOperar(todas);
  const invertidoTotal = abiertas.reduce((a, p) => a + eqPesos(p.invertido, p.moneda), 0);
  const realizadoTotal = pos.reduce((a, p) => a + eqPesos(p.realizado, p.moneda), 0);

  const filas = abiertas.map((p) => {
    const cl = claseDe(p.clase);
    const peso = invertidoTotal ? eqPesos(p.invertido, p.moneda) / invertidoTotal : 0;
    return `
      <div class="fin-pos">
        <span class="fin-pos-emoji">${cl ? cl.emoji : '📊'}</span>
        <div class="fin-pos-info">
          <div class="fin-pos-nombre">${escapar(p.instrumento)}
            <span class="fin-badge fin-badge--clase">${cl ? cl.label : 'otro'}</span></div>
          <div class="fin-pos-sub">${fmtNum(p.cantidad, 4)} × ${fmtMoneda(p.ppp, p.moneda)} promedio</div>
        </div>
        <div class="fin-pos-montos">
          <div class="fin-pos-monto">${fmtMoneda(p.invertido, p.moneda)}</div>
          <div class="fin-pos-peso">${pct(peso)} de la cartera</div>
        </div>
      </div>`;
  }).join('');

  // Un solo instrumento arriba del 40% es concentración, y en una cartera
  // chica es el riesgo más grande que se puede medir sin precios en vivo.
  const mayor = abiertas[0];
  const concentracion = mayor && invertidoTotal
    ? eqPesos(mayor.invertido, mayor.moneda) / invertidoTotal : 0;

  el.innerHTML = `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Inversiones</h2>
        <span class="fin-card-sub">${abiertas.length} ${abiertas.length === 1 ? 'posición' : 'posiciones'} · ${todas.length} ${todas.length === 1 ? 'operación' : 'operaciones'}</span>
      </div>
      <div class="fin-duo">
        <div>
          <div class="fin-duo-key">Invertido (costo)</div>
          <div class="fin-duo-val">${fmtARS.format(invertidoTotal)}</div>
        </div>
        <div>
          <div class="fin-duo-key">Te costó operar</div>
          <div class="fin-duo-val ${costo.ratio > 0.01 ? 'fin-mal' : ''}">${fmtARS.format(costo.costos)}
            <span class="fin-duo-nota">${pct(costo.ratio)} de lo operado</span></div>
        </div>
      </div>
      ${filas ? `<div class="fin-posiciones">${filas}</div>` : ''}
      <div class="fin-nota">
        Es lo que <b>pusiste</b>, no lo que vale hoy: la app no trae cotizaciones en vivo.
        ${realizadoTotal ? `<br>Resultado ya realizado (ventas + dividendos, neto de costos):
          <b class="${realizadoTotal >= 0 ? 'fin-ok' : 'fin-mal'}">${fmtARS.format(realizadoTotal)}</b>.` : ''}
        ${concentracion > 0.4 ? `<br><b>${escapar(mayor.instrumento)}</b> es el ${pct(concentracion)} de la cartera:
          si se mueve fuerte, se mueve todo.` : ''}
        ${costo.ratio > 0.01 ? `<br>A ${fmtARS.format(costo.porOp)} promedio por operación, operar seguido te está costando caro.` : ''}
      </div>
    </div>`;
}

/**
 * Tesis abiertas y el score. Es la parte del módulo que no existe en ningún
 * broker: te muestra qué dijiste que ibas a pasar, y si pasó.
 */
export function renderTesis() {
  const el = $('#fin-tesis');
  if (!el) return;
  const todas = getInversiones();
  const tesis = tesisAbiertas(todas);

  if (!tesis.length) {
    el.innerHTML = `<div class="fin-card">
      <div class="fin-card-head"><h2>Tesis</h2></div>
      <div class="fin-vacio">
        <p>Ninguna operación tiene tesis escrita.</p>
        <p class="fin-vacio-sub">Al cargar una compra, anotá <b>por qué</b> comprás, a qué precio pensás
          vender y qué te haría estar equivocado. Escrito antes de saber el resultado, es lo único que
          después te dice si tenés criterio o te acordás sólo de los aciertos.</p>
      </div>
    </div>`;
    return;
  }

  const score = scoreDeTesis(todas);
  const abiertas = tesis.filter((t) => !t.cerrada);

  const fila = (t) => {
    const { op, eq, potencial } = t;
    const objetivo = op.precio_objetivo;
    const estado = t.cerrada
      ? (t.resultado > 0 ? 'ok' : 'mal')
      : t.vencida ? 'vencida' : 'viva';
    const etiqueta = t.cerrada
      ? (t.resultado > 0 ? `✓ cerrada +${fmtMoneda(t.resultado, op.moneda)}` : `✕ cerrada ${fmtMoneda(t.resultado, op.moneda)}`)
      : t.vencida ? `⏱ pasó tu plazo hace ${Math.abs(t.diasObjetivo)} días`
      : t.diasObjetivo != null ? `faltan ${t.diasObjetivo} días`
      : `${t.dias} días abierta`;

    return `
      <div class="inv-tesis inv-tesis--${estado}">
        <div class="inv-tesis-top">
          <span class="inv-tesis-tic">${escapar(op.instrumento)}</span>
          <span class="inv-tesis-estado">${etiqueta}</span>
        </div>
        ${op.tesis ? `<div class="inv-tesis-texto">"${escapar(op.tesis)}"</div>` : ''}
        <div class="inv-tesis-nums">
          <span><i>Compraste a</i>${fmtMoneda(op.precio_unitario, op.moneda)}</span>
          <span><i>Empatás a</i>${fmtMoneda(eq.precioEmpate, op.moneda)}</span>
          ${objetivo ? `<span><i>Tu objetivo</i>${fmtMoneda(objetivo, op.moneda)}</span>` : ''}
          ${potencial ? `<span><i>Daría</i><b class="${potencial.neto >= 0 ? 'fin-ok' : 'fin-mal'}">${
            potencial.neto >= 0 ? '+' : ''}${fmtMoneda(potencial.neto, op.moneda)}</b></span>` : ''}
        </div>
        ${op.invalidacion ? `<div class="inv-tesis-inval">Estarías equivocado si: ${escapar(op.invalidacion)}</div>` : ''}
        ${objetivo && objetivo < eq.precioEmpate ? `
          <div class="inv-tesis-alerta">Tu precio objetivo está <b>por debajo</b> del punto de equilibrio:
            aunque se cumpla exactamente lo que pensás, perdés plata.</div>` : ''}
      </div>`;
  };

  el.innerHTML = `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Tesis</h2>
        <span class="fin-card-sub">${abiertas.length} abierta${abiertas.length === 1 ? '' : 's'} · ${tesis.length} en total</span>
      </div>
      ${score ? `
        <div class="inv-score ${score.concluyente ? '' : 'inv-score--corto'}">
          <div class="inv-score-cifra">
            <b>${score.ganadoras} de ${score.total}</b>
            <span>tesis cerradas en ganancia${score.concluyente ? ` · ${pct(score.tasa)}` : ''}</span>
          </div>
          <div class="inv-score-nota">
            ${score.concluyente
              ? `Resultado neto acumulado: <b class="${score.neto >= 0 ? 'fin-ok' : 'fin-mal'}">${fmtARS.format(score.neto)}</b>.
                 Las tenés abiertas ${Math.round(score.diasProm)} días en promedio.
                 ${score.nCortas >= 3 && score.nLargas >= 3
                   ? `Las que sostuviste más de 90 días dieron ${fmtARS.format(score.medianaLargas)} de mediana contra ${fmtARS.format(score.medianaCortas)} de las que cerraste en menos de 30.`
                   : ''}`
              : `Con ${score.total} operación${score.total === 1 ? '' : 'es'} cerrada${score.total === 1 ? '' : 's'} todavía no hay señal: cualquier resultado a esta altura es suerte. A partir de 8 te muestro tu tasa real.`}
          </div>
        </div>` : ''}
      <div class="inv-tesis-lista">${tesis.slice(0, 8).map(fila).join('')}</div>
    </div>`;
}

// ---------- Carga por foto ----------

async function procesarComprobante(file) {
  const estado = $('#inv-foto-estado');
  const btn = $('#btn-inv-foto');
  btn.disabled = true;
  estado.hidden = false;
  estado.className = 'gasto-foto-estado';
  estado.textContent = 'Leyendo comprobante…';
  try {
    // Carga diferida: el motor de OCR son varios MB y no tiene por qué
    // bajarse en cada arranque de la app.
    const [{ reconocerTicket }, { parsearComprobante }] = await Promise.all([
      import('./ticket-ocr.js'),
      import('./broker-parser.js'),
    ]);
    const texto = await reconocerTicket(file, (p) => {
      estado.textContent = `Leyendo comprobante… ${Math.round(p * 100)}%`;
    });
    const r = parsearComprobante(texto);

    if (r.instrumento) $('#inv-instrumento').value = r.instrumento;
    if (r.cantidad != null) $('#inv-cantidad').value = fmtNum(r.cantidad, 6);
    if (r.precio_unitario != null) $('#inv-precio').value = formatearMontoInput(r.precio_unitario);
    if (r.comisiones) $('#inv-comisiones').value = formatearMontoInput(r.comisiones);
    if (r.gastos_op) $('#inv-gastos').value = formatearMontoInput(r.gastos_op);
    if (r.fecha) $('#inv-fecha').value = r.fecha;
    if (r.clase) seleccionarClase(r.clase);
    if (r.tipo) seleccionarTipo(r.tipo);

    if (!r.instrumento && r.cantidad == null) {
      estado.textContent = 'No pude leer el comprobante — cargalo a mano.';
    } else if (r.cuadra === true) {
      estado.className = 'gasto-foto-estado fin-ok';
      estado.textContent = `✓ Cuadra: ${fmtARS.format(r.bruto)} invertidos + ${fmtARS.format(r.comisiones + r.gastos_op)} de costos = ${fmtARS.format(r.neto)}`;
    } else if (r.cuadra === false) {
      estado.className = 'gasto-foto-estado fin-mal';
      estado.textContent = `⚠ La cuenta no cierra por ${fmtARS.format(Math.abs(r.diferencia))} (leí ${fmtARS.format(r.neto)} contra un total de ${fmtARS.format(r.totalLeido)}). Revisá los números antes de guardar.`;
    } else {
      estado.textContent = 'Revisá los datos y confirmá abajo.';
    }
    actualizarResumen();
  } catch (err) {
    console.warn('[ocr-broker]', err);
    estado.className = 'gasto-foto-estado fin-mal';
    estado.textContent = 'No pude leer el comprobante — cargalo a mano.';
  } finally {
    btn.disabled = false;
  }
}

/** Muestra en vivo la descomposición mientras completás el form. */
function actualizarResumen() {
  const cont = $('#inv-resumen');
  if (!cont) return;
  const cant = parseMonto($('#inv-cantidad').value);
  const precio = parseMonto($('#inv-precio').value);
  if (!cant || !precio) { cont.hidden = true; return; }
  const com = parseMonto($('#inv-comisiones').value) || 0;
  const gas = parseMonto($('#inv-gastos').value) || 0;
  const bruto = cant * precio;
  const neto = bruto + com + gas;
  const f = (n) => fmtMoneda(n, monedaSel);
  // Punto de equilibrio en vivo: antes de guardar ya sabés cuánto tiene que
  // subir para que la operación no sea una donación al broker.
  const eq = puntoDeEquilibrio({ cantidad: cant, precio_unitario: precio, comisiones: com, gastos_op: gas });
  const objetivo = parseMonto($('#inv-objetivo')?.value);
  const conObjetivo = objetivo && eq
    ? resultadoA({ cantidad: cant, precio_unitario: precio, comisiones: com, gastos_op: gas }, objetivo)
    : null;

  cont.hidden = false;
  cont.innerHTML = `
    <div class="inv-resumen-fila"><span>Queda invertido</span><b>${f(bruto)}</b></div>
    <div class="inv-resumen-fila"><span>Costos de la operación</span><b>${f(com + gas)}${
      bruto ? ` <span class="inv-resumen-pct">${pct((com + gas) / bruto)}</span>` : ''
    }</b></div>
    <div class="inv-resumen-fila inv-resumen-fila--total"><span>Sale de tu caja</span><b>${f(neto)}</b></div>
    ${eq && tipoSel === 'compra' ? `
      <div class="inv-equilibrio">
        <div class="inv-equilibrio-titulo">Punto de equilibrio</div>
        <div class="inv-resumen-fila">
          <span>Empatás vendiendo a</span>
          <b>${f(eq.precioEmpate)} <span class="inv-resumen-pct">+${pct(eq.subaNecesaria)}</span></b>
        </div>
        <div class="inv-equilibrio-nota">
          Contando la comisión de salida al mismo ${pct(eq.tasa)} que la de entrada.
          Debajo de ese precio perdés aunque el papel haya subido.
        </div>
        ${conObjetivo ? `
          <div class="inv-resumen-fila inv-resumen-fila--total">
            <span>Si vendés a tu objetivo</span>
            <b class="${conObjetivo.neto >= 0 ? 'fin-ok' : 'fin-mal'}">${
              conObjetivo.neto >= 0 ? '+' : ''}${f(conObjetivo.neto)}
              <span class="inv-resumen-pct">${pct(conObjetivo.retorno)}</span></b>
          </div>` : ''}
      </div>` : ''}`;
}

function seleccionarClase(key) {
  claseSel = key;
  $('#inv-clase').querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c.dataset.clase === key));
}
function seleccionarTipo(key) {
  tipoSel = key;
  $('#inv-tipo').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('selected', b.dataset.tipoInv === key));
}

function guardar() {
  const instrumento = $('#inv-instrumento').value.trim().toUpperCase();
  const cantidad = parseMonto($('#inv-cantidad').value);
  const precio = parseMonto($('#inv-precio').value);
  if (!instrumento) return $('#inv-instrumento').focus();
  if (!cantidad || cantidad <= 0) return $('#inv-cantidad').focus();
  if (!precio || precio <= 0) return $('#inv-precio').focus();

  addInversion({
    id: crypto.randomUUID(),
    fecha: $('#inv-fecha').value || hoyIso(),
    tipo: tipoSel,
    instrumento,
    clase: claseSel,
    cantidad,
    precio_unitario: precio,
    moneda: monedaSel,
    comisiones: parseMonto($('#inv-comisiones').value) || 0,
    gastos_op: parseMonto($('#inv-gastos').value) || 0,
    broker: $('#inv-broker').value.trim(),
    nota: '',
    tesis: $('#inv-tesis').value.trim(),
    precio_objetivo: parseMonto($('#inv-objetivo').value),
    fecha_objetivo: $('#inv-fecha-objetivo').value || '',
    invalidacion: $('#inv-invalidacion').value.trim(),
    ts: Date.now(),
  });

  ['#inv-instrumento', '#inv-cantidad', '#inv-precio', '#inv-comisiones', '#inv-gastos',
   '#inv-tesis', '#inv-objetivo', '#inv-fecha-objetivo', '#inv-invalidacion']
    .forEach((s) => { $(s).value = ''; });
  $('#inv-foto-estado').hidden = true;
  $('#inv-resumen').hidden = true;
  $('#fin-form-inversion').removeAttribute('open');
  renderInversiones();
  renderTesis();
  document.dispatchEvent(new CustomEvent('kbl:inversion-guardada'));
}

export function initInversiones() {
  const cont = $('#fin-form-inversion');
  if (!cont) return;

  $('#inv-clase').innerHTML = CLASES
    .map((c) => `<button type="button" class="chip cat-chip ${c.key === claseSel ? 'selected' : ''}" data-clase="${c.key}">${c.emoji} ${c.label}</button>`)
    .join('');
  $('#inv-clase').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clase]');
    if (b) seleccionarClase(b.dataset.clase);
  });

  $('#inv-tipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo-inv]');
    if (b) seleccionarTipo(b.dataset.tipoInv);
  });

  $('#inv-moneda').addEventListener('click', (e) => {
    const op = e.target.closest('.seg-op');
    if (!op) return;
    monedaSel = op.dataset.moneda;
    $('#inv-moneda').querySelectorAll('.seg-op').forEach((b) => b.classList.toggle('selected', b === op));
    actualizarResumen();
  });

  ['#inv-cantidad', '#inv-precio', '#inv-comisiones', '#inv-gastos', '#inv-objetivo']
    .forEach((s) => $(s).addEventListener('input', actualizarResumen));

  $('#btn-inv-foto').addEventListener('click', () => $('#inv-foto-input').click());
  $('#inv-foto-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) procesarComprobante(file);
  });

  $('#inv-fecha').value = hoyIso();
  $('#btn-inv-guardar').addEventListener('click', guardar);

  // Borrar una operación desde la lista (con confirmación: recalcula el PPP).
  $('#fin-inversiones').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-inv-borrar]');
    if (!btn) return;
    const ok = await confirmar({
      titulo: '¿Borrar esta operación?',
      mensaje: 'Se recalcula el costo promedio de esa posición.',
      accion: 'Borrar', destructivo: true,
    });
    if (ok) { removeInversion(btn.dataset.invBorrar); renderInversiones(); renderTesis(); }
  });

  renderInversiones();
  renderTesis();
}
