-- ============================================================
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

-- Adobe: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Adobe', '', 9381.13, 'ARS', 22, 'mac', 'activo',
       'adobe', '{"2026-03":9381.13,"2026-04":9381.13,"2026-05":9381.13,"2026-06":9381.13,"2026-07":9381.13}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Adobe')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":9381.13,"2026-04":9381.13,"2026-05":9381.13,"2026-06":9381.13,"2026-07":9381.13}'::jsonb,
       monto = 9381.13, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 22), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'adobe'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Adobe');

-- Spotify: 5 meses de historial (10 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Spotify', '', 5098, 'ARS', 19, 'mac', 'activo',
       'spotify', '{"2026-03":5098,"2026-04":5098,"2026-05":5098,"2026-06":5098,"2026-07":5098}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Spotify')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":5098,"2026-04":5098,"2026-05":5098,"2026-06":5098,"2026-07":5098}'::jsonb,
       monto = 5098, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 19), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'spotify'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Spotify');

-- Netflix: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Netflix', '', 19999, 'ARS', 29, 'mac', 'activo',
       'dlocal*netflix com', '{"2026-03":19999,"2026-04":19999,"2026-05":19999,"2026-06":19999,"2026-07":19999}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Netflix')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":19999,"2026-04":19999,"2026-05":19999,"2026-06":19999,"2026-07":19999}'::jsonb,
       monto = 19999, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 29), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'dlocal*netflix com'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Netflix');

-- YouTube Premium: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'YouTube Premium', '', 4499, 'ARS', 26, 'mac', 'activo',
       'youtubep', '{"2026-03":3399,"2026-04":3399,"2026-05":3399,"2026-06":3399,"2026-07":4499}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('YouTube Premium')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":3399,"2026-04":3399,"2026-05":3399,"2026-06":3399,"2026-07":4499}'::jsonb,
       monto = 4499, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 26), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'youtubep'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('YouTube Premium');

-- Microsoft 365: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Microsoft 365', '', 683, 'ARS', 11, 'mac', 'activo',
       'microsoft*subscr', '{"2026-03":683,"2026-04":683,"2026-05":683,"2026-06":683,"2026-07":683}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Microsoft 365')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":683,"2026-04":683,"2026-05":683,"2026-06":683,"2026-07":683}'::jsonb,
       monto = 683, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 11), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'microsoft*subscr'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Microsoft 365');

-- Xbox Game Pass: 2 meses de historial (2 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Xbox Game Pass', '', 11999, 'ARS', 3, 'mac', 'activo',
       'microsoft*xbox g', '{"2026-04":11999,"2026-05":11999}'::jsonb, '2026-04-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Xbox Game Pass')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-04":11999,"2026-05":11999}'::jsonb,
       monto = 11999, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 3), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'microsoft*xbox g'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Xbox Game Pass');

-- Mercado Libre: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Mercado Libre', '', 3490, 'ARS', 23, 'mac', 'activo',
       'meli', '{"2026-03":3490,"2026-04":3490,"2026-05":3490,"2026-06":3490,"2026-07":3490}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Mercado Libre')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":3490,"2026-04":3490,"2026-05":3490,"2026-06":3490,"2026-07":3490}'::jsonb,
       monto = 3490, moneda = 'ARS', tipo = 'suscripcion',
       dia = coalesce(dia, 23), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'meli'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Mercado Libre');

-- CapCut: 4 meses de historial (4 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'CapCut', '', 13.99, 'USD', 14, 'mac', 'activo',
       'capcut', '{"2026-03":13.99,"2026-04":13.99,"2026-05":13.99,"2026-06":13.99}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('CapCut')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":13.99,"2026-04":13.99,"2026-05":13.99,"2026-06":13.99}'::jsonb,
       monto = 13.99, moneda = 'USD', tipo = 'suscripcion',
       dia = coalesce(dia, 14), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'capcut'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('CapCut');

-- Google One: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Google One', '', 1.99, 'USD', 26, 'mac', 'activo',
       'google o', '{"2026-03":1.99,"2026-04":1.99,"2026-05":1.99,"2026-06":1.99,"2026-07":1.99}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Google One')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":1.99,"2026-04":1.99,"2026-05":1.99,"2026-06":1.99,"2026-07":1.99}'::jsonb,
       monto = 1.99, moneda = 'USD', tipo = 'suscripcion',
       dia = coalesce(dia, 26), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'google o'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Google One');

-- Apple: 4 meses de historial (7 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Apple', '', 5.37, 'USD', 13, 'mac', 'activo',
       'apple.com/bill', '{"2026-03":2.99,"2026-04":2.99,"2026-06":4.18,"2026-07":5.37}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Apple')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":2.99,"2026-04":2.99,"2026-06":4.18,"2026-07":5.37}'::jsonb,
       monto = 5.37, moneda = 'USD', tipo = 'suscripcion',
       dia = coalesce(dia, 13), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'apple.com/bill'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Apple');

-- Steam: 4 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'suscripcion', 'Steam', '', 5, 'USD', 10, 'visa', 'activo',
       'steamgames.com 425952298', '{"2026-04":5,"2026-05":5,"2026-06":5.97,"2026-07":5}'::jsonb, '2026-04-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Steam')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-04":5,"2026-05":5,"2026-06":5.97,"2026-07":5}'::jsonb,
       monto = 5, moneda = 'USD', tipo = 'suscripcion',
       dia = coalesce(dia, 10), medio = coalesce(nullif(medio, ''), 'visa'),
       coincide = coalesce(nullif(coincide, ''), 'steamgames.com 425952298'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Steam');

-- Personal Flow: 5 meses de historial (5 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'fijo', 'Personal Flow', '', 46882.51, 'ARS', 14, 'mac', 'activo',
       'persflow51310002', '{"2026-03":31766.41,"2026-04":32871.61,"2026-05":34020.01,"2026-06":45966.01,"2026-07":46882.51}'::jsonb, '2026-03-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Personal Flow')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":31766.41,"2026-04":32871.61,"2026-05":34020.01,"2026-06":45966.01,"2026-07":46882.51}'::jsonb,
       monto = 46882.51, moneda = 'ARS', tipo = 'fijo',
       dia = coalesce(dia, 14), medio = coalesce(nullif(medio, ''), 'mac'),
       coincide = coalesce(nullif(coincide, ''), 'persflow51310002'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Personal Flow');

-- Facultad (UADE): 1 meses de historial (1 cargos leídos)
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'fijo', 'Facultad (UADE)', '', 272000, 'ARS', 13, 'visa', 'activo',
       'www.uade.edu.ar', '{"2026-07":272000}'::jsonb, '2026-07-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and lower(nombre) = lower('Facultad (UADE)')
 );

-- Si ya existía, se le agrega el historial sin pisar lo que hayas puesto a mano.
update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2026-07":272000}'::jsonb,
       monto = 272000, moneda = 'ARS', tipo = 'fijo',
       dia = coalesce(dia, 13), medio = coalesce(nullif(medio, ''), 'visa'),
       coincide = coalesce(nullif(coincide, ''), 'www.uade.edu.ar'),
       updated_at = now()
 where user_id = auth.uid() and lower(nombre) = lower('Facultad (UADE)');

-- Sueldo, de los recibos de la carpeta. OJO: sólo hay 3 recibos (ago-2025,
-- SAC dic-2025 y jun-2026), así que la curva de ingreso queda con huecos.
-- Para que las alertas de erosión funcionen bien faltan los recibos de
-- marzo a mayo y julio-agosto 2026.
insert into public.recurrentes (id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
select gen_random_uuid(), 'ingreso', 'Sueldo', '', 2156747, 'ARS', 6, 'debito', 'activo',
       '', '{"2025-08":1783126,"2026-06":2156747}'::jsonb, '2025-08-01', now()
 where not exists (
   select 1 from public.recurrentes
    where user_id = auth.uid() and tipo = 'ingreso' and lower(nombre) = 'sueldo'
 );

update public.recurrentes
   set historial = coalesce(historial, '{}'::jsonb) || '{"2025-08":1783126,"2026-06":2156747}'::jsonb,
       updated_at = now()
 where user_id = auth.uid() and tipo = 'ingreso' and lower(nombre) = 'sueldo';

commit;

-- Verificación: mirá que el historial quedó bien antes de confiar en las curvas.
select nombre, tipo, moneda, monto,
       jsonb_object_keys(historial) as mes, historial->>jsonb_object_keys(historial) as importe
  from public.recurrentes
 where user_id = auth.uid()
 order by tipo, nombre, mes;