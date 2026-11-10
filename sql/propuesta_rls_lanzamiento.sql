-- Propuesta de lectura. NO está aplicada al Supabase real (amgmvnnwlraulbutgemx).
-- Cierra huecos vistos el 10 de noviembre de 2026 sin impedir el sitio antiguo:
-- los perfiles públicos siguen siendo legibles, la bitácora solo se lee en el cliente
-- filtrando por el propio usuario, y los avisos a otra persona los inserta el sitio
-- antiguo en la tabla (no por la función de abajo).

-- 1. «Ver perfiles» con USING (true) anula la política que respeta is_private:
--    en Postgres las políticas del mismo comando se combinan con OR.
drop policy if exists "Ver perfiles" on public.perfiles;

-- 2. La bitácora la leía cualquier sesión: (auth.uid() = user_id) OR (auth.uid() IS NOT NULL).
drop policy if exists spot_logbook_select on public.spot_logbook;
create policy spot_logbook_select
  on public.spot_logbook
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 3. El token de Play no hace falta en el cliente. La app solo lee estado y expira_en.
revoke select on table public.premium_derechos from anon, authenticated;
grant select (user_id, producto, estado, expira_en, actualizado_en)
  on table public.premium_derechos to authenticated;

-- 4. enviar_notificacionsegura inserta un aviso para cualquier usuario y no mira auth.uid().
--    El sitio antiguo escribe en la tabla notificaciones, no llama a esta función.
--    Un trigger sigue pudiendo ejecutarla como propietaria.
revoke execute on function public.enviar_notificacionsegura(uuid, text, text, text, jsonb) from public, anon, authenticated;
