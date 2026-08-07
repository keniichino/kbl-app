-- ============================================================
-- Medios de pago: bancos + tarjetas, cada uno con SU día de cierre
-- y SU día de vencimiento. Reemplaza los 4 valores fijos
-- (visa/mac/mp/efectivo) hardcodeados en el JS por una tabla real
-- que se puede ampliar (nuevo banco, nueva tarjeta) sin tocar código.
-- Idempotente: se puede correr las veces que haga falta.
-- ============================================================

create table if not exists public.medios_pago (
  id              uuid primary key,
  user_id         uuid not null default auth.uid(),
  banco           text,
  nombre          text not null,
  key             text not null,
  dia_cierre      int,
  dia_vencimiento int,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.medios_pago add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'medios_pago_dia_cierre_chk') then
    alter table public.medios_pago add constraint medios_pago_dia_cierre_chk
      check (dia_cierre is null or (dia_cierre between 1 and 31));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'medios_pago_dia_venc_chk') then
    alter table public.medios_pago add constraint medios_pago_dia_venc_chk
      check (dia_vencimiento is null or (dia_vencimiento between 1 and 31));
  end if;
end $$;

-- `key` es lo que gastos.tarjeta / cuotas.tarjeta usan para referenciar la
-- fila (ej. 'visa'). Único por usuario, no global.
create unique index if not exists medios_pago_user_key_idx on public.medios_pago(user_id, key);

-- ---------- Candado (RLS) ----------
alter table public.medios_pago enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'medios_pago' and policyname = 'own_rows') then
    create policy own_rows on public.medios_pago for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists medios_pago_user_idx on public.medios_pago(user_id);

-- ---------- Realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'medios_pago') then
    alter publication supabase_realtime add table public.medios_pago;
  end if;
end $$;

-- ---------- Sembrado: los 4 medios de hoy, sin inventar cierre/vencimiento ----------
-- No hay un "usuario admin": se siembra para cada user_id que ya aparece en
-- cuotas o gastos, así ningún dato viejo se queda sin su medio de pago.
-- dia_cierre/dia_vencimiento quedan en null a propósito — se cargan una vez
-- desde la app con los datos reales de cada resumen.
insert into public.medios_pago (id, user_id, banco, nombre, key, dia_cierre, dia_vencimiento, activo)
select gen_random_uuid(), u.user_id, seed.banco, seed.nombre, seed.key, null, null, true
from (
  select distinct user_id from public.cuotas
  union
  select distinct user_id from public.gastos where user_id is not null
) u
cross join (values
  ('Galicia', 'Visa', 'visa'),
  ('Galicia', 'Mastercard', 'mac'),
  ('Mercado Pago', 'Mercado Pago', 'mp'),
  (null, 'Efectivo', 'efectivo')
) as seed(banco, nombre, key)
on conflict (user_id, key) do nothing;

-- ---------- Sacar el CHECK viejo de 4 valores fijos ----------
-- `tarjeta` en gastos/cuotas pasa a validarse contra medios_pago.key desde
-- el cliente (mismo criterio que categoria, que tampoco tiene CHECK acá).
-- Se busca el constraint por columna en vez de por nombre fijo porque el
-- nombre auto-generado por Postgres puede variar entre entornos.
do $$
declare r record;
begin
  for r in
    select con.conname, rel.relname as tabla
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname in ('cuotas', 'gastos') and att.attname = 'tarjeta' and con.contype = 'c'
  loop
    execute format('alter table public.%I drop constraint %I', r.tabla, r.conname);
  end loop;
end $$;
