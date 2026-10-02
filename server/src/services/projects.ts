import { GraphQLError } from "graphql";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedUser } from "../middleware/context.js";
import { logger } from "../logging/logger.js";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../validation/project.js";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  language: string;
  code: string;
  created_at: string;
  updated_at: string;
}

/** Starter code for a new project — something that traces interestingly. */
export const STARTER_CODE = `function calculate(numbers) {
  let total = 0;

  for (const n of numbers) {
    total += n;
  }

  return total;
}

const result = calculate([1, 2, 3, 4, 5]);
console.log('total is', result);
`;

const COLUMNS =
  "id, user_id, name, description, language, code, created_at, updated_at";

function fail(operation: string, error: { message: string; code?: string }) {
  logger.error({ operation, code: error.code, msg: error.message }, "db error");
  throw new GraphQLError("That did not work. Please try again.", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}

function notFound(): never {
  // Identical for "does not exist" and "belongs to someone else". Saying
  // which would let anyone probe for the existence of other users' project
  // ids, and RLS makes the two indistinguishable here anyway.
  throw new GraphQLError("Project not found.", {
    extensions: { code: "NOT_FOUND", http: { status: 404 } },
  });
}

export async function listProjects(
  db: SupabaseClient,
  opts: { search?: string; limit?: number } = {},
): Promise<Project[]> {
  let query = db
    .from("projects")
    .select(COLUMNS)
    .order("updated_at", { ascending: false });

  if (opts.search?.trim()) {
    // Escape PostgREST's pattern wildcards so a literal % cannot widen it.
    const term = opts.search.trim().replace(/[%_]/g, "\\$&");
    query = query.ilike("name", `%${term}%`);
  }
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) fail("listProjects", error);
  return (data ?? []) as Project[];
}

export async function getProject(
  db: SupabaseClient,
  id: string,
): Promise<Project> {
  const { data, error } = await db
    .from("projects")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) fail("getProject", error);
  if (!data) notFound();
  return data as Project;
}

export async function createProject(
  db: SupabaseClient,
  user: AuthedUser,
  input: CreateProjectInput,
): Promise<Project> {
  const { data, error } = await db
    .from("projects")
    .insert({
      // Taken from the verified token, never from the request payload.
      user_id: user.id,
      name: input.name ?? "Untitled Project",
      description: input.description ?? "",
      language: input.language ?? "javascript",
      code: input.code ?? STARTER_CODE,
    })
    .select(COLUMNS)
    .single();

  if (error) fail("createProject", error);
  return data as Project;
}

export async function updateProject(
  db: SupabaseClient,
  input: UpdateProjectInput,
): Promise<Project> {
  const { id, ...rest } = input;
  const patch = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );

  if (Object.keys(patch).length === 0) return getProject(db, id);

  const { data, error } = await db
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) fail("updateProject", error);
  // RLS filters the row out rather than erroring, so "no row" is how a
  // forbidden update surfaces.
  if (!data) notFound();
  return data as Project;
}

export async function deleteProject(
  db: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await db
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) fail("deleteProject", error);
  if (!data) notFound();
  return id;
}
