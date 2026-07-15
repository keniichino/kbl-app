// ====== Visor 360: girar un objeto pre-renderizado con dedo/mouse ======
// Técnica turntable: N frames renderizados en Blender; arrastrar scrubea
// entre frames. Soporta cambiar de set de frames (especies) en caliente.

export function initViewer360(el, { frames = 36 } = {}) {
  const img = document.createElement('img');
  img.draggable = false;
  img.alt = 'Vista 360';
  el.appendChild(img);

  let imgs = [];
  let frame = 0;
  let dragging = false;
  let lastX = 0;
  let vel = 0;
  let auto = true; // gira solo, despacito, hasta que el usuario lo toca

  const show = () => {
    const idx = ((Math.round(frame) % frames) + frames) % frames;
    const im = imgs[idx];
    if (im && im.complete && im.naturalWidth) img.src = im.src;
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
    if (auto) { frame += 0.07; show(); }
    else if (!dragging && Math.abs(vel) > 0.02) { frame += vel; vel *= 0.94; show(); }
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
