-- ============================================================================
-- CodeFlow — file names for any language
--
-- Supersedes the extension allowlists in 0003 and 0004. With dozens of
-- languages, an allowlist in the database means a migration every time one is
-- added, and three copies of the same list drifting apart.
--
-- The database now enforces only what it is actually responsible for: that a
-- name is safe and flat. Which extensions map to which engine is application
-- knowledge, and lives in src/execution/languages.ts.
--
-- Run with:  supabase db push
--        or: paste into the SQL editor in the Supabase dashboard.
-- ============================================================================

alter table public.project_files
  drop constraint if exists project_files_name_check;

alter table public.project_files
  add constraint project_files_name_check
  check (
    -- Starts alphanumeric; letters, numbers, dots, dashes, underscores only.
    -- No slashes, so a name can never describe a path.
    name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$'
    -- ...and carries an extension, which is what selects the engine.
    and name ~ '\.[A-Za-z0-9]{1,12}$'
  );

comment on column public.project_files.name is
  'Flat file name with an extension. The extension selects the engine.';

-- ----------------------------------------------------------------------------
-- Projects: the language column is now only a default for new files, so it no
-- longer needs to enumerate every language CodeFlow can run.
-- ----------------------------------------------------------------------------

alter table public.projects
  drop constraint if exists projects_language_check;

alter table public.projects
  add constraint projects_language_check
  check (language ~ '^[a-z0-9+#.-]{1,24}$');

comment on column public.projects.language is
  'Default language for new files. Per-file language comes from the extension.';
