// ====== Módulo Cuotas ======
import {
  getCuotas, addCuota, removeCuota, updateCuota,
  getGastos, getRecurrentes, getAhorros,
  getPagosResumen, upsertPagoResumen, removePagoResumen,
} from './store.js';
import { confirmar, pedirTexto } from './dialog.js';
import { equivalente, casaActual, siguienteCasa, onCotizacion, ahorroVsTarjeta, fmtARS0 } from './cotizacion.js';
import { mediosCredito } from './medios-credito.js';
import {
  cuotasVencidasSinPagar, hoyIso, diasEntre, pad2,
  contexto, resumenPeriodo, periodoDeGasto, addMes, cero, sumar,
} from './fincore.js';
import { generarIcs, descargarIcs, pedirConfigRecordatorio, labelFechaLarga } from './recordatorio.js';

const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
// Las tarjetas resumen consumos en dólares aparte de los pesos, y sin cotización
// no se pueden sumar: cada total lleva su línea en USD cuando corresponde.
const fmtUSD = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const fmt = (monto, moneda) => (moneda === 'USD' ? fmtUSD : fmtARS).format(monto);

let tarjetaSel = 'visa';
const $ = (sel) => document.querySelector(sel);

// Escapa texto del usuario antes de inyectarlo en innerHTML.
function escapar(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function addMeses(fecha, n) {
  const d = new Date(fecha + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function labelMes(yyyy_mm) {
  const [y, m] = yyyy_mm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

// ---------- Pagos ----------
// Hasta ahora la única acción sobre una cuota era "completada", que la saca
// entera de la lista. No existía "pagué LA CUOTA DE ESTE MES", así que
// `cuota_actual` nunca avanzaba: la barra decía "2 de 9" para siempre y el
// saldo sólo bajaba cuando el calendario pasaba de mes. Esto es lo que faltaba.

/** Avanza una cuota un mes. Si era la última, la marca completada. */
function avanzarCuota(c) {
  if (c.cuota_actual >= c.cuota_total) {
    updateCuota(c.id, { estado: 'completada' });
    return;
  }
  updateCuota(c.id, {
    cuota_actual: c.cuota_actual + 1,
    fecha_primer_venc: addMeses(c.fecha_primer_venc, 1),
  });
}

/** Deshace un pago. Existe porque un toque de más no puede costarte el dato. */
function retrocederCuota(c) {
  if (c.cuota_actual <= 1 && c.estado === 'activa') return;
  updateCuota(c.id, {
    estado: 'activa',
    cuota_actual: Math.max(1, c.cuota_actual - (c.estado === 'completada' ? 0 : 1)),
    fecha_primer_venc: c.estado === 'completada'
      ? c.fecha_primer_venc
      : addMeses(c.fecha_primer_venc, -1),
  });
}

/** Fecha real de vencimiento de una cuota (día del medio, o el de la cuota). */
function vencimientoDe(c, medios) {
  const medio = medios.find((m) => m.key === c.tarjeta);
  const mes = c.fecha_primer_venc.slice(0, 7);
  const dia = medio?.diaVencimiento ?? Number(c.fecha_primer_venc.slice(8, 10));
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${mes}-${pad2(Math.min(dia, ultimo))}`;
}

/** Igual que `vencimientoDe`, pero para un período sin cuota cargada todavía
 * (compras en un pago, que no tienen su propia fila en `cuotas`). */
function vencimientoDelPeriodo(periodo, medio) {
  const dia = medio?.diaVencimiento ?? 10;
  const [y, m] = periodo.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${periodo}-${pad2(Math.min(dia, ultimo))}`;
}

/** true si el par {ars, usd} tiene algo de plata (evita ruido de $0,00). */
const eqvLocal = (v) => (v.ars || 0) > 0.005 || (v.usd || 0) > 0.005;

/** Contexto completo (gastos + cuotas + período de facturación) que necesita
 * la sección de Resúmenes para calcular el total real de cada tarjeta. Se
 * arma bajo demanda porque es liviano y así nunca queda desactualizado. */
function ctxActual() {
  return contexto({
    gastos: getGastos(),
    cuotas: getCuotas(),
    recurrentes: getRecurrentes(),
    ahorros: getAhorros(),
    medios: mediosCredito(),
  });
}

/** Período más próximo a vencer de un medio: el anterior al que hoy sigue
 * sumando compras. Sin día de cierre cargado no hay forma de saber cuál
 * cerró, así que arranca en el actual. Misma cuenta que usa Resúmenes. */
function periodoBaseDe(medio) {
  const abierto = periodoDeGasto(hoyIso(), medio);
  return medio?.diaCierre != null ? addMes(abierto, -1) : abierto;
}

/** Total real (cuotas + compras, de todas las tarjetas de crédito) de un
 * período — lo que de verdad sale de la cuenta ese mes, pagado o no. Es la
 * misma cuenta que arma cada fila de Resúmenes, sumada entre tarjetas: así
 * el total de arriba de la vista nunca puede decir un número distinto al de
 * las tarjetas de abajo. */
function totalRealDelPeriodo(periodo, medios, ctx) {
  const t = cero();
  for (const m of medios) {
    const { total } = resumenPeriodo(m.key, periodo, ctx);
    if (total.ars) sumar(t, total.ars, 'ARS');
    if (total.usd) sumar(t, total.usd, 'USD');
  }
  return t;
}

/**
 * Antes "Ya lo pagué" sólo tocaba `cuotas`: las compras en un pago no tenían
 * estado, y el número mostrado nunca fue el real (cuotas + compras del
 * período que cobra ese resumen). Esta sección muestra, por tarjeta, los 3
 * períodos que importan — el que está por vencer, el que se está cerrando
 * ahora (ahí cae "cuánto pago el mes que viene") y el siguiente — con el
 * total de caja real y el pago efectivamente registrado en `pagos_resumen`,
 * que es independiente de `cuotas.cuota_actual`: un click de más se deshace
 * sin corromper ninguna cuota.
 */
function renderResumenes(cuotas, ctx) {
  const el = $('#cuotas-resumen');
  if (!el) return;

  const pagos = getPagosResumen();
  const medios = mediosCredito();
  const usadas = new Set([
    ...cuotas.map((c) => c.tarjeta),
    ...ctx.gastos.map((g) => g.tarjeta),
  ]);
  const tarjetas = medios.filter((t) => ctx.credito.has(t.key) && usadas.has(t.key));

  if (!tarjetas.length) { el.innerHTML = ''; return; }

  el.innerHTML = tarjetas.map((t) => {
    const abierto = periodoDeGasto(hoyIso(), t);
    const base = periodoBaseDe(t);
    const periodos = [base, addMes(base, 1), addMes(base, 2)];

    let comp = null; // ahorro de cubrir el USD del período más próximo, si tiene
    const filas = periodos.map((p, i) => {
      const { cuotas: cCuotas, compras, total } = resumenPeriodo(t.key, p, ctx);
      if (i === 0 && total.usd) comp = ahorroVsTarjeta(total.usd);
      const pago = pagos.find((x) => x.tarjeta === t.key && x.periodo === p);
      const venc = vencimientoDelPeriodo(p, t);
      const faltan = diasEntre(hoyIso(), venc);
      const esAbierto = p === abierto;
      // `total` es el costo real del período (pagado o no). Pero antes de que
      // existiera este ledger, "pagar" era avanzar `cuota_actual` sin dejar
      // rastro: un período viejo puede estar 100% resuelto por ese mecanismo
      // y no tener fila acá en `pagos`. `soloPendiente` filtra esas cuotas ya
      // marcadas, así no sale "venció hace 3 días" de un Mercado Pago que
      // Keni ya pagó hace rato — es lo que faltaba de verdad lo que decide si
      // hay algo para mostrar como acción.
      const pendiente = resumenPeriodo(t.key, p, ctx, { soloPendiente: true }).total;
      const accionable = eqvLocal(pendiente);

      let estado, claseFila = '';
      if (pago) {
        estado = `✓ Pagado el ${labelFechaLarga(pago.fechaPago)}`;
        claseFila = 'periodo-fila--pagado';
      } else if (!accionable) {
        estado = eqvLocal(total) ? 'sin saldo pendiente' : 'sin movimientos';
      } else if (esAbierto) {
        estado = `período abierto${t.diaCierre ? ` · cierra el ${t.diaCierre}` : ''}`;
      } else if (faltan < 0) {
        estado = `venció hace ${-faltan} día${-faltan > 1 ? 's' : ''}`;
        claseFila = 'periodo-fila--vencido';
      } else if (faltan === 0) {
        estado = 'vence hoy';
      } else {
        estado = `vence en ${faltan} día${faltan > 1 ? 's' : ''}`;
      }

      const desglose = eqvLocal(cCuotas) && eqvLocal(compras)
        ? `${fmtARS.format(cCuotas.ars)}${cCuotas.usd ? ` +${fmtUSD.format(cCuotas.usd)}` : ''} de cuotas
           · ${fmtARS.format(compras.ars)}${compras.usd ? ` +${fmtUSD.format(compras.usd)}` : ''} de compras del período`
        : '';

      const btns = pago
        ? `<button class="fin-btn" data-editar-pago="${t.key}" data-mes="${p}">✏️ Ajustar</button>
           <button class="fin-btn" data-deshacer-pago="${t.key}" data-mes="${p}">↩ Deshacer</button>`
        : accionable
          ? `<button class="fin-btn" data-recordar="${t.key}" data-venc="${venc}">🔔</button>
             <button class="fin-btn fin-btn--ok" data-pagar-tarjeta="${t.key}" data-mes="${p}">Ya lo pagué</button>`
          : '';

      return `
        <div class="periodo-fila ${claseFila}">
          <div class="periodo-fila-cab">
            <span class="periodo-fila-mes">${labelMes(p)}</span>
            <span class="periodo-fila-monto">${fmtARS.format(total.ars)}${
              total.usd ? ` <span class="monto-usd">+ ${fmtUSD.format(total.usd)}</span>` : ''
            }</span>
          </div>
          ${desglose ? `<div class="periodo-fila-desglose">${desglose}</div>` : ''}
          <div class="periodo-fila-pie">
            <span class="periodo-fila-estado">${estado}</span>
            <div class="periodo-fila-btns">${btns}</div>
          </div>
        </div>`;
    }).join('');

    // Los dólares del resumen más próximo se cubren comprando (MEP en Mercado
    // Pago) y transfiriendo a Galicia. Mostrar cuánto sale eso hoy, y cuánto
    // más pagaría si los deja pasar al dólar tarjeta.
    const bloqueUsd = comp ? `
      <div class="resumen-usd-nota">
        Cubrir los dólares del próximo resumen te sale <b>${fmtARS0(comp.propio)}</b>
        comprando ${casaActual().label}.
        <br>Si los pagás en pesos con la tarjeta: ${fmtARS0(comp.conTarjeta)}
        → <b class="resumen-ahorro">ahorrás ${fmtARS0(comp.ahorro)}</b>.
      </div>` : '';

    return `
      <div class="cuotas-resumen-wrap">
        <div class="cuotas-proy-title">${t.emoji} ${escapar(t.nombre)}</div>
        ${filas}
        ${bloqueUsd}
      </div>`;
  }).join('');
}

/** Aviso arriba de todo cuando hay cuotas cuyo vencimiento ya pasó sin marcar. */
function renderVencidas(cuotas) {
  const el = $('#cuotas-vencidas');
  if (!el) return;
  const medios = mediosCredito();
  const vencidas = cuotasVencidasSinPagar(cuotas, medios);
  if (!vencidas.length) { el.innerHTML = ''; return; }

  const porTarjeta = new Map();
  for (const v of vencidas) {
    const k = v.cuota.tarjeta;
    if (!porTarjeta.has(k)) porTarjeta.set(k, { items: [], venc: v.venc, dias: v.diasPasados });
    porTarjeta.get(k).items.push(v.cuota);
  }

  el.innerHTML = [...porTarjeta.entries()].map(([tk, g]) => {
    const t = medios.find((m) => m.key === tk) || { emoji: '💳', nombre: tk };
    const totalArs = g.items.filter((c) => c.moneda !== 'USD').reduce((a, c) => a + c.monto_cuota, 0);
    return `
      <div class="cuotas-vencida">
        <span class="cuotas-vencida-icono">⏱</span>
        <div class="cuotas-vencida-cuerpo">
          <div class="cuotas-vencida-titulo">${t.emoji} ${escapar(t.nombre)} venció hace ${g.dias} día${g.dias > 1 ? 's' : ''}</div>
          <div class="cuotas-vencida-detalle">
            ${g.items.length} cuota${g.items.length > 1 ? 's' : ''} por <b>${fmtARS.format(totalArs)}</b>
            siguen contando como deuda. Si ya pagaste, marcalo: el saldo baja recién ahí.
          </div>
          <div class="cuotas-vencida-btns">
            <button class="fin-btn fin-btn--ok" data-pagar-tarjeta="${tk}" data-mes="${g.venc.slice(0, 7)}">Ya lo pagué</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/**
 * Registra (o edita) el pago real de una tarjeta+período: fecha de hoy y
 * monto, arrancando del total calculado pero editable — el débito real del
 * banco puede diferir por impuestos, redondeos o devoluciones que la app no
 * modela. Es aditivo: no toca `cuotas` en una edición, y en el primer pago
 * avanza las cuotas de ese período igual que siempre (guarda sus ids para
 * que "Deshacer" sepa exactamente cuáles retroceder).
 */
async function marcarPago(tarjeta, periodo, { esEdicion }) {
  const ctx = ctxActual();
  const medio = mediosCredito().find((m) => m.key === tarjeta);
  const { total } = resumenPeriodo(tarjeta, periodo, ctx);
  const pagoPrevio = getPagosResumen().find((p) => p.tarjeta === tarjeta && p.periodo === periodo);
  const calcArs = Math.round(total.ars);
  const valorInicial = pagoPrevio ? Math.round(pagoPrevio.montoArs) : calcArs;

  const faltan = diasEntre(hoyIso(), vencimientoDelPeriodo(periodo, medio));
  const avisoVenc = !esEdicion && faltan > 0
    ? ` Ojo: todavía no venció, le faltan ${faltan} día${faltan > 1 ? 's' : ''}.`
    : '';

  const txtArs = await pedirTexto({
    titulo: `¿Cuánto pagaste de ${medio?.nombre || tarjeta} — ${labelMes(periodo)}?`,
    mensaje: `Calculado: ${fmtARS.format(calcArs)}${total.usd ? ` + ${fmtUSD.format(total.usd)}` : ''}.${
      esEdicion ? ' Corregilo si el banco te cobró otra cosa.' : ''}${avisoVenc}`,
    valor: String(valorInicial),
    placeholder: 'Monto en pesos',
    accion: esEdicion ? 'Guardar' : 'Sí, lo pagué',
  });
  if (txtArs === null) return;
  const montoArs = Number(txtArs.replace(/[^\d]/g, '')) || calcArs;

  let montoUsd = pagoPrevio?.montoUsd ?? total.usd;
  if (total.usd > 0.005 || montoUsd > 0.005) {
    const txtUsd = await pedirTexto({
      titulo: '¿Y en dólares?',
      mensaje: `Calculado: ${fmtUSD.format(total.usd)}.`,
      valor: montoUsd.toFixed(2),
      placeholder: 'Monto en USD',
      accion: 'Guardar',
    });
    if (txtUsd !== null) montoUsd = Number(txtUsd.replace(',', '.')) || 0;
  }

  const cuotasDelPeriodo = getCuotas().filter((c) => c.estado === 'activa'
    && c.tarjeta === tarjeta && c.fecha_primer_venc.slice(0, 7) === periodo);

  upsertPagoResumen({
    tarjeta, periodo,
    fechaPago: hoyIso(),
    montoArs, montoUsd,
    montoArsCalculado: calcArs,
    montoUsdCalculado: total.usd,
    cuotaIds: pagoPrevio?.cuotaIds || cuotasDelPeriodo.map((c) => c.id),
  });

  if (!esEdicion) cuotasDelPeriodo.forEach(avanzarCuota);
  render();
}

/** Deshace un pago de resumen: borra el registro y retrocede sólo las cuotas
 * que ese pago había avanzado (guardadas en `cuotaIds`). No toca `gastos`. */
async function deshacerPago(tarjeta, periodo) {
  const pago = getPagosResumen().find((p) => p.tarjeta === tarjeta && p.periodo === periodo);
  if (!pago) return;
  const medio = mediosCredito().find((m) => m.key === tarjeta);
  const ok = await confirmar({
    titulo: `¿Deshacer el pago de ${medio?.nombre || tarjeta}?`,
    mensaje: `${labelMes(periodo)} vuelve a contar como pendiente.`,
    accion: 'Deshacer',
    destructivo: true,
  });
  if (!ok) return;
  removePagoResumen(pago.id);
  const cuotas = getCuotas();
  (pago.cuotaIds || []).forEach((id) => {
    const c = cuotas.find((x) => x.id === id);
    if (c) retrocederCuota(c);
  });
  render();
}

function render() {
  const cuotas = getCuotas();
  const activas = cuotas.filter((c) => c.estado === 'activa');
  const ctx = ctxActual();
  const tarjetas = mediosCredito().filter((t) => ctx.credito.has(t.key));

  // El total de acá arriba y el de cada tarjeta en "Resúmenes" tienen que
  // decir SIEMPRE el mismo número para el mismo mes — antes esto sumaba sólo
  // cuotas ("$326.542") mientras Resúmenes ya mostraba cuotas + compras
  // ("$1.332.729" la sola Visa de agosto), dos totales de "agosto" en la
  // misma pantalla que no coincidían entre sí.
  const bases = tarjetas.map(periodoBaseDe).sort();
  const periodos = bases.length ? Array.from({ length: 7 }, (_, i) => addMes(bases[0], i)) : [];
  const totales = periodos.map((key) => ({ key, label: labelMes(key), ...totalRealDelPeriodo(key, tarjetas, ctx) }));

  // Hero: total real del mes más próximo con algo por vencer
  const primerMes = totales[0];
  $('#cuotas-total').textContent = primerMes ? fmtARS.format(primerMes.ars) : '$ 0';
  const heroUsd = $('#cuotas-total-usd');
  if (heroUsd) {
    heroUsd.hidden = !primerMes?.usd;
    const eq = primerMes?.usd ? equivalente(primerMes.usd) : '';
    heroUsd.innerHTML = primerMes?.usd
      ? '+ ' + fmtUSD.format(primerMes.usd)
        + (eq ? ` <span class="cotiz-eq" role="button" tabindex="0" title="Tocá para cambiar de cotización">${eq} <span class="cotiz-casa">${casaActual().label}</span></span>` : '')
      : '';
  }
  $('#cuotas-mes-label').textContent = primerMes ? primerMes.label : new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  $('#cuotas-activas-count').textContent = `${activas.length} cuota${activas.length !== 1 ? 's' : ''} activa${activas.length !== 1 ? 's' : ''}`;

  renderVencidas(cuotas);
  renderResumenes(cuotas, ctx);

  // Proyección mensual: mismo total real, 7 meses para adelante
  const proyHtml = totales.length
    ? totales.map((m, i) => `
        <div class="proy-row ${i === 0 ? 'proy-row--next' : ''}">
          <div class="proy-mes">${m.label}</div>
          <div class="proy-barra-wrap">
            <div class="proy-barra" style="width:${Math.min(100, (m.ars / (totales[0]?.ars || 1)) * 100)}%"></div>
          </div>
          <div class="proy-monto">${fmtARS.format(m.ars)}${m.usd ? ` <span class="monto-usd">+${fmtUSD.format(m.usd)}</span>` : ''}</div>
        </div>`).join('')
    : '<p class="cuotas-empty-sub">Sin tarjetas activas.</p>';
  $('#cuotas-proyeccion').innerHTML = proyHtml;

  // Lista de cuotas activas
  if (!activas.length) {
    $('#cuotas-lista').innerHTML = `
      <div class="forest-empty">
        <div class="empty-emoji">💳</div>
        <p>Sin cuotas activas.<br>Agregá tu primera compra en cuotas.</p>
      </div>`;
    return;
  }

  const medios = mediosCredito();
  const tarjetaEmoji = (key) => (medios.find((t) => t.key === key) || medios[0] || {}).emoji || '💳';

  $('#cuotas-lista').innerHTML = activas
    .sort((a, b) => a.fecha_primer_venc.localeCompare(b.fecha_primer_venc))
    .map((c) => {
      const restantes = c.cuota_total - c.cuota_actual + 1;
      // `cuota_actual` es la que estás por pagar, no una ya pagada: con 3 de 3
      // todavía debés la última, o sea 2 pagadas de 3 (67%). La barra llega a
      // 100% recién cuando la marcás completada y sale de la lista.
      const pagadas = Math.max(0, Math.min(c.cuota_total, c.cuota_actual - 1));
      const pct = Math.round((pagadas / c.cuota_total) * 100);
      const venc = vencimientoDe(c, medios);
      const faltan = diasEntre(hoyIso(), venc);
      const esUltima = c.cuota_actual >= c.cuota_total;
      return `
        <div class="cuota-card ${faltan < 0 ? 'cuota-card--vencida' : ''}">
          <div class="cuota-card-top">
            <span class="cuota-emoji">${tarjetaEmoji(c.tarjeta)}</span>
            <div class="cuota-info">
              <div class="cuota-desc">${escapar(c.descripcion)}</div>
              <div class="cuota-sub">${fmt(c.monto_cuota, c.moneda)}/cuota · ${restantes} restante${restantes !== 1 ? 's' : ''} de ${c.cuota_total}</div>
            </div>
            <div class="cuota-actions">
              ${pagadas > 0 ? `<button class="cuota-undo" data-id="${c.id}" title="Deshacer el último pago">↩</button>` : ''}
              <button class="cuota-del" data-id="${c.id}" title="Eliminar">✕</button>
            </div>
          </div>
          <div class="cuota-progress-wrap">
            <div class="cuota-progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="cuota-pie">
            <span class="cuota-progress-label">${pagadas} de ${c.cuota_total} pagadas · vence ${labelFechaLarga(venc)}</span>
            <button class="cuota-pagar" data-id="${c.id}">
              ${esUltima ? 'Pagué la última' : `Pagué la ${c.cuota_actual}ª`}
            </button>
          </div>
        </div>`;
    }).join('');
}

function agregar() {
  const montoRaw = $('#cuota-monto').value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const monto = parseFloat(montoRaw);
  const desc = $('#cuota-desc').value.trim();
  const actual = parseInt($('#cuota-num-actual').value) || 1;
  const total = parseInt($('#cuota-num-total').value) || 1;
  const fecha = $('#cuota-fecha').value;

  if (!monto || monto <= 0 || !desc || !fecha) {
    if (!desc) $('#cuota-desc').focus();
    else if (!monto) $('#cuota-monto').focus();
    else $('#cuota-fecha').focus();
    return;
  }

  addCuota({
    id: crypto.randomUUID(),
    descripcion: desc,
    tarjeta: tarjetaSel,
    monto_cuota: monto,
    cuota_actual: actual,
    cuota_total: total,
    fecha_primer_venc: fecha,
    estado: 'activa',
    created_at: new Date().toISOString(),
  });

  $('#cuota-desc').value = '';
  $('#cuota-monto').value = '';
  $('#cuota-num-actual').value = '1';
  $('#cuota-num-total').value = '1';
  $('#cuota-fecha').value = '';
  $('#cuota-form').removeAttribute('open');
  render();
}

export function initCuotas() {
  // La cotización llega asincrónica y puede cambiar de casa al tocarla.
  onCotizacion(() => render());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#cuotas-total-usd .cotiz-eq')) return;
    siguienteCasa();
  });

  // Chips de tarjeta (bancos/tarjetas reales, editables desde el Panel)
  const medios = mediosCredito();
  if (!medios.some((m) => m.key === tarjetaSel)) tarjetaSel = medios[0]?.key || 'visa';
  $('#cuota-tarjeta-chips').innerHTML = medios
    .map((t) => `<button class="chip cat-chip ${t.key === tarjetaSel ? 'selected' : ''}" data-tk="${t.key}">${t.emoji} ${t.nombre}</button>`)
    .join('');

  $('#cuota-tarjeta-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    tarjetaSel = chip.dataset.tk;
    document.querySelectorAll('#cuota-tarjeta-chips .cat-chip').forEach((c) => c.classList.toggle('selected', c === chip));
  });

  // Separador de miles en monto
  $('#cuota-monto').addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^\d,]/g, '');
    const [ent, ...resto] = v.split(',');
    const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const dec = resto.length ? ',' + resto.join('').slice(0, 2) : '';
    e.target.value = entFmt + dec;
  });

  $('#btn-agregar-cuota').addEventListener('click', agregar);

  // Fecha por defecto = primer día del mes que viene
  const hoy = new Date();
  const primerVenc = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  $('#cuota-fecha').value = primerVenc.toISOString().slice(0, 10);

  // Acciones en lista
  $('#cuotas-lista').addEventListener('click', async (e) => {
    const btnPagar = e.target.closest('.cuota-pagar');
    const btnUndo = e.target.closest('.cuota-undo');
    const btnDel = e.target.closest('.cuota-del');

    if (btnPagar) {
      const c = getCuotas().find((x) => x.id === btnPagar.dataset.id);
      if (!c) return;
      const esUltima = c.cuota_actual >= c.cuota_total;
      // Mismo cuidado que al pagar el resumen entero: avisar si todavía no venció.
      const faltanC = diasEntre(hoyIso(), vencimientoDe(c, mediosCredito()));
      const avisoC = faltanC > 0
        ? ` Ojo: todavía no venció, le faltan ${faltanC} día${faltanC > 1 ? 's' : ''}.`
        : '';
      const ok = await confirmar({
        titulo: esUltima ? '¿Pagaste la última cuota?' : `¿Pagaste la cuota ${c.cuota_actual} de ${c.cuota_total}?`,
        mensaje: (esUltima
          ? `"${c.descripcion}" sale de la lista y deja de contar como deuda.`
          : `Baja ${fmt(c.monto_cuota, c.moneda)} del saldo y la próxima pasa a vencer el mes que viene.`) + avisoC,
        accion: 'Sí, la pagué',
      });
      if (ok) { avanzarCuota(c); render(); }
      return;
    }
    if (btnUndo) {
      const c = getCuotas().find((x) => x.id === btnUndo.dataset.id);
      if (c) { retrocederCuota(c); render(); }
      return;
    }
    if (btnDel) {
      const ok = await confirmar({ titulo: '¿Eliminar esta cuota?', accion: 'Eliminar', destructivo: true });
      if (ok) { removeCuota(btnDel.dataset.id); render(); }
    }
  });

  // Pagar/ajustar/deshacer un resumen y generar recordatorios (viven en dos
  // contenedores distintos, así que la delegación va en la vista completa).
  $('#view-cuotas').addEventListener('click', async (e) => {
    const btnPagarT = e.target.closest('[data-pagar-tarjeta]');
    if (btnPagarT) {
      await marcarPago(btnPagarT.dataset.pagarTarjeta, btnPagarT.dataset.mes, { esEdicion: false });
      return;
    }

    const btnEditar = e.target.closest('[data-editar-pago]');
    if (btnEditar) {
      await marcarPago(btnEditar.dataset.editarPago, btnEditar.dataset.mes, { esEdicion: true });
      return;
    }

    const btnDeshacerP = e.target.closest('[data-deshacer-pago]');
    if (btnDeshacerP) {
      await deshacerPago(btnDeshacerP.dataset.deshacerPago, btnDeshacerP.dataset.mes);
      return;
    }

    const btnRec = e.target.closest('[data-recordar]');
    if (btnRec) {
      const { recordar, venc } = btnRec.dataset;
      const medio = mediosCredito().find((m) => m.key === recordar);
      const nombre = medio?.nombre || recordar;
      const periodo = venc.slice(0, 7);
      const { cuotas: cCuotas, compras, total } = resumenPeriodo(recordar, periodo, ctxActual());
      const delMes = getCuotas().filter((c) => c.estado === 'activa'
        && c.tarjeta === recordar && c.fecha_primer_venc.slice(0, 7) === periodo);

      const cfg = await pedirConfigRecordatorio({
        titulo: `Vence el resumen de ${nombre}`,
        fecha: venc,
      });
      if (!cfg) return;

      const detalle = [
        `Total a pagar: ${fmtARS.format(total.ars)}${total.usd ? ` + ${fmtUSD.format(total.usd)}` : ''}`,
        eqvLocal(cCuotas) && eqvLocal(compras)
          ? `De eso, ${fmtARS.format(compras.ars)} son compras del período y ${fmtARS.format(cCuotas.ars)} cuotas.`
          : '',
        delMes.length ? `${delMes.length} cuota${delMes.length > 1 ? 's' : ''} en el resumen.` : '',
        '',
        ...delMes.slice(0, 12).map((c) => `· ${c.descripcion} — ${fmt(c.monto_cuota, c.moneda)} (${c.cuota_actual}/${c.cuota_total})`),
        delMes.length > 12 ? `…y ${delMes.length - 12} más.` : '',
        '',
        'Generado por KBL App.',
      ].filter(Boolean).join('\n');

      descargarIcs(`vence-${nombre}`, generarIcs({
        titulo: `💳 Vence ${nombre} — ${fmtARS.format(total.ars)}`,
        descripcion: detalle,
        fecha: venc,
        hora: cfg.hora,
        avisoDias: cfg.avisoDias,
        repetir: cfg.repetir,
        uid: `venc-${recordar}-${venc}`,
      }));
    }
  });

  render();
}

export { render as renderCuotas };
