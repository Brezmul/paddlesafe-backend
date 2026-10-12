-- ==============================================================================
-- PADDLESAFE - SCRIPT SQL: TABLA USER_ROUTES Y CAMPOS EN PERFILES
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Añadir los nuevos campos requeridos a la tabla 'perfiles'
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS total_xp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_distance_km double precision DEFAULT 0;

-- Sincronizar los nuevos campos con los datos existentes (si ya había datos previos)
UPDATE public.perfiles
SET 
  total_xp = COALESCE(total_xp, puntos::integer, 0),
  current_level = COALESCE(current_level, nivel, 1),
  total_distance_km = COALESCE(total_distance_km, km_totales::double precision, 0)
WHERE total_xp = 0 AND (puntos > 0 OR km_totales > 0);

-- 2. Crear la tabla 'user_routes' con todos los campos especificados
CREATE TABLE IF NOT EXISTS public.user_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Ruta en Paddle Surf',
  distance_km numeric(8, 2) NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  avg_speed numeric(6, 2) DEFAULT 0,
  max_speed numeric(6, 2) DEFAULT 0,
  route_coordinates jsonb NOT NULL DEFAULT '[]'::jsonb,
  splits_data jsonb DEFAULT '[]'::jsonb,
  ai_feedback jsonb,
  xp_earned integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Índices para acelerar consultas de usuario, historial y rankings
CREATE INDEX IF NOT EXISTS idx_user_routes_user_id ON public.user_routes (user_id);
CREATE INDEX IF NOT EXISTS idx_user_routes_created_at ON public.user_routes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perfiles_total_xp ON public.perfiles (total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_perfiles_total_distance_km ON public.perfiles (total_distance_km DESC);

-- 4. Seguridad de Nivel de Fila (RLS) en 'user_routes'
ALTER TABLE public.user_routes ENABLE ROW LEVEL SECURITY;

-- Política de lectura: los usuarios pueden ver sus propias rutas (o rutas públicas de otros usuarios)
DROP POLICY IF EXISTS "Los usuarios pueden ver sus rutas o rutas de perfiles publicos" ON public.user_routes;
CREATE POLICY "Los usuarios pueden ver sus rutas o rutas de perfiles publicos"
  ON public.user_routes
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.perfiles p 
      WHERE p.id = user_routes.user_id AND NOT COALESCE(p.is_private, false)
    )
  );

-- Política de inserción: cada usuario autenticado solo puede insertar sus propias rutas
DROP POLICY IF EXISTS "Los usuarios pueden insertar sus propias rutas" ON public.user_routes;
CREATE POLICY "Los usuarios pueden insertar sus propias rutas"
  ON public.user_routes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política de actualización: el propietario puede editar sus rutas (ej. título o feedback)
DROP POLICY IF EXISTS "Los usuarios pueden actualizar sus propias rutas" ON public.user_routes;
CREATE POLICY "Los usuarios pueden actualizar sus propias rutas"
  ON public.user_routes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política de borrado: solo el propietario puede borrar su ruta
DROP POLICY IF EXISTS "Los usuarios pueden eliminar sus propias rutas" ON public.user_routes;
CREATE POLICY "Los usuarios pueden eliminar sus propias rutas"
  ON public.user_routes
  FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Trigger automático para actualizar total_xp y total_distance_km en 'perfiles'
CREATE OR REPLACE FUNCTION public.actualizar_gamificacion_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.perfiles
    SET 
      total_xp = COALESCE(total_xp, 0) + COALESCE(NEW.xp_earned, 0),
      puntos = COALESCE(puntos, 0) + COALESCE(NEW.xp_earned, 0),
      total_distance_km = ROUND((COALESCE(total_distance_km, 0) + COALESCE(NEW.distance_km, 0))::numeric, 2),
      km_totales = ROUND((COALESCE(km_totales, 0) + COALESCE(NEW.distance_km, 0))::numeric, 2),
      current_level = GREATEST(1, FLOOR((COALESCE(total_xp, 0) + COALESCE(NEW.xp_earned, 0)) / 500) + 1)
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.perfiles
    SET 
      total_xp = GREATEST(0, COALESCE(total_xp, 0) - COALESCE(OLD.xp_earned, 0)),
      puntos = GREATEST(0, COALESCE(puntos, 0) - COALESCE(OLD.xp_earned, 0)),
      total_distance_km = GREATEST(0, ROUND((COALESCE(total_distance_km, 0) - COALESCE(OLD.distance_km, 0))::numeric, 2)),
      km_totales = GREATEST(0, ROUND((COALESCE(km_totales, 0) - COALESCE(OLD.distance_km, 0))::numeric, 2)),
      current_level = GREATEST(1, FLOOR(GREATEST(0, COALESCE(total_xp, 0) - COALESCE(OLD.xp_earned, 0)) / 500) + 1)
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_perfil ON public.user_routes;
CREATE TRIGGER trg_actualizar_gamificacion_perfil
AFTER INSERT OR DELETE ON public.user_routes
FOR EACH ROW EXECUTE FUNCTION public.actualizar_gamificacion_perfil();

