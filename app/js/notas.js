// ====== Módulo Notas — lista + editor con autosave ======
import { getNotas, upsertNota, removeNota } from './store.js';
import { confirmar } from './dialog.js';
import { abrirCapa, cerrarCapa } from './router.js';

const $ = (sel) => document.querySelector(sel);

let notaAbierta = null; // nota en edición

function fechaCorta(ts) {
  const d = new Date(ts);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (ts >= hoy.getTime()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function renderLista() {
  const notas = getNotas().sort((a, b) => b.updated - a.updated);
  $('#notas-count').textContent = notas.length
    ? `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`
    : 'Tu espacio para escribir';

  $('#notas-lista').innerHTML = notas.length
    ? notas.map((n) => `
        <div class="nota-card" data-id="${n.id}">
          <div class="nota-titulo">${escapar(n.titulo) || 'Sin título'}</div>
          <div class="nota-preview">
            <span class="nota-fecha">${fechaCorta(n.updated)}</span>
            ${escapar((n.contenido || '').split('\n')[0].slice(0, 60)) || 'Sin contenido'}
          </div>
        </div>`).join('')
    : '<div class="forest-empty"><div class="empty-emoji">✍️</div><p>Sin notas todavía.<br>Tocá ＋ para escribir la primera.</p></div>';
}

function escapar(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// iOS Safari: al abrirse el teclado, el visual viewport se desplaza y puede
// correr elementos position:fixed fuera de pantalla (el botón "‹ Notas"
// queda inalcanzable). Mientras el editor está abierto, forzamos que la
// ventana no se desplace — así el editor y su botón de salida quedan fijos.
function lockScrollMientrasEditor(activar) {
  if (activar) {
    document.body.style.overflow = 'hidden';
    window.visualViewport?.addEventListener('resize', reanclar);
    window.visualViewport?.addEventListener('scroll', reanclar);
  } else {
    document.body.style.overflow = '';
    window.visualViewport?.removeEventListener('resize', reanclar);
    window.visualViewport?.removeEventListener('scroll', reanclar);
  }
}
function reanclar() {
  window.scrollTo(0, 0);
}

function abrirEditor(nota) {
  notaAbierta = nota;
  $('#editor-titulo').value = nota.titulo || '';
  $('#editor-contenido').value = nota.contenido || '';
  $('#editor-guardado').textContent = '';
  $('#nota-editor').hidden = false;
  lockScrollMientrasEditor(true);
  // El editor tapa la pantalla entera y en una PWA no hay barra del navegador:
  // sin esto el gesto de volver no lo cerraba (y en Android cerraba la app).
  // Es la causa raíz del viejo "no puedo salir de Notas"; el fix anterior
  // atacó la cascada del [hidden], que era el otro síntoma.
  abrirCapa(cerrarEditor);
  if (!nota.titulo) $('#editor-titulo').focus();
}

/** Cierre REAL. Lo llama el router cuando el usuario vuelve atrás — nadie más
 * debería invocarlo, o el historial queda con una entrada colgada. Para cerrar
 * desde un botón va `cerrarCapa()`, que dispara el mismo camino. */
function cerrarEditor() {
  // No guardar notas totalmente vacías
  if (notaAbierta && !$('#editor-titulo').value.trim() && !$('#editor-contenido').value.trim()) {
    removeNota(notaAbierta.id);
  }
  notaAbierta = null;
  $('#nota-editor').hidden = true;
  lockScrollMientrasEditor(false);
  renderLista();
}

function guardar() {
  if (!notaAbierta) return;
  notaAbierta = {
    ...notaAbierta,
    titulo: $('#editor-titulo').value,
    contenido: $('#editor-contenido').value,
    updated: Date.now(),
  };
  upsertNota(notaAbierta);
  $('#editor-guardado').textContent = 'Guardado ✓';
  clearTimeout(guardar._t);
  guardar._t = setTimeout(() => { $('#editor-guardado').textContent = ''; }, 1500);
}

export function initNotas() {
  $('#btn-nueva-nota').addEventListener('click', () => {
    abrirEditor({ id: crypto.randomUUID(), titulo: '', contenido: '', updated: Date.now() });
  });

  $('#notas-lista').addEventListener('click', (e) => {
    const card = e.target.closest('.nota-card');
    if (!card) return;
    const nota = getNotas().find((n) => n.id === card.dataset.id);
    if (nota) abrirEditor(nota);
  });

  // Todas las salidas pasan por `cerrarCapa()` — botón, Escape y borrar — así
  // el historial acompaña y el gesto Atrás hace exactamente lo mismo.
  $('#editor-volver').addEventListener('click', cerrarCapa);

  // Salida de emergencia: Escape cierra el editor (además del botón)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#nota-editor').hidden) cerrarCapa();
  });
  $('#editor-borrar').addEventListener('click', async () => {
    if (!notaAbierta) return;
    const ok = await confirmar({ titulo: '¿Borrar esta nota?', accion: 'Borrar', destructivo: true });
    if (ok) {
      removeNota(notaAbierta.id);
      notaAbierta = null;   // así `cerrarEditor` no intenta borrarla de nuevo
      cerrarCapa();
    }
  });

  // Autosave al tipear
  $('#editor-titulo').addEventListener('input', guardar);
  $('#editor-contenido').addEventListener('input', guardar);

  renderLista();
}

export { renderLista as renderNotas };
