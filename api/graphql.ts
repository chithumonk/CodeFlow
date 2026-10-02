import { app } from "../server/src/app.js";

/**
 * Vercel serverless function entry point.
 *
 * A request to /api/graphql is routed here by Vercel's file-based routing —
 * nothing in vercel.json has to say so. The Express app itself lives in
 * server/src/app.ts and is the same one the local dev server runs; this file
 * only hands it to Vercel's Node.js runtime, which invokes an exported
 * Express app exactly like any other request handler.
 *
 * server/ keeps its own package.json and node_modules — see vercel.json's
 * installCommand, which installs both before this function is bundled.
 */
export default app;
