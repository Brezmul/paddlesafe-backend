-- ==============================================================================
-- PADDLESAFE - PATCH #06: SPOT LIVE REPORTS SCHEMA & RLS (CROWD REPORTS / WAZE FOR SUP)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.spot_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    autor_nombre text,
    spot_nombre text NOT NULL,
    lat numeric(9,6) NOT NULL,
    lon numeric(9,6) NOT NULL,
    tag text NOT NULL,
    comentario text,
    created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.spot_reports ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DO $$
BEGIN
    -- SELECT: Lectura pública de reportes recientes de las últimas 6 horas
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'spot_reports' AND policyname = 'spot_reports_select_recent'
    ) THEN
        CREATE POLICY spot_reports_select_recent ON public.spot_reports
            FOR SELECT USING (created_at >= now() - interval '6 hours');
    END IF;

    -- INSERT: Cualquier usuario o visitante puede emitir un reporte de seguridad
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'spot_reports' AND policyname = 'spot_reports_insert_auth'
    ) THEN
        CREATE POLICY spot_reports_insert_auth ON public.spot_reports
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_spot_reports_created_at ON public.spot_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spot_reports_coords ON public.spot_reports(lat, lon);

