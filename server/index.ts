import express, { type Request, Response, NextFunction } from "express";
import { installConsoleRedaction } from "../shared/logRedaction";
import { setupVite, serveStatic, log } from "./vite";

installConsoleRedaction();

const app = express();

// Debug database connection
console.log('Environment check:', {
  environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development',
  hasDatabaseUrl: !!process.env.DATABASE_URL,
});

// Raw body parsing specifically for Stripe webhooks (must come before JSON parsing)
app.use('/api/stripe/webhooks', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes with increased limits for photo uploads
app.use(express.json({ limit: '10mb' })); // Allow up to 10MB for base64 photo uploads
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Enhanced startup function with comprehensive error handling
async function startApplication() {
  try {
    const { registerRoutes } = await import("./routes");
    const server = await registerRoutes(app);

    // Enhanced error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      const isProduction = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT;

      // Enhanced error logging
      const errorDetails = {
        status,
        message,
        url: _req.originalUrl,
        method: _req.method,
        userAgent: _req.get('User-Agent'),
        ip: _req.ip,
        timestamp: new Date().toISOString()
      };

      if (isProduction) {
        console.error('Production error handled:', JSON.stringify(errorDetails, null, 2));
        // Don't expose internal errors in production
        const safeMessage = status >= 500 ? "Internal Server Error" : message;
        res.status(status).json({ message: safeMessage });
      } else {
        console.error('Development error:', err);
        res.status(status).json({ message, stack: err.stack });
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
      // Enhanced static file serving for production
      const path = await import("path");
      const fs = await import("fs");
      
      const distPath = path.resolve(process.cwd(), "dist", "public");
      console.log("Production static file configuration:", {
        distPath,
        exists: fs.existsSync(distPath),
        cwd: process.cwd()
      });
      
      if (fs.existsSync(distPath)) {
        // Serve static files with proper caching headers
        app.use(express.static(distPath, {
          maxAge: isProduction ? '1d' : 0, // Cache for 1 day in production
          etag: true,
          lastModified: true
        }));
        
        // SPA fallback - serve index.html for all non-API routes
        app.get("*", (_req, res) => {
          const indexPath = path.resolve(distPath, "index.html");
          try {
            console.log("Serving SPA fallback:", { url: _req.originalUrl, indexPath });
            res.sendFile(indexPath);
          } catch (fileError) {
            console.error("Failed to serve index.html:", fileError);
            res.status(500).json({ message: "Application failed to load" });
          }
        });
      } else {
        console.error(`Static files directory not found: ${distPath}`);
        console.log("Attempting fallback to serveStatic function...");
        try {
          serveStatic(app);
        } catch (fallbackError) {
          console.error("Fallback serveStatic also failed:", fallbackError);
          // Last resort - serve a basic error page
          app.get("*", (_req, res) => {
            res.status(503).json({ 
              message: "Application temporarily unavailable",
              error: "Static files not found"
            });
          });
        }
      }
    }

    // Enhanced server listening with better error handling
    const port = parseInt(process.env.PORT || '5000', 10);
    const host = process.env.HOST?.trim() || (isProduction ? "0.0.0.0" : "127.0.0.1");
    
    console.log("Server configuration:", {
      port,
      host,
      nodeEnv: process.env.NODE_ENV,
      replitDeployment: !!process.env.REPLIT_DEPLOYMENT,
      pid: process.pid
    });

    return new Promise<void>((resolve, reject) => {
      const serverInstance = server.listen({
        port,
        host,
        reusePort: true,
      }, () => {
        console.log(`✅ Server successfully listening on ${host}:${port}`);
        console.log(`🔗 Server URL: http://${host}:${port}`);
        log(`serving on port ${port}`);
        resolve();
      });

      serverInstance.on('error', (error: any) => {
        console.error('❌ Server failed to start:', error);
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${port} is already in use`);
        } else if (error.code === 'EACCES') {
          console.error(`Permission denied to bind to port ${port}`);
        }
        reject(error);
      });

      // Handle server close events
      serverInstance.on('close', () => {
        console.log('Server closed');
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => {
        console.log('SIGTERM received, starting graceful shutdown...');
        serverInstance.close((err) => {
          if (err) {
            console.error('Error during graceful shutdown:', err);
            process.exit(1);
          }
          console.log('Graceful shutdown completed');
          process.exit(0);
        });
      });
    });

  } catch (error) {
    console.error('❌ Application startup failed:', error);
    throw error;
  }
}

// Wrap startup in comprehensive error handling
(async () => {
  try {
    await startApplication();
  } catch (startupError) {
    const error = startupError as Error;
    console.error('💥 Fatal startup error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // In production, try to keep the process alive for debugging
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
      console.log('Production mode: keeping process alive for debugging...');
      setInterval(() => {
        console.log('Process heartbeat - server failed to start but process is alive');
      }, 30000);
    } else {
      process.exit(1);
    }
  }
})();
