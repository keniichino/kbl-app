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
