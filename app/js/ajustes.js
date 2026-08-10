// ====== Ajustes ======
// Junta en un solo lugar lo que estaba disperso: el tema vivía en un botón
// flotante que se le montaba encima al navegador de meses del Panel, la
// cotización se cambiaba tocando cualquier importe en dólares (y había que
// saberlo), la meta de ahorro estaba escondida dentro del formulario de
// movimientos, y "Salir" sólo existía en el header del Bosque.
//
// Es un bottom sheet y no una vista más: seis pestañas ya son las que entran
// en la tabbar de un celular, y esto se abre dos veces por mes.

import { casaActual, CASAS, elegirCasa, todasLasCotizaciones } from './cotizacion.js';
import { confirmar } from './dialog.js';
import { getGastos, getCuotas, getRecurrentes, getAhorros, getInversiones } from './store.js';

const $ = (sel) => document.querySelector(sel);
const CFG = 'kbl.panel';

const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch { return {}; } };
const setCfg = (p) => localStorage.setItem(CFG, JSON.stringify({ ...cfg(), ...p }));

const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});

/** Tamaño de lo guardado en el dispositivo, para saber si vale la pena limpiar. */
function pesoLocal() {
  let bytes = 0;
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('kbl.')) continue;
    bytes += (localStorage.getItem(k) || '').length;
  }
  return bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function contenido() {
  const esOscuro = document.body.dataset.theme === 'dark';
  const c = todasLasCotizaciones();
  const meta = Number(cfg().meta ?? 20);
  const cuentas = [
    ['Gastos', getGastos().length],
    ['Cuotas', getCuotas().filter((x) => x.estado === 'activa').length],
    ['Conceptos fijos', getRecurrentes().length],
    ['Movimientos de ahorro', getAhorros().length],
    ['Operaciones de inversión', getInversiones().length],
  ];

  return `
    <div class="aj-grip"></div>
    <div class="aj-head">
      <h2>Ajustes</h2>
      <button class="aj-cerrar" data-aj="cerrar" aria-label="Cerrar">✕</button>
    </div>

    <div class="aj-seccion">
      <div class="aj-label">Tema</div>
      <div class="viewer-species aj-seg" role="group" aria-label="Tema">
        <button class="seg-btn ${!esOscuro ? 'selected' : ''}" data-aj="tema" data-valor="light">☀️ Claro</button>
        <button class="seg-btn ${esOscuro ? 'selected' : ''}" data-aj="tema" data-valor="dark">🌙 Oscuro</button>
      </div>
    </div>

    <div class="aj-seccion">
      <div class="aj-label">Cotización del dólar</div>
      <div class="aj-chips">
        ${CASAS.map((k) => `
          <button class="chip ${k.key === casaActual().key ? 'selected' : ''}" data-aj="casa" data-valor="${k.key}">
            ${k.label}${c && c[k.key] ? `<span class="aj-chip-valor">$ ${Math.round(c[k.key]).toLocaleString('es-AR')}</span>` : ''}
          </button>`).join('')}
      </div>
      <p class="aj-ayuda">Con la que se convierten tus gastos y suscripciones en dólares.
        <b>MEP</b> es a lo que comprás en Mercado Pago; el blue es efectivo y no es tu precio.</p>
    </div>

    <div class="aj-seccion">
      <div class="aj-label">Meta de ahorro</div>
      <div class="aj-meta">
        <input type="range" id="aj-meta" min="0" max="50" step="5" value="${meta}" class="aj-range">
        <span class="aj-meta-valor" id="aj-meta-valor">${meta}%</span>
      </div>
      <p class="aj-ayuda">Del ingreso. Lo estándar es entre 10% y 20%; el panel te dice cuánto te falta para llegar.</p>
    </div>

    <div class="aj-seccion">
      <div class="aj-label">Tus datos</div>
      <div class="aj-datos">
        ${cuentas.map(([n, v]) => `<div class="aj-dato"><span>${n}</span><b>${v}</b></div>`).join('')}
        <div class="aj-dato"><span>Guardado en este dispositivo</span><b>${pesoLocal()}</b></div>
      </div>
      <p class="aj-ayuda">Todo se sincroniza con la nube. Lo que está acá es la copia local que hace que la app
        abra al instante y funcione sin internet.</p>
    </div>

    <div class="aj-seccion">
      <button class="aj-btn aj-btn--peligro" data-aj="salir">Cerrar sesión</button>
      <p class="aj-ayuda">Borra la copia local de este dispositivo. Tus datos siguen en la nube.</p>
    </div>

    <div class="aj-pie">KBL App · hecha para uso personal</div>`;
}

let sheet = null;

export function abrirAjustes() {
  // `sheet && isConnected` y no sólo `sheet`: si el nodo se saca del DOM por
  // afuera, la variable queda apuntando a un huérfano y el panel no vuelve a
  // abrir nunca más.
  if (sheet?.isConnected) return;
  sheet = null;
  sheet = document.createElement('div');
  sheet.className = 'aj-overlay';
  sheet.innerHTML = `<div class="aj-sheet" role="dialog" aria-modal="true" aria-label="Ajustes">${contenido()}</div>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('abierto'));

  const cerrar = () => {
    if (!sheet) return;
    sheet.classList.remove('abierto');
    const s = sheet;
    sheet = null;
    setTimeout(() => s.remove(), 220);
  };

  const repintar = () => {
    if (sheet) sheet.querySelector('.aj-sheet').innerHTML = contenido();
  };

  sheet.addEventListener('click', async (e) => {
    if (e.target === sheet) return cerrar();
    const b = e.target.closest('[data-aj]');
    if (!b) return;
    const { aj, valor } = b.dataset;

    if (aj === 'cerrar') return cerrar();

    if (aj === 'tema') {
      document.body.setAttribute('data-theme', valor);
      localStorage.setItem('kbl.theme', valor);
      const t = $('#theme-toggle');
      if (t) t.textContent = valor === 'dark' ? '☀️' : '🌙';
      return repintar();
    }

    if (aj === 'casa') { elegirCasa(valor); return repintar(); }

    if (aj === 'salir') {
      const ok = await confirmar({
        titulo: '¿Cerrar sesión?',
        mensaje: 'Se borra la copia local de este dispositivo. Tus datos siguen en la nube y vuelven al entrar.',
        accion: 'Cerrar sesión', destructivo: true,
      });
      if (ok) { cerrar(); $('#btn-logout')?.click(); }
    }
  });

  // El slider va por delegación y no con un listener sobre el elemento:
  // cambiar el tema o la cotización repinta el sheet entero, y un listener
  // directo se moría con el nodo viejo (la meta dejaba de guardarse después
  // de tocar cualquier otra cosa).
  // `input` sólo actualiza el número que se ve — repintar en cada paso del
  // arrastre mataría el gesto; se guarda en `change`, al soltar.
  sheet.addEventListener('input', (e) => {
    if (e.target.id !== 'aj-meta') return;
    const v = sheet.querySelector('#aj-meta-valor');
    if (v) v.textContent = `${e.target.value}%`;
  });
  sheet.addEventListener('change', (e) => {
    if (e.target.id !== 'aj-meta') return;
    setCfg({ meta: Number(e.target.value) });
    document.dispatchEvent(new CustomEvent('kbl:ajustes-cambiaron'));
  });

  // Esc cierra, como cualquier modal.
  const onKey = (e) => { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

export function initAjustes() {
  const btn = $('#theme-toggle');
  if (!btn) return;
  // El botón pasa de "cambiar tema" a "abrir ajustes": el tema sigue estando,
  // pero adentro y junto a todo lo demás.
  btn.setAttribute('title', 'Ajustes');
  btn.setAttribute('aria-label', 'Ajustes');
  btn.addEventListener('click', (e) => { e.stopPropagation(); abrirAjustes(); }, true);
}
