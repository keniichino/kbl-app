-- ============================================================
-- Panel financiero: recurrentes (ingresos, gastos fijos,
-- suscripciones) + movimientos de ahorro.
-- Idempotente: se puede correr las veces que haga falta.
-- Mismo modelo de aislamiento que el resto: user_id + RLS.
-- ============================================================

-- ---------- Recurrentes ----------
-- Un renglón por concepto que se repite todos los meses.
-- `historial` guarda cuánto valió cada mes: {"2026-07": 480000, "2026-08": 520000}
-- Eso es lo que permite ver qué sube y qué baja sin depender de la memoria.
create table if not exists public.recurrentes (
  id          uuid primary key,
  user_id     uuid not null default auth.uid(),
  tipo        text not null default 'fijo',
  nombre      text not null,
  categoria   text,
  monto       numeric not null default 0,
  moneda      text not null default 'ARS',
  dia         int,
  medio       text,
  estado      text not null default 'activo',
  coincide    text,
  historial   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.recurrentes add column if not exists coincide text;
alter table public.recurrentes add column if not exists historial jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recurrentes_tipo_chk') then
    alter table public.recurrentes add constraint recurrentes_tipo_chk
      check (tipo in ('ingreso', 'fijo', 'suscripcion'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurrentes_moneda_chk') then
    alter table public.recurrentes add constraint recurrentes_moneda_chk
      check (moneda in ('ARS', 'USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurrentes_estado_chk') then
    alter table public.recurrentes add constraint recurrentes_estado_chk
      check (estado in ('activo', 'pausado'));
  end if;
end $$;

-- ---------- Ahorros ----------
-- Movimientos, no saldo: el stock se calcula sumando. Así queda el rastro
-- de cuándo aportaste y cuándo tuviste que sacar.
create table if not exists public.ahorros (
  id          uuid primary key,
  user_id     uuid not null default auth.uid(),
  fecha       date not null,
  monto       numeric not null,
  moneda      text not null default 'ARS',
  tipo        text not null default 'aporte',
  destino     text,
  nota        text,
  created_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ahorros_tipo_chk') then
    alter table public.ahorros add constraint ahorros_tipo_chk
      check (tipo in ('aporte', 'retiro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ahorros_moneda_chk') then
    alter table public.ahorros add constraint ahorros_moneda_chk
      check (moneda in ('ARS', 'USD'));
  end if;
end $$;

-- ---------- Candado (RLS) ----------
alter table public.recurrentes enable row level security;
alter table public.ahorros     enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recurrentes' and policyname = 'own_rows') then
    create policy own_rows on public.recurrentes for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ahorros' and policyname = 'own_rows') then
    create policy own_rows on public.ahorros for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists recurrentes_user_idx on public.recurrentes(user_id);
create index if not exists ahorros_user_fecha_idx on public.ahorros(user_id, fecha);

-- ---------- Realtime ----------
-- Para que un alta hecha en la compu aparezca sola en el celular.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurrentes') then
    alter publication supabase_realtime add table public.recurrentes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ahorros') then
    alter publication supabase_realtime add table public.ahorros;
  end if;
end $$;
