-- ============================================================
-- Gastos por cuenta de otro (reintegrables).
--
-- El caso que lo motivó: $56.775 de una multa de ACARA pagados por el padre,
-- que después transfirió $80.000. Esa plata salió de la caja pero NO es
-- consumo propio: contarla como gasto infla el mes y arruina el promedio de
-- variable, la alerta de "día caro" y el ritmo del mes.
--
-- Tres estados:
--   null         → gasto propio (todo lo que ya tenías cargado sigue igual)
--   'pendiente'  → lo pagaste vos y te lo deben
--   'cobrado'    → ya te lo devolvieron
--
-- Un gasto 'pendiente' o 'cobrado' no suma en ninguna de las dos bases de
-- cálculo del panel; aparece en su propia sección con el saldo de lo que te
-- deben. Si nunca te lo devuelven, lo pasás a propio y ahí sí cuenta.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP), no en el de la empresa.
-- Idempotente.
-- ============================================================

alter table public.gastos add column if not exists reintegro text;
alter table public.gastos add column if not exists reintegro_de text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gastos_reintegro_chk') then
    alter table public.gastos add constraint gastos_reintegro_chk
      check (reintegro is null or reintegro in ('pendiente', 'cobrado'));
  end if;
end $$;

-- Para la consulta de "qué me deben", que filtra por estado.
create index if not exists gastos_reintegro_idx
  on public.gastos(user_id, reintegro) where reintegro is not null;
