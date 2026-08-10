// ====== Parser de comprobantes de broker (heurísticas sobre texto OCR) ======
// Distinto del parser de tickets: acá el comprobante SÍ tiene estructura
// (etiqueta a la izquierda, valor a la derecha) y encima tiene una identidad
// contable que se puede verificar sola:
//
//     cantidad × precio_unitario + comisiones + gastos = total debitado
//
// Eso permite algo que con un ticket de súper no se puede: decir si el OCR
// leyó bien. Si la cuenta no cierra al peso, se avisa y no se guarda a ciegas.
//
// Probado contra comprobantes de IOL / Cocos / Balanz / Bull Market, que usan
// las mismas etiquetas en castellano.

const ETIQUETAS = {
  operacion: /\boperaci[oó]n\b/i,
  instrumento: /\binstrumento\b|\bespecie\b|\bticker\b/i,
  precio: /precio\s*(unitario|promedio)?|\bcotizaci[oó]n\b/i,
  comisiones: /\bcomisi[oó]n(es)?\b|\barancel(es)?\b/i,
  gastos: /gastos?\s*(de\s*)?(operaci[oó]n|mercado)|derechos?\s*de\s*mercado|\bimpuestos?\b/i,
  cantidad: /\bcantidad\b|\bnominales\b/i,
  fechaEjec: /fecha\s*(de\s*)?ejec/i,
  fechaLiq: /fecha\s*(de\s*)?liq/i,
  orden: /n[°º.]?\s*de\s*orden|n[uú]mero\s*de\s*orden/i,
};

// Un ticker es 2-6 letras mayúsculas, opcionalmente con sufijo de plazo (AL30D).
const TICKER = /\b([A-Z]{2,6}\d{0,2}[DC]?)\b/;

// Clases inferidas por ticker conocido. No pretende ser exhaustivo: si no
// reconoce, deja la clase vacía y la elegís vos.
const CEDEARS = new Set(['NFLX', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'KO', 'DISN', 'MELI', 'SPY', 'QQQ', 'BABA', 'PBR', 'VIST', 'AMD', 'INTC', 'PYPL', 'SBUX', 'NKE', 'JNJ', 'XOM', 'WMT', 'V', 'MA', 'BRKB', 'ARKK', 'EEM', 'IWM', 'DIA']);
const ACCIONES_AR = new Set(['GGAL', 'YPFD', 'PAMP', 'BMA', 'TXAR', 'ALUA', 'CEPU', 'COME', 'EDN', 'LOMA', 'SUPV', 'TGSU2', 'TRAN', 'CRES', 'BBAR', 'MIRG', 'VALO', 'BYMA']);
const CRIPTO = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'DAI', 'SOL', 'ADA', 'DOGE', 'BNB', 'XRP', 'MATIC', 'LTC']);

function claseDe(ticker) {
  const t = (ticker || '').toUpperCase();
  if (CRIPTO.has(t)) return 'cripto';
  if (CEDEARS.has(t)) return 'cedear';
  if (ACCIONES_AR.has(t)) return 'accion';
  // Bonos y letras argentinos: letra(s) + número, con sufijo de plazo opcional.
  if (/^(AL|GD|AE|TX|TV|T[0-9]|S[0-9]|PR|PB|BA|CO)\w*\d/.test(t)) return 'bono';
  return '';
}

/** "1.234,56" (formato AR) y "1,234.56" (formato US) a número. */
function aNumero(texto) {
  const limpio = (texto || '').replace(/[^\d.,-]/g, '');
  if (!limpio) return null;
  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  let normalizado;
  if (ultimaComa > ultimoPunto) {
    normalizado = limpio.replace(/\./g, '').replace(',', '.');   // AR: 1.234,56
  } else if (ultimoPunto > ultimaComa) {
    normalizado = limpio.replace(/,/g, '');                      // US: 1,234.56
  } else {
    normalizado = limpio;
  }
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

const numerosEn = (linea) => [...linea.matchAll(/-?\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?/g)]
  .map((m) => aNumero(m[0]))
  .filter((n) => n != null);

/** Último número de la línea: en un comprobante el valor va a la derecha. */
function valorDe(lineas, regex) {
  for (const l of lineas) {
    if (!regex.test(l)) continue;
    const nums = numerosEn(l);
    if (nums.length) return nums.at(-1);
  }
  return null;
}

function textoDe(lineas, regex) {
  for (let i = 0; i < lineas.length; i++) {
    if (!regex.test(lineas[i])) continue;
    // Valor en la misma línea, después de la etiqueta.
    const resto = lineas[i].replace(regex, '').replace(/[:\s]+/g, ' ').trim();
    if (resto.length >= 2) return resto;
    // Layout de dos renglones (celular angosto): el valor cae abajo.
    if (lineas[i + 1] && lineas[i + 1].length <= 30) return lineas[i + 1].trim();
  }
  return '';
}

function extraerFecha(texto, regex) {
  const linea = texto.split('\n').find((l) => regex.test(l)) || '';
  const m = linea.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (!m) return null;
  const [, d, mo, yRaw] = m;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Cantidad + ticker. Los comprobantes lo muestran como encabezado suelto
 * ("40 NFLX") además de en la fila "Instrumento", así que se busca en las dos
 * formas y gana la que aparezca completa.
 */
function extraerCantidadYTicker(lineas) {
  for (const l of lineas) {
    const m = l.match(/^\s*(\d{1,3}(?:[.,]\d{3})*)\s+([A-Z]{2,6}\d{0,2}[DC]?)\s*$/);
    if (m) return { cantidad: aNumero(m[1]), ticker: m[2] };
  }
  const cant = valorDe(lineas, ETIQUETAS.cantidad);
  const instr = textoDe(lineas, ETIQUETAS.instrumento);
  const t = (instr.match(TICKER) || [])[1] || '';
  return { cantidad: cant, ticker: t };
}

/** El total debitado: el número más grande del comprobante. */
function extraerTotal(lineas) {
  const todos = lineas.flatMap(numerosEn);
  return todos.length ? Math.max(...todos) : null;
}

/**
 * Texto crudo del OCR → operación lista para revisar.
 *
 * `cuadra` es lo importante: dice si cantidad × precio + costos coincide con
 * el total que muestra el comprobante. En false, el OCR leyó mal algún número
 * y hay que corregir a mano antes de guardar.
 */
export function parsearComprobante(textoCrudo) {
  const texto = textoCrudo || '';
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  const { cantidad, ticker } = extraerCantidadYTicker(lineas);
  const precio = valorDe(lineas, ETIQUETAS.precio);
  const comisiones = valorDe(lineas, ETIQUETAS.comisiones) || 0;
  const gastos = valorDe(lineas, ETIQUETAS.gastos) || 0;
  const total = extraerTotal(lineas);

  const opTexto = textoDe(lineas, ETIQUETAS.operacion).toLowerCase();
  const tipo = /vent/.test(opTexto) ? 'venta'
    : /divid/.test(texto) ? 'dividendo'
    : 'compra';

  const bruto = cantidad != null && precio != null ? cantidad * precio : null;
  const neto = bruto != null ? bruto + comisiones + gastos : null;

  // Tolerancia de $1: el OCR puede comerse un centavo de redondeo, pero no
  // puede equivocarse en un dígito sin que la cuenta se vaya bastante más.
  const cuadra = neto != null && total != null ? Math.abs(neto - total) <= 1 : null;

  return {
    tipo,
    instrumento: ticker,
    clase: claseDe(ticker),
    cantidad,
    precio_unitario: precio,
    comisiones,
    gastos_op: gastos,
    fecha: extraerFecha(texto, ETIQUETAS.fechaEjec) || extraerFecha(texto, /\d{2}\/\d{2}\/\d{4}/),
    fechaLiquidacion: extraerFecha(texto, ETIQUETAS.fechaLiq),
    orden: (textoDe(lineas, ETIQUETAS.orden).match(/\d{4,}/) || [''])[0],
    // Derivados, para mostrar y validar
    bruto,
    neto,
    totalLeido: total,
    cuadra,
    diferencia: neto != null && total != null ? neto - total : null,
  };
}
