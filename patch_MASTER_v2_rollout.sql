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
-- ------------------------------------------------------------------------------
-- 7. PATCH #07: GESTIÓN DEFINITIVA DE CLUBES, RLS, DEDUPLICACIÓN Y HELPERS
-- ------------------------------------------------------------------------------

-- Asegurar columnas en 'clubs_solicitudes'
ALTER TABLE public.clubs_solicitudes 
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.clubs_solicitudes 
SET estado = 'pendiente' 
WHERE estado IS NULL;

-- Deduplicar 'public.clubs_usuarios' manteniendo la fila de mayor privilegio
WITH ranked_cu AS (
  SELECT ctid,
    ROW_NUMBER() OVER (
      PARTITION BY club_id, user_id
      ORDER BY 
        CASE LOWER(COALESCE(rol, 'miembro'))
          WHEN 'creador' THEN 1
          WHEN 'admin' THEN 2
          ELSE 3
        END ASC,
        COALESCE(joined_at, created_at, now()) ASC
    ) as rn
  FROM public.clubs_usuarios
)
DELETE FROM public.clubs_usuarios
WHERE ctid IN (SELECT ctid FROM ranked_cu WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_usuarios_unique_pair 
  ON public.clubs_usuarios (club_id, user_id);

-- Deduplicar solicitudes pendientes en 'public.clubs_solicitudes'
WITH ranked_cs AS (
  SELECT ctid,
    ROW_NUMBER() OVER (
      PARTITION BY club_id, user_id
      ORDER BY created_at ASC
    ) as rn
  FROM public.clubs_solicitudes
  WHERE estado = 'pendiente'
)
DELETE FROM public.clubs_solicitudes
WHERE ctid IN (SELECT ctid FROM ranked_cs WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_solicitudes_pendiente 
  ON public.clubs_solicitudes (club_id, user_id) 
  WHERE estado = 'pendiente';

-- Backfill creadores en 'clubs_usuarios'
INSERT INTO public.clubs_usuarios (club_id, user_id, rol)
SELECT id, creador_id, 'creador'
FROM public.clubs
WHERE creador_id IS NOT NULL
ON CONFLICT (club_id, user_id) 
DO UPDATE SET rol = 'creador' 
WHERE LOWER(public.clubs_usuarios.rol) <> 'creador';

-- Trigger automático para registrar creador de club
CREATE OR REPLACE FUNCTION public.fn_auto_registrar_creador_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creador_id IS NOT NULL THEN
    INSERT INTO public.clubs_usuarios (club_id, user_id, rol)
    VALUES (NEW.id, NEW.creador_id, 'creador')
    ON CONFLICT (club_id, user_id)
    DO UPDATE SET rol = 'creador' 
    WHERE LOWER(public.clubs_usuarios.rol) <> 'creador';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_registrar_creador_club ON public.clubs;
CREATE TRIGGER trg_auto_registrar_creador_club
AFTER INSERT ON public.clubs
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_registrar_creador_club();

-- Helpers SECURITY DEFINER (Prevención de recursión 42P17)
CREATE OR REPLACE FUNCTION public.es_admin_o_creador_club(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = p_club_id AND c.creador_id = p_user_id
    UNION ALL
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = p_club_id
      AND cu.user_id = p_user_id
      AND LOWER(cu.rol) IN ('creador', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.es_miembro_club(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = p_club_id AND c.creador_id = p_user_id
    UNION ALL
    SELECT 1 FROM public.clubs_usuarios cu
    WHERE cu.club_id = p_club_id
      AND cu.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.es_admin_o_creador_club(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.es_miembro_club(uuid, uuid) TO authenticated, anon;

-- Políticas RLS para 'clubs_usuarios'
ALTER TABLE public.clubs_usuarios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clubs_usuarios' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clubs_usuarios', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY clubs_usuarios_select ON public.clubs_usuarios
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY clubs_usuarios_insert ON public.clubs_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      auth.uid() = user_id
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.clubs c 
          WHERE c.id = clubs_usuarios.club_id 
            AND COALESCE(c.es_privado, false) = true
        )
        OR EXISTS (
          SELECT 1 FROM public.clubs c
          WHERE c.id = clubs_usuarios.club_id
            AND c.creador_id = auth.uid()
        )
      )
    )
    OR public.es_admin_o_creador_club(club_id, auth.uid())
  );

CREATE POLICY clubs_usuarios_update ON public.clubs_usuarios
  FOR UPDATE TO authenticated
  USING (public.es_admin_o_creador_club(club_id, auth.uid()))
  WITH CHECK (public.es_admin_o_creador_club(club_id, auth.uid()));

CREATE POLICY clubs_usuarios_delete ON public.clubs_usuarios
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id AND LOWER(rol) <> 'creador')
    OR
    (public.es_admin_o_creador_club(club_id, auth.uid()) AND LOWER(rol) <> 'creador')
  );

-- Políticas RLS para 'clubs_solicitudes'
ALTER TABLE public.clubs_solicitudes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clubs_solicitudes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clubs_solicitudes', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY clubs_solicitudes_select ON public.clubs_solicitudes
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.es_admin_o_creador_club(club_id, auth.uid())
  );

CREATE POLICY clubs_solicitudes_insert ON public.clubs_solicitudes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY clubs_solicitudes_update ON public.clubs_solicitudes
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.es_admin_o_creador_club(club_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR public.es_admin_o_creador_club(club_id, auth.uid())
  );

CREATE POLICY clubs_solicitudes_delete ON public.clubs_solicitudes
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id 
    OR public.es_admin_o_creador_club(club_id, auth.uid())
  );

-- RPC: Obtener solicitudes pendientes
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_admin_o_creador_club(p_club_id, auth.uid()) THEN
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
    AND COALESCE(cs.estado, 'pendiente') = 'pendiente'
  ORDER BY cs.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_solicitudes_club(uuid) TO authenticated;

-- RPC: Procesar solicitudes
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
  v_club_nombre text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '28000';
  END IF;

  SELECT cs.user_id, cs.club_id, c.nombre 
  INTO v_user_id, v_club_id, v_club_nombre
  FROM public.clubs_solicitudes cs
  LEFT JOIN public.clubs c ON c.id = cs.club_id
  WHERE cs.id = p_solicitud;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe o ya fue procesada.';
  END IF;

  IF NOT public.es_admin_o_creador_club(v_club_id, v_actor) THEN
    RAISE EXCEPTION 'Permiso denegado: no eres administrador de este club.' USING ERRCODE = '42501';
  END IF;

  IF p_accion = 'aceptar' THEN
    INSERT INTO public.clubs_usuarios (club_id, user_id, rol)
    VALUES (v_club_id, v_user_id, 'miembro')
    ON CONFLICT (club_id, user_id) DO NOTHING;

    DELETE FROM public.clubs_solicitudes WHERE id = p_solicitud;

    BEGIN
      INSERT INTO public.notificaciones (user_id, tipo, contenido, leida)
      VALUES (
        v_user_id,
        'solicitud_club_aceptada',
        '¡Bienvenido a bordo! Tu solicitud para unirte a ' || COALESCE(v_club_nombre, 'el club') || ' ha sido aceptada.',
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

  ELSIF p_accion = 'rechazar' THEN
    DELETE FROM public.clubs_solicitudes WHERE id = p_solicitud;

    BEGIN
      INSERT INTO public.notificaciones (user_id, tipo, contenido, leida)
      VALUES (
        v_user_id,
        'solicitud_club_rechazada',
        'Tu solicitud para unirte a ' || COALESCE(v_club_nombre, 'el club') || ' no fue aceptada en este momento.',
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSE
    RAISE EXCEPTION 'Acción inválida. Usa "aceptar" o "rechazar".';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.procesar_solicitud_club(uuid, text) TO authenticated;

-- RPC: Obtener clubes del usuario
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
STABLE
SECURITY DEFINER
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
    COALESCE(cu.rol, CASE WHEN c.creador_id = p_user_id THEN 'creador' ELSE 'miembro' END) AS club_rol,
    COALESCE(cu.joined_at, cu.created_at, c.created_at) AS fecha_union
  FROM public.clubs c
  LEFT JOIN public.clubs_usuarios cu ON cu.club_id = c.id AND cu.user_id = p_user_id
  WHERE cu.user_id = p_user_id OR c.creador_id = p_user_id
  ORDER BY fecha_union DESC;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_clubs_usuario(uuid) TO authenticated;

COMMIT;

