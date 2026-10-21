-- ==============================================================================
-- PADDLESAFE - PRIVACIDAD DEL CHAT DE CLUBES Y POLÍTICAS RLS
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Asegurar columnas de visibilidad y privacidad en 'club_chat'
ALTER TABLE public.club_chat 
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'club_only',
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Normalizar datos existentes: todos los mensajes de chat son privados de club
UPDATE public.club_chat
SET 
  visibility = COALESCE(visibility, 'club_only'),
  is_public = COALESCE(is_public, false)
WHERE visibility IS NULL OR is_public IS NULL OR visibility != 'club_only' OR is_public = true;

-- Restricción de verificación para el campo visibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_club_chat_visibility'
  ) THEN
    ALTER TABLE public.club_chat
      ADD CONSTRAINT chk_club_chat_visibility 
      CHECK (visibility IN ('club_only', 'public'));
  END IF;
END $$;

-- 2. Vista de compatibilidad 'memberships' apuntando a 'clubs_usuarios'
CREATE OR REPLACE VIEW public.memberships AS
SELECT 
    club_id,
    user_id,
    rol,
    joined_at
FROM public.clubs_usuarios;

-- Otorgar permisos sobre la vista
GRANT SELECT ON public.memberships TO authenticated, anon;

-- 3. Habilitar Row Level Security (RLS) en la tabla 'club_chat'
ALTER TABLE public.club_chat ENABLE ROW LEVEL SECURITY;

-- 4. Limpieza de políticas anteriores en 'club_chat'
DO $$
BEGIN
  DROP POLICY IF EXISTS "club_chat_select_all" ON public.club_chat;
  DROP POLICY IF EXISTS "club_chat_select_public" ON public.club_chat;
  DROP POLICY IF EXISTS "club_chat_select_members_only" ON public.club_chat;
  DROP POLICY IF EXISTS "club_chat_insert_members_only" ON public.club_chat;
  DROP POLICY IF EXISTS "club_chat_delete_author_or_admin" ON public.club_chat;
  DROP POLICY IF EXISTS "Permitir lectura mensajes club" ON public.club_chat;
  DROP POLICY IF EXISTS "Permitir enviar mensajes club" ON public.club_chat;
END $$;

-- 5. POLÍTICA SELECT: Solo los miembros activos del club pueden leer los mensajes
-- Los usuarios externos o no autenticados NO pueden recibir filas de club_chat
CREATE POLICY "club_chat_select_members_only"
  ON public.club_chat
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT m.club_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
  );

-- 6. POLÍTICA INSERT: Solo los miembros del club pueden publicar en su chat interno
-- Se fuerza que visibility = 'club_only' e is_public = false
CREATE POLICY "club_chat_insert_members_only"
  ON public.club_chat
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND club_id IN (
      SELECT m.club_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
    )
    AND visibility = 'club_only'
    AND is_public = false
  );

-- 7. POLÍTICA DELETE: Solo el autor del mensaje o administradores/creadores del club pueden eliminarlo
CREATE POLICY "club_chat_delete_author_or_admin"
  ON public.club_chat
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 
      FROM public.memberships m
      WHERE m.club_id = club_chat.club_id
        AND m.user_id = auth.uid()
        AND LOWER(m.rol) IN ('creador', 'admin')
    )
  );

-- 8. Índices para optimizar el rendimiento de las consultas y validaciones RLS
CREATE INDEX IF NOT EXISTS idx_club_chat_club_id ON public.club_chat (club_id);
CREATE INDEX IF NOT EXISTS idx_club_chat_user_id ON public.club_chat (user_id);
CREATE INDEX IF NOT EXISTS idx_club_chat_created_at ON public.club_chat (created_at DESC);
