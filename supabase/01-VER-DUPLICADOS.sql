-- ============================================================
-- Por qué hay cuotas repetidas: sólo mira, no toca nada.
--
-- El guard del script era
--   if exists (... round(monto_cuota::numeric,2) = 56000 and cuota_total = 2)
-- así que dos filas con el MISMO monto y el MISMO total no deberían poder
-- coexistir. Que existan significa que algo de esa comparación no matchea:
-- el candidato más probable es `cuota_total` distinto (una en 2 cuotas y otra
-- en 3), o un monto que no es exactamente igual al redondear.
-- ============================================================

-- 1. Todas las cuotas de MP con su ficha completa, para ver qué las diferencia
select id, descripcion, monto_cuota, cuota_actual, cuota_total,
       fecha_primer_venc, estado, created_at
  from public.cuotas
 where tarjeta = 'mp'
 order by monto_cuota desc, created_at;

-- 2. Agrupadas: cuáles están repetidas de verdad
select monto_cuota, cuota_total, count(*) as veces,
       string_agg(distinct descripcion, ' | ') as descripciones,
       string_agg(distinct estado, ',') as estados,
       string_agg(distinct cuota_actual::text, ',') as cuotas_actuales,
       min(created_at) as primera, max(created_at) as ultima
  from public.cuotas
 where tarjeta = 'mp'
 group by monto_cuota, cuota_total
having count(*) > 1
 order by monto_cuota desc;

-- 3. ¿Cuánto suma el mes que viene? Si hay duplicados, este número está inflado.
select count(*) as cuotas_activas,
       sum(monto_cuota) as total_septiembre
  from public.cuotas
 where tarjeta = 'mp' and estado = 'activa';
