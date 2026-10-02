import "dotenv/config";
import { z } from "zod";

/**
 * Environment is validated once, at boot, so a missing variable is a clear
 * startup failure rather than a confusing null three layers into a resolver.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /**
   * Which execution API shape to speak. Judge0 is the default because its
   * public instance needs no key; Piston is what a self-hosted runner usually
   * is, and covers a wider catalogue.
   */
  EXECUTION_PROVIDER: z.enum(["judge0", "piston"]).default("judge0"),
  /**
   * Where run-only languages are executed. Point this at your own instance to
   * keep user code in your own infrastructure — it must match
   * EXECUTION_PROVIDER.
   */
  EXECUTION_PROVIDER_URL: z.string().url().default("https://ce.judge0.com"),
  EXECUTION_PROVIDER_TOKEN: z.string().optional(),
  EXECUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid server environment.\n${issues}\n\nCopy server/.env.example to server/.env and fill it in.`,
  );
}

export const config = parsed.data;
