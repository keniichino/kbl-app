-- ============================================================
-- REPARACIÓN: asignarte las filas que quedaron con user_id NULL
--
-- Por qué hace falta: en el SQL Editor las consultas corren como el rol
-- `postgres`, no como tu usuario logueado, así que `auth.uid()` devuelve NULL.
-- Los INSERT de los scripts tomaron ese NULL como default y las filas quedaron
-- sin dueño; RLS filtra por `user_id = auth.uid()`, así que la app no las ve.
--
-- Esto las adopta. Sólo toca filas con user_id NULL: lo que ya tenía dueño
-- queda intacto.
--
-- Es idempotente: si lo corrés dos veces, la segunda no encuentra nada que
-- hacer.
--
-- ANTES DE CORRERLO: si en tu proyecto hay MÁS DE UN usuario en auth.users,
-- pará y reemplazá el `(select id from auth.users ...)` por tu UUID a mano.
-- Con un solo usuario, como es tu caso, funciona tal cual.
-- ============================================================

do $$
declare
  mi_id uuid;
  cuantos int;
begin
  -- El usuario que se logueó más recientemente. Con una sola cuenta, sos vos.
  select id into mi_id
    from auth.users
   order by last_sign_in_at desc nulls last
   limit 1;

  if mi_id is null then
    raise exception 'No hay ningún usuario en auth.users. ¿Entraste alguna vez a la app?';
  end if;

  if (select count(*) from auth.users) > 1 then
    raise warning 'Hay más de un usuario en auth.users: se asigna todo a %. Revisá que sea el correcto.', mi_id;
  end if;

  update public.gastos      set user_id = mi_id where user_id is null;
  get diagnostics cuantos = row_count; raise notice 'gastos: % filas adoptadas', cuantos;

  update public.cuotas      set user_id = mi_id where user_id is null;
  get diagnostics cuantos = row_count; raise notice 'cuotas: % filas adoptadas', cuantos;

  update public.recurrentes set user_id = mi_id where user_id is null;
  get diagnostics cuantos = row_count; raise notice 'recurrentes: % filas adoptadas', cuantos;

  update public.inversiones set user_id = mi_id where user_id is null;
  get diagnostics cuantos = row_count; raise notice 'inversiones: % filas adoptadas', cuantos;

  update public.ahorros     set user_id = mi_id where user_id is null;
  get diagnostics cuantos = row_count; raise notice 'ahorros: % filas adoptadas', cuantos;

  update public.medios_pago set user_id = mi_id where user_id is null;
  get diagnostics cuantos = row_count; raise notice 'medios_pago: % filas adoptadas', cuantos;
end $$;

-- ------------------------------------------------------------
-- Los UPDATE de los scripts tampoco corrieron (su `where user_id = auth.uid()`
-- nunca matcheó), así que los conceptos que YA existían no recibieron su
-- historial. Se vuelven a aplicar acá, ahora sí contra el user_id real.
-- ------------------------------------------------------------

-- ¿Quedó algún concepto duplicado? (uno tuyo viejo + uno del script).
-- Esto SÓLO los lista. El borrado va aparte y comentado a propósito: borrar
-- filas automáticamente en la misma corrida que las repara es la clase de
-- cosa que se lamenta después.
select nombre, count(*) as veces,
       string_agg(coalesce(monto::text, '?') || ' ' || moneda || ' · ' ||
                  (select count(*) from jsonb_object_keys(historial))::text || ' meses', '  |  ') as versiones
  from public.recurrentes
 group by lower(nombre), nombre
having count(*) > 1;

-- Si la consulta de arriba devuelve algo, MIRÁ cuál conviene conservar y
-- después descomentá este bloque: se queda con la versión que tenga más
-- historial y borra el resto.
--
-- with rankeados as (
--   select id,
--          row_number() over (
--            partition by user_id, lower(nombre)
--            order by (select count(*) from jsonb_object_keys(historial)) desc,
--                     updated_at desc
--          ) as pos
--     from public.recurrentes
-- )
-- delete from public.recurrentes r using rankeados k
--  where r.id = k.id and k.pos > 1;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select 'gastos por mes' as que, to_char(fecha, 'YYYY-MM') as mes, count(*) as n,
       round(sum(monto) filter (where moneda = 'ARS')) as pesos
  from public.gastos group by 1, 2 order by 2;

select 'recurrentes' as que, tipo, nombre, moneda, monto,
       (select count(*) from jsonb_object_keys(historial)) as meses_de_historial
  from public.recurrentes order by tipo, nombre;

select 'cuotas activas' as que, tarjeta, descripcion,
       cuota_actual || '/' || cuota_total as cuota, monto_cuota
  from public.cuotas where estado = 'activa' order by tarjeta, monto_cuota desc;
