import pino from "pino";
import { config } from "../config.js";

/**
 * Structured logging. Pretty in development, JSON in production so a log
 * collector can parse it.
 *
 * `redact` is not decoration: tokens and auth headers pass through this
 * process constantly, and an access token in a log file is a live credential.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "token",
      "accessToken",
      "password",
    ],
    censor: "[redacted]",
  },
  ...(config.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
});
