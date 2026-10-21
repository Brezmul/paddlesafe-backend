-- ==============================================================================
-- PADDLESAFE - PARCHE 1: POLÍTICAS RLS Y SEGURIDAD DE ACCESO
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. CORREGIR POLÍTICAS DE NOTIFICACIONES (CERRAR SPAM Y SUPLANTACIÓN)
DROP POLICY IF EXISTS "Crear notificaciones" ON public.notificaciones;
DROP POLICY IF EXISTS "notif_insert_autenticados" ON public.notificaciones;

-- Permitir insertar notificaciones únicamente si el emisor está autenticado y:
-- a) Es para sí mismo, O
-- b) Es para un amigo aceptado, O
-- c) Es un administrador de club comunicándose con un miembro o solicitante
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

-- 2. HABILITAR Y CONFIGURAR RLS EN 'clubs_invitaciones'
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

-- 3. PROTEGER RUTAS DE CLUBES PRIVADOS EN 'club_rutas'
DROP POLICY IF EXISTS "public_read_club_rutas" ON public.club_rutas;

CREATE POLICY "club_rutas_select_privacidad"
ON public.club_rutas
FOR SELECT
TO public
USING (
  -- Si el club es público, todos pueden ver las rutas
  EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = club_rutas.club_id
      AND COALESCE(c.is_private, false) = false
  )
  -- Si el club es privado, solo los miembros pueden ver las rutas
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clubs_usuarios cu
      WHERE cu.club_id = club_rutas.club_id
        AND cu.user_id = auth.uid()
    )
  )
);

-- 4. CONSOLIDAR POLÍTICAS DE EDICIÓN EN 'clubs'
DROP POLICY IF EXISTS "Actualizar club" ON public.clubs;
DROP POLICY IF EXISTS "Admins pueden actualizar el club" ON public.clubs;

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

