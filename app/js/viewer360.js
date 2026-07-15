// ====== Visor 360: girar un objeto pre-renderizado con dedo/mouse ======
// Técnica turntable: N frames renderizados en Blender; arrastrar scrubea
// entre frames. Calidad de render offline con peso de imágenes.

export function initViewer360(el, { frames = 36, src }) {
  const img = document.createElement('img');
  img.draggable = false;
  img.alt = 'Vista 360';
  el.appendChild(img);

  // Precarga de todos los frames
  const imgs = [];
  let pendientes = frames;
  for (let i = 0; i < frames; i++) {
    const im = new Image();
    im.src = src(i);
    im.onload = () => { if (--pendientes === 0) el.classList.add('ready'); };
    im.onerror = () => el.closest('[data-showcase]')?.setAttribute('hidden', '');
    imgs.push(im);
  }

  let frame = 0;
  let dragging = false;
  let lastX = 0;
  let vel = 0;
  let auto = true; // gira solo, despacito, hasta que el usuario lo toca

  const show = () => {
    const idx = ((Math.round(frame) % frames) + frames) % frames;
    if (imgs[idx].complete && imgs[idx].naturalWidth) img.src = imgs[idx].src;
  };
  show();

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
    const df = -dx / 9; // ~9px por frame; signo: arrastrar derecha gira hacia la derecha
    vel = df;
    frame += df;
    show();
  });
  const soltar = () => { dragging = false; el.classList.remove('grabbing'); };
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
}
