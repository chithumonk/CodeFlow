import { z } from "zod";

/**
 * Input validation at the API edge.
 *
 * These mirror the CHECK constraints in the migration on purpose. The
 * database is the real guarantee; this layer exists so a client gets a
 * useful message instead of a raw Postgres constraint violation.
 */

/**
 * Default language for new files. Per-file language comes from the
 * extension, so this is a hint rather than a constraint on what can run.
 */
export const languageId = z
  .string()
  .regex(/^[a-z0-9+#.-]{1,24}$/, "Not a valid language id.");

export const projectName = z
  .string()
  .trim()
  .min(1, "Give the project a name.")
  .max(80, "Use at most 80 characters.");

export const projectDescription = z
  .string()
  .max(500, "Use at most 500 characters.");

export const createProjectInput = z.object({
  name: projectName.optional(),
  description: projectDescription.optional(),
  language: languageId.optional(),
  code: z.string().optional(),
});

export const updateProjectInput = z.object({
  id: z.string().uuid("Not a valid project id."),
  name: projectName.optional(),
  description: projectDescription.optional(),
  language: languageId.optional(),
  code: z.string().optional(),
});

export const renameProjectInput = z.object({
  id: z.string().uuid("Not a valid project id."),
  name: projectName,
});

export const projectId = z.string().uuid("Not a valid project id.");

export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;
