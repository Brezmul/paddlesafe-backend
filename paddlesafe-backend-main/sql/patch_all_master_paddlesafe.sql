-- ==============================================================================
-- PADDLESAFE - MASTER SCRIPT DE REMEDIACIÓN Y AUDITORÍA SUPABASE
-- Ejecutar este archivo completo en el SQL Editor de Supabase
-- Incluye: Seguridad RLS, Privacidad de Clubes, Gamificación Atómica,
-- Corrección de RPCs y Unificación de Rankings (rutas + user_routes).
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- PARTE 1: CORRECCIÓN DE COLUMNAS Y ESTRUCTURA
-- ==============================================================================

-- Asegurar columnas en 'perfiles'
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS total_xp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_distance_km double precision DEFAULT 0;

-- Asegurar columnas en 'club_chat'
ALTER TABLE public.club_chat 
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'club_only',
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

UPDATE public.club_chat
SET 
  visibility = COALESCE(visibility, 'club_only'),
  is_public = COALESCE(is_public, false)
WHERE visibility IS NULL OR is_public IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_club_chat_visibility') THEN
    ALTER TABLE public.club_chat ADD CONSTRAINT chk_club_chat_visibility CHECK (visibility IN ('club_only', 'public'));
  END IF;
END $$;

-- ==============================================================================
-- PARTE 2: POLÍTICAS RLS Y SEGURIDAD DE ACCESO
-- ==============================================================================

-- 1. Notificaciones
DROP POLICY IF EXISTS "Crear notificaciones" ON public.notificaciones;
DROP POLICY IF EXISTS "notif_insert_autenticados" ON public.notificaciones;
DROP POLICY IF EXISTS "notif_insert_restringido" ON public.notificaciones;

CREATE POLICY "notif_insert_restringido"
ON public.notificaciones
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.amistades a
      WHERE a.estado = 'aceptada'
        AND ((a.usuario_id = auth.uid() AND a.amigo_id = notificaciones.user_id)
          OR (a.usuario_id = notificaciones.user_id AND a.amigo_id = auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.clubs_usuarios cu_admin
      JOIN public.clubs_usuarios cu_dest ON cu_dest.club_id = cu_admin.club_id
      WHERE cu_admin.user_id = auth.uid()
        AND cu_admin.rol IN ('creador', 'admin')
        AND cu_dest.user_id = notificaciones.user_id
    )
  )
);

-- 2. clubs_invitaciones
ALTER TABLE public.clubs_invitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clubs_invitaciones_select" ON public.clubs_invitaciones;
CREATE POLICY "clubs_invitaciones_select"
ON public.clubs_invitaciones
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = invitado_por
  OR EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = clubs_invitaciones.club_id
      AND cu.user_id = auth.uid()
      AND cu.rol IN ('creador', 'admin')
  )
);

DROP POLICY IF EXISTS "clubs_invitaciones_insert" ON public.clubs_invitaciones;
CREATE POLICY "clubs_invitaciones_insert"
ON public.clubs_invitaciones
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = invitado_por
  AND EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = clubs_invitaciones.club_id
      AND cu.user_id = auth.uid()
      AND cu.rol IN ('creador', 'admin')
  )
);

DROP POLICY IF EXISTS "clubs_invitaciones_update" ON public.clubs_invitaciones;
CREATE POLICY "clubs_invitaciones_update"
ON public.clubs_invitaciones
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR auth.uid() = invitado_por)
WITH CHECK (auth.uid() = user_id OR auth.uid() = invitado_por);

DROP POLICY IF EXISTS "clubs_invitaciones_delete" ON public.clubs_invitaciones;
CREATE POLICY "clubs_invitaciones_delete"
ON public.clubs_invitaciones
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = invitado_por
  OR EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = clubs_invitaciones.club_id
      AND cu.user_id = auth.uid()
      AND cu.rol IN ('creador', 'admin')
  )
);

-- 3. club_rutas (privacidad)
DROP POLICY IF EXISTS "public_read_club_rutas" ON public.club_rutas;
DROP POLICY IF EXISTS "club_rutas_select_privacidad" ON public.club_rutas;

CREATE POLICY "club_rutas_select_privacidad"
ON public.club_rutas
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = club_rutas.club_id
      AND COALESCE(c.is_private, false) = false
  )
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clubs_usuarios cu
      WHERE cu.club_id = club_rutas.club_id
        AND cu.user_id = auth.uid()
    )
  )
);

-- 4. clubs (actualización)
DROP POLICY IF EXISTS "Actualizar club" ON public.clubs;
DROP POLICY IF EXISTS "Admins pueden actualizar el club" ON public.clubs;
DROP POLICY IF EXISTS "clubs_update_creador_o_admin" ON public.clubs;

CREATE POLICY "clubs_update_creador_o_admin"
ON public.clubs
FOR UPDATE
TO authenticated
USING (
  creador_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = clubs.id
      AND cu.user_id = auth.uid()
      AND cu.rol IN ('creador', 'admin')
  )
)
WITH CHECK (
  creador_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = clubs.id
      AND cu.user_id = auth.uid()
      AND cu.rol IN ('creador', 'admin')
  )
);

-- 5. club_chat
ALTER TABLE public.club_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros pueden leer el chat" ON public.club_chat;
DROP POLICY IF EXISTS "club_chat_select_members_only" ON public.club_chat;

CREATE POLICY "club_chat_select_members_only"
ON public.club_chat
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = club_chat.club_id
      AND cu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Miembros pueden escribir en el chat" ON public.club_chat;
DROP POLICY IF EXISTS "club_chat_insert_members_only" ON public.club_chat;

CREATE POLICY "club_chat_insert_members_only"
ON public.club_chat
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = club_chat.club_id
      AND cu.user_id = auth.uid()
  )
);

-- ==============================================================================
-- PARTE 3: GAMIFICACIÓN Y TRIGGERS ATÓMICOS
-- ==============================================================================

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

  v_nuevo_nivel := GREATEST(1, FLOOR(SQRT(COALESCE(v_nuevo_xp, 0)::numeric / 100)) + 1);
  v_nuevo_titulo := public.calcular_titulo_paddler(v_nuevo_nivel);

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

DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_perfil ON public.user_routes;
CREATE TRIGGER trg_actualizar_gamificacion_perfil
AFTER INSERT OR DELETE ON public.user_routes
FOR EACH ROW EXECUTE FUNCTION public.actualizar_gamificacion_perfil();

DROP TRIGGER IF EXISTS trigger_actualizar_progresion ON public.perfiles;
DROP TRIGGER IF EXISTS trg_actualizar_progresion_paddler ON public.perfiles;

-- ==============================================================================
-- PARTE 4: RPCs DE SEGURIDAD Y MULTICLUB
-- ==============================================================================

-- 1. procesar_solicitud_club
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

-- 2. club_eliminar multiclub
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

-- 3. Asignar insignias aleatorias (Security Definer)
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

-- 4. Validación de velocidad máxima ampliada a 45 km/h
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
    IF NEW.tiempo_minutos > 0 AND NEW.distancia_km / (NEW.tiempo_minutos / 60.0) > 45 THEN
      RAISE EXCEPTION 'Velocidad media no plausible (>45 km/h)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- PARTE 5: RANKINGS UNIFICADOS (RUTAS + USER_ROUTES)
-- ==============================================================================

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
        COALESCE(ur.xp_earned, (ROUND(ur.distance_km * 10) + ROUND(ur.duration_seconds / 60)))::bigint AS pts
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
      ROUND(ur.duration_seconds / 60)::integer AS tiempo_minutos,
      COALESCE(ur.xp_earned, (ROUND(ur.distance_km * 10) + ROUND(ur.duration_seconds / 60)))::bigint AS pts
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

COMMIT;
