// ====== Motor de detecciones ======
// Mira los datos y avisa lo que un contador te marcaría solo: "esto parece una
// suscripción y no la tenés declarada", "el alquiler subió 12%", "el martes
// gastaste tres veces tu día normal", "el resumen vence en 4 días".
//
// Regla de diseño: PRECISIÓN antes que recall. Una alerta falsa gasta más
// confianza de la que gana una alerta cierta, y cuando el panel miente una vez
// dejás de mirarlo. Por eso cada regla tiene guardas explícitas y prefiere
// callarse ante la duda.

import {
  norm, addMes, MES_HOY, hoyIso, labelMes, labelDia, diasEntre, pad2,
  fmtARS, fmtMoneda, fmtCorto, pct, variacion,
  montoEn, vigenteEn, masMontos, cero, deudaPendiente, TARJETAS_CREDITO, medioDe,
  cuotasVencidasSinPagar, ritmoDisponible, historialCompleto, pendientesDeReintegro,
  hitosDeAumento,
} from './fincore.js';
import { aPesos } from './cotizacion.js';
import { clasificar, claseRecurrente, categoriaDe } from './catalogo.js';

// USD sin cotización se cuenta como 0 en vez de como pesos: preferimos no
// disparar una alerta antes que dispararla con un número inventado.
const eq = (monto, moneda) => (moneda === 'USD' ? (aPesos(monto) || 0) : monto);
const eqv = (v) => v.ars + (aPesos(v.usd) || 0);

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const moda = (xs) => {
  const cuenta = new Map();
  for (const x of xs) cuenta.set(x, (cuenta.get(x) || 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const NIVELES = { alta: 0, media: 1, info: 2 };

// Para nombrar un gasto que se cargó sin descripción.
const CATEGORIAS = {
  comida: 'Comida', super: 'Súper', transporte: 'Transporte', salidas: 'Salidas',
  casa: 'Casa', salud: 'Salud', otros: 'Un gasto',
};

// ---------- Reglas ----------

/**
 * Suscripciones y fijos que están en los gastos pero no declarados.
 * Guardas: 3+ meses distintos, presente en 3 de los últimos 4, montos estables
 * (±35% de la mediana) y todavía vivo (cobro en los últimos 2 meses).
 */
function conceptosNoDeclarados(ctx, ingreso) {
  const grupos = new Map();
  for (const g of ctx.gastos) {
    if (ctx.match.has(g.id)) continue;           // ya está declarado
    const k = norm(g.descripcion);
    if (k.length < 3) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(g);
  }

  const ultimos4 = [3, 2, 1, 0].map((i) => addMes(MES_HOY, -i));
  const alertas = [];

  for (const [clave, gs] of grupos) {
    // Si el catálogo ya lo reconoce, avisa la otra regla (y mejor: sabe el
    // nombre real y no necesita esperar tres meses).
    if (claseRecurrente(gs[0].descripcion)) continue;
    const meses = [...new Set(gs.map((g) => g.fecha.slice(0, 7)))].sort();
    if (meses.length < 3) continue;
    if (meses.at(-1) < addMes(MES_HOY, -1)) continue;              // ya no se cobra
    if (ultimos4.filter((m) => meses.includes(m)).length < 3) continue; // no es regular
    // Un abono se cobra UNA vez por mes. El súper también aparece todos los
    // meses, pero seis veces cada uno: eso no es una suscripción.
    if (gs.length > meses.length * 1.4) continue;

    // Una sola moneda por concepto; si mezcla, no es una suscripción.
    const monedas = new Set(gs.map((g) => g.moneda || 'ARS'));
    if (monedas.size > 1) continue;
    const moneda = [...monedas][0];

    const montos = gs.map((g) => g.monto);
    const med = mediana(montos);
    if (!med) continue;
    const estables = montos.filter((m) => Math.abs(m - med) <= med * 0.35).length;
    if (estables < montos.length - 1) continue;                    // monto errático

    const ultimo = gs.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const dia = moda(gs.map((g) => Number(g.fecha.slice(8, 10))));
    const medio = moda(gs.map((g) => g.tarjeta).filter(Boolean));
    // Chico y parejo = suscripción; grande = gasto fijo de estructura.
    // Doble techo a propósito: con un sueldo alto, el 4% igual puede ser
    // mucha plata para llamarlo "suscripción".
    const enArs = eq(med, moneda);
    const esSub = enArs <= Math.min(ingreso ? ingreso * 0.04 : Infinity, 90000);

    alertas.push({
      id: `detect:${clave}`,
      tipo: esSub ? 'suscripcion-detectada' : 'fijo-detectado',
      nivel: 'media',
      icono: esSub ? '🔁' : '🏠',
      titulo: esSub ? 'Parece una suscripción' : 'Parece un gasto fijo',
      detalle: `<b>${ultimo.descripcion}</b> se repite hace ${meses.length} meses por ${fmtMoneda(med, moneda)}${dia ? `, siempre cerca del ${dia}` : ''}. No lo tenés declarado, así que no entra en tu costo fijo.`,
      accion: {
        tipo: 'crear-recurrente',
        label: esSub ? 'Agregar como suscripción' : 'Agregar como gasto fijo',
        datos: {
          tipo: esSub ? 'suscripcion' : 'fijo',
          nombre: ultimo.descripcion,
          monto: ultimo.monto,
          moneda,
          dia,
          medio,
          coincide: clave,
        },
      },
      peso: enArs * 12,
    });
  }
  return alertas;
}

/**
 * Suscripciones y servicios que el catálogo reconoce por nombre.
 * A diferencia de la regla estadística, esta no necesita tres meses de
 * historia: Netflix es una suscripción la primera vez que aparece.
 */
function conocidosNoDeclarados(ctx) {
  const vistos = new Map();
  for (const g of ctx.gastos) {
    if (ctx.match.has(g.id)) continue;                 // ya declarado
    if (diasEntre(g.fecha, hoyIso()) > 75) continue;   // viejo: puede estar dado de baja
    const clase = claseRecurrente(g.descripcion);
    if (!clase) continue;
    const hit = clasificar(g.descripcion);
    const clave = hit.nombre;
    // Nos quedamos con el cargo más reciente de cada servicio.
    if (!vistos.has(clave) || vistos.get(clave).g.fecha < g.fecha) vistos.set(clave, { g, hit, clase });
  }

  return [...vistos.values()].map(({ g, hit, clase }) => ({
    id: `conocido:${hit.texto}`,
    tipo: 'conocido-no-declarado',
    nivel: 'alta',
    icono: clase === 'suscripcion' ? '🔁' : '🏠',
    titulo: `${hit.nombre} es ${clase === 'suscripcion' ? 'una suscripción' : 'un gasto fijo'}`,
    detalle: `Te lo cobraron ${fmtMoneda(g.monto, g.moneda)} el ${g.fecha.slice(8)}/${g.fecha.slice(5, 7)}${
      hit.texto !== norm(hit.nombre) ? ` (aparece como "${g.descripcion}")` : ''
    }. Si lo declarás, entra en tu costo fijo y el panel te avisa cuando aumente.`,
    accion: {
      tipo: 'crear-recurrente',
      label: `Agregar ${hit.nombre}`,
      datos: {
        tipo: clase,
        nombre: hit.nombre,
        monto: g.monto,
        moneda: g.moneda || 'ARS',
        dia: Number(g.fecha.slice(8, 10)),
        medio: g.tarjeta || null,
        coincide: hit.texto,
      },
    },
    peso: eq(g.monto, g.moneda) * 12,
  }));
}

/**
 * Gastos cuya categoría no coincide con la que el catálogo reconoce.
 * Va como una sola alerta con arreglo masivo: veinte alertas de una letra
 * cada una serían insoportables.
 */
function categoriasFlojas(ctx) {
  const arreglos = [];
  for (const g of ctx.gastos) {
    const cat = categoriaDe(g.descripcion);
    if (!cat || cat === g.categoria) continue;
    // Sólo corregimos lo que quedó en el cajón de sastre: si le pusiste una
    // categoría a propósito, no te la tocamos.
    if (g.categoria !== 'otros') continue;
    arreglos.push({ id: g.id, categoria: cat, desc: g.descripcion });
  }
  if (!arreglos.length) return [];

  const ejemplos = arreglos.slice(0, 3).map((a) => a.desc).join(', ');
  return [{
    id: `recat:${arreglos.length}:${arreglos[0].id}`,
    tipo: 'recategorizar',
    nivel: 'info',
    icono: '🏷️',
    titulo: `Puedo acomodar ${arreglos.length} categoría${arreglos.length > 1 ? 's' : ''}`,
    detalle: `${arreglos.length} gasto${arreglos.length > 1 ? 's están' : ' está'} en "Otros" pero sé de qué son: ${ejemplos}${arreglos.length > 3 ? '…' : ''}.`,
    accion: { tipo: 'recategorizar', label: 'Acomodarlas', datos: { arreglos } },
    peso: arreglos.length,
  }];
}

/**
 * Gastos hormiga: compras chicas que sueltas no significan nada y juntas se
 * comen medio sueldo. Ventana móvil de 30 días (no mes calendario) para que
 * sirva el día 3 igual que el 28.
 *
 * Quedan afuera súper, casa y salud: son necesidades, no impulso. El punto no
 * es que gastes poco, es que veas lo que no estás viendo.
 */
function hormiga(ctx, ingreso) {
  const hoy = hoyIso();
  const techo = ingreso ? ingreso * 0.015 : 30000;
  const chicos = ctx.gastos.filter((g) => {
    const d = diasEntre(g.fecha, hoy);
    if (d < 0 || d > 30) return false;
    if (ctx.match.has(g.id)) return false;
    if (['super', 'casa', 'salud'].includes(g.categoria)) return false;
    const m = eq(g.monto, g.moneda);
    return m >= 800 && m <= techo;
  });
  if (chicos.length < 6) return [];

  const total = chicos.reduce((a, g) => a + eq(g.monto, g.moneda), 0);
  if (ingreso && total < ingreso * 0.02) return [];      // ruido, no vale la pena

  const nombres = chicos.map((g) => clasificar(g.descripcion)?.nombre).filter(Boolean);
  const repetido = moda(nombres);
  const cuantos = nombres.filter((n) => n === repetido).length;

  return [{
    id: `hormiga:${MES_HOY}`,
    tipo: 'hormiga',
    nivel: ingreso && total > ingreso * 0.08 ? 'media' : 'info',
    icono: '🐜',
    titulo: `${chicos.length} compras chicas: ${fmtCorto(total)}`,
    detalle: `En los últimos 30 días, de a ${fmtARS.format(total / chicos.length)} promedio.
      ${repetido && cuantos > 2 ? `Lo que más se repite: ${repetido} (${cuantos} veces). ` : ''}
      ${ingreso ? `Es ${pct(total / ingreso)} de tu ingreso; ` : ''}al año son <b>${fmtARS.format(total * 12)}</b>.`,
    accion: { tipo: 'ir', vista: 'gastos', label: 'Ver los gastos' },
    peso: total,
  }];
}

/** Conceptos declarados que aumentaron respecto del mes pasado. */
function aumentos(ctx) {
  const mesAnt = addMes(MES_HOY, -1);
  const out = [];
  for (const r of ctx.recurrentes) {
    if (r.tipo === 'ingreso' || !vigenteEn(r, MES_HOY, ctx) || !vigenteEn(r, mesAnt, ctx)) continue;
    const hoy = montoEn(r, MES_HOY, ctx);
    const antes = montoEn(r, mesAnt, ctx);
    if (!antes || !hoy) continue;
    const p = (hoy - antes) / antes;
    if (p < 0.08) continue;
    out.push({
      id: `aumento:${r.id}:${MES_HOY}`,
      tipo: 'aumento',
      nivel: p >= 0.25 ? 'alta' : 'media',
      icono: '📈',
      titulo: `${r.nombre} aumentó ${variacion(hoy, antes)}`,
      detalle: `Pasó de ${fmtMoneda(antes, r.moneda)} a <b>${fmtMoneda(hoy, r.moneda)}</b>. Son ${fmtARS.format(eq(hoy - antes, r.moneda) * 12)} más por año.`,
      accion: null,
      peso: eq(hoy - antes, r.moneda) * 12,
    });
  }
  return out;
}

/** Días muy por encima de tu día normal, dentro de la última semana. */
function diasCaros(ctx) {
  const hoy = hoyIso();
  const porDia = new Map();
  for (const g of ctx.gastos) {
    // Los conceptos declarados quedan afuera: el alquiler hace "caro" al día 10
    // de todos los meses y avisarlo no le sirve a nadie.
    if (ctx.match.has(g.id)) continue;
    if (diasEntre(g.fecha, hoy) > 90 || diasEntre(g.fecha, hoy) < 0) continue;
    if (!porDia.has(g.fecha)) porDia.set(g.fecha, { total: 0, n: 0, gastos: [] });
    const d = porDia.get(g.fecha);
    d.total += eq(g.monto, g.moneda);
    d.n++;
    d.gastos.push(g);
  }
  if (porDia.size < 6) return [];                     // sin base de comparación

  const base = mediana([...porDia.values()].map((d) => d.total));
  if (!base) return [];

  return [...porDia.entries()]
    .filter(([fecha, d]) => {
      const dias = diasEntre(fecha, hoy);
      if (dias > 7 || dias < 0) return false;
      return (d.total >= base * 2.5 && d.total >= 25000) || d.n >= 5;
    })
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 2)
    .map(([fecha, d]) => {
      const mayor = d.gastos.sort((a, b) => eq(b.monto, b.moneda) - eq(a.monto, a.moneda))[0];
      const queEs = mayor.descripcion || CATEGORIAS[mayor.categoria] || 'Un gasto';
      const solo = d.n === 1;
      return {
        id: `diacaro:${fecha}`,
        tipo: 'dia-caro',
        nivel: 'media',
        icono: solo ? '💥' : '🔥',
        titulo: solo ? `Gasto grande ${labelDia(fecha)}` : `Día caro: ${labelDia(fecha)}`,
        detalle: solo
          ? `<b>${queEs}</b> por ${fmtARS.format(d.total)}, cuando un día normal tuyo son ${fmtARS.format(base)}.`
          : `${d.n} movimientos por <b>${fmtARS.format(d.total)}</b>, contra ${fmtARS.format(base)} de un día normal tuyo. Lo más grande: ${queEs.toLowerCase()}.`,
        accion: { tipo: 'ir', vista: 'gastos', label: 'Ver los gastos' },
        peso: d.total,
      };
    });
}

/** Ritmo del mes contra el mismo tramo del mes pasado. */
function ritmoDelMes(ctx) {
  const hoy = new Date();
  const dia = hoy.getDate();
  if (dia < 6) return [];                             // muy temprano para comparar

  const acumHasta = (mes, tope) => (ctx.gastosPorMes.get(mes) || [])
    .filter((g) => Number(g.fecha.slice(8, 10)) <= tope && !ctx.match.has(g.id))
    .reduce((a, g) => a + eq(g.monto, g.moneda), 0);

  const ahora = acumHasta(MES_HOY, dia);
  const antes = acumHasta(addMes(MES_HOY, -1), dia);
  if (!antes || !ahora) return [];
  const p = (ahora - antes) / antes;
  if (Math.abs(p) < 0.25) return [];

  const rapido = p > 0;
  return [{
    id: `ritmo:${MES_HOY}:${rapido ? 'alto' : 'bajo'}:${Math.floor(dia / 7)}`,
    tipo: 'ritmo',
    nivel: rapido ? (p > 0.6 ? 'alta' : 'media') : 'info',
    icono: rapido ? '🚀' : '🐢',
    titulo: rapido ? `Vas ${variacion(ahora, antes)} más rápido que el mes pasado` : `Vas ${variacion(ahora, antes)} más tranquilo que el mes pasado`,
    detalle: `Al día ${dia} llevás <b>${fmtARS.format(ahora)}</b> en gastos variables. El mes pasado, a esta misma altura, ${fmtARS.format(antes)}.`,
    accion: null,
    peso: Math.abs(ahora - antes),
  }];
}

/** Mismo importe, misma descripción, con pocos días de diferencia. */
function duplicados(ctx) {
  const hoy = hoyIso();
  const recientes = ctx.gastos
    .filter((g) => diasEntre(g.fecha, hoy) <= 45 && diasEntre(g.fecha, hoy) >= 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const out = [];
  for (let i = 0; i < recientes.length; i++) {
    for (let j = i + 1; j < recientes.length; j++) {
      const a = recientes[i], b = recientes[j];
      const dif = diasEntre(a.fecha, b.fecha);
      if (dif > 3) break;
      if ((a.moneda || 'ARS') !== (b.moneda || 'ARS')) continue;
      if (Math.abs(a.monto - b.monto) > a.monto * 0.01) continue;
      const da = norm(a.descripcion), db = norm(b.descripcion);
      if (!da || da !== db) continue;
      out.push({
        id: `dup:${[a.id, b.id].sort().join(':')}`,
        tipo: 'duplicado',
        nivel: 'media',
        icono: '👯',
        titulo: 'Posible cargo duplicado',
        detalle: `<b>${a.descripcion}</b> por ${fmtMoneda(a.monto, a.moneda)} aparece dos veces, ${dif === 0 ? 'el mismo día' : `con ${dif} día${dif > 1 ? 's' : ''} de diferencia`} (${a.fecha.slice(8)}/${a.fecha.slice(5, 7)} y ${b.fecha.slice(8)}/${b.fecha.slice(5, 7)}).`,
        accion: { tipo: 'ir', vista: 'gastos', label: 'Revisar en Gastos' },
        peso: eq(a.monto, a.moneda),
      });
    }
  }
  return out.slice(0, 3);
}

/** Vencimiento de resumen cerca, por tarjeta. */
function vencimientos(ctx) {
  const hoy = new Date();
  const hoyStr = hoyIso();
  const porTarjeta = new Map();
  for (const c of ctx.cuotas) {
    if (c.estado !== 'activa' || !TARJETAS_CREDITO.has(c.tarjeta)) continue;
    const dia = Number(c.fecha_primer_venc.slice(8, 10));
    if (!porTarjeta.has(c.tarjeta)) porTarjeta.set(c.tarjeta, dia);
  }

  const out = [];
  for (const [tarjeta, dia] of porTarjeta) {
    // Próxima ocurrencia de ese día: este mes si no pasó, si no el que viene.
    let venc = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
    if (venc.getDate() < hoy.getDate()) venc = new Date(hoy.getFullYear(), hoy.getMonth() + 1, dia);
    const iso = `${venc.getFullYear()}-${pad2(venc.getMonth() + 1)}-${pad2(venc.getDate())}`;
    const faltan = diasEntre(hoyStr, iso);
    if (faltan > 6 || faltan < 0) continue;

    const total = cero();
    // Sólo lo que falta pagar: avisar por un resumen ya cobrado es ruido.
    const items = (ctx.calCuotas.get(iso.slice(0, 7))?.items || [])
      .filter((i) => i.tarjeta === tarjeta && !i.pagada);
    for (const i of items) (i.moneda === 'USD' ? (total.usd += i.monto) : (total.ars += i.monto));
    if (!eqv(total)) continue;

    out.push({
      id: `venc:${tarjeta}:${iso}`,
      tipo: 'vencimiento',
      nivel: faltan <= 3 ? 'alta' : 'media',
      icono: '⏰',
      titulo: faltan === 0
        ? `Hoy vence ${medioDe(tarjeta)?.label || tarjeta}`
        : `${medioDe(tarjeta)?.label || tarjeta} vence en ${faltan} día${faltan > 1 ? 's' : ''}`,
      detalle: `El ${dia} tenés que pagar <b>${fmtARS.format(total.ars)}</b>${total.usd ? ` + US$ ${total.usd.toFixed(2)}` : ''} de cuotas.`,
      accion: { tipo: 'ir', vista: 'cuotas', label: 'Ver cuotas' },
      peso: eqv(total),
    });
  }
  return out;
}

/**
 * Fijos que solés cargar y este mes todavía no aparecen (o dejaron de
 * aparecer hace rato). Sólo se dispara para conceptos que YA venías cargando:
 * si nunca los registraste como gasto, el silencio no significa nada.
 */
function faltantes(ctx) {
  const hoy = new Date();
  const out = [];
  for (const r of ctx.recurrentes) {
    if (r.tipo === 'ingreso' || r.estado !== 'activo') continue;
    const cargadoEn = (mes) => (ctx.gastosPorMes.get(mes) || []).some((g) => ctx.match.get(g.id) === r.id);
    const previos = [1, 2, 3].map((i) => addMes(MES_HOY, -i));
    const historialReal = previos.filter(cargadoEn).length;
    if (historialReal < 2) continue;                  // no es un concepto que registres
    if (cargadoEn(MES_HOY)) continue;

    const mesesSinVer = previos.findIndex(cargadoEn);  // 0 = el mes pasado sí
    if (mesesSinVer > 0) {
      out.push({
        id: `fantasma:${r.id}:${MES_HOY}`,
        tipo: 'fantasma',
        nivel: 'media',
        icono: '👻',
        titulo: `¿Seguís pagando ${r.nombre}?`,
        detalle: `No aparece cobrado desde ${labelMes(previos[mesesSinVer])}, pero sigue contando ${fmtMoneda(montoEn(r, MES_HOY, ctx), r.moneda)} por mes en tu costo fijo.`,
        accion: null,
        peso: eq(montoEn(r, MES_HOY, ctx), r.moneda) * 6,
      });
      continue;
    }
    if (r.dia && hoy.getDate() > r.dia + 2) {
      out.push({
        id: `impago:${r.id}:${MES_HOY}`,
        tipo: 'impago',
        nivel: 'info',
        icono: '📌',
        titulo: `${r.nombre} todavía no está cargado`,
        detalle: `Vencía el ${r.dia} y este mes no lo veo en Gastos. Si ya lo pagaste, cargalo para que el mes cierre bien.`,
        accion: { tipo: 'ir', vista: 'gastos', label: 'Cargarlo' },
        peso: eq(montoEn(r, MES_HOY, ctx), r.moneda),
      });
    }
  }
  return out;
}

/** Cuánto del ingreso ya está comprometido antes de gastar nada. */
function techo(foto, ctx) {
  const ing = eqv(foto.ingresos);
  if (!ing) return [];
  // Va la estructura ENTERA: lo que se paga con tarjeta vive en `gastos`, no
  // en `cuotas`, así que no hay duplicación que evitar. (El 101% famoso venía
  // de cuando cada consumo tenía además una cuota 1/1 espejo; esas cuotas ya
  // no existen.)
  const comp = eqv(masMontos(foto.estructuralTotal, foto.cuotas));
  const p = comp / ing;
  if (p < 0.7) return [];
  return [{
    id: `techo:${MES_HOY}`,
    tipo: 'techo',
    nivel: p >= 0.9 ? 'alta' : 'media',
    icono: '⚠️',
    titulo: `Tenés comprometido el ${pct(p)} del ingreso`,
    detalle: `Entre fijos, suscripciones y cuotas se van <b>${fmtARS.format(comp)}</b> de ${fmtARS.format(ing)} antes de comprar un café. Te quedan ${fmtARS.format(ing - comp)} para todo lo demás.`,
    accion: null,
    peso: comp,
  }];
}

/** El mes cierra en rojo con lo que ya está gastado. */
function rojo(foto) {
  const ing = eqv(foto.ingresos);
  if (!ing) return [];
  const gasto = eqv(foto.egresoCaja);
  if (gasto <= ing) return [];
  return [{
    id: `rojo:${MES_HOY}`,
    tipo: 'rojo',
    nivel: 'alta',
    icono: '🩸',
    titulo: `Este mes te faltan ${fmtCorto(gasto - ing)}`,
    detalle: `Vas ${fmtARS.format(gasto)} de salidas contra ${fmtARS.format(ing)} de ingreso. La diferencia sale de tus ahorros o de la tarjeta del mes que viene.`,
    accion: null,
    peso: gasto - ing,
  }];
}

/** Deuda en cuotas comparada con un mes de ingreso. */
function deudaAlta(ctx, foto) {
  const ing = eqv(foto.ingresos);
  if (!ing) return [];
  const saldo = eqv(deudaPendiente(MES_HOY, ctx.calCuotas));
  if (saldo < ing * 1.5) return [];
  return [{
    id: `deuda:${MES_HOY}`,
    tipo: 'deuda',
    nivel: 'media',
    icono: '💳',
    titulo: `Debés ${(saldo / ing).toFixed(1).replace('.', ',')} sueldos en cuotas`,
    detalle: `Te queda un saldo de <b>${fmtARS.format(saldo)}</b> por pagar. No es urgente, pero cada compra nueva en cuotas se suma a eso.`,
    accion: { tipo: 'ir', vista: 'cuotas', label: 'Ver el detalle' },
    peso: saldo,
  }];
}

// ---------- Reglas de contador ----------
// Lo que arriba mira el detalle ("este gasto es raro"), acá se mira la
// estructura: si el mes cierra, si podés sostener el nivel de vida, cuánto
// margen real te queda y si los números que muestra la app son confiables.

/**
 * Cuotas cuyo vencimiento pasó y siguen sin marcarse como pagadas. Va primero
 * de todo y a propósito: mientras estén así, el saldo de deuda está inflado y
 * TODOS los demás números del panel salen mal. Una app que miente sobre esto
 * es peor que no tener app.
 */
function vencidasSinMarcar(ctx) {
  const vencidas = cuotasVencidasSinPagar(ctx.cuotas, ctx.medios || []);
  if (!vencidas.length) return [];

  const porTarjeta = new Map();
  for (const v of vencidas) {
    const k = v.cuota.tarjeta;
    if (!porTarjeta.has(k)) porTarjeta.set(k, { items: [], dias: v.diasPasados });
    porTarjeta.get(k).items.push(v.cuota);
    porTarjeta.get(k).dias = Math.max(porTarjeta.get(k).dias, v.diasPasados);
  }

  return [...porTarjeta.entries()].map(([tarjeta, g]) => {
    const total = g.items.reduce((a, c) => a + eq(c.monto_cuota, c.moneda), 0);
    const nombre = (ctx.medios || []).find((m) => m.key === tarjeta)?.nombre
      || medioDe(tarjeta)?.label || tarjeta;
    return {
      id: `vencida:${tarjeta}:${MES_HOY}`,
      tipo: 'vencida',
      nivel: 'alta',
      icono: '⏱',
      titulo: `${nombre} venció hace ${g.dias} día${g.dias > 1 ? 's' : ''}`,
      detalle: `${g.items.length} cuota${g.items.length > 1 ? 's' : ''} por <b>${fmtARS.format(total)}</b> siguen contando como deuda porque no marcaste el pago. Hasta que lo hagas, el saldo y la proyección están inflados.`,
      accion: { tipo: 'ir', vista: 'cuotas', label: 'Marcar el pago' },
      peso: total * 10,   // arriba de todo: corrompe el resto de los números
    };
  });
}

/**
 * Cuánto te queda por día hasta fin de mes. Es el número más accionable que
 * puede dar una app de gastos: no "gastaste mucho" sino "tenés $X por día".
 */
function presupuestoDiario(foto) {
  const r = ritmoDisponible(foto, eqv);
  if (!r) return [];
  const hoy = new Date().getDate();
  if (hoy < 3 || r.restan < 2) return [];          // muy temprano o muy tarde
  if (r.libre > eqv(foto.ingresos) * 0.5) return []; // holgado, no hay nada que avisar

  const enRojo = r.porDia <= 0;
  return [{
    id: `presu:${MES_HOY}:${Math.floor(hoy / 5)}`,   // se refresca cada 5 días
    tipo: 'presupuesto',
    nivel: enRojo ? 'alta' : r.porDia < r.gastadoPorDia * 0.6 ? 'media' : 'info',
    icono: enRojo ? '🛑' : '📐',
    titulo: enRojo
      ? `Te quedan ${fmtCorto(r.libre)} para ${r.restan} días`
      : `Podés gastar ${fmtARS.format(r.porDia)} por día`,
    detalle: enRojo
      ? `Ya comprometiste más de lo que entra. Lo que gastes de acá a fin de mes sale de ahorros o de la tarjeta del mes que viene.`
      : `Quedan <b>${fmtARS.format(r.libre)}</b> libres para ${r.restan} días. Venís gastando ${fmtARS.format(r.gastadoPorDia)} por día: ${
          r.gastadoPorDia > r.porDia
            ? `a ese ritmo te faltan ${fmtARS.format((r.gastadoPorDia - r.porDia) * r.restan)}.`
            : 'vas bien.'
        }`,
    accion: null,
    peso: Math.abs(r.libre),
  }];
}

/**
 * Tus fijos suben más rápido que tu ingreso. Es la fuga más cara y la más
 * silenciosa: no aparece en ningún gasto puntual, aparece recién cuando un
 * año después el sueldo no alcanza y no sabés por qué.
 */
function erosion(ctx) {
  const ingreso = ctx.recurrentes.find((r) => r.tipo === 'ingreso' && r.estado === 'activo');
  if (!ingreso) return [];
  const serieIng = historialCompleto(ingreso);
  if (serieIng.length < 4) return [];               // sin historia no hay tendencia

  const desde = serieIng[0].mes;
  const ingA = serieIng[0].monto, ingB = serieIng.at(-1).monto;
  if (!ingA || !ingB) return [];

  // Estructura en el primer y último mes con datos de ingreso.
  const estruct = (mes) => ctx.recurrentes
    .filter((r) => r.tipo !== 'ingreso' && vigenteEn(r, mes, ctx))
    .reduce((a, r) => a + eq(montoEn(r, mes, ctx), r.moneda), 0);
  const eA = estruct(desde), eB = estruct(serieIng.at(-1).mes);
  if (!eA || !eB) return [];

  const subeIng = (ingB - ingA) / ingA;
  const subeEst = (eB - eA) / eA;
  if (subeEst - subeIng < 0.10) return [];          // van parejos, no hay noticia

  const antes = eA / ingA, ahora = eB / ingB;
  return [{
    id: `erosion:${MES_HOY}`,
    tipo: 'erosion',
    nivel: ahora > 0.5 ? 'alta' : 'media',
    icono: '🩹',
    titulo: 'Tus fijos suben más rápido que tu sueldo',
    detalle: `Desde ${labelMes(desde)} el ingreso subió ${pct(subeIng)} y la estructura ${pct(subeEst)}. Tus fijos pasaron de comerse ${pct(antes)} del sueldo a <b>${pct(ahora)}</b>. Si sigue así, el año que viene el margen desaparece sin que gastes un peso de más.`,
    accion: null,
    peso: (eB - eA) * 12,
  }];
}

/**
 * Estás por el cierre de una tarjeta: lo que compres hoy contra mañana cambia
 * un mes entero de financiación gratis. Es el único consejo de timing que se
 * puede dar con certeza, porque el dato es la fecha de cierre, no un pronóstico.
 */
function cierreCerca(ctx) {
  const hoy = new Date();
  const dia = hoy.getDate();
  const out = [];
  for (const m of (ctx.medios || [])) {
    if (m.diaCierre == null) continue;
    const faltan = m.diaCierre - dia;
    if (faltan < 0 || faltan > 2) continue;
    const vence = m.diaVencimiento ?? null;
    out.push({
      id: `cierre:${m.key}:${MES_HOY}`,
      tipo: 'cierre',
      nivel: 'info',
      icono: '🗓',
      titulo: faltan === 0
        ? `Hoy cierra ${m.nombre}`
        : `${m.nombre} cierra en ${faltan} día${faltan > 1 ? 's' : ''}`,
      detalle: `Lo que compres hasta el ${m.diaCierre} entra en el resumen que ${
        vence ? `vence el ${vence} del mes que viene` : 'te llega ahora'
      }. Lo que compres después se paga un mes más tarde: si podés esperar, son 30 días de financiación gratis.`,
      accion: null,
      peso: 1,
    });
  }
  return out;
}

/** Sin colchón: cuánto aguantás si mañana se corta el ingreso. */
function colchon(ctx, foto) {
  const ing = eqv(foto.ingresos);
  if (!ing) return [];
  const stock = ctx.ahorros.reduce(
    (a, x) => a + eq(x.tipo === 'retiro' ? -x.monto : x.monto, x.moneda), 0);
  // Lo que sale del bolsillo por mes sí o sí: la estructura entera (pagues con
  // lo que pagues) más las cuotas que vencen.
  const costoMes = eqv(foto.estructuralTotal) + eqv(foto.cuotas);
  if (!costoMes) return [];
  const meses = stock / costoMes;
  if (meses >= 3) return [];

  return [{
    id: `colchon:${MES_HOY}`,
    tipo: 'colchon',
    nivel: meses < 1 ? 'alta' : 'media',
    icono: '🪂',
    titulo: meses < 0.5
      ? 'No tenés fondo de emergencia'
      : `Tu colchón aguanta ${meses.toFixed(1).replace('.', ',')} meses`,
    detalle: `Entre estructura y cuotas necesitás <b>${fmtARS.format(costoMes)}</b> por mes sí o sí. Con ${fmtARS.format(stock)} ahorrados, si mañana se corta el ingreso ${
      meses < 0.5 ? 'no llegás a fin de mes' : `llegás ${meses.toFixed(1).replace('.', ',')} meses`
    }. Lo estándar es tener 3 a 6.`,
    accion: null,
    peso: costoMes * 3,
  }];
}

/** Un solo comercio se lleva una porción grande del gasto variable. */
function concentracion(ctx, foto) {
  const delMes = (ctx.gastosPorMes.get(MES_HOY) || []).filter((g) => !ctx.match.has(g.id));
  if (delMes.length < 8) return [];
  const total = delMes.reduce((a, g) => a + eq(g.monto, g.moneda), 0);
  if (!total) return [];

  const porComercio = new Map();
  for (const g of delMes) {
    const nombre = clasificar(g.descripcion)?.nombre || g.descripcion || CATEGORIAS[g.categoria];
    if (!nombre) continue;
    const k = norm(nombre);
    if (!porComercio.has(k)) porComercio.set(k, { nombre, total: 0, n: 0 });
    const c = porComercio.get(k);
    c.total += eq(g.monto, g.moneda);
    c.n++;
  }
  const top = [...porComercio.values()].sort((a, b) => b.total - a.total)[0];
  if (!top || top.n < 3) return [];
  const p = top.total / total;
  if (p < 0.30) return [];

  return [{
    id: `concentra:${norm(top.nombre)}:${MES_HOY}`,
    tipo: 'concentracion',
    nivel: 'info',
    icono: '🎯',
    titulo: `${top.nombre} se lleva ${pct(p)} de tus gastos`,
    detalle: `${fmtARS.format(top.total)} en ${top.n} movimientos este mes. No está mal en sí — es dónde tenés más para negociar o recortar si necesitás bajar el gasto rápido.`,
    accion: { tipo: 'ir', vista: 'gastos', label: 'Ver los gastos' },
    peso: top.total,
  }];
}

/** Comisiones de inversión que se comen el capital. */
function costoDeInvertir(ctx) {
  const ops = (ctx.inversiones || []).filter((i) => i.tipo === 'compra' || i.tipo === 'venta');
  if (ops.length < 3) return [];
  const bruto = ops.reduce((a, i) => a + eq(i.cantidad * i.precio_unitario, i.moneda), 0);
  const costos = ops.reduce((a, i) => a + eq((i.comisiones || 0) + (i.gastos_op || 0), i.moneda), 0);
  if (!bruto) return [];
  const ratio = costos / bruto;
  if (ratio < 0.012) return [];

  return [{
    id: `costoinv:${MES_HOY}`,
    tipo: 'costo-inversion',
    nivel: ratio > 0.025 ? 'media' : 'info',
    icono: '✂️',
    titulo: `Operar te cuesta ${pct(ratio)} de lo que invertís`,
    detalle: `Llevás <b>${fmtARS.format(costos)}</b> en comisiones y gastos sobre ${fmtARS.format(bruto)} operados, en ${ops.length} operaciones. En órdenes chicas el costo fijo pesa el doble: conviene juntar y comprar de a montos más grandes.`,
    accion: null,
    peso: costos * 4,
  }];
}

/**
 * Tesis de inversión que pasaron su propio plazo y siguen abiertas. Es el
 * momento exacto donde una operación deja de ser una decisión y pasa a ser
 * una esperanza: vos escribiste "vendo antes del X" y llegó el X.
 *
 * No dice qué hacer — dice que llegó la fecha que vos pusiste.
 */
function tesisVencidas(ctx) {
  const hoy = hoyIso();
  const ops = (ctx.inversiones || []).filter(
    (i) => i.tipo === 'compra' && i.fecha_objetivo && i.fecha_objetivo < hoy
  );
  if (!ops.length) return [];

  // Sólo las que siguen abiertas: si ya vendiste, la tesis se cerró sola.
  const vendido = new Map();
  for (const i of (ctx.inversiones || [])) {
    const s = vendido.get(i.instrumento) || 0;
    vendido.set(i.instrumento, s + (i.tipo === 'venta' ? i.cantidad : -i.cantidad));
  }

  return ops
    .filter((op) => (vendido.get(op.instrumento) ?? 0) < 0)
    .slice(0, 2)
    .map((op) => {
      const dias = diasEntre(op.fecha_objetivo, hoy);
      return {
        id: `tesisvenc:${op.id}`,
        tipo: 'tesis-vencida',
        nivel: 'media',
        icono: '📌',
        titulo: `${op.instrumento}: pasó tu plazo hace ${dias} día${dias > 1 ? 's' : ''}`,
        detalle: `Escribiste que vendías antes del ${op.fecha_objetivo.slice(8)}/${op.fecha_objetivo.slice(5, 7)}${
          op.tesis ? ` porque "${op.tesis}"` : ''
        }. Sigue abierta. ${op.invalidacion ? `Tu propia condición de salida era: ${op.invalidacion}.` : 'Decidí de nuevo, no por inercia.'}`,
        accion: null,
        peso: eq(op.cantidad * op.precio_unitario, op.moneda),
      };
    });
}

/**
 * Plata que adelantaste por otro y no volvió. A los 20 días deja de ser "un
 * favor" y pasa a ser plata tuya que financia a otro sin que lo hayas decidido.
 */
function reintegrosViejos(ctx) {
  const grupos = pendientesDeReintegro(ctx.gastos).filter((g) => g.dias >= 20);
  if (!grupos.length) return [];
  return grupos.slice(0, 2).map((g) => ({
    id: `reint:${norm(g.quien)}:${g.desde}`,
    tipo: 'reintegro',
    nivel: g.dias >= 60 ? 'media' : 'info',
    icono: '🤝',
    titulo: `${g.quien} te debe ${fmtCorto(eqv(g.total))}`,
    detalle: `Lo pusiste vos hace ${g.dias} días, en ${g.items.length} ${g.items.length === 1 ? 'gasto' : 'gastos'}${
      g.items[0].descripcion ? ` (el más reciente: ${g.items[0].descripcion})` : ''
    }. No cuenta como tu gasto, pero es plata tuya que está afuera.`,
    accion: { tipo: 'ir', vista: 'gastos', label: 'Ver los gastos' },
    peso: eqv(g.total),
  }));
}

/**
 * Cuotas que terminan pronto. Es la única alerta buena del lote y también la
 * más accionable: saber que en dos meses se te liberan $63.375 por mes cambia
 * decisiones hoy, y es justo lo que ninguna app de gastos te dice porque todas
 * están enfocadas en lo que gastás, no en lo que dejás de deber.
 */
function seLibera(ctx) {
  const cal = ctx.calCuotas;
  const esteMes = cal.get(MES_HOY);
  const proximo = cal.get(addMes(MES_HOY, 1));
  if (!esteMes) return [];

  // Compras cuya última cuota cae este mes: lo que dejás de pagar desde el
  // mes que viene.
  const ultimas = (esteMes.items || []).filter((i) => i.n === i.total);
  if (!ultimas.length) return [];

  const liberado = ultimas.reduce((a, i) => a + eq(i.monto, i.moneda), 0);
  if (liberado < 5000) return [];
  const quedaProximo = proximo ? eqv(proximo) : 0;

  return [{
    id: `libera:${MES_HOY}`,
    tipo: 'libera',
    nivel: 'info',
    icono: '🎈',
    titulo: `Desde el mes que viene te liberás ${fmtCorto(liberado)} por mes`,
    detalle: `${ultimas.length === 1 ? 'Termina' : 'Terminan'} <b>${
      ultimas.map((i) => i.desc).join(', ')}</b>: ${ultimas.length === 1 ? 'es su última cuota' : 'son sus últimas cuotas'}. ${
      quedaProximo
        ? `Tu carga de cuotas pasa a ${fmtARS.format(quedaProximo)}.`
        : 'Después de esto no arrastrás más deuda en cuotas.'}`,
    accion: { tipo: 'ir', vista: 'cuotas', label: 'Ver cuotas' },
    peso: liberado,
  }];
}

/**
 * La misma suscripción cobrada en dos tarjetas distintas. Pasa de verdad: se
 * cambia el medio de pago y el viejo nunca se da de baja, así que se paga dos
 * veces durante meses sin que nada lo marque — en el resumen de cada tarjeta,
 * por separado, cada cobro parece legítimo.
 */
function dobleCobro(ctx) {
  const ventana = [0, 1].map((i) => addMes(MES_HOY, -i));
  const porServicio = new Map();
  for (const mes of ventana) {
    for (const g of (ctx.gastosPorMes.get(mes) || [])) {
      const hit = clasificar(g.descripcion);
      if (!hit || !claseRecurrente(g.descripcion)) continue;
      if (!porServicio.has(hit.nombre)) porServicio.set(hit.nombre, new Map());
      const porTarj = porServicio.get(hit.nombre);
      const k = g.tarjeta || 'sin-medio';
      if (!porTarj.has(k)) porTarj.set(k, []);
      porTarj.get(k).push(g);
    }
  }

  const out = [];
  for (const [nombre, porTarj] of porServicio) {
    if (porTarj.size < 2) continue;
    const medios = [...porTarj.keys()];
    const total = [...porTarj.values()].flat().reduce((a, g) => a + eq(g.monto, g.moneda), 0);
    const nombres = medios.map((k) => (ctx.medios || []).find((m) => m.key === k)?.nombre || medioDe(k)?.label || k);
    out.push({
      id: `doble:${norm(nombre)}:${MES_HOY}`,
      tipo: 'doble-cobro',
      nivel: 'alta',
      icono: '⚠️',
      titulo: `${nombre} te lo cobran en ${porTarj.size} tarjetas`,
      detalle: `Aparece en <b>${nombres.join(' y ')}</b> en los últimos dos meses, por ${fmtARS.format(total)} en total. Si cambiaste de medio de pago y no diste de baja el anterior, estás pagando dos veces la misma suscripción.`,
      accion: { tipo: 'ir', vista: 'gastos', label: 'Revisar' },
      peso: total * 12,
    });
  }
  return out.slice(0, 2);
}

/**
 * Hace meses que el ingreso no se mueve. Con inflación, un sueldo quieto es un
 * sueldo que baja — y es la clase de cosa que no se nota porque no pasa nada
 * ningún mes en particular.
 */
function ingresoQuieto(ctx) {
  const ingreso = ctx.recurrentes.find((r) => r.tipo === 'ingreso' && r.estado === 'activo');
  if (!ingreso) return [];
  const hitos = hitosDeAumento(ingreso);
  const serie = historialCompleto(ingreso);
  if (serie.length < 4) return [];

  const ultimoCambio = hitos.length ? hitos.at(-1).mes : serie[0].mes;
  const meses = (Number(MES_HOY.slice(0, 4)) - Number(ultimoCambio.slice(0, 4))) * 12
    + (Number(MES_HOY.slice(5, 7)) - Number(ultimoCambio.slice(5, 7)));
  if (meses < 5) return [];

  return [{
    id: `quieto:${ultimoCambio}`,
    tipo: 'ingreso-quieto',
    nivel: meses >= 8 ? 'media' : 'info',
    icono: '🧊',
    titulo: `Tu ingreso no se mueve hace ${meses} meses`,
    detalle: `El último cambio fue en ${labelMes(ultimoCambio)}. Con inflación, un sueldo quieto pierde poder de compra todos los meses sin que pase nada visible: no aparece como un gasto nuevo, aparece como que cada vez alcanza menos.`,
    accion: null,
    peso: eq(montoEn(ingreso, MES_HOY, ctx), ingreso.moneda) * (meses / 12),
  }];
}

/** El día de la semana en que se te va la plata. */
function diaDeLaSemana(ctx) {
  const hoy = hoyIso();
  const porDow = Array.from({ length: 7 }, () => ({ total: 0, dias: new Set() }));
  for (const g of ctx.gastos) {
    if (ctx.match.has(g.id) || g.reintegro) continue;
    const d = diasEntre(g.fecha, hoy);
    if (d < 0 || d > 90) continue;
    const dow = new Date(g.fecha + 'T00:00:00').getDay();
    porDow[dow].total += eq(g.monto, g.moneda);
    porDow[dow].dias.add(g.fecha);
  }
  const prom = porDow.map((v) => (v.dias.size ? v.total / v.dias.size : 0));
  const conDatos = prom.filter((p) => p > 0);
  if (conDatos.length < 5) return [];

  const max = Math.max(...prom);
  const dow = prom.indexOf(max);
  const resto = prom.filter((_, i) => i !== dow && prom[i] > 0);
  if (!resto.length) return [];
  const promResto = resto.reduce((a, b) => a + b, 0) / resto.length;
  if (max < promResto * 1.8) return [];

  return [{
    id: `dow:${dow}:${MES_HOY}`,
    tipo: 'dia-semana',
    nivel: 'info',
    icono: '📅',
    titulo: `Los ${DIAS_SEM[dow]} gastás ${variacion(max, promResto)} más`,
    detalle: `En los últimos 3 meses, un ${DIAS_SEM[dow]} promedio te sale <b>${fmtARS.format(max)}</b> contra ${fmtARS.format(promResto)} del resto. Al año son ${fmtARS.format((max - promResto) * 52)} de diferencia.`,
    accion: null,
    peso: (max - promResto) * 52,
  }];
}

const DIAS_SEM = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

// ---------- Orquestador ----------

const CLAVE_DESCARTES = 'kbl.alertas.descartadas';

function descartadas() {
  try { return JSON.parse(localStorage.getItem(CLAVE_DESCARTES)) || {}; } catch { return {}; }
}

export function descartar(id) {
  const d = descartadas();
  d[id] = Date.now();
  localStorage.setItem(CLAVE_DESCARTES, JSON.stringify(d));
}

/** Todas las alertas vigentes, ordenadas por urgencia y después por plata. */
export function detectar(ctx, foto) {
  const ingreso = eqv(foto.ingresos);
  const todas = [
    ...vencidasSinMarcar(ctx),
    ...conocidosNoDeclarados(ctx),
    ...conceptosNoDeclarados(ctx, ingreso),
    ...categoriasFlojas(ctx),
    ...aumentos(ctx),
    ...diasCaros(ctx),
    ...ritmoDelMes(ctx),
    ...hormiga(ctx, ingreso),
    ...duplicados(ctx),
    ...vencimientos(ctx),
    ...faltantes(ctx),
    ...techo(foto, ctx),
    ...rojo(foto),
    ...deudaAlta(ctx, foto),
    ...presupuestoDiario(foto),
    ...erosion(ctx),
    ...cierreCerca(ctx),
    ...colchon(ctx, foto),
    ...concentracion(ctx, foto),
    ...costoDeInvertir(ctx),
    ...tesisVencidas(ctx),
    ...reintegrosViejos(ctx),
    ...seLibera(ctx),
    ...dobleCobro(ctx),
    ...ingresoQuieto(ctx),
    ...diaDeLaSemana(ctx),
  ];
  const fuera = descartadas();
  return todas
    .filter((a) => !fuera[a.id])
    .sort((a, b) => (NIVELES[a.nivel] - NIVELES[b.nivel]) || (b.peso - a.peso));
}
