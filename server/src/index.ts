import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { config } from "./config.js";
import { logger } from "./logging/logger.js";
import { typeDefs } from "./graphql/schema/index.js";
import { resolvers } from "./graphql/resolvers/index.js";
import { buildContext } from "./middleware/context.js";
import type { GraphQLContext } from "./middleware/context.js";

const server = new ApolloServer<GraphQLContext>({
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

const { url } = await startStandaloneServer(server, {
  listen: { port: config.PORT },
  context: async ({ req }) => buildContext(req.headers.authorization),
});

logger.info(
  { url, env: config.NODE_ENV, cors: config.CORS_ORIGIN },
  "CodeFlow GraphQL API ready",
);
