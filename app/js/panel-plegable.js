// ====== Panel: secciones plegables ======
// El Panel apilaba 21 secciones y 3.707px de alto — 4,6 pantallas en un
// iPhone, y eso con la app VACÍA. Mezclaba lo que se mira todos los días
// (alertas, cuánto entra y sale, indicadores) con lo que casi no se abre
// (Mercado sola son 751px, Inversiones y Tesis 347px más con cero filas
// cargadas).
//
// Acá cada sección de las "de consulta" pasa a un <details> plegado, con el
// estado recordado por sección. Las tres de uso diario quedan sueltas y
// siempre visibles: son la razón de entrar al Panel.
//
// **No toca `panel.js`.** El envoltorio se pone UNA vez alrededor del `<div
// id="fin-…">`, y `panel.js` sigue reescribiendo el `innerHTML` de ese div en
// cada render sin enterarse de que ahora vive adentro de un <details>. Por eso
// tampoco se pinta nada del contenido acá: el resumen del <summary> sería lo
// primero en quedar desactualizado.

/** Secciones que se pliegan, en el orden en que ya están en el DOM. */
const PLEGABLES = [
  ['fin-kpis',        '📊 Resumen del mes'],
  ['fin-ingresos',    '💰 Ingresos'],
  ['fin-fijos',       '🏠 Gastos fijos'],
  ['fin-subs',        '🔁 Suscripciones'],
  ['fin-deuda',       '💳 Deuda en cuotas'],
  ['fin-ahorro',      '🐷 Ahorro'],
  ['fin-reintegros',  '🙋 Te deben'],
  ['fin-inversiones', '📈 Inversiones'],
  ['fin-tesis',       '🧭 Tesis'],
  ['fin-mercado',     '🌎 Mercado'],
  ['fin-medios',      '🏦 Bancos y tarjetas'],
  ['fin-flujo',       '📅 Flujo de 6 meses'],
  ['fin-proyeccion',  '🔮 Proyección'],
];

// Quedan SUELTAS y siempre visibles, por decisión de Keni (12/08): la base de
// cálculo, `fin-alertas`, `fin-hero` (cuánto entra y sale), `fin-ritmo` (lo que
// queda por día) y `fin-indicadores`. Son la razón de abrir el Panel; plegarlas
// sería esconder justo lo que se viene a mirar.

const K = (id) => `kbl.panel.abierto.${id}`;

const leer = (id) => { try { return localStorage.getItem(K(id)) === '1'; } catch { return false; } };
const guardar = (id, v) => { try { localStorage.setItem(K(id), v ? '1' : '0'); } catch { /* modo privado */ } };

/**
 * Envuelve las secciones de consulta en <details>. Idempotente: se puede
 * llamar en cada render del Panel, que sólo actúa la primera vez.
 */
export function plegarPanel() {
  for (const [id, titulo] of PLEGABLES) {
    const seccion = document.getElementById(id);
    if (!seccion) continue;                                   // sección que ya no existe
    if (seccion.parentElement?.classList.contains('fin-pleg')) continue;  // ya envuelta

    const det = document.createElement('details');
    det.className = 'fin-pleg';
    det.open = leer(id);

    const sum = document.createElement('summary');
    sum.className = 'fin-pleg-sum';
    sum.innerHTML = `<span class="fin-pleg-txt">${titulo}</span><span class="fin-pleg-chevron" aria-hidden="true">›</span>`;

    // El <details> ocupa el lugar exacto de la sección para no alterar el
    // orden vertical que ya tiene el Panel.
    seccion.replaceWith(det);
    det.append(sum, seccion);

    det.addEventListener('toggle', () => guardar(id, det.open));
  }
}
