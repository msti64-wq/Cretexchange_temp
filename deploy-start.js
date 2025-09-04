#!/usr/bin/env node

// Production deployment startup script
console.log('🚀 Starting WashOut Pro production deployment...');

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

// Import and start the application
async function startApp() {
  try {
    console.log('📦 Loading application...');
    await import('./dist/index.js');
    console.log('✅ Application started successfully');
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    
    // Fallback to development mode if production fails
    console.log('🔄 Attempting fallback to development mode...');
    try {
      await import('./server/index.ts');
      console.log('✅ Fallback successful - running in development mode');
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
      process.exit(1);
    }
  }
}

startApp();