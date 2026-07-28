// ====== Visor 360: girar un objeto pre-renderizado con dedo/mouse ======
// Técnica turntable: N frames renderizados en Blender; arrastrar scrubea
// entre frames. Para que se sienta fluido y no a "saltos" (el ojo nota
// cada corte entre foto y foto), se dibuja en un <canvas> mezclando
// (cross-fade) los dos frames vecinos según la posición fraccional —
// simula el desenfoque de movimiento de una rotación real.
//
// El mismo crossfade sirve en un segundo eje: ETAPAS de crecimiento. Cada
// etapa es un turntable completo de una geometría distinta (brote → joven →
// crecido → maduro), y el progreso de la sesión mezcla entre la etapa actual
// y la siguiente. Así el árbol crece de verdad en vez de agrandarse: la isla
// queda del mismo tamaño (el suelo no crece) y cambia solo la planta.
//
// Memoria: cada frame descomprimido son ~3MB en el canvas (800×1000 RGBA), así
// que tener las 4 etapas cargadas serían ~460MB y el navegador del celular
// mata la pestaña. Se mantiene una ventana de 2 etapas (la actual y la
// vecina); el resto se descarta y se vuelve a pedir al caché del SW si hace
// falta.

const W = 800, H = 1000; // resolución de render de Blender

export function initViewer360(el, { frames = 36 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // etapas.get(n) → array de Image de esa etapa
  const etapas = new Map();
  let srcFn = null;      // (etapa, i) => url
  let nEtapas = 1;
  let pos = 0;           // posición continua entre etapas: 0 .. nEtapas-1
  let onMissing = null;
  let generacion = 0;    // invalida cargas en vuelo cuando cambia la especie

  let frame = 0;
  let dragging = false;
  let lastX = 0;
  let vel = 0;
  let auto = true; // gira solo, despacito, hasta que el usuario lo toca

  function frameEnRango(f) {
    // floor + fracción, correcto también para f negativo
    const i0 = Math.floor(f);
    const t = f - i0;
    const norm = ((i0 % frames) + frames) % frames;
    return { i0: norm, i1: (norm + 1) % frames, t };
  }

  function lista(n) {
    return etapas.get(Math.min(Math.max(n, 0), nEtapas - 1));
  }

  const listo = (im) => im && im.complete && im.naturalWidth > 0;

  // Dibuja una etapa entera (crossfade angular) con una opacidad global.
  // Devuelve false si no había con qué dibujar, para que el llamador sepa que
  // esa capa todavía no está disponible y no deje el cuadro vacío.
  function pintarEtapa(imgs, alpha) {
    if (!imgs || alpha <= 0.004) return false;
    const { i0, i1, t } = frameEnRango(frame);
    const a = imgs[i0], b = imgs[i1];
    if (!listo(a)) return false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(a, 0, 0, W, H);
    if (t > 0.01 && listo(b)) {
      ctx.globalAlpha = alpha * t;
      ctx.drawImage(b, 0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    return true;
  }

  const show = () => {
    const base = Math.floor(pos);
    const mezcla = pos - base;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // La etapa siguiente entra por encima. Si todavía no cargó, queda solo la
    // base: el crecimiento se ve a saltos por un instante, pero nunca en blanco.
    const hayBase = pintarEtapa(lista(base), 1);
    if (mezcla > 0.004) {
      const dibujada = pintarEtapa(lista(base + 1), mezcla);
      // Si la base no estaba y la siguiente sí, mostrarla entera en vez de
      // fantasmal: es lo más parecido a lo que corresponde ver.
      if (!hayBase && dibujada) pintarEtapa(lista(base + 1), 1);
    }
  };

  function cargarEtapa(n) {
    if (n < 0 || n >= nEtapas || etapas.has(n)) return;
    const gen = generacion;
    const imgs = [];
    etapas.set(n, imgs);
    for (let i = 0; i < frames; i++) {
      const im = new Image();
      im.src = srcFn(n, i);
      im.onload = () => {
        if (gen !== generacion) return;
        if (i === 0 || Math.floor(pos) === n) show();
        if (imgs.every(listo)) el.classList.add('ready');
      };
      im.onerror = () => { if (gen === generacion) onMissing?.(n); };
      imgs[i] = im;
    }
  }

  // Ventana deslizante: sólo la etapa actual y la siguiente quedan en memoria.
  function ajustarVentana() {
    const base = Math.floor(pos);
    cargarEtapa(base);
    cargarEtapa(base + 1);
    for (const n of [...etapas.keys()]) {
      if (n < base || n > base + 1) etapas.delete(n);
    }
  }

  function reset(fn, faltante, cantEtapas) {
    generacion++;
    etapas.clear();
    el.classList.remove('ready');
    srcFn = fn;
    onMissing = faltante;
    nEtapas = cantEtapas;
    pos = 0;
    frame = 0;
    ajustarVentana();
    show();
  }

  // --- API pública ---

  // Un solo turntable (Bosque, y fallback de Foco si no hay etapas).
  function setSrc(src, faltante) {
    reset((_, i) => src(i), faltante ? () => faltante() : null, 1);
  }

  // Varios turntables de crecimiento. src recibe (etapa, frame).
  function setEtapas(src, cantEtapas, faltante) {
    reset(src, faltante, cantEtapas);
  }

  // p ∈ [0,1]: progreso de la sesión → posición continua entre etapas.
  function setProgreso(p) {
    const q = Math.min(Math.max(p, 0), 1);
    const nueva = q * (nEtapas - 1);
    if (Math.abs(nueva - pos) < 1e-4) return;
    const cambioDeEtapa = Math.floor(nueva) !== Math.floor(pos);
    pos = nueva;
    if (cambioDeEtapa) ajustarVentana();
    show();
  }

  (function loop() {
    if (auto) { frame += 0.045; show(); }
    else if (!dragging && Math.abs(vel) > 0.015) { frame += vel; vel *= 0.94; show(); }
    requestAnimationFrame(loop);
  })();

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    auto = false;
    lastX = e.clientX;
    vel = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add('grabbing');
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const df = -dx / 9; // ~9px por frame
    vel = df;
    frame += df;
    show();
  });
  const soltar = () => { dragging = false; el.classList.remove('grabbing'); };
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);

  return { setSrc, setEtapas, setProgreso };
}
