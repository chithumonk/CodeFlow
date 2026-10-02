import { app } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logging/logger.js";

/**
 * Local development entry point.
 *
 * In production this file is never run: Vercel calls api/graphql.ts, which
 * exports the same Express app from app.ts without listening on a port
 * itself. Keeping the two separate means a change to routing or middleware
 * only has to happen once, in app.ts.
 */
app.listen(config.PORT, () => {
  logger.info(
    {
      url: `http://localhost:${config.PORT}/`,
      env: config.NODE_ENV,
      cors: config.CORS_ORIGIN,
    },
    "CodeFlow GraphQL API ready",
  );
});
