import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  const isAssetOrApiRequest = (req: { path?: string; originalUrl?: string }) => {
    const path = req.path || req.originalUrl || "";
    if (!path) return false;
    if (path.startsWith("/api/")) return true;
    if (path.startsWith("/assets/") || path.startsWith("/icons/")) return true;
    if (path === "/manifest.json" || path === "/sw.js") return true;
    return /\.[a-z0-9]+$/i.test(path);
  };

  app.use("*", async (req, res, next) => {
    if (isAssetOrApiRequest(req)) {
      return next();
    }

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.get("/", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  const isAssetOrApiRequest = (req: { path?: string; originalUrl?: string }) => {
    const path = req.path || req.originalUrl || "";
    if (!path) return false;
    if (path.startsWith("/api/")) return true;
    if (path.startsWith("/assets/") || path.startsWith("/icons/")) return true;
    if (path === "/manifest.json" || path === "/sw.js") return true;
    return /\.[a-z0-9]+$/i.test(path);
  };

  // fall through to index.html for SPA routes only
  app.use("*", (req, res, next) => {
    if (isAssetOrApiRequest(req)) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
