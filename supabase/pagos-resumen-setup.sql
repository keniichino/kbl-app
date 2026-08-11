-- ============================================================
-- pagos_resumen: ledger real de "pagué el resumen de esta tarjeta,
-- este período, este monto, este día". Hasta ahora "pagado" era una
-- deducción de `cuotas.cuota_actual`, así que sólo existía para planes
-- en cuotas, nunca para compras en un pago, no guardaba fecha ni monto
-- real, y un click de más no se podía deshacer sin tocar cuotas.
--
-- Esta tabla es ADITIVA: no reemplaza a `cuotas.cuota_actual` (que sigue
-- avanzando igual, para que "vas por la cuota 3 de 6" siga andando), es
-- el registro de lo que salió de verdad de la cuenta — la base para
-- comparar contra el débito real del banco y para marcar como pagado un
-- período que incluye compras en un pago (que `cuotas` no ve).
--
-- Idempotente: se puede correr las veces que haga falta.
-- ============================================================

create table if not exists public.pagos_resumen (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid(),
  tarjeta               text not null,
  periodo               text not null,  -- 'YYYY-MM', el mes de vencimiento (mismo criterio que cuotas.fecha_primer_venc y gastosPorPeriodo)
  fecha_pago            date not null,
  monto_ars             numeric(12, 2) not null default 0,
  monto_usd             numeric(12, 2) not null default 0,
  -- Lo que la app había calculado (cuotas + compras del período) al momento
  -- de marcar el pago. Si el monto real difiere (impuestos, redondeos,
  -- devoluciones que la app no modela), la diferencia queda a la vista en vez
  -- de perderse.
  monto_ars_calculado  numeric(12, 2),
  monto_usd_calculado  numeric(12, 2),
  -- Ids de las cuotas que este pago avanzó, para que "Deshacer" sepa
  -- exactamente cuáles retroceder sin adivinar por fecha/tarjeta.
  cuota_ids             jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.pagos_resumen add column if not exists monto_ars_calculado numeric(12, 2);
alter table public.pagos_resumen add column if not exists monto_usd_calculado numeric(12, 2);
alter table public.pagos_resumen add column if not exists cuota_ids jsonb not null default '[]'::jsonb;
alter table public.pagos_resumen add column if not exists updated_at timestamptz not null default now();

-- Un pago por tarjeta y período: volver a marcar "ya lo pagué" en el mismo
-- período actualiza el registro existente (onConflict) en vez de duplicarlo.
create unique index if not exists pagos_resumen_user_tarjeta_periodo_idx
  on public.pagos_resumen(user_id, tarjeta, periodo);

-- ---------- Candado (RLS) ----------
alter table public.pagos_resumen enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagos_resumen' and policyname = 'own_rows') then
    create policy own_rows on public.pagos_resumen for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists pagos_resumen_user_idx on public.pagos_resumen(user_id);

-- ---------- Realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pagos_resumen') then
    alter publication supabase_realtime add table public.pagos_resumen;
  end if;
end $$;
