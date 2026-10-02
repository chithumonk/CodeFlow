import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { config } from "./config.js";
import { logger } from "./logging/logger.js";
import { typeDefs } from "./graphql/schema/index.js";
import { resolvers } from "./graphql/resolvers/index.js";
import { buildContext } from "./middleware/context.js";
import type { GraphQLContext } from "./middleware/context.js";

/**
 * The GraphQL API as an Express app, rather than a standalone HTTP server.
 *
 * Express rather than @apollo/server/standalone because this one module has
 * to serve two different hosts: a long-running Node process for local
 * development (index.ts calls app.listen) and a Vercel serverless function
 * (api/graphql.ts just re-exports this app, and Vercel's Node runtime invokes
 * it like any other Express handler). A standalone server is built to own its
 * own process and can't be handed to something else like that.
 *
 * The server is started once at module load — not per request — so a warm
 * serverless instance reuses it across invocations the same way the local
 * process does.
 */

const apollo = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  // Introspection is a development convenience; leaving it on in production
  // publishes the entire schema.
  introspection: config.NODE_ENV !== "production",
  formatError: (formatted, raw) => {
    logger.error(
      { err: raw, code: formatted.extensions?.code },
      "graphql error",
    );

    // Never let an internal failure leak a stack trace or SQL to the client.
    if (formatted.extensions?.code === "INTERNAL_SERVER_ERROR") {
      return {
        message: "Something went wrong.",
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      };
    }
    return formatted;
  },
});

await apollo.start();

export const app = express();

// Comma-separated so one deployment can allow a few origins — a custom
// domain and its Vercel preview URL, say — without needing code changes.
const allowedOrigins = config.CORS_ORIGIN.split(",").map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.use(
  "/",
  expressMiddleware(apollo, {
    context: async ({ req }) => buildContext(req.headers.authorization),
  }),
);
