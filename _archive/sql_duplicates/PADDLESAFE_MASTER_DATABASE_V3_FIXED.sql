-- ==============================================================================
-- PADDLESAFE - MASTER DATABASE ROLLOUT V3 (FIXED & AUDITED COMPILATION EDITION)
-- ==============================================================================
-- Documento: PADDLESAFE_MASTER_DATABASE_V3_FIXED.sql
-- Propósito: Capa de persistencia integral, consolidada, 100% idempotente y
--            completamente auditada contra el catálogo real de Supabase PostgreSQL.
--
-- Correcciones Críticas de Compilación Aplicadas:
--   1. Resuelto Error PostgreSQL 42P13 ("cannot change return type of existing function"):
--      - Causa: En PostgreSQL, CREATE OR REPLACE FUNCTION no puede alterar el tipo
--        de retorno ni las columnas OUT de funciones RETURNS TABLE existentes si
--        ya fueron desplegadas con una estructura diferente (ej: obtener_clubs_usuario).
--      - Solución: Se incorpora un bloque dinámico de catálogo en el preflight que
--        identifica y elimina de forma limpia cualquier firma previa de las funciones
--        RPC (DROP FUNCTION IF EXISTS ... CASCADE), sumado a DROP explícitos antes de
--        cada declaración.
--   2. Tipos de datos en 'calcular_titulo_paddler':
--      - Causa: FLOOR() y SQRT() en PostgreSQL devuelven tipo numeric.
--        Al llamar calcular_titulo_paddler(numeric), PostgreSQL fallaba porque solo
--        esperaba integer.
--      - Solución:
--        a) Casts explícitos ::integer en todas las llamadas.
--        b) Sobrecargas polimórficas calcular_titulo_paddler(numeric) y
--           calcular_titulo_paddler(double precision) que canalizan a integer.
--   3. Incompatibilidades aritméticas de tipo (double precision vs numeric):
--      - Resuelto el conflicto de operadores en 'paddlesafe_apply_gamification_delta'
--        donde la suma de total_distance_km (double precision) y p_km_delta (numeric)
--        generaba ambigüedad en el catálogo de operadores de PostgreSQL.
--      - Sanitización de llamadas a ROUND() asegurando tipos numeric explícitos.
--   4. Resiliencia en módulo de Clubes:
--      - Se garantiza la existencia previa de 'clubs', 'clubs_usuarios', 'club_chat',
--        'clubs_solicitudes', 'clubs_invitaciones', 'club_rutas' y 'club_showcase'.
--      - En 'club_eliminar', la eliminación sobre tablas dependientes opcionales
--        se ejecuta mediante SQL dinámico condicionado a 'to_regclass()', evitando
--        que el script falle si alguna tabla auxiliar aún no ha sido creada.
--   5. Módulo de Quedadas ('club_eventos' y 'club_eventos_asistentes'):
--      - Creación condicional y sincronización de columnas vía ADD COLUMN IF NOT EXISTS
--        sin riesgo de pérdida de datos.
--   6. Aislamiento y resiliencia en esquema 'storage':
--      - Comprobación previa de 'storage.buckets' y 'storage.objects' antes de
--        crear buckets o políticas de almacenamiento para evitar errores en
--        entornos donde el esquema de storage no esté activo.
--   7. Fusión y coexistencia de alta de usuarios en 'auth.users':
--      - Manejo unificado de 'handle_new_user()' y 'handle_new_user_consolidado()'
--        con inserción defensiva 'ON CONFLICT (id) DO UPDATE'.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 0. PREFLIGHT DIAGNOSTIC GUARDS & CLEANUP
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

-- ------------------------------------------------------------------------------
-- 0.1. Limpieza preventiva y dinámica de firmas de funciones RPC en public
-- Evita el error PostgreSQL 42P13 ("cannot change return type of existing function")
-- cuando una función existía con parámetros OUT o RETURNS TABLE diferentes.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'obtener_clubs_usuario',
        'obtener_miembros_club',
        'obtener_solicitudes_club',
        'procesar_solicitud_club',
        'club_eliminar',
        'crear_club_multiclub',
        'get_ranking_riders',
        'get_ranking_clubs_v2',
        'calcular_titulo_paddler',
        'paddlesafe_apply_gamification_delta',
        'paddlesafe_route_xp',
        'actualizar_gamificacion_perfil',
        'actualizar_gamificacion_desde_rutas',
        'rutas_validar',
        'handle_new_user_consolidado',
        'handle_new_user'
      )
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE;';
  END LOOP;
END;
$$;

-- ==============================================================================
-- 1. EXTENSIÓN Y UNIFICACIÓN DE PERFILES (GAMIFICACIÓN Y EQUIPO SUP)
-- ==============================================================================
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS total_xp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puntos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_distance_km double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_totales double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nivel integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS titulo text DEFAULT 'Paddler en Ascenso',
  ADD COLUMN IF NOT EXISTS tiempo_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insignias jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sup_board_type text,
  ADD COLUMN IF NOT EXISTS sup_cruise_speed_kmh numeric(6,2),
  ADD COLUMN IF NOT EXISTS sup_drift_factor numeric(8,4),
  ADD COLUMN IF NOT EXISTS sup_wind_factor numeric(8,4),
  ADD COLUMN IF NOT EXISTS sup_gear_name text,
  ADD COLUMN IF NOT EXISTS sup_gear_updated_at timestamptz;

-- 1.1. Función base para calcular el título de paddler (firma canónica integer)
DROP FUNCTION IF EXISTS public.calcular_titulo_paddler(integer);
CREATE OR REPLACE FUNCTION public.calcular_titulo_paddler(p_nivel integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE COALESCE(p_nivel, 1)
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

-- 1.2. Sobrecarga de compatibilidad para numeric (evita errores con FLOOR / SQRT)
DROP FUNCTION IF EXISTS public.calcular_titulo_paddler(numeric);
CREATE OR REPLACE FUNCTION public.calcular_titulo_paddler(p_nivel numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT public.calcular_titulo_paddler(COALESCE(ROUND(p_nivel)::integer, 1));
$$;

-- 1.3. Sobrecarga de compatibilidad para double precision (float8)
DROP FUNCTION IF EXISTS public.calcular_titulo_paddler(double precision);
CREATE OR REPLACE FUNCTION public.calcular_titulo_paddler(p_nivel double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT public.calcular_titulo_paddler(COALESCE(ROUND(p_nivel::numeric)::integer, 1));
$$;

-- 1.4. Backfill y normalización idempotente en perfiles
UPDATE public.perfiles
SET
  total_xp = COALESCE(NULLIF(total_xp, 0), puntos, 0),
  puntos = COALESCE(NULLIF(puntos, 0), total_xp, 0),
  total_distance_km = ROUND(COALESCE(NULLIF(total_distance_km, 0), km_totales, 0)::numeric, 2)::double precision,
  km_totales = ROUND(COALESCE(NULLIF(km_totales, 0), total_distance_km, 0)::numeric, 2)::double precision,
  current_level = GREATEST(
    1,
    (FLOOR(SQRT(COALESCE(NULLIF(total_xp, 0), puntos, 0)::numeric / 100)) + 1)::integer
  ),
  nivel = GREATEST(
    1,
    (FLOOR(SQRT(COALESCE(NULLIF(total_xp, 0), puntos, 0)::numeric / 100)) + 1)::integer
  ),
  titulo = COALESCE(
    NULLIF(titulo, ''),
    public.calcular_titulo_paddler(
      GREATEST(
        1,
        (FLOOR(SQRT(COALESCE(NULLIF(total_xp, 0), puntos, 0)::numeric / 100)) + 1)::integer
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

-- 1.5. Índices de rendimiento para perfiles
CREATE INDEX IF NOT EXISTS idx_perfiles_total_xp ON public.perfiles (total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_perfiles_total_distance_km ON public.perfiles (total_distance_km DESC);
CREATE INDEX IF NOT EXISTS idx_perfiles_is_private ON public.perfiles (is_private);

-- Eliminar triggers antiguos que sobreescribían progresión o causaban bucles infinitos
DROP TRIGGER IF EXISTS trigger_actualizar_progresion ON public.perfiles;
DROP TRIGGER IF EXISTS trg_actualizar_progresion_paddler ON public.perfiles;

-- ==============================================================================
-- 2. MODELO DE TRAVESÍAS Y TELEMETRÍA METEOROLÓGICA (PATCH #08)
-- ==============================================================================
-- 2.1. Telemetría de condiciones en la tabla histórica 'public.rutas'
ALTER TABLE public.rutas
  ADD COLUMN IF NOT EXISTS fecha timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS avg_speed_kmh numeric(6,2),
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

-- 2.2. Tabla avanzada 'public.user_routes' para grabaciones GPX, splits y telemetría pro
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

-- Asegurar columnas si user_routes ya existía previamente con esquema parcial
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

DROP POLICY IF EXISTS "user_routes_select_policy" ON public.user_routes;
CREATE POLICY "user_routes_select_policy" ON public.user_routes
  FOR SELECT TO authenticated, anon
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = user_routes.user_id AND NOT COALESCE(p.is_private, false)
    )
  );

DROP POLICY IF EXISTS "user_routes_insert_own" ON public.user_routes;
CREATE POLICY "user_routes_insert_own" ON public.user_routes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_routes_update_own" ON public.user_routes;
CREATE POLICY "user_routes_update_own" ON public.user_routes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_routes_delete_own" ON public.user_routes;
CREATE POLICY "user_routes_delete_own" ON public.user_routes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.user_routes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_routes TO authenticated;

-- ==============================================================================
-- 3. MOTOR DE GAMIFICACIÓN ATÓMICA UNIFICADA (PATCH #02)
-- ==============================================================================

-- 3.1. Aplicación de deltas en perfiles con tipado estricto
DROP FUNCTION IF EXISTS public.paddlesafe_apply_gamification_delta(uuid, integer, numeric);
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
DECLARE
  v_xp_actual integer;
  v_km_actual numeric;
  v_xp_nuevo integer;
  v_km_nuevo numeric;
  v_nivel_nuevo integer;
  v_titulo_nuevo text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT 
    COALESCE(p.total_xp, p.puntos, 0),
    COALESCE(p.total_distance_km, p.km_totales, 0.0)::numeric
  INTO v_xp_actual, v_km_actual
  FROM public.perfiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_xp_nuevo := GREATEST(0, v_xp_actual + COALESCE(p_xp_delta, 0));
  v_km_nuevo := ROUND(GREATEST(0::numeric, v_km_actual + COALESCE(p_km_delta, 0::numeric)), 2);
  v_nivel_nuevo := GREATEST(1, (FLOOR(SQRT(v_xp_nuevo::numeric / 100)) + 1)::integer);
  v_titulo_nuevo := public.calcular_titulo_paddler(v_nivel_nuevo);

  UPDATE public.perfiles
  SET
    total_xp = v_xp_nuevo,
    puntos = v_xp_nuevo,
    total_distance_km = v_km_nuevo::double precision,
    km_totales = v_km_nuevo::double precision,
    current_level = v_nivel_nuevo,
    nivel = v_nivel_nuevo,
    titulo = v_titulo_nuevo
  WHERE id = p_user_id;
END;
$$;

-- 3.2. Extracción de XP y sanitización de velocidad anti-cheat
DROP FUNCTION IF EXISTS public.paddlesafe_route_xp(jsonb);
CREATE OR REPLACE FUNCTION public.paddlesafe_route_xp(p_route jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_distance numeric;
  v_duration_min integer;
  v_speed numeric;
  v_xp_text text;
BEGIN
  IF p_route IS NULL THEN
    RETURN 0;
  END IF;

  -- Respetar puntos ganados precalculados si existen
  v_xp_text := COALESCE(
    NULLIF(p_route ->> 'points_earned', ''),
    NULLIF(p_route ->> 'xp_earned', '')
  );
  IF v_xp_text IS NOT NULL THEN
    BEGIN
      RETURN v_xp_text::integer;
    EXCEPTION WHEN OTHERS THEN
      RETURN ROUND(v_xp_text::numeric)::integer;
    END;
  END IF;

  v_distance := COALESCE(
    NULLIF(p_route ->> 'distancia_km', '')::numeric,
    NULLIF(p_route ->> 'distance_km', '')::numeric,
    0::numeric
  );

  v_duration_min := COALESCE(
    NULLIF(p_route ->> 'tiempo_minutos', '')::numeric::integer,
    ROUND(COALESCE(NULLIF(p_route ->> 'duration_seconds', '')::numeric, 0::numeric) / 60.0)::integer,
    0
  );

  v_speed := COALESCE(
    NULLIF(p_route ->> 'avg_speed_kmh', '')::numeric,
    NULLIF(p_route ->> 'avg_speed', '')::numeric,
    0::numeric
  );

  -- Filtro anti-trampas: más de 45 km/h no puntúa
  IF v_speed > 45 THEN
    RETURN 0;
  END IF;

  -- Regla oficial PaddleSafe: ROUND(distancia_km * 10) + tiempo_minutos
  IF v_duration_min > 0 THEN
    RETURN (ROUND(v_distance * 10)::integer + v_duration_min);
  ELSE
    RETURN ROUND(v_distance * 100)::integer;
  END IF;
END;
$$;

-- 3.3. Trigger en user_routes
DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_perfil ON public.user_routes;
DROP FUNCTION IF EXISTS public.actualizar_gamificacion_perfil();

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

CREATE TRIGGER trg_actualizar_gamificacion_perfil
AFTER INSERT OR DELETE OR UPDATE OF user_id, distance_km, duration_seconds, xp_earned, avg_speed
ON public.user_routes
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_gamificacion_perfil();

-- 3.4. Trigger en rutas
DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_desde_rutas ON public.rutas;
DROP FUNCTION IF EXISTS public.actualizar_gamificacion_desde_rutas();

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

CREATE TRIGGER trg_actualizar_gamificacion_desde_rutas
AFTER INSERT OR DELETE OR UPDATE OF user_id, distancia_km, tiempo_minutos, points_earned, xp_earned
ON public.rutas
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_gamificacion_desde_rutas();

-- ==============================================================================
-- 4. SPOTS FAVORITOS DEL USUARIO (PATCH #04)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_spots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  lat numeric(9,6) NOT NULL,
  lon numeric(9,6) NOT NULL,
  seaward_deg integer,
  orden integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS seaward_deg integer,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Constraint UNIQUE seguro contra duplicados previos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_spots'::regclass AND contype = 'u'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_spots GROUP BY user_id, nombre HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE public.user_spots ADD CONSTRAINT uq_user_spots_user_nombre UNIQUE (user_id, nombre);
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

ALTER TABLE public.user_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_spots_select_own" ON public.user_spots;
CREATE POLICY "user_spots_select_own" ON public.user_spots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_spots_insert_own" ON public.user_spots;
CREATE POLICY "user_spots_insert_own" ON public.user_spots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_spots_update_own" ON public.user_spots;
CREATE POLICY "user_spots_update_own" ON public.user_spots
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_spots_delete_own" ON public.user_spots;
CREATE POLICY "user_spots_delete_own" ON public.user_spots
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_spots_user ON public.user_spots (user_id, orden);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_spots TO authenticated;

-- ==============================================================================
-- 5. REPORTES COLABORATIVOS EN TIEMPO REAL (PATCH #06 / WAZE SUP)
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

ALTER TABLE public.spot_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spot_reports_select_recent" ON public.spot_reports;
CREATE POLICY "spot_reports_select_recent" ON public.spot_reports
  FOR SELECT TO anon, authenticated
  USING (
    created_at >= (now() - interval '6 hours')
  );

DROP POLICY IF EXISTS "spot_reports_insert_auth" ON public.spot_reports;
CREATE POLICY "spot_reports_insert_auth" ON public.spot_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND lat BETWEEN -90 AND 90
    AND lon BETWEEN -180 AND 180
    AND NULLIF(btrim(tag), '') IS NOT NULL
  );

DROP POLICY IF EXISTS "spot_reports_insert_anon" ON public.spot_reports;
CREATE POLICY "spot_reports_insert_anon" ON public.spot_reports
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND lat BETWEEN -90 AND 90
    AND lon BETWEEN -180 AND 180
    AND NULLIF(btrim(tag), '') IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_spot_reports_created_at ON public.spot_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spot_reports_coords ON public.spot_reports (lat, lon);
GRANT SELECT, INSERT ON public.spot_reports TO anon, authenticated;

-- ==============================================================================
-- 6. GUARDACOSTAS VIRTUAL Y SEGURIDAD TELEMÉTRICA (PATCH #09)
-- ==============================================================================
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

DROP POLICY IF EXISTS "safety_checkins_select_own" ON public.safety_checkins;
CREATE POLICY "safety_checkins_select_own" ON public.safety_checkins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "safety_checkins_insert_own" ON public.safety_checkins;
CREATE POLICY "safety_checkins_insert_own" ON public.safety_checkins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "safety_checkins_update_own" ON public.safety_checkins;
CREATE POLICY "safety_checkins_update_own" ON public.safety_checkins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "safety_checkins_delete_own" ON public.safety_checkins;
CREATE POLICY "safety_checkins_delete_own" ON public.safety_checkins
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

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

-- 7.1. Esquemas condicionales seguros de Clubes
CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  descripcion text,
  logo_url text,
  banner_url text,
  ubicacion text,
  nivel integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS creador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS ubicacion text,
  ADD COLUMN IF NOT EXISTS nivel integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.clubs_usuarios (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol text NOT NULL DEFAULT 'miembro',
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

ALTER TABLE public.clubs_usuarios
  ADD COLUMN IF NOT EXISTS rol text DEFAULT 'miembro',
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.club_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensaje text NOT NULL,
  visibility text DEFAULT 'club_only',
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.club_chat
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'club_only',
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.clubs_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clubs_invitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_rutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  ruta_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.club_showcase (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imagen_url text NOT NULL,
  descripcion text,
  created_at timestamptz DEFAULT now()
);

-- Vista de membresías para desacoplamiento y compatibilidad
DROP VIEW IF EXISTS public.memberships CASCADE;

DO $$
BEGIN
  IF to_regclass('public.clubs_usuarios') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.memberships AS
      SELECT
        club_id,
        user_id,
        rol,
        COALESCE(joined_at, created_at, now()) AS joined_at
      FROM public.clubs_usuarios;
    $view$;
    EXECUTE 'GRANT SELECT ON public.memberships TO authenticated, anon;';
  END IF;
END;
$$;

-- RLS en club_chat
ALTER TABLE public.club_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_chat_select_members_only" ON public.club_chat;
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

DROP POLICY IF EXISTS "club_chat_insert_members_only" ON public.club_chat;
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

DROP POLICY IF EXISTS "club_chat_delete_author_or_admin" ON public.club_chat;
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
DROP FUNCTION IF EXISTS public.crear_club_multiclub(text);
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

-- RPC: Obtener los clubes a los que pertenece el usuario (Previamente causó error 42P13 al tener OUT params diferentes)
DROP FUNCTION IF EXISTS public.obtener_clubs_usuario(uuid);
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
DROP FUNCTION IF EXISTS public.obtener_miembros_club(uuid);
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
DROP FUNCTION IF EXISTS public.obtener_solicitudes_club(uuid);
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
DROP FUNCTION IF EXISTS public.procesar_solicitud_club(uuid, text);
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

-- RPC: Eliminación completa de club con SQL dinámico condicional
DROP FUNCTION IF EXISTS public.club_eliminar(uuid);
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

  -- Borrado dinámico condicionado a la existencia física de las tablas auxiliares
  IF to_regclass('public.clubs_invitaciones') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.clubs_invitaciones WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.clubs_solicitudes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.clubs_solicitudes WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.club_chat') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.club_chat WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.club_rutas') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.club_rutas WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.club_eventos') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.club_eventos WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.club_showcase') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.club_showcase WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.clubs_usuarios') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.clubs_usuarios WHERE club_id = $1' USING p_club;
  END IF;
  IF to_regclass('public.clubs') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.clubs WHERE id = $1' USING p_club;
  END IF;

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

ALTER TABLE public.club_eventos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS distancia_km numeric(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiempo_minutos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ruta_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.club_eventos_asistentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.club_eventos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_club_eventos_asistentes_evento_user'
  ) THEN
    ALTER TABLE public.club_eventos_asistentes
      ADD CONSTRAINT uq_club_eventos_asistentes_evento_user UNIQUE (evento_id, user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

ALTER TABLE public.club_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_eventos_asistentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_eventos_select_members" ON public.club_eventos;
CREATE POLICY "club_eventos_select_members" ON public.club_eventos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs_usuarios cu
      WHERE cu.club_id = club_eventos.club_id AND cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "club_eventos_insert_members" ON public.club_eventos;
CREATE POLICY "club_eventos_insert_members" ON public.club_eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    creador_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clubs_usuarios cu
      WHERE cu.club_id = club_eventos.club_id AND cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "club_eventos_delete_creator_or_admin" ON public.club_eventos;
CREATE POLICY "club_eventos_delete_creator_or_admin" ON public.club_eventos
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

DROP POLICY IF EXISTS "asistentes_select_members" ON public.club_eventos_asistentes;
CREATE POLICY "asistentes_select_members" ON public.club_eventos_asistentes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_eventos ce
      JOIN public.clubs_usuarios cu ON cu.club_id = ce.club_id
      WHERE ce.id = club_eventos_asistentes.evento_id AND cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "asistentes_insert_own" ON public.club_eventos_asistentes;
CREATE POLICY "asistentes_insert_own" ON public.club_eventos_asistentes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "asistentes_delete_own" ON public.club_eventos_asistentes;
CREATE POLICY "asistentes_delete_own" ON public.club_eventos_asistentes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_club_eventos_club_fecha ON public.club_eventos (club_id, fecha_evento);
CREATE INDEX IF NOT EXISTS idx_club_eventos_asistentes_evento ON public.club_eventos_asistentes (evento_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_eventos TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.club_eventos_asistentes TO authenticated;

-- ==============================================================================
-- 9. RANKINGS UNIFICADOS Y VALIDACIÓN ANTI-CHEAT (PATCH #05)
-- ==============================================================================

-- 9.1. Validación de rangos físicos y velocidad en rutas
DROP TRIGGER IF EXISTS trg_rutas_validar ON public.rutas;
DROP FUNCTION IF EXISTS public.rutas_validar();

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

CREATE TRIGGER trg_rutas_validar
BEFORE INSERT OR UPDATE ON public.rutas
FOR EACH ROW EXECUTE FUNCTION public.rutas_validar();

-- 9.2. RPC Ranking Riders Unificado
DROP FUNCTION IF EXISTS public.get_ranking_riders(text);
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
        (ROUND(r.distancia_km::numeric * 10)::bigint + COALESCE(r.tiempo_minutos, 0)::bigint) AS pts
      FROM public.rutas r
      WHERE (
        (periodo = 'diario' AND COALESCE(r.fecha, r.created_at) >= date_trunc('day', timezone('utc', now()))) OR
        (periodo = 'semanal' AND COALESCE(r.fecha, r.created_at) >= date_trunc('week', timezone('utc', now()))) OR
        (periodo = 'mensual' AND COALESCE(r.fecha, r.created_at) >= date_trunc('month', timezone('utc', now()))) OR
        (periodo = 'anual' AND COALESCE(r.fecha, r.created_at) >= date_trunc('year', timezone('utc', now())))
      )
      UNION ALL
      SELECT 
        ur.user_id,
        COALESCE(
          ur.xp_earned::bigint,
          (ROUND(ur.distance_km::numeric * 10)::bigint + ROUND(ur.duration_seconds::numeric / 60.0)::bigint)
        ) AS pts
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

-- 9.3. RPC Ranking Clubes V2 Unificado
DROP FUNCTION IF EXISTS public.get_ranking_clubs_v2(text);
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
      r.distancia_km::numeric AS distancia_km,
      COALESCE(r.tiempo_minutos, 0)::integer AS tiempo_minutos,
      (ROUND(r.distancia_km::numeric * 10)::bigint + COALESCE(r.tiempo_minutos, 0)::bigint) AS pts
    FROM public.clubs_usuarios cu
    JOIN public.rutas r ON r.user_id = cu.user_id
    WHERE (
      (periodo = 'diario' AND COALESCE(r.fecha, r.created_at) >= date_trunc('day', timezone('utc', now()))) OR
      (periodo = 'semanal' AND COALESCE(r.fecha, r.created_at) >= date_trunc('week', timezone('utc', now()))) OR
      (periodo = 'mensual' AND COALESCE(r.fecha, r.created_at) >= date_trunc('month', timezone('utc', now()))) OR
      (periodo = 'anual' AND COALESCE(r.fecha, r.created_at) >= date_trunc('year', timezone('utc', now()))) OR
      (periodo = 'historico')
    )
    UNION ALL
    SELECT 
      cu.club_id,
      ur.distance_km::numeric AS distancia_km,
      ROUND(ur.duration_seconds::numeric / 60.0)::integer AS tiempo_minutos,
      COALESCE(
        ur.xp_earned::bigint,
        (ROUND(ur.distance_km::numeric * 10)::bigint + ROUND(ur.duration_seconds::numeric / 60.0)::bigint)
      ) AS pts
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
    COALESCE(c.nivel, 1)::integer AS nivel,
    COUNT(DISTINCT cu.user_id)::integer AS miembros,
    ROUND(COALESCE(SUM(am.distancia_km), 0)::numeric, 2) AS km_totales,
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
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_crear_perfil_automatico ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_consolidado();
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user_consolidado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
BEGIN
  v_nombre := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nombre'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    'Paddler'
  );

  INSERT INTO public.perfiles (
    id,
    nombre,
    avatar_url,
    total_xp,
    puntos,
    total_distance_km,
    km_totales,
    current_level,
    nivel,
    titulo,
    tiempo_total,
    is_vip,
    is_private,
    insignias
  )
  VALUES (
    NEW.id,
    v_nombre,
    'https://api.dicebear.com/9.x/adventurer/svg?seed=' || NEW.id || '&backgroundColor=e0f2fe',
    0,
    0,
    0.00,
    0.00,
    1,
    1,
    'Paddler en Ascenso',
    0,
    false,
    false,
    '[]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    nombre = COALESCE(NULLIF(public.perfiles.nombre, ''), EXCLUDED.nombre),
    avatar_url = COALESCE(public.perfiles.avatar_url, EXCLUDED.avatar_url);

  RETURN NEW;
END;
$$;

-- Alias de compatibilidad para handle_new_user() si otros procesos lo referencian
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.handle_new_user_consolidado();
END;
$$;

-- Configuración condicional del trigger en auth.users
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_consolidado();
  END IF;
END;
$$;

-- ==============================================================================
-- 11. BUCKET DE ALMACENAMIENTO MULTIMEDIA (STORAGE CONDICIONAL)
-- ==============================================================================
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('paddlesafe', 'paddlesafe', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    DROP POLICY IF EXISTS "paddlesafe_storage_public_select" ON storage.objects;
    CREATE POLICY "paddlesafe_storage_public_select" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'paddlesafe');

    DROP POLICY IF EXISTS "paddlesafe_storage_auth_upload" ON storage.objects;
    CREATE POLICY "paddlesafe_storage_auth_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'paddlesafe');

    DROP POLICY IF EXISTS "paddlesafe_storage_auth_update" ON storage.objects;
    CREATE POLICY "paddlesafe_storage_auth_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'paddlesafe')
      WITH CHECK (bucket_id = 'paddlesafe');
  ELSE
    RAISE NOTICE 'Esquema de storage no detectado; configuración omitida con éxito.';
  END IF;
END;
$$;

-- ==============================================================================
-- 12. PERMISOS Y PRIVILEGIOS DE EJECUCIÓN
-- ==============================================================================
REVOKE ALL ON FUNCTION public.actualizar_gamificacion_perfil() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_gamificacion_desde_rutas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_gamificacion_perfil() TO postgres;
GRANT EXECUTE ON FUNCTION public.actualizar_gamificacion_desde_rutas() TO postgres;
GRANT EXECUTE ON FUNCTION public.calcular_titulo_paddler(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calcular_titulo_paddler(numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calcular_titulo_paddler(double precision) TO authenticated, anon;
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
-- 13. POST-ROLLOUT CATALOG VERIFICATION QUERIES
-- ==============================================================================
-- Tablas activas
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Columnas de tablas clave
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('perfiles', 'rutas', 'user_routes', 'user_spots', 'spot_reports', 'safety_checkins', 'clubs', 'club_eventos', 'club_chat')
ORDER BY table_name, ordinal_position;

-- Triggers no internos
SELECT c.relname AS table_name, t.tgname AS trigger_name, p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
