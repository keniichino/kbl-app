// ====== Diálogos estilo iOS (reemplazan confirm() y prompt() nativos) ======

/**
 * Pide un texto corto. Devuelve el string, o null si cancela.
 * Existe porque `prompt()` nativo está bloqueado en PWA instalada en iOS.
 */
export function pedirTexto({ titulo, mensaje = '', valor = '', placeholder = '', accion = 'Guardar' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-card" role="dialog" aria-modal="true" aria-label="${titulo}">
        <div class="dialog-titulo">${titulo}</div>
        ${mensaje ? `<div class="dialog-mensaje">${mensaje}</div>` : ''}
        <input class="dialog-input" id="dlg-input" type="text" autocomplete="off"
               value="${(valor || '').replace(/"/g, '&quot;')}"
               placeholder="${(placeholder || '').replace(/"/g, '&quot;')}">
        <div class="dialog-botones">
          <button class="dialog-btn" data-r="0">Cancelar</button>
          <button class="dialog-btn principal" data-r="1">${accion}</button>
        </div>
      </div>`;

    const input = overlay.querySelector('#dlg-input');
    const cerrar = (r) => {
      overlay.classList.add('saliendo');
      setTimeout(() => overlay.remove(), 160);
      resolve(r);
    };

    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('.dialog-btn');
      if (btn) cerrar(btn.dataset.r === '1' ? input.value.trim() : null);
      else if (e.target === overlay) cerrar(null);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cerrar(input.value.trim());
      if (e.key === 'Escape') cerrar(null);
    });

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

// ====== Diálogo de confirmación estilo iOS (reemplaza confirm() nativo) ======

export function confirmar({ titulo, mensaje = '', accion = 'OK', destructivo = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-card" role="alertdialog" aria-label="${titulo}">
        <div class="dialog-titulo">${titulo}</div>
        ${mensaje ? `<div class="dialog-mensaje">${mensaje}</div>` : ''}
        <div class="dialog-botones">
          <button class="dialog-btn" data-r="0">Cancelar</button>
          <button class="dialog-btn ${destructivo ? 'destructivo' : 'principal'}" data-r="1">${accion}</button>
        </div>
      </div>`;

    const cerrar = (r) => {
      overlay.classList.add('saliendo');
      setTimeout(() => overlay.remove(), 160);
      resolve(r);
    };

    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('.dialog-btn');
      if (btn) cerrar(btn.dataset.r === '1');
      else if (e.target === overlay) cerrar(false);
    });

    document.body.appendChild(overlay);
  });
}
