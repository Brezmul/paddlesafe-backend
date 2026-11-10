-- Cierre de huecos RLS para el lanzamiento. Aplicada al Supabase real (amgmvnnwlraulbutgemx)
-- el 2026-11-11 como migración «rls_lanzamiento_2026_11_11», tras copia de seguridad.
-- Revisada contra el sitio antiguo (public_html/js) y la app React (web/src):
--   * Los perfiles públicos siguen legibles sin sesión (decisión de Mateo).
--   * Un perfil privado lo ven su dueño y quien puede_ver_perfil() ya autoriza
--     (compañeros de club, amistades aceptadas, admins con solicitud pendiente), más
--     el destinatario de una solicitud de amistad pendiente: el sitio antiguo pinta
--     perfiles!usuario_id en «solicitudes recibidas» y fallaría con p = null.
--   * La bitácora solo se lee filtrando por el propio usuario en ambos clientes.
--   * El sitio antiguo llama rpc('enviar_notificacionSegura') y, si falla, inserta en
--     notificaciones directamente; la app React no la usa. Ninguna función de la base la llama.

-- 1. «Ver perfiles» con USING (true) anulaba la política que respeta is_private:
--    en Postgres las políticas permisivas del mismo comando se combinan con OR.
--    select_public_profiles (no privado OR dueño, rol public) se mantiene tal cual.
drop policy if exists "Ver perfiles" on public.perfiles;
drop policy if exists perfiles_select_relacionados on public.perfiles;
create policy perfiles_select_relacionados
  on public.perfiles
  for select
  to authenticated
  using (
    public.puede_ver_perfil(id)
    or exists (
      select 1
      from public.amistades a
      where a.estado = 'pendiente'
        and a.usuario_id = perfiles.id
        and a.amigo_id = (select auth.uid())
    )
  );

-- 2. La bitácora la leía cualquier sesión: (auth.uid() = user_id) OR (auth.uid() IS NOT NULL).
drop policy if exists spot_logbook_select on public.spot_logbook;
create policy spot_logbook_select
  on public.spot_logbook
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 3. El token de Play no hace falta en el cliente. La app solo lee estado y expira_en
--    filtrando por user_id. Escribe solo verificar-premium con service_role.
revoke all on table public.premium_derechos from anon, authenticated;
grant select (user_id, producto, estado, expira_en, actualizado_en)
  on table public.premium_derechos to authenticated;

-- 4. enviar_notificacionsegura (SECURITY DEFINER) insertaba un aviso para cualquier
--    usuario sin mirar auth.uid(), también sin sesión. Se retira EXECUTE a los clientes;
--    el sitio antiguo cae a su insert directo en notificaciones (RLS: sesión obligatoria).
revoke execute on function public.enviar_notificacionsegura(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
