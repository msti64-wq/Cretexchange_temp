import express, { type Request, Response, NextFunction } from "express";
import { installConsoleRedaction } from "../shared/logRedaction";
import { setupVite, serveStatic, log } from "./vite";
import { getStorageSelection } from "./objectStorage";

installConsoleRedaction();

const app = express();

function hasUrlProtocol(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function normalizeDriverStripeUrlEnvValue(value: string, source: string) {
  const trimmedValue = value.trim().replace(/\/+$/, "");
  if (source === "RAILWAY_PUBLIC_DOMAIN" && !hasUrlProtocol(trimmedValue)) {
    return `https://${trimmedValue}`;
  }
  return trimmedValue;
}

function getConfiguredUrlState(source: string, value?: string) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return {
      configured: false,
      isHttps: null,
      isValidUrl: null,
      host: null,
    };
  }

  try {
    const parsedUrl = new URL(normalizeDriverStripeUrlEnvValue(trimmedValue, source));
    return {
      configured: true,
      isHttps: parsedUrl.protocol === "https:",
      isValidUrl: true,
      host: parsedUrl.host,
    };
  } catch {
    return {
      configured: true,
      isHttps: false,
      isValidUrl: false,
      host: null,
    };
  }
}

function logDriverStripeOnboardingUrlStartupState() {
  const publicAppUrl = getConfiguredUrlState("PUBLIC_APP_URL", process.env.PUBLIC_APP_URL);
  const appBaseUrl = getConfiguredUrlState("APP_BASE_URL", process.env.APP_BASE_URL);
  const railwayPublicDomain = getConfiguredUrlState("RAILWAY_PUBLIC_DOMAIN", process.env.RAILWAY_PUBLIC_DOMAIN);
  const selectedSource = publicAppUrl.configured
    ? "PUBLIC_APP_URL"
    : appBaseUrl.configured
      ? "APP_BASE_URL"
      : railwayPublicDomain.configured
        ? "RAILWAY_PUBLIC_DOMAIN"
        : "missing";
  const selectedUrl = selectedSource === "PUBLIC_APP_URL"
    ? publicAppUrl
    : selectedSource === "APP_BASE_URL"
      ? appBaseUrl
      : selectedSource === "RAILWAY_PUBLIC_DOMAIN"
        ? railwayPublicDomain
        : null;

  console.log("Driver Stripe onboarding URL configuration:", {
    "PUBLIC_APP_URL configured": publicAppUrl.configured,
    "APP_BASE_URL configured": appBaseUrl.configured,
    "RAILWAY_PUBLIC_DOMAIN configured": railwayPublicDomain.configured,
    "resolved source": selectedSource,
    "resolved host": selectedUrl?.host ?? null,
    isHttps: selectedUrl?.isHttps ?? null,
    hasPublicAppUrl: publicAppUrl.configured,
    publicAppUrlIsValid: publicAppUrl.isValidUrl,
    publicAppUrlIsHttps: publicAppUrl.isHttps,
    hasAppBaseUrl: appBaseUrl.configured,
    appBaseUrlIsValid: appBaseUrl.isValidUrl,
    appBaseUrlIsHttps: appBaseUrl.isHttps,
    hasRailwayPublicDomain: railwayPublicDomain.configured,
    railwayPublicDomainIsValid: railwayPublicDomain.isValidUrl,
    railwayPublicDomainIsHttps: railwayPublicDomain.isHttps,
    selectedSource,
    selectedHost: selectedUrl?.host ?? null,
    selectedUrlIsHttps: selectedUrl?.isHttps ?? null,
  });
}

function getDeploymentGitCommitState() {
  const commitSources = [
    ["RAILWAY_GIT_COMMIT_SHA", process.env.RAILWAY_GIT_COMMIT_SHA],
    ["GIT_COMMIT_SHA", process.env.GIT_COMMIT_SHA],
    ["GIT_SHA", process.env.GIT_SHA],
    ["COMMIT_SHA", process.env.COMMIT_SHA],
    ["SOURCE_VERSION", process.env.SOURCE_VERSION],
    ["npm_package_gitHead", process.env.npm_package_gitHead],
  ] as const;
  const branchSources = [
    ["RAILWAY_GIT_BRANCH", process.env.RAILWAY_GIT_BRANCH],
    ["GIT_BRANCH", process.env.GIT_BRANCH],
    ["BRANCH", process.env.BRANCH],
  ] as const;
  const commit = commitSources.find(([, value]) => Boolean(value?.trim()));
  const branch = branchSources.find(([, value]) => Boolean(value?.trim()));

  return {
    commitConfigured: Boolean(commit),
    commitSource: commit?.[0] ?? null,
    gitCommitHash: commit?.[1]?.trim() ?? null,
    gitCommitShort: commit?.[1]?.trim().slice(0, 7) ?? null,
    branchConfigured: Boolean(branch),
    branchSource: branch?.[0] ?? null,
    gitBranch: branch?.[1]?.trim() ?? null,
  };
}

function logDeploymentGitCommitStartupState() {
  console.log("Deployment git commit:", getDeploymentGitCommitState());
}

// Debug database connection
console.log('Environment check:', {
  environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development',
  hasDatabaseUrl: !!process.env.DATABASE_URL,
});
logDriverStripeOnboardingUrlStartupState();
logDeploymentGitCommitStartupState();

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
    const { logBillingSchemaGuard } = await import("./billingSchemaGuard");
    await logBillingSchemaGuard();
    const storageSelection = getStorageSelection();
    console.log(`Storage provider selected: ${storageSelection.provider}`);
    console.log(`Bucket: ${storageSelection.bucket}`);
    console.log(`S3 endpoint present: ${storageSelection.s3EndpointPresent}`);

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
      const path = await import("path");
      const fs = await import("fs");
      const distPath = path.resolve(import.meta.dirname, "public");
      console.log("Production static file configuration:", {
        distPath,
        exists: fs.existsSync(distPath),
        cwd: process.cwd(),
      });
      serveStatic(app);
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
