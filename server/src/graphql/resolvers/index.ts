import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import type { GraphQLContext } from "../../middleware/context.js";
import { requireAuth } from "../../middleware/context.js";
import * as projects from "../../services/projects.js";
import * as files from "../../services/files.js";
import { executeRemotely } from "../../services/execute.js";
import { traceJava } from "../../services/java-trace.js";
import { traceC } from "../../services/c-trace.js";
import type { ProjectFile } from "../../services/files.js";
import type { Project } from "../../services/projects.js";
import {
  createFileInput,
  fileId,
  renameFileInput,
  updateFileInput,
} from "../../validation/file.js";
import {
  createProjectInput,
  projectId,
  renameProjectInput,
  updateProjectInput,
} from "../../validation/project.js";
import type { z } from "zod";

/** ISO-8601 in, ISO-8601 out. Postgres already stores timestamptz. */
const DateTime = new GraphQLScalarType({
  name: "DateTime",
  serialize: (value) =>
    value instanceof Date ? value.toISOString() : String(value),
  parseValue: (value) => new Date(String(value)),
  parseLiteral: (ast) =>
    ast.kind === Kind.STRING ? new Date(ast.value) : null,
});

function fileToGraphQL(row: ProjectFile) {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** snake_case rows from Postgres, camelCase fields in the schema. */
function toGraphQL(row: Project) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    language: row.language,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Turn a Zod failure into a field-level GraphQL error the UI can show. */
function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const first = result.error.issues[0];
  throw new GraphQLError(first?.message ?? "Invalid input.", {
    extensions: {
      code: "BAD_USER_INPUT",
      field: first?.path.join("."),
      http: { status: 400 },
    },
  });
}

function sortRows(rows: Project[], sort?: string): Project[] {
  if (sort === "NAME_ASC") {
    return [...rows].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }
  if (sort === "CREATED_DESC") {
    return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return rows; // UPDATED_DESC — already ordered by the query.
}

export const resolvers = {
  DateTime,

  Project: {
    files: async (parent: { id: string }, _a: unknown, ctx: GraphQLContext) => {
      const { db } = requireAuth(ctx);
      return (await files.listFiles(db, parent.id)).map(fileToGraphQL);
    },
  },

  Query: {
    me: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      if (!ctx.user || !ctx.db) return null;

      const { data } = await ctx.db
        .from("profiles")
        .select("display_name, created_at")
        .eq("id", ctx.user.id)
        .maybeSingle();

      return {
        id: ctx.user.id,
        email: ctx.user.email,
        // Falls back rather than failing: a profile row can be missing for
        // accounts created before the table existed.
        displayName:
          data?.display_name ?? ctx.user.email?.split("@")[0] ?? "Account",
        createdAt: data?.created_at ?? null,
      };
    },

    projects: async (
      _p: unknown,
      args: { search?: string; limit?: number; sort?: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      const rows = await projects.listProjects(db, {
        search: args.search,
        limit: args.limit,
      });
      return sortRows(rows, args.sort).map(toGraphQL);
    },

    project: async (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const { db } = requireAuth(ctx);
      return toGraphQL(
        await projects.getProject(db, parse(projectId, args.id)),
      );
    },
  },

  Mutation: {
    createProject: async (
      _p: unknown,
      args: { input?: unknown },
      ctx: GraphQLContext,
    ) => {
      const { db, user } = requireAuth(ctx);
      const input = parse(createProjectInput, args.input ?? {});
      return toGraphQL(await projects.createProject(db, user, input));
    },

    updateProject: async (
      _p: unknown,
      args: { input: unknown },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      const input = parse(updateProjectInput, args.input);
      return toGraphQL(await projects.updateProject(db, input));
    },

    renameProject: async (
      _p: unknown,
      args: { id: string; name: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      const input = parse(renameProjectInput, args);
      return toGraphQL(
        await projects.updateProject(db, { id: input.id, name: input.name }),
      );
    },

    deleteProject: async (
      _p: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      return projects.deleteProject(db, parse(projectId, args.id));
    },

    createFile: async (
      _p: unknown,
      args: { projectId: string; name: string; content?: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      return fileToGraphQL(
        await files.createFile(db, parse(createFileInput, args)),
      );
    },

    updateFile: async (
      _p: unknown,
      args: { id: string; content: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      return fileToGraphQL(
        await files.updateFile(db, parse(updateFileInput, args)),
      );
    },

    renameFile: async (
      _p: unknown,
      args: { id: string; name: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      return fileToGraphQL(
        await files.renameFile(db, parse(renameFileInput, args)),
      );
    },

    executeCode: async (
      _p: unknown,
      args: {
        language: string;
        version: string;
        source: string;
        stdin?: string;
      },
      ctx: GraphQLContext,
    ) => {
      // Signed-in only: this spends a third party's compute.
      requireAuth(ctx);
      return executeRemotely(args);
    },

    traceCode: async (
      _p: unknown,
      args: { language: string; source: string },
      ctx: GraphQLContext,
    ) => {
      requireAuth(ctx);

      const traced =
        args.language === "java"
          ? await traceJava(args.source)
          : args.language === "c" || args.language === "cpp"
            ? await traceC(args.source, args.language)
            : null;

      if (!traced) {
        throw new GraphQLError(
          `CodeFlow cannot trace ${args.language} yet — it can only run it.`,
          { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } },
        );
      }

      const result = traced;
      return {
        events: JSON.stringify(result.events),
        truncated: result.truncated,
        note: result.note,
        compileFailed: result.compileFailed,
      };
    },

    deleteFile: async (
      _p: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      const { db } = requireAuth(ctx);
      return files.deleteFile(db, parse(fileId, args.id));
    },
  },
};
