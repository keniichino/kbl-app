-- Tabla cuotas para KBL App Personal
-- Ejecutar en Supabase SQL Editor → proyecto jcsenhpuvvbxcxapoaia

CREATE TABLE IF NOT EXISTS public.cuotas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion    TEXT NOT NULL,
  tarjeta        TEXT NOT NULL DEFAULT 'visa'
                   CHECK (tarjeta IN ('visa', 'mac', 'mp', 'efectivo')),
  monto_cuota    NUMERIC(12, 2) NOT NULL CHECK (monto_cuota > 0),
  cuota_actual   SMALLINT NOT NULL DEFAULT 1 CHECK (cuota_actual >= 1),
  cuota_total    SMALLINT NOT NULL CHECK (cuota_total >= 1),
  fecha_primer_venc DATE NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'activa'
                   CHECK (estado IN ('activa', 'completada')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Realtime para sync entre dispositivos
ALTER PUBLICATION supabase_realtime ADD TABLE public.cuotas;
