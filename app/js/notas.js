// ====== Módulo Notas — lista + editor con autosave ======
import { getNotas, upsertNota, removeNota } from './store.js';

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

function abrirEditor(nota) {
  notaAbierta = nota;
  $('#editor-titulo').value = nota.titulo || '';
  $('#editor-contenido').value = nota.contenido || '';
  $('#editor-guardado').textContent = '';
  $('#nota-editor').hidden = false;
  if (!nota.titulo) $('#editor-titulo').focus();
}

function cerrarEditor() {
  // No guardar notas totalmente vacías
  if (notaAbierta && !$('#editor-titulo').value.trim() && !$('#editor-contenido').value.trim()) {
    removeNota(notaAbierta.id);
  }
  notaAbierta = null;
  $('#nota-editor').hidden = true;
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

  $('#editor-volver').addEventListener('click', cerrarEditor);
  $('#editor-borrar').addEventListener('click', () => {
    if (!notaAbierta) return;
    if (confirm('¿Borrar esta nota?')) {
      removeNota(notaAbierta.id);
      notaAbierta = null;
      $('#nota-editor').hidden = true;
      renderLista();
    }
  });

  // Autosave al tipear
  $('#editor-titulo').addEventListener('input', guardar);
  $('#editor-contenido').addEventListener('input', guardar);

  renderLista();
}

export { renderLista as renderNotas };
