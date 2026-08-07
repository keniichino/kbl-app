// ====== Bosque: carrusel de vuelo entre islas (pseudo-3D) ======
// Reusa los mismos frames turntable ya renderizados — nada de esto pide
// assets nuevos ni un motor WebGL. La sensación de "volar" entre islas sale
// de mover cada una en translateX/translateZ/scale/opacity según qué tan
// lejos está del centro (mismo truco que un carrusel tipo App Store).
//
// Costo bajo cuidado a propósito: sólo la isla CENTRADA tiene un viewer360
// vivo (canvas + loop de rotación); las de al lado son una <img> quieta del
// frame 0. Volar a una isla nueva promueve su <img> a viewer360 real y
// apaga (`detener()`) el de la que quedó atrás — 5 loops de rotación
// corriendo a la vez es justo lo que NO queremos en un celular.
//
// Gestos: arrastrar la isla centrada la GIRA (lo maneja su propio viewer360,
// acá no se intercepta); arrastrar fuera de ella —o una isla de al lado—
// vuela por el carrusel; tocar una isla de al lado vuela derecho a ella.

import { initViewer360 } from './viewer360.js';

const SEPARACION = 132;   // separación horizontal entre islas, en px
const MAX_VECINOS = 2.4;  // más allá de esto, invisible: no vale la pena calcular

export function initBosqueVuelo(pista, islas) {
  let posicion = 0;
  let objetivo = 0;
  let animando = false;
  let arrastrando = false;
  let inicioX = 0;
  let posInicio = 0;
  let movioBastante = false;
  let vivo = null; // { key, viewer, slot } de la única isla animada
  const ocultas = new Set();

  const slots = islas.map((isla) => {
    const slot = document.createElement('div');
    slot.className = 'isla-slot';
    slot.dataset.key = isla.key;
    const img = document.createElement('img');
    img.className = 'isla-slot-img';
    img.alt = isla.nombre;
    img.loading = 'lazy';
    img.src = `assets/360/${isla.key}/00.webp`;
    img.onerror = () => {
      ocultas.add(isla.key);
      slot.classList.add('oculta');
      actualizar();
    };
    slot.appendChild(img);
    pista.appendChild(slot);
    return { isla, slot, img };
  });

  function indiceMasCercano() {
    let mejor = 0;
    let mejorDist = Infinity;
    slots.forEach((s, i) => {
      if (ocultas.has(s.isla.key)) return;
      const d = Math.abs(i - posicion);
      if (d < mejorDist) { mejorDist = d; mejor = i; }
    });
    return mejor;
  }

  function promoverCentro() {
    const i = indiceMasCercano();
    const s = slots[i];
    if (!s || ocultas.has(s.isla.key) || (vivo && vivo.key === s.isla.key)) return;
    if (vivo) vivo.viewer.detener();
    const viewer = initViewer360(s.slot, { frames: 36 });
    viewer.setSrc(
      (fr) => `assets/360/${s.isla.key}/${String(fr).padStart(2, '0')}.webp`,
      () => { ocultas.add(s.isla.key); s.slot.classList.add('oculta'); actualizar(); }
    );
    vivo = { key: s.isla.key, viewer, slot: s.slot };
  }

  function actualizar() {
    slots.forEach((s, i) => {
      const d = i - posicion;
      const abs = Math.min(Math.abs(d), MAX_VECINOS);
      const x = d * SEPARACION;
      const z = -abs * 80;
      const escala = Math.max(0.5, 1 - abs * 0.24);
      const opacidad = Math.max(0, 1 - abs * 0.5);
      s.slot.style.transform = `translateX(${x.toFixed(1)}px) translateZ(${z.toFixed(0)}px) scale(${escala.toFixed(3)})`;
      s.slot.style.opacity = opacidad.toFixed(2);
      s.slot.style.zIndex = String(200 - Math.round(abs * 20));
      s.slot.style.pointerEvents = abs < 1.5 ? 'auto' : 'none';
    });
    if (ocultas.size === slots.length) pista.closest('[data-showcase]')?.setAttribute('hidden', '');
  }

  function animarA(destino) {
    objetivo = Math.max(0, Math.min(slots.length - 1, destino));
    if (animando) return;
    animando = true;
    (function paso() {
      const dif = objetivo - posicion;
      if (Math.abs(dif) < 0.003) {
        posicion = objetivo;
        actualizar();
        animando = false;
        promoverCentro();
        return;
      }
      posicion += dif * 0.22;
      actualizar();
      requestAnimationFrame(paso);
    })();
  }

  pista.addEventListener('pointerdown', (e) => {
    // Toque dentro de la isla YA centrada: es "girarla", no lo interceptamos
    // y lo resuelve el pointerdown propio de su viewer360.
    if (vivo && vivo.slot.contains(e.target)) return;
    arrastrando = true;
    movioBastante = false;
    inicioX = e.clientX;
    posInicio = posicion;
    pista.classList.add('arrastrando');
    pista.setPointerCapture(e.pointerId);
  });

  pista.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    const dx = e.clientX - inicioX;
    if (Math.abs(dx) > 6) movioBastante = true;
    posicion = Math.max(0, Math.min(slots.length - 1, posInicio - dx / SEPARACION));
    actualizar();
  });

  const soltar = (e) => {
    if (!arrastrando) return;
    arrastrando = false;
    pista.classList.remove('arrastrando');
    if (!movioBastante) {
      const slotTocado = e.target.closest('.isla-slot');
      const i = slotTocado ? slots.findIndex((s) => s.slot === slotTocado) : -1;
      if (i >= 0 && i !== indiceMasCercano()) { animarA(i); return; }
    }
    animarA(Math.round(posicion));
  };
  pista.addEventListener('pointerup', soltar);
  pista.addEventListener('pointercancel', soltar);

  actualizar();
  promoverCentro();
}
