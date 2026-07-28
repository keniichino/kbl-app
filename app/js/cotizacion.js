// ====== Cotización del dólar ======
// Fuente: dolarapi.com (pública, sin API key, CORS abierto). Se cachea en
// localStorage: la app arranca al toque con el último valor conocido y refresca
// en segundo plano. Sin internet sigue mostrando el último, avisando la fecha.
//
// Qué casa usar: Keni compra dólares en Mercado Pago, que vende a precio MEP
// (acá "bolsa"). El blue es efectivo informal y no es el precio que él paga.
// Por eso el default es MEP y no blue.

const URL_API = 'https://dolarapi.com/v1/dolares';
const CLAVE = 'kbl.cotizacion';
const CLAVE_CASA = 'kbl.cotizacion.casa';
const FRESCA_MS = 30 * 60 * 1000;   // 30 min: el MEP no se mueve tanto intradía

export const CASAS = [
  { key: 'bolsa',  label: 'MEP',    ayuda: 'lo que te sale comprar dólares en Mercado Pago' },
  { key: 'blue',   label: 'Blue',   ayuda: 'informal, efectivo' },
  { key: 'cripto', label: 'Cripto', ayuda: 'USDT en exchanges' },
];

const fmtPesos = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});

let datos = leerCache();
let casaSel = localStorage.getItem(CLAVE_CASA) || 'bolsa';
const oyentes = [];

function leerCache() {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function avisar() {
  oyentes.forEach((cb) => { try { cb(); } catch (e) { /* un oyente roto no frena al resto */ } });
}

/** Se ejecuta cb cada vez que cambia la cotización o la casa elegida. */
export function onCotizacion(cb) {
  oyentes.push(cb);
}

export function casaActual() {
  return CASAS.find((c) => c.key === casaSel) || CASAS[0];
}

/** Cicla MEP → Blue → Cripto. Se usa al tocar el equivalente en pesos. */
export function siguienteCasa() {
  const i = CASAS.findIndex((c) => c.key === casaSel);
  casaSel = CASAS[(i + 1) % CASAS.length].key;
  localStorage.setItem(CLAVE_CASA, casaSel);
  avisar();
  return casaActual();
}

/**
 * Cotización vigente de la casa elegida.
 * Devuelve null si nunca se pudo bajar (primera vez sin internet).
 */
export function cotizacion(casa = casaSel) {
  const c = datos?.casas?.[casa];
  if (!c) return null;
  return {
    casa,
    label: (CASAS.find((x) => x.key === casa) || {}).label || casa,
    compra: c.compra,
    venta: c.venta,
    fecha: c.fecha,
    // Vieja = no se pudo refrescar hace más de un día. Se avisa en pantalla.
    vieja: !datos.ts || (Date.now() - datos.ts) > 24 * 60 * 60 * 1000,
  };
}

/** Cuántos pesos son `usd` a la cotización elegida (venta: es a lo que comprás). */
export function aPesos(usd, casa = casaSel) {
  const c = cotizacion(casa);
  if (!c || !c.venta) return null;
  return (Number(usd) || 0) * c.venta;
}

/** "≈ $ 58.618" listo para pintar, o '' si todavía no hay cotización. */
export function equivalente(usd, casa = casaSel) {
  const pesos = aPesos(usd, casa);
  return pesos == null ? '' : '≈ ' + fmtPesos.format(pesos);
}

/**
 * Lo que el banco te cobraría por ese consumo en dólares si NO lo cubrís con
 * dólares propios (dólar tarjeta = oficial + impuestos). La diferencia contra
 * comprar MEP es el ahorro real de la maniobra de Keni.
 */
export function ahorroVsTarjeta(usd) {
  const tarjeta = datos?.casas?.tarjeta?.venta;
  const propio = aPesos(usd);
  if (!tarjeta || propio == null) return null;
  const conTarjeta = (Number(usd) || 0) * tarjeta;
  return { conTarjeta, propio, ahorro: conTarjeta - propio };
}

export const fmtARS0 = (n) => fmtPesos.format(n);

/** Baja la cotización. Si falla, se queda con lo cacheado sin romper nada. */
export async function refrescar({ forzar = false } = {}) {
  if (!forzar && datos?.ts && (Date.now() - datos.ts) < FRESCA_MS) return datos;
  try {
    const res = await fetch(URL_API, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const lista = await res.json();
    const casas = {};
    for (const c of lista) {
      casas[c.casa] = { compra: c.compra, venta: c.venta, fecha: c.fechaActualizacion };
    }
    if (!casas.bolsa) throw new Error('respuesta sin dólar bolsa');
    datos = { casas, ts: Date.now() };
    localStorage.setItem(CLAVE, JSON.stringify(datos));
    avisar();
  } catch (e) {
    console.warn('[cotizacion] no pude refrescar:', e.message);
  }
  return datos;
}

/** Arranca el ciclo: refresca ya y cada vez que la app vuelve al frente. */
export function initCotizacion() {
  refrescar();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refrescar();
  });
  if (datos) avisar();
}
