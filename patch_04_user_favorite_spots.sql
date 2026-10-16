-- ==============================================================================
-- PADDLESAFE - PATCH #04: USER FAVORITE SPOTS SCHEMA & RLS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_spots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    lat numeric(9,6) NOT NULL,
    lon numeric(9,6) NOT NULL,
    seaward_deg integer,
    orden integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, nombre)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_spots ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_spots' AND policyname = 'user_spots_select_own'
    ) THEN
        CREATE POLICY user_spots_select_own ON public.user_spots
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_spots' AND policyname = 'user_spots_insert_own'
    ) THEN
        CREATE POLICY user_spots_insert_own ON public.user_spots
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_spots' AND policyname = 'user_spots_update_own'
    ) THEN
        CREATE POLICY user_spots_update_own ON public.user_spots
            FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_spots' AND policyname = 'user_spots_delete_own'
    ) THEN
        CREATE POLICY user_spots_delete_own ON public.user_spots
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Índice para consultas rápidas por usuario y orden
CREATE INDEX IF NOT EXISTS idx_user_spots_user ON public.user_spots(user_id, orden);

