-- ============================================================
-- Cuotas de Mercado Pago — resumen de SEPTIEMBRE 2026 (cierre 5/9, vence 10/9)
--
-- Reemplaza a cuotas-mp-2026-08.sql: este ya trae las tres compras del 7 de
-- agosto que todavía no estaban, y deja cada cuota en el número que le
-- corresponde después de pagar el resumen de agosto.
--
-- Las tres compras nuevas del 7/8 comprometen $ 347.987 en total y hacen que
-- septiembre pase de $ 320.514 a $ 471.810.
--
-- OJO: la captura del resumen de septiembre estaba cortada (se veía hasta
-- "6 de junio"), así que el 3/3 del volante está INFERIDO de la serie 1/3 → 2/3.
-- Es la cuota más grande ($ 280.337), así que conviene confirmarla contra el
-- resumen real. Si aparece algo más, hay que agregarlo a mano.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP), no en el de la empresa.
-- Idempotente: matchea por monto + cantidad de cuotas.
-- ============================================================

begin;

-- ---------- Compras nuevas del 7 de agosto (primera cuota vence 10/9) ----------

-- Mercado Libre $49.900 en 2 cuotas
insert into public.cuotas (id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
select gen_random_uuid(), 'Mercado Libre', 'mp', 49900, 1, 2, '2026-09-10', 'activa', 'ARS', '2026-08-07'
 where not exists (select 1 from public.cuotas where user_id = auth.uid()
   and tarjeta = 'mp' and round(monto_cuota::numeric,2) = 49900 and cuota_total = 2);

-- Mercado Libre $56.000 en 2 cuotas
insert into public.cuotas (id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
select gen_random_uuid(), 'Mercado Libre', 'mp', 56000, 1, 2, '2026-09-10', 'activa', 'ARS', '2026-08-07'
 where not exists (select 1 from public.cuotas where user_id = auth.uid()
   and tarjeta = 'mp' and round(monto_cuota::numeric,2) = 56000 and cuota_total = 2);

-- Mercado Libre $45.395,77 en 3 cuotas
insert into public.cuotas (id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
select gen_random_uuid(), 'Mercado Libre', 'mp', 45395.77, 1, 3, '2026-09-10', 'activa', 'ARS', '2026-08-07'
 where not exists (select 1 from public.cuotas where user_id = auth.uid()
   and tarjeta = 'mp' and round(monto_cuota::numeric,2) = 45395.77 and cuota_total = 3);

-- ---------- Las que venían: avanzan una cuota al pagar el resumen de agosto ----------

-- IXPETS: pasa a 5 de 9 (quedan 5 = $ 80.888)
update public.cuotas set cuota_actual = 5, fecha_primer_venc = '2026-09-10', estado = 'activa'
 where user_id = auth.uid() and tarjeta = 'mp'
   and round(monto_cuota::numeric,2) = 16177.67 and cuota_total = 9;

-- Volante del auto (en el resumen figura como MERPAGO*ARRAYSRL).
-- Compra del 06/06/2026 por $ 841.010 en 3 cuotas: la más grande de todas,
-- un tercio de todo lo que se debe en cuotas. Pasa a 3 de 3, es la última.
-- Se le pone nombre real porque "ARRAYSRL" en la lista no dice nada dentro de
-- seis meses.
update public.cuotas
   set cuota_actual = 3, fecha_primer_venc = '2026-09-10', estado = 'activa',
       descripcion = 'Volante del auto'
 where user_id = auth.uid() and tarjeta = 'mp'
   and round(monto_cuota::numeric,2) = 280336.67 and cuota_total = 3;

-- Mercado Libre $23.999,75: pasa a 3 de 4 (quedan 2 = $ 48.000)
update public.cuotas set cuota_actual = 3, fecha_primer_venc = '2026-09-10', estado = 'activa'
 where user_id = auth.uid() and tarjeta = 'mp'
   and round(monto_cuota::numeric,2) = 23999.75 and cuota_total = 4;

-- ---------- Las dos que se terminan con el resumen de agosto ----------
-- MERCADOLIBRE 6/6 ($23.102,64) y ELECTROWORLD 2/2 ($40.272,74) no aparecen en
-- el resumen de septiembre: eran sus últimas cuotas. Se cierran acá para que
-- dejen de contar como deuda — son $63.375 por mes que se liberan.
update public.cuotas set estado = 'completada'
 where user_id = auth.uid() and tarjeta = 'mp'
   and round(monto_cuota::numeric,2) in (23102.64, 40272.74);

commit;

-- Verificación: el total de septiembre tiene que dar $ 471.809,77
-- (49.900 + 56.000 + 45.395,77 + 16.177,67 + 280.336,67 + 23.999,75).
select descripcion, cuota_actual || '/' || cuota_total as cuota, monto_cuota,
       (cuota_total - cuota_actual + 1) as restantes,
       (cuota_total - cuota_actual + 1) * monto_cuota as pendiente
  from public.cuotas
 where user_id = auth.uid() and tarjeta = 'mp' and estado = 'activa'
 order by monto_cuota desc;

select sum(monto_cuota) as total_septiembre
  from public.cuotas
 where user_id = auth.uid() and tarjeta = 'mp' and estado = 'activa';
