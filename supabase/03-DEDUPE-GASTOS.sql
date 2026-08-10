-- ============================================================
-- Sacar los gastos duplicados SIN llevarse puestos los consumos
-- que de verdad se repiten.
--
-- POR QUÉ EXISTE ESTE SCRIPT
-- El 09/08/2026 se borraron ~350 gastos duplicados a mano, sin dejar el
-- criterio escrito. Esa limpieza no aguantó: la app los reinsertó uno por uno
-- en la siguiente apertura, porque `mergeListPull` (app/js/store.js) trataba
-- "está en localStorage pero no en el server" como "lo creaste offline" y lo
-- re-empujaba. Se pasó de 342 a 666 filas.
--
-- ORDEN CORRECTO (importante):
--   1. Tener deployado el fix de store.js (commit ce60e07) y abrir la app con
--      Ctrl+Shift+R para saltear el service worker. Sin eso, este borrado se
--      revierte solo igual que la vez anterior.
--   2. Recién ahí correr este script.
--
-- POR QUÉ NO ALCANZA UN DEDUPE POR CONTENIDO
-- El resumen de la tarjeta tiene consumos repetidos REALES: mismo día, mismo
-- comercio, mismo monto. Por ejemplo 'JUAN VALDEZ CAFE V URQ' $5500 dos veces
-- el 09/03, o las cuotas de EDUCACIONIT que entran 10 veces iguales el 31/03.
-- Un `delete ... where row_number() > 1` te borra esos consumos de verdad.
-- Ya estaba advertido en 02-ARREGLAR-DUPLICADOS.sql:
--   "Dos consumos idénticos el mismo día son posibles de verdad (dos cafés),
--    así que acá SÓLO se listan: el borrado queda para revisar a ojo."
--
-- CRITERIO DE ESTE SCRIPT
-- Para cada combinación (fecha, descripción, monto, moneda, tarjeta) se
-- conservan tantas filas como diga el resumen de la tarjeta, y una sola para
-- todo lo demás. La tabla `esperado` de abajo la generó
-- scratchpad/repetidos.js leyendo tools/resumenes/consumos-*.json.
--
-- RESULTADO ESPERADO: 666 -> 345 filas.
-- Son 3 más que las 342 del 09/08 a la mañana: consumos repetidos legítimos
-- que aquella limpieza había borrado de más.
--
-- REVERSIBLE: public.gastos_backup_pre_dedupe tiene las 666 filas previas.
-- (public.gastos_backup_20260809 tiene las 692 de antes de la primera limpieza.)
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP, ref jcsenhpuvvbxcxapoaia).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Red de seguridad: si el backup no existe, crearlo antes de borrar nada.
-- ------------------------------------------------------------
create table if not exists public.gastos_backup_pre_dedupe as
  select * from public.gastos;

-- ------------------------------------------------------------
-- 1. ANTES
-- ------------------------------------------------------------
select 'ANTES' as momento, count(*) as filas from public.gastos;

-- ------------------------------------------------------------
-- 2. El borrado
-- ------------------------------------------------------------
with esperado(fecha, descripcion, monto, moneda, tarjeta, n) as (values
  ('2026-03-09'::date, 'JUAN VALDEZ CAFE V URQ', 5500::numeric, 'ARS', 'mac', 2),
  ('2026-03-02'::date, 'MERPAGO*VIRTUALDIXSHO', 72408.36::numeric, 'ARS', 'mac', 5),
  ('2026-03-31'::date, 'MERPAGO*EDUCACIONIT', 23869.1::numeric, 'ARS', 'mac', 2),
  ('2026-03-31'::date, 'MERPAGO*EDUCACIONIT', 16810::numeric, 'ARS', 'mac', 10),
  ('2026-04-01'::date, 'MERPAGO*FEMMTO', 4662::numeric, 'ARS', 'mac', 5),
  ('2026-03-12'::date, 'TICKETEK', 26666.66::numeric, 'ARS', 'mac', 4),
  ('2026-03-31'::date, 'MERPAGO*EDUCACIONIT', 23869.08::numeric, 'ARS', 'mac', 8),
  ('2026-05-03'::date, 'NIKE UNICENTER', 66666.33::numeric, 'ARS', 'mac', 2),
  ('2026-05-04'::date, 'ONE VISION', 20000::numeric, 'ARS', 'mac', 3),
  ('2026-05-07'::date, 'MERPAGO*LATRIESTINA', 36500::numeric, 'ARS', 'mac', 2),
  ('2026-06-13'::date, 'MERPAGO*MERCADOLIBRE', 23213.19::numeric, 'ARS', 'mac', 2),
  ('2026-06-19'::date, 'MERPAGO*ELECTROANDPOW', 14000::numeric, 'ARS', 'mac', 2),
  ('2026-07-05'::date, 'MERPAGO*MERCADOLIBRE', -23213.19::numeric, 'ARS', 'mac', 2),
  ('2026-05-31'::date, 'ZARA', 35336.66::numeric, 'ARS', 'visa', 2),
  ('2026-06-17'::date, 'MERPAGO*OGGIZAPATOS', 22110::numeric, 'ARS', 'visa', 2),
  ('2026-04-17'::date, 'MERPAGO*IXPETS', 16177.67::numeric, 'ARS', 'mp', 2),
  ('2026-06-11'::date, 'MERPAGO*MERCADOLIBRE', 23999.75::numeric, 'ARS', 'mp', 2)
),
rankeadas as (
  select g.id,
         row_number() over (
           partition by g.fecha, g.descripcion, g.monto, g.moneda, g.tarjeta
           order by g.id
         ) as pos,
         coalesce(e.n, 1) as permitidas
    from public.gastos g
    left join esperado e
      on e.fecha = g.fecha
     and e.descripcion = g.descripcion
     and e.monto = g.monto
     and e.moneda = g.moneda
     and coalesce(e.tarjeta, '') = coalesce(g.tarjeta, '')
)
delete from public.gastos g
 using rankeadas r
 where g.id = r.id
   and r.pos > r.permitidas;

-- ------------------------------------------------------------
-- 3. DESPUÉS: tiene que dar 345
-- ------------------------------------------------------------
select 'DESPUES' as momento, count(*) as filas from public.gastos;

-- Control: el Juan Valdez del 09/03 tiene que seguir apareciendo DOS veces.
select fecha, descripcion, monto, count(*) as veces
  from public.gastos
 where descripcion = 'JUAN VALDEZ CAFE V URQ' and fecha = '2026-03-09'
 group by 1, 2, 3;

-- ------------------------------------------------------------
-- 4. Cuando la app se vea bien, tirar los respaldos:
--      drop table public.gastos_backup_pre_dedupe;
--      drop table public.gastos_backup_20260809;
-- ------------------------------------------------------------
