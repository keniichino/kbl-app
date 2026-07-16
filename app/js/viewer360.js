// ====== Visor 360: girar un objeto pre-renderizado con dedo/mouse ======
// Técnica turntable: N frames renderizados en Blender; arrastrar scrubea
// entre frames. Para que se sienta fluido y no a "saltos" (el ojo nota
// cada corte entre foto y foto), se dibuja en un <canvas> mezclando
// (cross-fade) los dos frames vecinos según la posición fraccional —
// simula el desenfoque de movimiento de una rotación real.

const W = 800, H = 1000; // resolución de render de Blender

export function initViewer360(el, { frames = 36 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let imgs = [];
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

  const show = () => {
    const { i0, i1, t } = frameEnRango(frame);
    const a = imgs[i0], b = imgs[i1];
    if (!a || !a.complete || !a.naturalWidth) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.drawImage(a, 0, 0, W, H);
    if (t > 0.01 && b && b.complete && b.naturalWidth) {
      ctx.globalAlpha = t;
      ctx.drawImage(b, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  };

  function setSrc(src, onMissing) {
    el.classList.remove('ready');
    const nuevos = [];
    let pendientes = frames;
    for (let i = 0; i < frames; i++) {
      const im = new Image();
      im.src = src(i);
      im.onload = () => {
        if (--pendientes === 0) el.classList.add('ready');
        if (i === 0) { imgs = nuevos; show(); }
      };
      im.onerror = () => onMissing?.();
      nuevos.push(im);
    }
    imgs = nuevos;
    frame = 0;
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

  return { setSrc };
}
