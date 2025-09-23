import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { washoutActivities, withdrawals, walletTransactions, driverWallets } from "../shared/schema";
import { db } from "./db";
import { setupAuth, isAuthenticated } from "./tokenAuth";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, signObjectURL } from "./objectStorage";
import { ObjectPermission, setObjectAclPolicy } from "./objectAcl";
import { insertDriverSchema, insertOwnerSchema, insertWashoutLocationSchema, insertWashoutActivitySchema, withdrawalRequestSchema, walletTransactionQuerySchema, adminWithdrawalUpdateSchema, updateLocationRateSchema, updateLocationStatusSchema, updateLocationSchema, insertServicePaymentAccountSchema, updateServicePaymentAccountSchema, uuidParamSchema, superAdminEmailUpdateSchema, dateRangeSchema, ownerActivitiesQuerySchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Initialize Stripe only if secret key is available
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil",
  });
} else {
  console.log('Development mode: Stripe functionality disabled - using mock payment processing');
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for debugging
  app.get('/api/health', async (req, res) => {
    try {
      const userCount = await storage.getUserByUsername('admin');
      res.json({ 
        status: 'ok', 
        environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development',
        database_connected: !!userCount,
        admin_user_exists: !!userCount
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        status: 'error', 
        environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development',
        error: errorMessage 
      });
    }
  });

  // Database connectivity test endpoint - SECURED FOR ADMIN ONLY
  app.get("/api/debug/db-status", isAuthenticated, async (req: any, res) => {
    try {
      // Get the authenticated user
      const user = await storage.getUser(req.user.id);
      
      // Restrict to admin and super_admin roles only
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ 
          error: 'Admin access required',
          message: 'This endpoint is restricted to administrators only'
        });
      }

      const environment = process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';
      const hasDatabaseUrl = !!process.env.DATABASE_URL;
      const databaseUrlPreview = process.env.DATABASE_URL ? 'postgresql://[MASKED]@[MASKED]/[DATABASE]' : 'undefined';
      
      console.log('Database status check by admin:', {
        adminId: user.id,
        adminEmail: user.email,
        environment,
        hasDatabaseUrl
      });

      const userCount = await storage.getUserCount();
      const testUsers = await storage.getTestUsers();
      
      res.json({
        environment,
        hasDatabaseUrl,
        databaseUrlPreview,
        userCount,
        testUsers,
        requestedBy: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Database status check failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Authenticated debug endpoint for user/owner info
  app.get("/api/debug/whoami", isAuthenticated, async (req: any, res) => {
    try {
      const environment = process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';
      const user = await storage.getUser(req.user.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let owner = null;
      let subscriptionStatus = null;
      let stripeOnboarding = null;

      if (user.role === 'owner') {
        owner = await storage.getOwner(user.id);
        if (owner) {
          // Get subscription status
          const subscriptionQuery = await storage.getOwnerSubscriptionStatus(owner.id);
          subscriptionStatus = subscriptionQuery?.subscriptionStatus || 'inactive';
          
          // Owners don't have Stripe Connect accounts (only drivers do)
          stripeOnboarding = { note: 'Owners do not use Stripe Connect accounts' };
        }
      }

      res.json({
        environment,
        timestamp: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          address: user.address
        },
        owner: owner ? {
          id: owner.id,
          companyName: owner.companyName,
          businessLicense: owner.businessLicense,
          taxId: owner.taxId,
          subscriptionStatus: owner.subscriptionStatus
        } : null,
        subscriptionStatus,
        stripeOnboarding
      });
    } catch (error) {
      console.error('Debug whoami failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Authenticated debug endpoint for owner activities summary
  app.get("/api/debug/owner-activities-summary", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      
      if (!user || user.role !== 'owner') {
        return res.status(403).json({ error: 'Owner access required' });
      }

      const owner = await storage.getOwner(user.id);
      if (!owner) {
        return res.status(404).json({ error: 'Owner record not found' });
      }

      const dateRange = (req.query.dateRange as string) || 'today';
      
      // Calculate date range
      const now = new Date();
      let startDate: Date;
      let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      switch (dateRange) {
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
          endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
          break;
        case '7days':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
          break;
        case '30days':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 30);
          startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
          break;
        case '90days':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 90);
          startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
          break;
        case 'all':
          startDate = new Date('2020-01-01');
          endDate = new Date('2030-12-31');
          break;
        default: // 'today'
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
      }

      // Get activities for the owner
      const activities = await storage.getActivitiesByOwner(owner.id, startDate, endDate);
      
      // Calculate statistics
      const stats = activities.reduce((acc, activity) => {
        acc.total++;
        acc.byStatus[activity.status] = (acc.byStatus[activity.status] || 0) + 1;
        return acc;
      }, {
        total: 0,
        byStatus: {} as Record<string, number>
      });

      // Get a sample activity ID for further debugging
      const sampleActivity = activities[0];

      res.json({
        ownerId: owner.id,
        dateRange,
        dateRangeCalculated: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        total: stats.total,
        byStatus: stats.byStatus,
        sampleActivityId: sampleActivity?.id || null,
        sampleActivity: sampleActivity ? {
          id: sampleActivity.id,
          status: sampleActivity.status,
          amount: sampleActivity.amount,
          checkInTime: sampleActivity.checkInTime,
          location: sampleActivity.location ? {
            id: sampleActivity.location.id,
            name: sampleActivity.location.name
          } : null,
          driver: sampleActivity.driver ? {
            id: sampleActivity.driver.id,
            user: {
              firstName: sampleActivity.driver.user.firstName,
              lastName: sampleActivity.driver.user.lastName
            }
          } : null
        } : null,
        debugInfo: {
          activitiesQueryParams: {
            ownerId: owner.id,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          rawActivityCount: activities.length
        }
      });
    } catch (error) {
      console.error('Debug owner activities summary failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Enhanced batch management API endpoints
  app.get('/api/admin/billing/batches', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status, startDate, endDate, limit = 50, offset = 0 } = req.query;
      
      // Get batches with filtering and pagination
      const batches = await storage.getBillingBatchesWithFilters({
        status: status as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
      
      res.json(batches);
    } catch (error) {
      console.error("Error fetching billing batches:", error);
      res.status(500).json({ message: "Failed to fetch batches" });
    }
  });

  // Retry failed batch processing
  app.post('/api/admin/billing/batches/:batchId/retry', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { batchId } = req.params;
      const batch = await storage.getBillingBatch(batchId);
      
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      if (batch.status !== 'failed') {
        return res.status(400).json({ message: "Can only retry failed batches" });
      }

      // Reset batch status and retry
      await storage.retryBillingBatch(batchId);
      
      res.json({ message: "Batch retry initiated", batchId });
    } catch (error) {
      console.error("Error retrying batch:", error);
      res.status(500).json({ message: "Failed to retry batch" });
    }
  });

  // Daily batch scheduling endpoint (for cron job setup)
  app.post('/api/system/daily-batch-job', async (req, res) => {
    try {
      const { cronKey } = req.body;
      
      // Simple authentication for scheduled jobs
      if (cronKey !== process.env.CRON_JOB_SECRET) {
        return res.status(401).json({ message: "Invalid cron job authentication" });
      }

      console.log('🕐 Starting scheduled daily batch processing...');
      
      const results = await storage.processDailyBatches();
      
      console.log(`✅ Scheduled batch processing completed: ${results.processed} processed, ${results.failed} failed`);
      
      res.json({
        message: "Daily batch processing completed",
        results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error("Error in scheduled batch processing:", error);
      res.status(500).json({ 
        message: "Scheduled batch processing failed",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Scheduled job documentation endpoint
  app.get('/api/system/batch-job-info', (req, res) => {
    const environment = process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';
    const baseUrl = process.env.REPLIT_DEPLOYMENT 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : 'http://localhost:5000';
      
    res.json({
      message: "Daily Batch Processing Job Setup Information",
      environment,
      jobEndpoint: `${baseUrl}/api/system/daily-batch-job`,
      requiredEnvironmentVariable: "CRON_JOB_SECRET",
      authentication: {
        method: "POST body parameter",
        parameter: "cronKey",
        value: "Must match CRON_JOB_SECRET environment variable"
      },
      recommendations: {
        frequency: "Every 6 hours (to catch different timezones)",
        cronExpression: "0 */6 * * *",
        timeouts: "Set timeout to at least 5 minutes",
        retries: "Enable retries with exponential backoff"
      },
      curlExample: `curl -X POST ${baseUrl}/api/system/daily-batch-job \\\n  -H "Content-Type: application/json" \\\n  -d '{"cronKey": "YOUR_CRON_JOB_SECRET"}'`,
      setupInstructions: [
        "1. Set CRON_JOB_SECRET environment variable to a secure random string",
        "2. Configure your cron service (GitHub Actions, cron-job.org, etc.)",
        "3. Schedule to run every 6 hours: 0 */6 * * *",
        "4. Use the POST endpoint with cronKey authentication",
        "5. Monitor response for processing results and errors"
      ],
      businessLogic: {
        description: "Processes daily batches for each owner based on their billing settings",
        timezoneHandling: "Each owner's timezone and cutoff time is respected",
        batchCreation: "Creates billing_batches for each owner with pending payments",
        stripeIntegration: "Creates single PaymentIntent per batch",
        walletUpdates: "Posts pending balances to available on successful payment",
        idempotency: "Prevents duplicate processing with database and Stripe checks"
      }
    });
  });

  // Health check endpoint for monitoring
  app.get('/api/system/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      stripe: !!process.env.STRIPE_SECRET_KEY ? 'configured' : 'disabled'
    });
  });

  // Create test data with pending payments - SECURED FOR ADMIN ONLY
  app.post("/api/debug/create-test-data", isAuthenticated, async (req: any, res) => {
    try {
      // Get the authenticated user
      const user = await storage.getUser(req.user.id);
      
      // Restrict to admin and super_admin roles only
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ 
          error: 'Admin access required',
          message: 'This endpoint is restricted to administrators only'
        });
      }

      const env = process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';
      console.log(`🔧 CREATING TEST DATA FOR ${env.toUpperCase()} ENVIRONMENT...`);
      console.log('Test data creation requested by admin:', {
        adminId: user.id,
        adminEmail: user.email,
        environment: env
      });
      
      // Get O1 user and ensure owner record exists
      const o1User = await storage.getUserByUsername('O1');
      if (!o1User) {
        return res.status(404).json({ error: 'O1 user not found' });
      }

      // Check if O1 owner record exists, create if not
      let o1Owner = await storage.getOwner(o1User.id);
      if (!o1Owner) {
        console.log('Creating O1 owner record...');
        o1Owner = await storage.createOwner({
          userId: o1User.id,
          companyName: 'O1 Washout Services',
          businessLicense: 'BL123456',
          taxId: '12-3456789',
          subscriptionStatus: 'active'
        });
      }

      // Get D1 user and ensure driver record exists
      const d1User = await storage.getUserByUsername('D1');
      if (!d1User) {
        return res.status(404).json({ error: 'D1 user not found' });
      }

      let d1Driver = await storage.getDriver(d1User.id);
      if (!d1Driver) {
        console.log('Creating D1 driver record...');
        d1Driver = await storage.createDriver({
          userId: d1User.id,
          licenseNumber: 'DL123456',
          employerName: 'ABC Trucking',
          employerPhone: '2149493859'
        });
      }

      // Get or create a washout location for O1
      let location = await storage.getLocationsByOwner(o1Owner.id);
      if (!location || location.length === 0) {
        console.log('Creating washout location for O1...');
        location = [await storage.createWashoutLocation({
          ownerId: o1Owner.id,
          name: 'O1 Premium Washout Station',
          address: '870 N Preston Rd, Celina, TX 75009',
          latitude: '33.2273',
          longitude: '-96.7764',
          rate: '25.00'
        })];
      }

      // Create test washout activities with pending payments
      const activities = [];
      const payments = [];
      
      for (let i = 0; i < 3; i++) {
        const activity = await storage.createWashoutActivity({
          driverId: d1Driver.id,
          locationId: location[0].id,
          checkInTime: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000), // 1, 2, 3 days ago
          checkOutTime: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // 30 min later
          photoUrls: [`test-photo-${i + 1}.jpg`],
          notes: `Test washout activity ${i + 1}`,
          status: 'verified',
          amount: '25.00'
        });
        activities.push(activity);

        // Get owner's billing settings for business date calculation
        const billingSettings = await storage.getOwnerBillingSettings(o1Owner.id);
        const businessDate = billingSettings 
          ? await storage.calculateBusinessDateForOwner(
              o1Owner.id,
              billingSettings.billingTimezone,
              billingSettings.billingCutoffTime
            )
          : new Date().toISOString().split('T')[0]; // fallback to today
        
        // Create corresponding payment with 'pending' status
        const payment = await storage.createPayment({
          activityId: activity.id,
          driverId: d1Driver.id,
          ownerId: o1Owner.id,
          amount: '25.00',
          processingFee: '2.50',
          status: 'pending',
          businessDate // Critical: Set business date for batch processing
        });
        payments.push(payment);
      }
      
      console.log(`✅ TEST DATA CREATED: ${activities.length} activities, ${payments.length} pending payments`);

      res.json({
        success: true,
        environment: env,
        message: `Test data created with ${payments.length} pending payments!`,
        activities: activities.length,
        payments: payments.length,
        totalPending: payments.reduce((sum, p) => sum + Number(p.amount), 0)
      });

    } catch (error) {
      console.error('❌ Error creating test data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        success: false, 
        error: errorMessage 
      });
    }
  });

  // Universal database population - SECURED FOR ADMIN ONLY
  app.get("/api/setup-users", isAuthenticated, async (req: any, res) => {
    try {
      // Get the authenticated user
      const user = await storage.getUser(req.user.id);
      
      // Restrict to admin and super_admin roles only
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ 
          error: 'Admin access required',
          message: 'This endpoint is restricted to administrators only'
        });
      }

      const env = process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';
      console.log(`🔧 SETTING UP USERS FOR ${env.toUpperCase()} ENVIRONMENT...`);
      console.log('User setup requested by admin:', {
        adminId: user.id,
        adminEmail: user.email,
        environment: env
      });
      
      // Use storage interface for reliable database operations
      const testUsers = [
        { username: 'D1', password: 'D1', firstName: 'D1', lastName: 'Driver', role: 'driver' as const, 
          email: 'D1@email.com', phone: '2149493859', address: '11445 Mansfield Dr, Frisco, Texas 75035' },
        { username: 'O1', password: 'O1', firstName: 'O1', lastName: 'Owner', role: 'owner' as const,
          email: 'O1@email.com', phone: '9723321192', address: '870 N Preston Rd, Celina, TX 75009' },
        { username: 'admin', password: 'admin123', firstName: 'Super', lastName: 'Admin', role: 'super_admin' as const,
          email: 'admin@washoutpro.com' },
        { username: 'testdriver', password: 'test123', firstName: 'Test', lastName: 'Driver', role: 'driver' as const,
          email: 'test@example.com', phone: '555-123-4567', address: '123 Main St' },
        { username: 'prodtest', password: 'test123', firstName: 'Prod', lastName: 'Test', role: 'driver' as const,
          email: 'prodtest@example.com' },
        { username: 'deploytest', password: 'test123', firstName: 'Deploy', lastName: 'Test', role: 'driver' as const,
          email: 'deploy@test.com' }
      ];

      let createdCount = 0;
      let existingCount = 0;

      for (const userData of testUsers) {
        try {
          const existing = await storage.getUserByUsername(userData.username);
          if (existing) {
            existingCount++;
            console.log(`User ${userData.username} already exists`);
          } else {
            const { password, ...userDataWithoutPassword } = userData;
            const passwordHash = await bcrypt.hash(password, 10);
            await storage.createUser({
              ...userDataWithoutPassword,
              passwordHash
            });
            createdCount++;
            console.log(`✅ Created user: ${userData.username}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(`⚠️ Issue with user ${userData.username}:`, errorMessage);
        }
      }

      const totalUsers = await storage.getUserCount();
      
      console.log(`✅ USER SETUP COMPLETE FOR ${env.toUpperCase()}: ${createdCount} created, ${existingCount} existing, ${totalUsers} total`);

      res.json({
        success: true,
        environment: env,
        message: `Users ready in ${env}!`,
        created: createdCount,
        existing: existingCount,
        total: totalUsers,
        testLogin: 'Try: deploytest / test123'
      });

    } catch (error) {
      console.error('❌ Error setting up users:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        success: false, 
        error: errorMessage 
      });
    }
  });

  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get role-specific data
      let roleData = null;
      if (user.role === 'driver') {
        roleData = await storage.getDriver(userId);
      } else if (user.role === 'owner') {
        roleData = await storage.getOwner(userId);
      }

      res.json({ ...user, roleData });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Driver registration
  app.post('/api/auth/register/driver', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get existing user and update specific fields
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.upsertUser({
        ...existingUser,
        role: 'driver',
        ...req.body.user,
      });

      // Create driver profile
      const driverData = insertDriverSchema.parse({
        ...req.body.driver,
        userId,
      });
      
      const driver = await storage.createDriver(driverData);
      res.json(driver);
    } catch (error) {
      console.error("Error creating driver:", error);
      res.status(400).json({ message: "Failed to create driver profile" });
    }
  });

  // Owner registration
  app.post('/api/auth/register/owner', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get existing user and update specific fields
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.upsertUser({
        ...existingUser,
        role: 'owner',
        ...req.body.user,
      });

      // Create owner profile
      const ownerData = insertOwnerSchema.parse({
        ...req.body.owner,
        userId,
      });
      
      const owner = await storage.createOwner(ownerData);
      res.json(owner);
    } catch (error) {
      console.error("Error creating owner:", error);
      res.status(400).json({ message: "Failed to create owner profile" });
    }
  });

  // Driver endpoints
  app.get('/api/drivers/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      // Get today's activities
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayActivities = await storage.getActivitiesByDriver(driver.id, today, tomorrow);
      
      // Get 7-day stats
      const weekStats = await storage.getDriverStats(driver.id, 7);
      
      // Get recent activities
      const recentActivities = await storage.getRecentActivitiesByDriver(driver.id, 5);

      const dailyEarnings = todayActivities.reduce((sum, activity: any) => {
        // Handle both possible data structures from Drizzle joins
        const amount = Number(activity.washout_activities?.amount || activity.amount || 0);
        return sum + amount;
      }, 0);

      // Get user data for profile completion checks
      const user = await storage.getUser(userId);

      res.json({
        dailyStats: {
          visits: todayActivities.length,
          earnings: dailyEarnings,
        },
        weeklyStats: weekStats,
        recentActivities,
        user: user,
      });
    } catch (error) {
      console.error("Error fetching driver dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  app.get('/api/drivers/locations', isAuthenticated, async (req: any, res) => {
    try {
      const locations = await storage.getActiveLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post('/api/drivers/location', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const { latitude, longitude } = req.body;
      await storage.updateDriverLocation(driver.id, latitude, longitude);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.post('/api/drivers/checkin', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const location = await storage.getWashoutLocation(req.body.locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      console.log("Check-in request body:", req.body);
      console.log("PhotoUrls received:", req.body.photoUrls);
      
      // CRITICAL FIX: Validate photo URLs to prevent temp/invalid URLs from being saved
      const photoUrls = req.body.photoUrls || [];
      const invalidPhotoUrls = photoUrls.filter((url: string) => 
        url.startsWith('temp-photo-') ||
        url.startsWith('local-photo-') ||
        url.startsWith('data:') ||
        url.startsWith('photo-') ||
        url.startsWith('blob:') ||
        (!url.includes('/objects/photos/') && !url.startsWith('/objects/photos/'))
      );

      if (invalidPhotoUrls.length > 0) {
        console.error("❌ INVALID PHOTO URLs REJECTED:", invalidPhotoUrls);
        return res.status(400).json({ 
          message: "Invalid photo URLs detected. All photos must be uploaded to server storage before submission.",
          invalidUrls: invalidPhotoUrls,
          details: "Only server-backed photo URLs containing '/objects/photos/' are allowed. Temporary, local, or data URLs cannot be saved to database."
        });
      }

      // Validate that all photo URLs are server-backed
      const nonServerUrls = photoUrls.filter((url: string) => 
        !url.includes('/objects/photos/') && 
        !url.startsWith('/objects/photos/') &&
        !url.startsWith('https://') // Allow external HTTPS URLs as fallback
      );

      if (nonServerUrls.length > 0) {
        console.error("❌ NON-SERVER PHOTO URLs REJECTED:", nonServerUrls);
        return res.status(400).json({ 
          message: "All photos must be uploaded to server storage for cross-platform access.",
          nonServerUrls,
          details: "Photos must be stored on server to be visible across all devices. Please re-upload photos and try again."
        });
      }

      console.log("✅ All photo URLs validated as server-backed:", photoUrls);
      
      // Prepare activity data with proper validation
      const activityInput = {
        driverId: driver.id,
        locationId: location.id,
        amount: location.rate.toString(),
        checkInTime: new Date(),
        latitude: req.body.latitude ? req.body.latitude.toString() : null,
        longitude: req.body.longitude ? req.body.longitude.toString() : null,
        photoUrls: req.body.photoUrls || [],
        notes: req.body.notes || null,
        status: 'pending' as const,
      };
      
      // Validate input using Zod schema
      const validatedData = insertWashoutActivitySchema.parse(activityInput);
      console.log("Validated activity data:", validatedData);

      // Use storage layer method for proper data handling
      const activity = await storage.createWashoutActivity(validatedData);
      res.json(activity);
    } catch (error) {
      console.error("Error checking in:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid input data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to check in" });
    }
  });

  app.get('/api/drivers/activities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // For end date, set to end of day (23:59:59.999) to include all activities on that date
      const end = endDate ? new Date(new Date(endDate as string).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

      const activities = await storage.getActivitiesByDriver(driver.id, start, end);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.get('/api/drivers/payments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // For end date, set to end of day (23:59:59.999) to include all payments on that date
      const end = endDate ? new Date(new Date(endDate as string).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

      const payments = await storage.getPaymentsByDriver(driver.id, start, end);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.put('/api/drivers/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // First, get or create the driver record
      let driver = await storage.getDriver(userId);
      if (!driver) {
        // Create driver record if it doesn't exist
        const driverData = {
          userId,
          employerName: req.body.employerName || "",
          employerAddress: req.body.employerAddress || "",
          employerPhone: req.body.employerPhone || "",
          licenseNumber: req.body.licenseNumber || "",
          truckNumber: req.body.truckNumber || "",
        };
        driver = await storage.createDriver(driverData);
      } else {
        // Update existing driver record
        driver = await storage.updateDriver(driver.id, {
          employerName: req.body.employerName || driver.employerName,
          employerAddress: req.body.employerAddress || driver.employerAddress,
          employerPhone: req.body.employerPhone || driver.employerPhone,
          licenseNumber: req.body.licenseNumber || driver.licenseNumber,
          truckNumber: req.body.truckNumber || driver.truckNumber,
        });
      }

      // Get current user to preserve username and other required fields
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user profile information, preserving username and other required fields
      await storage.upsertUser({
        id: userId,
        username: currentUser.username, // Preserve existing username
        passwordHash: currentUser.passwordHash, // Preserve existing password hash
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        paymentMethod: req.body.paymentMethod,
        paymentFrequency: req.body.paymentFrequency,
        role: currentUser.role, // Preserve existing role
      });

      res.json({ message: "Profile updated successfully" });
    } catch (error) {
      console.error("Error updating driver profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Owner endpoints
  app.get('/api/owners/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const weekStats = await storage.getOwnerStats(owner.id, 7);
      const monthStats = await storage.getOwnerStats(owner.id, 30);
      const locations = await storage.getLocationsByOwner(owner.id);

      // Get user data for profile completion checks
      const user = await storage.getUser(userId);

      res.json({
        weekStats,
        monthStats,
        locations: locations.length,
        user: user,
        owner: owner,
      });
    } catch (error) {
      console.error("Error fetching owner dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });


  app.post('/api/owners/locations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      if (!owner.isApproved) {
        return res.status(403).json({ message: "Owner not approved" });
      }

      const locationData = insertWashoutLocationSchema.parse({
        ...req.body,
        ownerId: owner.id,
      });

      const location = await storage.createWashoutLocation(locationData);
      res.json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(400).json({ message: "Failed to create location" });
    }
  });

  app.get('/api/owners/locations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const locations = await storage.getLocationsByOwner(owner.id);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.put('/api/owners/locations/:id/rate', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Get owner information
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Verify the location exists and belongs to this owner
      const existingLocation = await storage.getWashoutLocation(id);
      if (!existingLocation) {
        return res.status(404).json({ message: "Location not found" });
      }

      if (existingLocation.ownerId !== owner.id) {
        return res.status(403).json({ message: "Not authorized to update this location" });
      }

      // Validate request body using Zod schema
      const validatedData = updateLocationRateSchema.parse(req.body);

      const location = await storage.updateLocationRate(id, validatedData.rate);
      res.json(location);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error updating rate:", error);
      res.status(500).json({ message: "Failed to update rate" });
    }
  });

  app.put('/api/owners/locations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Verify the location belongs to this owner
      const existingLocation = await storage.getWashoutLocation(id);
      if (!existingLocation) {
        return res.status(404).json({ message: "Location not found" });
      }

      if (existingLocation.ownerId !== owner.id) {
        return res.status(403).json({ message: "Not authorized to update this location" });
      }

      // Validate request body using Zod schema
      const validatedData = updateLocationSchema.parse(req.body);
      
      const location = await storage.updateLocation(id, owner.id, validatedData);
      res.json(location);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error updating location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.put('/api/owners/locations/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Verify the location belongs to this owner
      const existingLocation = await storage.getWashoutLocation(id);
      if (!existingLocation) {
        return res.status(404).json({ message: "Location not found" });
      }

      if (existingLocation.ownerId !== owner.id) {
        return res.status(403).json({ message: "Not authorized to update this location" });
      }

      // Validate request body using Zod schema
      const validatedData = updateLocationStatusSchema.parse(req.body);

      const location = await storage.updateLocationStatus(id, owner.id, validatedData.isActive);
      res.json(location);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      console.error("Error updating location status:", error);
      res.status(500).json({ message: "Failed to update location status" });
    }
  });

  app.delete('/api/owners/locations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Verify the location belongs to this owner before deleting
      const location = await storage.getWashoutLocation(id);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      if (location.ownerId !== owner.id) {
        return res.status(403).json({ message: "Not authorized to delete this location" });
      }

      const deleted = await storage.deleteWashoutLocation(id, owner.id);
      
      if (deleted) {
        res.json({ message: "Location deleted successfully" });
      } else {
        res.status(404).json({ message: "Location not found or already deleted" });
      }
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  app.get('/api/owners/activities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { startDate, endDate, dateRange } = req.query;
      
      // Match debug endpoint logic exactly - support dateRange parameter
      let start: Date;
      let end: Date;
      
      if (dateRange) {
        // Use debug endpoint's date range calculation
        const now = new Date();
        let calculatedEndDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        switch (dateRange) {
          case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
            end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
            break;
          case '7days':
            start = new Date(now);
            start.setDate(start.getDate() - 7);
            start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
            end = calculatedEndDate;
            break;
          case '30days':
            start = new Date(now);
            start.setDate(start.getDate() - 30);
            start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
            end = calculatedEndDate;
            break;
          case '90days':
            start = new Date(now);
            start.setDate(start.getDate() - 90);
            start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
            end = calculatedEndDate;
            break;
          case 'all':
            start = new Date('2020-01-01');
            end = new Date('2030-12-31');
            break;
          default: // 'today'
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            end = calculatedEndDate;
            break;
        }
      } else {
        // Handle legacy startDate/endDate parameters
        if (startDate) {
          start = new Date(startDate as string);
        } else {
          // Default to 'all' behavior for backward compatibility
          start = new Date('2020-01-01');
        }
        
        if (endDate) {
          // For end date, set to end of day (23:59:59.999) to include all activities on that date
          end = new Date(new Date(endDate as string).getTime() + 24 * 60 * 60 * 1000 - 1);
        } else {
          // Default to 'all' behavior for backward compatibility
          end = new Date('2030-12-31');
        }
      }

      // Add debug logging to match debug endpoint
      console.log('🔍 /api/owners/activities called:', {
        ownerId: owner.id,
        userId: userId,
        dateRange: dateRange || 'legacy-params',
        startDate: startDate,
        endDate: endDate,
        calculatedStart: start.toISOString(),
        calculatedEnd: end.toISOString()
      });

      const activities = await storage.getActivitiesByOwner(owner.id, start, end);
      
      console.log('📊 Activities query result:', {
        ownerId: owner.id,
        totalActivities: activities.length,
        statusBreakdown: activities.reduce((acc, activity) => {
          acc[activity.status] = (acc[activity.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        sampleActivityIds: activities.slice(0, 3).map(a => a.id)
      });

      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.put('/api/owners/activities/:id/verify', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get the owner to ensure they have permission
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Get the activity details before verification
      const activityDetails = await storage.getWashoutActivity(id);
      if (!activityDetails) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // Verify the activity
      const activity = await storage.verifyWashoutActivity(id, userId);

      // NEW FEE STRUCTURE: Driver gets 100% of washout amount, owner pays flat $8.00 + 10% service fee
      const activityAmount = Number(activityDetails.amount);
      const driverAmount = activityAmount; // Driver gets full washout amount
      const baseFee = 8.00; // Flat $8.00 base fee
      const serviceFee = baseFee * 0.10; // 10% service fee on base fee = $0.80

      // Get owner's billing settings for business date calculation
      const billingSettings = await storage.getOwnerBillingSettings(owner.id);
      if (!billingSettings) {
        return res.status(500).json({ message: "Owner billing settings not found" });
      }
      
      // Calculate business date using proper cutoff time logic
      const businessDate = await storage.calculateBusinessDateForOwner(
        owner.id,
        billingSettings.billingTimezone,
        billingSettings.billingCutoffTime
      );

      // Create PENDING payment record for daily batch processing (no immediate Stripe charge)
      const payment = await storage.createPayment({
        activityId: id,
        driverId: activityDetails.driverId,
        ownerId: owner.id,
        amount: driverAmount.toString(),
        processingFee: serviceFee.toFixed(2), // 10% service fee ($0.80)
        washoutServiceFee: baseFee.toFixed(2), // Flat $8.00 base fee
        status: 'pending', // Will be processed by daily batch
        businessDate, // Set business date for batch grouping
        // batchId will be set later by the daily batch processor
      });

      // Credit driver's wallet to PENDING balance (not available until batch processes)
      const walletCredit = await storage.creditDriverPendingBalance(
        activityDetails.driverId,
        driverAmount.toString(),
        'washout',
        id,
        `Pending washout payment for activity ${id} (batch date: ${businessDate})`
      );

      console.log(`✅ Created pending payment: Driver gets $${driverAmount}, Owner pays $${(baseFee + serviceFee).toFixed(2)} for activity ${id}, Payment ID: ${payment.id}, Business Date: ${businessDate}`);
      console.log(`💰 Fee breakdown: Base $${baseFee.toFixed(2)} + Service $${serviceFee.toFixed(2)} = Total $${(baseFee + serviceFee).toFixed(2)}`);
      console.log(`📅 Payment will be processed in daily batch for ${businessDate} at ${billingSettings?.billingCutoffTime || '23:59:00'} ${billingSettings?.billingTimezone || 'America/Chicago'}`);

      // Daily batch processor will:
      // 1. Group all pending payments by owner and business date
      // 2. Create single Stripe PaymentIntent per owner per day
      // 3. On successful payment, move funds from pending to available balance

      res.json(activity);
    } catch (error) {
      console.error("Error verifying activity:", error);
      res.status(500).json({ message: "Failed to verify activity" });
    }
  });

  app.put('/api/owners/activities/:id/reject', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const activity = await storage.rejectWashoutActivity(id, userId);
      res.json(activity);
    } catch (error) {
      console.error("Error rejecting activity:", error);
      res.status(500).json({ message: "Failed to reject activity" });
    }
  });

  app.put('/api/owners/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // First, get or create the owner record
      let owner = await storage.getOwner(userId);
      if (!owner) {
        // Create owner record if it doesn't exist
        const ownerData = {
          userId,
          companyName: req.body.companyName || "",
          businessLicense: req.body.businessLicense || "",
          taxId: req.body.taxId || "",
        };
        owner = await storage.createOwner(ownerData);
      } else {
        // Update existing owner record
        owner = await storage.updateOwner(owner.id, {
          companyName: req.body.companyName || owner.companyName,
          businessLicense: req.body.businessLicense || owner.businessLicense,
          taxId: req.body.taxId || owner.taxId,
        });
      }

      // Get current user to preserve username and other required fields
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user profile information, preserving username and other required fields
      await storage.upsertUser({
        id: userId,
        username: currentUser.username, // Preserve existing username
        passwordHash: currentUser.passwordHash, // Preserve existing password hash
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        paymentMethod: req.body.paymentMethod,
        role: currentUser.role, // Preserve existing role
      });

      res.json({ message: "Profile updated successfully" });
    } catch (error) {
      console.error("Error updating owner profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Check terms agreement status
  app.get('/api/owners/terms-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      res.json({ 
        hasAgreed: !!owner.hasAgreedToTerms,
        agreedAt: owner.termsAgreedAt || null
      });
    } catch (error) {
      console.error("Error checking terms status:", error);
      res.status(500).json({ message: "Failed to check terms status" });
    }
  });

  // Terms agreement endpoint
  app.post('/api/owners/agree-to-terms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const user = await storage.getUser(userId);
      
      if (!owner || !user) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Record terms agreement with timestamp
      const agreementData = {
        ownerId: owner.id,
        ownerName: `${user.firstName} ${user.lastName}`,
        ownerEmail: user.email || '',
        ownerCompany: owner.companyName || 'N/A',
        agreedAt: new Date(),
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown'
      };

      // Update owner with terms agreement info
      await storage.updateOwner(owner.id, {
        ...owner,
        hasAgreedToTerms: true,
        termsAgreedAt: new Date()
      });

      // Create admin notification message
      const adminMessage = {
        userId: userId,
        subject: `Terms Agreement - ${agreementData.ownerName}`,
        message: `Owner "${agreementData.ownerName}" (${agreementData.ownerEmail}) from company "${agreementData.ownerCompany}" has read and agreed to the Terms and Conditions on ${agreementData.agreedAt.toLocaleDateString()} at ${agreementData.agreedAt.toLocaleTimeString()}.\n\nIP Address: ${agreementData.ipAddress}`,
        userRole: 'owner' as const,
        userPhone: user.phone || '',
        priority: 'normal'
      };

      await storage.createMessage(adminMessage);

      console.log(`📋 Terms agreed by owner: ${agreementData.ownerName} (${agreementData.ownerEmail}) at ${agreementData.agreedAt}`);

      res.json({ 
        success: true, 
        message: "Terms agreement recorded successfully",
        agreedAt: agreementData.agreedAt
      });
    } catch (error) {
      console.error("Error recording terms agreement:", error);
      res.status(500).json({ message: "Failed to record terms agreement" });
    }
  });

  // Driver terms agreement endpoints
  // Check driver terms agreement status
  app.get('/api/drivers/terms-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      res.json({ 
        hasAgreed: !!driver.hasAgreedToTerms,
        agreedAt: driver.termsAgreedAt || null
      });
    } catch (error) {
      console.error("Error checking driver terms status:", error);
      res.status(500).json({ message: "Failed to check terms status" });
    }
  });

  // Driver terms agreement endpoint
  app.post('/api/drivers/agree-to-terms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      // Verify user is a driver
      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver || driver.userId !== userId) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Check for idempotency - if already agreed, return existing agreement
      if (driver.hasAgreedToTerms) {
        return res.json({ 
          success: true, 
          message: "Terms already accepted",
          agreedAt: driver.termsAgreedAt
        });
      }

      const now = new Date();
      const ipAddress = req.get('x-forwarded-for') || req.ip || req.connection.remoteAddress || 'unknown';
      
      // Record terms agreement with timestamp
      const agreementData = {
        driverId: driver.id,
        driverName: `${user.firstName} ${user.lastName}`,
        driverEmail: user.email || '',
        driverLicense: driver.licenseNumber || 'N/A',
        driverEmployer: driver.employerName || 'N/A',
        agreedAt: now,
        ipAddress,
        userAgent: req.get('user-agent') || 'unknown'
      };

      // Safe partial update - only update the fields we need to change
      await storage.updateDriver(driver.id, {
        hasAgreedToTerms: true,
        termsAgreedAt: now
      });

      // Create admin notification message (remove unsupported 'priority' field)
      const adminMessage = {
        userId: userId,
        subject: `Driver Wallet Terms Agreement - ${agreementData.driverName}`,
        message: `Driver "${agreementData.driverName}" (${agreementData.driverEmail}) with license "${agreementData.driverLicense}" from "${agreementData.driverEmployer}" has read and agreed to the Wallet Terms and Conditions on ${agreementData.agreedAt.toLocaleDateString()} at ${agreementData.agreedAt.toLocaleTimeString()}.\n\nThis agreement enables wallet withdrawal functionality with the established fee structure (10% on withdrawals ≥$10, $1 flat fee <$10).\n\nIP Address: ${agreementData.ipAddress}\nUser Agent: ${agreementData.userAgent}`,
        userRole: 'driver' as const,
        userPhone: user.phone || ''
      };

      await storage.createMessage(adminMessage);

      console.log(`💳 Driver wallet terms agreed: ${agreementData.driverName} at ${agreementData.agreedAt}`);

      res.json({ 
        success: true, 
        message: "Wallet terms agreement recorded successfully",
        agreedAt: agreementData.agreedAt
      });
    } catch (error) {
      console.error("Error recording driver terms agreement:", error);
      res.status(500).json({ message: "Failed to record terms agreement" });
    }
  });

  // Owner subscription
  app.post('/api/owners/subscribe', isAuthenticated, async (req: any, res) => {
    try {
      console.log("Subscription request started for user:", req.user.id);
      
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      const owner = await storage.getOwner(userId);

      console.log("User found:", !!user, "Owner found:", !!owner);

      if (!user || !owner) {
        console.log("User or owner not found");
        return res.status(404).json({ message: "User or owner not found" });
      }

      if (owner.subscriptionStatus === 'active') {
        console.log("Already subscribed");
        return res.json({ message: "Already subscribed" });
      }

      // Check if Stripe is available
      console.log("Stripe available:", !!stripe);
      console.log("STRIPE_PRICE_ID:", process.env.STRIPE_PRICE_ID);
      
      if (!stripe) {
        // For development, just mark as active without payment processing
        console.log("Development mode: Activating subscription without Stripe");
        await storage.updateOwnerSubscription(owner.id, 'active', 'dev_subscription_' + Date.now());
        return res.json({ 
          subscriptionId: 'dev_subscription', 
          clientSecret: 'dev_client_secret',
          message: "Development mode: Subscription activated without payment processing"
        });
      }

      if (!user.stripeCustomerId) {
        console.log("Creating Stripe customer for user:", user.email);
        const customer = await stripe.customers.create({
          email: user.email!,
          name: `${user.firstName} ${user.lastName}`,
        });
        
        console.log("Stripe customer created:", customer.id);
        await storage.updateUserStripeInfo(userId, customer.id);
        user.stripeCustomerId = customer.id;
      } else {
        console.log("Using existing Stripe customer:", user.stripeCustomerId);
      }

      console.log("Creating Stripe subscription...");
      const subscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{
          price: process.env.STRIPE_PRICE_ID || 'price_default',
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      console.log("Stripe subscription created:", subscription.id);
      await storage.updateOwnerSubscription(owner.id, 'active', subscription.id);

      const clientSecret = (subscription.latest_invoice as any)?.payment_intent?.client_secret;
      console.log("Client secret available:", !!clientSecret);

      res.json({
        subscriptionId: subscription.id,
        clientSecret,
      });
    } catch (error: any) {
      console.error("Detailed subscription error:", {
        message: error.message,
        type: error.type,
        code: error.code,
        stack: error.stack
      });
      res.status(500).json({ 
        message: "Failed to create subscription",
        error: error.message 
      });
    }
  });

  // Create payment intent for one-time payments (if needed)
  app.post('/api/payments/create-payment-intent', isAuthenticated, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.json({ 
          clientSecret: 'dev_client_secret',
          message: "Development mode: Mock payment intent created"
        });
      }

      const { amount } = req.body;
      const userId = req.user.id;
      
      // Create idempotency key for one-time payments
      const idempotencyKey = `one_time_payment_${userId}_${Math.round(amount * 100)}_${Date.now()}`;
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
      }, {
        idempotencyKey
      });
      
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: "Error creating payment intent: " + errorMessage });
    }
  });

  // Process driver payout with 10% platform commission
  app.post('/api/payments/process-payout', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { driverId, amount } = req.body;
      const driver = await storage.getDriver(driverId);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const driverUser = await storage.getUser(driver.userId);
      if (!driverUser) {
        return res.status(404).json({ message: "Driver user not found" });
      }

      // Calculate amounts: 100% to driver, 10% platform fee charged to owner
      const driverAmount = amount;
      const platformCommission = amount * 0.1;

      if (!stripe) {
        // Development mode - just record the payment
        await storage.createPayment({
          driverId: driver.id,
          ownerId: '', // Would need actual owner ID
          amount: driverAmount.toString(),
          activityId: '',
          processingFee: platformCommission.toString(),
          status: 'completed'
        });

        return res.json({
          message: "Development mode: Payout recorded without Stripe processing",
          driverAmount,
          platformCommission,
        });
      }

      // Create payout through Stripe (would require Stripe Connect for real implementation)
      // For now, record the payment in database
      await storage.createPayment({
        driverId: driver.id,
        ownerId: '', // Would need actual owner ID
        amount: driverAmount.toString(),
        activityId: '',
        processingFee: platformCommission.toString(),
        status: 'pending'
      });

      res.json({
        message: "Payout processed successfully",
        driverAmount,
        platformCommission,
        method: driverUser.paymentMethod,
      });
    } catch (error) {
      console.error("Error processing payout:", error);
      res.status(500).json({ message: "Failed to process payout" });
    }
  });

  // Get payment history for drivers
  app.get('/api/payments/driver-history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const payments = await storage.getPaymentsByDriver(driver.id);
      res.json(payments);
    } catch (error) {
      console.error("Error getting payment history:", error);
      res.status(500).json({ message: "Failed to get payment history" });
    }
  });

  // Owner payments endpoint
  app.get('/api/owners/payments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // For end date, set to end of day (23:59:59.999) to include all payments on that date
      const end = endDate ? new Date(new Date(endDate as string).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

      const payments = await storage.getPaymentsByOwner(owner.id, start, end);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching owner payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  // Get subscription status for owners
  app.get('/api/payments/subscription-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      let subscriptionData = {
        status: owner.subscriptionStatus,
        plan: owner.subscriptionPlan,
        endsAt: owner.subscriptionEndsAt,
      };

      // If we have Stripe and a subscription ID, get fresh data
      if (stripe && user?.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          subscriptionData = {
            status: subscription.status === 'active' ? 'active' : 'inactive',
            plan: 'monthly', // or get from subscription metadata
            endsAt: new Date(((subscription as any).current_period_end || (subscription as any).items?.data?.[0]?.current_period_end) * 1000),
          };
        } catch (stripeError) {
          const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';
          console.log("Could not fetch Stripe subscription:", errorMessage);
        }
      }

      res.json(subscriptionData);
    } catch (error) {
      console.error("Error getting subscription status:", error);
      res.status(500).json({ message: "Failed to get subscription status" });
    }
  });

  // Owner payment methods management
  app.get('/api/owners/payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Fetch payment methods from database
      const paymentMethods = await storage.getOwnerPaymentMethods(owner.id);
      
      // Format for frontend
      const formattedMethods = paymentMethods.map(method => ({
        id: method.id,
        type: method.type,
        last4: method.last4,
        ...(method.type === 'card' ? {
          expiryMonth: method.expiryMonth,
          expiryYear: method.expiryYear,
          cardholderName: method.cardholderName
        } : {
          bankName: method.bankName,
          accountHolderName: method.accountHolderName
        }),
        isDefault: method.isDefault,
        stripePaymentMethodId: method.stripePaymentMethodId,
      }));

      res.json(formattedMethods);
    } catch (error) {
      console.error("Error getting payment methods:", error);
      res.status(500).json({ message: "Failed to get payment methods" });
    }
  });

  app.post('/api/owners/payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const user = await storage.getUser(userId);
      
      if (!owner || !user) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { type, cardNumber, expiryMonth, expiryYear, cvc, cardholderName, accountNumber, routingNumber, accountHolderName, bankName } = req.body;

      console.log("Adding payment method:", { type, owner: owner.id });

      // Create payment method record in database
      const paymentMethodData = {
        ownerId: owner.id,
        type,
        last4: type === 'card' ? cardNumber.slice(-4) : accountNumber.slice(-4),
        ...(type === 'card' ? {
          expiryMonth,
          expiryYear,
          cardholderName
        } : {
          bankName,
          accountHolderName
        }),
        isDefault: true, // First method is default, or handle this logic
        stripePaymentMethodId: null, // Will be set when Stripe integration is complete
      };

      // Save to database
      const savedMethod = await storage.createOwnerPaymentMethod(paymentMethodData);

      return res.json({
        message: "Payment method added successfully",
        method: {
          id: savedMethod.id,
          type: savedMethod.type,
          last4: savedMethod.last4,
          ...(savedMethod.type === 'card' ? {
            expiryMonth: savedMethod.expiryMonth,
            expiryYear: savedMethod.expiryYear,
            cardholderName: savedMethod.cardholderName
          } : {
            bankName: savedMethod.bankName,
            accountHolderName: savedMethod.accountHolderName
          }),
          isDefault: savedMethod.isDefault,
        },
      });
    } catch (error: any) {
      console.error("Error adding payment method:", error);
      res.status(500).json({ message: "Failed to add payment method: " + error.message });
    }
  });

  app.delete('/api/owners/payment-methods/:methodId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { methodId } = req.params;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      console.log("Removing payment method:", methodId);

      // Remove from database (soft delete)
      await storage.deleteOwnerPaymentMethod(methodId);

      res.json({ message: "Payment method removed successfully" });
    } catch (error: any) {
      console.error("Error removing payment method:", error);
      res.status(500).json({ message: "Failed to remove payment method: " + error.message });
    }
  });

  // Weekly payout processing endpoint
  app.post('/api/admin/process-weekly-payouts', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      console.log("Processing weekly payouts...");

      // Get all verified activities from the past week that haven't been paid
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      // For now, get all verified activities (would need proper implementation in storage)
      const unpaidActivities: any[] = [];
      
      if (!unpaidActivities.length) {
        return res.json({ message: "No unpaid activities found", processedPayouts: 0 });
      }

      let processedPayouts = 0;
      let totalPlatformFees = 0;

      // Group by driver for batch processing
      const driverActivityMap = new Map();
      
      for (const activity of unpaidActivities) {
        const driverId = activity.driverId;
        if (!driverActivityMap.has(driverId)) {
          driverActivityMap.set(driverId, []);
        }
        driverActivityMap.get(driverId).push(activity);
      }

      // Process payouts by driver
      for (const [driverId, activities] of Array.from(driverActivityMap.entries())) {
        const totalAmount = activities.reduce((sum: number, activity: any) => sum + parseFloat(activity.amount), 0);
        const driverAmount = totalAmount; // 100% to driver
        const platformFee = totalAmount * 0.1; // 10% platform fee charged to owner
        
        // Create payment record
        const payment = await storage.createPayment({
          ownerId: activities[0].location?.ownerId || '', // Need to get from location
          driverId: driverId,
          amount: driverAmount.toFixed(2),
          activityId: activities[0].id,
          processingFee: platformFee.toFixed(2),
          status: stripe ? 'pending' : 'completed',
          paidAt: new Date(),
        });

        processedPayouts++;
        totalPlatformFees += platformFee;
      }

      res.json({
        message: `Processed ${processedPayouts} weekly payouts`,
        processedPayouts,
        totalPlatformFees: totalPlatformFees.toFixed(2),
      });
    } catch (error: any) {
      console.error("Error processing weekly payouts:", error);
      res.status(500).json({ message: "Failed to process payouts: " + error.message });
    }
  });

  // Admin endpoints
  app.get('/api/admin/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const weekStats = await storage.getSystemStats(7);
      const monthStats = await storage.getSystemStats(30);

      res.json({
        weekStats,
        monthStats,
      });
    } catch (error) {
      console.error("Error fetching admin dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  app.get('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const driversData = await storage.getAllDrivers();
      const ownersData = await storage.getAllOwners();
      const admins = await storage.getAllAdmins();

      // Transform data to match frontend expectations
      const drivers = driversData.map(d => ({
        users: d.user,
        drivers: {
          id: d.id,
          userId: d.userId,
          employerName: d.employerName,
          employerAddress: d.employerAddress,
          employerPhone: d.employerPhone,
          licenseNumber: d.licenseNumber,
          truckNumber: d.truckNumber,
          isGpsEnabled: d.isGpsEnabled,
          currentLatitude: d.currentLatitude,
          currentLongitude: d.currentLongitude,
          lastLocationUpdate: d.lastLocationUpdate,
          connectedAccountId: d.connectedAccountId,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }
      }));

      const owners = ownersData.map(o => ({
        users: o.user,
        owners: {
          id: o.id,
          userId: o.userId,
          companyName: o.companyName,
          businessLicense: o.businessLicense,
          taxId: o.taxId,
          subscriptionStatus: o.subscriptionStatus,
          subscriptionPlan: o.subscriptionPlan,
          subscriptionEndsAt: o.subscriptionEndsAt,
          isApproved: o.isApproved,
          hasAgreedToTerms: o.hasAgreedToTerms,
          termsAgreedAt: o.termsAgreedAt,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        }
      }));

      res.json({ drivers, owners, admins });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin payments endpoint
  app.get('/api/admin/payments', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // For end date, set to end of day (23:59:59.999) to include all payments on that date
      const end = endDate ? new Date(new Date(endDate as string).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

      const payments = await storage.getAllPayments(start, end);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching admin payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  // Admin subscription management endpoint
  app.get('/api/admin/subscriptions', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all owners with subscription information
      const owners = await storage.getAllOwners();
      
      // Get all user details in parallel for efficiency
      const ownerUserPromises = owners.map(owner => storage.getUser(owner.userId));
      const ownerUsers = await Promise.all(ownerUserPromises);

      // Filter out owners without valid user records
      const validOwnerData = owners
        .map((owner, index) => ({ owner, user: ownerUsers[index] }))
        .filter(({ user }) => user !== null);

      // Prepare base subscription data for all owners
      const baseSubscriptionsData = validOwnerData.map(({ owner, user }) => ({
        id: user!.stripeSubscriptionId || 'N/A', // Use Stripe subscription ID as primary identifier
        ownerId: owner.id, // Add unique owner ID for table keys
        userId: owner.userId,
        ownerName: `${user!.firstName} ${user!.lastName}`,
        email: user!.email,
        companyName: owner.companyName || 'N/A',
        status: owner.isApproved ? owner.subscriptionStatus : 'pending_approval',
        plan: owner.subscriptionPlan || 'monthly',
        localEndsAt: owner.subscriptionEndsAt,
        stripeCustomerId: user!.stripeCustomerId,
        stripeSubscriptionId: user!.stripeSubscriptionId,
        createdAt: user!.createdAt,
        nextBillingDate: null,
        currentPeriodEnd: null,
        amount: null,
        currency: 'usd',
        cancelAtPeriodEnd: false,
        cancelAt: null,
        trialEnd: null
      }));

      // Get fresh Stripe data for all subscriptions in parallel (performance improvement)
      const stripeDataPromises = baseSubscriptionsData.map(async (subscriptionData) => {
        if (stripe && subscriptionData.stripeSubscriptionId) {
          try {
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionData.stripeSubscriptionId);
            
            // Calculate total amount across ALL subscription items (not just first one)
            const totalAmount = stripeSubscription.items.data.reduce((sum, item) => {
              return sum + (item.price?.unit_amount || 0);
            }, 0);

            // Find the owner to check approval status
            const owner = validOwnerData.find(({ user }) => user!.stripeSubscriptionId === subscriptionData.stripeSubscriptionId)?.owner;
            const effectiveStatus = owner?.isApproved ? stripeSubscription.status : 'pending_approval';

            return {
              ...subscriptionData,
              id: stripeSubscription.id, // Use Stripe subscription ID as consistent identifier
              status: effectiveStatus,
              currentPeriodEnd: new Date(((stripeSubscription as any).current_period_end || (stripeSubscription as any).items?.data?.[0]?.current_period_end) * 1000),
              nextBillingDate: new Date(((stripeSubscription as any).current_period_end || (stripeSubscription as any).items?.data?.[0]?.current_period_end) * 1000),
              amount: totalAmount > 0 ? (totalAmount / 100).toFixed(2) : null,
              currency: stripeSubscription.items.data[0]?.price?.currency || 'usd',
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
              cancelAt: stripeSubscription.cancel_at ? new Date(stripeSubscription.cancel_at * 1000) : null,
              trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null
            };
          } catch (stripeError) {
            console.log(`Could not fetch Stripe subscription for ${subscriptionData.email}:`, stripeError instanceof Error ? stripeError.message : 'Unknown error');
            // Return base data if Stripe fails
            return subscriptionData;
          }
        }
        return subscriptionData;
      });

      const subscriptionsWithStripeData = await Promise.all(stripeDataPromises);

      // Get truly active subscriptions for stats  
      const activeSubscriptions = subscriptionsWithStripeData.filter(subscription => 
        subscription.status === 'active'
      );

      // Sort all subscriptions by next billing date
      subscriptionsWithStripeData.sort((a, b) => {
        const aDate = a.nextBillingDate || a.currentPeriodEnd || a.localEndsAt || new Date(0);
        const bDate = b.nextBillingDate || b.currentPeriodEnd || b.localEndsAt || new Date(0);
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });

      res.json({
        subscriptions: subscriptionsWithStripeData,  // Return all subscriptions, not just active
        totalActive: activeSubscriptions.length,
        totalSubscriptions: subscriptionsWithStripeData.length
      });
    } catch (error) {
      console.error("Error fetching subscription data:", error);
      res.status(500).json({ message: "Failed to fetch subscription data" });
    }
  });

  // Create admin user (super admin only)
  app.post("/api/admin/users/create-admin", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { username, email, password, firstName, lastName } = req.body;
      
      if (!username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(username) || await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Username or email already exists" });
      }

      // Hash password
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 10);

      const newAdmin = await storage.createAdminUser({
        username,
        email,
        passwordHash,
        firstName,
        lastName
      });

      res.json({ message: "Admin user created successfully", admin: { id: newAdmin.id, username: newAdmin.username, email: newAdmin.email } });
    } catch (error) {
      console.error("Error creating admin user:", error);
      res.status(500).json({ message: "Failed to create admin user" });
    }
  });

  app.get('/api/admin/locations', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.put('/api/admin/owners/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const owner = await storage.approveOwner(id);
      res.json(owner);
    } catch (error) {
      console.error("Error approving owner:", error);
      res.status(500).json({ message: "Failed to approve owner" });
    }
  });

  app.put('/api/admin/locations/:id/visibility', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { isVisible } = req.body;
      
      const location = await storage.updateLocationVisibility(id, isVisible);
      res.json(location);
    } catch (error) {
      console.error("Error updating location visibility:", error);
      res.status(500).json({ message: "Failed to update location visibility" });
    }
  });

  // ============================================================================
  // WALLET API ENDPOINTS
  // ============================================================================

  // GET /api/wallet/balance - Get driver's current wallet balance
  app.get('/api/wallet/balance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Get or create wallet
      let wallet = await storage.getDriverWallet(driver.id);
      if (!wallet) {
        wallet = await storage.createDriverWallet({
          driverId: driver.id,
          availableBalance: "0.00",
          pendingBalance: "0.00"
        });
      }

      // Calculate pending balance dynamically from activities with status='pending'
      const dynamicPendingBalance = await storage.calculatePendingBalance(driver.id);

      res.json({
        availableBalance: parseFloat(wallet.availableBalance),
        pendingBalance: dynamicPendingBalance,
        totalBalance: parseFloat(wallet.availableBalance) + dynamicPendingBalance,
        lastUpdated: wallet.updatedAt
      });
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: "Failed to get wallet balance: " + errorMessage });
    }
  });

  // GET /api/wallet/transactions - Get paginated transaction history
  app.get('/api/wallet/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Parse and validate query parameters
      const rawQueryParams = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, 100),
        type: req.query.type,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      };

      // Validate query parameters
      let queryParams;
      try {
        queryParams = walletTransactionQuerySchema.parse(rawQueryParams);
      } catch (validationError) {
        return res.status(400).json({ message: "Invalid query parameters", details: validationError });
      }

      // Get transactions with date filtering
      const allTransactions = await storage.getWalletTransactionsByDriver(
        driver.id,
        queryParams.startDate,
        queryParams.endDate
      );

      // Filter by type if specified
      let filteredTransactions = allTransactions;
      if (queryParams.type) {
        filteredTransactions = allTransactions.filter(t => t.direction === queryParams.type);
      }

      // Calculate pagination
      const total = filteredTransactions.length;
      const offset = (queryParams.page - 1) * queryParams.limit;
      const transactions = filteredTransactions.slice(offset, offset + queryParams.limit);
      const hasMore = offset + queryParams.limit < total;

      // Format transactions for response
      const formattedTransactions = transactions.map(transaction => ({
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        direction: transaction.direction,
        balanceAfter: parseFloat(transaction.balanceAfter),
        currency: transaction.currency,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        status: transaction.status,
        description: transaction.description,
        metadata: transaction.metadata,
        createdAt: transaction.createdAt,
      }));

      res.json({
        transactions: formattedTransactions,
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          total,
          hasMore,
          totalPages: Math.ceil(total / queryParams.limit)
        }
      });
    } catch (error) {
      console.error("Error getting wallet transactions:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: "Failed to get wallet transactions: " + errorMessage });
    }
  });

  // POST /api/wallet/withdraw - Request withdrawal with 10% fee
  app.post('/api/wallet/withdraw', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Critical: Check if driver has agreed to terms before allowing withdrawal
      if (!driver.hasAgreedToTerms) {
        return res.status(403).json({ 
          message: "Terms agreement required", 
          details: "You must agree to the wallet terms and conditions before making withdrawals."
        });
      }

      // Validate request body
      let validatedData;
      try {
        validatedData = withdrawalRequestSchema.parse(req.body);
      } catch (validationError) {
        return res.status(400).json({ message: "Invalid withdrawal request", details: validationError });
      }

      const withdrawalAmount = validatedData.amount;

      // Get current wallet balance
      const wallet = await storage.getDriverWallet(driver.id);
      if (!wallet) {
        return res.status(400).json({ message: "Wallet not found. Please contact support." });
      }

      const availableBalance = parseFloat(wallet.availableBalance);
      if (availableBalance < withdrawalAmount) {
        return res.status(400).json({ 
          message: "Insufficient funds", 
          availableBalance,
          requestedAmount: withdrawalAmount 
        });
      }

      // Idempotency protection: Check for existing pending withdrawals
      const existingPendingWithdrawals = await storage.getWithdrawalsByDriver(driver.id);
      const pendingWithdrawals = existingPendingWithdrawals.filter(w => 
        w.status === 'requested' || w.status === 'processing'
      );
      
      if (pendingWithdrawals.length > 0) {
        return res.status(409).json({ 
          message: "You already have a pending withdrawal request. Please wait for it to be processed before submitting another.",
          pendingWithdrawal: {
            id: pendingWithdrawals[0].id,
            amount: parseFloat(pendingWithdrawals[0].amountRequested),
            status: pendingWithdrawals[0].status,
            createdAt: pendingWithdrawals[0].createdAt
          }
        });
      }

      // Rate limiting: Check for recent withdrawal attempts (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentWithdrawals = existingPendingWithdrawals.filter(w => 
        w.createdAt && new Date(w.createdAt) > fiveMinutesAgo
      );
      
      if (recentWithdrawals.length > 0) {
        const nextAllowedTime = new Date((recentWithdrawals[0].createdAt?.getTime() || Date.now()) + 5 * 60 * 1000);
        return res.status(429).json({ 
          message: "Too many withdrawal requests. Please wait before submitting another.",
          nextAllowedTime: nextAllowedTime.toISOString(),
          waitSeconds: Math.ceil((nextAllowedTime.getTime() - Date.now()) / 1000)
        });
      }

      // Check if driver has connected Stripe account with payouts enabled
      if (stripe && driver.connectedAccountId) {
        try {
          const account = await stripe.accounts.retrieve(driver.connectedAccountId);
          if (!account.payouts_enabled || !account.details_submitted) {
            return res.status(400).json({ 
              message: "Bank account setup incomplete. Please complete your bank account setup to withdraw funds.",
              accountStatus: {
                payoutsEnabled: account.payouts_enabled,
                detailsSubmitted: account.details_submitted
              }
            });
          }
        } catch (stripeError) {
          console.error("Error checking Stripe account:", stripeError);
          return res.status(500).json({ message: "Unable to verify bank account status" });
        }
      } else if (!driver.connectedAccountId) {
        return res.status(400).json({ 
          message: "No bank account connected. Please connect a bank account to withdraw funds."
        });
      }

      // Calculate fee based on tiered structure and net amount - using cent-safe arithmetic
      // Under $10.00: $1.00 flat fee, $10.00+: 10% fee
      const feeAmount = withdrawalAmount < 10.00 
        ? 1.00 
        : Math.round(withdrawalAmount * 0.10 * 100) / 100;
      const netAmount = withdrawalAmount - feeAmount;

      // Wrap all withdrawal operations in database transaction for atomicity
      const { withdrawal, newBalance } = await db.transaction(async (tx) => {
        // Create withdrawal record
        const [withdrawal] = await tx.insert(withdrawals).values({
          driverId: driver.id,
          amountRequested: withdrawalAmount.toString(),
          feeAmount: feeAmount.toString(),
          amountNet: netAmount.toString(),
          status: "requested",
          metadata: {
            stripeAccountId: driver.connectedAccountId,
            requestedAt: new Date().toISOString()
          }
        }).returning();

        // Calculate new balance
        const newBalance = availableBalance - withdrawalAmount;
        
        // Create wallet transaction for withdrawal amount (debit)
        await tx.insert(walletTransactions).values({
          driverId: driver.id,
          amount: withdrawalAmount.toString(),
          direction: "debit",
          balanceAfter: newBalance.toString(),
          sourceType: "withdrawal",
          sourceId: withdrawal.id,
          status: "posted",
          description: `Withdrawal request: $${netAmount.toFixed(2)} (after $${feeAmount.toFixed(2)} fee)`
        });

        // Update wallet balance atomically
        await tx.update(driverWallets)
          .set({
            availableBalance: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(driverWallets.driverId, driver.id));

        return { withdrawal, newBalance };
      });

      res.json({
        withdrawal: {
          id: withdrawal.id,
          amountRequested: withdrawalAmount,
          feeAmount: feeAmount,
          amountNet: netAmount,
          status: withdrawal.status,
          createdAt: withdrawal.createdAt
        },
        newBalance: newBalance,
        message: `Withdrawal request submitted. You will receive $${netAmount.toFixed(2)} after the $${feeAmount.toFixed(2)} processing fee.`
      });
    } catch (error) {
      console.error("Error processing withdrawal:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: "Failed to process withdrawal: " + errorMessage });
    }
  });

  // Admin endpoint: GET /api/admin/withdrawals - List all pending withdrawals
  app.get('/api/admin/withdrawals', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate, status } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const withdrawals = await storage.getAllWithdrawals(start, end);
      
      // Filter by status if provided
      let filteredWithdrawals = withdrawals;
      if (status) {
        filteredWithdrawals = withdrawals.filter(w => w.status === status);
      }

      // Format response
      const formattedWithdrawals = filteredWithdrawals.map(withdrawal => ({
        id: withdrawal.id,
        driver: {
          id: withdrawal.driver.id,
          name: `${withdrawal.driver.user.firstName} ${withdrawal.driver.user.lastName}`,
          email: withdrawal.driver.user.email,
          licenseNumber: withdrawal.driver.licenseNumber
        },
        amountRequested: parseFloat(withdrawal.amountRequested),
        feeAmount: parseFloat(withdrawal.feeAmount),
        amountNet: parseFloat(withdrawal.amountNet),
        status: withdrawal.status,
        stripeTransferId: withdrawal.stripeTransferId,
        stripePayoutId: withdrawal.stripePayoutId,
        failureReason: withdrawal.failureReason,
        createdAt: withdrawal.createdAt,
        processedAt: withdrawal.processedAt
      }));

      res.json({
        withdrawals: formattedWithdrawals,
        total: filteredWithdrawals.length,
        summary: {
          requested: filteredWithdrawals.filter(w => w.status === 'requested').length,
          processing: filteredWithdrawals.filter(w => w.status === 'processing').length,
          paid: filteredWithdrawals.filter(w => w.status === 'paid').length,
          failed: filteredWithdrawals.filter(w => w.status === 'failed').length,
          canceled: filteredWithdrawals.filter(w => w.status === 'canceled').length
        }
      });
    } catch (error) {
      console.error("Error getting admin withdrawals:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: "Failed to get withdrawals: " + errorMessage });
    }
  });

  // Admin endpoint: PATCH /api/admin/withdrawals/:id - Update withdrawal status
  app.patch('/api/admin/withdrawals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const withdrawalId = req.params.id;
      
      // Validate request body
      let validatedData;
      try {
        validatedData = adminWithdrawalUpdateSchema.parse(req.body);
      } catch (validationError) {
        return res.status(400).json({ message: "Invalid update data", details: validationError });
      }

      // Get current withdrawal
      const withdrawal = await storage.getWithdrawal(withdrawalId);
      if (!withdrawal) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }

      // Update withdrawal status
      const updatedWithdrawal = await storage.updateWithdrawalStatus(
        withdrawalId,
        validatedData.status,
        undefined, // stripeTransferId - would be set by actual Stripe processing
        undefined, // stripePayoutId - would be set by actual Stripe processing  
        validatedData.failureReason
      );

      // If marking as failed or canceled, credit the money back to driver's wallet
      if ((validatedData.status === 'failed' || validatedData.status === 'canceled') && 
          withdrawal.status === 'requested') {
        
        const driver = await storage.getDriverById(withdrawal.driverId);
        if (driver) {
          const wallet = await storage.getDriverWallet(withdrawal.driverId);
          if (wallet) {
            const refundAmount = parseFloat(withdrawal.amountRequested);
            const newBalance = parseFloat(wallet.availableBalance) + refundAmount;
            
            // Create refund transaction
            await storage.createWalletTransaction({
              driverId: withdrawal.driverId,
              amount: withdrawal.amountRequested,
              direction: "credit",
              balanceAfter: newBalance.toString(),
              sourceType: "adjustment",
              sourceId: withdrawalId,
              status: "posted",
              description: `Withdrawal ${validatedData.status}: refund for withdrawal ${withdrawalId}`
            });

            // Update wallet balance
            await storage.updateWalletBalance(withdrawal.driverId, newBalance.toString(), wallet.pendingBalance);
          }
        }
      }

      res.json({
        withdrawal: {
          id: updatedWithdrawal.id,
          status: updatedWithdrawal.status,
          failureReason: updatedWithdrawal.failureReason,
          processedAt: updatedWithdrawal.processedAt
        },
        message: `Withdrawal ${validatedData.status} successfully`
      });
    } catch (error) {
      console.error("Error updating withdrawal:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: "Failed to update withdrawal: " + errorMessage });
    }
  });

  // ============================================================================
  // END WALLET API ENDPOINTS  
  // ============================================================================

  // Photo upload endpoint for base64 compressed photos
  app.post("/api/photos/upload-base64", isAuthenticated, async (req: any, res) => {
    try {
      console.log(`🔧 PHOTO UPLOAD ATTEMPT - User: ${req.user.id} (${req.user.username}), Environment: ${process.env.REPLIT_DEPLOYMENT ? 'production' : 'development'}`);
      
      const { base64Data, filename } = req.body;
      
      if (!base64Data) {
        console.log("❌ PHOTO UPLOAD FAILED - No base64Data provided");
        return res.status(400).json({ error: "base64Data is required" });
      }

      // Extract base64 data (remove data:image/jpeg;base64, prefix if present)
      const base64Match = base64Data.match(/^data:image\/[a-z]+;base64,(.+)$/);
      const cleanBase64 = base64Match ? base64Match[1] : base64Data;
      
      // Convert base64 to buffer
      const buffer = Buffer.from(cleanBase64, 'base64');
      
      // Generate unique filename
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const extension = filename?.split('.').pop() || 'jpg';
      const uniqueFilename = `photo-${timestamp}-${randomId}.${extension}`;
      
      // Get object storage service
      const objectStorageService = new ObjectStorageService();
      const privateDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateDir}/photos/${uniqueFilename}`;
      
      // Parse object path and get bucket/object name
      const pathParts = fullPath.split("/");
      const bucketName = pathParts[1];
      const objectName = pathParts.slice(2).join("/");
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // Upload buffer to cloud storage
      await file.save(buffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            uploadedBy: req.user.id,
            uploadedAt: new Date().toISOString()
          }
        }
      });
      
      // Set ACL to private
      await setObjectAclPolicy(file, {
        owner: req.user.id,
        visibility: "private"
      });
      
      // Return the object path
      const objectPath = `/objects/photos/${uniqueFilename}`;
      console.log(`✅ PHOTO UPLOADED SUCCESSFULLY: ${objectPath} by user ${req.user.username} (${req.user.id})`);
      console.log(`🎯 CRITICAL: Photo will be accessible cross-platform via ${objectPath}`);
      
      res.status(200).json({ 
        objectPath,
        filename: uniqueFilename
      });
      
    } catch (error) {
      console.error(`❌ PHOTO UPLOAD FAILED - Server error for user ${req.user?.username} (${req.user?.id}):`, error);
      console.error("🔧 This error would previously cause fallback to sessionStorage and break cross-platform access");
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  // Object storage endpoints for photo uploads
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    console.log(`📁 Object request: ${req.path} by user ${req.user?.username || 'unknown'}`);
    
    const userId = req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      console.log(`📁 Object file found: ${req.path}`);
      
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        console.log(`❌ Access denied for user ${req.user?.username} to ${req.path}`);
        return res.sendStatus(401);
      }
      
      console.log(`✅ Access granted for user ${req.user?.username} to ${req.path}`);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        console.log(`❌ Object not found: ${req.path}`);
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  // Alternative endpoint to bypass ad blocker blocking "upload" keyword
  app.post("/api/media/prepare", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  // Third alternative with completely neutral name
  app.post("/api/files/generate", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  app.put("/api/washout-photos", isAuthenticated, async (req: any, res) => {
    if (!req.body.photoURL) {
      return res.status(400).json({ error: "photoURL is required" });
    }

    const userId = req.user?.id;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoURL,
        {
          owner: userId,
          visibility: "private",
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting photo ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // CSV export endpoint
  app.get('/api/export/:type', isAuthenticated, async (req: any, res) => {
    try {
      const { type } = req.params;
      const { startDate, endDate } = req.query;
      const userId = req.user.id;
      
      let data: any[] = [];
      let filename = '';

      switch (type) {
        case 'driver-activities': {
          const driver = await storage.getDriver(userId);
          if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
          }
          
          const start = startDate ? new Date(startDate) : undefined;
          // For end date, set to end of day (23:59:59.999) to include all activities on that date
          const end = endDate ? new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
          
          data = await storage.getActivitiesByDriver(driver.id, start, end);
          filename = `driver-activities-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }
        case 'owner-activities': {
          const owner = await storage.getOwner(userId);
          if (!owner) {
            return res.status(404).json({ message: "Owner not found" });
          }
          
          const start = startDate ? new Date(startDate) : undefined;
          // For end date, set to end of day (23:59:59.999) to include all activities on that date
          const end = endDate ? new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
          
          data = await storage.getActivitiesByOwner(owner.id, start, end);
          filename = `owner-activities-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }
        case 'admin-all': {
          const user = await storage.getUser(userId);
          if (user?.role !== 'admin' && user?.role !== 'super_admin') {
            return res.status(403).json({ message: "Admin access required" });
          }
          
          const start = startDate ? new Date(startDate) : undefined;
          // For end date, set to end of day (23:59:59.999) to include all activities on that date
          const end = endDate ? new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
          
          data = await storage.getAllActivities(start, end);
          filename = `all-activities-${new Date().toISOString().split('T')[0]}.csv`;
          break;
        }
        default:
          return res.status(400).json({ message: "Invalid export type" });
      }

      // Convert to CSV
      if (data.length === 0) {
        return res.status(404).json({ message: "No data found" });
      }

      // Helper function to format UUIDs for human readability
      const formatId = (uuid: string) => {
        if (!uuid || typeof uuid !== 'string') return uuid;
        return uuid.split('-')[0].toUpperCase(); // Show first 8 characters in uppercase
      };
      
      // Helper function to format dates for human readability
      const formatDate = (dateString: string | Date) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric', 
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      };

      // Flatten nested objects for CSV export with human-readable formatting
      const flattenedData = data.map((row, index) => {
        const flattened: any = {};
        
        // Add a simple row number for easy reference
        flattened['row_number'] = index + 1;
        
        // Handle nested washout_activities with human-friendly formatting
        if (row.washout_activities) {
          // Define which activity fields to exclude from CSV
          const excludedActivityFields = ['notes', 'verifiedBy', 'verifiedAt'];
          
          Object.keys(row.washout_activities).forEach(key => {
            // Skip excluded fields
            if (excludedActivityFields.includes(key)) {
              return;
            }
            
            let value = row.washout_activities[key];
            
            // Format specific fields for better readability
            if (key === 'id') {
              flattened['activity_ref'] = formatId(value);
            } else if (key === 'driverId') {
              flattened['driver_ref'] = formatId(value);
            } else if (key === 'locationId') {
              flattened['location_ref'] = formatId(value);
            } else if (key === 'checkInTime' || key === 'createdAt' || key === 'updatedAt') {
              flattened[`activity_${key === 'checkInTime' ? 'date_time' : key}`] = formatDate(value);
            } else if (key === 'amount') {
              flattened['activity_amount'] = `$${parseFloat(value).toFixed(2)}`;
            } else {
              flattened[`activity_${key}`] = value;
            }
          });
        }
        
        // Handle nested washout_locations with human-friendly formatting
        if (row.washout_locations) {
          // Define which location fields to exclude from CSV
          const excludedLocationFields = ['id', 'ownerId', 'amenities', 'operatingHours', 'permitUrls', 'createdAt', 'updatedAt'];
          
          Object.keys(row.washout_locations).forEach(key => {
            // Skip excluded fields
            if (excludedLocationFields.includes(key)) {
              return;
            }
            
            let value = row.washout_locations[key];
            
            if (key === 'rate') {
              flattened['location_rate'] = `$${parseFloat(value).toFixed(2)}`;
            } else {
              flattened[`location_${key}`] = value;
            }
          });
        }
        
        // Handle nested location (alternative structure)
        if (row.location) {
          // Define which location fields to exclude from CSV
          const excludedLocationFields = ['id', 'ownerId', 'amenities', 'operatingHours', 'permitUrls', 'createdAt', 'updatedAt'];
          
          Object.keys(row.location).forEach(key => {
            // Skip excluded fields
            if (excludedLocationFields.includes(key)) {
              return;
            }
            
            let value = row.location[key];
            
            if (key === 'rate') {
              flattened['location_rate'] = `$${parseFloat(value).toFixed(2)}`;
            } else {
              flattened[`location_${key}`] = value;
            }
          });
        }
        
        // Handle nested driver (for owner exports)
        if (row.driver) {
          Object.keys(row.driver).forEach(key => {
            if (typeof row.driver[key] === 'object' && row.driver[key] !== null) {
              // Handle nested user within driver
              if (key === 'user') {
                Object.keys(row.driver[key]).forEach(userKey => {
                  let value = row.driver[key][userKey];
                  if (userKey === 'id') {
                    flattened['driver_user_ref'] = formatId(value);
                  } else {
                    flattened[`driver_${userKey}`] = value;
                  }
                });
              } else {
                flattened[`driver_${key}`] = row.driver[key];
              }
            } else {
              let value = row.driver[key];
              if (key === 'id') {
                flattened['driver_id'] = formatId(value);
              } else {
                flattened[`driver_${key}`] = value;
              }
            }
          });
        }
        
        // Add any top-level properties that aren't nested objects
        Object.keys(row).forEach(key => {
          if (typeof row[key] !== 'object' || row[key] === null) {
            if (key.includes('Id') || key === 'id') {
              flattened[`${key}_ref`] = formatId(row[key]);
            } else {
              flattened[key] = row[key];
            }
          }
        });
        
        // Add a dedicated earnings column with proper formatting
        const earnings = row.washout_activities?.amount || row.amount || 0;
        flattened['earnings'] = `$${parseFloat(earnings).toFixed(2)}`;
        
        return flattened;
      });

      // Calculate totals for summary
      const totals = flattenedData.reduce((acc, row) => {
        // Calculate total activity amount
        const activityAmount = row.activity_amount || 0;
        if (typeof activityAmount === 'string' && activityAmount.startsWith('$')) {
          acc.totalActivityAmount += parseFloat(activityAmount.substring(1));
        } else {
          acc.totalActivityAmount += parseFloat(activityAmount || 0);
        }
        
        // Calculate total earnings
        const earnings = row.earnings || 0;
        if (typeof earnings === 'string' && earnings.startsWith('$')) {
          acc.totalEarnings += parseFloat(earnings.substring(1));
        } else {
          acc.totalEarnings += parseFloat(earnings || 0);
        }
        
        return acc;
      }, { totalActivityAmount: 0, totalEarnings: 0 });

      const headers = Object.keys(flattenedData[0]);
      const activityAmountIndex = headers.indexOf('activity_amount');
      const earningsIndex = headers.indexOf('earnings');
      
      const csvHeaders = headers.join(',');
      const rows = flattenedData.map(row => 
        Object.values(row).map(value => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'string') {
            return `"${value.replace(/"/g, '""')}"`;
          }
          if (value instanceof Date) {
            return `"${value.toISOString()}"`;
          }
          return value;
        }).join(',')
      );
      
      // Add summary rows
      const emptySeparatorRow = Array(headers.length).fill('').join(',');
      const summaryLabelRow = Array(headers.length).fill('').map((_, index) => {
        if (index === 0) return '"SUMMARY"';
        return '';
      }).join(',');
      
      const totalRow = Array(headers.length).fill('').map((_, index) => {
        if (index === 0) return '"Total Activities"';
        if (index === 1) return `"${flattenedData.length}"`;
        if (index === activityAmountIndex) return `"$${totals.totalActivityAmount.toFixed(2)}"`;
        if (index === earningsIndex) return `"$${totals.totalEarnings.toFixed(2)}"`;
        return '';
      }).join(',');
      
      const csv = [csvHeaders, ...rows, emptySeparatorRow, summaryLabelRow, totalRow].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Message routes for admin
  app.get('/api/admin/messages', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const messages = await storage.getAllMessages();
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.put('/api/admin/messages/:messageId/status', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { messageId } = req.params;
      const { status } = req.body;

      if (!['unread', 'read', 'resolved'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const message = await storage.updateMessageStatus(messageId, status);
      res.json(message);
    } catch (error) {
      console.error("Error updating message status:", error);
      res.status(500).json({ message: "Failed to update message status" });
    }
  });

  // Change password endpoint
  app.put('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }

      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await storage.upsertUser({
        ...user,
        passwordHash: newPasswordHash
      });

      console.log(`🔐 Password changed for user: ${user.username} (${user.email})`);

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Super admin email update endpoint
  app.put('/api/admin/update-email', isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newEmail } = req.body;
      const userId = req.user.id;

      // Validate request body
      const validationResult = superAdminEmailUpdateSchema.safeParse({ currentPassword, newEmail });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationResult.error.issues 
        });
      }

      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user is super admin
      if (user.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Check if new email is already in use by another user
      const existingUser = await storage.getUserByEmail(newEmail);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Email address is already in use" });
      }

      // Update user email
      await storage.upsertUser({
        ...user,
        email: newEmail
      });

      console.log(`📧 Email updated for super admin: ${user.username} (${user.email} → ${newEmail})`);

      res.json({ message: "Email updated successfully" });
    } catch (error) {
      console.error("Error updating super admin email:", error);
      res.status(500).json({ message: "Failed to update email" });
    }
  });

  // Create message route for users
  app.post('/api/messages', isAuthenticated, async (req: any, res) => {
    try {
      const { subject, message } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const newMessage = await storage.createMessage({
        userId: user.id,
        subject,
        message,
        userRole: (user.role || 'driver') as 'driver' | 'owner' | 'admin' | 'super_admin',
        userPhone: user.phone,
      });

      res.status(201).json(newMessage);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  // ==================== STRIPE CONNECT ENDPOINTS ====================
  
  // Create Stripe Connect Express account for driver
  app.post('/api/stripe/connect/create-account', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Check if driver already has a connected account
      if (driver.connectedAccountId) {
        return res.status(400).json({ 
          message: "Driver already has a connected account",
          accountId: driver.connectedAccountId 
        });
      }

      if (!stripe) {
        // Development mode - create mock account ID
        const mockAccountId = `acct_dev_${Date.now()}`;
        await storage.updateDriver(driver.id, { connectedAccountId: mockAccountId });
        
        return res.json({
          accountId: mockAccountId,
          message: "Development mode: Mock connected account created"
        });
      }

      // Create Stripe Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        capabilities: {
          card_payments: { requested: false }, // Not needed for payouts
          transfers: { requested: true }, // Required for receiving transfers
        },
        business_type: 'individual',
        individual: {
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          phone: user.phone || undefined,
        },
        business_profile: {
          mcc: '4214', // Motor Freight Transportation
          product_description: 'Concrete washout services',
        },
        settings: {
          payouts: {
            schedule: {
              interval: 'daily',
            },
          },
        },
      });

      // Store the connected account ID
      await storage.updateDriver(driver.id, { connectedAccountId: account.id });

      console.log(`✅ Created Stripe Connect account ${account.id} for driver ${user.username}`);

      res.json({
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      });

    } catch (error: any) {
      console.error("Error creating Stripe Connect account:", error);
      res.status(500).json({ 
        message: "Failed to create connected account",
        error: error.message 
      });
    }
  });

  // Get Stripe Connect onboarding link for driver
  app.get('/api/stripe/connect/onboarding-link', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      if (!driver.connectedAccountId) {
        return res.status(400).json({ 
          message: "No connected account found. Create an account first." 
        });
      }

      if (!stripe) {
        // Development mode - return mock onboarding URL
        // Use Replit's public URL or fallback to localhost
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
          : process.env.BASE_URL || 'http://localhost:5000';
          
        return res.json({
          url: `${baseUrl}/api/stripe/connect/mock-onboarding?account=${driver.connectedAccountId}`,
          message: "Development mode: Mock onboarding link generated"
        });
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: driver.connectedAccountId,
        refresh_url: `${process.env.BASE_URL || 'http://localhost:5000'}/driver/profile`,
        return_url: `${process.env.BASE_URL || 'http://localhost:5000'}/driver/profile?setup=complete`,
        type: 'account_onboarding',
      });

      console.log(`🔗 Generated onboarding link for driver ${user.username} account ${driver.connectedAccountId}`);

      res.json({
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      });

    } catch (error: any) {
      console.error("Error creating onboarding link:", error);
      res.status(500).json({ 
        message: "Failed to create onboarding link",
        error: error.message 
      });
    }
  });

  // Check Stripe Connect account status for driver
  app.get('/api/stripe/connect/account-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      if (!driver.connectedAccountId) {
        return res.json({
          hasConnectedAccount: false,
          status: 'no_account',
          message: "No connected account found"
        });
      }

      if (!stripe) {
        // Development mode - return mock status
        return res.json({
          hasConnectedAccount: true,
          accountId: driver.connectedAccountId,
          status: 'active',
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          requirementsCurrentlyDue: [],
          requirementsEventuallyDue: [],
          message: "Development mode: Mock account status"
        });
      }

      // Retrieve account details from Stripe
      const account = await stripe.accounts.retrieve(driver.connectedAccountId);

      // Determine overall status
      let status = 'incomplete';
      if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
        status = 'active';
      } else if (account.details_submitted) {
        status = 'pending';
      } else if (account.requirements?.currently_due?.length === 0) {
        status = 'restricted';
      }

      console.log(`📊 Account status for driver ${user.username}: ${status}`);

      res.json({
        hasConnectedAccount: true,
        accountId: account.id,
        status,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsCurrentlyDue: account.requirements?.currently_due || [],
        requirementsEventuallyDue: account.requirements?.eventually_due || [],
        disabled: account.requirements?.disabled_reason,
        country: account.country,
        defaultCurrency: account.default_currency,
      });

    } catch (error: any) {
      console.error("Error checking account status:", error);
      res.status(500).json({ 
        message: "Failed to check account status",
        error: error.message 
      });
    }
  });

  // Stripe Connect webhook handler with enhanced security and idempotency
  app.post('/api/stripe/webhooks/connect', async (req, res) => {
    const environment = process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';
    let eventId = 'unknown';
    
    try {
      // Development mode handling
      if (!stripe) {
        console.log(`🔧 [${environment}] Webhook received but Stripe is disabled - skipping processing`);
        return res.status(200).json({ received: true, mode: 'development' });
      }

      const sig = req.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

      // Validate webhook signature and secret
      if (!webhookSecret) {
        console.error(`❌ [${environment}] STRIPE_CONNECT_WEBHOOK_SECRET not configured`);
        return res.status(400).json({ error: 'Webhook secret not configured' });
      }

      if (!sig) {
        console.error(`❌ [${environment}] Missing Stripe signature header`);
        return res.status(400).json({ error: 'Missing signature' });
      }

      // Construct and verify event with raw body
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
        eventId = event.id;
      } catch (err: any) {
        console.error(`❌ [${environment}] Webhook signature verification failed: ${err.message}`);
        return res.status(400).json({ error: 'Invalid signature' });
      }

      console.log(`🎣 [${environment}] Received webhook: ${event.type} (${event.id}) for account ${event.account}`);

      // Check for idempotency - has this event been processed before?
      const alreadyProcessed = await storage.isWebhookEventProcessed(event.id);
      if (alreadyProcessed) {
        console.log(`✅ [${environment}] Event ${event.id} already processed - returning success`);
        return res.status(200).json({ received: true, idempotent: true });
      }

      // Record the webhook event for idempotency (this prevents duplicate processing)
      const eventCreated = await storage.createWebhookEvent(event.id, event.type, event.account as string);
      if (!eventCreated) {
        console.log(`✅ [${environment}] Event ${event.id} already being processed - returning success`);
        return res.status(200).json({ received: true, concurrent: true });
      }

      // Process the webhook event
      try {
        await processWebhookEvent(event, environment);
        
        // Mark as successfully processed
        await storage.markWebhookEventProcessed(event.id);
        console.log(`✅ [${environment}] Successfully processed webhook ${event.id}`);
        
        res.status(200).json({ received: true, processed: true });
        
      } catch (processingError: any) {
        // Mark as failed but don't throw - we've received the webhook successfully
        await storage.markWebhookEventFailed(event.id, processingError.message);
        console.error(`❌ [${environment}] Failed to process webhook ${event.id}:`, processingError.message);
        
        // Return 200 to prevent Stripe from retrying, but log the processing failure
        res.status(200).json({ received: true, processed: false, error: 'Processing failed' });
      }

    } catch (error: any) {
      console.error(`💥 [${environment}] Critical webhook error for event ${eventId}:`, error.message);
      
      // For critical errors (signature verification, etc.), return 400 to prevent retries
      res.status(400).json({ 
        error: 'Webhook processing failed',
        eventId: eventId !== 'unknown' ? eventId : undefined
      });
    }
  });

  // Helper function to process webhook events
  async function processWebhookEvent(event: Stripe.Event, environment: string): Promise<void> {
    switch (event.type) {
      case 'account.updated':
        const account = event.data.object as Stripe.Account;
        
        // Find driver with this connected account ID
        const driver = await storage.getDriverByConnectedAccountId(account.id);
        if (!driver) {
          console.warn(`⚠️ [${environment}] No driver found for connected account ${account.id}`);
          return;
        }

        console.log(`📦 [${environment}] Account ${account.id} updated for driver ${driver.id}`);
        console.log(`   Charges enabled: ${account.charges_enabled}`);
        console.log(`   Payouts enabled: ${account.payouts_enabled}`);
        console.log(`   Details submitted: ${account.details_submitted}`);
        
        // Send appropriate notifications based on account status
        if (account.payouts_enabled && account.details_submitted) {
          await storage.createNotification({
            userId: driver.userId,
            title: "Bank Account Connected",
            message: "Your bank account has been successfully connected and verified. You can now receive payments!",
            type: "success"
          });
        } else if (account.requirements?.currently_due && account.requirements.currently_due.length > 0) {
          await storage.createNotification({
            userId: driver.userId,
            title: "Account Setup Required",
            message: "Please complete your bank account setup to receive payments.",
            type: "warning"
          });
        }
        
        break;

      case 'account.application.deauthorized':
        // Account was disconnected
        const disconnectedAccount = event.data.object as any;
        const disconnectedDriver = await storage.getDriverByConnectedAccountId(disconnectedAccount.id);
        if (disconnectedDriver) {
          await storage.updateDriver(disconnectedDriver.id, { connectedAccountId: null });
          await storage.createNotification({
            userId: disconnectedDriver.userId,
            title: "Bank Account Disconnected",
            message: "Your bank account has been disconnected. Please reconnect to receive payments.",
            type: "error"
          });
          console.log(`🔗 [${environment}] Disconnected account ${disconnectedAccount.id} for driver ${disconnectedDriver.id}`);
        }
        break;

      // Subscription lifecycle events
      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as Stripe.Invoice;
        const failedCustomerId = failedInvoice.customer as string;
        
        const ownerFailed = await storage.getOwnerByStripeCustomerId(failedCustomerId);
        if (ownerFailed) {
          console.log(`💳 [${environment}] Payment failed for owner ${ownerFailed.id} - starting grace period`);
          
          // Update owner to past_due status (this triggers grace period logic in storage)
          await storage.updateOwnerSubscription(ownerFailed.id, 'past_due');
          
          // Send notification
          await storage.createNotification({
            userId: ownerFailed.user.id,
            title: "Payment Failed - Grace Period Started",
            message: "Your payment failed. You have 7 days to update your payment method before service is suspended.",
            type: "error"
          });
        }
        break;

      case 'invoice.payment_succeeded':
        const succeededInvoice = event.data.object as Stripe.Invoice;
        const succeededCustomerId = succeededInvoice.customer as string;
        
        const ownerSucceeded = await storage.getOwnerByStripeCustomerId(succeededCustomerId);
        if (ownerSucceeded && ownerSucceeded.subscriptionStatus === 'past_due') {
          console.log(`✅ [${environment}] Payment succeeded for owner ${ownerSucceeded.id} - clearing grace period`);
          
          // Update owner to active status (this clears grace period fields)
          await storage.updateOwnerSubscription(ownerSucceeded.id, 'active');
          
          // Send notification
          await storage.createNotification({
            userId: ownerSucceeded.user.id,
            title: "Payment Successful",
            message: "Your payment was processed successfully. Your service is now active.",
            type: "success"
          });
        }
        break;

      case 'customer.subscription.updated':
        const updatedSubscription = event.data.object as Stripe.Subscription;
        const updatedCustomerId = updatedSubscription.customer as string;
        
        const ownerUpdated = await storage.getOwnerByStripeCustomerId(updatedCustomerId);
        if (ownerUpdated) {
          const newStatus = updatedSubscription.status === 'active' ? 'active' : 
                           updatedSubscription.status === 'past_due' ? 'past_due' : 
                           'inactive';
          
          // Convert Stripe timestamp to Date - use type assertion for current_period_end
          const subscription = updatedSubscription as any;
          const subscriptionEndsAt = subscription.current_period_end ? 
            new Date(subscription.current_period_end * 1000) : 
            (subscription.items?.data?.[0]?.current_period_end ? 
              new Date(subscription.items.data[0].current_period_end * 1000) : undefined);
          
          console.log(`🔄 [${environment}] Subscription updated for owner ${ownerUpdated.id}: ${ownerUpdated.subscriptionStatus} → ${newStatus}, ends at: ${subscriptionEndsAt?.toISOString()}`);
          
          if (ownerUpdated.subscriptionStatus !== newStatus || subscriptionEndsAt) {
            await storage.updateOwnerSubscription(ownerUpdated.id, newStatus, undefined, subscriptionEndsAt);
            
            if (newStatus === 'active') {
              await storage.createNotification({
                userId: ownerUpdated.user.id,
                title: "Subscription Reactivated",
                message: "Your subscription is now active. All features are available.",
                type: "success"
              });
            }
          }
        }
        break;

      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object as Stripe.Subscription;
        const deletedCustomerId = deletedSubscription.customer as string;
        
        const ownerDeleted = await storage.getOwnerByStripeCustomerId(deletedCustomerId);
        if (ownerDeleted) {
          console.log(`❌ [${environment}] Subscription cancelled for owner ${ownerDeleted.id}`);
          
          await storage.updateOwnerSubscription(ownerDeleted.id, 'inactive');
          
          await storage.createNotification({
            userId: ownerDeleted.user.id,
            title: "Subscription Cancelled",
            message: "Your subscription has been cancelled. Please resubscribe to continue using the service.",
            type: "warning"
          });
        }
        break;

      // Daily batch payment processing events  
      case 'payment_intent.succeeded':
        const succeededPaymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // Check if this is a batch payment (metadata should contain batchId)
        if (succeededPaymentIntent.metadata?.batchId) {
          const batchId = succeededPaymentIntent.metadata.batchId;
          console.log(`✅ [${environment}] Batch payment succeeded for batch ${batchId}, PaymentIntent: ${succeededPaymentIntent.id}`);
          
          try {
            // Get batch details to verify it exists and is in processing state
            const batch = await storage.getBillingBatch(batchId);
            if (!batch) {
              console.warn(`⚠️ [${environment}] Batch ${batchId} not found for successful payment ${succeededPaymentIntent.id}`);
              return;
            }

            if (batch.status === 'completed') {
              console.log(`ℹ️ [${environment}] Batch ${batchId} already completed - webhook may be duplicate`);
              return;
            }

            // Complete the batch payment processing
            await storage.completeBatchPayment(batchId, succeededPaymentIntent.id);
            
            console.log(`🎉 [${environment}] Successfully completed batch payment processing for batch ${batchId}`);
            
          } catch (error: any) {
            console.error(`❌ [${environment}] Error processing successful batch payment ${succeededPaymentIntent.id}:`, error);
            // Update batch status to failed
            await storage.updateBillingBatchStatus(
              batchId, 
              'failed', 
              succeededPaymentIntent.id, 
              `Webhook processing error: ${error.message}`
            );
          }
        } else {
          console.log(`ℹ️ [${environment}] PaymentIntent ${succeededPaymentIntent.id} succeeded but no batchId in metadata - likely not a batch payment`);
        }
        break;

      case 'payment_intent.payment_failed':
        const failedPaymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // Check if this is a batch payment
        if (failedPaymentIntent.metadata?.batchId) {
          const batchId = failedPaymentIntent.metadata.batchId;
          const failureReason = failedPaymentIntent.last_payment_error?.message || 'Payment failed without specific error';
          
          console.error(`❌ [${environment}] Batch payment failed for batch ${batchId}, PaymentIntent: ${failedPaymentIntent.id}, Reason: ${failureReason}`);
          
          try {
            // Update batch status to failed
            await storage.updateBillingBatchStatus(
              batchId, 
              'failed', 
              failedPaymentIntent.id, 
              failureReason
            );

            // Get batch details to notify affected drivers
            const batch = await storage.getBillingBatch(batchId);
            if (batch) {
              // Get the owner's information for notifications
              const owner = await storage.getOwner(batch.ownerId);
              if (owner) {
                await storage.createNotification({
                  userId: owner.userId,
                  title: "Daily Billing Failed",
                  message: `Your daily payment of $${batch.totalAmount} failed: ${failureReason}. Please check your payment method.`,
                  type: "error"
                });
              }
            }

            console.log(`📝 [${environment}] Updated batch ${batchId} status to failed due to payment failure`);
            
          } catch (error: any) {
            console.error(`❌ [${environment}] Error processing failed batch payment ${failedPaymentIntent.id}:`, error);
          }
        } else {
          console.log(`ℹ️ [${environment}] PaymentIntent ${failedPaymentIntent.id} failed but no batchId in metadata - likely not a batch payment`);
        }
        break;

      default:
        console.log(`ℹ️ [${environment}] Unhandled event type: ${event.type} - safely ignored`);
    }
  }

  // Mock onboarding endpoint for development
  app.get('/api/stripe/connect/mock-onboarding', async (req, res) => {
    const { account } = req.query;
    res.send(`
      <html>
        <head><title>Mock Stripe Onboarding</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>🏦 Mock Bank Account Setup</h1>
          <p>Account ID: <code>${account}</code></p>
          <p>In a real environment, this would be Stripe's onboarding flow.</p>
          <button onclick="window.location.href='/driver/profile?setup=complete'" 
                  style="background: #6772e5; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">
            Complete Setup (Mock)
          </button>
        </body>
      </html>
    `);
  });

  // ==================== DAILY BATCH PROCESSING API ENDPOINTS ====================
  
  // Get owner's billing batches with optional date filtering
  app.get('/api/owners/billing/batches', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const batches = await storage.getBillingBatchesByOwner(owner.id, start, end);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching billing batches:", error);
      res.status(500).json({ message: "Failed to fetch billing batches" });
    }
  });

  // Get specific batch details with payments
  app.get('/api/owners/billing/batches/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const batch = await storage.getBillingBatch(id);
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }

      // Verify owner has access to this batch
      if (batch.ownerId !== owner.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get payments for this batch
      const batchPayments = await storage.getPaymentsByBatchId(id);
      
      res.json({
        ...batch,
        payments: batchPayments
      });
    } catch (error) {
      console.error("Error fetching batch details:", error);
      res.status(500).json({ message: "Failed to fetch batch details" });
    }
  });

  // Get owner's billing settings
  app.get('/api/owners/billing/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const billingSettings = await storage.getOwnerBillingSettings(owner.id);
      res.json(billingSettings);
    } catch (error) {
      console.error("Error fetching billing settings:", error);
      res.status(500).json({ message: "Failed to fetch billing settings" });
    }
  });

  // Update owner's billing settings
  app.put('/api/owners/billing/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { billingCadence, billingCutoffTime, billingTimezone } = req.body;
      
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Validate cutoff time format (HH:MM:SS)
      if (billingCutoffTime && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(billingCutoffTime)) {
        return res.status(400).json({ message: "Invalid cutoff time format. Use HH:MM:SS (24-hour format)" });
      }

      // Validate timezone (basic check)
      if (billingTimezone) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: billingTimezone });
        } catch (error) {
          return res.status(400).json({ message: "Invalid timezone" });
        }
      }

      // Validate billing cadence
      if (billingCadence && !['daily', 'weekly', 'monthly'].includes(billingCadence)) {
        return res.status(400).json({ message: "Invalid billing cadence. Must be daily, weekly, or monthly" });
      }

      const updatedOwner = await storage.updateOwnerBillingSettings(owner.id, {
        billingCadence,
        billingCutoffTime,
        billingTimezone
      });

      console.log(`✅ Updated billing settings for owner ${owner.id}: cutoff=${billingCutoffTime}, timezone=${billingTimezone}`);
      
      res.json({
        message: "Billing settings updated successfully",
        settings: {
          billingCadence: updatedOwner.billingCadence,
          billingCutoffTime: updatedOwner.billingCutoffTime,
          billingTimezone: updatedOwner.billingTimezone
        }
      });
    } catch (error) {
      console.error("Error updating billing settings:", error);
      res.status(500).json({ message: "Failed to update billing settings" });
    }
  });

  // Trigger manual batch processing for current business date (admin/testing endpoint)
  app.post('/api/admin/billing/process-batches', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { businessDate, dryRun = false } = req.body;
      const cutoffDate = businessDate || new Date().toISOString().split('T')[0];

      console.log(`🔄 Admin triggered ${dryRun ? 'DRY RUN' : 'manual'} batch processing for ${cutoffDate}`);
      
      const results = dryRun 
        ? await storage.getDryRunBatchPreview(cutoffDate)
        : await storage.processDailyBatches(cutoffDate);
      
      res.json({
        message: dryRun ? "Dry run completed" : "Batch processing completed",
        businessDate: cutoffDate,
        dryRun,
        results
      });
    } catch (error) {
      console.error("Error processing batches:", error);
      res.status(500).json({ message: "Failed to process batches" });
    }
  });

  // Get batch processing status for all owners (admin endpoint)
  app.get('/api/admin/billing/batches/status', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status = 'processing' } = req.query;
      
      const batches = await storage.getBillingBatchesByStatus(status as string);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching batch status:", error);
      res.status(500).json({ message: "Failed to fetch batch status" });
    }
  });

  // Get pending payments summary for current business date
  app.get('/api/owners/billing/pending-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Get current business date in owner's timezone
      const billingSettings = await storage.getOwnerBillingSettings(owner.id);
      const timezone = billingSettings?.billingTimezone || 'America/Chicago';
      const ownerTime = new Date().toLocaleString('en-US', { timeZone: timezone });
      const businessDate = new Date(ownerTime).toISOString().split('T')[0];

      const pendingPayments = await storage.getPendingPaymentsForBatch(owner.id, businessDate);
      
      const summary = {
        businessDate,
        timezone,
        cutoffTime: billingSettings?.billingCutoffTime || '23:59:00',
        pendingPayments: pendingPayments.length,
        totalAmount: pendingPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toFixed(2),
        totalFees: pendingPayments.reduce((sum, p) => sum + parseFloat(p.processingFee), 0).toFixed(2),
        payments: pendingPayments.map(p => ({
          id: p.id,
          amount: p.amount,
          processingFee: p.processingFee,
          driver: `${p.driver.user.firstName} ${p.driver.user.lastName}`,
          activity: {
            checkInTime: p.activity.checkInTime,
            amount: p.activity.amount
          }
        }))
      };

      res.json(summary);
    } catch (error) {
      console.error("Error fetching pending summary:", error);
      res.status(500).json({ message: "Failed to fetch pending summary" });
    }
  });

  // ==================== PLATFORM PERFORMANCE ANALYTICS ROUTES ====================
  
  // Get comprehensive platform performance analytics (query param version)
  app.get('/api/admin/platform-performance', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { days = '30' } = req.query;
      const dayCount = parseInt(days as string);

      if (isNaN(dayCount) || dayCount < 1 || dayCount > 365) {
        return res.status(400).json({ message: "Days must be between 1 and 365" });
      }

      const performanceStats = await storage.getPlatformPerformanceStats(dayCount);
      
      res.json({
        dateRange: dayCount,
        ...performanceStats
      });

    } catch (error) {
      console.error("Error fetching platform performance:", error);
      res.status(500).json({ message: "Failed to fetch platform performance data" });
    }
  });

  // Get comprehensive platform performance analytics (path param version for compatibility)
  app.get('/api/admin/platform-performance/:days', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dayCount = parseInt(req.params.days);

      if (isNaN(dayCount) || dayCount < 1 || dayCount > 365) {
        return res.status(400).json({ message: "Days must be between 1 and 365" });
      }

      const performanceStats = await storage.getPlatformPerformanceStats(dayCount);
      
      res.json({
        dateRange: dayCount,
        ...performanceStats
      });

    } catch (error) {
      console.error("Error fetching platform performance:", error);
      res.status(500).json({ message: "Failed to fetch platform performance data" });
    }
  });

  // ==================== SUBSCRIPTION MANAGEMENT ROUTES ====================
  
  // Process expired grace periods (can be called by cron job or periodically)
  app.post('/api/admin/process-grace-periods', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Get owners with expired grace periods (7 days past due)
      const expiredOwners = await storage.getOwnersWithExpiredGracePeriod();
      let processedCount = 0;

      for (const owner of expiredOwners) {
        try {
          // Deactivate the subscription
          await storage.updateOwnerSubscription(owner.id, 'inactive');
          
          // Send final notification
          await storage.createNotification({
            userId: owner.userId,
            title: "Subscription Suspended",
            message: "Your 7-day grace period has expired. Your subscription has been suspended. Please update your payment method to reactivate.",
            type: "error"
          });

          console.log(`🔒 Deactivated subscription for owner ${owner.id} - grace period expired`);
          processedCount++;
        } catch (error) {
          console.error(`Error processing expired owner ${owner.id}:`, error);
        }
      }

      // Get owners needing renewal reminders
      const remindersNeeded = await storage.getOwnersNeedingReminders();
      let remindersSent = 0;

      for (const owner of remindersNeeded) {
        try {
          // Send reminder notification
          await storage.createNotification({
            userId: owner.userId,
            title: "Subscription Renewal Reminder",
            message: "Your subscription will expire in 7 days. Please ensure your payment method is up to date.",
            type: "warning"
          });

          // Update reminder sent timestamp
          await storage.updateOwnerReminderSent(owner.id);
          remindersSent++;
        } catch (error) {
          console.error(`Error sending reminder to owner ${owner.id}:`, error);
        }
      }

      res.json({
        success: true,
        expiredProcessed: processedCount,
        remindersSent,
        message: `Processed ${processedCount} expired subscriptions and sent ${remindersSent} renewal reminders`
      });

    } catch (error) {
      console.error("Error processing grace periods:", error);
      res.status(500).json({ message: "Failed to process grace periods" });
    }
  });

  // ==================== SUPERADMIN SERVICE PAYMENT ACCOUNT ROUTES ====================
  
  // Get all service payment accounts (superadmin only)
  app.get('/api/superadmin/service-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const accounts = await storage.getAllServicePaymentAccounts();
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching service payment accounts:", error);
      res.status(500).json({ message: "Failed to fetch service payment accounts" });
    }
  });

  // Create new service payment account (superadmin only)
  app.post('/api/superadmin/service-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Validate request body using Zod
      const result = insertServicePaymentAccountSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid service account data", 
          errors: result.error.issues 
        });
      }

      const accountData = {
        ...result.data,
        createdBy: user.id,
        updatedBy: user.id,
      };

      const newAccount = await storage.createServicePaymentAccount(accountData);
      res.status(201).json(newAccount);
    } catch (error) {
      console.error("Error creating service payment account:", error);
      res.status(500).json({ message: "Failed to create service payment account" });
    }
  });

  // Get specific service payment account (superadmin only)
  app.get('/api/superadmin/service-accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Validate UUID parameter
      const paramResult = uuidParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        return res.status(400).json({ 
          message: "Invalid account ID format", 
          errors: paramResult.error.issues 
        });
      }

      const account = await storage.getServicePaymentAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Service payment account not found" });
      }

      res.json(account);
    } catch (error) {
      console.error("Error fetching service payment account:", error);
      res.status(500).json({ message: "Failed to fetch service payment account" });
    }
  });

  // Update service payment account (superadmin only)
  app.put('/api/superadmin/service-accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Validate UUID parameter
      const paramResult = uuidParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        return res.status(400).json({ 
          message: "Invalid account ID format", 
          errors: paramResult.error.issues 
        });
      }

      // Validate request body using Zod
      const result = updateServicePaymentAccountSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid service account data", 
          errors: result.error.issues 
        });
      }

      const accountData = {
        ...result.data,
        updatedBy: user.id,
      };

      const updatedAccount = await storage.updateServicePaymentAccount(req.params.id, accountData);
      res.json(updatedAccount);
    } catch (error) {
      console.error("Error updating service payment account:", error);
      res.status(500).json({ message: "Failed to update service payment account" });
    }
  });

  // Delete service payment account (superadmin only)
  app.delete('/api/superadmin/service-accounts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Validate UUID parameter
      const paramResult = uuidParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        return res.status(400).json({ 
          message: "Invalid account ID format", 
          errors: paramResult.error.issues 
        });
      }

      const account = await storage.getServicePaymentAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Service payment account not found" });
      }

      if (account.isDefault) {
        return res.status(400).json({ message: "Cannot delete the default service payment account" });
      }

      await storage.deleteServicePaymentAccount(req.params.id);
      res.json({ message: "Service payment account deleted successfully" });
    } catch (error) {
      console.error("Error deleting service payment account:", error);
      res.status(500).json({ message: "Failed to delete service payment account" });
    }
  });

  // Set default service payment account (superadmin only)
  app.put('/api/superadmin/service-accounts/:id/set-default', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Validate UUID parameter
      const paramResult = uuidParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        return res.status(400).json({ 
          message: "Invalid account ID format", 
          errors: paramResult.error.issues 
        });
      }

      const account = await storage.getServicePaymentAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ message: "Service payment account not found" });
      }

      if (!account.isActive) {
        return res.status(400).json({ message: "Cannot set inactive account as default" });
      }

      const defaultAccount = await storage.setDefaultServicePaymentAccount(req.params.id);
      res.json(defaultAccount);
    } catch (error) {
      console.error("Error setting default service payment account:", error);
      res.status(500).json({ message: "Failed to set default service payment account" });
    }
  });

  // Photo presigned URL endpoint
  app.post('/api/objects/photos/sign', isAuthenticated, async (req: any, res) => {
    try {
      const { key } = req.body;
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ message: 'Photo key is required' });
      }

      // Validate user has access to this photo
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // For demo: Allow all authenticated users to access photos
      // In production: Add proper authorization checks here
      
      // Generate presigned URL for GET request with 2-minute expiry
      const signedUrl = await signObjectURL({
        bucketName: process.env.OBJECT_BUCKET_NAME!,
        objectName: key,
        method: 'GET',
        ttlSec: 120
      });

      res.json({ signedUrl });
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      res.status(500).json({ message: 'Failed to generate signed URL' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
