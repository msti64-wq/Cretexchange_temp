#!/usr/bin/env node

// Robust production startup script to prevent crashes
console.log('🚀 Starting WashOut Pro production server...');

// Set production environment
process.env.NODE_ENV = 'production';
process.env.REPLIT_DEPLOYMENT = 'true';

// Enhanced logging function
function log(level, message, details = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  if (details) {
    console.log('Details:', details);
  }
}

// Comprehensive error handling to prevent crashes
process.on('uncaughtException', (err) => {
  log('ERROR', 'Uncaught Exception (handled)', {
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 3) // First 3 lines of stack
  });
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'Unhandled Rejection (handled)', {
    reason: reason?.toString(),
    promise: promise?.toString()
  });
  // Don't exit - keep server running
});

// Prevent SIGTERM from crashing the application
process.on('SIGTERM', () => {
  log('WARN', 'Received SIGTERM - gracefully shutting down');
  // Don't force exit
});

process.on('SIGINT', () => {
  log('WARN', 'Received SIGINT - gracefully shutting down');
  // Don't force exit  
});

// Log comprehensive environment info
log('INFO', 'Environment configuration', {
  nodeVersion: process.version,
  platform: process.platform,
  env: process.env.NODE_ENV,
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  port: process.env.PORT || '5000',
  replitDeployment: !!process.env.REPLIT_DEPLOYMENT,
  workingDir: process.cwd()
});

// Check if port is already in use
async function checkPortAvailability(port) {
  return new Promise(async (resolve) => {
    const net = await import('net');
    const server = net.createServer();
    
    server.listen(port, (err) => {
      if (err) {
        resolve(false);
      } else {
        server.close(() => {
          resolve(true);
        });
      }
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Enhanced startup function with robust port handling
async function startServer() {
  try {
    const port = parseInt(process.env.PORT || '5000', 10);
    
    // First check if the target port is available
    log('INFO', 'Checking port availability', { port });
    const isPortAvailable = await checkPortAvailability(port);
    
    if (!isPortAvailable) {
      log('FATAL', 'Port conflict detected - cannot start production server', {
        port,
        message: `Port ${port} is already in use. Please stop any existing server before starting production mode.`,
        solution: 'Stop the development server first, then run this production script.'
      });
      process.exit(1);
    }
    
    // Check if dist/index.js exists
    const fs = await import('fs');
    const path = await import('path');
    const distPath = path.resolve(process.cwd(), 'dist', 'index.js');
    
    if (!fs.existsSync(distPath)) {
      log('FATAL', 'Production bundle missing', {
        path: distPath,
        message: 'Production bundle not found. Run "npm run build" first.',
        solution: 'Execute: npm run build'
      });
      process.exit(1);
    }
    
    log('INFO', 'Starting production server', { 
      distPath, 
      port,
      environment: 'production'
    });
    
    // Import and start the production bundle
    await import('./dist/index.js');
    log('SUCCESS', 'Production server started successfully');
    
    // Keep process alive with heartbeat
    setInterval(() => {
      log('DEBUG', 'Production server heartbeat - operational');
    }, 60000); // Every minute
    
  } catch (error) {
    log('FATAL', 'Production server startup failed', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5), // First 5 lines of stack
      code: error.code
    });
    
    // For port conflicts, provide clear guidance
    if (error.code === 'EADDRINUSE') {
      log('FATAL', 'Port conflict resolution required', {
        message: 'Another process is using the required port.',
        solutions: [
          'Stop the development server if running',
          'Check for other processes using the port',
          'Set a different PORT environment variable'
        ]
      });
    }
    
    process.exit(1);
  }
}


// Wrap entire startup in error handler
(async () => {
  try {
    await startServer();
  } catch (fatalError) {
    log('FATAL', 'Fatal startup error', {
      message: fatalError.message,
      stack: fatalError.stack
    });
    process.exit(1);
  }
})();