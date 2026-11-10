-- Propuesta. No aplicar en el Supabase real hasta revisarla.
-- Las denuncias las lee quien administra el proyecto (service role o un panel futuro).
-- La app no muestra las denuncias de otras personas.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete set null,
  contexto text not null check (contexto in ('club_chat', 'comentario', 'muro')),
  objetivo_id text not null,
  motivo text not null check (motivo in ('spam', 'acoso', 'contenido ilegal', 'otro')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisada', 'rechazada')),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists reports_insert_propio on public.reports;
create policy reports_insert_propio
  on public.reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_id and reporter_id <> reported_user_id);

drop policy if exists reports_select_propio on public.reports;
create policy reports_select_propio
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists blocks_select_propio on public.user_blocks;
create policy blocks_select_propio
  on public.user_blocks
  for select
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists blocks_insert_propio on public.user_blocks;
create policy blocks_insert_propio
  on public.user_blocks
  for insert
  to authenticated
  with check (auth.uid() = blocker_id);

drop policy if exists blocks_delete_propio on public.user_blocks;
create policy blocks_delete_propio
  on public.user_blocks
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

comment on table public.reports is
  'Denuncias de chat, comentarios y muro. Las revisa el titular de PaddleSafe desde el panel de Supabase; no hay moderadores automáticos.';
