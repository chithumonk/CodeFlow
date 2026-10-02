import { GraphQLError } from "graphql";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logging/logger.js";

export interface ProjectFile {
  id: string;
  project_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, project_id, name, content, created_at, updated_at";

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

/** PostgREST's code for "that table is not in the schema cache". */
const UNDEFINED_TABLE = "PGRST205";

/** Postgres CHECK constraint violation. */
const CHECK_VIOLATION = "23514";

/**
 * The database has its own opinion about file names, and it is the
 * authoritative one. When it disagrees with the API, the likeliest cause is
 * a migration that has not been applied — so say that rather than "invalid".
 */
function rejectedName(name: string): never {
  throw new GraphQLError(
    `The database rejected the name "${name}". If this is a .ts or .py file, apply supabase/migrations/0004_languages.sql — older schemas only allow .js.`,
    {
      extensions: {
        code: "BAD_USER_INPUT",
        field: "name",
        http: { status: 400 },
      },
    },
  );
}

/**
 * A missing table means a migration has not been applied, which is an
 * operator problem with an exact fix. Reporting it as a generic internal
 * error — which is what happened the first time — turns a 30-second fix into
 * a debugging session.
 */
function assertMigrated(error: { code?: string } | null) {
  if (error?.code !== UNDEFINED_TABLE) return;

  throw new GraphQLError(
    "The project_files table does not exist. Apply supabase/migrations/0003_project_files.sql to this project, then reload.",
    { extensions: { code: "MIGRATION_REQUIRED", http: { status: 503 } } },
  );
}

function fail(operation: string, error: { message: string; code?: string }) {
  assertMigrated(error);
  logger.error({ operation, code: error.code, msg: error.message }, "db error");
  throw new GraphQLError("That did not work. Please try again.", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}

function notFound(): never {
  // Identical whether the row is missing or belongs to someone else — RLS
  // makes them indistinguishable, and saying which would leak existence.
  throw new GraphQLError("File not found.", {
    extensions: { code: "NOT_FOUND", http: { status: 404 } },
  });
}

function duplicateName(name: string): never {
  throw new GraphQLError(`This project already has a file called ${name}.`, {
    extensions: {
      code: "BAD_USER_INPUT",
      field: "name",
      http: { status: 400 },
    },
  });
}

export async function listFiles(
  db: SupabaseClient,
  projectId: string,
): Promise<ProjectFile[]> {
  const { data, error } = await db
    .from("project_files")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("name", { ascending: true });

  if (error) fail("listFiles", error);
  return (data ?? []) as ProjectFile[];
}

export async function createFile(
  db: SupabaseClient,
  input: { projectId: string; name: string; content?: string },
): Promise<ProjectFile> {
  const { data, error } = await db
    .from("project_files")
    .insert({
      project_id: input.projectId,
      name: input.name,
      content: input.content ?? "",
    })
    .select(COLUMNS)
    .single();

  if (error?.code === UNIQUE_VIOLATION) duplicateName(input.name);
  if (error?.code === CHECK_VIOLATION) rejectedName(input.name);
  // RLS rejects an insert for a project the caller does not own; surface it
  // as "not found" so a project id cannot be probed for existence.
  if (error?.code === "42501") notFound();
  if (error) fail("createFile", error);
  return data as ProjectFile;
}

export async function updateFile(
  db: SupabaseClient,
  input: { id: string; content: string },
): Promise<ProjectFile> {
  const { data, error } = await db
    .from("project_files")
    .update({ content: input.content })
    .eq("id", input.id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) fail("updateFile", error);
  if (!data) notFound();
  return data as ProjectFile;
}

export async function renameFile(
  db: SupabaseClient,
  input: { id: string; name: string },
): Promise<ProjectFile> {
  const { data, error } = await db
    .from("project_files")
    .update({ name: input.name })
    .eq("id", input.id)
    .select(COLUMNS)
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) duplicateName(input.name);
  if (error?.code === CHECK_VIOLATION) rejectedName(input.name);
  if (error) fail("renameFile", error);
  if (!data) notFound();
  return data as ProjectFile;
}

export async function deleteFile(
  db: SupabaseClient,
  id: string,
): Promise<string> {
  // A project with no files would open to an empty workspace with no way to
  // create one, so the last file is protected.
  const { data: target, error: readError } = await db
    .from("project_files")
    .select("id, project_id")
    .eq("id", id)
    .maybeSingle();

  if (readError) fail("deleteFile.read", readError);
  if (!target) notFound();

  const { count, error: countError } = await db
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", (target as { project_id: string }).project_id);

  if (countError) fail("deleteFile.count", countError);
  if ((count ?? 0) <= 1) {
    throw new GraphQLError("A project needs at least one file.", {
      extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
    });
  }

  const { data, error } = await db
    .from("project_files")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) fail("deleteFile", error);
  if (!data) notFound();
  return id;
}
