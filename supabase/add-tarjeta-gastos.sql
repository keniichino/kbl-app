-- ============================================================================
-- KBL App — Agregar columna `tarjeta` a la tabla `gastos`
-- ============================================================================
-- El cliente (js/store.js → toRemoteGasto) manda `tarjeta` en cada gasto, pero
-- el esquema original de `gastos` (schema.sql) no la tenía. Si la columna no
-- existe en el server, CADA upsert de gasto falla con "column does not exist"
-- y — como el error se traga en silencio — el gasto queda solo en localStorage
-- y NUNCA sincroniza entre dispositivos.
--
-- Corré esto en el SQL Editor de Supabase (proyecto jcsenhpuvvbxcxapoaia).
-- Es idempotente: si la columna ya existe, no hace nada.
-- ============================================================================

alter table public.gastos
  add column if not exists tarjeta text
    check (tarjeta is null or tarjeta in ('visa', 'mac', 'mp', 'efectivo'));

-- Nota: se permite NULL (gasto sin tarjeta asignada, que es opcional en la UI).
