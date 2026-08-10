-- ============================================================
-- DIAGNÓSTICO: ¿los datos entraron con tu user_id o con NULL?
--
-- En el SQL Editor de Supabase las consultas corren como el rol `postgres`,
-- NO como tu usuario logueado. Ahí `auth.uid()` devuelve **NULL**.
--
-- Consecuencia: los INSERT de los scripts pusieron `user_id = NULL` (viene del
-- default `auth.uid()`), y los UPDATE con `where user_id = auth.uid()` no
-- tocaron nada, porque en SQL `NULL = NULL` es falso.
--
-- Las filas están en la base, pero la app NO las ve: RLS filtra por
-- `user_id = auth.uid()` y ninguna matchea. Por eso la verificación devolvió
-- "0 rows" aunque el script haya dicho Success.
--
-- Corré esto para ver el estado. No modifica nada.
-- ============================================================

-- 1. Tu user_id (el que la app usa cuando estás logueado)
select id as tu_user_id, email, last_sign_in_at
  from auth.users
 order by last_sign_in_at desc nulls last;

-- 2. Cuántas filas quedaron huérfanas (user_id NULL) en cada tabla
select 'gastos'      as tabla, count(*) filter (where user_id is null) as sin_dueno, count(*) as total from public.gastos
union all select 'cuotas',      count(*) filter (where user_id is null), count(*) from public.cuotas
union all select 'recurrentes', count(*) filter (where user_id is null), count(*) from public.recurrentes
union all select 'inversiones', count(*) filter (where user_id is null), count(*) from public.inversiones
union all select 'ahorros',     count(*) filter (where user_id is null), count(*) from public.ahorros
union all select 'medios_pago', count(*) filter (where user_id is null), count(*) from public.medios_pago
order by 1;
