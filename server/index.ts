import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { gameSocket } from "./gameSocket";
import { roomManager } from "./rooms";

const app = express();
// Card-back image uploads are base64-encoded inline in JSON bodies. The client
// caps them at 1 MB; we accept up to 2 MB on the wire (1 MB × ~1.33 base64
// overhead + JSON envelope + headroom). Any larger request is almost certainly
// abusive and we'd rather fail the request than buffer it.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  gameSocket.attach(server);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, "0.0.0.0", async () => {
    log(`serving on port ${port}`);
    // Crash recovery: pull any games that were in flight when this process
    // last died out of the DB and put them back in the in-memory room map.
    // Restart AI timers for each so the game keeps moving even before any
    // human reconnects. Best-effort — failures here must not block boot.
    try {
      const restored = await roomManager.restoreActiveGames();
      if (restored.length > 0) {
        log(`restored ${restored.length} in-flight game${restored.length === 1 ? '' : 's'}: ${restored.join(', ')}`);
        for (const code of restored) {
          const room = roomManager.getRoom(code);
          if (room) gameSocket.onRoomRestored(room);
        }
      }
    } catch (err) {
      log(`live-state restore failed: ${err}`);
    }
  });
})();
