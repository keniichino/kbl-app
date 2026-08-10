// Genera UN solo SQL con todo: limpieza de lo que quedó mal + la carga
// completa (gastos, recurrentes, cuotas de MP).
//
// Por qué se reescribió: la primera tanda usaba `auth.uid()` para el user_id y
// para los guards anti-duplicados. En el SQL Editor de Supabase las consultas
// corren como el rol `postgres`, no como el usuario logueado, así que
// `auth.uid()` devuelve NULL. Dos consecuencias:
//
//   1. Las filas entraron con user_id NULL y la app no las ve (RLS filtra por
//      user_id = auth.uid()).
//   2. El guard `where not exists (... where g.user_id = auth.uid() ...)` nunca
//      encontraba nada, porque en SQL `NULL = NULL` es falso. Resultado: cada
//      corrida insertaba TODO de nuevo. Por eso había 644 gastos = 322 × 2.
//
// Ahora el user_id se resuelve UNA vez dentro de un bloque plpgsql, leyéndolo
// de auth.users, y todos los guards lo usan. Idempotente de verdad.

const fs = require('fs');
const path = require('path');

const galicia = require('./consumos-2026-08.json');
let mp = [];
try { mp = require('./consumos-mp.json'); } catch { /* sin MP */ }

const esc = (s) => String(s || '').replace(/'/g, "''").slice(0, 120);
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- Gastos ----------
const CATS = [
  [/COTO|CARREFOUR|DIA\b|JUMBO|VEA\b|DISCO|CHANGOMAS|Market |Express |KSKAGRO|AUTOSERVICIO|VITAL|MAXICONSUMO/i, 'super'],
  [/RAPPI|PEDIDOSYA|MCDONALDS|MC DONALDS|BURGER|STARBUCKS|CAFE|CAF[EÉ]|MOSTAZA|SUBWAY|HAVANNA|PORTANEGRA|OGGI|PIZZA|SUSHI|PARRILLA|EMPANADA|HELADO|GRIDO|PANADER/i, 'comida'],
  [/UBER|DIDI|CABIFY|SUBE|YPF|SHELL|AXION|PUMA|ESTACION|PEAJE|AUSA|ACARA|PATENTE|SEGURO AUTO|ARRAYSRL/i, 'transporte'],
  [/NETFLIX|SPOTIFY|YOUTUBE|DISNEY|HBO|MAX\b|PRIME|APPLE|GOOGLE|MICROSOFT|ADOBE|CAPCUT|STEAM|CLAUD|ANTHROPIC|OPENAI|CHATGPT|PERSFLOW|PERSONAL|MOVISTAR|CLARO|FIBERTEL|TELECENTRO|MELI\b|MERCADOLIBRE/i, 'servicios'],
  [/HOYTS|CINEMARK|CINE|TICKETEK|TEATRO|BAR\b|BOLICHE|OPEN25|MOOI|VERA801/i, 'salidas'],
  [/FARMACIA|FARMACITY|GIMNASIO|SPORTCLUB|MEDIC|DENTAL|OPTIC|SALUD|HOSPITAL/i, 'salud'],
  [/UADE|EDUCACIONIT|UNIVERSIDAD|COLEGIO|CURSO|ALQUILER|EXPENSAS|EDENOR|EDESUR|METROGAS|AYSA|ABL/i, 'casa'],
];
const categoriaDe = (d) => (CATS.find(([re]) => re.test(d)) || [null, 'otros'])[1];
const YA_DECLARADO = /ADOBE|Spotify|NETFLIX|YouTubeP|Microsoft\*?Subscr|Microsoft\*Xbox|MERPAGO\*MELI|CapCut|Google O|APPLE\.COM\/BILL|STEAMGAMES|PERSFLOW|UADE/i;
const DESDE = '2026-01-01';

const vistos = new Set();
const gastos = [...galicia, ...mp]
  .filter((c) => !c.cuota && c.fecha >= DESDE && !YA_DECLARADO.test(c.descripcion) && c.monto > 0)
  .filter((c) => {
    // El comprobante va en la clave: sin el, dos consumos reales del mismo dia,
    // mismo comercio y mismo monto se contaban como uno y el segundo se perdia.
    // Pasa de verdad: JUAN VALDEZ del 09/03 son dos cafes, comprobantes 04657 y
    // 04658, los dos en el resumen de abril. Para lo que si viene repetido en
    // dos resumenes distintos el comprobante es el mismo, asi que el dedupe
    // entre lotes sigue funcionando igual.
    const k = `${c.tarjeta}|${c.fecha}|${Math.round(c.monto * 100)}|${(c.descripcion || '').slice(0, 20)}|${c.comprobante || ''}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  })
  .sort((a, b) => a.fecha.localeCompare(b.fecha));

// ---------- Recurrentes ----------
const CATALOGO = [
  { nombre: 'Adobe',           match: /ADOBE/i,              tipo: 'suscripcion', moneda: 'ARS', dia: 22, medio: 'mac' },
  { nombre: 'Spotify',         match: /Spotify/i,            tipo: 'suscripcion', moneda: 'ARS', dia: 19, medio: 'mac' },
  { nombre: 'Netflix',         match: /NETFLIX/i,            tipo: 'suscripcion', moneda: 'ARS', dia: 29, medio: 'mac', normalizar: (m) => (m > 25000 ? 19999 : m) },
  { nombre: 'YouTube Premium', match: /YouTubeP/i,           tipo: 'suscripcion', moneda: 'ARS', dia: 26, medio: 'mac' },
  { nombre: 'Microsoft 365',   match: /Microsoft\*?Subscr/i, tipo: 'suscripcion', moneda: 'ARS', dia: 11, medio: 'mac', soloSi: (m) => m > 400 },
  { nombre: 'Xbox Game Pass',  match: /Microsoft\*Xbox/i,    tipo: 'suscripcion', moneda: 'ARS', dia: 3,  medio: 'mac' },
  { nombre: 'Mercado Libre',   match: /MERPAGO\*MELI\b|^MELI$/i, tipo: 'suscripcion', moneda: 'ARS', dia: 23, medio: 'mac' },
  { nombre: 'CapCut',          match: /CapCut/i,             tipo: 'suscripcion', moneda: 'USD', dia: 14, medio: 'mac' },
  { nombre: 'Google One',      match: /Google O/i,           tipo: 'suscripcion', moneda: 'USD', dia: 26, medio: 'mac' },
  { nombre: 'Apple',           match: /APPLE\.COM\/BILL/i,   tipo: 'suscripcion', moneda: 'USD', dia: 13, medio: 'mac' },
  { nombre: 'Steam',           match: /STEAMGAMES/i,         tipo: 'suscripcion', moneda: 'USD', dia: 10, medio: 'visa' },
  { nombre: 'Personal Flow',   match: /PERSFLOW/i,           tipo: 'fijo',        moneda: 'ARS', dia: 14, medio: 'mac' },
  { nombre: 'Facultad (UADE)', match: /UADE/i,               tipo: 'fijo',        moneda: 'ARS', dia: 13, medio: 'visa' },
];

const recurrentes = [];
for (const c of CATALOGO) {
  const hist = {};
  const usados = [];
  for (const r of [...galicia, ...mp]) {
    if (r.cuota) continue;
    if (!c.match.test(r.descripcion) && !c.match.test(r.comercio)) continue;
    const enArs = r.monedaOriginal === 'ARS';
    let monto = enArs ? r.montoOriginal : r.monto;
    const moneda = enArs ? 'ARS' : r.moneda;
    if (moneda !== c.moneda) continue;
    if (c.soloSi && !c.soloSi(monto)) continue;
    if (c.normalizar) monto = c.normalizar(monto);
    const mes = r.fecha.slice(0, 7);
    hist[mes] = r2((hist[mes] || 0) + monto);
    usados.push(r);
  }
  const meses = Object.keys(hist).sort();
  if (!meses.length) continue;
  recurrentes.push({
    ...c, hist: Object.fromEntries(meses.map((m) => [m, hist[m]])),
    monto: hist[meses.at(-1)], desde: meses[0],
    coincide: (usados[0].comercio || c.nombre).toLowerCase().slice(0, 24),
  });
}
// Sueldo (de los recibos de la carpeta)
recurrentes.push({
  nombre: 'Sueldo', tipo: 'ingreso', moneda: 'ARS', dia: 6, medio: 'debito', coincide: '',
  hist: { '2025-08': 1783126, '2026-06': 2156747 }, monto: 2156747, desde: '2025-08',
});

// ---------- Cuotas de MP (último resumen) ----------
const ultimoMp = [...new Set(mp.map((c) => c.periodo))].sort().at(-1);
const cuotasMp = mp.filter((c) => c.periodo === ultimoMp && c.cuota);
// Las tres compras del 7/8 que sólo se vieron en la captura del resumen de
// septiembre, más el avance de las que ya venían.
const CUOTAS_SEP = [
  { desc: 'Mercado Libre',    monto: 49900,     n: 1, total: 2, fecha: '2026-08-07' },
  { desc: 'Mercado Libre',    monto: 56000,     n: 1, total: 2, fecha: '2026-08-07' },
  { desc: 'Mercado Libre',    monto: 45395.77,  n: 1, total: 3, fecha: '2026-08-07' },
  { desc: 'IXPETS',           monto: 16177.67,  n: 5, total: 9, fecha: '2026-04-17' },
  { desc: 'Volante del auto', monto: 280336.67, n: 3, total: 3, fecha: '2026-06-06' },
  { desc: 'Mercado Libre',    monto: 23999.75,  n: 3, total: 4, fecha: '2026-06-11' },
];
const VENC_SEP = '2026-09-10';
// Las dos que terminaron con el resumen de agosto.
const CERRAR = [23102.64, 40272.74];

// ============================================================
const sql = [];
sql.push(`-- ============================================================
-- CARGA COMPLETA — reemplaza a los scripts anteriores
--
-- POR QUÉ HAY QUE CORRER ESTE Y NO LOS DE ANTES:
-- los anteriores usaban auth.uid() para el user_id y para los guards
-- anti-duplicados. En el SQL Editor eso vale NULL (las consultas corren como
-- el rol postgres, no como tu usuario), así que:
--   · las filas entraron sin dueño y la app no las ve;
--   · el guard nunca detectaba lo ya insertado, y cada corrida duplicaba todo
--     (por eso quedaron 644 gastos = 322 x 2).
--
-- Este resuelve el user_id UNA vez desde auth.users y lo usa en todos lados.
-- Empieza limpiando lo que quedó huérfano, así que se puede correr tantas
-- veces como haga falta sin duplicar nada.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP).
-- ============================================================

do $$
declare
  mi_id uuid;
  n int;
begin
  select id into mi_id from auth.users order by last_sign_in_at desc nulls last limit 1;
  if mi_id is null then
    raise exception 'No hay usuarios en auth.users';
  end if;
  raise notice 'Usando user_id = %', mi_id;

  ---------------------------------------------------------------
  -- 1. Limpieza de lo que quedó sin dueño en las corridas fallidas
  ---------------------------------------------------------------
  delete from public.gastos where user_id is null;
  get diagnostics n = row_count; raise notice 'gastos huerfanos borrados: %', n;

  delete from public.cuotas where user_id is null;
  get diagnostics n = row_count; raise notice 'cuotas huerfanas borradas: %', n;

  delete from public.recurrentes where user_id is null;
  get diagnostics n = row_count; raise notice 'recurrentes huerfanos borrados: %', n;

  ---------------------------------------------------------------
  -- 2. Gastos (${gastos.length} consumos, ${gastos[0].fecha} a ${gastos.at(-1).fecha})
  ---------------------------------------------------------------
  create temp table if not exists _imp_gastos (
    fecha date, monto numeric, descripcion text, categoria text, tarjeta text, moneda text
  ) on commit drop;
  delete from _imp_gastos;

  insert into _imp_gastos (fecha, monto, descripcion, categoria, tarjeta, moneda) values`);

sql.push(gastos.map((c) =>
  `    ('${c.fecha}', ${c.monto}, '${esc(c.descripcion)}', '${categoriaDe(c.descripcion)}', '${c.tarjeta}', '${c.moneda}')`
).join(',\n') + ';');

sql.push(`
  insert into public.gastos (id, user_id, monto, descripcion, categoria, tarjeta, moneda, fecha, created_at)
  select gen_random_uuid(), mi_id, i.monto, i.descripcion, i.categoria, i.tarjeta, i.moneda, i.fecha, i.fecha::timestamptz
    from _imp_gastos i
   where not exists (
     select 1 from public.gastos g
      where g.user_id = mi_id and g.fecha = i.fecha
        and round(g.monto::numeric, 2) = round(i.monto::numeric, 2)
        and coalesce(g.descripcion, '') = i.descripcion
   );
  get diagnostics n = row_count; raise notice 'gastos insertados: %', n;

  ---------------------------------------------------------------
  -- 3. Suscripciones, fijos e ingreso con su historial
  ---------------------------------------------------------------`);

for (const r of recurrentes) {
  const h = esc(JSON.stringify(r.hist));
  sql.push(`
  -- ${r.nombre}
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('${esc(r.nombre)}')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '${h}'::jsonb,
           monto = ${r.monto}, moneda = '${r.moneda}', tipo = '${r.tipo}',
           dia = coalesce(dia, ${r.dia}), medio = coalesce(nullif(medio, ''), '${r.medio}'),
           coincide = coalesce(nullif(coincide, ''), '${esc(r.coincide)}'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('${esc(r.nombre)}');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, '${r.tipo}', '${esc(r.nombre)}', '', ${r.monto}, '${r.moneda}', ${r.dia}, '${r.medio}', 'activo',
            '${esc(r.coincide)}', '${h}'::jsonb, '${r.desde}-01', now());
  end if;`);
}

sql.push(`
  ---------------------------------------------------------------
  -- 4. Cuotas de Mercado Pago (resumen de septiembre, vence ${VENC_SEP})
  ---------------------------------------------------------------`);

for (const c of CUOTAS_SEP) {
  sql.push(`
  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = ${c.monto} and cuota_total = ${c.total}) then
    update public.cuotas
       set cuota_actual = ${c.n}, fecha_primer_venc = '${VENC_SEP}', estado = 'activa', descripcion = '${esc(c.desc)}'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = ${c.monto} and cuota_total = ${c.total};
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, '${esc(c.desc)}', 'mp', ${c.monto}, ${c.n}, ${c.total}, '${VENC_SEP}', 'activa', 'ARS', '${c.fecha}');
  end if;`);
}

sql.push(`
  -- Las dos que terminaron con el resumen de agosto: dejan de contar como deuda.
  update public.cuotas set estado = 'completada'
   where user_id = mi_id and tarjeta = 'mp'
     and round(monto_cuota::numeric,2) in (${CERRAR.join(', ')});

  raise notice 'LISTO';
end $$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select 'huerfanos que quedan' as que, count(*) as n from public.gastos where user_id is null;

select to_char(fecha, 'YYYY-MM') as mes, count(*) as movimientos,
       round(sum(monto) filter (where moneda = 'ARS')) as pesos
  from public.gastos group by 1 order by 1;

select tipo, nombre, moneda, monto,
       (select count(*) from jsonb_object_keys(historial)) as meses_historial
  from public.recurrentes order by tipo, nombre;

select tarjeta, descripcion, cuota_actual || '/' || cuota_total as cuota, monto_cuota
  from public.cuotas where estado = 'activa' and tarjeta = 'mp' order by monto_cuota desc;`);

const dest = path.join(__dirname, '..', '..', 'supabase', 'CARGA-COMPLETA.sql');
fs.writeFileSync(dest, sql.join('\n'));
console.log(`${gastos.length} gastos · ${recurrentes.length} recurrentes · ${CUOTAS_SEP.length} cuotas MP`);
console.log(`→ ${path.resolve(dest)}`);
