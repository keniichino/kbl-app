// Parser de resúmenes de Galicia (Visa / Mastercard) desde `pdftotext -raw`.
// Todo local: no sale nada a ninguna red.
//
// Los dos plásticos usan formatos DISTINTOS y hay que tratarlos aparte:
//
//   VISA:  31-05-26 * ZARA 03/03 000909 35.336,66
//          fecha dd-mm-aa · marca · comercio · cuota · comprobante(6) · monto
//
//   MAST:  10-Jul-26 APPLE.COM/BILL (USA,USD, 2,99) 00698 2,99
//          fecha dd-Mmm-aa · comercio (PAÍS,MONEDA, importe original) · comprobante(5) · monto
//
// El paréntesis de Mastercard es el dato más valioso del lote: dice la moneda
// REAL de la operación. Netflix figura como US$ 13,34 en el resumen pero se
// facturó $19.999 — no es una suscripción en dólares, es una suscripción en
// pesos que el banco convierte porque el comercio es del exterior.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = process.argv[2];
const archivos = fs.readdirSync(DIR).filter((f) => /^RESUMEN_/i.test(f)).sort();

const num = (s) => {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const MESES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
  jan: '01', apr: '04', aug: '08', dec: '12' };

function aIso(f) {
  let m = f.match(/^(\d{2})-(\d{2})-(\d{2})$/);            // 31-05-26
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  m = f.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);          // 10-Jul-26
  if (m) {
    const mm = MESES[m[2].toLowerCase()];
    if (mm) return `20${m[3]}-${mm}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
}

const limpiar = (s) => s
  .replace(/^(MERPAGO\*|DLO\*|PAYU\*AR\*|SIPAGO \*|WL \*|MP\*|UBER\s*\*|GOOGLE\s*\*|APPLE\s*\*)/i, '')
  .replace(/\s*\([A-Z]{3},[A-Z]{3},[^)]*\)\s*/i, ' ')
  .replace(/\s+USD\s+[\d.,]+\s*$/i, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

// Líneas que NO son consumos: totales, impuestos, pagos, encabezados.
const RUIDO = /^(SALDO|SU PAGO|DETALLE|FECHA REFERENCIA|TOTAL|SUBTOTAL|CONSOLIDADO|PAGO MINIMO|TASAS|L.MITES|Resumen|Tarjeta|BURGUES|AGUSTIN|OLAZABAL|AVDA|C143|En pesos|En d.lares|Producido|Vencimiento|P.gina|CUIT|N. de|DEV PER|Cuotas a vencer|Consumidor|Debitaremos|El monto de IVA|\d{17,})/i;
const ES_CARGO = /PERCEP|PERC |IVA|IMPUESTO|LEY 25|SEGURO|COMISION|INTERES|SELLADO|CARGO|RG 4815|IIBB/i;

// El resumen viene en secciones y el `NN/NN` significa cosas distintas en cada
// una: en COMPRAS y DEBITOS AUTOMATICOS es el PERÍODO (`07/26` = julio 2026),
// en CUOTA DEL MES es la cuota (`02/09` = la 2 de 9). Confundirlas hacía que
// una compra del mes se contara como cuota y el total no cerrara nunca.
const SECCIONES = [
  [/^COMPRAS DEL MES/i, 'compra'],
  [/^DEBITOS AUTOMATICOS/i, 'debito'],
  [/^CUOTA(S)? DEL MES/i, 'cuota'],
  [/^DETALLE DEL CONSUMO/i, 'compra'],
];

const consumos = [];
const cargos = [];
const totales = [];

for (const f of archivos) {
  const tarjeta = /VISA/i.test(f) ? 'visa' : 'mac';
  const m = f.match(/RESUMEN_(?:VISA|MAST)(\d{1,2})_(\d{1,2})_(\d{4})/i);
  const periodo = m ? `${m[3]}-${String(m[2]).padStart(2, '0')}` : '?';
  const cierre = m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : null;

  const texto = execFileSync('pdftotext', ['-raw', path.join(DIR, f), '-'], {
    encoding: 'latin1', maxBuffer: 20 * 1024 * 1024,
  });
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  // --- Totales del resumen (lo que el banco dice que hay que pagar) ---
  const buscar = (re) => {
    const l = lineas.find((x) => re.test(x));
    if (!l) return null;
    const nums = [...l.matchAll(/-?[\d.]+,\d{2}/g)].map((x) => num(x[0]));
    return nums.length ? nums : null;
  };
  // Mastercard trae "TOTAL CONSUMOS DEL MES" explícito. Visa no: sólo el
  // "TOTAL A PAGAR", que ya incluye percepciones (el saldo anterior se
  // cancela contra el pago del mes). Para comparar peras con peras hay que
  // restarle las percepciones de ese resumen.
  let tot = buscar(/^TOTAL CONSUMOS DEL MES/i);
  const aPagar = buscar(/^TOTAL A PAGAR/i);
  let percep = 0, devol = 0;
  if (!tot && aPagar) {
    // Visa: TOTAL A PAGAR = consumos + percepciones − devoluciones
    // (el saldo anterior se cancela contra el pago del mes), así que para
    // llegar a los consumos hay que restar percepciones y SUMAR devoluciones.
    // Las DEV.IMP. RG 5617 del consolidado eran los $60.901 de mayo y los
    // $11.006 de julio que hacían que "sobrara" plata en mi lectura.
    const montoFinal = (l) => {
      const n = [...l.matchAll(/-?[\d.]+,\d{2}/g)].map((x) => num(x[0]));
      return n.length ? n.at(-1) : 0;
    };
    // `DB.RG 5617 30%` es el impuesto del 30% sobre los consumos en dólares.
    // Es un cargo del banco, no un consumo tuyo, y va sumado en el total —
    // no restarlo dejaba una diferencia de $60.901 en abril, $11.006 en junio
    // y $8.979 en agosto, justo los tres meses que no cerraban.
    percep = lineas.filter((l) => /^\d{2}-\d{2}-\d{2}\s+(IIBB|IVA|PERCEP|DB\.?\s*RG)/i.test(l))
      .reduce((a, l) => a + Math.abs(montoFinal(l)), 0);
    devol = lineas.filter((l) => /DEV\.?\s*IMP|DEV PER/i.test(l))
      .reduce((a, l) => a + Math.abs(montoFinal(l)), 0);
    tot = [aPagar[0] - percep + devol, aPagar[1] ?? null];
  }
  totales.push({ archivo: f, tarjeta, periodo, cierre, consumosDelMes: tot, totalAPagar: aPagar, percep, devol });

  let seccion = 'compra';
  for (const linea of lineas) {
    const sec = SECCIONES.find(([re]) => re.test(linea));
    if (sec) { seccion = sec[1]; continue; }

    if (ES_CARGO.test(linea) && /[\d.]+,\d{2}\s*$/.test(linea) && !/^\d{1,2}-/.test(linea)) {
      const mm = linea.match(/([\d.]+,\d{2})\s*$/);
      cargos.push({ tarjeta, periodo, concepto: linea.replace(/-?[\d.]+,\d{2}.*$/, '').trim(), monto: num(mm[1]) });
      continue;
    }
    if (RUIDO.test(linea)) continue;

    // fecha  [marca]  descripción  [cuota]  comprobante(5-6)  monto  [monto2]
    const g = linea.match(
      /^(\d{1,2}-(?:\d{2}|[A-Za-z]{3})-\d{2})\s+([*K])?\s*(.+?)\s+(\d{2}\/\d{2})?\s*(\d{5,6})\s+(-?[\d.]+,\d{2})(?:\s+(-?[\d.]+,\d{2}))?\s*$/
    );
    if (!g) continue;

    const fecha = aIso(g[1]);
    if (!fecha) continue;
    let desc = g[3].trim();
    // Sólo es cuota si estamos en la sección de cuotas; si no, es el período.
    //
    // Salvo en el resumen de Visa, que NO trae la sección "CUOTAS DEL MES": cae
    // todo bajo "DETALLE DEL CONSUMO" y sus cuotas venían clasificadas como
    // compras. Efecto: cada cuota mensual entraba como un consumo nuevo con la
    // fecha de la compra original (un plan de 3 cuotas = 3 gastos el mismo día)
    // y el plan no aparecía como deuda en ningún lado. En 303 consumos de Visa
    // el parser detectaba 0 cuotas contra 61 de Mastercard.
    //
    // Se distinguen por el segundo número: como período es el AÑO (07/26 =
    // julio 2026), como cuota es el total del plan (02/09 = la 2 de 9). Un año
    // fuera de 2024-2028 en un resumen de 2026 no existe, así que es una cuota.
    const ANIOS_PLAUSIBLES = /^(2[4-8])$/;
    const nn = g[4] || null;
    const esCuotaDisfrazada = seccion !== 'cuota' && nn && !ANIOS_PLAUSIBLES.test(nn.split('/')[1]);
    const cuota = seccion === 'cuota' || esCuotaDisfrazada ? nn : null;
    const periodoLinea = seccion === 'cuota' || esCuotaDisfrazada ? null : nn;
    const m1 = num(g[6]);
    const m2 = g[7] != null ? num(g[7]) : null;
    if (m1 == null) continue;

    // El paréntesis de Mastercard trae la moneda y el importe originales.
    const par = desc.match(/\(([A-Z]{3}),\s*([A-Z]{3}),\s*([\d.]+,\d{2})\)/i);
    let moneda = 'ARS', monto = m1, montoOriginal = null, monedaOriginal = null, pais = null;

    if (par) {
      pais = par[1];
      monedaOriginal = par[2].toUpperCase();
      montoOriginal = num(par[3]);
      // El resumen de Mastercard liquida en dólares lo del exterior.
      moneda = 'USD';
      monto = m2 != null ? m2 : m1;
    } else if (m2 != null) {
      // Visa: dos columnas → pesos y dólares.
      moneda = 'ARS'; monto = m1;
    } else if (/\bUSD\b/i.test(desc)) {
      moneda = 'USD'; monto = m1;
    }

    if (monto == null || monto === 0) continue;

    consumos.push({
      periodo, tarjeta, cierre, fecha, seccion, comprobante: g[5],
      descripcion: desc.replace(/\s*\([A-Z]{3},[A-Z]{3},[^)]*\)\s*/i, ' ').trim(),
      comercio: limpiar(desc),
      cuota, periodoLinea, monto, moneda,
      montoOriginal, monedaOriginal, pais,
    });
  }
}

// Dedup por comprobante, no por (fecha + comercio + monto): dos consumos
// idénticos el mismo día son perfectamente normales y el comprobante es lo
// único que los distingue. Sin él se perdían, por ejemplo, dos de las cuatro
// cuotas de EDUCACIONIT del 31/03 — exactamente $40.679 que hacían que ningún
// resumen cerrara contra el total del banco.
const vistos = new Set();
const limpios = consumos.filter((r) => {
  const k = `${r.tarjeta}|${r.periodo}|${r.comprobante}|${r.fecha}|${r.monto}`;
  if (vistos.has(k)) return false;
  vistos.add(k);
  return true;
});

fs.writeFileSync(path.join(__dirname, 'consumos.json'), JSON.stringify(limpios, null, 1));
fs.writeFileSync(path.join(__dirname, 'cargos.json'), JSON.stringify(cargos, null, 1));
fs.writeFileSync(path.join(__dirname, 'totales.json'), JSON.stringify(totales, null, 1));

// ---------- Reporte ----------
const fmt = (n) => '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
const nom = (t) => (t === 'visa' ? 'Visa' : 'Mac ');

console.log('=== CONSUMOS POR RESUMEN ===');
const porPeriodo = {};
for (const r of limpios) {
  const k = `${r.periodo} ${nom(r.tarjeta)}`;
  porPeriodo[k] = porPeriodo[k] || { n: 0, ars: 0, usd: 0 };
  porPeriodo[k].n++;
  if (r.moneda === 'USD') porPeriodo[k].usd += r.monto; else porPeriodo[k].ars += r.monto;
}
for (const k of Object.keys(porPeriodo).sort()) {
  const v = porPeriodo[k];
  console.log(`${k}  ${String(v.n).padStart(3)} mov  ${fmt(v.ars).padStart(14)}${v.usd ? `  + US$ ${v.usd.toFixed(2)}` : ''}`);
}
console.log(`\nTOTAL: ${limpios.length} consumos`);

// El "TOTAL CONSUMOS DEL MES" del banco incluye compras + débitos + cuotas
// del mes, así que la comparación tiene que sumar las tres secciones.
console.log('\n=== CONTRA EL TOTAL QUE DICE EL BANCO ===');
let cierran = 0;
for (const t of totales.sort((a, b) => a.periodo.localeCompare(b.periodo) || a.tarjeta.localeCompare(b.tarjeta))) {
  const mios = limpios.filter((r) => r.tarjeta === t.tarjeta && r.periodo === t.periodo);
  const ars = mios.filter((r) => r.moneda === 'ARS').reduce((a, r) => a + r.monto, 0);
  const usd = mios.filter((r) => r.moneda === 'USD').reduce((a, r) => a + r.monto, 0);
  const dice = t.consumosDelMes ? t.consumosDelMes[0] : null;
  const diceUsd = t.consumosDelMes && t.consumosDelMes[1] != null ? t.consumosDelMes[1] : null;
  const dif = dice != null ? ars - dice : null;
  // Tolerancia de $100: el total de Visa se deriva restando impuestos que el
  // PDF muestra redondeados, así que arrastra centavos. Sobre resúmenes de
  // cientos de miles, $100 es 0,02% — no es un consumo perdido.
  const ok = dif != null && Math.abs(dif) < 100;
  if (ok) cierran++;
  console.log(`${t.periodo} ${nom(t.tarjeta)} ${ok ? '✓' : '✗'} leí ${fmt(ars).padStart(13)}${
    usd ? ` +US$${usd.toFixed(2).padStart(7)}` : '          '}   banco ${
    (dice != null ? fmt(dice) : '—').padStart(13)}${
    diceUsd ? ` +US$${diceUsd.toFixed(2).padStart(7)}` : '          '}   dif ${(dif != null ? fmt(dif) : '—').padStart(11)}`);
}
console.log(`\nCierran ${cierran} de ${totales.length} resúmenes al peso.`);

// Suscripciones: 3+ meses distintos, ~1 vez por mes, y SIN número de cuota
// (una compra en 3 cuotas aparece 3 meses seguidos y no es una suscripción).
const porComercio = {};
for (const r of limpios) {
  if (r.cuota) continue;
  const k = r.comercio.toLowerCase();
  porComercio[k] = porComercio[k] || { nombre: r.comercio, periodos: new Set(), montos: [], monedas: new Set(), originales: [], tarjeta: r.tarjeta };
  const c = porComercio[k];
  c.periodos.add(r.periodo);
  c.montos.push(r.monto);
  c.monedas.add(r.moneda);
  if (r.montoOriginal) c.originales.push(r.montoOriginal);
}

const cands = Object.values(porComercio)
  .map((c) => ({ ...c, meses: c.periodos.size, veces: c.montos.length,
    prom: c.montos.reduce((a, b) => a + b, 0) / c.montos.length,
    promOrig: c.originales.length ? c.originales.reduce((a, b) => a + b, 0) / c.originales.length : null }))
  .filter((c) => c.meses >= 3 && c.veces <= c.meses * 1.5)
  .sort((a, b) => b.meses - a.meses || b.prom - a.prom);

console.log('\n=== SUSCRIPCIONES / FIJOS DETECTADOS (3+ meses, ~1 vez por mes, sin cuotas) ===');
for (const c of cands) {
  const mon = [...c.monedas][0];
  const importe = mon === 'USD' ? `US$ ${c.prom.toFixed(2)}` : fmt(c.prom);
  const orig = c.promOrig ? `  (facturado $ ${Math.round(c.promOrig).toLocaleString('es-AR')})` : '';
  console.log(`${c.nombre.slice(0, 30).padEnd(30)} ${nom(c.tarjeta)} ${c.meses}m ${String(c.veces).padStart(2)}x  ${importe.padStart(12)}${orig}`);
}

console.log('\n=== IMPUESTOS Y PERCEPCIONES ===');
const porCargo = {};
for (const c of cargos) {
  const k = c.concepto.slice(0, 38);
  porCargo[k] = porCargo[k] || { total: 0, n: 0 };
  porCargo[k].total += c.monto;
  porCargo[k].n++;
}
let totalCargos = 0;
for (const [k, v] of Object.entries(porCargo).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`${k.padEnd(40)} ${String(v.n).padStart(2)}x ${fmt(v.total).padStart(13)}`);
  totalCargos += v.total;
}
console.log(`${'TOTAL en 5 meses'.padEnd(40)}    ${fmt(totalCargos).padStart(13)}`);
