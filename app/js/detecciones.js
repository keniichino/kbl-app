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
} from './fincore.js';
import { aPesos } from './cotizacion.js';

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
      const solo = d.n === 1;
      return {
        id: `diacaro:${fecha}`,
        tipo: 'dia-caro',
        nivel: 'media',
        icono: solo ? '💥' : '🔥',
        titulo: solo ? `Gasto grande ${labelDia(fecha)}` : `Día caro: ${labelDia(fecha)}`,
        detalle: solo
          ? `<b>${mayor.descripcion || 'Sin detalle'}</b> por ${fmtARS.format(d.total)}, cuando un día normal tuyo son ${fmtARS.format(base)}.`
          : `${d.n} movimientos por <b>${fmtARS.format(d.total)}</b>, contra ${fmtARS.format(base)} de un día normal tuyo. Lo más grande: ${mayor.descripcion || 'sin detalle'}.`,
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
    const items = (ctx.calCuotas.get(iso.slice(0, 7))?.items || []).filter((i) => i.tarjeta === tarjeta);
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
  const comp = eqv(masMontos(foto.estructural, foto.cuotas));
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
    ...conceptosNoDeclarados(ctx, ingreso),
    ...aumentos(ctx),
    ...diasCaros(ctx),
    ...ritmoDelMes(ctx),
    ...duplicados(ctx),
    ...vencimientos(ctx),
    ...faltantes(ctx),
    ...techo(foto, ctx),
    ...rojo(foto),
    ...deudaAlta(ctx, foto),
  ];
  const fuera = descartadas();
  return todas
    .filter((a) => !fuera[a.id])
    .sort((a, b) => (NIVELES[a.nivel] - NIVELES[b.nivel]) || (b.peso - a.peso));
}
