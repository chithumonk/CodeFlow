-- ============================================================================
-- CodeFlow — more than one language
--
-- Widens two constraints that were written when JavaScript was the only
-- option: the set of allowed project languages, and the set of allowed file
-- extensions.
--
-- Language is now a property of the *file*, derived from its extension, so a
-- project can hold a mix. projects.language remains as the default applied to
-- newly created files.
--
-- Run with:  supabase db push
--        or: paste into the SQL editor in the Supabase dashboard.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Projects: allow the new languages
-- ----------------------------------------------------------------------------

alter table public.projects
  drop constraint if exists projects_language_check;

alter table public.projects
  add constraint projects_language_check
  check (language in ('javascript', 'typescript', 'python'));

-- ----------------------------------------------------------------------------
-- Files: allow .ts and .py alongside .js
--
-- The name rule stays deliberately tight in every other respect: flat names
-- only, no slashes, so a name can never describe a path.
-- ----------------------------------------------------------------------------

alter table public.project_files
  drop constraint if exists project_files_name_check;

alter table public.project_files
  add constraint project_files_name_check
  check (
    name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$'
    and (
      lower(name) like '%.js'
      or lower(name) like '%.ts'
      or lower(name) like '%.py'
    )
  );

comment on column public.project_files.name is
  'Flat file name. The extension determines which engine runs it.';
