// ====== Router ======
// Antes la navegación era `classList.toggle('active')` y nada más: sin
// historial, sin estado. En una PWA `standalone` eso se paga caro — no hay
// barra del navegador, así que el gesto de volver es lo único que hay, y sin
// entradas en el historial el Atrás de Android cierra la app entera.
//
// **Hash y no pushState** porque el sitio vive en GitHub Pages: recargar en
// `/kbl-app/plata/panel` devolvería 404. Con hash la ruta es del lado del
// cliente y el link sobrevive al reload.
//
// Dos mecanismos distintos a propósito:
//   · RUTAS → destinos navegables (los 4 tabs y los 3 sub de Plata). Van en el
//             hash, se pueden compartir y sobreviven al reload.
//   · CAPAS → overlays modales (editor de nota, alta rápida de gasto). NO van
//             en la URL — no tiene sentido linkear "el sheet abierto" — pero
//             empujan una entrada al historial para que Atrás las cierre en
//             vez de cerrar la app.

const TABS = ['foco', 'bosque', 'plata', 'notas'];
const SUBS = ['gastos', 'cuotas', 'ahorro', 'panel'];
const SUB_POR_DEFECTO = 'gastos';

const K_RUTA = 'kbl.ruta';
const K_SUB = 'kbl.ruta.plata';

const leer = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

/** Sub-vista de Plata que se recuerda entre sesiones. */
const subGuardado = () => {
  const s = leer(K_SUB, SUB_POR_DEFECTO);
  return SUBS.includes(s) ? s : SUB_POR_DEFECTO;
};

export const rutaHref = (tab, sub) =>
  `#/${tab}${tab === 'plata' ? `/${sub || subGuardado()}` : ''}`;

/** "#/plata/panel" → {tab:'plata', sub:'panel'}. null si no es una ruta válida. */
function parsear(hash) {
  const partes = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const tab = TABS.includes(partes[0]) ? partes[0] : null;
  if (!tab) return null;
  if (tab !== 'plata') return { tab, sub: null };
  return { tab, sub: SUBS.includes(partes[1]) ? partes[1] : subGuardado() };
}

let actual = { tab: 'foco', sub: null };
let hashPintado = '';
let escuchas = [];

export const rutaActual = () => ({ ...actual });

/** Se llama con la ruta cada vez que cambia, y una vez al arrancar. */
export function onRuta(cb) { escuchas.push(cb); }

function emitir() {
  guardar(K_RUTA, rutaHref(actual.tab, actual.sub));
  if (actual.tab === 'plata' && actual.sub) guardar(K_SUB, actual.sub);
  hashPintado = location.hash;
  for (const cb of escuchas) {
    try { cb(rutaActual()); } catch (err) { console.warn('[router] escucha:', err); }
  }
}

/** Navega. `reemplazar` no deja entrada en el historial (para la ruta inicial). */
export function irA(tab, sub, { reemplazar = false } = {}) {
  // Una capa abierta tapa la pantalla, así que no deberían coexistir; si algo
  // se cuela, la cerramos sin tocar el historial para no dejarlo desalineado.
  cerrarTodasLasCapas();
  const href = rutaHref(tab, sub);
  if (location.hash === href) return;         // mismo destino: no ensuciar el historial
  if (reemplazar) history.replaceState(null, '', href);
  else location.hash = href;
  if (reemplazar) { actual = parsear(href); emitir(); }
}

window.addEventListener('hashchange', () => {
  const r = parsear(location.hash);
  if (!r) { irA(actual.tab, actual.sub, { reemplazar: true }); return; }
  actual = r;
  emitir();
});

// ---------- Capas modales ----------
// Invariante: cerrar una capa SIEMPRE pasa por `history.back()`. Así el botón
// de cerrar y el gesto Atrás recorren el mismo camino y el historial nunca
// queda con entradas colgadas. Quien abre la capa sólo pinta; quien la cierra
// de verdad es el `popstate`.

const capas = [];

export const hayCapas = () => capas.length > 0;

/** Abre una capa. `cerrar` se ejecuta cuando el usuario vuelve atrás. */
export function abrirCapa(cerrar) {
  capas.push(cerrar);
  history.pushState({ kblCapa: capas.length }, '');
}

/** Cierra la capa de arriba. No la cierra acá: dispara el Atrás que la cierra. */
export function cerrarCapa() {
  if (capas.length) history.back();
}

function cerrarTodasLasCapas() {
  while (capas.length) {
    const cerrar = capas.pop();
    try { cerrar(); } catch (err) { console.warn('[router] cerrar capa:', err); }
  }
}

window.addEventListener('popstate', () => {
  // Si el hash NO cambió, este popstate es el de una capa: `hashchange` no
  // dispara y nadie más lo va a atender. Si cambió, es navegación de ruta y la
  // maneja `hashchange`.
  if (location.hash !== hashPintado) return;
  if (!capas.length) return;
  const cerrar = capas.pop();
  try { cerrar(); } catch (err) { console.warn('[router] cerrar capa:', err); }
});

/**
 * Arranca el router. Prioridad: el hash de la URL (viniste por un link), si no
 * la última ruta que usaste, si no Foco. Se usa `replaceState` para que la
 * primera pantalla no quede como una entrada atrás de sí misma.
 */
export function iniciarRouter() {
  const r = parsear(location.hash) || parsear(leer(K_RUTA, '')) || { tab: 'foco', sub: null };
  actual = r;
  history.replaceState(null, '', rutaHref(r.tab, r.sub));
  emitir();
}
