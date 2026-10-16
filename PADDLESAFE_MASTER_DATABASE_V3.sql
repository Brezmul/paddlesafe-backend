-- ==============================================================================
-- PADDLESAFE - MASTER DATABASE ROLLOUT V3 (CONSOLIDATED ARCHITECTURAL MIGRATION)
-- ==============================================================================
-- Documento: PADDLESAFE_MASTER_DATABASE_V3.sql
-- Propósito: Capa de persistencia integral, unificada y 100% idempotente para
--            PaddleSafe (Producción / Supabase PostgreSQL).
--
-- Cobertura de Parches y Capacidades:
--   • PATCH #01: Seguridad RLS, permisos mínimos y aislamiento multi-tenant.
--   • PATCH #02: Sincronización atómica de Gamificación (rutas / user_routes <-> perfiles).
--   • PATCH #03: Privacidad de Clubes (club_chat), roles y RPCs multi-club.
--   • PATCH #04: Spots favoritos de usuario (user_spots) para Comparador y Home Spots.
--   • PATCH #05: Rankings unificados multi-periodo (riders y clubes v2) y filtro anti-trampas.
--   • PATCH #06: Reportes colaborativos en tiempo real (spot_reports / Waze SUP).
--   • PATCH #07: Perfil de material y rendimiento hidrodinámico SUP (perfiles).
--   • PATCH #08: Telemetría y snapshot meteorológico en travesías (rutas / user_routes).
--   • PATCH #09: Guardacostas Virtual y telemetría de seguridad (safety_checkins).
--   • EXTRA: Quedadas de club (club_eventos, club_eventos_asistentes), bucket de Storage
--            y disparador consolidado de alta de usuario en auth.users.
--
-- Idempotencia Garantizada:
--   - Compatible con bases de datos en blanco y con esquemas en producción.
--   - Transaccional (BEGIN / COMMIT) para evitar estados parciales corruptos.
--   - Inclusivo: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, DROP TRIGGER IF EXISTS.
--   - Zero Data Loss: No destruye tablas ni columnas existentes.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 0. PREFLIGHT DIAGNOSTIC GUARDS
-- ==============================================================================
DO $$
BEGIN
  IF to_regclass('public.perfiles') IS NULL THEN
    RAISE EXCEPTION 'Abortando rollout: La tabla base public.perfiles no existe en el catálogo.';
  END IF;
  IF to_regclass('public.rutas') IS NULL THEN
    RAISE EXCEPTION 'Abortando rollout: La tabla base public.rutas no existe en el catálogo.';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Abortando rollout: El esquema de autenticación auth.users de Supabase no existe.';
  END IF;
END;
$$;

-- ==============================================================================
-- 1. EXTENSIÓN Y UNIFICACIÓN DE PERFILES (GAMIFICACIÓN Y EQUIPO SUP)
-- ==============================================================================
-- Soporta nomenclatura dual histórica (puntos <-> total_xp, km_totales <-> total_distance_km, nivel <-> current_level)
-- Incorpora el perfil de equipo SUP extensible (Patch #07).
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS total_xp integer,
  ADD COLUMN IF NOT EXISTS puntos integer,
  ADD COLUMN IF NOT EXISTS total_distance_km double precision,
  ADD COLUMN IF NOT EXISTS km_totales double precision,
  ADD COLUMN IF NOT EXISTS current_level integer,
  ADD COLUMN IF NOT EXISTS nivel integer,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS insignias jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sup_board_type text,
  ADD COLUMN IF NOT EXISTS sup_cruise_speed_kmh numeric(6,2),
  ADD COLUMN IF NOT EXISTS sup_drift_factor numeric(8,4),
  ADD COLUMN IF NOT EXISTS sup_wind_factor numeric(8,4),
  ADD COLUMN IF NOT EXISTS sup_gear_name text,
  ADD COLUMN IF NOT EXISTS sup_gear_updated_at timestamptz;

-- Función inmutable universal para calcular el título honorífico según nivel de paddler
CREATE OR REPLACE FUNCTION public.calcular_titulo_paddler(p_nivel integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_nivel
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
$$;

-- Normalización y backfill idempotente en perfiles
UPDATE public.perfiles
SET
  total_xp = COALESCE(NULLIF(total_xp, 0), puntos, 0),
  puntos = COALESCE(NULLIF(puntos, 0), total_xp, 0),
  total_distance_km = ROUND(COALESCE(NULLIF(total_distance_km, 0), km_totales, 0)::numeric, 2),
  km_totales = ROUND(COALESCE(NULLIF(km_totales, 0), total_distance_km, 0)::numeric, 2),
  current_level = GREATEST(
    1,
    FLOOR(SQRT(COALESCE(NULLIF(total_xp, 0), puntos, 0)::numeric / 100)) + 1
  ),
  nivel = GREATEST(
    1,
    FLOOR(SQRT(COALESCE(NULLIF(total_xp, 0), puntos, 0)::numeric / 100)) + 1
  ),
  titulo = COALESCE(
    NULLIF(titulo, ''),
    public.calcular_titulo_paddler(
      GREATEST(
        1,
        FLOOR(SQRT(COALESCE(NULLIF(total_xp, 0), puntos, 0)::numeric / 100)) + 1
      )
    )
  )
WHERE total_xp IS NULL
   OR puntos IS NULL
   OR (total_xp = 0 AND COALESCE(puntos, 0) > 0)
   OR (puntos = 0 AND COALESCE(total_xp, 0) > 0)
   OR total_distance_km IS NULL
   OR km_totales IS NULL
   OR (total_distance_km = 0 AND COALESCE(km_totales, 0) > 0)
   OR (km_totales = 0 AND COALESCE(total_distance_km, 0) > 0)
   OR current_level IS NULL
   OR nivel IS NULL
   OR titulo IS NULL;

-- Índices de alto rendimiento para tablas de clasificación de riders
CREATE INDEX IF NOT EXISTS idx_perfiles_total_xp ON public.perfiles (total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_perfiles_total_distance_km ON public.perfiles (total_distance_km DESC);
CREATE INDEX IF NOT EXISTS idx_perfiles_is_private ON public.perfiles (is_private);

-- Eliminar triggers antiguos que sobreescribían progresión o causaban bucles infinitos
DROP TRIGGER IF EXISTS trigger_actualizar_progresion ON public.perfiles;
DROP TRIGGER IF EXISTS trg_actualizar_progresion_paddler ON public.perfiles;

-- Documentación en catálogo
COMMENT ON COLUMN public.perfiles.sup_board_type IS 'Modalidad o perfil de tabla SUP (ej: all_round_inflatable, touring_hardboard, race_14).';
COMMENT ON COLUMN public.perfiles.sup_cruise_speed_kmh IS 'Velocidad de crucero personalizada calibrada por el deportista (km/h).';
COMMENT ON COLUMN public.perfiles.sup_drift_factor IS 'Factor multiplicador de deriva hidrodinámica frente a oleaje y corriente.';
COMMENT ON COLUMN public.perfiles.sup_wind_factor IS 'Factor de resistencia o abatimiento aerodinámico ante viento.';
COMMENT ON COLUMN public.perfiles.sup_gear_name IS 'Nombre personalizado asignado por el usuario a su equipo principal.';
COMMENT ON COLUMN public.perfiles.sup_gear_updated_at IS 'Marca temporal de la última actualización del equipo SUP del usuario.';

-- ==============================================================================
-- 2. MODELO DE TRAVESÍAS Y TELEMETRÍA METEOROLÓGICA (PATCH #08)
-- ==============================================================================
-- Telemetría meteorológica y splits en la tabla histórica 'public.rutas'
ALTER TABLE public.rutas
  ADD COLUMN IF NOT EXISTS points_earned integer,
  ADD COLUMN IF NOT EXISTS xp_earned integer,
  ADD COLUMN IF NOT EXISTS wind_speed_kt numeric(6,2),
  ADD COLUMN IF NOT EXISTS wind_gust_kt numeric(6,2),
  ADD COLUMN IF NOT EXISTS wind_direction_deg numeric(6,2),
  ADD COLUMN IF NOT EXISTS wave_height_m numeric(7,3),
  ADD COLUMN IF NOT EXISTS wave_period_s numeric(7,3),
  ADD COLUMN IF NOT EXISTS conditions_score numeric(6,2),
  ADD COLUMN IF NOT EXISTS weather_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS splits_data jsonb;

-- Tabla avanzada 'public.user_routes' para grabaciones GPX, splits y telemetría pro
CREATE TABLE IF NOT EXISTS public.user_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Ruta en Paddle Surf',
  distance_km numeric(8,2) NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  avg_speed numeric(6,2) DEFAULT 0,
  max_speed numeric(6,2) DEFAULT 0,
  route_coordinates jsonb NOT NULL DEFAULT '[]'::jsonb,
  splits_data jsonb DEFAULT '[]'::jsonb,
  ai_feedback jsonb,
  xp_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  wind_speed_kt numeric(6,2),
  wind_gust_kt numeric(6,2),
  wind_direction_deg numeric(6,2),
  wave_height_m numeric(7,3),
  wave_period_s numeric(7,3),
  conditions_score numeric(6,2),
  weather_snapshot jsonb
);

-- Asegurar columnas si user_routes ya existía previamente
ALTER TABLE public.user_routes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title text DEFAULT 'Ruta en Paddle Surf',
  ADD COLUMN IF NOT EXISTS distance_km numeric(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_speed numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_speed numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS route_coordinates jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS splits_data jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_feedback jsonb,
  ADD COLUMN IF NOT EXISTS xp_earned integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS wind_speed_kt numeric(6,2),
  ADD COLUMN IF NOT EXISTS wind_gust_kt numeric(6,2),
  ADD COLUMN IF NOT EXISTS wind_direction_deg numeric(6,2),
  ADD COLUMN IF NOT EXISTS wave_height_m numeric(7,3),
  ADD COLUMN IF NOT EXISTS wave_period_s numeric(7,3),
  ADD COLUMN IF NOT EXISTS conditions_score numeric(6,2),
  ADD COLUMN IF NOT EXISTS weather_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_user_routes_user_created ON public.user_routes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_routes_distance ON public.user_routes (distance_km DESC);
CREATE INDEX IF NOT EXISTS idx_rutas_user_fecha ON public.rutas (user_id, fecha DESC);

-- RLS en user_routes
ALTER TABLE public.user_routes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_routes' AND policyname = 'user_routes_select_policy'
  ) THEN
    CREATE POLICY user_routes_select_policy ON public.user_routes
      FOR SELECT TO authenticated, anon
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM public.perfiles p
          WHERE p.id = user_routes.user_id AND NOT COALESCE(p.is_private, false)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_routes' AND policyname = 'user_routes_insert_own'
  ) THEN
    CREATE POLICY user_routes_insert_own ON public.user_routes
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_routes' AND policyname = 'user_routes_update_own'
  ) THEN
    CREATE POLICY user_routes_update_own ON public.user_routes
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_routes' AND policyname = 'user_routes_delete_own'
  ) THEN
    CREATE POLICY user_routes_delete_own ON public.user_routes
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

GRANT SELECT ON public.user_routes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_routes TO authenticated;

-- ==============================================================================
-- 3. MOTOR DE GAMIFICACIÓN ATÓMICA UNIFICADA (PATCH #02)
-- ==============================================================================

-- Función compartida para aplicar deltas de XP y distancia en perfiles
CREATE OR REPLACE FUNCTION public.paddlesafe_apply_gamification_delta(
  p_user_id uuid,
  p_xp_delta integer,
  p_km_delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.perfiles p
  SET
    total_xp = GREATEST(0, COALESCE(p.total_xp, p.puntos, 0) + COALESCE(p_xp_delta, 0)),
    puntos = GREATEST(0, COALESCE(p.puntos, p.total_xp, 0) + COALESCE(p_xp_delta, 0)),
    total_distance_km = ROUND(
      GREATEST(
        0::numeric,
        (COALESCE(p.total_distance_km, p.km_totales, 0) + COALESCE(p_km_delta, 0))::numeric
      ),
      2
    ),
    km_totales = ROUND(
      GREATEST(
        0::numeric,
        (COALESCE(p.km_totales, p.total_distance_km, 0) + COALESCE(p_km_delta, 0))::numeric
      ),
      2
    ),
    current_level = GREATEST(
      1,
      FLOOR(
        SQRT(
          GREATEST(0, COALESCE(p.total_xp, p.puntos, 0) + COALESCE(p_xp_delta, 0))::numeric
          / 100
        )
      ) + 1
    ),
    nivel = GREATEST(
      1,
      FLOOR(
        SQRT(
          GREATEST(0, COALESCE(p.total_xp, p.puntos, 0) + COALESCE(p_xp_delta, 0))::numeric
          / 100
        )
      ) + 1
    ),
    titulo = public.calcular_titulo_paddler(
      GREATEST(
        1,
        FLOOR(
          SQRT(
            GREATEST(0, COALESCE(p.total_xp, p.puntos, 0) + COALESCE(p_xp_delta, 0))::numeric
            / 100
          )
        ) + 1
      )
    )
  WHERE p.id = p_user_id;
END;
$$;

-- Extracción de XP y validación de velocidad en rutas/user_routes
CREATE OR REPLACE FUNCTION public.paddlesafe_route_xp(p_route jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_distance numeric;
  v_duration_min numeric;
  v_speed numeric;
  v_xp_text text;
BEGIN
  -- 1. Si la fila ya cuenta con puntos o XP explícitamente calculados, respetarlos
  v_xp_text := COALESCE(
    NULLIF(p_route ->> 'points_earned', ''),
    NULLIF(p_route ->> 'xp_earned', '')
  );
  IF v_xp_text IS NOT NULL THEN
    RETURN v_xp_text::integer;
  END IF;

  -- 2. Distancia en km
  v_distance := COALESCE(
    NULLIF(p_route ->> 'distancia_km', '')::numeric,
    NULLIF(p_route ->> 'distance_km', '')::numeric,
    0
  );

  -- 3. Duración en minutos
  v_duration_min := COALESCE(
    NULLIF(p_route ->> 'tiempo_minutos', '')::numeric,
    ROUND(NULLIF(p_route ->> 'duration_seconds', '')::numeric / 60.0),
    0
  );

  -- 4. Velocidad media
  v_speed := COALESCE(
    NULLIF(p_route ->> 'avg_speed_kmh', '')::numeric,
    NULLIF(p_route ->> 'avg_speed', '')::numeric,
    0
  );

  -- Anti-cheat: si la velocidad media supera 45 km/h, 0 XP (vehículo de motor)
  IF v_speed > 45 THEN
    RETURN 0;
  END IF;

  -- 5. Fórmula canónica estándar PaddleSafe: ROUND(distancia_km * 10) + tiempo_minutos
  IF v_duration_min > 0 THEN
    RETURN (ROUND(v_distance * 10) + v_duration_min)::integer;
  ELSE
    RETURN ROUND(v_distance * 100)::integer;
  END IF;
END;
$$;

-- Trigger Function para sincronización desde 'user_routes'
CREATE OR REPLACE FUNCTION public.actualizar_gamificacion_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_old_user uuid;
  v_new_user uuid;
  v_old_xp integer := 0;
  v_new_xp integer := 0;
  v_old_km numeric := 0;
  v_new_km numeric := 0;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := to_jsonb(OLD);
    v_old_user := NULLIF(v_old ->> 'user_id', '')::uuid;
    v_old_xp := public.paddlesafe_route_xp(v_old);
    v_old_km := COALESCE(NULLIF(v_old ->> 'distance_km', '')::numeric, 0);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := to_jsonb(NEW);
    v_new_user := NULLIF(v_new ->> 'user_id', '')::uuid;
    v_new_xp := public.paddlesafe_route_xp(v_new);
    v_new_km := COALESCE(NULLIF(v_new ->> 'distance_km', '')::numeric, 0);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.paddlesafe_apply_gamification_delta(v_new_user, v_new_xp, v_new_km);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.paddlesafe_apply_gamification_delta(v_old_user, -v_old_xp, -v_old_km);
  ELSIF v_old_user IS DISTINCT FROM v_new_user THEN
    PERFORM public.paddlesafe_apply_gamification_delta(v_old_user, -v_old_xp, -v_old_km);
    PERFORM public.paddlesafe_apply_gamification_delta(v_new_user, v_new_xp, v_new_km);
  ELSE
    PERFORM public.paddlesafe_apply_gamification_delta(
      v_new_user,
      v_new_xp - v_old_xp,
      v_new_km - v_old_km
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_perfil ON public.user_routes;
CREATE TRIGGER trg_actualizar_gamificacion_perfil
AFTER INSERT OR DELETE OR UPDATE OF user_id, distance_km, duration_seconds, xp_earned, avg_speed
ON public.user_routes
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_gamificacion_perfil();

-- Trigger Function para sincronización desde la tabla tradicional 'rutas'
CREATE OR REPLACE FUNCTION public.actualizar_gamificacion_desde_rutas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_old_user uuid;
  v_new_user uuid;
  v_old_xp integer := 0;
  v_new_xp integer := 0;
  v_old_km numeric := 0;
  v_new_km numeric := 0;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := to_jsonb(OLD);
    v_old_user := NULLIF(v_old ->> 'user_id', '')::uuid;
    v_old_xp := public.paddlesafe_route_xp(v_old);
    v_old_km := COALESCE(NULLIF(v_old ->> 'distancia_km', '')::numeric, 0);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := to_jsonb(NEW);
    v_new_user := NULLIF(v_new ->> 'user_id', '')::uuid;
    v_new_xp := public.paddlesafe_route_xp(v_new);
    v_new_km := COALESCE(NULLIF(v_new ->> 'distancia_km', '')::numeric, 0);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.paddlesafe_apply_gamification_delta(v_new_user, v_new_xp, v_new_km);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.paddlesafe_apply_gamification_delta(v_old_user, -v_old_xp, -v_old_km);
  ELSIF v_old_user IS DISTINCT FROM v_new_user THEN
    PERFORM public.paddlesafe_apply_gamification_delta(v_old_user, -v_old_xp, -v_old_km);
    PERFORM public.paddlesafe_apply_gamification_delta(v_new_user, v_new_xp, v_new_km);
  ELSE
    PERFORM public.paddlesafe_apply_gamification_delta(
      v_new_user,
      v_new_xp - v_old_xp,
      v_new_km - v_old_km
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_desde_rutas ON public.rutas;
CREATE TRIGGER trg_actualizar_gamificacion_desde_rutas
AFTER INSERT OR DELETE OR UPDATE OF user_id, distancia_km, tiempo_minutos, points_earned, xp_earned
ON public.rutas
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_gamificacion_desde_rutas();

-- ==============================================================================
-- 4. SPOTS FAVORITOS DEL USUARIO (PATCH #04)
-- ==============================================================================
-- Soporta: Mis Spots, Comparador Multi-Spot y Home Spots
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

ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS seaward_deg integer,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.user_spots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_spots' AND policyname = 'user_spots_select_own'
  ) THEN
    CREATE POLICY user_spots_select_own ON public.user_spots
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_spots' AND policyname = 'user_spots_insert_own'
  ) THEN
    CREATE POLICY user_spots_insert_own ON public.user_spots
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_spots' AND policyname = 'user_spots_update_own'
  ) THEN
    CREATE POLICY user_spots_update_own ON public.user_spots
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_spots' AND policyname = 'user_spots_delete_own'
  ) THEN
    CREATE POLICY user_spots_delete_own ON public.user_spots
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_spots_user ON public.user_spots (user_id, orden);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_spots TO authenticated;

-- ==============================================================================
-- 5. REPORTES COLABORATIVOS EN TIEMPO REAL (PATCH #06 / WAZE SUP)
-- ==============================================================================
-- Reportes de incidentes, medusas, corrientes y alertas comunitarias
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

ALTER TABLE public.spot_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spot_reports' AND policyname = 'spot_reports_select_recent'
  ) THEN
    CREATE POLICY spot_reports_select_recent ON public.spot_reports
      FOR SELECT TO anon, authenticated
      USING (
        created_at >= now() - interval '6 hours'
        AND created_at <= now() + interval '5 minutes'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spot_reports' AND policyname = 'spot_reports_insert_auth'
  ) THEN
    CREATE POLICY spot_reports_insert_auth ON public.spot_reports
      FOR INSERT TO authenticated
      WITH CHECK (
        (user_id IS NULL OR user_id = auth.uid())
        AND lat BETWEEN -90 AND 90
        AND lon BETWEEN -180 AND 180
        AND NULLIF(btrim(tag), '') IS NOT NULL
        AND length(tag) <= 80
        AND (comentario IS NULL OR length(comentario) <= 1000)
        AND created_at >= now() - interval '5 minutes'
        AND created_at <= now() + interval '5 minutes'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spot_reports' AND policyname = 'spot_reports_insert_anon'
  ) THEN
    CREATE POLICY spot_reports_insert_anon ON public.spot_reports
      FOR INSERT TO anon
      WITH CHECK (
        user_id IS NULL
        AND lat BETWEEN -90 AND 90
        AND lon BETWEEN -180 AND 180
        AND NULLIF(btrim(tag), '') IS NOT NULL
        AND length(tag) <= 80
        AND (comentario IS NULL OR length(comentario) <= 1000)
        AND created_at >= now() - interval '5 minutes'
        AND created_at <= now() + interval '5 minutes'
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_spot_reports_created_at ON public.spot_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spot_reports_coords ON public.spot_reports (lat, lon);
GRANT SELECT, INSERT ON public.spot_reports TO anon, authenticated;

-- ==============================================================================
-- 6. GUARDACOSTAS VIRTUAL Y SEGURIDAD TELEMÉTRICA (PATCH #09)
-- ==============================================================================
-- Check-in de regreso seguro, ETA programada y telemetría de posición de emergencia
CREATE TABLE IF NOT EXISTS public.safety_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_sync_id uuid,
  status text NOT NULL DEFAULT 'active',
  planned_eta timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_lat numeric(9,6),
  last_lon numeric(9,6),
  speed_knots numeric(7,3),
  heading_deg numeric(6,2),
  last_position_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_checkins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safety_checkins' AND policyname = 'safety_checkins_select_own'
  ) THEN
    CREATE POLICY safety_checkins_select_own ON public.safety_checkins
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safety_checkins' AND policyname = 'safety_checkins_insert_own'
  ) THEN
    CREATE POLICY safety_checkins_insert_own ON public.safety_checkins
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safety_checkins' AND policyname = 'safety_checkins_update_own'
  ) THEN
    CREATE POLICY safety_checkins_update_own ON public.safety_checkins
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'safety_checkins' AND policyname = 'safety_checkins_delete_own'
  ) THEN
    CREATE POLICY safety_checkins_delete_own ON public.safety_checkins
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_safety_checkins_client_sync_v3
  ON public.safety_checkins (user_id, client_sync_id)
  WHERE client_sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_checkins_user_recent_v3
  ON public.safety_checkins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_checkins_active_eta_v3
  ON public.safety_checkins (planned_eta)
  WHERE status IN ('active', 'overdue');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_checkins TO authenticated;

-- ==============================================================================
-- 7. CLUBES, PRIVACIDAD DE CHAT Y RPCS MULTI-CLUB
-- ==============================================================================

-- Asegurar columnas de auditoría y compatibilidad en clubs_usuarios
ALTER TABLE public.clubs_usuarios
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Asegurar privacidad en chat de clubes (Patch #03)
ALTER TABLE public.club_chat
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'club_only',
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_club_chat_visibility') THEN
    ALTER TABLE public.club_chat
      ADD CONSTRAINT chk_club_chat_visibility CHECK (visibility IN ('club_only', 'public'));
  END IF;
END;
$$;

-- Vista de membresías para desacoplamiento y compatibilidad
CREATE OR REPLACE VIEW public.memberships AS
SELECT
  club_id,
  user_id,
  rol,
  COALESCE(joined_at, created_at, now()) AS joined_at
FROM public.clubs_usuarios;

GRANT SELECT ON public.memberships TO authenticated, anon;

ALTER TABLE public.club_chat ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "club_chat_select_members_only" ON public.club_chat;
  DROP POLICY IF EXISTS "club_chat_insert_members_only" ON public.club_chat;
  DROP POLICY IF EXISTS "club_chat_delete_author_or_admin" ON public.club_chat;
END;
$$;

CREATE POLICY "club_chat_select_members_only"
  ON public.club_chat
  FOR SELECT TO authenticated
  USING (
    club_id IN (
      SELECT cu.club_id
      FROM public.clubs_usuarios cu
      WHERE cu.user_id = auth.uid()
    )
  );

CREATE POLICY "club_chat_insert_members_only"
  ON public.club_chat
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND club_id IN (
      SELECT cu.club_id
      FROM public.clubs_usuarios cu
      WHERE cu.user_id = auth.uid()
    )
  );

CREATE POLICY "club_chat_delete_author_or_admin"
  ON public.club_chat
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clubs_usuarios cu
      WHERE cu.club_id = club_chat.club_id
        AND cu.user_id = auth.uid()
        AND cu.rol IN ('creador', 'admin')
    )
  );

GRANT SELECT, INSERT, DELETE ON public.club_chat TO authenticated;

-- RPC: Crear club en sistema multi-club
CREATE OR REPLACE FUNCTION public.crear_club_multiclub(p_nombre text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_club_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para fundar un club' USING ERRCODE = '28000';
  END IF;
  IF NULLIF(btrim(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del club no puede estar en blanco';
  END IF;

  INSERT INTO public.clubs (nombre, creador_id)
  VALUES (btrim(p_nombre), v_user_id)
  RETURNING id INTO v_club_id;

  INSERT INTO public.clubs_usuarios (club_id, user_id, rol)
  VALUES (v_club_id, v_user_id, 'creador')
  ON CONFLICT DO NOTHING;

  RETURN v_club_id;
END;
$$;

-- RPC: Obtener los clubes a los que pertenece el usuario
CREATE OR REPLACE FUNCTION public.obtener_clubs_usuario(p_user_id uuid)
RETURNS TABLE (
  club_id uuid,
  nombre text,
  descripcion text,
  logo_url text,
  banner_url text,
  ubicacion text,
  creador_id uuid,
  club_rol text,
  fecha_union timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id AS club_id,
    c.nombre,
    c.descripcion,
    c.logo_url,
    c.banner_url,
    c.ubicacion,
    c.creador_id,
    cu.rol AS club_rol,
    COALESCE(cu.joined_at, cu.created_at) AS fecha_union
  FROM public.clubs_usuarios cu
  JOIN public.clubs c ON c.id = cu.club_id
  WHERE cu.user_id = p_user_id
  ORDER BY cu.created_at ASC;
$$;

-- RPC: Obtener la tripulación de un club
CREATE OR REPLACE FUNCTION public.obtener_miembros_club(p_club_id uuid)
RETURNS TABLE (
  user_id uuid,
  nombre text,
  avatar_url text,
  rol text,
  total_xp integer,
  current_level integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cu.user_id,
    p.nombre,
    p.avatar_url,
    cu.rol,
    COALESCE(p.total_xp, p.puntos, 0)::integer AS total_xp,
    COALESCE(p.current_level, p.nivel, 1)::integer AS current_level
  FROM public.clubs_usuarios cu
  LEFT JOIN public.perfiles p ON p.id = cu.user_id
  WHERE cu.club_id = p_club_id
  ORDER BY 
    CASE cu.rol 
      WHEN 'creador' THEN 1 
      WHEN 'admin' THEN 2 
      ELSE 3 
    END,
    cu.created_at ASC;
$$;

-- RPC: Obtener solicitudes pendientes de ingreso al club
CREATE OR REPLACE FUNCTION public.obtener_solicitudes_club(p_club_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nombre text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = p_club_id
      AND cu.user_id = auth.uid()
      AND cu.rol IN ('creador', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permiso denegado: no eres administrador del club' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    cs.id,
    cs.user_id,
    p.nombre,
    p.avatar_url,
    cs.created_at
  FROM public.clubs_solicitudes cs
  LEFT JOIN public.perfiles p ON p.id = cs.user_id
  WHERE cs.club_id = p_club_id
  ORDER BY cs.created_at ASC;
END;
$$;

-- RPC: Procesar solicitud de ingreso
CREATE OR REPLACE FUNCTION public.procesar_solicitud_club(p_solicitud uuid, p_accion text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_user_id uuid;
  v_club_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
  END IF;

  SELECT cs.user_id, cs.club_id INTO v_user_id, v_club_id
  FROM public.clubs_solicitudes cs
  WHERE cs.id = p_solicitud;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe o ya fue procesada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = v_club_id
      AND cu.user_id = v_actor
      AND cu.rol IN ('creador', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permiso denegado: no eres administrador de este club.' USING ERRCODE = '42501';
  END IF;

  IF p_accion = 'aceptar' THEN
    INSERT INTO public.clubs_usuarios (club_id, user_id, rol)
    VALUES (v_club_id, v_user_id, 'miembro')
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.clubs_solicitudes WHERE id = p_solicitud;
END;
$$;

-- RPC: Eliminación completa de club en cascada segura
CREATE OR REPLACE FUNCTION public.club_eliminar(p_club uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_es_creador boolean := false;
  v_es_admin boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clubs 
    WHERE id = p_club AND creador_id = v_user_id
  ) INTO v_es_creador;

  SELECT EXISTS (
    SELECT 1 FROM public.clubs_usuarios 
    WHERE club_id = p_club 
      AND user_id = v_user_id 
      AND LOWER(rol) IN ('creador', 'admin')
  ) INTO v_es_admin;

  IF NOT (v_es_creador OR v_es_admin) THEN
    RAISE EXCEPTION 'Permiso denegado: Solo creadores y administradores pueden eliminar este club.' USING ERRCODE = '42501';
  END IF;

  -- Borrado de referencias dependientes
  DELETE FROM public.clubs_invitaciones WHERE club_id = p_club;
  DELETE FROM public.clubs_solicitudes  WHERE club_id = p_club;
  DELETE FROM public.club_chat         WHERE club_id = p_club;
  DELETE FROM public.club_rutas        WHERE club_id = p_club;
  DELETE FROM public.club_eventos      WHERE club_id = p_club;
  DELETE FROM public.club_showcase     WHERE club_id = p_club;
  DELETE FROM public.clubs_usuarios    WHERE club_id = p_club;
  DELETE FROM public.clubs            WHERE id = p_club;

  RETURN true;
END;
$$;

-- ==============================================================================
-- 8. QUEDADAS DE CLUB (PLANIFICADOR MULTIPUNTO Y ASISTENTES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.club_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  creador_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  fecha_evento timestamptz NOT NULL,
  distancia_km numeric(8,2) DEFAULT 0,
  tiempo_minutos integer DEFAULT 0,
  ruta_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_eventos_asistentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.club_eventos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evento_id, user_id)
);

ALTER TABLE public.club_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_eventos_asistentes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- club_eventos policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_eventos' AND policyname = 'club_eventos_select_members'
  ) THEN
    CREATE POLICY club_eventos_select_members ON public.club_eventos
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.clubs_usuarios cu
          WHERE cu.club_id = club_eventos.club_id AND cu.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_eventos' AND policyname = 'club_eventos_insert_members'
  ) THEN
    CREATE POLICY club_eventos_insert_members ON public.club_eventos
      FOR INSERT TO authenticated
      WITH CHECK (
        creador_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.clubs_usuarios cu
          WHERE cu.club_id = club_eventos.club_id AND cu.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_eventos' AND policyname = 'club_eventos_delete_creator_or_admin'
  ) THEN
    CREATE POLICY club_eventos_delete_creator_or_admin ON public.club_eventos
      FOR DELETE TO authenticated
      USING (
        creador_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clubs_usuarios cu
          WHERE cu.club_id = club_eventos.club_id
            AND cu.user_id = auth.uid()
            AND cu.rol IN ('creador', 'admin')
        )
      );
  END IF;

  -- club_eventos_asistentes policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_eventos_asistentes' AND policyname = 'asistentes_select_members'
  ) THEN
    CREATE POLICY asistentes_select_members ON public.club_eventos_asistentes
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.club_eventos ce
          JOIN public.clubs_usuarios cu ON cu.club_id = ce.club_id
          WHERE ce.id = club_eventos_asistentes.evento_id AND cu.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_eventos_asistentes' AND policyname = 'asistentes_insert_own'
  ) THEN
    CREATE POLICY asistentes_insert_own ON public.club_eventos_asistentes
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'club_eventos_asistentes' AND policyname = 'asistentes_delete_own'
  ) THEN
    CREATE POLICY asistentes_delete_own ON public.club_eventos_asistentes
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_club_eventos_club_fecha ON public.club_eventos (club_id, fecha_evento);
CREATE INDEX IF NOT EXISTS idx_club_eventos_asistentes_evento ON public.club_eventos_asistentes (evento_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_eventos TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.club_eventos_asistentes TO authenticated;

-- ==============================================================================
-- 9. RANKINGS UNIFICADOS Y VALIDACIÓN ANTI-CHEAT (PATCH #05)
-- ==============================================================================

-- Trigger anti-trampas en rutas (máximo 45 km/h)
CREATE OR REPLACE FUNCTION public.rutas_validar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'La ruta debe pertenecer al usuario autenticado';
    END IF;
    IF COALESCE(NEW.distancia_km, 0) < 0 OR COALESCE(NEW.distancia_km, 0) > 300 THEN
      RAISE EXCEPTION 'Distancia fuera de rango (0-300 km)';
    END IF;
    IF COALESCE(NEW.tiempo_minutos, 0) < 0 OR COALESCE(NEW.tiempo_minutos, 0) > 1440 THEN
      RAISE EXCEPTION 'Duración fuera de rango (0-1440 min)';
    END IF;
    IF COALESCE(NEW.tiempo_minutos, 0) = 0 AND COALESCE(NEW.distancia_km, 0) > 0.5 THEN
      RAISE EXCEPTION 'Duración no plausible para distancia mayor a 500m';
    END IF;
    IF NEW.tiempo_minutos > 0 AND NEW.distancia_km / (NEW.tiempo_minutos / 60.0) > 45 THEN
      RAISE EXCEPTION 'Velocidad media no plausible (>45 km/h)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rutas_validar ON public.rutas;
CREATE TRIGGER trg_rutas_validar
BEFORE INSERT OR UPDATE ON public.rutas
FOR EACH ROW EXECUTE FUNCTION public.rutas_validar();

-- RPC Ranking Riders Unificado (Rutas + User Routes)
CREATE OR REPLACE FUNCTION public.get_ranking_riders(periodo text)
RETURNS TABLE(id uuid, nombre text, avatar_url text, puntos_periodo bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF periodo = 'historico' THEN
    RETURN QUERY
    SELECT 
      p.id,
      p.nombre,
      p.avatar_url,
      COALESCE(p.total_xp, p.puntos, 0)::bigint AS puntos_periodo
    FROM public.perfiles p
    WHERE NOT COALESCE(p.is_private, false)
    ORDER BY puntos_periodo DESC
    LIMIT 50;
  ELSE
    RETURN QUERY
    WITH puntos_combinados AS (
      SELECT 
        r.user_id,
        (ROUND(r.distancia_km * 10) + r.tiempo_minutos)::bigint AS pts
      FROM public.rutas r
      WHERE (
        (periodo = 'diario' AND r.fecha >= date_trunc('day', timezone('utc', now()))) OR
        (periodo = 'semanal' AND r.fecha >= date_trunc('week', timezone('utc', now()))) OR
        (periodo = 'mensual' AND r.fecha >= date_trunc('month', timezone('utc', now()))) OR
        (periodo = 'anual' AND r.fecha >= date_trunc('year', timezone('utc', now())))
      )
      UNION ALL
      SELECT 
        ur.user_id,
        COALESCE(ur.xp_earned, (ROUND(ur.distance_km * 10) + ROUND(ur.duration_seconds / 60.0)))::bigint AS pts
      FROM public.user_routes ur
      WHERE (
        (periodo = 'diario' AND ur.created_at >= date_trunc('day', timezone('utc', now()))) OR
        (periodo = 'semanal' AND ur.created_at >= date_trunc('week', timezone('utc', now()))) OR
        (periodo = 'mensual' AND ur.created_at >= date_trunc('month', timezone('utc', now()))) OR
        (periodo = 'anual' AND ur.created_at >= date_trunc('year', timezone('utc', now())))
      )
    )
    SELECT 
      p.id,
      p.nombre,
      p.avatar_url,
      COALESCE(SUM(pc.pts), 0)::bigint AS puntos_periodo
    FROM public.perfiles p
    JOIN puntos_combinados pc ON pc.user_id = p.id
    WHERE NOT COALESCE(p.is_private, false)
    GROUP BY p.id, p.nombre, p.avatar_url
    ORDER BY puntos_periodo DESC
    LIMIT 50;
  END IF;
END;
$$;

-- RPC Ranking Clubes V2 Unificado (Rutas + User Routes vía Clubs_Usuarios)
CREATE OR REPLACE FUNCTION public.get_ranking_clubs_v2(periodo text)
RETURNS TABLE(
  club_id uuid,
  nombre text,
  logo_url text,
  nivel integer,
  miembros integer,
  km_totales numeric,
  tiempo_total integer,
  rutas_totales integer,
  puntos_periodo bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH actividades_miembros AS (
    SELECT 
      cu.club_id,
      r.distancia_km,
      r.tiempo_minutos,
      (ROUND(r.distancia_km * 10) + r.tiempo_minutos)::bigint AS pts
    FROM public.clubs_usuarios cu
    JOIN public.rutas r ON r.user_id = cu.user_id
    WHERE (
      (periodo = 'diario' AND r.fecha >= date_trunc('day', timezone('utc', now()))) OR
      (periodo = 'semanal' AND r.fecha >= date_trunc('week', timezone('utc', now()))) OR
      (periodo = 'mensual' AND r.fecha >= date_trunc('month', timezone('utc', now()))) OR
      (periodo = 'anual' AND r.fecha >= date_trunc('year', timezone('utc', now()))) OR
      (periodo = 'historico')
    )
    UNION ALL
    SELECT 
      cu.club_id,
      ur.distance_km AS distancia_km,
      ROUND(ur.duration_seconds / 60.0)::integer AS tiempo_minutos,
      COALESCE(ur.xp_earned, (ROUND(ur.distance_km * 10) + ROUND(ur.duration_seconds / 60.0)))::bigint AS pts
    FROM public.clubs_usuarios cu
    JOIN public.user_routes ur ON ur.user_id = cu.user_id
    WHERE (
      (periodo = 'diario' AND ur.created_at >= date_trunc('day', timezone('utc', now()))) OR
      (periodo = 'semanal' AND ur.created_at >= date_trunc('week', timezone('utc', now()))) OR
      (periodo = 'mensual' AND ur.created_at >= date_trunc('month', timezone('utc', now()))) OR
      (periodo = 'anual' AND ur.created_at >= date_trunc('year', timezone('utc', now()))) OR
      (periodo = 'historico')
    )
  )
  SELECT
    c.id AS club_id,
    c.nombre,
    c.logo_url,
    c.nivel,
    COUNT(DISTINCT cu.user_id)::integer AS miembros,
    COALESCE(SUM(am.distancia_km), 0)::numeric AS km_totales,
    COALESCE(SUM(am.tiempo_minutos), 0)::integer AS tiempo_total,
    COUNT(am.pts)::integer AS rutas_totales,
    COALESCE(SUM(am.pts), 0)::bigint AS puntos_periodo
  FROM public.clubs c
  LEFT JOIN public.clubs_usuarios cu ON cu.club_id = c.id
  LEFT JOIN actividades_miembros am ON am.club_id = c.id
  GROUP BY c.id, c.nombre, c.logo_url, c.nivel
  ORDER BY puntos_periodo DESC, miembros DESC
  LIMIT 50;
END;
$$;

-- ==============================================================================
-- 10. ALTA AUTOMÁTICA CONSOLIDADA DE PERFILES EN AUTH.USERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_consolidado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (
    id,
    nombre,
    total_xp,
    puntos,
    total_distance_km,
    km_totales,
    current_level,
    nivel,
    titulo
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nombre', split_part(NEW.email, '@', 1), 'Paddler'),
    0,
    0,
    0,
    0,
    1,
    1,
    'Paddler en Ascenso'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_consolidado();

-- ==============================================================================
-- 11. BUCKET DE ALMACENAMIENTO MULTIMEDIA (STORAGE)
-- ==============================================================================
-- Asegurar la existencia del bucket 'paddlesafe' en storage.buckets de forma idempotente
INSERT INTO storage.buckets (id, name, public)
VALUES ('paddlesafe', 'paddlesafe', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'paddlesafe_storage_public_select'
  ) THEN
    CREATE POLICY paddlesafe_storage_public_select ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'paddlesafe');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'paddlesafe_storage_auth_upload'
  ) THEN
    CREATE POLICY paddlesafe_storage_auth_upload ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'paddlesafe');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'paddlesafe_storage_auth_update'
  ) THEN
    CREATE POLICY paddlesafe_storage_auth_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'paddlesafe')
      WITH CHECK (bucket_id = 'paddlesafe');
  END IF;
END;
$$;

-- Permisos sobre RPCs
REVOKE ALL ON FUNCTION public.actualizar_gamificacion_perfil() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_gamificacion_desde_rutas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_gamificacion_perfil() TO postgres;
GRANT EXECUTE ON FUNCTION public.actualizar_gamificacion_desde_rutas() TO postgres;
GRANT EXECUTE ON FUNCTION public.get_ranking_riders(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_clubs_v2(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.obtener_clubs_usuario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_miembros_club(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_solicitudes_club(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_solicitud_club(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_eliminar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_club_multiclub(text) TO authenticated;

COMMIT;

-- ==============================================================================
-- 12. CONSULTAS DE DIAGNÓSTICO Y VERIFICACIÓN POST-ROLLOUT
-- ==============================================================================
-- Ejecutar opcionalmente tras el commit para comprobar la integridad del catálogo:

-- 12.1. Tablas en el esquema public
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 12.2. Columnas añadidas y tipos de datos
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('perfiles', 'rutas', 'user_routes', 'user_spots', 'spot_reports', 'safety_checkins', 'club_eventos', 'club_eventos_asistentes', 'club_chat')
ORDER BY table_name, ordinal_position;

-- 12.3. Triggers activos en tablas clave
SELECT c.relname AS table_name, t.tgname AS trigger_name,
       p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- 12.4. Políticas de Row Level Security (RLS)
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
