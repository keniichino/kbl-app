// ====== Módulo Gastos — carga en 5 segundos ======
import { getGastos, addGasto, removeGasto, updateGasto, getPagosResumen } from './store.js';
import { confirmar, pedirTexto } from './dialog.js';
import { equivalente, casaActual, siguienteCasa, onCotizacion } from './cotizacion.js';
import { clasificar } from './catalogo.js';
import { mediosCredito } from './medios-credito.js';
import { reconocerTicket } from './ticket-ocr.js';
import { parsearTicket } from './ticket-parser.js';
import { parsearResumen, marcarDuplicados, EMOJI_CAT } from './import-resumen.js';
import { periodoDeGasto, labelMes } from './fincore.js';

// `educacion` e `impuestos` salieron de mirar los datos reales, no de una
// lista teórica: la facultad ($828.348 entre UADE y la cuota de agosto) estaba
// repartida entre "servicios" y "otros", que son justo los dos rubros que no
// se pueden recortar ni interpretar. Con la facultad adentro, "servicios"
// parecía un gasto fijo enorme y "otros" un pozo sin fondo de $1,5 M.
export const CATEGORIAS = [
  { key: 'comida',     emoji: '🍔', label: 'Comida' },
  { key: 'super',      emoji: '🛒', label: 'Súper' },
  { key: 'transporte', emoji: '🚗', label: 'Transporte' },
  { key: 'salidas',    emoji: '🎉', label: 'Salidas' },
  { key: 'servicios',  emoji: '🔁', label: 'Servicios' },
  { key: 'educacion',  emoji: '🎓', label: 'Educación' },
  { key: 'casa',       emoji: '🏠', label: 'Casa' },
  { key: 'salud',      emoji: '💊', label: 'Salud' },
  { key: 'impuestos',  emoji: '🧾', label: 'Impuestos' },
  { key: 'otros',      emoji: '📦', label: 'Otros' },
];

// Sin centavos, para los chips de resumen: son montos de seis cifras.
const fmtARS0 = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const fmtUSD = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
// Los gastos viejos no tienen moneda: son todos pesos.
const fmt = (monto, moneda) => (moneda === 'USD' ? fmtUSD : fmtARS).format(monto);

const CAT_DEFECTO = 'comida';
let catSeleccionada = CAT_DEFECTO;
let tarjetaGastoSel = null;
let monedaSel = 'ARS';   // arranca en pesos; se mantiene hasta que lo cambies
// Si tocaste un chip a mano, el catálogo no te lo pisa: vos sabés más que él.
let catElegidaAMano = false;

const $ = (sel) => document.querySelector(sel);

// Escapa texto del usuario antes de inyectarlo en innerHTML (evita que un
// "<" o "&" en la descripción rompa el render de la lista).
function escapar(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function emojiDe(key) {
  return (CATEGORIAS.find((c) => c.key === key) || CATEGORIAS.at(-1)).emoji;
}

function mesActual() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}

function etiquetaDia(fechaIso) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaIso + 'T00:00:00');
  const diff = Math.round((hoy - f) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/**
 * El aviso de que hay un resumen sin importar.
 *
 * No es una racha ni un premio: es la única forma honesta de invitar a volver
 * a una app de gastos. Si el resumen cerró y no cargaste nada, los números que
 * te muestra la app son mentira, y decírtelo es más útil que felicitarte.
 *
 * Se mide por `ts` (cuándo lo cargaste), no por `fecha` (cuándo lo gastaste):
 * importar un resumen viejo cuenta como actividad, que es justamente lo que
 * queremos que hagas.
 */
function avisoDeCarga(gastos) {
  const el = $('#gasto-aviso');
  if (!el) return;
  if (!gastos.length) {
    el.hidden = false;
    el.innerHTML = `<b>Todavía no hay nada cargado.</b>
      Pegá el resumen del banco en <b>Importar resumen</b> y arrancás con un mes entero de una.`;
    return;
  }

  // Se avisa cuando CERRÓ un resumen y desde ese cierre no cargaste nada, que
  // es cuando de verdad hay algo nuevo para importar: una vez por tarjeta y
  // por mes. Contar "días desde la última carga" estaba mal — con un hábito
  // mensual, un umbral de 3 días aparece 27 de cada 30 días y se vuelve
  // exactamente el ruido que se aprende a ignorar.
  const ultimoTs = Math.max(...gastos.map((g) => g.ts || 0));
  const hoy = new Date();

  const pendientes = mediosCredito()
    .filter((m) => m.diaCierre != null)
    .map((m) => {
      // Último cierre que ya pasó: este mes si el día ya quedó atrás, si no el anterior.
      const cierre = new Date(hoy.getFullYear(), hoy.getMonth(), m.diaCierre);
      if (cierre > hoy) cierre.setMonth(cierre.getMonth() - 1);
      return { medio: m, cierre };
    })
    .filter(({ cierre }) => ultimoTs < cierre.getTime())
    .sort((a, b) => b.cierre - a.cierre);

  if (!pendientes.length) { el.hidden = true; return; }

  const { medio, cierre } = pendientes[0];
  const dias = Math.floor((hoy - cierre) / 86400000);
  const nombre = `${medio.banco || ''} ${medio.nombre}`.trim();
  el.hidden = false;
  el.innerHTML = `<b>Cerró el resumen de ${nombre}</b> hace ${dias === 0 ? 'horas' : dias + (dias === 1 ? ' día' : ' días')}
    y todavía no cargaste nada. Pegalo en <b>Importar resumen</b> y se pone al día solo.`;
}

/**
 * A qué resumen cae cada gasto del mes.
 *
 * Esta pantalla agrupa por mes CALENDARIO ("cuánto gasté en agosto"), pero la
 * tarjeta cierra el día 5: lo del 1 al 5 se paga en el resumen de este mes y
 * lo del 6 en adelante recién en el próximo. Sin decirlo, el total grande se
 * confunde con "lo que voy a pagar" — y encima da parecido, que es lo peor
 * que puede pasar: en agosto/2026 el total del mes daba $1.616.386 y el
 * resumen a pagar $1.607.036. Dos números casi iguales que significan cosas
 * distintas hacen dudar de toda la pantalla.
 */
function pintarDesglosePeriodo(propios) {
  const el = $('#gasto-periodos');
  if (!el) return;
  const medios = mediosCredito();
  const pagos = getPagosResumen();

  const porPeriodo = new Map();
  for (const g of propios) {
    if (g.moneda === 'USD') continue;              // los dólares van en su línea
    const medio = medios.find((m) => m.key === g.tarjeta);
    if (!medio || medio.diaCierre == null) continue; // caja: se paga al toque
    const per = periodoDeGasto(g.fecha, medio);
    porPeriodo.set(per, (porPeriodo.get(per) || 0) + g.monto);
  }

  // Con un solo período no hay nada que aclarar: el total ya se entiende.
  if (porPeriodo.size < 2) { el.hidden = true; return; }

  const filas = [...porPeriodo.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  el.hidden = false;
  el.innerHTML = filas.map(([per, monto]) => {
    const pagado = pagos.some((p) => p.periodo === per);
    return `<span class="gasto-per ${pagado ? 'gasto-per--pago' : ''}">
      ${fmtARS0.format(monto)}
      <small>${pagado ? 'ya pagado · ' : ''}resumen de ${labelMes(per, { corto: true })}</small>
    </span>`;
  }).join('');
}

function render() {
  const gastos = getGastos();
  avisoDeCarga(gastos);
  const { y, m } = mesActual();
  const delMes = gastos.filter((g) => {
    const f = new Date(g.fecha + 'T00:00:00');
    return f.getFullYear() === y && f.getMonth() === m;
  });

  // Total del mes. Pesos y dólares NO se suman en el número grande: son monedas
  // distintas. Los dólares van en su propia línea, con el equivalente en pesos
  // al lado (a la cotización elegida) para que el orden de magnitud se entienda.
  // Lo que pagaste por otro no entra en tu total: es un adelanto, no un gasto.
  const propios = delMes.filter((g) => !g.reintegro);
  const enPesos = propios.filter((g) => g.moneda !== 'USD');
  const enDolares = propios.filter((g) => g.moneda === 'USD');
  const totalUsd = enDolares.reduce((a, g) => a + g.monto, 0);
  $('#gasto-total').textContent = fmtARS.format(enPesos.reduce((a, g) => a + g.monto, 0));
  const elUsd = $('#gasto-total-usd');
  elUsd.hidden = enDolares.length === 0;
  const eq = equivalente(totalUsd);
  elUsd.innerHTML = '+ ' + fmtUSD.format(totalUsd)
    + (eq ? ` <span class="cotiz-eq" role="button" tabindex="0" title="Tocá para cambiar de cotización">${eq} <span class="cotiz-casa">${casaActual().label}</span></span>` : '');
  $('#gastos-mes-label').textContent = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  pintarDesglosePeriodo(propios);

  // El desglose por categoría es sólo de pesos, por lo mismo.
  const porCat = {};
  enPesos.forEach((g) => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; });
  $('#gasto-cats-resumen').innerHTML = Object.entries(porCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, monto]) => `<span class="cat-mini">${emojiDe(cat)} ${fmtARS.format(monto)}</span>`)
    .join('');

  // Lista agrupada por día (últimos 40 movimientos)
  const recientes = gastos.slice().sort((a, b) => b.ts - a.ts).slice(0, 40);
  const medios = mediosCredito();
  let html = '';
  let diaActual = null;
  for (const g of recientes) {
    if (g.fecha !== diaActual) {
      diaActual = g.fecha;
      html += `<div class="gasto-dia">${etiquetaDia(g.fecha)}</div>`;
    }
    const tk = medios.find((t) => t.key === g.tarjeta);
    const rein = g.reintegro;
    html += `
      <div class="gasto-item${rein ? ' gasto-item--ajeno' : ''}">
        <span class="gasto-emoji">${emojiDe(g.categoria)}</span>
        <div class="gasto-item-mid">
          <span class="gasto-desc">${escapar(g.descripcion) || (CATEGORIAS.find((c) => c.key === g.categoria)?.label ?? 'Gasto')}</span>
          ${tk ? `<span class="gasto-tarjeta-badge">${tk.emoji} ${tk.nombre}</span>` : ''}
          ${rein ? `<span class="gasto-ajeno-badge gasto-ajeno-badge--${rein}">${
            rein === 'pendiente' ? '🤝 te lo debe' : '✓ ya te lo devolvió'
          }${g.reintegro_de ? ` ${escapar(g.reintegro_de)}` : ''}</span>` : ''}
        </div>
        <span class="gasto-monto${g.moneda === 'USD' ? ' es-usd' : ''}${rein ? ' gasto-monto--ajeno' : ''}">${fmt(g.monto, g.moneda)}</span>
        <button class="gasto-ajeno" data-id="${g.id}" title="${
          rein ? 'Cambiar estado del reintegro' : 'Lo pagué por otro'
        }" aria-label="Marcar como pagado por otro">🤝</button>
        <button class="gasto-borrar" data-id="${g.id}" aria-label="Borrar">✕</button>
      </div>`;
  }
  $('#gastos-lista').innerHTML = html ||
    '<div class="forest-empty"><div class="empty-emoji">💸</div><p>Sin gastos todavía.<br>El primero se carga acá arriba en 5 segundos.</p></div>';
}

// Mismo separador de miles que usa el input al tipear, para que el valor
// precargado por OCR se vea igual que si lo hubieras escrito vos.
function formatearMontoInput(n) {
  const esEntero = Number.isInteger(n);
  const [ent, dec] = n.toFixed(esEntero ? 0 : 2).split('.');
  const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec ? `${entFmt},${dec}` : entFmt;
}

async function procesarFoto(file) {
  const estado = $('#gasto-foto-estado');
  const btn = $('#btn-gasto-foto');
  btn.disabled = true;
  estado.hidden = false;
  estado.textContent = 'Leyendo ticket…';
  try {
    const texto = await reconocerTicket(file, (p) => {
      estado.textContent = `Leyendo ticket… ${Math.round(p * 100)}%`;
    });
    const { monto, comercio } = parsearTicket(texto);

    if (monto) $('#gasto-monto').value = formatearMontoInput(monto);
    if (comercio) {
      $('#gasto-desc').value = comercio;
      // Dispara la autocategorización que ya existe para el tipeo manual.
      $('#gasto-desc').dispatchEvent(new Event('input', { bubbles: true }));
    }

    estado.textContent = (monto || comercio)
      ? 'Revisá los datos y confirmá abajo.'
      : 'No pude leer el ticket — cargalo a mano.';
    $('#gasto-monto').focus();
  } catch (err) {
    console.warn('[ocr]', err);
    estado.textContent = 'No pude leer el ticket — cargalo a mano.';
  } finally {
    btn.disabled = false;
    setTimeout(() => { estado.hidden = true; }, 4000);
  }
}

function agregar() {
  const montoRaw = $('#gasto-monto').value.trim().replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const monto = parseFloat(montoRaw);
  if (!monto || monto <= 0) {
    $('#gasto-monto').focus();
    return;
  }
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  addGasto({
    id: crypto.randomUUID(),
    monto,
    descripcion: $('#gasto-desc').value.trim(),
    categoria: catSeleccionada,
    tarjeta: tarjetaGastoSel,
    moneda: monedaSel,
    fecha,
    ts: Date.now(),
  });
  $('#gasto-monto').value = '';
  $('#gasto-desc').value = '';
  // El próximo gasto arranca limpio: vuelve a autocategorizarse solo.
  catElegidaAMano = false;
  catSeleccionada = CAT_DEFECTO;
  document.querySelectorAll('.cat-chip')
    .forEach((c) => c.classList.toggle('selected', c.dataset.cat === CAT_DEFECTO));
  const hint = $('#gasto-cat-hint');
  if (hint) hint.hidden = true;
  render();
  $('#gasto-monto').focus();
  // El alta vive en un sheet que se abre desde cualquier vista (ver app.js).
  // Se avisa en vez de cerrarlo acá para que este módulo no sepa nada de dónde
  // está montado su propio formulario.
  document.dispatchEvent(new CustomEvent('kbl:gasto-agregado'));
}

// ---------- Importar resumen ----------
// Lo pesado (parsear, deduplicar) vive en `import-resumen.js`; acá sólo está
// la pantalla. Nada se guarda hasta que se ve la previsualización: un import
// que escribe primero y muestra después es un import en el que no podés
// confiar, y este toca la tabla más grande de la app.

let impLeidos = [];

function pintarPreview() {
  const cont = $('#imp-preview');
  if (!impLeidos.length) { cont.innerHTML = ''; return; }

  const nuevos = impLeidos.filter((m) => m.tipo === 'gasto' && !m.duplicado);
  const repes = impLeidos.filter((m) => m.tipo === 'gasto' && m.duplicado);
  const cuotas = impLeidos.filter((m) => m.tipo === 'cuota');
  const ajustes = impLeidos.filter((m) => m.tipo === 'ajuste');

  cont.innerHTML = `
    <div class="imp-resumen">
      <b>${nuevos.length}</b> para cargar
      ${repes.length ? ` · <span class="fin-soft">${repes.length} ya estaban</span>` : ''}
      ${cuotas.length ? ` · <span class="fin-soft">${cuotas.length} en cuotas</span>` : ''}
      ${ajustes.length ? ` · <span class="fin-soft">${ajustes.length} ajustes</span>` : ''}
    </div>
    ${nuevos.length ? `
      <div class="imp-lista">
        ${nuevos.map((m, i) => `
          <label class="imp-fila">
            <input type="checkbox" data-i="${impLeidos.indexOf(m)}" ${m.excluir ? '' : 'checked'}>
            <span class="imp-cat">${EMOJI_CAT[m.categoria] || '📦'}</span>
            <span class="imp-desc">${escaparTxt(m.descripcion)}<small>${m.fecha.slice(8)}/${m.fecha.slice(5, 7)}</small></span>
            <span class="imp-monto">${fmt(m.monto, m.moneda)}</span>
          </label>`).join('')}
      </div>
      <button class="fin-btn fin-btn--ok imp-confirmar" id="imp-confirmar">
        Cargar ${nuevos.filter((m) => !m.excluir).length}
      </button>` : `
      <div class="fin-nota fin-nota--ok">✓ No hay nada nuevo: todo lo que pegaste ya estaba cargado.</div>`}
    ${cuotas.length ? `
      <div class="fin-nota">Los planes en cuotas no se cargan como gasto — la app los lleva
        aparte en Cuotas, para no cobrarte dos veces la misma compra.
        ${cuotas.map((c) => escaparTxt(c.descripcion) + ' (' + c.cuota.actual + '/' + c.cuota.total + ')').join(', ')}.</div>` : ''}
    ${ajustes.length ? `
      <div class="fin-nota">Devoluciones y percepciones detectadas, no se cargan como consumo:
        ${ajustes.map((a) => escaparTxt(a.descripcion)).join(', ')}.</div>` : ''}`;
}

const escaparTxt = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function leerImport() {
  const texto = $('#imp-texto').value;
  const { movimientos, descartados, tarjeta } = parsearResumen(texto);
  impLeidos = marcarDuplicados(movimientos, getGastos());
  const est = $('#imp-estado');
  est.textContent = movimientos.length
    ? `${movimientos.length} movimientos · ${tarjeta ? 'tarjeta ' + tarjeta : 'sin tarjeta detectada'}`
    : (descartados.length ? 'No reconocí ningún movimiento' : 'Pegá el listado primero');
  est.className = 'imp-estado' + (movimientos.length ? '' : ' fin-mal');
  pintarPreview();
}

function confirmarImport() {
  const aCargar = impLeidos.filter((m) => m.tipo === 'gasto' && !m.duplicado && !m.excluir);
  if (!aCargar.length) return;
  for (const m of aCargar) {
    addGasto({
      id: crypto.randomUUID(),
      monto: m.monto,
      descripcion: m.descripcion,
      categoria: m.categoria,
      tarjeta: m.tarjeta,
      moneda: m.moneda,
      fecha: m.fecha,
      ts: Date.now(),
    });
  }
  impLeidos = [];
  $('#imp-texto').value = '';
  $('#imp-estado').textContent = `✓ ${aCargar.length} cargados`;
  $('#imp-preview').innerHTML = '';
  $('#imp').open = false;
  render();
}

function initImport() {
  const caja = $('#imp');
  if (!caja) return;
  caja.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'imp-leer') { e.preventDefault(); leerImport(); }
    if (b.id === 'imp-confirmar') { e.preventDefault(); confirmarImport(); }
  });
  caja.addEventListener('change', (e) => {
    const chk = e.target.closest('input[type=checkbox]');
    if (!chk) return;
    const mv = impLeidos[Number(chk.dataset.i)];
    if (mv) mv.excluir = !chk.checked;
    const btn = $('#imp-confirmar');
    if (btn) btn.textContent = `Cargar ${impLeidos.filter((m) => m.tipo === 'gasto' && !m.duplicado && !m.excluir).length}`;
  });
}

export function initGastos() {
  initImport();
  // La cotización llega asincrónica (y puede cambiar de casa): repintamos.
  onCotizacion(() => { if (!$('#gasto-total-usd')?.hidden) render(); });
  $('#gasto-total-usd').addEventListener('click', (e) => {
    if (!e.target.closest('.cotiz-eq')) return;
    siguienteCasa();
  });

  $('#cat-chips').innerHTML = CATEGORIAS
    .map((c) => `<button class="chip cat-chip ${c.key === catSeleccionada ? 'selected' : ''}" data-cat="${c.key}">${c.emoji} ${c.label}</button>`)
    .join('');

  $('#gasto-tarjeta-chips').innerHTML = mediosCredito()
    .map((t) => `<button class="chip tarjeta-chip" data-tk="${t.key}">${t.emoji} ${t.nombre}</button>`)
    .join('');

  $('#cat-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    catSeleccionada = chip.dataset.cat;
    catElegidaAMano = true;
    $('#gasto-cat-hint').hidden = true;
    document.querySelectorAll('.cat-chip').forEach((c) => c.classList.toggle('selected', c === chip));
  });

  // Categoría sola a partir de la descripción: escribís "Coto" y se pone Súper.
  // Sólo sugiere; en cuanto tocás un chip deja de meterse.
  $('#gasto-desc').addEventListener('input', () => {
    if (catElegidaAMano) return;
    const hint = $('#gasto-cat-hint');
    const hit = clasificar($('#gasto-desc').value);
    // Sin match volvemos al default: si no, borrás "DiDi", escribís otra cosa
    // y el chip queda pegado en Transporte.
    const cat = hit ? hit.cat : CAT_DEFECTO;
    catSeleccionada = cat;
    document.querySelectorAll('.cat-chip')
      .forEach((c) => c.classList.toggle('selected', c.dataset.cat === cat));
    if (!hit) { hint.hidden = true; return; }
    const info = CATEGORIAS.find((c) => c.key === cat);
    hint.innerHTML = `✨ Lo puse en <b>${info.emoji} ${info.label}</b>${
      hit.clase !== 'variable' ? ` · parece ${hit.clase === 'fijo' ? 'un gasto fijo' : 'una suscripción'}` : ''}`;
    hint.hidden = false;
  });

  $('#gasto-tarjeta-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.tarjeta-chip');
    if (!chip) return;
    const key = chip.dataset.tk;
    if (tarjetaGastoSel === key) {
      tarjetaGastoSel = null;
      document.querySelectorAll('.tarjeta-chip').forEach((c) => c.classList.remove('selected'));
    } else {
      tarjetaGastoSel = key;
      document.querySelectorAll('.tarjeta-chip').forEach((c) => c.classList.toggle('selected', c === chip));
    }
  });

  $('#gasto-moneda').addEventListener('click', (e) => {
    const op = e.target.closest('.seg-op');
    if (!op) return;
    monedaSel = op.dataset.moneda;
    document.querySelectorAll('#gasto-moneda .seg-op')
      .forEach((b) => b.classList.toggle('selected', b === op));
    // El placeholder acompaña para que se vea en qué moneda vas a cargar
    $('#gasto-monto').placeholder = monedaSel === 'USD' ? 'US$ 0' : '$ 0';
  });

  // Separador de miles en vivo: 1234567 → 1.234.567 (coma para decimales)
  $('#gasto-monto').addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^\d,]/g, '');
    const [ent, ...resto] = v.split(',');
    const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const dec = resto.length ? ',' + resto.join('').slice(0, 2) : '';
    e.target.value = entFmt + dec;
  });

  $('#btn-gasto-foto').addEventListener('click', () => $('#gasto-foto-input').click());
  $('#gasto-foto-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // permite elegir la misma foto de nuevo más adelante
    if (file) procesarFoto(file);
  });

  $('#btn-gasto').addEventListener('click', agregar);
  $('#gasto-desc').addEventListener('keydown', (e) => { if (e.key === 'Enter') agregar(); });
  $('#gasto-monto').addEventListener('keydown', (e) => { if (e.key === 'Enter') agregar(); });

  $('#gastos-lista').addEventListener('click', async (e) => {
    // Ciclo del reintegro: propio → te lo deben → ya te lo devolvió → propio.
    const btnAjeno = e.target.closest('.gasto-ajeno');
    if (btnAjeno) {
      const g = getGastos().find((x) => x.id === btnAjeno.dataset.id);
      if (!g) return;
      if (!g.reintegro) {
        const quien = await pedirTexto({
          titulo: '¿Por quién lo pagaste?',
          mensaje: 'Sale de tu caja pero no es tu gasto: deja de contar en tu total y aparece en "Te deben" hasta que te lo devuelvan.',
          placeholder: 'Papá, Juan, la oficina…',
          accion: 'Marcar',
        });
        if (quien === null) return;
        updateGasto(g.id, { reintegro: 'pendiente', reintegro_de: quien });
      } else if (g.reintegro === 'pendiente') {
        updateGasto(g.id, { reintegro: 'cobrado' });
      } else {
        updateGasto(g.id, { reintegro: null, reintegro_de: null });
      }
      return render();
    }

    const btn = e.target.closest('.gasto-borrar');
    if (!btn) return;
    const ok = await confirmar({ titulo: '¿Borrar este gasto?', accion: 'Borrar', destructivo: true });
    if (ok) {
      removeGasto(btn.dataset.id);
      render();
    }
  });

  render();
}

export { render as renderGastos };
