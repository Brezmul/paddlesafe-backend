-- ==============================================================================
-- PADDLESAFE - PARCHE #07 DEFINITIVO: GESTIÓN DE CLUBES, RLS Y PERMISOS
-- Ejecutar en Supabase SQL Editor
-- Resuelve:
-- 1. Deduplicación de 'clubs_usuarios' y 'clubs_solicitudes'
-- 2. Restricciones UNIQUE seguras para ON CONFLICT
-- 3. Sincronización automática y persistente de creadores (Trigger)
-- 4. Helpers SECURITY DEFINER para evitar recursión infinita en RLS (42P17)
-- 5. Políticas RLS integrales para gestión de miembros y solicitudes
-- 6. RPCs robustas 'obtener_solicitudes_club', 'procesar_solicitud_club' y 'obtener_clubs_usuario'
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SCHEMA Y DEDUPLICACIÓN
-- ------------------------------------------------------------------------------

-- Asegurar columnas en 'clubs_solicitudes'
ALTER TABLE public.clubs_solicitudes 
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.clubs_solicitudes 
SET estado = 'pendiente' 
WHERE estado IS NULL;

-- Deduplicar 'public.clubs_usuarios' manteniendo la fila de mayor privilegio ('creador' > 'admin' > 'miembro')
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

-- ------------------------------------------------------------------------------
-- 2. SINCRONIZACIÓN DE CREADORES Y TRIGGER AUTOMÁTICO
-- ------------------------------------------------------------------------------

-- Backfill: asegurar que todo club tenga a su creador en 'clubs_usuarios' con rol 'creador'
INSERT INTO public.clubs_usuarios (club_id, user_id, rol)
SELECT id, creador_id, 'creador'
FROM public.clubs
WHERE creador_id IS NOT NULL
ON CONFLICT (club_id, user_id) 
DO UPDATE SET rol = 'creador' 
WHERE LOWER(public.clubs_usuarios.rol) <> 'creador';

-- Trigger para registrar automáticamente al creador tras la inserción de un club
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

-- ------------------------------------------------------------------------------
-- 3. HELPERS SECURITY DEFINER (Prevención de Recursión Infinita 42P17)
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS RLS LIMPIAS PARA 'clubs_usuarios' Y 'clubs_solicitudes'
-- ------------------------------------------------------------------------------

ALTER TABLE public.clubs_usuarios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clubs_usuarios' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clubs_usuarios', pol.policyname);
  END LOOP;
END $$;

-- SELECT: público y miembros autenticados
CREATE POLICY clubs_usuarios_select ON public.clubs_usuarios
  FOR SELECT TO authenticated, anon
  USING (true);

-- INSERT: el propio usuario (si el club no es privado o si es el creador) o administradores del club
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

-- UPDATE: administradores o creadores mediante el helper SECURITY DEFINER (evita 42P17)
CREATE POLICY clubs_usuarios_update ON public.clubs_usuarios
  FOR UPDATE TO authenticated
  USING (public.es_admin_o_creador_club(club_id, auth.uid()))
  WITH CHECK (public.es_admin_o_creador_club(club_id, auth.uid()));

-- DELETE: auto-abandono (excepto creador) o expulsión por administradores (protegiendo siempre al creador)
CREATE POLICY clubs_usuarios_delete ON public.clubs_usuarios
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id AND LOWER(rol) <> 'creador')
    OR
    (public.es_admin_o_creador_club(club_id, auth.uid()) AND LOWER(rol) <> 'creador')
  );

-- RLS para 'clubs_solicitudes'
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

-- ------------------------------------------------------------------------------
-- 5. RPCs ROBUSTAS: SOLICITUDES Y MIEMBROS
-- ------------------------------------------------------------------------------

-- RPC: Obtener solicitudes pendientes del club
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

-- RPC: Procesar solicitud (aceptar o rechazar) con notificación segura
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

    -- Notificación segura al usuario aceptado
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

    -- Notificación informativa al usuario rechazado
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

-- RPC: Obtener clubes del usuario incluyendo los que fundó
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

