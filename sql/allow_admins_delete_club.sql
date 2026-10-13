-- ==============================================================================
-- PADDLESAFE - PERMISOS PARA ELIMINAR CLUB (CREADORES Y ADMINISTRADORES)
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Función RPC segura con SECURITY DEFINER para eliminar el club
-- Permite la eliminación a:
--   a) El creador directo del club (creador_id = auth.uid())
--   b) Miembros con rol 'creador' o 'admin' en la tabla 'clubs_usuarios'
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
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- Comprobar si es creador en la tabla clubs
    SELECT EXISTS (
        SELECT 1 FROM public.clubs 
        WHERE id = p_club AND creador_id = v_user_id
    ) INTO v_es_creador;

    -- Comprobar si tiene rol creador o admin en clubs_usuarios
    SELECT EXISTS (
        SELECT 1 FROM public.clubs_usuarios 
        WHERE club_id = p_club 
          AND user_id = v_user_id 
          AND LOWER(rol) IN ('creador', 'admin')
    ) INTO v_es_admin;

    IF NOT (v_es_creador OR v_es_admin) THEN
        RAISE EXCEPTION 'Permiso denegado: Solo los creadores y administradores pueden eliminar este club.';
    END IF;

    -- Borrado seguro en cascada de todas las dependencias
    DELETE FROM public.clubs_invitaciones WHERE club_id = p_club;
    DELETE FROM public.clubs_solicitudes WHERE club_id = p_club;
    DELETE FROM public.club_chat WHERE club_id = p_club;
    DELETE FROM public.club_rutas WHERE club_id = p_club;
    DELETE FROM public.club_eventos WHERE club_id = p_club;
    DELETE FROM public.clubs_usuarios WHERE club_id = p_club;
    DELETE FROM public.clubs WHERE id = p_club;

    RETURN true;
END;
$$;

-- Otorgar permisos de ejecución al rol autenticado
GRANT EXECUTE ON FUNCTION public.club_eliminar(uuid) TO authenticated;

-- 2. Actualizar política RLS de DELETE en la tabla 'clubs' para creadores y admins
DO $$
BEGIN
    DROP POLICY IF EXISTS "Permitir eliminar club a creadores" ON public.clubs;
    DROP POLICY IF EXISTS "Permitir eliminar club a creador o admin" ON public.clubs;
    DROP POLICY IF EXISTS "clubs_delete_creador_o_admin" ON public.clubs;

    CREATE POLICY "clubs_delete_creador_o_admin" ON public.clubs
    FOR DELETE
    TO authenticated
    USING (
        creador_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.clubs_usuarios cu
            WHERE cu.club_id = clubs.id
              AND cu.user_id = auth.uid()
              AND LOWER(cu.rol) IN ('creador', 'admin')
        )
    );
EXCEPTION
    WHEN undefined_table THEN
        NULL;
END $$;
