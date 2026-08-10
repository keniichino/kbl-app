// Genera el SQL para cargar el historial de consumos en `gastos`.
// Esto es lo que llena el "Flujo de 6 meses" y el promedio de variable: sin
// gastos viejos el panel sólo sabe del mes corriente y toda comparación
// ("vs prom. 3 meses", "más rápido que el mes pasado") sale vacía.
//
// Qué NO entra:
//   · Las cuotas. Van en la tabla `cuotas`, no en `gastos` — sumarlas acá las
//     contaría dos veces (criterio de TAREAS.md).
//   · Los conceptos ya declarados como fijo/suscripción. La app los matchea
//     por `coincide` y los cuenta desde `recurrentes`; cargarlos también como
//     gasto suelto no rompe (el matcheo los saca), pero ensucia la lista.
//
// Las fechas son las del CONSUMO, no las del resumen: es cuándo gastaste.

const fs = require('fs');
const path = require('path');

const galicia = require('./consumos-2026-08.json');
let mp = [];
try { mp = require('./consumos-mp.json'); } catch { /* todavía sin MP */ }

const esc = (s) => String(s || '').replace(/'/g, "''").slice(0, 120);

// Categorías, mismo criterio que catalogo.js en la app.
const CATS = [
  [/COTO|CARREFOUR|DIA\b|JUMBO|VEA\b|DISCO|CHANGOMAS|Market |Express |KSKAGRO|AUTOSERVICIO|VITAL|MAXICONSUMO/i, 'super'],
  [/RAPPI|PEDIDOSYA|MCDONALDS|MC DONALDS|BURGER|STARBUCKS|CAFE|CAF[EÉ]|MOSTAZA|SUBWAY|HAVANNA|PORTANEGRA|OGGI|PIZZA|SUSHI|PARRILLA|EMPANADA|HELADO|GRIDO|PANADER/i, 'comida'],
  [/UBER|DIDI|CABIFY|SUBE|YPF|SHELL|AXION|PUMA|ESTACION|PEAJE|AUSA|ACARA|PATENTE|SEGURO AUTO/i, 'transporte'],
  [/NETFLIX|SPOTIFY|YOUTUBE|DISNEY|HBO|MAX\b|PRIME|APPLE|GOOGLE|MICROSOFT|ADOBE|CAPCUT|STEAM|CLAUD|ANTHROPIC|OPENAI|CHATGPT|PERSFLOW|PERSONAL|MOVISTAR|CLARO|FIBERTEL|TELECENTRO|MELI\b|MERCADOLIBRE/i, 'servicios'],
  [/HOYTS|CINEMARK|CINE|TICKETEK|TEATRO|BAR\b|BOLICHE|OPEN25|MOOI|VERA801|SPOTIF/i, 'salidas'],
  [/FARMACIA|FARMACITY|GIMNASIO|SPORTCLUB|MEDIC|DENTAL|OPTIC|SALUD|HOSPITAL/i, 'salud'],
  [/UADE|EDUCACIONIT|UNIVERSIDAD|COLEGIO|CURSO|ALQUILER|EXPENSAS|EDENOR|EDESUR|METROGAS|AYSA|ABL/i, 'casa'],
];
const categoriaDe = (d) => (CATS.find(([re]) => re.test(d)) || [null, 'otros'])[1];

// Conceptos ya cargados como recurrentes: se saltean para no duplicar la lista.
const YA_DECLARADO = /ADOBE|Spotify|NETFLIX|YouTubeP|Microsoft\*?Subscr|Microsoft\*Xbox|MERPAGO\*MELI|CapCut|Google O|APPLE\.COM\/BILL|STEAMGAMES|PERSFLOW|UADE/i;

// Los resúmenes de abril–agosto sólo cubren consumos de 2026. Lo que aparece
// fechado en 2025 son compras en cuotas cuya línea no traía el número de cuota
// visible (MERPAGO*CROSBY 13/05/2025, NUSKA, BUENALIVE): entran repetidas en
// varios resúmenes con la fecha de la compra ORIGINAL y no representan gasto
// de este período. Se cortan acá.
const DESDE = '2026-01-01';

const todos = [...galicia, ...mp]
  .filter((c) => !c.cuota)                                   // las cuotas viven en `cuotas`
  .filter((c) => c.fecha >= DESDE)
  .filter((c) => !YA_DECLARADO.test(c.descripcion))          // ya están como recurrentes
  .filter((c) => c.monto > 0)
  .sort((a, b) => a.fecha.localeCompare(b.fecha));

// Dedup entre lotes (un consumo puede venir de dos parseos distintos).
// El comprobante va en la clave: sin el, dos consumos reales del mismo dia,
// mismo comercio y mismo monto se contaban como uno solo (JUAN VALDEZ del
// 09/03 son dos cafes, comprobantes 04657 y 04658). Lo que si viene repetido
// entre lotes trae el mismo comprobante, asi que el dedupe no pierde nada.
const vistos = new Set();
const filas = todos.filter((c) => {
  const k = `${c.tarjeta}|${c.fecha}|${Math.round(c.monto * 100)}|${(c.descripcion || '').slice(0, 20)}|${c.comprobante || ''}`;
  if (vistos.has(k)) return false;
  vistos.add(k);
  return true;
});

const sql = [`-- ============================================================
-- Historial de consumos, de los resúmenes de Galicia (Visa + Mastercard) y
-- Mercado Pago. Es lo que hace que el "Flujo de 6 meses", el promedio de
-- variable y las comparaciones contra meses anteriores tengan con qué comparar.
--
-- ${filas.length} consumos, de ${filas[0].fecha} a ${filas.at(-1).fecha}.
--
-- NO incluye las cuotas (van en \`cuotas\`) ni los conceptos ya cargados como
-- fijo/suscripción (van en \`recurrentes\`): sumarlos acá los contaría dos veces.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP), no en el de la empresa.
-- Idempotente: dedupea por fecha + monto + descripción, así que se puede
-- correr dos veces sin duplicar nada.
-- ============================================================

begin;

create temp table _import (
  fecha date, monto numeric, descripcion text, categoria text, tarjeta text, moneda text
) on commit drop;

insert into _import (fecha, monto, descripcion, categoria, tarjeta, moneda) values`];

const values = filas.map((c) =>
  `  ('${c.fecha}', ${c.monto}, '${esc(c.descripcion)}', '${categoriaDe(c.descripcion)}', '${c.tarjeta}', '${c.moneda}')`
);
sql.push(values.join(',\n') + ';');

sql.push(`
-- Sólo lo que todavía no está: el match es por fecha + monto + descripción.
insert into public.gastos (id, monto, descripcion, categoria, tarjeta, moneda, fecha, created_at)
select gen_random_uuid(), i.monto, i.descripcion, i.categoria, i.tarjeta, i.moneda, i.fecha, i.fecha::timestamptz
  from _import i
 where not exists (
   select 1 from public.gastos g
    where g.user_id = auth.uid()
      and g.fecha = i.fecha
      and round(g.monto::numeric, 2) = round(i.monto::numeric, 2)
      and coalesce(g.descripcion, '') = i.descripcion
 );

commit;

-- Verificación: cuánto quedó por mes.
select to_char(fecha, 'YYYY-MM') as mes, count(*) as movimientos,
       sum(monto) filter (where moneda = 'ARS') as pesos,
       sum(monto) filter (where moneda = 'USD') as dolares
  from public.gastos
 where user_id = auth.uid()
 group by 1 order by 1;`);

const dest = path.join(__dirname, '..', '..', 'supabase', 'gastos-historial-2026-08.sql');
fs.writeFileSync(dest, sql.join('\n'));

// Reporte
const fmt = (n) => '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
const porMes = {};
for (const c of filas) {
  const m = c.fecha.slice(0, 7);
  porMes[m] = porMes[m] || { n: 0, ars: 0, usd: 0 };
  porMes[m].n++;
  if (c.moneda === 'USD') porMes[m].usd += c.monto; else porMes[m].ars += c.monto;
}
console.log(`${filas.length} consumos → ${path.resolve(dest)}\n`);
console.log('=== GASTO VARIABLE POR MES (lo que va a mostrar el flujo) ===');
const max = Math.max(...Object.values(porMes).map((v) => v.ars));
for (const m of Object.keys(porMes).sort()) {
  const v = porMes[m];
  console.log(`${m}  ${String(v.n).padStart(3)} mov  ${fmt(v.ars).padStart(13)}${
    v.usd ? ` +US$ ${v.usd.toFixed(2)}` : ''}  ${'█'.repeat(Math.round((v.ars / max) * 34))}`);
}

const porCat = {};
for (const c of filas) {
  if (c.moneda !== 'ARS') continue;
  const k = categoriaDe(c.descripcion);
  porCat[k] = (porCat[k] || 0) + c.monto;
}
console.log('\n=== POR CATEGORÍA (todo el período) ===');
for (const [k, v] of Object.entries(porCat).sort((a, b) => b[1] - a[1])) {
  console.log(`${k.padEnd(12)} ${fmt(v).padStart(14)}`);
}
