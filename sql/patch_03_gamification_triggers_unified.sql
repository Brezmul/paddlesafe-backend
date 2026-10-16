-- ==============================================================================
-- PADDLESAFE - PARCHE 3: UNIFICACIÓN DE GAMIFICACIÓN, NIVELES Y TRIGGERS
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. FUNCIÓN Y TRIGGER PARA ASIGNAR TÍTULO SEGÚN NIVEL
CREATE OR REPLACE FUNCTION public.calcular_titulo_paddler(p_nivel integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
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

-- 2. TRIGGER MAESTRO DE GAMIFICACIÓN EN 'user_routes'
-- Utiliza la fórmula cuadrática universal: nivel = floor(sqrt(total_xp / 100)) + 1
CREATE OR REPLACE FUNCTION public.actualizar_gamificacion_perfil()
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target_user := NEW.user_id;
    
    -- Calcular nuevos totales atómicos
    SELECT 
      COALESCE(total_xp, 0) + COALESCE(NEW.xp_earned, 0),
      ROUND((COALESCE(total_distance_km, 0) + COALESCE(NEW.distance_km, 0))::numeric, 2)
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;

  ELSIF TG_OP = 'DELETE' THEN
    v_target_user := OLD.user_id;

    SELECT 
      GREATEST(0, COALESCE(total_xp, 0) - COALESCE(OLD.xp_earned, 0)),
      GREATEST(0, ROUND((COALESCE(total_distance_km, 0) - COALESCE(OLD.distance_km, 0))::numeric, 2))
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;
  END IF;

  -- Calcular nivel con fórmula cuadrática estandarizada
  v_nuevo_nivel := GREATEST(1, FLOOR(SQRT(COALESCE(v_nuevo_xp, 0)::numeric / 100)) + 1);
  v_nuevo_titulo := public.calcular_titulo_paddler(v_nuevo_nivel);

  -- Actualizar perfil atómicamente
  UPDATE public.perfiles
  SET 
    total_xp = v_nuevo_xp,
    puntos = v_nuevo_xp,
    total_distance_km = v_nuevo_km,
    km_totales = v_nuevo_km,
    current_level = v_nuevo_nivel,
    nivel = v_nuevo_nivel,
    titulo = v_nuevo_titulo
  WHERE id = v_target_user;

  RETURN NULL;
END;
$$;

-- Asegurar que el trigger esté asignado a 'user_routes'
DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_perfil ON public.user_routes;
CREATE TRIGGER trg_actualizar_gamificacion_perfil
AFTER INSERT OR DELETE ON public.user_routes
FOR EACH ROW EXECUTE FUNCTION public.actualizar_gamificacion_perfil();

-- 3. ELIMINAR TRIGGER OBSOLETO 'actualizar_progresion_paddler' QUE SOBRESCRIBÍA EL NIVEL
DROP TRIGGER IF EXISTS trigger_actualizar_progresion ON public.perfiles;
DROP TRIGGER IF EXISTS trg_actualizar_progresion_paddler ON public.perfiles;

-- 4. CONSOLIDAR CREACIÓN DE PERFIL AUTOMÁTICO EN 'auth.users'
-- Evitar que 'crear_perfil_automatico' y 'handle_new_user' colisionen
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
    km_totales,
    total_distance_km,
    nivel,
    current_level,
    titulo,
    tiempo_total,
    puntos,
    total_xp,
    is_vip,
    is_private,
    insignias
  )
  VALUES (
    NEW.id,
    v_nombre,
    'https://api.dicebear.com/9.x/adventurer/svg?seed=' || NEW.id || '&backgroundColor=e0f2fe',
    0.00,
    0.00,
    1,
    1,
    'Paddler en Ascenso',
    0,
    0,
    0,
    false,
    false,
    '[]'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_crear_perfil_automatico ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_consolidado();

