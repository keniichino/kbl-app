// ====== Render del árbol (SVG low poly con sombreado facetado) ======
// Cada faceta se pinta según su orientación respecto a la luz (arriba-izquierda),
// que es lo que da la sensación 3D. El parámetro p (0..1) es el progreso.

export const SPECIES = {
  15: { name: 'Flor',        emoji: '🌸', light: '#ffd3e8', mid: '#ff8fc7', deep: '#c94b8e', form: 'flower' },
  25: { name: 'Arbolito',    emoji: '🌳', light: '#c8f59a', mid: '#7ed957', deep: '#3d9433' },
  50: { name: 'Roble',       emoji: '🌲', light: '#a5ecbc', mid: '#4dc973', deep: '#1f7a44' },
  90: { name: 'Gran Sakura', emoji: '🌺', light: '#ffe3b8', mid: '#ffb35c', deep: '#d3751f' },
};

const WITHERED = { light: '#d8cbb2', mid: '#a89878', deep: '#6e6047' };

// Jitter determinístico para que la silueta sea irregular pero estable
const JITTER = [0.94, 1.1, 0.86, 1.14, 0.92, 1.06, 0.84, 1.12, 0.96, 1.04];
const LIGHT_ANGLE = -2.356; // luz desde arriba-izquierda

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Copa: polígono irregular partido en facetas triangulares con flat shading
function canopy(cx, cy, R, sp) {
  const N = 10;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    const r = R * JITTER[i % JITTER.length];
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86]);
  }
  let out = '';
  for (let i = 0; i < N; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % N];
    const mid = Math.atan2((y1 + y2) / 2 - cy, (x1 + x2) / 2 - cx);
    let d = Math.abs(mid - LIGHT_ANGLE);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const b = 1 - d / Math.PI; // 1 = facete mirando a la luz
    out += `<polygon points="${cx},${cy} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}"
                     fill="${mix(sp.deep, sp.light, 0.15 + b * 0.85)}"/>`;
  }
  // Destello superior
  out += `<polygon points="${cx},${cy} ${pts[7][0]},${pts[7][1]} ${pts[8][0]},${pts[8][1]}"
                   fill="rgba(255,255,255,.35)"/>`;
  return out;
}

// Flor low poly: pétalos radiales (dos facetas cada uno) + centro hexagonal
function flowerHead(cx, cy, R, sp) {
  let out = '';
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    const ix = cx + Math.cos(a) * R * 0.22, iy = cy + Math.sin(a) * R * 0.22;
    const tx = cx + Math.cos(a) * R,        ty = cy + Math.sin(a) * R;
    const la = a - 0.34, ra = a + 0.34;
    const lx = cx + Math.cos(la) * R * 0.64, ly = cy + Math.sin(la) * R * 0.64;
    const rx = cx + Math.cos(ra) * R * 0.64, ry = cy + Math.sin(ra) * R * 0.64;
    out += `<polygon points="${ix.toFixed(1)},${iy.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}" fill="${sp.light}"/>
            <polygon points="${ix.toFixed(1)},${iy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)}" fill="${sp.mid}"/>`;
  }
  // Centro: hexágono facetado amarillo
  const C = R * 0.32;
  const tones = ['#ffe49a', '#ffd76e', '#f2bf4e'];
  for (let i = 0; i < 6; i++) {
    const a1 = (i / 6) * 2 * Math.PI, a2 = ((i + 1) / 6) * 2 * Math.PI;
    out += `<polygon points="${cx},${cy} ${(cx + Math.cos(a1) * C).toFixed(1)},${(cy + Math.sin(a1) * C).toFixed(1)} ${(cx + Math.cos(a2) * C).toFixed(1)},${(cy + Math.sin(a2) * C).toFixed(1)}" fill="${tones[i % 3]}"/>`;
  }
  return out;
}

// Tallo con hojas (para la flor)
function stem(cx, topY, groundY, w) {
  const leafY1 = groundY - (groundY - topY) * 0.42;
  const leafY2 = groundY - (groundY - topY) * 0.62;
  return `
    <polygon points="${cx - w},${groundY} ${cx - w * 0.35},${topY} ${cx},${topY} ${cx},${groundY}" fill="#5db14a"/>
    <polygon points="${cx},${groundY} ${cx},${topY} ${cx + w * 0.35},${topY} ${cx + w},${groundY}" fill="#3d8f37"/>
    <polygon points="${cx},${leafY1} ${cx - w * 2.6},${leafY1 - w * 1.4} ${cx - w * 4.6},${leafY1 - w * 0.6} ${cx - w * 2.4},${leafY1 + w * 0.8}" fill="#5db14a"/>
    <polygon points="${cx},${leafY2} ${cx + w * 2.6},${leafY2 - w * 1.6} ${cx + w * 4.4},${leafY2 - w * 0.4} ${cx + w * 2.2},${leafY2 + w * 0.8}" fill="#3d8f37"/>`;
}

// Tronco facetado: cara izquierda iluminada, derecha en sombra
function trunk(cx, topY, groundY, w) {
  const flare = w * 0.75;
  return `
    <polygon points="${cx - flare},${groundY} ${cx - w * 0.28},${topY} ${cx},${topY} ${cx},${groundY}" fill="#a8795a"/>
    <polygon points="${cx},${groundY} ${cx},${topY} ${cx + w * 0.28},${topY} ${cx + flare},${groundY}" fill="#6e472f"/>`;
}

function face(cx, cy, scale, mood) {
  const s = scale;
  if (mood === 'dead') {
    const x = (dx) => `
      <path d="M ${cx + dx - 4 * s} ${cy - 4 * s} l ${8 * s} ${8 * s} M ${cx + dx + 4 * s} ${cy - 4 * s} l ${-8 * s} ${8 * s}"
            stroke="#5b4a33" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
    return x(-13 * s) + x(13 * s) +
      `<path d="M ${cx - 8 * s} ${cy + 16 * s} q ${8 * s} ${-7 * s} ${16 * s} 0"
             fill="none" stroke="#5b4a33" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
  }
  const mouth = mood === 'joy'
    ? `<path d="M ${cx - 7 * s} ${cy + 10 * s} q ${7 * s} ${10 * s} ${14 * s} 0 z" fill="#2c4a22"/>`
    : `<path d="M ${cx - 6 * s} ${cy + 11 * s} q ${6 * s} ${6 * s} ${12 * s} 0"
             fill="none" stroke="#2c4a22" stroke-width="${2.6 * s}" stroke-linecap="round"/>`;
  return `
    <circle cx="${cx - 13 * s}" cy="${cy}" r="${3.4 * s}" fill="#2c4a22"/>
    <circle cx="${cx + 13 * s}" cy="${cy}" r="${3.4 * s}" fill="#2c4a22"/>
    <ellipse cx="${cx - 20 * s}" cy="${cy + 8 * s}" rx="${5 * s}" ry="${3 * s}" fill="rgba(255,120,140,.4)"/>
    <ellipse cx="${cx + 20 * s}" cy="${cy + 8 * s}" rx="${5 * s}" ry="${3 * s}" fill="rgba(255,120,140,.4)"/>
    ${mouth}`;
}

// Terreno: dos lomas para profundidad + adornos low poly
function ground() {
  return `
    <ellipse cx="330" cy="475" rx="330" ry="160" fill="#9be07c"/>
    <ellipse cx="200" cy="490" rx="340" ry="160" fill="#6fce55"/>
    <!-- arbustos y roca low poly -->
    <polygon points="72,392 88,364 104,392" fill="#4caf3f"/>
    <polygon points="88,392 100,372 112,392" fill="#3d9433"/>
    <polygon points="308,402 320,380 334,402" fill="#4caf3f"/>
    <polygon points="330,436 344,420 362,428 356,444 336,446" fill="#c9d4cc"/>
    <polygon points="330,436 344,420 348,442" fill="#eef3ef"/>
    <!-- flores -->
    <circle cx="120" cy="424" r="5" fill="#fff"/><circle cx="120" cy="422" r="2.6" fill="#ffd76e"/>
    <circle cx="288" cy="368" r="4.4" fill="#fff"/><circle cx="288" cy="366" r="2.3" fill="#ff9fc0"/>`;
}

/**
 * Dibuja la escena dentro del SVG.
 * @param {number} p        progreso 0..1
 * @param {object} species  entrada de SPECIES
 * @param {string} mood     'grow' | 'joy' | 'dead' | 'seed'
 */
export function renderTree(svg, p, species, mood = 'grow') {
  const sp = mood === 'dead' ? { ...species, ...WITHERED } : species;
  const groundY = 388;

  let tree = '';
  if (mood === 'seed' || p < 0.04) {
    tree = `
      <ellipse cx="200" cy="${groundY}" rx="24" ry="8" fill="rgba(0,0,0,.14)"/>
      <path d="M 200 ${groundY} q -3 -18 0 -26 q 3 8 0 26" stroke="#5da448" stroke-width="5" fill="none" stroke-linecap="round"/>
      <polygon points="200,${groundY - 24} 184,${groundY - 32} 196,${groundY - 40}" fill="${sp.mid}"/>
      <polygon points="200,${groundY - 24} 216,${groundY - 32} 204,${groundY - 40}" fill="${sp.deep}"/>`;
  } else if (species.form === 'flower') {
    const grow = 0.25 + 0.75 * Math.min(p, 1);
    const stemH = 118 * grow;
    const stemW = 7 * grow;
    const topY = groundY - stemH;
    const R = 52 * grow;
    const headCy = topY - R * 0.6;

    tree = `
      <ellipse cx="200" cy="${groundY + 2}" rx="${40 * grow}" ry="${9 * grow}" fill="rgba(0,0,0,.15)"/>
      ${stem(200, topY, groundY, stemW)}
      ${flowerHead(200, headCy, R, sp)}
      ${p > 0.3 ? face(200, headCy, grow * 0.55, mood === 'grow' ? 'smile' : mood) : ''}`;
  } else {
    const grow = 0.25 + 0.75 * Math.min(p, 1);
    const trunkH = 110 * grow;
    const trunkW = 18 * grow;
    const topY = groundY - trunkH;
    const R = 62 * grow;
    const canopyCy = topY - R * 0.55;

    tree = `
      <ellipse cx="200" cy="${groundY + 2}" rx="${60 * grow}" ry="${12 * grow}" fill="rgba(0,0,0,.15)"/>
      ${trunk(200, topY + 6, groundY, trunkW)}
      ${canopy(200, canopyCy, R, sp)}
      ${p > 0.3 ? face(200, canopyCy + R * 0.28, grow, mood === 'grow' ? 'smile' : mood) : ''}`;
  }

  svg.innerHTML = ground() + `<g class="tree-g">${tree}</g>`;
}

/** Mini árbol para la grilla del bosque. */
export function miniTree(species, completed) {
  const sp = completed ? species : { ...species, ...WITHERED };
  if (species.form === 'flower') {
    return `<svg viewBox="0 0 120 130">
      <ellipse cx="60" cy="118" rx="22" ry="5" fill="rgba(0,0,0,.13)"/>
      ${stem(60, 62, 116, 4.5)}
      ${flowerHead(60, 44, 30, sp)}
      ${face(60, 44, 0.32, completed ? 'smile' : 'dead')}
    </svg>`;
  }
  return `<svg viewBox="0 0 120 130">
    <ellipse cx="60" cy="118" rx="30" ry="7" fill="rgba(0,0,0,.13)"/>
    ${trunk(60, 74, 116, 11)}
    ${canopy(60, 52, 34, sp)}
    ${face(60, 62, 0.5, completed ? 'smile' : 'dead')}
  </svg>`;
}
