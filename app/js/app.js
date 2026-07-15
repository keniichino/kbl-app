// ====== KBL App — módulo Foco v1 ======
import { getSessions, addSession, getActive, setActive, getStats, initSync } from './store.js';
import { SPECIES, renderTree, miniTree, speciesCard, dayPhase } from './tree.js';
import { initGastos, renderGastos } from './gastos.js';
import { initViewer360 } from './viewer360.js';

const $ = (sel) => document.querySelector(sel);

const svg = $('#tree-svg');
const el = {
  idle: $('#foco-idle'),
  running: $('#foco-running'),
  done: $('#foco-done'),
  timeLeft: $('#time-left'),
  ring: $('#ring-progress'),
  speciesHint: $('#species-hint'),
  doneTitle: $('#done-title'),
  doneSub: $('#done-sub'),
  forestGrid: $('#forest-grid'),
  forestEmpty: $('#forest-empty'),
  bosqueSub: $('#bosque-sub'),
};

const RING_LEN = 326.7;
let selectedMin = 25;
let tickInterval = null;
let wakeLock = null;

// ---------- Navegación por tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.view').forEach(v =>
      v.classList.toggle('active', v.id === 'view-' + tab.dataset.view));
    if (tab.dataset.view === 'bosque') renderBosque();
    if (tab.dataset.view === 'gastos') renderGastos();
  });
});

// ---------- Selección de duración ----------
function updateSpeciesHint() {
  const sp = SPECIES[selectedMin];
  el.speciesHint.textContent = `${selectedMin} minutos hacen crecer un ${sp.name} ${sp.emoji}`;
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    selectedMin = Number(chip.dataset.min);
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
    updateSpeciesHint();
  });
});

// ---------- Máquina de estados ----------
function show(state) {
  el.idle.hidden = state !== 'idle';
  el.running.hidden = state !== 'running';
  el.done.hidden = state !== 'done';
}

function startSession() {
  const session = { startTs: Date.now(), durationMin: selectedMin };
  setActive(session);
  requestWakeLock();
  show('running');
  setPetals([SPECIES[selectedMin].light + 'dd', '#ffffffbb']);
  tick();
  tickInterval = setInterval(tick, 1000);
}

function tick() {
  const active = getActive();
  if (!active) return stopTicking();

  const totalMs = active.durationMin * 60000;
  const elapsed = Date.now() - active.startTs;
  const p = Math.min(elapsed / totalMs, 1);

  renderTree(svg, p, SPECIES[active.durationMin], 'grow');

  const leftMs = Math.max(totalMs - elapsed, 0);
  const mm = String(Math.floor(leftMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((leftMs % 60000) / 1000)).padStart(2, '0');
  el.timeLeft.textContent = `${mm}:${ss}`;
  el.ring.style.strokeDashoffset = RING_LEN * (1 - p);

  if (p >= 1) completeSession(active);
}

function stopTicking() {
  clearInterval(tickInterval);
  tickInterval = null;
  releaseWakeLock();
}

function completeSession(active) {
  stopTicking();
  setActive(null);
  const sp = SPECIES[active.durationMin];
  addSession({ id: crypto.randomUUID(), ...active, completed: true });

  renderTree(svg, 1, sp, 'joy');
  el.doneTitle.textContent = `¡Tu ${sp.name} creció! ${sp.emoji}`;
  el.doneSub.textContent = `${active.durationMin} minutos de foco puro. Ya está en tu bosque.`;
  show('done');
  confetti();
}

function giveUp() {
  const active = getActive();
  if (!active) return;
  if (!confirm('¿Rendirte? El árbol se va a marchitar 🥀')) return;

  stopTicking();
  setActive(null);
  addSession({ id: crypto.randomUUID(), ...active, completed: false });

  renderTree(svg, 0.6, SPECIES[active.durationMin], 'dead');
  el.doneTitle.textContent = 'El árbol se marchitó 🥀';
  el.doneSub.textContent = 'Queda en el bosque como recordatorio. La próxima lo lográs.';
  show('done');
}

function resetToIdle() {
  renderTree(svg, 0, SPECIES[selectedMin], 'seed');
  show('idle');
  setPetals(IDLE_PETALS);
  updateSpeciesHint();
}

$('#btn-start').addEventListener('click', startSession);
$('#btn-giveup').addEventListener('click', giveUp);
$('#btn-again').addEventListener('click', resetToIdle);

// ---------- Bosque + stats ----------
function renderEspecies() {
  const row = document.querySelector('#species-row');
  if (row.childElementCount) return; // se dibuja una sola vez
  row.innerHTML = Object.entries(SPECIES)
    .map(([min, sp]) => `
      <div class="species-card">
        ${speciesCard(sp)}
        <div class="species-name">${sp.name} ${sp.emoji}</div>
        <div class="species-min">${min} min</div>
      </div>`)
    .join('');
}

function renderBosque() {
  renderEspecies();
  const sessions = getSessions();
  const stats = getStats();

  const fmt = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  $('#stat-hoy').textContent = fmt(stats.minutesToday);
  $('#stat-semana').textContent = fmt(stats.minutesWeek);
  $('#stat-racha').textContent = stats.streak;
  $('#stat-arboles').textContent = stats.trees;
  el.bosqueSub.textContent = stats.trees
    ? `${stats.trees} ${stats.trees === 1 ? 'árbol plantado' : 'árboles plantados'} 🌿`
    : 'Cada sesión completa planta un árbol';

  el.forestEmpty.style.display = sessions.length ? 'none' : 'block';
  el.forestGrid.innerHTML = sessions
    .slice()
    .reverse()
    .map((s, i) => `
      <div class="forest-cell ${s.completed ? '' : 'dead'}"
           style="animation-delay:${Math.min(i * 40, 400)}ms"
           title="${new Date(s.startTs).toLocaleDateString('es-AR')} · ${s.durationMin}′">
        ${miniTree(SPECIES[s.durationMin], s.completed)}
      </div>`)
    .join('');
}

// ---------- Pétalos flotando en la escena ----------
function setPetals(colors) {
  const layer = $('#ambient');
  layer.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const p = document.createElement('div');
    p.className = 'petal';
    p.style.left = 6 + Math.random() * 88 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 9 + Math.random() * 8 + 's';
    p.style.animationDelay = -Math.random() * 14 + 's';
    layer.appendChild(p);
  }
}

const IDLE_PETALS = ['#ffffffcc', '#ffd9e8cc', '#ffe9a8cc'];

// ---------- Confetti ----------
function confetti() {
  const layer = $('#confetti-layer');
  const colors = ['#ff8a5c', '#7ed957', '#6ec6ff', '#ffd76e', '#ff8fc7'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.top = -(Math.random() * 20 + 5) + 'vh';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    layer.appendChild(c);
  }
  setTimeout(() => (layer.innerHTML = ''), 5000);
}

// ---------- Wake Lock (pantalla encendida durante la sesión) ----------
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && getActive()) requestWakeLock();
});

// ---------- Sync: reaccionar a cambios del otro dispositivo ----------
function onRemoteChange(kind) {
  if (kind === 'active') {
    const active = getActive();
    if (active && !tickInterval) {
      // Plantaron desde el otro dispositivo: acá también crece
      show('running');
      requestWakeLock();
      tick();
      tickInterval = setInterval(tick, 1000);
    } else if (!active && tickInterval) {
      // Terminaron o se rindieron desde el otro dispositivo
      stopTicking();
      resetToIdle();
    }
  }
  if (document.querySelector('#view-bosque').classList.contains('active')) {
    renderBosque();
  }
}

// ---------- Arranque: retomar sesión si existía ----------
// Fase del día: se aplica al arrancar y se refresca cada 5 minutos
function applyPhase() {
  document.body.dataset.phase = dayPhase();
}
setInterval(() => {
  applyPhase();
  if (!tickInterval && !el.idle.hidden) renderTree(svg, 0, SPECIES[selectedMin], 'seed');
}, 5 * 60 * 1000);

async function boot() {
  applyPhase();
  initGastos();
  initViewer360(document.querySelector('#viewer-sakura'), {
    frames: 36,
    src: (i) => `assets/sakura360/sakura_${String(i).padStart(2, '0')}.webp`,
  });
  resetToIdle(); // render inmediato; el sync ajusta el estado si hace falta
  await initSync(onRemoteChange);
  const active = getActive();
  if (active) {
    const totalMs = active.durationMin * 60000;
    if (Date.now() - active.startTs >= totalMs) {
      // La sesión terminó con la app cerrada: se completa igual (cuenta el timestamp)
      completeSession(active);
    } else {
      show('running');
      requestWakeLock();
      tick();
      tickInterval = setInterval(tick, 1000);
    }
  } else {
    resetToIdle();
  }
}

boot();

// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
