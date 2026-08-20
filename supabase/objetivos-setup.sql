-- ============================================================================
-- Objetivos de ahorro — 2026-08-19
--
-- Un objetivo es una meta con monto y (opcional) fecha. El PROGRESO no se
-- escribe a mano: sale de los movimientos de `ahorros` que apuntan a ese
-- objetivo vía `ahorros.objetivo_id`. Así no puede existir un objetivo que
-- diga "80% cumplido" sin plata real detrás.
-- ============================================================================

create table if not exists public.objetivos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre          text not null,
  monto_objetivo  numeric not null check (monto_objetivo > 0),
  moneda          text not null default 'ARS' check (moneda in ('ARS','USD')),
  fecha_objetivo  date,
  prioridad       smallint not null default 2 check (prioridad between 1 and 3),
  estado          text not null default 'activo' check (estado in ('activo','cumplido','pausado','cancelado')),
  nota            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Vínculo aporte -> objetivo. NULL = ahorro general (sin destino asignado).
alter table public.ahorros
  add column if not exists objetivo_id uuid references public.objetivos(id) on delete set null;

create index if not exists ahorros_objetivo_idx on public.ahorros (objetivo_id);
create index if not exists objetivos_user_estado_idx on public.objetivos (user_id, estado);

alter table public.objetivos enable row level security;

drop policy if exists "objetivos propios" on public.objetivos;
create policy "objetivos propios" on public.objetivos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Progreso calculado: aportes menos retiros, por objetivo y moneda.
create or replace view public.objetivos_progreso as
select o.id,
       o.user_id,
       o.nombre,
       o.monto_objetivo,
       o.moneda,
       o.fecha_objetivo,
       o.prioridad,
       o.estado,
       coalesce(sum(case when a.tipo = 'retiro' then -a.monto else a.monto end)
                filter (where a.moneda = o.moneda), 0) as acumulado
from public.objetivos o
left join public.ahorros a on a.objetivo_id = o.id
group by o.id;
