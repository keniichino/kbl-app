-- ============================================================================
-- KBL App — Candado real: Auth multi-usuario + RLS
-- ============================================================================
-- Corré TODO este script en el SQL Editor de Supabase (proyecto KBL APP).
-- Es idempotente: podés correrlo más de una vez sin romper nada.
--
-- Qué hace:
--   1. Agrega la columna user_id (dueño de la fila) a cada tabla, con default
--      auth.uid() → el server la completa solo en cada INSERT autenticado.
--   2. Rediseña foco_active para que haya UNA sesión activa POR usuario.
--   3. Enciende RLS y crea policies "cada uno ve y toca SOLO lo suyo".
--
-- Después de correrlo, ningún dato es accesible sin estar logueado, y cada
-- usuario queda aislado del resto. La anon key pública deja de ser una llave.
-- ============================================================================

-- ------------------------------------------------------------------ user_id
-- Tablas que ya existían: les sumamos el dueño. auth.uid() como default hace
-- que el cliente NI SIQUIERA tenga que mandar el user_id al insertar.
alter table public.foco_sessions add column if not exists user_id uuid
  references auth.users(id) on delete cascade default auth.uid();
alter table public.gastos        add column if not exists user_id uuid
  references auth.users(id) on delete cascade default auth.uid();
alter table public.notas         add column if not exists user_id uuid
  references auth.users(id) on delete cascade default auth.uid();
alter table public.cuotas        add column if not exists user_id uuid
  references auth.users(id) on delete cascade default auth.uid();

-- --------------------------------------------------------------- foco_active
-- Antes era una fila única (id=1) compartida. Ahora: una fila por usuario,
-- con user_id como clave primaria. Es estado efímero (la sesión en curso),
-- no hay datos valiosos, así que la recreamos limpia.
drop table if exists public.foco_active;
create table public.foco_active (
  user_id      uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  start_ts     timestamptz,
  duration_min int,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------- RLS
-- Encendemos Row Level Security en las 5 tablas. Con RLS activa y sin policy,
-- NADIE puede leer ni escribir: las policies de abajo abren solo lo propio.
alter table public.foco_sessions enable row level security;
alter table public.foco_active   enable row level security;
alter table public.gastos        enable row level security;
alter table public.notas         enable row level security;
alter table public.cuotas        enable row level security;

-- ------------------------------------------------------------------ policies
-- Una policy "for all" por tabla: el usuario logueado solo ve/inserta/edita/
-- borra las filas donde user_id = su propio auth.uid().
--   using       → qué filas puede LEER/afectar
--   with check  → qué filas puede CREAR/dejar (evita insertar a nombre de otro)
do $$
declare t text;
begin
  foreach t in array array['foco_sessions','foco_active','gastos','notas','cuotas']
  loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ----------------------------------------------------------------- realtime
-- Aseguramos que las 5 tablas estén en la publicación de Realtime (idempotente).
-- Con RLS activa, Realtime solo emite a cada usuario los cambios de SUS filas.
do $$
declare t text;
begin
  foreach t in array array['foco_sessions','foco_active','gastos','notas','cuotas']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- ya estaba en la publicación
    end;
  end loop;
end $$;

-- ============================================================================
-- Listo. Próximo paso: en Authentication → Providers, asegurate de que
-- "Email" esté habilitado. Si querés poder entrar sin confirmar el mail cada
-- vez (más cómodo para uso personal), desactivá "Confirm email" en
-- Authentication → Providers → Email. Con amigos reales, dejalo activado.
-- ============================================================================
