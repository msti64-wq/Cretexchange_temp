#!/usr/bin/env node

// Production deployment startup script
console.log('🚀 Starting CreteXchange production deployment...');

// Set production environment
process.env.NODE_ENV = 'production';

// Log environment info
console.log('Environment check:', {
  environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development', 
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  port: process.env.PORT || '5000',
  nodeVersion: process.version
});

// Enhanced error handling
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
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

// Enhanced deployment startup function
async function startApp() {
  try {
    const port = parseInt(process.env.PORT || '5000', 10);
    
    // Check if the target port is available
    console.log(`🔍 Checking port ${port} availability...`);
    const isPortAvailable = await checkPortAvailability(port);
    
    if (!isPortAvailable) {
      console.error(`❌ DEPLOYMENT FAILED: Port ${port} is already in use`);
      console.error('📋 Resolution steps:');
      console.error('   1. Stop any existing development server');
      console.error('   2. Check for other processes using the port');
      console.error('   3. Set a different PORT environment variable');
      process.exit(1);
    }
    
    // Check if production bundle exists
    const fs = await import('fs');
    const path = await import('path');
    const distPath = path.resolve(process.cwd(), 'dist', 'index.js');
    
    if (!fs.existsSync(distPath)) {
      console.error(`❌ DEPLOYMENT FAILED: Production bundle not found at ${distPath}`);
      console.error('📋 Resolution: Run "npm run build" to create the production bundle');
      process.exit(1);
    }
    
    console.log('📦 Loading production application...');
    await import('./dist/index.js');
    console.log('✅ Deployment successful - production server started');
    
  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    
    if (error.code === 'EADDRINUSE') {
      console.error('🔧 Port conflict detected - please resolve before deployment');
    }
    
    process.exit(1);
  }
}

startApp();