import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Debug database connection
console.log('Environment check:', {
  environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development',
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  databaseUrlPreview: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 50) + '...' : 'undefined'
});

// Raw body parsing specifically for Stripe webhooks (must come before JSON parsing)
app.use('/api/stripe/webhooks', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes with increased limits for photo uploads
app.use(express.json({ limit: '10mb' })); // Allow up to 10MB for base64 photo uploads
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    
    // Log error but don't crash the server in production
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
      console.error('Production error handled:', err.message);
    } else {
      throw err; // Only throw in development for debugging
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const isProduction = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT;
  if (!isProduction) {
    await setupVite(app, server);
  } else {
    // Custom static file serving for production to fix deployment issue
    const path = await import("path");
    const fs = await import("fs");
    
    const distPath = path.resolve(process.cwd(), "dist", "public");
    console.log("Serving static files from:", distPath);
    console.log("Directory exists:", fs.existsSync(distPath));
    
    if (fs.existsSync(distPath)) {
      // Serve static files
      app.use(express.static(distPath));
      
      // SPA fallback - serve index.html for all non-API routes
      app.get("*", (_req, res) => {
        const indexPath = path.resolve(distPath, "index.html");
        console.log("Serving index.html from:", indexPath);
        res.sendFile(indexPath);
      });
    } else {
      console.error(`Static files directory not found: ${distPath}`);
      // Fallback to the original serveStatic function
      serveStatic(app);
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
