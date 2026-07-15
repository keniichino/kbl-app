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
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
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

// Escena "dreamy": luna gigante, colinas con bruma atmosférica y pasto texturado
function ground() {
  // Pasto: hebras y flores con posiciones pseudo-aleatorias deterministas
  let grass = '';
  for (let i = 0; i < 64; i++) {
    const x = 14 + ((i * 61) % 372);
    const y = 396 + ((i * 37) % 30);
    const tilt = ((i % 5) - 2) * 2.2;
    const tone = i % 3 === 0 ? '#3e9948' : '#57b855';
    grass += `<path d="M ${x} ${y} q ${tilt} -7 ${tilt * 1.6} -11" stroke="${tone}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    if (i % 8 === 0) {
      const fc = ['#ffffff', '#ffd9e8', '#ffe9a8'][(i / 8) % 3];
      grass += `<circle cx="${x + 4}" cy="${y - 3}" r="2.4" fill="${fc}"/><circle cx="${x + 4}" cy="${y - 3}" r="1" fill="#f2bf4e"/>`;
    }
  }
  return `
    <!-- luna gigante con halo -->
    <circle cx="200" cy="235" r="132" fill="#f6f2ea" opacity=".18"/>
    <circle cx="200" cy="235" r="118" fill="url(#gMoon)" opacity=".95"/>
    <ellipse cx="165" cy="200" rx="20" ry="15" fill="#dde2ec" opacity=".55"/>
    <ellipse cx="238" cy="262" rx="26" ry="19" fill="#dde2ec" opacity=".45"/>
    <ellipse cx="222" cy="182" rx="12" ry="9" fill="#dde2ec" opacity=".5"/>
    <ellipse cx="158" cy="278" rx="11" ry="8" fill="#dde2ec" opacity=".4"/>
    <!-- colinas lejanas (bruma) -->
    <path d="M 0 338 Q 70 296 160 330 T 400 322 L 400 430 L 0 430 Z" fill="#aab6dd" opacity=".8"/>
    <path d="M 0 352 Q 120 310 250 346 T 400 340 L 400 430 L 0 430 Z" fill="#8fb2b4" opacity=".85"/>
    <!-- loma principal en dos planos -->
    <ellipse cx="330" cy="478" rx="330" ry="152" fill="#8fd67a"/>
    <ellipse cx="200" cy="492" rx="342" ry="160" fill="url(#gGrass)"/>
    ${grass}
    <!-- arbustos y roca low poly -->
    <polygon points="72,398 88,370 104,398" fill="#4aa851"/>
    <polygon points="88,398 100,378 112,398" fill="#398544"/>
    <polygon points="308,408 320,386 334,408" fill="#4aa851"/>
    <polygon points="330,438 344,422 362,430 356,446 336,448" fill="#c9cfdc"/>
    <polygon points="330,438 344,422 348,444" fill="#eceff5"/>`;
}

function sceneDefs() {
  return `<defs>
    <radialGradient id="gMoon" cx="38%" cy="34%" r="85%">
      <stop offset="0%" stop-color="#fdfaf3"/>
      <stop offset="65%" stop-color="#ece9e4"/>
      <stop offset="100%" stop-color="#cfd6e6"/>
    </radialGradient>
    <radialGradient id="gGrass" cx="50%" cy="12%" r="95%">
      <stop offset="0%" stop-color="#9fe08a"/>
      <stop offset="55%" stop-color="#63c05e"/>
      <stop offset="100%" stop-color="#3f9e4a"/>
    </radialGradient>
  </defs>`;
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
    const R = 58 * grow;
    const canopyCy = topY - R * 0.55;
    // Racimos laterales en sombra detrás de la copa principal: volumen y profundidad
    const backSp = { light: sp.mid, mid: sp.deep, deep: mix(sp.deep, '#213620', 0.5) };

    tree = `
      <ellipse cx="200" cy="${groundY + 2}" rx="${60 * grow}" ry="${12 * grow}" fill="rgba(0,0,0,.15)"/>
      ${trunk(200, topY + 6, groundY, trunkW)}
      ${p > 0.45 ? canopy(200 - R * 0.72, canopyCy + R * 0.38, R * 0.58, backSp) : ''}
      ${p > 0.6 ? canopy(200 + R * 0.68, canopyCy + R * 0.42, R * 0.52, backSp) : ''}
      ${p > 0.8 ? canopy(200 + R * 0.3, canopyCy - R * 0.62, R * 0.42, sp) : ''}
      ${canopy(200, canopyCy, R, sp)}
      ${p > 0.3 ? face(200, canopyCy + R * 0.28, grow, mood === 'grow' ? 'smile' : mood) : ''}`;
  }

  svg.innerHTML = sceneDefs() + ground() + `<g class="tree-g">${tree}</g>`;
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
