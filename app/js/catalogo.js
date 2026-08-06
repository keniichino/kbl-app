// ====== Catálogo de comercios ======
// Traduce lo que escupe el resumen de la tarjeta a algo que signifique algo:
// "MERPAGO*CARREFOUR" → súper, "ANTHROPIC* CLAUD" → suscripción.
//
// Dos cosas distintas por comercio:
//   · `cat`   → en qué categoría de Gastos cae (para categorizar solo).
//   · `clase` → si además es algo que se repite todos los meses
//               ('suscripcion' | 'fijo') o un gasto suelto ('variable').
// La clase es lo que permite avisar "Netflix es una suscripción" la PRIMERA
// vez que aparece, sin esperar a tener tres meses de historia.

import { norm } from './fincore.js';

// Pasarelas de pago que ensucian el principio de la descripción. Se sacan de
// a una: "PAYU*AR*UBER" tiene dos.
const PASARELAS = new Set([
  'merpago', 'mercadopago', 'mp', 'mpago', 'dlo', 'dlocal', 'dl', 'payu', 'pyu',
  'sipago', 'wl', 'ebanx', 'pagofacil', 'rapipago', 'uala', 'modo', 'gp', 'ap',
]);

/**
 * Deja el nombre del comercio solo. Los `*` separan pasarela de comercio en
 * casi todos los resúmenes argentinos.
 */
export function limpiarDescripcion(desc) {
  const partes = norm(desc).split('*').map((p) => p.trim()).filter(Boolean);
  while (partes.length > 1 && (PASARELAS.has(partes[0]) || partes[0] === 'ar')) partes.shift();
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

// El orden importa: gana el primero que matchea, así que lo específico va
// antes que lo genérico.
export const COMERCIOS = [
  // ---- Streaming y software: suscripción desde el primer cargo ----
  { m: /netflix/, nombre: 'Netflix', cat: 'servicios', clase: 'suscripcion' },
  { m: /spotify/, nombre: 'Spotify', cat: 'servicios', clase: 'suscripcion' },
  { m: /disney/, nombre: 'Disney+', cat: 'servicios', clase: 'suscripcion' },
  { m: /\bhbo\b|\bmax\.com|hbomax/, nombre: 'Max', cat: 'servicios', clase: 'suscripcion' },
  { m: /prime ?video|amazon ?prime/, nombre: 'Prime Video', cat: 'servicios', clase: 'suscripcion' },
  { m: /paramount/, nombre: 'Paramount+', cat: 'servicios', clase: 'suscripcion' },
  { m: /crunchyroll/, nombre: 'Crunchyroll', cat: 'servicios', clase: 'suscripcion' },
  { m: /mubi|deezer|tidal|audible/, nombre: 'Streaming', cat: 'servicios', clase: 'suscripcion' },
  { m: /youtube/, nombre: 'YouTube Premium', cat: 'servicios', clase: 'suscripcion' },
  { m: /apple\.com|itunes|icloud|apple music/, nombre: 'Apple', cat: 'servicios', clase: 'suscripcion' },
  { m: /google ?one|google ?storage|google ?\*/, nombre: 'Google One', cat: 'servicios', clase: 'suscripcion' },
  { m: /openai|chatgpt/, nombre: 'ChatGPT', cat: 'servicios', clase: 'suscripcion' },
  { m: /anthropic|claude/, nombre: 'Claude', cat: 'servicios', clase: 'suscripcion' },
  { m: /adobe/, nombre: 'Adobe', cat: 'servicios', clase: 'suscripcion' },
  { m: /microsoft|office ?365/, nombre: 'Microsoft 365', cat: 'servicios', clase: 'suscripcion' },
  { m: /dropbox|notion|figma|canva|github|vercel|cursor/, nombre: 'Software', cat: 'servicios', clase: 'suscripcion' },
  { m: /duolingo|coursera|udemy|platzi/, nombre: 'Cursos', cat: 'servicios', clase: 'suscripcion' },
  { m: /patreon|substack/, nombre: 'Suscripción', cat: 'servicios', clase: 'suscripcion' },

  // Juegos: son compras sueltas, no abonos (Steam cobra cada vez que comprás).
  { m: /steam|playstation|nintendo|xbox|epic ?games/, nombre: 'Juegos', cat: 'salidas', clase: 'variable' },

  // ---- Telefonía, internet y cable: fijo mensual ----
  { m: /persflow|personal ?flow|\bflow\b/, nombre: 'Personal Flow', cat: 'servicios', clase: 'fijo' },
  { m: /telecentro|fibertel|cablevision|iplan|starlink/, nombre: 'Internet', cat: 'servicios', clase: 'fijo' },
  { m: /movistar|claro |telecom|directv/, nombre: 'Telefonía', cat: 'servicios', clase: 'fijo' },

  // ---- Servicios del hogar: fijo ----
  { m: /edesur|edenor|metrogas|camuzzi|naturgy|aysa|aguas argentinas|\babl\b/, nombre: 'Servicios', cat: 'casa', clase: 'fijo' },
  { m: /expensas|consorcio/, nombre: 'Expensas', cat: 'casa', clase: 'fijo' },
  { m: /alquiler/, nombre: 'Alquiler', cat: 'casa', clase: 'fijo' },
  { m: /seguro|zurich|allianz|sancor seguros|la caja/, nombre: 'Seguro', cat: 'casa', clase: 'fijo' },

  // ---- Salud ----
  { m: /osde|swiss medical|galeno|medife|omint|sancor salud|prepaga/, nombre: 'Prepaga', cat: 'salud', clase: 'fijo' },
  { m: /farmacity|farmaplus|farmacia|dr ?ahorro|simplicity/, nombre: 'Farmacia', cat: 'salud', clase: 'variable' },
  { m: /laboratorio|optica|dentista|odonto/, nombre: 'Salud', cat: 'salud', clase: 'variable' },
  { m: /sportclub|megatlon|gimnasio|\bgym\b/, nombre: 'Gimnasio', cat: 'salud', clase: 'fijo' },

  // ---- Educación ----
  { m: /uade|universidad|\bucema\b|\butn\b|\buba\b|colegio|instituto/, nombre: 'Facultad', cat: 'otros', clase: 'fijo' },

  // ---- Supermercados ----
  { m: /coto|carrefour|jumbo|disco|\bvea\b|\bdia\b|changomas|chango mas|walmart|makro|la anonima|maxiconsumo|diarco|libertad/, nombre: 'Súper', cat: 'super', clase: 'variable' },
  { m: /\bmarket\b|\bsuper\b|hipermercado|autoservicio|almacen|granja|verduleria|carniceria|fiambreria/, nombre: 'Súper', cat: 'super', clase: 'variable' },
  // Los de tu barrio, que ningún catálogo genérico va a conocer
  { m: /kskagro|olazabal/, nombre: 'Súper', cat: 'super', clase: 'variable' },
  { m: /\bmeli\b|mercado ?libre/, nombre: 'Mercado Libre', cat: 'otros', clase: 'variable' },

  // ---- Comida afuera y delivery ----
  // `hormiga: true` marca lo que se compra sin pensar. Individualmente no
  // significan nada; juntos son el agujero más grande de cualquier mes.
  { m: /open ?25|kiosco|maxikiosco|maxi ?kiosco|drugstore/, nombre: 'Kiosco', cat: 'comida', clase: 'variable', hormiga: true },
  { m: /rappi|pedidos ?ya|uber ?eats|glovo/, nombre: 'Delivery', cat: 'comida', clase: 'variable', hormiga: true },
  { m: /mc ?donald|burger king|\bbk\b|mostaza|wendy|subway|kfc/, nombre: 'Comida rápida', cat: 'comida', clase: 'variable', hormiga: true },
  { m: /starbucks|\bsbux\b|havanna|the coffee|cafe|coffee|panaderia|confiteria|portanegra/, nombre: 'Café', cat: 'comida', clase: 'variable', hormiga: true },
  { m: /pizza|sushi|parrilla|resto|bodegon|cerveceria|green eat|empanada|heladeria|grido|freddo|helados|\bmooi\b/, nombre: 'Restaurante', cat: 'comida', clase: 'variable' },

  // ---- Transporte ----
  { m: /\buber\b/, nombre: 'Uber', cat: 'transporte', clase: 'variable' },
  { m: /\bdidi\b|cabify|\btaxi\b|remis/, nombre: 'Viaje', cat: 'transporte', clase: 'variable' },
  { m: /\bsube\b|subte|\bpeaje\b|autopista|\bausa\b|telepase/, nombre: 'Transporte', cat: 'transporte', clase: 'variable' },
  { m: /\bypf\b|shell|axion|puma energia|estacion de servicio|combustible/, nombre: 'Nafta', cat: 'transporte', clase: 'variable' },
  { m: /estacionamiento|cochera|parking/, nombre: 'Cochera', cat: 'transporte', clase: 'fijo' },

  // ---- Salidas ----
  { m: /hoyts|cinemark|cinepolis|showcase|village|atlas cines|\bcine\b/, nombre: 'Cine', cat: 'salidas', clase: 'variable' },
  { m: /teatro|ticketek|plateanet|passline|entrada/, nombre: 'Entradas', cat: 'salidas', clase: 'variable' },

  // ---- Casa ----
  { m: /easy|sodimac|ferreteria|sanitarios|pinturería|pinturas/, nombre: 'Ferretería', cat: 'casa', clase: 'variable' },
];

/**
 * Qué es este gasto, según su descripción.
 * Devuelve null cuando no lo reconoce: preferimos no decir nada antes que
 * decir cualquier cosa.
 */
export function clasificar(descripcion) {
  const texto = limpiarDescripcion(descripcion);
  if (texto.length < 3) return null;
  const hit = COMERCIOS.find((c) => c.m.test(texto));
  return hit ? { ...hit, texto } : null;
}

/** Categoría sugerida, o null. */
export const categoriaDe = (descripcion) => clasificar(descripcion)?.cat ?? null;

/** Compra de impulso: kiosco, café, delivery, comida rápida. */
export const esHormiga = (descripcion) => clasificar(descripcion)?.hormiga === true;

/** ¿Es algo que se repite todos los meses? 'suscripcion' | 'fijo' | null */
export function claseRecurrente(descripcion) {
  const c = clasificar(descripcion);
  return c && c.clase !== 'variable' ? c.clase : null;
}
