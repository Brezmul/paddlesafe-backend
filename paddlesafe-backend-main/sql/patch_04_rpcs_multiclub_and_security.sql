-- ==============================================================================
-- PADDLESAFE - PARCHE 4: CORRECCIÓN DE RPCs, SEGURIDAD Y UMBRALES DE VELOCIDAD
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. ELIMINAR VECTOR DE ESCALADA EN 'procesar_solicitud_club'
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

  -- Comprobar permisos de administrador en 'clubs_usuarios'
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

-- 2. CORREGIR 'club_eliminar' PARA SISTEMA MULTICLUB Y TABLAS HIJAS CORRECTAS
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

  -- Borrado en cascada seguro sin tablas erróneas
  DELETE FROM public.clubs_invitaciones WHERE club_id = p_club;
  DELETE FROM public.clubs_solicitudes  WHERE club_id = p_club;
  DELETE FROM public.club_chat         WHERE club_id = p_club;
  DELETE FROM public.club_rutas        WHERE club_id = p_club;
  DELETE FROM public.club_eventos      WHERE club_id = p_club;
  DELETE FROM public.club_showcase     WHERE club_id = p_club;
  DELETE FROM public.club_locations    WHERE club_id = p_club;
  DELETE FROM public.trofeos_club      WHERE club_id = p_club;
  DELETE FROM public.clubs_usuarios    WHERE club_id = p_club;
  DELETE FROM public.clubs            WHERE id = p_club;

  RETURN true;
END;
$$;

-- 3. PROTEGER ASIGNACIÓN DE INSIGNIAS CON SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.asignar_insignias_aleatorias(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cantidad integer := floor(random() * 5) + 2;
  insignia text;
BEGIN
  FOR i IN 1..cantidad LOOP
    SELECT codigo INTO insignia
    FROM public.catalog_insignias
    ORDER BY random()
    LIMIT 1;

    IF insignia IS NOT NULL THEN
      UPDATE public.perfiles
      SET insignias = COALESCE(insignias, '[]'::jsonb) || to_jsonb(insignia)
      WHERE id = user_id
        AND NOT (COALESCE(insignias, '[]'::jsonb) @> to_jsonb(insignia));
    END IF;
  END LOOP;
END;
$$;

-- 4. ALINEAR UMBRAL DE VELOCIDAD MÁXIMA EN VALIDACIÓN (DE 30 A 45 KM/H)
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
      RAISE EXCEPTION 'Distancia fuera de rango';
    END IF;
    IF COALESCE(NEW.tiempo_minutos, 0) < 0 OR COALESCE(NEW.tiempo_minutos, 0) > 1440 THEN
      RAISE EXCEPTION 'Duración fuera de rango';
    END IF;
    IF COALESCE(NEW.tiempo_minutos, 0) = 0 AND COALESCE(NEW.distancia_km, 0) > 0.5 THEN
      RAISE EXCEPTION 'Duración no plausible';
    END IF;
    -- Velocidad media máxima plausible ampliada a 45 km/h para sesiones de Race / Downwind
    IF NEW.tiempo_minutos > 0 AND NEW.distancia_km / (NEW.tiempo_minutos / 60.0) > 45 THEN
      RAISE EXCEPTION 'Velocidad media no plausible (>45 km/h)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
