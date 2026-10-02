-- ============================================================================
-- CodeFlow — account profiles
--
-- Supabase Auth owns `auth.users` (email, encrypted password, confirmation
-- state). That table is not meant to be extended directly, so anything the
-- product knows about a person lives here in `public.profiles`, keyed by the
-- same id.
--
-- Run with:  supabase db push
--        or: paste into the SQL editor in the Supabase dashboard.
-- ============================================================================

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,

  -- Not unique, by design: this is what a person is called, not how they are
  -- identified. Two accounts may both be "Ada Lovelace". The unique account
  -- key is auth.users.email, which Supabase already enforces.
  display_name text       not null check (
    length(btrim(display_name)) between 1 and 50
  ),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Per-account profile data. One row per auth.users row.';
comment on column public.profiles.display_name is
  'Human-facing name. Intentionally not unique — email is the identifier.';

-- ----------------------------------------------------------------------------
-- Row-level security
--
-- The browser talks to Postgres with the anon/authenticated role, so these
-- policies are the actual access control. Without them the table would be
-- readable by anyone holding the (public) anon key.
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "profiles are updatable by their owner" on public.profiles;
create policy "profiles are updatable by their owner"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert policy on purpose. Rows are created by the trigger below, which
-- runs as the definer, so the client never inserts its own profile row and
-- cannot create one for somebody else.

-- ----------------------------------------------------------------------------
-- Keep profiles in step with auth.users
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Pinned search_path: a security-definer function without one can be hijacked
-- by a caller-controlled path.
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- signUp() sends this in options.data. Fall back to the local part of the
    -- email so the column is never empty, even for users created by hand in
    -- the dashboard or by a future OAuth provider.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
