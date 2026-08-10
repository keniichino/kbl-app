-- ============================================================
-- Inversiones: operaciones de broker (compra, venta, dividendo).
-- Idempotente: se puede correr las veces que haga falta.
-- Mismo modelo de aislamiento que el resto: user_id + RLS.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP), no en el de la empresa.
--
-- Por qué guardamos comisiones y gastos aparte del precio:
-- en una compra de 40 NFLX a $2.448 salieron $98.512,42 de la cuenta, pero
-- lo que quedó invertido son $97.920. Los $592,42 de diferencia son costo de
-- transacción: plata que no vuelve nunca. Si se sumaran al costo unitario, el
-- rendimiento saldría maquillado y no se podría medir cuánto te cuesta operar.
-- ============================================================

create table if not exists public.inversiones (
  id               uuid primary key,
  user_id          uuid not null default auth.uid(),
  fecha            date not null,
  tipo             text not null default 'compra',
  instrumento      text not null,               -- NFLX, AL30, BTC, ...
  clase            text,                        -- cedear, accion, bono, fci, cripto, dolar, plazofijo
  cantidad         numeric not null,
  precio_unitario  numeric not null,
  moneda           text not null default 'ARS',
  comisiones       numeric not null default 0,
  gastos_op        numeric not null default 0,  -- "gastos de operación" / derechos de mercado
  broker           text,
  nota             text,
  -- Registro de tesis: por qué comprás, a cuánto pensás vender, en qué plazo
  -- y qué te haría estar equivocado. Se escribe ANTES de saber el resultado,
  -- que es lo único que después permite medir si acertás o te acordás mal.
  tesis            text,
  precio_objetivo  numeric,
  fecha_objetivo   date,
  invalidacion     text,
  created_at       timestamptz not null default now()
);

-- Columnas agregadas después de la primera versión de la tabla.
alter table public.inversiones add column if not exists tesis text;
alter table public.inversiones add column if not exists precio_objetivo numeric;
alter table public.inversiones add column if not exists fecha_objetivo date;
alter table public.inversiones add column if not exists invalidacion text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inversiones_tipo_chk') then
    alter table public.inversiones add constraint inversiones_tipo_chk
      check (tipo in ('compra', 'venta', 'dividendo', 'renta'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inversiones_moneda_chk') then
    alter table public.inversiones add constraint inversiones_moneda_chk
      check (moneda in ('ARS', 'USD'));
  end if;
end $$;

-- ---------- Candado (RLS) ----------
alter table public.inversiones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inversiones' and policyname = 'own_rows') then
    create policy own_rows on public.inversiones for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists inversiones_user_fecha_idx on public.inversiones(user_id, fecha);
create index if not exists inversiones_user_instr_idx on public.inversiones(user_id, instrumento);

-- ---------- Realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inversiones') then
    alter publication supabase_realtime add table public.inversiones;
  end if;
end $$;
