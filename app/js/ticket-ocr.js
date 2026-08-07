// ====== OCR de tickets (Tesseract.js, 100% local) ======
// Carga pesada (motor + datos de idioma, varios MB) — por eso nunca se
// importa de arranque, sólo cuando tocás el botón de foto en Gastos.
// Todo corre en el dispositivo vía WebAssembly: la foto no sale de acá,
// no hay backend ni costo por imagen (a cambio de peor precisión que un
// OCR en la nube — ya evaluado así a propósito).

const BASE = 'vendor/tesseract/';
let libCargada = null;

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

// Se resuelve una sola vez: si dos fotos se piden juntas, comparten la carga.
function asegurarLibreria() {
  if (!libCargada) libCargada = cargarScript(`${BASE}tesseract.min.js`);
  return libCargada;
}

/**
 * Reconoce el texto de una foto de ticket. Devuelve el texto CRUDO (sin
 * parsear) — `parsearTicket()` en ticket-parser.js saca monto/fecha/comercio.
 * `onProgreso(pct 0..1)` es opcional, para un loader real en vez de un spinner ciego.
 */
export async function reconocerTicket(file, onProgreso) {
  await asegurarLibreria();
  const worker = await window.Tesseract.createWorker('spa', 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: `${BASE}core/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${BASE}lang`,
    gzip: true,
    logger: (m) => {
      if (onProgreso && m.status === 'recognizing text') onProgreso(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    worker.terminate();
  }
}
