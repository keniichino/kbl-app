-- ====== KBL App — esquema Supabase (fase 2: sync PC ↔ iPhone) ======
-- Correr en el SQL Editor de Supabase. Después activar Realtime en las tablas.

-- Sesiones de foco terminadas (el "bosque")
create table foco_sessions (
  id uuid primary key default gen_random_uuid(),
  start_ts timestamptz not null,
  duration_min int not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  constraint foco_sessions_start_uniq unique (start_ts)
);

-- Sesión activa: una sola fila (id fijo). Ambos dispositivos la leen/escriben.
create table foco_active (
  id int primary key default 1 check (id = 1),
  start_ts timestamptz,
  duration_min int,
  updated_at timestamptz not null default now()
);
insert into foco_active (id) values (1);

-- Fase Gastos (v2)
create table gastos (
  id uuid primary key default gen_random_uuid(),
  monto numeric not null,
  descripcion text,
  categoria text,          -- la completa n8n + Claude si viene vacía
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

-- Fase Notas (v3)
create table notas (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  contenido text,
  updated_at timestamptz not null default now()
);

-- Realtime: en el dashboard, Database → Replication → activar para
-- foco_sessions y foco_active (y las demás cuando lleguen sus fases).
alter publication supabase_realtime add table foco_sessions, foco_active;
