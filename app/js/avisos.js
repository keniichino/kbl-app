// ====== Avisos ======
// Tres canales, de más confiable a menos:
//
// 1. BANDEJA en el Panel — siempre funciona, no pide permiso, no depende de
//    nada. Es la fuente de verdad de las alertas.
// 2. NOTIFICACIÓN DEL SISTEMA al abrir la app o volver al frente — pide
//    permiso una vez. En iPhone SOLO funciona si la app está instalada en la
//    pantalla de inicio (Safari no da permiso a una pestaña común).
// 3. PUSH con la app cerrada — necesita un emisor corriendo en un servidor
//    (VAPID + web-push). El service worker ya sabe recibirlo; falta el que lo
//    mande. Ver TAREAS.md.
//
// Anti-spam: sólo alertas de nivel alto, máximo 2 por tanda, nunca dos veces
// la misma, y con 8 horas de piso entre tandas. Una app que notifica de más
// termina silenciada, y ahí perdés también las que importaban.

const CLAVE = 'kbl.avisos';
const PISO_MS = 8 * 60 * 60 * 1000;
const MAX_POR_TANDA = 2;

function estado() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || { enviados: {}, ultimo: 0 }; }
  catch { return { enviados: {}, ultimo: 0 }; }
}
function guardar(e) {
  localStorage.setItem(CLAVE, JSON.stringify(e));
}

/** 'no-soportado' | 'default' | 'granted' | 'denied' */
export function permiso() {
  if (!('Notification' in window)) return 'no-soportado';
  return Notification.permission;
}

/** En iOS, sin instalar en la pantalla de inicio no hay notificaciones. */
export function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Texto honesto sobre qué va a pasar si activa los avisos. */
export function explicacion() {
  const p = permiso();
  if (p === 'no-soportado') return 'Este navegador no soporta notificaciones.';
  if (p === 'denied') return 'Bloqueaste los avisos. Se habilitan desde los ajustes del navegador.';
  if (esIOS() && !estaInstalada()) {
    return 'En iPhone hay que instalar la app primero: Compartir → “Agregar a pantalla de inicio”, y activarlo desde ahí.';
  }
  if (p === 'granted') return 'Activados. Te avisa al abrir la app cuando hay algo importante.';
  return 'Te avisa al abrir la app cuando aparece algo importante.';
}

export async function pedirPermiso() {
  if (!('Notification' in window)) return 'no-soportado';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Muestra las alertas nuevas que valgan una interrupción.
 * Devuelve cuántas mostró (0 es lo normal la mayoría de las veces).
 */
export async function notificar(alertas) {
  if (permiso() !== 'granted') return 0;

  const e = estado();
  if (Date.now() - (e.ultimo || 0) < PISO_MS) return 0;

  const nuevas = alertas
    .filter((a) => a.nivel === 'alta' && !e.enviados[a.id])
    .slice(0, MAX_POR_TANDA);
  if (!nuevas.length) return 0;

  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  for (const a of nuevas) {
    const cuerpo = a.detalle.replace(/<[^>]+>/g, '');
    const opciones = {
      body: cuerpo,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: a.id,                       // reemplaza en vez de apilar
      data: { vista: 'panel' },
    };
    if (reg) await reg.showNotification(`${a.icono} ${a.titulo}`, opciones);
    else new Notification(`${a.icono} ${a.titulo}`, opciones);
    e.enviados[a.id] = Date.now();
  }

  // Los enviados viejos no sirven de nada y engordan el localStorage.
  const limite = Date.now() - 90 * 86400000;
  for (const [id, ts] of Object.entries(e.enviados)) if (ts < limite) delete e.enviados[id];

  e.ultimo = Date.now();
  guardar(e);
  return nuevas.length;
}
