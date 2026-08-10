// ====== Módulo Cuotas ======
import { getCuotas, addCuota, removeCuota, updateCuota } from './store.js';
import { confirmar } from './dialog.js';
import { equivalente, casaActual, siguienteCasa, onCotizacion, ahorroVsTarjeta, fmtARS0 } from './cotizacion.js';
import { mediosCredito } from './medios-credito.js';
import { cuotasVencidasSinPagar, hoyIso, diasEntre, pad2 } from './fincore.js';
import { generarIcs, descargarIcs, pedirConfigRecordatorio, labelFechaLarga } from './recordatorio.js';

const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
// Las tarjetas resumen consumos en dólares aparte de los pesos, y sin cotización
// no se pueden sumar: cada total lleva su línea en USD cuando corresponde.
const fmtUSD = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const esUsd = (c) => c.moneda === 'USD';
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

function mesKey(fechaIso) {
  return fechaIso.slice(0, 7); // "2026-08"
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

function proyectarMeses(cuotas, cuantos = 7) {
  const hoy = new Date();
  const hoyKey = mesKey(hoy.toISOString());
  const meses = {};

  for (const c of cuotas) {
    if (c.estado !== 'activa') continue;
    const restantes = c.cuota_total - c.cuota_actual + 1;
    for (let i = 0; i < restantes; i++) {
      const fecha = addMeses(c.fecha_primer_venc, i);
      const key = mesKey(fecha);
      if (key < hoyKey) continue;
      if (!meses[key]) meses[key] = { total: 0, totalUsd: 0, items: [] };
      if (esUsd(c)) meses[key].totalUsd += c.monto_cuota;
      else meses[key].total += c.monto_cuota;
      meses[key].items.push({ desc: c.descripcion, tarjeta: c.tarjeta, monto: c.monto_cuota, moneda: c.moneda, cuotaNum: c.cuota_actual + i, cuotaTotal: c.cuota_total });
    }
  }

  return Object.entries(meses)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, cuantos)
    .map(([key, v]) => ({ key, label: labelMes(key), ...v }));
}

function renderResumen(cuotas, primerMes) {
  const el = $('#cuotas-resumen');
  if (!el || !primerMes) { if (el) el.innerHTML = ''; return; }

  const porTarjeta = {};
  const porTarjetaUsd = {};
  for (const c of cuotas) {
    if (c.estado !== 'activa') continue;
    const restantes = c.cuota_total - c.cuota_actual + 1;
    for (let i = 0; i < restantes; i++) {
      const fecha = addMeses(c.fecha_primer_venc, i);
      if (mesKey(fecha) !== primerMes.key) continue;
      const acum = esUsd(c) ? porTarjetaUsd : porTarjeta;
      acum[c.tarjeta] = (acum[c.tarjeta] || 0) + c.monto_cuota;
    }
  }

  const total = Object.values(porTarjeta).reduce((a, b) => a + b, 0);
  const totalUsd = Object.values(porTarjetaUsd).reduce((a, b) => a + b, 0);
  const filas = mediosCredito()
    .filter((t) => porTarjeta[t.key] || porTarjetaUsd[t.key])
    .map((t) => `
      <div class="resumen-fila">
        <span class="resumen-fila-emoji">${t.emoji}</span>
        <span class="resumen-fila-label">${t.nombre}</span>
        <span class="resumen-fila-monto">${fmtARS.format(porTarjeta[t.key] || 0)}${
          porTarjetaUsd[t.key] ? ` <span class="monto-usd">+ ${fmtUSD.format(porTarjetaUsd[t.key])}</span>` : ''
        }</span>
      </div>`).join('');

  // Los dólares del resumen los cubre comprando (MEP en Mercado Pago) y
  // transfiriendo a Galicia. Mostramos cuánto le sale eso hoy, y cuánto más
  // pagaría si dejara que el banco se los cobre al dólar tarjeta.
  const comp = totalUsd ? ahorroVsTarjeta(totalUsd) : null;
  const bloqueUsd = comp ? `
      <div class="resumen-usd-nota">
        Cubrir los ${fmtUSD.format(totalUsd)} te sale <b>${fmtARS0(comp.propio)}</b>
        comprando ${casaActual().label}.
        <br>Si los pagás en pesos con la tarjeta: ${fmtARS0(comp.conTarjeta)}
        → <b class="resumen-ahorro">ahorrás ${fmtARS0(comp.ahorro)}</b>.
      </div>` : '';

  // Un botón de pago por tarjeta: pagás el resumen entero, no cuota por cuota.
  // Avanza de una todas las cuotas de esa tarjeta que vencen este mes.
  const medios = mediosCredito();
  const accionesPorTarjeta = mediosCredito()
    .filter((t) => porTarjeta[t.key] || porTarjetaUsd[t.key])
    .map((t) => {
      const delMes = cuotas.filter((c) => c.estado === 'activa' && c.tarjeta === t.key
        && c.fecha_primer_venc.slice(0, 7) === primerMes.key);
      if (!delMes.length) return '';
      const venc = vencimientoDe(delMes[0], medios);
      const faltan = diasEntre(hoyIso(), venc);
      const cuando = faltan === 0 ? 'vence hoy'
        : faltan > 0 ? `vence en ${faltan} día${faltan > 1 ? 's' : ''}`
        : `venció hace ${-faltan} día${-faltan > 1 ? 's' : ''}`;
      return `
        <div class="resumen-accion ${faltan < 0 ? 'resumen-accion--vencida' : ''}">
          <div class="resumen-accion-info">
            <b>${t.emoji} ${escapar(t.nombre)}</b>
            <span>${labelFechaLarga(venc)} · ${cuando}</span>
          </div>
          <div class="resumen-accion-btns">
            <button class="fin-btn" data-recordar="${t.key}" data-venc="${venc}">🔔 Recordarme</button>
            <button class="fin-btn fin-btn--ok" data-pagar-tarjeta="${t.key}" data-mes="${primerMes.key}">Ya lo pagué</button>
          </div>
        </div>`;
    }).join('');

  el.innerHTML = `
    <div class="cuotas-resumen-wrap">
      <div class="cuotas-proy-title">Próximo resumen · ${primerMes.label}</div>
      ${filas}
      <div class="resumen-total">
        <span class="resumen-total-label">Total</span>
        <span class="resumen-total-monto">${fmtARS.format(total)}${
          totalUsd ? ` <span class="monto-usd">+ ${fmtUSD.format(totalUsd)}</span>` : ''
        }</span>
      </div>
      ${bloqueUsd}
      ${accionesPorTarjeta}
    </div>`;
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

function render() {
  const cuotas = getCuotas();
  const activas = cuotas.filter((c) => c.estado === 'activa');
  const proyeccion = proyectarMeses(cuotas);

  // Hero: total del mes más próximo con cuotas
  const primerMes = proyeccion[0];
  $('#cuotas-total').textContent = primerMes ? fmtARS.format(primerMes.total) : '$ 0';
  const heroUsd = $('#cuotas-total-usd');
  if (heroUsd) {
    heroUsd.hidden = !primerMes?.totalUsd;
    const eq = primerMes?.totalUsd ? equivalente(primerMes.totalUsd) : '';
    heroUsd.innerHTML = primerMes?.totalUsd
      ? '+ ' + fmtUSD.format(primerMes.totalUsd)
        + (eq ? ` <span class="cotiz-eq" role="button" tabindex="0" title="Tocá para cambiar de cotización">${eq} <span class="cotiz-casa">${casaActual().label}</span></span>` : '')
      : '';
  }
  $('#cuotas-mes-label').textContent = primerMes ? primerMes.label : new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  $('#cuotas-activas-count').textContent = `${activas.length} cuota${activas.length !== 1 ? 's' : ''} activa${activas.length !== 1 ? 's' : ''}`;

  renderVencidas(cuotas);
  renderResumen(cuotas, proyeccion[0]);

  // Proyección mensual
  const proyHtml = proyeccion.length
    ? proyeccion.map((m, i) => `
        <div class="proy-row ${i === 0 ? 'proy-row--next' : ''}">
          <div class="proy-mes">${m.label}</div>
          <div class="proy-barra-wrap">
            <div class="proy-barra" style="width:${Math.min(100, (m.total / (proyeccion[0]?.total || 1)) * 100)}%"></div>
          </div>
          <div class="proy-monto">${fmtARS.format(m.total)}</div>
        </div>`).join('')
    : '<p class="cuotas-empty-sub">Sin cuotas en los próximos meses.</p>';
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
      const ok = await confirmar({
        titulo: esUltima ? '¿Pagaste la última cuota?' : `¿Pagaste la cuota ${c.cuota_actual} de ${c.cuota_total}?`,
        mensaje: esUltima
          ? `"${c.descripcion}" sale de la lista y deja de contar como deuda.`
          : `Baja ${fmt(c.monto_cuota, c.moneda)} del saldo y la próxima pasa a vencer el mes que viene.`,
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

  // Pagar un resumen entero y generar recordatorios (viven en dos contenedores
  // distintos, así que la delegación va en la vista completa).
  $('#view-cuotas').addEventListener('click', async (e) => {
    const btnPagarT = e.target.closest('[data-pagar-tarjeta]');
    if (btnPagarT) {
      const { pagarTarjeta, mes } = btnPagarT.dataset;
      const delMes = getCuotas().filter((c) => c.estado === 'activa'
        && c.tarjeta === pagarTarjeta && c.fecha_primer_venc.slice(0, 7) === mes);
      if (!delMes.length) return;
      const totalArs = delMes.filter((c) => c.moneda !== 'USD').reduce((a, c) => a + c.monto_cuota, 0);
      const medio = mediosCredito().find((m) => m.key === pagarTarjeta);
      const ok = await confirmar({
        titulo: `¿Pagaste el resumen de ${medio?.nombre || pagarTarjeta}?`,
        mensaje: delMes.length === 1
          ? `Se marca 1 cuota por ${fmtARS.format(totalArs)}. Avanza un mes y el saldo baja.`
          : `Se marcan ${delMes.length} cuotas por ${fmtARS.format(totalArs)}. Todas avanzan un mes y el saldo baja.`,
        accion: 'Sí, lo pagué',
      });
      if (ok) { delMes.forEach(avanzarCuota); render(); }
      return;
    }

    const btnRec = e.target.closest('[data-recordar]');
    if (btnRec) {
      const { recordar, venc } = btnRec.dataset;
      const medio = mediosCredito().find((m) => m.key === recordar);
      const nombre = medio?.nombre || recordar;
      const delMes = getCuotas().filter((c) => c.estado === 'activa'
        && c.tarjeta === recordar && c.fecha_primer_venc.slice(0, 7) === venc.slice(0, 7));
      const totalArs = delMes.filter((c) => c.moneda !== 'USD').reduce((a, c) => a + c.monto_cuota, 0);
      const totalUsd = delMes.filter((c) => c.moneda === 'USD').reduce((a, c) => a + c.monto_cuota, 0);

      const cfg = await pedirConfigRecordatorio({
        titulo: `Vence el resumen de ${nombre}`,
        fecha: venc,
      });
      if (!cfg) return;

      const detalle = [
        `Total a pagar: ${fmtARS.format(totalArs)}${totalUsd ? ` + ${fmtUSD.format(totalUsd)}` : ''}`,
        `${delMes.length} cuota${delMes.length > 1 ? 's' : ''} en el resumen.`,
        '',
        ...delMes.slice(0, 12).map((c) => `· ${c.descripcion} — ${fmt(c.monto_cuota, c.moneda)} (${c.cuota_actual}/${c.cuota_total})`),
        delMes.length > 12 ? `…y ${delMes.length - 12} más.` : '',
        '',
        'Generado por KBL App.',
      ].filter(Boolean).join('\n');

      descargarIcs(`vence-${nombre}`, generarIcs({
        titulo: `💳 Vence ${nombre} — ${fmtARS.format(totalArs)}`,
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
