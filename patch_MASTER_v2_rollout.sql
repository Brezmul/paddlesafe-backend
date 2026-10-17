-- ==============================================================================
-- PADDLESAFE - MASTER V2 CONSOLIDATED DATABASE ROLLOUT
-- Combina e implementa de forma idempotente:
-- 1. Patch #02: Sincronización automática de gamificación desde 'rutas' -> 'perfiles'
-- 2. Patch #04: Tabla 'user_spots' para spots guardados favoritos y RLS
-- 3. Patch #06: Tabla 'spot_reports' para reportes colaborativos en vivo (Waze SUP) y RLS
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PATCH #02: TRIGGER & FUNCIÓN SINCRONIZACIÓN GAMIFICACIÓN DESDE 'rutas'
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.actualizar_gamificacion_desde_rutas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo_xp integer;
  v_nuevo_km numeric;
  v_nuevo_nivel integer;
  v_nuevo_titulo text;
  v_target_user uuid;
  v_xp_delta integer;
  v_km_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target_user := NEW.user_id;
    v_km_delta := COALESCE(NEW.distancia_km, 0);
    v_xp_delta := COALESCE(
      NULLIF((to_jsonb(NEW) ->> 'points_earned'), '')::integer,
      NULLIF((to_jsonb(NEW) ->> 'xp_earned'), '')::integer,
      (ROUND(v_km_delta * 10) + COALESCE(NEW.tiempo_minutos, 0))::integer
    );

    SELECT 
      COALESCE(total_xp, puntos, 0) + v_xp_delta,
      ROUND((COALESCE(total_distance_km, km_totales, 0) + v_km_delta)::numeric, 2)
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;

    IF NOT FOUND THEN
      v_nuevo_xp := COALESCE(v_xp_delta, 0);
      v_nuevo_km := COALESCE(v_km_delta, 0);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    v_target_user := NEW.user_id;
    v_km_delta := COALESCE(NEW.distancia_km, 0) - COALESCE(OLD.distancia_km, 0);
    v_xp_delta := COALESCE(
      NULLIF((to_jsonb(NEW) ->> 'points_earned'), '')::integer,
      NULLIF((to_jsonb(NEW) ->> 'xp_earned'), '')::integer,
      (ROUND(COALESCE(NEW.distancia_km, 0) * 10) + COALESCE(NEW.tiempo_minutos, 0))::integer
      - (ROUND(COALESCE(OLD.distancia_km, 0) * 10) + COALESCE(OLD.tiempo_minutos, 0))::integer
    );

    SELECT 
      COALESCE(total_xp, puntos, 0) + v_xp_delta,
      ROUND((COALESCE(total_distance_km, km_totales, 0) + v_km_delta)::numeric, 2)
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;

    IF NOT FOUND THEN
      v_nuevo_xp := COALESCE(v_xp_delta, 0);
      v_nuevo_km := COALESCE(v_km_delta, 0);
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_target_user := OLD.user_id;
    v_km_delta := COALESCE(OLD.distancia_km, 0);

    v_xp_delta := COALESCE(
      NULLIF((to_jsonb(OLD) ->> 'points_earned'), '')::integer,
      NULLIF((to_jsonb(OLD) ->> 'xp_earned'), '')::integer,
      (ROUND(v_km_delta * 10) + COALESCE(OLD.tiempo_minutos, 0))::integer
    );

    SELECT 
      GREATEST(0, COALESCE(total_xp, puntos, 0) - v_xp_delta),
      GREATEST(0, ROUND((COALESCE(total_distance_km, km_totales, 0) - v_km_delta)::numeric, 2))
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;

    IF NOT FOUND THEN
      v_nuevo_xp := 0;
      v_nuevo_km := 0;
    END IF;
  END IF;

  IF v_target_user IS NOT NULL THEN
    IF v_nuevo_xp IS NULL THEN
      v_nuevo_xp := 0;
    END IF;
    IF v_nuevo_km IS NULL THEN
      v_nuevo_km := 0;
    END IF;

    -- Fórmula universal de nivel de PaddleSafe: floor(sqrt(total_xp / 100)) + 1
    v_nuevo_nivel := GREATEST(1, FLOOR(SQRT(COALESCE(v_nuevo_xp, 0)::numeric / 100)) + 1);

    -- Asignación de título dinámico según nivel
    BEGIN
      v_nuevo_titulo := public.calcular_titulo_paddler(v_nuevo_nivel);
    EXCEPTION WHEN OTHERS THEN
      v_nuevo_titulo := CASE v_nuevo_nivel
        WHEN 1 THEN 'Paddler en Ascenso'
        WHEN 2 THEN 'Paddler Costero'
        WHEN 3 THEN 'Paddler de Aguas Tranquilas'
        WHEN 4 THEN 'Paddler de Touring'
        WHEN 5 THEN 'Paddler de Race'
        WHEN 6 THEN 'Paddler de Downwind'
        WHEN 7 THEN 'Paddler Oceánico'
        WHEN 8 THEN 'Paddler de Marejada'
        WHEN 9 THEN 'Paddler de Rompientes'
        ELSE 'Maestro del SUP'
      END;
    END;

    -- Actualización unificada en perfiles asegurando ambas nomenclaturas
    UPDATE public.perfiles
    SET 
      total_xp = v_nuevo_xp,
      puntos = v_nuevo_xp,
      total_distance_km = v_nuevo_km,
      km_totales = v_nuevo_km,
      current_level = v_nuevo_nivel,
      nivel = v_nuevo_nivel,
      titulo = COALESCE(v_nuevo_titulo, titulo)
    WHERE id = v_target_user;
  END IF;

  RETURN NULL;
END;
$$;

-- Trigger idempotente en public.rutas
DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_desde_rutas ON public.rutas;
CREATE TRIGGER trg_actualizar_gamificacion_desde_rutas
AFTER INSERT OR UPDATE OF distancia_km, tiempo_minutos, points_earned, xp_earned OR DELETE ON public.rutas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_gamificacion_desde_rutas();


-- ------------------------------------------------------------------------------
-- 2. PATCH #04: USER FAVORITE SPOTS SCHEMA & RLS
-- ------------------------------------------------------------------------------

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

-- Idempotent RLS Policies para user_spots
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


-- ------------------------------------------------------------------------------
-- 3. PATCH #06: SPOT LIVE REPORTS SCHEMA & RLS (CROWD REPORTS / WAZE FOR SUP)
-- ------------------------------------------------------------------------------

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

-- Idempotent RLS Policies para spot_reports
DO $$
BEGIN
    -- SELECT: Lectura pública de reportes recientes de las últimas 6 horas
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'spot_reports' AND policyname = 'spot_reports_select_recent'
    ) THEN
        CREATE POLICY spot_reports_select_recent ON public.spot_reports
            FOR SELECT USING (created_at >= now() - interval '6 hours');
    END IF;

    -- INSERT: cualquier usuario autenticado puede emitir un reporte y los visitantes solo si no fijan user_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'spot_reports' AND policyname = 'spot_reports_insert_auth'
    ) THEN
        CREATE POLICY spot_reports_insert_auth ON public.spot_reports
            FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());
    END IF;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_spot_reports_created_at ON public.spot_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spot_reports_coords ON public.spot_reports(lat, lon);

-- ------------------------------------------------------------------------------
-- 4. PATCH #12: CLUB MONTHLY CHALLENGES & COMPETITIVE EVENTS (club_retos)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.club_retos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    creador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    titulo text NOT NULL,
    descripcion text,
    tipo text NOT NULL DEFAULT 'colectivo_km',
    meta_valor numeric(8,2) NOT NULL DEFAULT 100,
    xp_recompensa integer DEFAULT 250,
    fecha_inicio timestamptz NOT NULL DEFAULT date_trunc('month', now()),
    fecha_fin timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month - 1 second'),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_retos_participantes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reto_id uuid NOT NULL REFERENCES public.club_retos(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at timestamptz DEFAULT now(),
    completado boolean DEFAULT false,
    UNIQUE(reto_id, user_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.club_retos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_retos_participantes ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DO $$
BEGIN
    -- SELECT club_retos: para miembros del club o cualquier usuario si el club es público
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos' AND policyname = 'club_retos_select_members'
    ) THEN
        CREATE POLICY club_retos_select_members ON public.club_retos
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.clubs_usuarios cu
                    WHERE cu.club_id = club_retos.club_id AND cu.user_id = auth.uid()
                ) OR EXISTS (
                    SELECT 1 FROM public.clubs c
                    WHERE c.id = club_retos.club_id AND (c.es_privado IS NOT TRUE)
                ) OR auth.uid() IS NOT NULL
            );
    END IF;

    -- INSERT/UPDATE club_retos: creador o administrador del club
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos' AND policyname = 'club_retos_insert_admin'
    ) THEN
        CREATE POLICY club_retos_insert_admin ON public.club_retos
            FOR INSERT WITH CHECK (
                auth.uid() = creador_id OR
                EXISTS (
                    SELECT 1 FROM public.clubs_usuarios cu
                    WHERE cu.club_id = club_retos.club_id AND cu.user_id = auth.uid() AND cu.rol IN ('admin', 'creador')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos' AND policyname = 'club_retos_update_admin'
    ) THEN
        CREATE POLICY club_retos_update_admin ON public.club_retos
            FOR UPDATE USING (
                auth.uid() = creador_id OR
                EXISTS (
                    SELECT 1 FROM public.clubs_usuarios cu
                    WHERE cu.club_id = club_retos.club_id AND cu.user_id = auth.uid() AND cu.rol IN ('admin', 'creador')
                )
            );
    END IF;

    -- SELECT club_retos_participantes: lectura pública o miembros
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos_participantes' AND policyname = 'club_retos_part_select'
    ) THEN
        CREATE POLICY club_retos_part_select ON public.club_retos_participantes
            FOR SELECT USING (true);
    END IF;

    -- INSERT club_retos_participantes: auth.uid() = user_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos_participantes' AND policyname = 'club_retos_part_insert'
    ) THEN
        CREATE POLICY club_retos_part_insert ON public.club_retos_participantes
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    -- UPDATE club_retos_participantes: auth.uid() = user_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos_participantes' AND policyname = 'club_retos_part_update'
    ) THEN
        CREATE POLICY club_retos_part_update ON public.club_retos_participantes
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    -- DELETE club_retos_participantes: auth.uid() = user_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'club_retos_participantes' AND policyname = 'club_retos_part_delete'
    ) THEN
        CREATE POLICY club_retos_part_delete ON public.club_retos_participantes
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_club_retos_club ON public.club_retos(club_id, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_club_retos_part_reto ON public.club_retos_participantes(reto_id, user_id);

COMMIT;

