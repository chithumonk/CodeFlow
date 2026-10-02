-- ============================================================================
-- CodeFlow — projects
--
-- One row per saved program. Ownership is enforced twice: the API resolves
-- the user from a verified JWT and never trusts a client-supplied user_id,
-- and the policies below make the database reject cross-user access even if
-- the API is wrong.
--
-- Run with:  supabase db push
--        or: paste into the SQL editor in the Supabase dashboard.
-- ============================================================================

create table if not exists public.projects (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,

  name        text        not null default 'Untitled Project'
                          check (length(btrim(name)) between 1 and 80),
  description text        not null default ''
                          check (length(description) <= 500),

  -- One language for this milestone. Constrained rather than free text so a
  -- typo cannot create a project the editor has no mode for.
  language    text        not null default 'javascript'
                          check (language in ('javascript')),

  code        text        not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.projects is
  'A saved program. Belongs to exactly one auth.users row.';

-- The dashboard lists a user's projects newest-first; this covers both the
-- ownership filter and the sort.
create index if not exists projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);

-- ----------------------------------------------------------------------------
-- Row-level security
--
-- `using` governs which rows are visible to select/update/delete.
-- `with check` governs what a row may look like after insert/update — it is
-- what stops someone writing a row owned by a different user.
-- ----------------------------------------------------------------------------

alter table public.projects enable row level security;

drop policy if exists "projects are readable by their owner" on public.projects;
create policy "projects are readable by their owner"
  on public.projects for select
  using ((select auth.uid()) = user_id);

drop policy if exists "projects are insertable by their owner" on public.projects;
create policy "projects are insertable by their owner"
  on public.projects for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects are updatable by their owner" on public.projects;
create policy "projects are updatable by their owner"
  on public.projects for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects are deletable by their owner" on public.projects;
create policy "projects are deletable by their owner"
  on public.projects for delete
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
--
-- Reuses the trigger function created in 0001_profiles.sql.
-- ----------------------------------------------------------------------------

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();
