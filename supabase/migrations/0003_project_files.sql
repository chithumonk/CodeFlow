-- ============================================================================
-- CodeFlow — project files
--
-- A project used to be a single blob of code in projects.code. This moves to
-- one row per file so a project can hold several, each with its own editor
-- tab.
--
-- projects.code is left in place but is no longer read by the application —
-- dropping a column that holds people's work is not something a migration
-- should do quietly. Remove it in a later migration once you are satisfied
-- the backfill below is correct.
--
-- Run with:  supabase db push
--        or: paste into the SQL editor in the Supabase dashboard.
-- ============================================================================

create table if not exists public.project_files (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references public.projects (id) on delete cascade,

  -- A flat file name, not a path: no directories in this milestone, and no
  -- slashes means no chance of a name escaping its project.
  name       text        not null check (
    name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$' and name like '%.js'
  ),

  content    text        not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two files cannot share a name inside one project, which is what makes the
-- tab strip and any future import resolution unambiguous.
create unique index if not exists project_files_project_id_name_key
  on public.project_files (project_id, lower(name));

create index if not exists project_files_project_id_idx
  on public.project_files (project_id, name);

comment on table public.project_files is
  'One source file. Belongs to exactly one project.';
comment on column public.projects.code is
  'DEPRECATED — superseded by public.project_files. Retained for recovery.';

-- ----------------------------------------------------------------------------
-- Row-level security
--
-- Ownership is indirect: a file belongs to a project, and the project belongs
-- to a user. Every policy therefore joins back to projects rather than
-- trusting a user_id copied onto this table, which could drift.
-- ----------------------------------------------------------------------------

alter table public.project_files enable row level security;

create or replace function public.owns_project(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target
      and p.user_id = (select auth.uid())
  );
$$;

drop policy if exists "files are readable by the project owner" on public.project_files;
create policy "files are readable by the project owner"
  on public.project_files for select
  using (public.owns_project(project_id));

drop policy if exists "files are insertable by the project owner" on public.project_files;
create policy "files are insertable by the project owner"
  on public.project_files for insert
  with check (public.owns_project(project_id));

drop policy if exists "files are updatable by the project owner" on public.project_files;
create policy "files are updatable by the project owner"
  on public.project_files for update
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

drop policy if exists "files are deletable by the project owner" on public.project_files;
create policy "files are deletable by the project owner"
  on public.project_files for delete
  using (public.owns_project(project_id));

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------

drop trigger if exists project_files_touch_updated_at on public.project_files;
create trigger project_files_touch_updated_at
  before update on public.project_files
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Backfill: every existing project gets its code as main.js
--
-- Safe to re-run: projects that already have a file are skipped.
-- ----------------------------------------------------------------------------

insert into public.project_files (project_id, name, content)
select p.id, 'main.js', coalesce(p.code, '')
from public.projects p
where not exists (
  select 1 from public.project_files f where f.project_id = p.id
);

-- ----------------------------------------------------------------------------
-- New projects start with a file, so the workspace is never empty
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_files (project_id, name, content)
  values (new.id, 'main.js', coalesce(new.code, ''))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();
