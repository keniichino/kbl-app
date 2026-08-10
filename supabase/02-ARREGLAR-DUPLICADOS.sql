-- ============================================================
-- Sacar las cuotas de MP duplicadas.
--
-- Estado: 9 cuotas activas por $ 623.105,63 cuando deberían ser 6 por
-- $ 471.809,77. La diferencia ($ 151.295,86) es exactamente las tres compras
-- del 7 de agosto (49.900 + 56.000 + 45.395,77) contadas dos veces.
--
-- Por qué el guard del script no las frenó: comparaba
--   user_id = mi_id AND round(monto_cuota,2) = X AND cuota_total = Y
-- así que si la fila previa tenía OTRO user_id (o el `select ... into mi_id`
-- resolvió un usuario distinto entre corridas), no la encontraba e insertaba
-- una nueva al lado. Este script no depende de user_id para deduplicar.
--
-- Las filas duplicadas son idénticas entre sí (mismo monto, mismo total,
-- misma cuota), así que quedarse con cualquiera de ellas es equivalente:
-- se conserva la más reciente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ANTES: qué hay
-- ------------------------------------------------------------
select 'ANTES' as momento, count(*) as activas, sum(monto_cuota) as total
  from public.cuotas where tarjeta = 'mp' and estado = 'activa';

select id, user_id, descripcion, monto_cuota, cuota_actual, cuota_total, estado, created_at
  from public.cuotas where tarjeta = 'mp'
 order by monto_cuota desc, created_at;

-- ------------------------------------------------------------
-- 2. Deduplicar: se queda la fila más nueva de cada combinación
--    (monto, cantidad de cuotas, estado). No mira user_id a propósito.
-- ------------------------------------------------------------
with rankeadas as (
  select id,
         row_number() over (
           partition by tarjeta, round(monto_cuota::numeric, 2), cuota_total, estado
           order by created_at desc nulls last, id
         ) as pos
    from public.cuotas
   where tarjeta = 'mp'
)
delete from public.cuotas c
 using rankeadas r
 where c.id = r.id and r.pos > 1;

-- ------------------------------------------------------------
-- 3. DESPUÉS: tiene que dar 6 activas y $ 471.809,77
-- ------------------------------------------------------------
select 'DESPUES' as momento, count(*) as activas, sum(monto_cuota) as total
  from public.cuotas where tarjeta = 'mp' and estado = 'activa';

select descripcion, cuota_actual || '/' || cuota_total as cuota, monto_cuota,
       (cuota_total - cuota_actual + 1) as restantes,
       (cuota_total - cuota_actual + 1) * monto_cuota as pendiente
  from public.cuotas
 where tarjeta = 'mp' and estado = 'activa'
 order by monto_cuota desc;

-- ------------------------------------------------------------
-- 4. Lo mismo para gastos, por si el doble insert también pasó ahí.
--    Dos consumos idénticos el mismo día son posibles de verdad (dos cafés),
--    así que acá SÓLO se listan: el borrado queda para revisar a ojo.
-- ------------------------------------------------------------
select fecha, descripcion, monto, count(*) as veces
  from public.gastos
 group by fecha, descripcion, monto
having count(*) > 1
 order by count(*) desc, fecha desc
 limit 30;

select 'gastos totales' as que, count(*) as n from public.gastos;
