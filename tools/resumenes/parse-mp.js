// Parser de resúmenes de tarjeta de Mercado Pago.
//
// Formato propio, más limpio que el de Galicia (y con subtotales por sección
// para poder verificar), pero con una trampa grande:
//
//   Fecha Descripción Cuota Operación Pesos Dólares
//   21/feb MERPAGO*MERCADOLIBRE 5 de 6 889958 $ 23.102,64
//   7/jun  STEAMGAMES.COM 4259522 934036 US$ 49,38
//   9/jun  MERPAGO*MERCADOLIBRE 944390 $ 19.364,00
//
// LAS FECHAS NO TIENEN AÑO. Ni las de los consumos ni la del cierre: el PDF
// dice "Este es tu resumen de julio" y "Fecha de cierre 5 de julio", nada más.
// Tampoco está en los metadatos. Así que el año hay que pasarlo a mano (o
// inferirlo encadenando el "Total a pagar del periodo anterior" de un resumen
// con el "Total a pagar" del anterior, que es lo que se hizo acá).
//
// Un consumo cuyo mes es POSTERIOR al mes de cierre pertenece al año anterior:
// en el resumen de agosto, un `21/feb` es de febrero del mismo año, pero en el
// de enero un `24/dic` es de diciembre del año pasado.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n) => String(n).padStart(2, '0');

const num = (s) => {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Consumo: fecha, descripción, cuota opcional ("5 de 6"), operación, importe.
const RE = /^(\d{1,2})\/([a-z]{3})\s+(.+?)\s+(?:(\d{1,2})\s+de\s+(\d{1,2})\s+)?(\d{5,7})\s+(US\$|\$)\s*(-?[\d.]+,\d{2})\s*$/i;

/**
 * @param archivo  ruta al PDF
 * @param anioCierre  año del cierre del resumen (el PDF no lo dice)
 */
function parsearMP(archivo, anioCierre) {
  const texto = execFileSync('pdftotext', ['-raw', archivo, '-'], {
    encoding: 'latin1', maxBuffer: 20 * 1024 * 1024,
  });
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  // Mes de cierre, para resolver el año de cada consumo.
  const lCierre = lineas.find((l) => /^Fecha de cierre/i.test(l));
  const iCierre = lineas.indexOf(lCierre);
  const txtCierre = iCierre >= 0 ? (lineas[iCierre + 1] || '') : '';
  const mCierre = txtCierre.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
  const nombreMes = (mCierre ? mCierre[2] : '').toLowerCase().slice(0, 3);
  const mesCierre = MESES[nombreMes] || null;
  const diaCierre = mCierre ? Number(mCierre[1]) : null;

  // Vencimiento (lo necesita el calendario de cuotas de la app).
  const lVenc = lineas.find((l) => /^Fecha de vencimiento/i.test(l));
  const iVenc = lineas.indexOf(lVenc);
  const mVenc = (iVenc >= 0 ? (lineas[iVenc + 1] || '') : '').match(/(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
  const diaVenc = mVenc ? Number(mVenc[1]) : null;

  const periodo = mesCierre ? `${anioCierre}-${pad(mesCierre)}` : '?';

  // Subtotal de la sección Consumos: con esto se verifica la lectura.
  let subtotal = null, subtotalUsd = null;
  const iConsumos = lineas.findIndex((l) => /^Consumos$/i.test(l));
  if (iConsumos >= 0) {
    for (let i = iConsumos; i < lineas.length; i++) {
      const s = lineas[i].match(/^Subtotal\s+\$\s*([\d.]+,\d{2})(?:\s+US\$\s*([\d.]+,\d{2}))?/i);
      if (s) { subtotal = num(s[1]); subtotalUsd = s[2] ? num(s[2]) : 0; break; }
    }
  }

  // "Consumos $ 426.052,45 US$ 49,38" del bloque Consolidado.
  const lCons = lineas.find((l) => /^Consumos\s+\$/i.test(l));
  const consolidado = lCons
    ? [...lCons.matchAll(/(?:US)?\$\s*([\d.]+,\d{2})/g)].map((m) => num(m[1]))
    : null;

  // Impuestos: no son consumos tuyos, van aparte.
  const impuestos = [];
  const iImp = lineas.findIndex((l) => /^Impuestos e intereses/i.test(l));
  if (iImp >= 0) {
    for (let i = iImp + 1; i < lineas.length && !/^Subtotal|^Ajustes|^Pagos/i.test(lineas[i]); i++) {
      const m = lineas[i].match(/^(\d{1,2})\/([a-z]{3})\s+(.+?)\s+\$\s*([\d.]+,\d{2})\s*$/i);
      if (m) impuestos.push({ periodo, concepto: m[3].trim(), monto: num(m[4]) });
    }
  }

  const consumos = [];
  let seccion = null;
  for (const l of lineas) {
    if (/^Composici.n del saldo/i.test(l)) { seccion = 'saldo'; continue; }
    if (/^Consumos/i.test(l)) { seccion = 'consumos'; continue; }
    if (/^Impuestos e intereses|^Ajustes y reembolsos|^Pagos anticipados|^INFORMACI/i.test(l)) { seccion = null; continue; }
    if (seccion !== 'consumos') continue;

    const g = l.match(RE);
    if (!g) continue;
    const dia = Number(g[1]);
    const mes = MESES[g[2].toLowerCase()];
    if (!mes || !mesCierre) continue;
    // Mes posterior al cierre ⇒ es del año anterior.
    const anio = mes > mesCierre ? anioCierre - 1 : anioCierre;
    const moneda = g[7] === '$' ? 'ARS' : 'USD';

    consumos.push({
      periodo, tarjeta: 'mp',
      cierre: mesCierre ? `${anioCierre}-${pad(mesCierre)}-${pad(diaCierre)}` : null,
      vencimiento: mesCierre && diaVenc ? `${anioCierre}-${pad(mesCierre)}-${pad(diaVenc)}` : null,
      fecha: `${anio}-${pad(mes)}-${pad(dia)}`,
      descripcion: g[3].trim(),
      comercio: g[3].replace(/^(MERPAGO\*|MP\*|DLO\*)/i, '').trim(),
      cuota: g[4] ? `${pad(g[4])}/${pad(g[5])}` : null,
      cuotaN: g[4] ? Number(g[4]) : null,
      cuotaTotal: g[5] ? Number(g[5]) : null,
      operacion: g[6],
      monto: num(g[8]),
      moneda,
      montoOriginal: null, monedaOriginal: null, pais: null,
      seccion: 'compra',
    });
  }

  return { archivo: path.basename(archivo), periodo, subtotal, subtotalUsd, consolidado, consumos, impuestos, diaCierre, diaVenc };
}

module.exports = { parsearMP };

// ---------- CLI ----------
if (require.main === module) {
  const DIR = process.argv[2];
  // El año va por archivo porque el PDF no lo trae. Mapeo confirmado
  // encadenando saldos: el "periodo anterior" de agosto ($465.008,58) es el
  // "total a pagar" de julio, y el de julio ($452.442,58) el de junio.
  const ANIOS = {
    'credit-card-mp-statement.pdf': 2026,        // agosto  2026
    'credit-card-mp-statement (1).pdf': 2026,    // julio   2026
    'credit-card-mp-statement (2).pdf': 2026,    // enero   2026 (SUPUESTO)
  };

  const fmt = (n) => '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  const todos = [];
  const imp = [];

  for (const f of fs.readdirSync(DIR).filter((x) => /\.pdf$/i.test(x))) {
    const anio = ANIOS[f] ?? 2026;
    const r = parsearMP(path.join(DIR, f), anio);
    todos.push(...r.consumos);
    imp.push(...r.impuestos);

    const ars = r.consumos.filter((c) => c.moneda === 'ARS').reduce((a, c) => a + c.monto, 0);
    const usd = r.consumos.filter((c) => c.moneda === 'USD').reduce((a, c) => a + c.monto, 0);
    const okArs = r.subtotal != null && Math.abs(ars - r.subtotal) < 1;
    const okUsd = r.subtotalUsd == null || Math.abs(usd - r.subtotalUsd) < 0.01;
    console.log(`${r.periodo}  ${okArs && okUsd ? '✓' : '✗'} ${String(r.consumos.length).padStart(2)} mov  leí ${
      fmt(ars).padStart(13)}${usd ? ` +US$ ${usd.toFixed(2)}` : ''}   subtotal ${
      (r.subtotal != null ? fmt(r.subtotal) : '—').padStart(13)}${r.subtotalUsd ? ` +US$ ${r.subtotalUsd.toFixed(2)}` : ''}` +
      `   cierre ${r.diaCierre} · vence ${r.diaVenc}`);
  }

  fs.writeFileSync(path.join(__dirname, 'consumos-mp.json'), JSON.stringify(todos, null, 1));
  fs.writeFileSync(path.join(__dirname, 'impuestos-mp.json'), JSON.stringify(imp, null, 1));
  console.log(`\n${todos.length} consumos → consumos-mp.json`);

  const cuotas = todos.filter((c) => c.cuota);
  console.log(`\n=== COMPRAS EN CUOTAS (${cuotas.length}) ===`);
  for (const c of cuotas.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    console.log(`${c.fecha}  ${c.comercio.slice(0, 26).padEnd(26)} ${c.cuota}  ${fmt(c.monto).padStart(13)}  (resumen ${c.periodo})`);
  }

  if (imp.length) {
    console.log('\n=== IMPUESTOS ===');
    for (const i of imp) console.log(`${i.periodo}  ${i.concepto.slice(0, 40).padEnd(42)} ${fmt(i.monto).padStart(12)}`);
  }
}
