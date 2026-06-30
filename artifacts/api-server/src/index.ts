import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Video generation downloads real footage and encodes — allow up to 6 minutes.
// Default Node.js socket timeout (2 minutes) would kill in-flight generation requests.
server.setTimeout(6 * 60 * 1000);
server.keepAliveTimeout = 6 * 60 * 1000;
