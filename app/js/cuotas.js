// ====== Módulo Cuotas ======
import { getCuotas, addCuota, removeCuota, updateCuotaEstado } from './store.js';
import { confirmar } from './dialog.js';

const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const TARJETAS = [
  { key: 'visa', label: 'Visa',    emoji: '💳' },
  { key: 'mac',  label: 'Mac',     emoji: '⬛' },
  { key: 'mp',   label: 'MP',      emoji: '🔵' },
  { key: 'efectivo', label: 'Efec', emoji: '💵' },
];

let tarjetaSel = 'visa';
const $ = (sel) => document.querySelector(sel);

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
      if (!meses[key]) meses[key] = { total: 0, items: [] };
      meses[key].total += c.monto_cuota;
      meses[key].items.push({ desc: c.descripcion, tarjeta: c.tarjeta, monto: c.monto_cuota, cuotaNum: c.cuota_actual + i, cuotaTotal: c.cuota_total });
    }
  }

  return Object.entries(meses)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, cuantos)
    .map(([key, v]) => ({ key, label: labelMes(key), ...v }));
}

function render() {
  const cuotas = getCuotas();
  const activas = cuotas.filter((c) => c.estado === 'activa');
  const proyeccion = proyectarMeses(cuotas);

  // Hero: total del mes más próximo con cuotas
  const primerMes = proyeccion[0];
  $('#cuotas-total').textContent = primerMes ? fmtARS.format(primerMes.total) : '$ 0';
  $('#cuotas-mes-label').textContent = primerMes ? primerMes.label : new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  $('#cuotas-activas-count').textContent = `${activas.length} cuota${activas.length !== 1 ? 's' : ''} activa${activas.length !== 1 ? 's' : ''}`;

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

  const tarjetaEmoji = (key) => (TARJETAS.find((t) => t.key === key) || TARJETAS[0]).emoji;

  $('#cuotas-lista').innerHTML = activas
    .sort((a, b) => a.fecha_primer_venc.localeCompare(b.fecha_primer_venc))
    .map((c) => {
      const restantes = c.cuota_total - c.cuota_actual + 1;
      const pct = Math.round(((c.cuota_actual - 1) / c.cuota_total) * 100);
      return `
        <div class="cuota-card">
          <div class="cuota-card-top">
            <span class="cuota-emoji">${tarjetaEmoji(c.tarjeta)}</span>
            <div class="cuota-info">
              <div class="cuota-desc">${c.descripcion}</div>
              <div class="cuota-sub">${fmtARS.format(c.monto_cuota)}/cuota · ${restantes} restante${restantes !== 1 ? 's' : ''} de ${c.cuota_total}</div>
            </div>
            <div class="cuota-actions">
              <button class="cuota-ok" data-id="${c.id}" title="Marcar completada">✓</button>
              <button class="cuota-del" data-id="${c.id}" title="Eliminar">✕</button>
            </div>
          </div>
          <div class="cuota-progress-wrap">
            <div class="cuota-progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="cuota-progress-label">${c.cuota_actual}/${c.cuota_total} — cuota actual ${fmtARS.format(c.monto_cuota)}</div>
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
  // Chips de tarjeta
  $('#cuota-tarjeta-chips').innerHTML = TARJETAS
    .map((t) => `<button class="chip cat-chip ${t.key === tarjetaSel ? 'selected' : ''}" data-tk="${t.key}">${t.emoji} ${t.label}</button>`)
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
    const btnOk = e.target.closest('.cuota-ok');
    const btnDel = e.target.closest('.cuota-del');

    if (btnOk) {
      const ok = await confirmar({ titulo: '¿Marcar como completada?', accion: 'Completar', destructivo: false });
      if (ok) { updateCuotaEstado(btnOk.dataset.id, 'completada'); render(); }
    }
    if (btnDel) {
      const ok = await confirmar({ titulo: '¿Eliminar esta cuota?', accion: 'Eliminar', destructivo: true });
      if (ok) { removeCuota(btnDel.dataset.id); render(); }
    }
  });

  render();
}

export { render as renderCuotas };
