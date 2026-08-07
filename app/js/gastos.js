// ====== Módulo Gastos — carga en 5 segundos ======
import { getGastos, addGasto, removeGasto } from './store.js';
import { confirmar } from './dialog.js';
import { equivalente, casaActual, siguienteCasa, onCotizacion } from './cotizacion.js';
import { clasificar } from './catalogo.js';
import { mediosCredito } from './medios-credito.js';
import { reconocerTicket } from './ticket-ocr.js';
import { parsearTicket } from './ticket-parser.js';

export const CATEGORIAS = [
  { key: 'comida',     emoji: '🍔', label: 'Comida' },
  { key: 'super',      emoji: '🛒', label: 'Súper' },
  { key: 'transporte', emoji: '🚗', label: 'Transporte' },
  { key: 'salidas',    emoji: '🎉', label: 'Salidas' },
  { key: 'servicios',  emoji: '🔁', label: 'Servicios' },
  { key: 'casa',       emoji: '🏠', label: 'Casa' },
  { key: 'salud',      emoji: '💊', label: 'Salud' },
  { key: 'otros',      emoji: '📦', label: 'Otros' },
];

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

function render() {
  const gastos = getGastos();
  const { y, m } = mesActual();
  const delMes = gastos.filter((g) => {
    const f = new Date(g.fecha + 'T00:00:00');
    return f.getFullYear() === y && f.getMonth() === m;
  });

  // Total del mes. Pesos y dólares NO se suman en el número grande: son monedas
  // distintas. Los dólares van en su propia línea, con el equivalente en pesos
  // al lado (a la cotización elegida) para que el orden de magnitud se entienda.
  const enPesos = delMes.filter((g) => g.moneda !== 'USD');
  const enDolares = delMes.filter((g) => g.moneda === 'USD');
  const totalUsd = enDolares.reduce((a, g) => a + g.monto, 0);
  $('#gasto-total').textContent = fmtARS.format(enPesos.reduce((a, g) => a + g.monto, 0));
  const elUsd = $('#gasto-total-usd');
  elUsd.hidden = enDolares.length === 0;
  const eq = equivalente(totalUsd);
  elUsd.innerHTML = '+ ' + fmtUSD.format(totalUsd)
    + (eq ? ` <span class="cotiz-eq" role="button" tabindex="0" title="Tocá para cambiar de cotización">${eq} <span class="cotiz-casa">${casaActual().label}</span></span>` : '');
  $('#gastos-mes-label').textContent = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

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
    html += `
      <div class="gasto-item">
        <span class="gasto-emoji">${emojiDe(g.categoria)}</span>
        <div class="gasto-item-mid">
          <span class="gasto-desc">${escapar(g.descripcion) || (CATEGORIAS.find((c) => c.key === g.categoria)?.label ?? 'Gasto')}</span>
          ${tk ? `<span class="gasto-tarjeta-badge">${tk.emoji} ${tk.nombre}</span>` : ''}
        </div>
        <span class="gasto-monto${g.moneda === 'USD' ? ' es-usd' : ''}">${fmt(g.monto, g.moneda)}</span>
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
}

export function initGastos() {
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
