import { z } from "zod";

/**
 * File-name rules, mirroring the CHECK constraint in 0003_project_files.sql.
 *
 * Flat names only. A name with a slash in it would imply directories the
 * product does not have, and would be the first step towards a path that
 * escapes its project.
 */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;

/**
 * A name must carry an extension, because that is what selects the engine.
 *
 * Which extensions are runnable is deliberately NOT checked here. With dozens
 * of languages, an allowlist on the server, in the client and in the database
 * is three lists that drift. The client registry
 * (src/execution/languages.ts) is the single source of truth, and an unknown
 * extension simply has no engine — which the workspace reports plainly.
 */
const EXTENSION_PATTERN = /\.[A-Za-z0-9]{1,12}$/;

export const fileName = z
  .string()
  .trim()
  .min(1, "Give the file a name.")
  .max(60, "Use at most 60 characters.")
  .refine((value) => NAME_PATTERN.test(value), {
    message:
      "Use letters, numbers, dots, dashes and underscores, starting with a letter or number.",
  })
  .refine((value) => EXTENSION_PATTERN.test(value), {
    message: "File names need an extension, like main.py or Main.java.",
  });

export const createFileInput = z.object({
  projectId: z.string().uuid("Not a valid project id."),
  name: fileName,
  content: z.string().optional(),
});

export const updateFileInput = z.object({
  id: z.string().uuid("Not a valid file id."),
  content: z.string(),
});

export const renameFileInput = z.object({
  id: z.string().uuid("Not a valid file id."),
  name: fileName,
});

export const fileId = z.string().uuid("Not a valid file id.");
