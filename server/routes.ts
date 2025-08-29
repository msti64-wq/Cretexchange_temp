import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./tokenAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertDriverSchema, insertOwnerSchema, insertWashoutLocationSchema, insertWashoutActivitySchema } from "@shared/schema";
import { z } from "zod";

// Initialize Stripe only if secret key is available
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil",
  });
} else {
  console.warn('STRIPE_SECRET_KEY not found - Stripe functionality will be disabled');
}

export async function registerRoutes(app: Express): Promise<Server> {
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
      
      // Update user role
      await storage.upsertUser({
        id: userId,
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
      
      // Update user role
      await storage.upsertUser({
        id: userId,
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

      res.json({
        dailyStats: {
          visits: todayActivities.length,
          earnings: dailyEarnings,
        },
        weeklyStats: weekStats,
        recentActivities,
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

      const activityData = insertWashoutActivitySchema.parse({
        driverId: driver.id,
        locationId: location.id,
        amount: location.rate,
        checkInTime: new Date(),
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        photoUrls: req.body.photoUrls || [],
        notes: req.body.notes,
      });

      const activity = await storage.createWashoutActivity(activityData);
      res.json(activity);
    } catch (error) {
      console.error("Error checking in:", error);
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
        };
        driver = await storage.createDriver(driverData);
      } else {
        // Update existing driver record
        driver = await storage.updateDriver(driver.id, {
          employerName: req.body.employerName || driver.employerName,
          employerAddress: req.body.employerAddress || driver.employerAddress,
          employerPhone: req.body.employerPhone || driver.employerPhone,
          licenseNumber: req.body.licenseNumber || driver.licenseNumber,
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
      const recentActivities = await storage.getActivitiesByOwner(owner.id);

      res.json({
        weekStats,
        monthStats,
        locations: locations.length,
        recentActivities: recentActivities.slice(0, 10),
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
      const { rate } = req.body;

      const location = await storage.updateLocationRate(id, rate);
      res.json(location);
    } catch (error) {
      console.error("Error updating rate:", error);
      res.status(500).json({ message: "Failed to update rate" });
    }
  });

  app.get('/api/owners/activities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // For end date, set to end of day (23:59:59.999) to include all activities on that date
      const end = endDate ? new Date(new Date(endDate as string).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;

      const activities = await storage.getActivitiesByOwner(owner.id, start, end);
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

      const activity = await storage.verifyWashoutActivity(id, userId);
      res.json(activity);
    } catch (error) {
      console.error("Error verifying activity:", error);
      res.status(500).json({ message: "Failed to verify activity" });
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

  // Owner subscription
  app.post('/api/owners/subscribe', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      const owner = await storage.getOwner(userId);

      if (!user || !owner) {
        return res.status(404).json({ message: "User or owner not found" });
      }

      if (owner.subscriptionStatus === 'active') {
        return res.json({ message: "Already subscribed" });
      }

      // Check if Stripe is available
      if (!stripe) {
        // For development, just mark as active without payment processing
        await storage.updateOwnerSubscription(owner.id, 'active', 'dev_subscription_' + Date.now());
        return res.json({ 
          subscriptionId: 'dev_subscription', 
          clientSecret: 'dev_client_secret',
          message: "Development mode: Subscription activated without payment processing"
        });
      }

      if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email!,
          name: `${user.firstName} ${user.lastName}`,
        });
        
        await storage.updateUserStripeInfo(userId, customer.id);
        user.stripeCustomerId = customer.id;
      }

      const subscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{
          price: process.env.STRIPE_PRICE_ID || 'price_default',
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      await storage.updateOwnerSubscription(owner.id, 'active', subscription.id);

      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Admin endpoints
  app.get('/api/admin/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
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
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const drivers = await storage.getAllDrivers();
      const owners = await storage.getAllOwners();

      res.json({ drivers, owners });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/admin/locations', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin') {
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
      if (user?.role !== 'admin') {
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
      if (user?.role !== 'admin') {
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

  // Object storage endpoints for photo uploads
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
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
          if (user?.role !== 'admin') {
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

  const httpServer = createServer(app);
  return httpServer;
}
