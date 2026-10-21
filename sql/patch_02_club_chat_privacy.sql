-- ==============================================================================
-- PADDLESAFE - PARCHE 2: PRIVACIDAD DE CHAT DE CLUBES Y CAMPOS FALTANTES
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. Añadir columnas de visibilidad requeridas por el frontend a 'club_chat'
ALTER TABLE public.club_chat 
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'club_only',
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Normalizar datos existentes
UPDATE public.club_chat
SET 
  visibility = COALESCE(visibility, 'club_only'),
  is_public = COALESCE(is_public, false)
WHERE visibility IS NULL OR is_public IS NULL;

-- Restricción de verificación
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

-- 2. Asegurar RLS en 'club_chat'
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

-- 3. Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_club_chat_club_id ON public.club_chat (club_id);
CREATE INDEX IF NOT EXISTS idx_club_chat_created_at ON public.club_chat (created_at DESC);
