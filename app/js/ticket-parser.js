// ====== Parser de tickets (heurísticas sobre texto OCR) ======
// Tesseract.js devuelve texto crudo, sin estructura. Esto intenta sacar
// monto total, fecha y comercio con reglas simples — nunca va a ser
// perfecto con impresión térmica/papel arrugado, por eso el resultado
// siempre precarga el form de Gastos para que lo revises antes de guardar
// (mismo criterio de toda la app: confirmar, no adivinar en silencio).

const PALABRAS_TOTAL = /total|importe|a pagar|monto/i;
const RUIDO_COMERCIO = /^\s*(cuit|domicilio|direcci[oó]n|tel[eé]fono|iva|responsable|fecha|hora|caja|ticket|nro|n°|comprobante)\b/i;

function aNumero(texto) {
  // Tickets argentinos: "1.234,56" (punto de miles, coma decimal).
  const limpio = (texto || '').replace(/[^\d.,]/g, '');
  if (!limpio) return null;
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio;
  const n = parseFloat(normalizado);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const numerosEn = (linea) => [...linea.matchAll(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/g)]
  .map((m) => aNumero(m[0]))
  .filter(Boolean);

/** Monto total: prioriza líneas con "total"/"importe"/"a pagar"; sin eso,
 * el número más grande de todo el ticket (los ítems sueltos son más chicos). */
function extraerMonto(lineas) {
  for (const linea of lineas) {
    if (!PALABRAS_TOTAL.test(linea)) continue;
    const nums = numerosEn(linea);
    if (nums.length) return Math.max(...nums);
  }
  const todos = lineas.flatMap(numerosEn);
  return todos.length ? Math.max(...todos) : null;
}

/** Fecha DD/MM/YYYY, DD-MM-YY, etc. Devuelve ISO (YYYY-MM-DD) o null. */
function extraerFecha(textoCrudo) {
  const m = textoCrudo.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (!m) return null;
  const [, dRaw, moRaw, yRaw] = m;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  const d = dRaw.padStart(2, '0');
  const mo = moRaw.padStart(2, '0');
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** Nombre de comercio: primera línea con letras que no sea ruido típico de
 * ticket (CUIT, dirección, fecha...). Heurística simple a propósito. */
function extraerComercio(lineas) {
  for (const linea of lineas) {
    if (linea.length < 3 || linea.length > 40) continue;
    if (RUIDO_COMERCIO.test(linea)) continue;
    if (!/[a-zA-Z]{3,}/.test(linea)) continue;
    if ((linea.match(/\d/g) || []).length > linea.length * 0.4) continue; // muy numérica
    return linea;
  }
  return '';
}

/** Punto de entrada: texto crudo de Tesseract → campos sueltos para
 * precargar el form de Gastos. Nunca lanza; ante duda devuelve null/''. */
export function parsearTicket(textoCrudo) {
  const texto = textoCrudo || '';
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    monto: extraerMonto(lineas),
    fecha: extraerFecha(texto),
    comercio: extraerComercio(lineas),
  };
}
