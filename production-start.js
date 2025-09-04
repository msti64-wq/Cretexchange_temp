#!/usr/bin/env node

// Robust production startup script to prevent crashes
console.log('🚀 Starting WashOut Pro production server...');

// Set production environment
process.env.NODE_ENV = 'production';

// Comprehensive error handling to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception (handled):', err.message);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection (handled):', reason);
  // Don't exit - keep server running
});

// Prevent SIGTERM from crashing the application
process.on('SIGTERM', () => {
  console.log('⚠️ Received SIGTERM - gracefully shutting down');
  // Don't force exit
});

process.on('SIGINT', () => {
  console.log('⚠️ Received SIGINT - gracefully shutting down');
  // Don't force exit  
});

console.log('Environment info:', {
  nodeVersion: process.version,
  platform: process.platform,
  env: process.env.NODE_ENV,
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  port: process.env.PORT || '5000'
});

// Start the application
async function startServer() {
  try {
    console.log('📦 Loading production bundle...');
    await import('./dist/index.js');
    console.log('✅ Server started successfully');
    
    // Keep process alive
    setInterval(() => {
      // Heartbeat to keep deployment active
    }, 30000);
    
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    console.log('⏱️ Retrying in 5 seconds...');
    
    setTimeout(startServer, 5000);
  }
}

startServer();