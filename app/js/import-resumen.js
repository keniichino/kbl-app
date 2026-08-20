// ====== Importar resumen pegando el texto ======
// El cuello de botella real de la app no es mirar los números: es cargarlos.
// Los 293 gastos que hay entraron por tandas de SQL, no de a uno por día.
// Esto convierte "copiar el listado del homebanking" en una carga de 10
// segundos, con el mismo criterio anti-duplicado que se usó a mano.
//
// PARSEO POR BLOQUES, NO POR LÍNEAS. Al copiar una tabla web, cada celda
// puede caer en su propia línea, o venir todo junto separado por tabs, según
// el navegador y el banco. Lo único estable es que cada movimiento ARRANCA
// con una fecha dd/mm/aaaa. Así que se corta ahí: todo lo que va de una fecha
// hasta la siguiente es un movimiento, sin importar cómo quedaron los saltos.

import { norm } from './fincore.js';
import { categoriaDe } from './catalogo.js';

const RE_FECHA = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
const RE_FECHA_G = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;

/** "1.234,56" → 1234.56 · "3.400" → 3400 · "1,09" → 1.09 */
function aNumero(str) {
  const s = String(str).trim();
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  // Sin coma: los puntos son separador de miles (así los escribe el banco).
  return Number(s.replace(/\./g, ''));
}

function aIso(d, m, a) {
  const anio = a.length === 2 ? '20' + a : a;
  return `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Lo que aparece en el listado pero NO es un consumo: el pago del resumen, los
// totales de la tabla y los encabezados. Si entraran, cada import sumaría un
// "gasto" de un millón de pesos que en realidad es la plata que pagaste.
const NO_ES_GASTO = [
  /pago de tu tarjeta/i, /pago de tarjeta/i, /^pago\b/i, /su pago/i,
  /^total/i, /saldo (anterior|actual)/i, /^fecha\b/i, /^descripci/i,
  /^importe/i, /^cuotas$/i, /^tarjeta$/i, /cargar (mas|menos) movimientos/i,
];

// Ajustes del banco: son reales y afectan el total, pero no son consumo tuyo.
const ES_AJUSTE = [/^dev\b/i, /devoluci/i, /reintegro/i, /percep/i, /\brg ?4815\b/i, /impuesto de sellos/i];

const TARJETAS = [
  { re: /visa\s*(cr[ée]dito)?\s*6255|visa\s*6255/i, key: 'visa' },
  { re: /mastercard\s*(cr[ée]dito)?\s*7541|mastercard\s*7541/i, key: 'mac' },
  { re: /\bvisa\b/i, key: 'visa' },
  { re: /\bmastercard\b/i, key: 'mac' },
];

/**
 * Texto pegado → movimientos estructurados.
 *
 * Devuelve también lo descartado y por qué: un import que dice "cargué 18"
 * sin decir qué dejó afuera es exactamente igual de opaco que cargar a mano.
 */
// Pie y encabezado de la tabla. Se sacan ANTES de cortar por fechas: como el
// corte va de una fecha hasta la siguiente, el pie "Total $ 1.213.732,60" se
// pegaba al último movimiento y le robaba el importe.
const LINEA_DE_TABLA = /^\s*(total|subtotal|saldo|cargar (m[áa]s|menos)|fecha\b|descripci|importe|movimientos$|listado)/i;

export function parsearResumen(texto, { tarjeta = null } = {}) {
  const limpio = String(texto || '').replace(/\r/g, '').replace(/\t/g, ' ')
    .split('\n').filter((l) => !LINEA_DE_TABLA.test(l)).join('\n');
  if (!limpio.trim()) return { movimientos: [], descartados: [], tarjeta };

  // Tarjeta declarada en el encabezado del listado ("Visa Crédito 6255")
  let tarjetaTexto = tarjeta;
  if (!tarjetaTexto) {
    const hit = TARJETAS.find((t) => t.re.test(limpio));
    if (hit) tarjetaTexto = hit.key;
  }

  // Cortar en bloques: cada uno arranca en una fecha y termina antes de la próxima.
  const cortes = [];
  let m;
  RE_FECHA_G.lastIndex = 0;
  while ((m = RE_FECHA_G.exec(limpio)) !== null) cortes.push(m.index);
  if (!cortes.length) return { movimientos: [], descartados: [{ texto: limpio.slice(0, 80), razon: 'no encontré ninguna fecha' }], tarjeta: tarjetaTexto };

  const movimientos = [];
  const descartados = [];

  for (let i = 0; i < cortes.length; i++) {
    const bloque = limpio.slice(cortes[i], cortes[i + 1] ?? limpio.length)
      .replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const f = bloque.match(RE_FECHA);
    if (!f) continue;
    const fecha = aIso(f[1], f[2], f[3]);

    // Resto del bloque sin la fecha
    let resto = bloque.slice(f[0].length).trim();

    if (NO_ES_GASTO.some((re) => re.test(resto))) {
      descartados.push({ fecha, texto: resto.slice(0, 60), razon: 'no es un consumo (pago o encabezado)' });
      continue;
    }

    // Importe: se toma el ÚLTIMO del bloque. En la tabla de Galicia las
    // columnas van "pesos | dólares", y un consumo en USD deja la de pesos
    // vacía — quedarse con el primero traería la cuota, no el importe.
    const usd = [...resto.matchAll(/(?:USD|US\$)\s*(-?\s*[\d.]+(?:,\d+)?)/gi)];
    const ars = [...resto.matchAll(/\$\s*(-?\s*[\d.]+(?:,\d+)?)/g)]
      .filter((x) => !/US\$/i.test(resto.slice(Math.max(0, x.index - 3), x.index + 1)));

    let monto = null, moneda = 'ARS';
    if (usd.length) { monto = aNumero(usd.at(-1)[1].replace(/\s/g, '')); moneda = 'USD'; }
    else if (ars.length) { monto = aNumero(ars.at(-1)[1].replace(/\s/g, '')); }

    if (monto == null || !isFinite(monto)) {
      descartados.push({ fecha, texto: resto.slice(0, 60), razon: 'no pude leer el importe' });
      continue;
    }

    // Plan en cuotas: "3 de 9". No es un gasto suelto — la app lo lleva en
    // `cuotas`, así que se informa aparte en vez de cargarse como consumo.
    const cuota = resto.match(/\b(\d{1,2})\s*de\s*(\d{1,2})\b/i);

    // Descripción: sacar tarjeta, importes y el "N de M" de cuotas.
    let desc = resto
      .replace(/(?:USD|US\$)\s*-?\s*[\d.]+(?:,\d+)?/gi, ' ')
      .replace(/\$\s*-?\s*[\d.]+(?:,\d+)?/g, ' ')
      .replace(/\b\d{1,2}\s*de\s*\d{1,2}\b/gi, ' ')
      .replace(/visa\s*(cr[ée]dito)?\s*\d{0,4}/gi, ' ')
      .replace(/mastercard\s*(cr[ée]dito)?\s*\d{0,4}/gi, ' ')
      // El signo del importe negativo queda huérfano al borrar el número.
      .replace(/\s+[-–]\s*$/, '')
      .replace(/\s+/g, ' ').trim();

    if (!desc) {
      descartados.push({ fecha, texto: resto.slice(0, 60), razon: 'quedó sin descripción' });
      continue;
    }

    const negativo = /-\s*(?:\$|USD|US\$)|(?:\$|USD|US\$)\s*-/.test(resto);
    const esAjuste = ES_AJUSTE.some((re) => re.test(desc)) || negativo;

    movimientos.push({
      fecha,
      descripcion: desc,
      monto: Math.abs(monto),
      moneda,
      tarjeta: tarjetaTexto,
      cuota: cuota ? { actual: Number(cuota[1]), total: Number(cuota[2]) } : null,
      tipo: esAjuste ? 'ajuste' : (cuota ? 'cuota' : 'gasto'),
      categoria: categoriaDe(desc) || 'otros',
    });
  }

  return { movimientos, descartados, tarjeta: tarjetaTexto };
}

/**
 * Marca cuáles ya están cargados. Mismo criterio que se usó para conciliar a
 * mano: fecha + monto + descripción + tarjeta. La descripción se normaliza
 * porque el banco alterna mayúsculas ("DLO*DIDI" y "DLO*DiDi" son el mismo).
 */
/** Sólo para el módulo Gastos: la lista de categorías con su emoji. */
export const EMOJI_CAT = {
  comida: '🍔', super: '🛒', transporte: '🚗', salidas: '🎉', servicios: '🔁',
  educacion: '🎓', casa: '🏠', salud: '💊', impuestos: '🧾', otros: '📦',
};

export function marcarDuplicados(movimientos, gastosExistentes) {
  const clave = (g) => [g.fecha, Number(g.monto).toFixed(2), norm(g.descripcion), g.tarjeta || ''].join('|');
  const yaEstan = new Set(gastosExistentes.map(clave));
  // Dentro del mismo pegado puede venir dos veces el mismo consumo (pasa
  // cuando copiás "Movimientos" y "Actividad" juntos): el segundo también
  // se marca, si no el import duplicaría contra sí mismo.
  const vistos = new Set();
  return movimientos.map((mv) => {
    const k = clave(mv);
    const dup = yaEstan.has(k) || vistos.has(k);
    vistos.add(k);
    return { ...mv, duplicado: dup };
  });
}
