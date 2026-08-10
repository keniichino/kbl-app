// ====== Recordatorios de vencimiento (.ics) ======
// Por qué un archivo de calendario y no una notificación push: el push con la
// app cerrada necesita un servidor que lo mande (ver TAREAS.md), y una
// notificación local se pierde si no abrís la app ese día. Un evento en el
// calendario del teléfono suena aunque la app nunca más se abra, se sincroniza
// solo entre tus dispositivos y no depende de que la PWA esté instalada.
//
// Todo se genera en el dispositivo: no viaja nada a ningún lado.

import { pad2, MESES } from './fincore.js';

/**
 * Fecha local + hora → el formato de fecha flotante de iCalendar
 * (YYYYMMDDTHHMMSS, sin Z). Flotante a propósito: "el 10 a las 9" tiene que
 * sonar a las 9 de donde estés, no a las 9 de Buenos Aires convertidas a UTC.
 */
function aStampLocal(iso, hora = '09:00') {
  const [h, m] = hora.split(':');
  return `${iso.replace(/-/g, '')}T${pad2(Number(h))}${pad2(Number(m))}00`;
}

/** UTC real, para DTSTAMP (que sí tiene que ser absoluto). */
function ahoraUtc() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

// RFC 5545: las líneas van cortadas a 75 octetos y las comas/puntos y coma
// del texto tienen que ir escapados o el evento se importa partido.
const escaparIcs = (s) => (s || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function plegar(linea) {
  if (linea.length <= 75) return linea;
  const partes = [linea.slice(0, 75)];
  let resto = linea.slice(75);
  while (resto.length > 74) { partes.push(' ' + resto.slice(0, 74)); resto = resto.slice(74); }
  if (resto) partes.push(' ' + resto);
  return partes.join('\r\n');
}

/**
 * Evento de calendario con alarma.
 *
 * @param titulo      Lo que ves en el calendario.
 * @param descripcion Cuerpo del evento (el detalle de qué se paga).
 * @param fecha       ISO YYYY-MM-DD del vencimiento.
 * @param hora        "HH:MM" local a la que suena.
 * @param avisoDias   Alarma extra N días antes (0 = sólo a la hora del evento).
 * @param repetir     true = todos los meses ese día (para resúmenes fijos).
 */
export function generarIcs({ titulo, descripcion = '', fecha, hora = '09:00', avisoDias = 1, repetir = false, uid }) {
  const inicio = aStampLocal(fecha, hora);
  // Media hora de duración: un evento de día completo se pierde entre los
  // demás y no dispara alarma con hora exacta en iOS.
  const [h, m] = hora.split(':').map(Number);
  const totalMin = h * 60 + m + 30;
  const fin = aStampLocal(fecha, `${pad2(Math.floor(totalMin / 60) % 24)}:${pad2(totalMin % 60)}`);

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KBL App//Recordatorios//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid || crypto.randomUUID()}@kbl.app`,
    `DTSTAMP:${ahoraUtc()}`,
    `DTSTART:${inicio}`,
    `DTEND:${fin}`,
    `SUMMARY:${escaparIcs(titulo)}`,
    descripcion ? `DESCRIPTION:${escaparIcs(descripcion)}` : '',
    repetir ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Number(fecha.slice(8, 10))}` : '',
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${escaparIcs(titulo)}`, 'END:VALARM',
    ...(avisoDias > 0 ? [
      'BEGIN:VALARM', `TRIGGER:-P${avisoDias}D`, 'ACTION:DISPLAY',
      `DESCRIPTION:${escaparIcs(titulo)}`, 'END:VALARM',
    ] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  // CRLF obligatorio: con \n solo, iOS lo rechaza sin decir por qué.
  return lineas.map(plegar).join('\r\n');
}

/**
 * Baja el .ics. En iOS Safari abre directo el Calendario preguntando si lo
 * querés agregar; en Android/desktop cae en Descargas y se abre con un toque.
 */
export function descargarIcs(nombre, contenido) {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre.replace(/[^\w\-]+/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Un tick de margen: revocar en el mismo frame cancela la descarga en iOS.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const labelFechaLarga = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
};

// ---------- Diálogo de configuración ----------

const HORAS = ['08:00', '09:00', '10:00', '12:00', '15:00', '18:00', '20:00'];

/**
 * Abre el selector de horario y devuelve la config elegida, o null si cancela.
 * Vive acá y no en dialog.js porque es específico del recordatorio (elegir
 * hora, cuántos días antes y si repite todos los meses).
 */
export function pedirConfigRecordatorio({ titulo, fecha, sugerido = '09:00' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-overlay';
    wrap.innerHTML = `
      <div class="dialog-card rec-card" role="dialog" aria-modal="true" aria-label="Configurar recordatorio">
        <div class="dialog-titulo">Recordatorio</div>
        <div class="rec-sub">${escapeHtml(titulo)}<br><b>${labelFechaLarga(fecha)}</b></div>

        <div class="rec-campo">
          <label class="rec-label" for="rec-hora">¿A qué hora te aviso?</label>
          <div class="rec-horas" id="rec-horas">
            ${HORAS.map((h) => `<button type="button" class="chip rec-hora ${h === sugerido ? 'selected' : ''}" data-hora="${h}">${h}</button>`).join('')}
          </div>
          <input type="time" id="rec-hora" class="rec-hora-input" value="${sugerido}" aria-label="Otra hora">
        </div>

        <div class="rec-campo">
          <label class="rec-label">¿Y antes?</label>
          <div class="rec-horas" id="rec-antes">
            <button type="button" class="chip rec-antes" data-dias="0">Sólo ese día</button>
            <button type="button" class="chip rec-antes selected" data-dias="1">1 día antes</button>
            <button type="button" class="chip rec-antes" data-dias="3">3 días antes</button>
          </div>
        </div>

        <label class="rec-check">
          <input type="checkbox" id="rec-repetir" checked>
          <span>Repetir todos los meses (el resumen vence siempre el mismo día)</span>
        </label>

        <div class="dialog-botones">
          <button class="dialog-btn" data-rec="cancelar">Cancelar</button>
          <button class="dialog-btn principal" data-rec="ok">Agregar al calendario</button>
        </div>
      </div>`;

    let hora = sugerido;
    let dias = 1;

    const cerrar = (valor) => {
      wrap.classList.add('saliendo');
      setTimeout(() => wrap.remove(), 160);
      resolve(valor);
    };

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return cerrar(null);
      const h = e.target.closest('[data-hora]');
      if (h) {
        hora = h.dataset.hora;
        wrap.querySelector('#rec-hora').value = hora;
        wrap.querySelectorAll('.rec-hora').forEach((b) => b.classList.toggle('selected', b === h));
        return;
      }
      const a = e.target.closest('[data-dias]');
      if (a) {
        dias = Number(a.dataset.dias);
        wrap.querySelectorAll('.rec-antes').forEach((b) => b.classList.toggle('selected', b === a));
        return;
      }
      const btn = e.target.closest('[data-rec]');
      if (!btn) return;
      if (btn.dataset.rec === 'cancelar') return cerrar(null);
      cerrar({ hora, avisoDias: dias, repetir: wrap.querySelector('#rec-repetir').checked });
    });

    // Hora libre: si tocás el reloj, deselecciona los chips.
    wrap.querySelector('#rec-hora').addEventListener('input', (e) => {
      hora = e.target.value || sugerido;
      wrap.querySelectorAll('.rec-hora').forEach((b) => b.classList.toggle('selected', b.dataset.hora === hora));
    });

    document.body.appendChild(wrap);
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
