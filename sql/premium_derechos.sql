-- Marca como acceso previo a quien YA tiene perfil en ese momento,
-- para no dejar fuera a los usuarios de la web. Las cuentas creadas después no lo heredan.
-- La fecha del perfil está en creado_en. La tabla no tiene created_at.

alter table public.perfiles
  add column if not exists acceso_previo boolean not null default false;

-- Ejecutar una sola vez, al activar el freemium.
-- La fecha es el corte: las cuentas anteriores conservan el acceso.
-- Volver a lanzar el update después de esa fecha no marca a las cuentas nuevas.
update public.perfiles
set acceso_previo = true
where acceso_previo = false
  and creado_en < timestamptz '2026-11-11 00:00:00+00';

comment on column public.perfiles.acceso_previo is
  'Cuenta que ya existía antes del freemium. Mantiene el acceso sin suscripción de Play hasta que se decida lo contrario.';

create table if not exists public.premium_derechos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  producto text not null,
  estado text not null check (estado in ('activo', 'inactivo', 'pendiente')),
  expira_en timestamptz,
  token_compra text,
  actualizado_en timestamptz not null default now()
);

alter table public.premium_derechos enable row level security;

drop policy if exists premium_derechos_select_propio on public.premium_derechos;
create policy premium_derechos_select_propio
  on public.premium_derechos
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No hay insert ni update para el cliente. Solo la función con service role escribe el token.

comment on table public.premium_derechos is
  'Estado verificado con la API de Google Play. La app solo selecciona estado y expira_en.';
