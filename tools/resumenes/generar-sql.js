// Genera el SQL para poblar `recurrentes` con las suscripciones y fijos
// detectados en los resúmenes, cada uno con su `historial` mes a mes.
//
// Criterio de moneda: el resumen de Mastercard liquida en dólares todo lo del
// exterior, pero el paréntesis dice la moneda REAL de la operación. Netflix
// figura como US$ 13,34 y se facturó $ 19.999: guardarla en USD haría que el
// panel la revalúe con la cotización del día y muestre un costo que no es.
// Entonces: si el paréntesis dice ARS, va en pesos con el importe facturado.
//
// No ejecuta nada. Escribe un .sql para revisar y correr a mano.

const fs = require('fs');
const path = require('path');
const consumos = require('./consumos.json');

// Los resúmenes de abril–agosto contienen consumos de marzo a julio (el cierre
// es a mitad de mes), así que el historial real cubre marzo–julio.
const MESES = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

// Catálogo curado: qué es cada cosa. La detección automática confunde una
// compra en 3 cuotas con una suscripción, así que esto se decide a mano.
const CATALOGO = [
  { nombre: 'Adobe',            match: /ADOBE/i,                    tipo: 'suscripcion', moneda: 'ARS', dia: 22, medio: 'mac' },
  { nombre: 'Spotify',          match: /Spotify/i,                  tipo: 'suscripcion', moneda: 'ARS', dia: 19, medio: 'mac' },
  // Netflix viene cobrado de dos formas y no es lo mismo: por DLocal (Visa) el
  // importe ya trae IVA y percepciones ($30.198), e internacional (Mastercard)
  // viene limpio ($19.999). $19.999 × 1,51 = $30.198,49 exacto. Se normaliza al
  // precio de lista: si no, la app iba a avisar "Netflix bajó 34%" en mayo, que
  // es falso — no bajó el precio, cambió quién cobra.
  { nombre: 'Netflix',          match: /NETFLIX/i,                  tipo: 'suscripcion', moneda: 'ARS', dia: 29, medio: 'mac',
    normalizar: (m) => (m > 25000 ? 19999 : m) },
  { nombre: 'YouTube Premium',  match: /YouTubeP/i,                 tipo: 'suscripcion', moneda: 'ARS', dia: 26, medio: 'mac' },
  // Sólo el cargo mensual de $683: el de $58 es otro ítem y el Xbox Game Pass
  // ($11.999) es un servicio aparte que va en su propia fila.
  { nombre: 'Microsoft 365',    match: /Microsoft\*?Subscr/i,       tipo: 'suscripcion', moneda: 'ARS', dia: 11, medio: 'mac',
    soloSi: (m) => m > 400 },
  { nombre: 'Xbox Game Pass',   match: /Microsoft\*Xbox/i,          tipo: 'suscripcion', moneda: 'ARS', dia: 3,  medio: 'mac' },
  { nombre: 'Mercado Libre',    match: /MERPAGO\*MELI\b|^MELI$/i,   tipo: 'suscripcion', moneda: 'ARS', dia: 23, medio: 'mac' },
  { nombre: 'CapCut',           match: /CapCut/i,                   tipo: 'suscripcion', moneda: 'USD', dia: 14, medio: 'mac' },
  { nombre: 'Google One',       match: /Google O/i,                 tipo: 'suscripcion', moneda: 'USD', dia: 26, medio: 'mac' },
  { nombre: 'Apple',            match: /APPLE\.COM\/BILL/i,         tipo: 'suscripcion', moneda: 'USD', dia: 13, medio: 'mac' },
  { nombre: 'Steam',            match: /STEAMGAMES/i,               tipo: 'suscripcion', moneda: 'USD', dia: 10, medio: 'visa' },
  { nombre: 'Personal Flow',    match: /PERSFLOW/i,                 tipo: 'fijo',        moneda: 'ARS', dia: 14, medio: 'mac' },
  { nombre: 'Facultad (UADE)',  match: /UADE/i,                     tipo: 'fijo',        moneda: 'ARS', dia: 13, medio: 'visa' },
];

const esc = (s) => String(s).replace(/'/g, "''");
const r2 = (n) => Math.round(n * 100) / 100;

const filas = [];
const reporte = [];

for (const c of CATALOGO) {
  const hist = {};
  const vistos = [];
  for (const r of consumos) {
    if (r.cuota) continue;                       // una cuota no es una suscripción
    if (!c.match.test(r.descripcion) && !c.match.test(r.comercio)) continue;
    // Importe real: si el paréntesis dice ARS, ese es el que pagaste.
    const enArs = r.monedaOriginal === 'ARS';
    let monto = enArs ? r.montoOriginal : r.monto;
    const moneda = enArs ? 'ARS' : r.moneda;
    if (moneda !== c.moneda) continue;           // descarta el cargo en la otra moneda
    if (c.soloSi && !c.soloSi(monto)) continue;
    if (c.normalizar) monto = c.normalizar(monto);
    // El mes va por la FECHA DEL CONSUMO, no por el período del resumen: el
    // ciclo de facturación no coincide con el mes calendario. El resumen de
    // junio traía dos cargos de Personal Flow (12/05 y 10/06) y el de julio
    // ninguno — agrupar por resumen mostraba $79.986 en junio y $0 en julio,
    // cuando en realidad fueron $34.020 en mayo y $45.966 en junio.
    const mes = r.fecha.slice(0, 7);
    hist[mes] = r2((hist[mes] || 0) + monto);
    vistos.push(r);
  }
  const mesesConDato = Object.keys(hist).sort();
  if (!mesesConDato.length) { reporte.push(`  (sin datos) ${c.nombre}`); continue; }

  const ultimo = hist[mesesConDato.at(-1)];
  // El texto con el que la app va a matchear los gastos que ya tengas cargados.
  const coincide = (vistos[0].comercio || c.nombre).toLowerCase().slice(0, 24);

  filas.push({ ...c, hist, monto: ultimo, coincide, n: vistos.length, mesesConDato });
  reporte.push(`  ${c.nombre.padEnd(18)} ${c.tipo.padEnd(11)} ${c.moneda}  ${
    mesesConDato.length}m  último ${c.moneda === 'USD' ? 'US$ ' + ultimo.toFixed(2) : '$ ' + ultimo.toLocaleString('es-AR')}`);
}

// ---------- SQL ----------
const sql = [];
sql.push(`-- ============================================================
-- Suscripciones y gastos fijos con su historial real abril–agosto 2026,
-- extraídos de los resúmenes de Galicia (Visa + Mastercard).
--
-- Los 10 resúmenes cierran contra el total del banco: Mastercard al centavo,
-- Visa con hasta $70 de diferencia por centavos de impuestos redondeados.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP), no en el de la empresa.
--
-- Idempotente por nombre: si ya tenés el concepto cargado, ACTUALIZA su
-- historial en vez de duplicarlo. No borra nada.
--
-- Nota de moneda: Netflix, Spotify, YouTube y Microsoft se facturan en PESOS
-- aunque el resumen de Mastercard las liquide en dólares (el paréntesis del
-- PDF dice la moneda real). Van en ARS con el importe facturado, que es lo que
-- realmente sale de tu bolsillo. Apple, Google One, CapCut y Steam sí son en
-- dólares de verdad.
-- ============================================================

begin;
`);

for (const f of filas) {
  // Historial con los meses ordenados, para que se lea al abrir la fila.
  const histJson = JSON.stringify(Object.fromEntries(
    Object.entries(f.hist).sort(([a], [b]) => a.localeCompare(b))
  ));
  // `insert ... where not exists` y no `on conflict`: la PK es un uuid nuevo en
  // cada corrida, así que un ON CONFLICT nunca dispara y el concepto se
  // duplicaría en cada ejecución. La unicidad que importa acá es el nombre.
  sql.push(`-- ${f.nombre}: ${f.mesesConDato.length} meses de historial (${f.n} cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), '${f.tipo}', '${esc(f.nombre)}', '', ${f.monto}, '${f.moneda}', ${f.dia}, '${f.medio}', 'activo',
       '${esc(f.coincide)}', '${esc(histJson)}'::jsonb, '${f.mesesConDato[0]}-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('${esc(f.nombre)}')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '${esc(histJson)}'::jsonb,
       monto = ${f.monto}, moneda = '${f.moneda}', tipo = '${f.tipo}',
       dia = coalesce(dia, ${f.dia}), medio = coalesce(nullif(medio, ''), '${f.medio}'),
       coincide = coalesce(nullif(coincide, ''), '${esc(f.coincide)}'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('${esc(f.nombre)}');
`);
}

// ---------- Sueldo ----------
// De los recibos que hay en la carpeta. El de JUN 2026 tiene un "Descuento
// Anticipo" de $800.000: el neto que figura ($1.356.747) no es lo que ganás,
// es lo que te quedó por cobrar después de un adelanto que ya habías recibido.
// Para el panel manda el neto SIN el anticipo, que es tu ingreso real del mes.
const SUELDO = {
  '2025-08': 1783126,      // recibo MES AGO 2025
  '2026-06': 2156747,      // recibo MES JUN 2026: 2.598.490,25 − 441.743,35 de aportes
};
sql.push(`-- Sueldo, de los recibos de la carpeta. OJO: sólo hay 3 recibos (ago-2025,
-- SAC dic-2025 y jun-2026), así que la curva de ingreso queda con huecos.
-- Para que las alertas de erosión funcionen bien faltan los recibos de
-- marzo a mayo y julio-agosto 2026.
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'ingreso', 'Sueldo', '', ${SUELDO['2026-06']}, 'ARS', 6, 'debito', 'activo',
       '', '${esc(JSON.stringify(SUELDO))}'::jsonb, '2025-08-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and tipo = 'ingreso' and lower(nombre) = 'sueldo'
 );

update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '${esc(JSON.stringify(SUELDO))}'::jsonb,
       updated_at = now()
 where user_id = auth.uid() and tipo = 'ingreso' and lower(nombre) = 'sueldo';
`);

sql.push(`commit;

-- Verificación: mirá que el historial quedó bien antes de confiar en las curvas.
select nombre, tipo, moneda, monto,
       jsonb_object_keys(historial) as mes, historial->>jsonb_object_keys(historial) as importe
  from public.recurrentes
 where user_id = auth.uid()
 order by tipo, nombre, mes;`);

const dest = path.join(__dirname, 'recurrentes-historial.sql');
fs.writeFileSync(dest, sql.join('\n'));

console.log('=== CONCEPTOS A CARGAR ===');
console.log(reporte.join('\n'));
console.log(`\nSQL escrito en: ${dest}`);
console.log('\n=== HISTORIAL MES A MES ===');
const w = 17;
console.log('CONCEPTO'.padEnd(w) + MESES.map((m) => m.slice(5).padStart(12)).join(''));
for (const f of filas) {
  const fmt = (n) => n == null ? '—' : (f.moneda === 'USD' ? 'US$ ' + n.toFixed(2) : '$ ' + Math.round(n).toLocaleString('es-AR'));
  console.log(f.nombre.slice(0, w - 1).padEnd(w) + MESES.map((m) => fmt(f.hist[m]).padStart(12)).join(''));
}
