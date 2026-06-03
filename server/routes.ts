import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { washoutActivities, withdrawals, walletTransactions, driverWallets, owners, ownerFundingSources, debitCardRequests, ownerWalletTransactions, balanceReconciliations, users, payments } from "../shared/schema";
import { db } from "./db";
import { setupAuth, isAuthenticated } from "./tokenAuth";
import { getJwtSecret } from "./jwtSecret";
import { ObjectStorageService, ObjectNotFoundError, getDefaultObjectStorageBucketName, getPhotoReadProviderSelection, getPhotoUploadProviderSelection, objectStorageClient, signObjectURL, signUploadObjectURL } from "./objectStorage";
import { ObjectPermission, setObjectAclPolicy, getObjectAclPolicy, ObjectAclPolicy, ObjectAccessGroupType, canAccessObject } from "./objectAcl";
import { insertDriverSchema, insertOwnerSchema, insertWashoutLocationSchema, insertWashoutActivitySchema, withdrawalRequestSchema, walletTransactionQuerySchema, adminWithdrawalUpdateSchema, updateLocationRateSchema, updateLocationStatusSchema, updateLocationSchema, insertServicePaymentAccountSchema, updateServicePaymentAccountSchema, uuidParamSchema, superAdminEmailUpdateSchema, dateRangeSchema, ownerActivitiesQuerySchema, columnOnboardingSchema, driverPayoutRequestSchema, activateMembershipSchema } from "@shared/schema";
import type { Driver, FeeLedger, FeatureFlag, LocationMaterialIntent, Notification, Owner, OwnerFundingSource, Payment, PendingWashoutPayment, User, WalletTransaction, WashoutActivity, WashoutLocation, WashoutPhoto, Withdrawal } from "@shared/schema";
import { eq, sql, desc, and, isNotNull } from "drizzle-orm";
import { z } from "zod";
import * as stripeService from "./stripeService";
import stripeClient from "./stripeService";
import { geocodeAddress } from "./geocoding";
import { evaluatePhotoVerification } from "@shared/photoVerification";
import {
  findLikelyDuplicatePhotoMatches,
  PHOTO_DUPLICATE_LOOKBACK_DAYS,
  type PhotoFingerprintCandidate,
} from "@shared/photoFingerprint";
import { evaluatePhotoFreshness } from "@shared/photoFreshness";
import { summarizeDatabaseError } from "./dbErrors";
import {
  ensureCurrentTermsVersions,
  getTermsStateForUser,
  parseTermsTypes,
  recordCurrentTermsAcceptance,
  requireCurrentTerms,
} from "./terms";
import { TERMS_TYPES } from "@shared/terms";
import { DEFAULT_LOCATION_MONTHLY_FEE_CENTS, resolveLocationMonthlyFeeCents, resolveLocationDriverIncentiveTipCents } from "./locationBilling";
import {
  resolveOwnerBillingPolicy,
  getActiveBillingPolicyLabels,
  resolvePlatformFeeCents,
  calculateOwnerWashoutChargeCents,
  calculateDriverPayoutCents,
} from "./billingPolicy";
import { processOwnerBillingRun } from "./ownerBillingRuns";
import { LOTTERY_FEATURE_FLAG_KEY, resolveLotteryEnabled } from "./lottery";
import { resolveOwnerMembershipState } from "../shared/ownerMembership";
import { resolveOwnerLocationAccessState } from "../shared/ownerLocationAccess";
import { isPendingWashoutApproval, getWashoutApprovalDisplayStatus } from "../shared/washoutApproval";
import { isAwaitingDriverStripePaymentStatus, getDriverStripeSetupMessage } from "../shared/driverPaymentStatus";
import {
  buildDriverReport,
  buildOwnerReport,
  reportResponseToCsv,
  reportResponseToJsonWithColumns,
  type ReportQueryInput,
} from "./reportService";
import {
  buildBillingAuditReport,
  billingAuditReportToCsv,
  billingAuditReportToJson,
  billingAuditReportToPdfBuffer,
} from "./billingAuditReport";
import type { BillingAuditReportQueryInput } from "../shared/billingAuditReport";

const JWT_SECRET = getJwtSecret();
const MAX_PHOTO_UPLOAD_BYTES = 15 * 1024 * 1024;
const SUPPORTED_PHOTO_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type QueuedPendingWashoutPayment = PendingWashoutPayment & {
  activity: WashoutActivity;
  driver: Driver & { user: User };
  owner: Owner & { user: User };
};

type OwnerWithUser = Owner & { user: User };
type DriverWithUser = Driver & { user: User };
type ExpiredPendingActivity = WashoutActivity & { location: WashoutLocation; driver: DriverWithUser };
type AdminWithdrawal = Withdrawal & { driver: DriverWithUser };
type BatchPayment = Payment & { activity: WashoutActivity; driver: DriverWithUser };
type RubbleLocationWithIntents = WashoutLocation & {
  owner: OwnerWithUser;
  materialIntents: LocationMaterialIntent[];
};

type LotteryWinnerSummary = {
  place: number;
  driverId: string;
  driverName: string;
  ticketNumber: string | null;
  payoutPreference: string | null;
  prize?: string | null;
};

type DriverStripeReadiness = {
  ready: boolean;
  reason?: string;
  accountId?: string;
};

type LotteryStatusSnapshot = {
  enabled: boolean;
  source: "env" | "flag" | "default";
  currentMonth: number;
  currentYear: number;
  currentDrawing: any | null;
  driverEntryCount?: number;
  currentDrawingMessage: string;
};

function buildLotteryWinnerMessage(winner: LotteryWinnerSummary, monthName: string, year: number): { title: string; message: string } {
  const placeLabel = winner.place === 1 ? "1st Place" : winner.place === 2 ? "2nd Place" : "3rd Place";
  const prizeText = winner.prize ? ` Your prize: ${winner.prize}.` : "";
  return {
    title: `🎉 You Won ${placeLabel} in the ${monthName} ${year} Lottery!`,
    message: `Congratulations! Your ticket ${winner.ticketNumber || ""} was selected as the ${placeLabel} winner of the ${monthName} ${year} lottery.${prizeText} We will be in touch soon to arrange your prize delivery. Thank you for being part of CreteXchange!`,
  };
}

async function buildLotteryStatusSnapshot(driverId?: string): Promise<LotteryStatusSnapshot> {
  const resolution = await resolveLotteryEnabled(storage);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentDrawing = await storage.getLotteryDrawingByMonthYear(currentMonth, currentYear);
  const driverEntryCount = driverId
    ? await storage.getDriverLotteryEntryCount(driverId)
    : undefined;

  return {
    enabled: resolution.enabled,
    source: resolution.source,
    currentMonth,
    currentYear,
    currentDrawing: currentDrawing ?? null,
    driverEntryCount,
    currentDrawingMessage: resolution.enabled
      ? currentDrawing
        ? `Current drawing is open for ${new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${currentYear}.`
        : `Lottery is active for ${new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${currentYear}, but no drawing has been posted yet.`
      : 'Lottery is currently disabled by an administrator.',
  };
}

async function resolveDriverStripeReadiness(driverUser: User): Promise<DriverStripeReadiness> {
  if (!stripe) {
    return { ready: false, reason: "Stripe not configured" };
  }

  if (!driverUser.stripeConnectAccountId) {
    return { ready: false, reason: "Driver missing Stripe Connect account" };
  }

  try {
    const driverAccount = await stripe.accounts.retrieve(driverUser.stripeConnectAccountId);
    const transfersCapability = driverAccount.capabilities?.transfers;

    if (transfersCapability !== 'active') {
      return {
        ready: false,
        reason: `Driver transfers capability ${transfersCapability || 'inactive'}`,
        accountId: driverAccount.id,
      };
    }

    return { ready: true, accountId: driverAccount.id };
  } catch (error: any) {
    console.error('❌ Failed to inspect driver Stripe account readiness:', {
      driverUserId: driverUser.id,
      stripeConnectAccountId: driverUser.stripeConnectAccountId,
      error: error?.message,
    });
    return {
      ready: false,
      reason: `Unable to verify driver Stripe readiness: ${error?.message || 'unknown error'}`,
    };
  }
}

function resolveWashoutChargeComponents(params: {
  owner: Owner;
  location: WashoutLocation | null | undefined;
  systemSettings: { platformWashoutFee?: string | null } | null | undefined;
  baseAmount: number;
}) {
  const { owner, location, systemSettings, baseAmount } = params;
  const platformFee = owner.customPlatformFee !== null && owner.customPlatformFee !== undefined
    ? resolvePlatformFeeCents(owner.customPlatformFee)
    : resolvePlatformFeeCents(systemSettings?.platformWashoutFee);
  const driverTipCents = resolveLocationDriverIncentiveTipCents(location?.driverIncentiveTip);
  const ownerChargeCents = calculateOwnerWashoutChargeCents(baseAmount * 100, platformFee, driverTipCents);
  const driverPayoutCents = calculateDriverPayoutCents(baseAmount * 100, driverTipCents);

  return {
    platformFeeCents: platformFee,
    driverTipCents,
    ownerChargeCents,
    driverPayoutCents,
    platformFee: platformFee / 100,
    driverTip: driverTipCents / 100,
    ownerCharge: ownerChargeCents / 100,
    driverPayout: driverPayoutCents / 100,
  };
}

async function finalizeChargedWashoutPayment(params: {
  paymentId: string;
  paymentIntentId: string;
  owner: Owner;
  driver: Driver;
  driverUser: User;
  activityId: string;
  activityLocation?: WashoutLocation | null;
  ownerFee: number;
  driverAmount: number;
  platformFee: number;
  useCustomBillingModel: boolean;
  activityDetails: WashoutActivity;
  businessDate: string;
}) {
  const {
    paymentId,
    paymentIntentId,
    owner,
    driver,
    driverUser,
    activityId,
    activityLocation,
    ownerFee,
    driverAmount,
    platformFee,
    useCustomBillingModel,
    activityDetails,
    businessDate,
  } = params;

  await storage.updatePaymentStatus(paymentId, 'completed', paymentIntentId);
  await db
    .update(payments)
    .set({
      payoutStatus: 'completed',
      updatedAt: new Date(),
    })
    .where(eq(payments.id, paymentId));

  try {
    console.log(`📝 Creating owner wallet transaction for washout ${activityId}:`, {
      ownerId: owner.id,
      type: 'washout_charge',
      amount: ownerFee.toFixed(2),
      paymentId,
    });
    
    const [insertedTxn] = await db.insert(ownerWalletTransactions).values({
      ownerId: owner.id,
      type: 'washout_charge',
      amount: ownerFee.toFixed(2),
      balanceBefore: "0.00",
      balanceAfter: "0.00",
      description: `Washout payment - ${driverUser?.username || 'Driver'} at ${activityLocation?.name || 'Location'}`,
      paymentId,
    }).returning();
    
    console.log(`✅ Owner wallet transaction recorded for washout ${activityId}, transaction ID: ${insertedTxn?.id}`);
  } catch (txnError: any) {
    console.error(`❌ Failed to record owner wallet transaction for washout ${activityId}:`, txnError);
    console.error(`   Error message: ${txnError.message}`);
    console.error(`   Owner ID: ${owner.id}, Payment ID: ${paymentId}`);
  }
  
  if (useCustomBillingModel && activityDetails.serviceType !== 'rubble_dropoff') {
    try {
        const lotteryFlag = await storage.getFeatureFlag(LOTTERY_FEATURE_FLAG_KEY);
      const lotteryEnabled = lotteryFlag?.enabled ?? false;
      if (lotteryEnabled) {
        const lotteryEntry = await storage.createDriverLotteryEntry({
          driverId: driver.id,
          activityId,
          ownerId: owner.id,
          entriesEarned: 1,
        });
        console.log(`🎰 Lottery entry created for driver ${driver.id}, entry ID: ${lotteryEntry.id}`);
      } else {
        console.log(`🎰 Lottery program disabled — no entry created for driver ${driver.id} on washout ${activityId}`);
      }
    } catch (lotteryError: any) {
      console.error(`❌ Failed to create lottery entry for washout ${activityId}:`, lotteryError);
    }
  } else {
    let driverWallet = await storage.getDriverWallet(driver.id);
    if (!driverWallet) {
      await storage.createDriverWallet({ driverId: driver.id });
    }
    
    await storage.adjustDriverWalletBalance(driver.id, driverAmount, 0);
    
    const updatedWallet = await storage.getDriverWallet(driver.id);
    const newBalance = parseFloat(updatedWallet?.availableBalance || "0");
    
    await storage.createWalletTransaction({
      driverId: driver.id,
      amount: driverAmount.toString(),
      direction: "credit",
      balanceAfter: newBalance.toString(),
      currency: "USD",
      sourceType: "washout",
      sourceId: activityId,
      status: "posted",
      description: `Washout payment for activity ${activityId}`,
    });
  }

  return {
    paymentId,
    paymentIntentId,
    businessDate,
    ownerFee,
    driverAmount,
    platformFee,
  };
}

function buildLotteryParticipantMessage(monthName: string, year: number, winners: LotteryWinnerSummary[], nextMonthName: string, nextYear: number): { title: string; message: string } {
  const winnerSummary = winners
    .map((winner) => {
      const placeLabel = winner.place === 1 ? "1st Place" : winner.place === 2 ? "2nd Place" : "3rd Place";
      return `${placeLabel} — ${winner.driverName}`;
    })
    .join("; ");

  return {
    title: `🎰 ${monthName} ${year} Lottery Drawing Complete!`,
    message: `The ${monthName} ${year} lottery drawing is complete. Winners: ${winnerSummary}. Thank you for participating. Every completed washout earns another entry for the next drawing in ${nextMonthName} ${nextYear}.`,
  };
}

// Initialize Stripe only if secret key is available
const stripe: Stripe = stripeService.stripe;

/**
 * Validate that an IP string is a valid IPv4 address
 * Checks format and ensures octets are strictly numeric and in valid range (0-255)
 * More lenient: accepts leading zeros and whitespace
 * @returns True if valid IPv4, false otherwise
 */
function isValidIPv4(ip: string): boolean {
  const trimmed = ip.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;
  
  for (const part of parts) {
    // Ensure each octet contains only digits (no letters or special chars)
    if (!/^\d+$/.test(part)) {
      return false;
    }
    
    const num = parseInt(part, 10);
    // Check if number is in valid range 0-255
    // Allow leading zeros (e.g., "192.001.001.001" is valid)
    if (isNaN(num) || num < 0 || num > 255) {
      return false;
    }
  }
  return true;
}

/**
 * Extract and normalize IPv4 address from Express request
 * Stripe requires valid IPv4 for TOS acceptance
 * @returns Valid IPv4 string or null if none found
 */
function extractIPv4(req: any): string | null {
  // Try x-forwarded-for header first (proxy/load balancer)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',');
    for (const ip of ips) {
      const trimmed = ip.trim();
      // Strip IPv6 prefix if present
      const normalized = trimmed.replace(/^::ffff:/, '');
      if (isValidIPv4(normalized)) {
        console.log('✅ IP detected from x-forwarded-for:', normalized);
        return normalized;
      }
    }
  }
  
  // Try req.ip (Express property)
  if (req.ip) {
    // Strip IPv6 prefix if present (e.g., "::ffff:192.168.1.1" → "192.168.1.1")
    const ip = req.ip.replace(/^::ffff:/, '').trim();
    if (isValidIPv4(ip)) {
      console.log('✅ IP detected from req.ip:', ip);
      return ip;
    }
  }
  
  // Try remoteAddress
  if (req.socket?.remoteAddress) {
    const ip = req.socket.remoteAddress.replace(/^::ffff:/, '').trim();
    if (isValidIPv4(ip)) {
      console.log('✅ IP detected from remoteAddress:', ip);
      return ip;
    }
  }
  
  // No valid IPv4 found - log for debugging
  console.warn('⚠️ No valid IPv4 found:', {
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'req.ip': req.ip,
    'remoteAddress': req.socket?.remoteAddress
  });
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Installation guide routes (with and without .html extension)
  const serveInstallationGuide = async (req: any, res: any) => {
    const fs = await import('fs');
    const path = await import('path');
    
    // Try multiple possible locations
    const locations = [
      path.join(process.cwd(), 'public', 'installation-guide.html'),
      path.join(process.cwd(), 'dist', 'public', 'installation-guide.html')
    ];
    
    for (const filePath of locations) {
      if (fs.existsSync(filePath)) {
        console.log('Serving installation guide from:', filePath);
        return res.sendFile(filePath);
      }
    }
    
    console.error('Installation guide not found in any location:', locations);
    res.status(404).send('Installation guide not found');
  };
  
  app.get('/installation-guide', serveInstallationGuide);
  app.get('/installation-guide.html', serveInstallationGuide);

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

  // Version check endpoint - helps verify which code version is deployed
  app.get('/api/version', (req, res) => {
    res.json({
      version: '2.1.0-wallet-transactions',
      buildTime: '2025-12-03T20:00:00Z',
      features: {
        ownerWalletTransactions: true,
        billingSettingsFixed: true,
        stripeConnectDestinationCharges: true,
      },
      environment: process.env.REPLIT_DEPLOYMENT ? 'production' : 'development',
    });
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
      
      res.json({
        environment,
        hasDatabaseUrl,
        databaseUrlPreview,
        userCount,
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
      let membershipState = null;
      let stripeOnboarding = null;

      if (user.role === 'owner') {
        owner = await storage.getOwner(user.id);
        if (owner) {
          membershipState = resolveOwnerMembershipState(owner);
          
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
          address: [user.street, user.city, user.state, user.zip].filter(Boolean).join(', ')
        },
        owner: owner ? {
          id: owner.id,
          companyName: owner.companyName,
          businessLicense: owner.businessLicense,
          taxId: owner.taxId,
          membershipStatus: membershipState?.membershipStatus || (owner.subscriptionStatus || 'inactive'),
          dashboardAccessAllowed: membershipState?.dashboardAccessAllowed ?? false,
          accountStatusMessage: membershipState?.accountStatusMessage || null,
        } : null,
        membershipState,
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
      const stats = (activities as Array<{ status: string }>).reduce((acc: { total: number; byStatus: Record<string, number> }, activity) => {
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
      ? `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || `${process.env.REPL_SLUG}.replit.app`}`
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
        const driverData = await storage.getDriver(userId);
        if (driverData) {
          // Sanitize sensitive bank account data - never send full account/routing numbers to frontend
          const { accountNumber, routingNumber, ...safeDriverData } = driverData;
          roleData = {
            ...safeDriverData,
            // Include only masked/last4 versions of sensitive data for display
            // Note: bankName is intentionally included for UX (e.g., "Chase ****1234")
            hasRoutingNumber: Boolean(routingNumber),
            hasAccountNumber: Boolean(accountNumber),
            accountNumberLast4: accountNumber ? accountNumber.slice(-4) : null,
          };
        }
      } else if (user.role === 'owner') {
        const ownerData = await storage.getOwner(userId);
        if (ownerData) {
          const ownerProfileState = resolveOwnerLocationAccessState(ownerData, user);
          roleData = {
            ...ownerData,
            profileCompleted: ownerProfileState.profileCompleted,
            missingProfileFields: ownerProfileState.missingProfileFields,
            missingProfileFieldLabels: ownerProfileState.missingProfileFieldLabels,
            paymentMethodOnFile: ownerProfileState.paymentMethodOnFile,
            locationSetupOverride: ownerProfileState.locationSetupOverride,
            canManageLocations: ownerProfileState.canManageLocations,
            locationSetupBlockingMessage: ownerProfileState.blockingMessage || null,
          };
        }
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
      
      // Create Stripe Connect account for driver (marketplace seller)
      let stripeConnectAccountId = existingUser.stripeConnectAccountId;
      if (!stripeConnectAccountId) {
        try {
          // Get real user IP for TOS acceptance compliance (Stripe requires IPv4)
          const userIp = extractIPv4(req);
          if (!userIp) {
            console.error('❌ Cannot create Stripe account: No valid IPv4 address found');
            return res.status(400).json({ 
              message: "Unable to complete registration: IP address detection failed. Please try again or contact support." 
            });
          }
          
          const stripeAccount = await stripeService.createConnectedAccount({
            userId: existingUser.id,
            username: existingUser.username,
            email: existingUser.email,
            type: 'express', // Express accounts for marketplace - auto-activate capabilities
            businessType: 'individual',
            capabilities: ['card_payments', 'transfers'],
            individual: {
              firstName: existingUser.firstName,
              lastName: existingUser.lastName,
              email: existingUser.email,
              phone: existingUser.phone || undefined
            },
            businessProfile: {
              mcc: '7542', // MCC for Car Washes (washout services)
              url: process.env.REPLIT_DEV_DOMAIN || 'https://creteexchange.com',
              supportEmail: process.env.SUPPORT_EMAIL || 'support@creteexchange.com'
            },
            tosAcceptance: {
              date: Math.floor(Date.now() / 1000),
              ip: userIp // Real user IPv4 for Stripe compliance
            }
          });
          stripeConnectAccountId = stripeAccount.id;
          console.log('✅ Created Stripe Connect account for driver:', stripeConnectAccountId, 'IP:', userIp);
        } catch (stripeError: any) {
          console.error('❌ Failed to create Stripe Connect account:', stripeError.message);
          return res.status(500).json({ 
            message: "Failed to create payment account. Please try again or contact support.",
            error: stripeError.message
          });
        }
      }
      
      await storage.upsertUser({
        ...existingUser,
        role: 'driver',
        stripeConnectAccountId,
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

  // General registration endpoint (handles both drivers and owners)
  app.post('/api/register', async (req: any, res) => {
    try {
      const { role, username, email, password, firstName, lastName, phone, street, city, state, zip } = req.body;

      // Validate required fields
      if (!role || !username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (role !== 'driver' && role !== 'owner') {
        return res.status(400).json({ message: "Invalid role. Must be 'driver' or 'owner'" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await storage.createUser({
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        street: street || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        role,
      });

      console.log(`User registered successfully: ${newUser.id}`);

      // Generate token for immediate login
      const token = jwt.sign(
        { userId: newUser.id, username: newUser.username },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        message: "Registration successful",
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
        }
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed: " + error.message });
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
      
      // Create Stripe Customer for owner (marketplace buyer)
      let stripeCustomerId = existingUser.stripeCustomerId;
      if (!stripeCustomerId && stripe) {
        try {
          const stripeCustomer = await stripe.customers.create({
            email: existingUser.email,
            name: `${existingUser.firstName} ${existingUser.lastName}`,
            metadata: {
              userId: existingUser.id,
              username: existingUser.username,
              role: 'owner'
            }
          });
          stripeCustomerId = stripeCustomer.id;
          console.log('✅ Created Stripe Customer for owner:', stripeCustomerId);
        } catch (stripeError: any) {
          console.error('❌ Failed to create Stripe Customer:', stripeError.message);
          // Continue without Stripe customer - can be created later
        }
      } else if (!stripe) {
        console.log('⚠️ Stripe not initialized - skipping customer creation (development mode)');
      }
      
      await storage.upsertUser({
        ...existingUser,
        role: 'owner',
        stripeCustomerId,
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

  // Get Stripe onboarding status
  app.get('/api/column/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let isOnboarded = false;
      let entityId: string | null = null;
      let bankAccountId: string | null = null;
      let accountLast4: string | null = null;

      // Check user's Stripe Connect Account ID (stored on users table)
      if (user.stripeConnectAccountId) {
        isOnboarded = true;
        entityId = user.stripeConnectAccountId;
      }

      // Get Treasury account ID from role-specific table
      if (user.role === 'driver') {
        const driver = await storage.getDriver(userId);
        if (driver?.stripeTreasuryAccountId) {
          bankAccountId = driver.stripeTreasuryAccountId;
        }
      } else if (user.role === 'owner') {
        const owner = await storage.getOwner(userId);
        if (owner?.stripeTreasuryAccountId) {
          bankAccountId = owner.stripeTreasuryAccountId;
        }
      }

      // Check if additional setup is required (Connect exists but Treasury doesn't)
      const requiresSetup = isOnboarded && !bankAccountId;

      res.json({
        isOnboarded,
        entityId,
        bankAccountId,
        accountLast4,
        requiresSetup, // Indicates if Treasury wallet activation is needed
      });
    } catch (error) {
      console.error("Error checking Stripe onboarding status:", error);
      res.status(500).json({ message: "Failed to check onboarding status" });
    }
  });

  // Generate fresh Account Link for Treasury setup (on-demand)
  app.post('/api/column/generate-setup-link', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's Connect account ID (stored on users table)
      const connectAccountId = user.stripeConnectAccountId;

      if (!connectAccountId) {
        return res.status(400).json({ message: "No payment account found. Please complete onboarding first." });
      }

      // Determine return URL based on environment
      // Check multiple indicators for Replit deployments: .replit.app, .replit.dev, .repl.co
      const requestHost = req.get('host');
      const isReplitHost = requestHost && (
        requestHost.includes('.replit.app') || 
        requestHost.includes('.replit.dev') || 
        requestHost.includes('.repl.co')
      );
      let baseUrl: string;
      if (isReplitHost) {
        baseUrl = `https://${requestHost}`;
      } else if (process.env.REPLIT_DOMAINS) {
        const primaryDomain = process.env.REPLIT_DOMAINS.split(',')[0];
        baseUrl = `https://${primaryDomain}`;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else {
        baseUrl = 'http://localhost:5000';
      }
      const returnUrl = `${baseUrl}/${user.role === 'owner' ? 'owner' : 'driver'}/profile`;
      
      // Generate fresh Account Link
      const accountLink = await stripe.accountLinks.create({
        account: connectAccountId,
        refresh_url: returnUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      console.log('✅ Generated fresh Account Link for Treasury setup:', connectAccountId, 'returnUrl:', returnUrl);

      res.json({
        success: true,
        accountSetupLink: accountLink.url,
      });
    } catch (error: any) {
      console.error('❌ Error generating Account Link:', error);
      res.status(500).json({ message: `Failed to generate setup link: ${error.message}` });
    }
  });

  // Generate Account Link for T&C acceptance (Express accounts)
  // Express accounts MUST use Account Links - cannot accept T&C programmatically
  app.post('/api/stripe/account-link', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log(`📝 Generating Account Link for user ${userId}`);
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.error(`❌ User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`✅ User found: ${user.username} (role: ${user.role})`);

      // Get Stripe account ID from database
      let connectAccountId = user.stripeConnectAccountId;
      console.log(`📊 Current database Stripe account: ${connectAccountId || 'none'}`);

      // If not in database, try to search Stripe (with timeout to prevent hanging)
      if (!connectAccountId) {
        console.log(`⚠️ No Stripe account ID in database for ${user.username}, attempting Stripe search...`);
        try {
          // Use a promise timeout to prevent hanging
          const searchPromise = stripeService.findConnectedAccountByUserId(userId);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Stripe search timeout')), 10000)
          );
          
          const stripeAccount = await Promise.race([searchPromise, timeoutPromise]) as any;
          
          if (stripeAccount) {
            connectAccountId = stripeAccount.id;
            console.log(`✅ Found Stripe account in metadata: ${connectAccountId}`);
            
            // Update database with found account ID (best-effort, don't fail if this errors)
            try {
              await storage.updateUserStripeInfo(userId, { stripeConnectAccountId: connectAccountId });
              console.log(`✅ Updated database with Stripe account ID`);
            } catch (dbError: any) {
              console.warn(`⚠️ Could not update database with Stripe account ID: ${dbError.message}`);
            }
          }
        } catch (searchError: any) {
          console.warn(`⚠️ Stripe search failed (continuing anyway): ${searchError.message}`);
          // Don't fail here - continue to Account Link creation if we had no ID
        }
      }

      // Still no account ID - require onboarding
      if (!connectAccountId) {
        console.error(`❌ No Stripe account found for user ${userId} - requires onboarding`);
        return res.status(400).json({ 
          message: "No Stripe account found. Please complete onboarding first.",
          requiresOnboarding: true
        });
      }

      console.log(`📤 Creating Account Link for Stripe account: ${connectAccountId}`);

      // Determine return URL based on user role and environment
      // Check multiple indicators for Replit deployments: .replit.app, .replit.dev, .repl.co
      let baseUrl: string;
      const requestHost = req.get('host');
      const requestProtocol = req.protocol || 'https';
      const isReplitHost = requestHost && (
        requestHost.includes('.replit.app') || 
        requestHost.includes('.replit.dev') || 
        requestHost.includes('.repl.co')
      );
      
      if (isReplitHost) {
        // Production (.replit.app) or dev deployment (.replit.dev) - use request host
        baseUrl = `https://${requestHost}`;
      } else if (process.env.REPLIT_DOMAINS) {
        // Use REPLIT_DOMAINS if available (contains primary domain)
        const primaryDomain = process.env.REPLIT_DOMAINS.split(',')[0];
        baseUrl = `https://${primaryDomain}`;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        // Development with Replit domain
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else {
        // Local development fallback
        baseUrl = 'http://localhost:5000';
      }
      
      let returnUrl = `${baseUrl}/driver/profile`;
      if (user.role === 'owner') {
        returnUrl = `${baseUrl}/owner/profile`;
      }

      console.log(`🔗 Account Link return URL: ${returnUrl} (host: ${requestHost}, isReplitHost: ${isReplitHost})`);

      // Generate Account Link for T&C acceptance
      // type='account_onboarding' includes T&C acceptance in Express Dashboard
      let accountLink;
      try {
        accountLink = await stripe.accountLinks.create({
          account: connectAccountId,
          refresh_url: returnUrl,
          return_url: returnUrl,
          type: 'account_onboarding',
        });
        console.log(`✅ Generated Account Link successfully`);
      } catch (stripeError: any) {
        console.error(`❌ Stripe Account Link creation failed:`, {
          message: stripeError.message,
          type: stripeError.type,
          statusCode: stripeError.statusCode,
          accountId: connectAccountId
        });
        throw stripeError;
      }

      console.log(`✅ Generated Account Link for T&C acceptance:`, {
        user: user.username,
        role: user.role,
        account: connectAccountId,
        linkExpires: accountLink.expires_at,
        linkUrl: accountLink.url.substring(0, 50) + '...' // Log partial URL for debugging
      });

      res.json({
        success: true,
        accountSetupLink: accountLink.url,
      });
    } catch (error: any) {
      console.error('❌ Error generating Account Link for T&C:', {
        message: error.message,
        type: error.type,
        statusCode: error.statusCode,
        code: error.code,
        raw: error.raw,
        stack: error.stack
      });
      // Always include detailed error info for debugging Stripe issues
      res.status(500).json({ 
        message: error.message || "Failed to generate account link",
        error: error.type || "Unknown error",
        code: error.code,
        stripeError: error.raw?.message || error.message,
        details: error.message
      });
    }
  });

  // Stripe onboarding endpoint
  app.post('/api/column/onboard', isAuthenticated, async (req: any, res) => {
    try {
      console.log('🔵 Starting onboarding for user:', req.user.id);
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.log('❌ User not found:', userId);
        return res.status(404).json({ message: "User not found" });
      }

      console.log('✅ User found:', { id: user.id, username: user.username, role: user.role });

      // Check if user is a driver or owner
      if (user.role !== 'driver' && user.role !== 'owner') {
        console.log('❌ Invalid role:', user.role);
        return res.status(400).json({ message: "Only drivers and owners can complete onboarding" });
      }

      // Validate request body with Zod
      console.log('🔵 Validating request data...');
      const validatedData = columnOnboardingSchema.parse(req.body);
      console.log('✅ Request data validated successfully');

      // Step 1: Check for existing Stripe Connect account (idempotency)
      let connectAccountId: string | null = null;
      
      // First check database (Connect account ID is on users table)
      if (user.stripeConnectAccountId) {
        console.log('✅ User already has Stripe Connect account (from DB):', user.stripeConnectAccountId);
        
        // Get Treasury account ID from role-specific table
        let treasuryAccountId: string | null = null;
        if (user.role === 'driver') {
          const driver = await storage.getDriver(userId);
          treasuryAccountId = driver?.stripeTreasuryAccountId || null;
        } else if (user.role === 'owner') {
          const owner = await storage.getOwner(userId);
          treasuryAccountId = owner?.stripeTreasuryAccountId || null;
        }
        
        return res.json({
          success: true,
          entityId: user.stripeConnectAccountId,
          bankAccountId: treasuryAccountId,
          message: "Already onboarded",
        });
      }
      
      // Second, check Stripe metadata (in case DB update failed previously)
      console.log('🔍 Checking Stripe for existing account by user ID:', userId);
      
      let existingAccount;
      try {
        existingAccount = await stripeService.findConnectedAccountByUserId(userId);
      } catch (stripeError: any) {
        console.error('❌ Error checking Stripe for existing account:', stripeError.message);
        throw new Error(`Stripe account lookup failed: ${stripeError.message}`);
      }
      
      if (existingAccount) {
        console.log('✅ Found existing Stripe account in metadata:', existingAccount.id);
        connectAccountId = existingAccount.id;
        
        // Update database with the found account ID (on users table)
        await storage.upsertUser({
          ...user,
          stripeConnectAccountId: connectAccountId,
        });
        
        return res.json({
          success: true,
          entityId: connectAccountId,
          bankAccountId: null,
          message: "Account recovered from Stripe metadata",
        });
      }

      // Step 2: Create new Stripe Connect Account with user ID in metadata
      console.log('🆕 Creating new Stripe Connect account for user:', userId, 'username:', user.username);
      
      let connectedAccount;
      try {
        connectedAccount = await stripeService.createConnectedAccount({
          type: 'express', // Express accounts for marketplace - auto-activate capabilities
          userId: userId, // Add user ID to metadata for deduplication
          username: user.username, // Use username as display name in Stripe
          email: validatedData.email,
          businessType: 'individual',
          individual: {
            firstName: validatedData.firstName,
            lastName: validatedData.lastName,
            dob: {
              day: parseInt(validatedData.dateOfBirth.split('-')[2]),
              month: parseInt(validatedData.dateOfBirth.split('-')[1]),
              year: parseInt(validatedData.dateOfBirth.split('-')[0]),
            },
            email: validatedData.email,
            phone: user.phone || undefined,
            ssn: validatedData.ssn.slice(-4),
            address: {
              line1: validatedData.address.line1,
              city: validatedData.address.city,
              state: validatedData.address.state,
              postalCode: validatedData.address.postalCode,
              country: 'US',
            },
          },
        });
        console.log('✅ Stripe Connect account created:', connectedAccount.id);
      } catch (stripeError: any) {
        console.error('❌ Error creating Stripe Connect account:', stripeError);
        throw new Error(`Stripe account creation failed: ${stripeError.message || 'Unknown error'}`);
      }

      connectAccountId = connectedAccount.id;

      // Step 2: Create Stripe Treasury Financial Account (wallet)
      let treasuryAccountId: string | null = null;
      let accountSetupLink: string | null = null;
      
      try {
        const treasuryAccount = await stripeService.createFinancialAccount(connectAccountId);
        treasuryAccountId = treasuryAccount.id;
        console.log('✅ Stripe Treasury account created:', treasuryAccountId);
      } catch (treasuryError: any) {
        // Treasury not enabled - gracefully handle this
        console.warn('⚠️ Stripe Treasury not available (sandbox/account limitation):', treasuryError.message);
        console.log('ℹ️ Continuing onboarding without Treasury - user can still use platform');
      }

      // Step 2.5: Generate Account Link for Treasury setup (if Treasury was attempted)
      // This link allows the connected account holder to complete additional verification
      try {
        // Determine return URL based on environment
        // Check multiple indicators for Replit deployments: .replit.app, .replit.dev, .repl.co
        const requestHost = req.get('host');
        const isReplitHost = requestHost && (
          requestHost.includes('.replit.app') || 
          requestHost.includes('.replit.dev') || 
          requestHost.includes('.repl.co')
        );
        let onboardBaseUrl: string;
        if (isReplitHost) {
          onboardBaseUrl = `https://${requestHost}`;
        } else if (process.env.REPLIT_DOMAINS) {
          const primaryDomain = process.env.REPLIT_DOMAINS.split(',')[0];
          onboardBaseUrl = `https://${primaryDomain}`;
        } else if (process.env.REPLIT_DEV_DOMAIN) {
          onboardBaseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
        } else {
          onboardBaseUrl = 'http://localhost:5000';
        }
        const onboardReturnUrl = `${onboardBaseUrl}/${user.role === 'owner' ? 'owner' : 'driver'}/profile`;
        
        const accountLink = await stripe.accountLinks.create({
          account: connectAccountId,
          refresh_url: onboardReturnUrl,
          return_url: onboardReturnUrl,
          type: 'account_onboarding',
        });
        accountSetupLink = accountLink.url;
        console.log('✅ Account setup link generated for Treasury activation, returnUrl:', onboardReturnUrl);
      } catch (linkError: any) {
        console.warn('⚠️ Could not generate account setup link:', linkError.message);
      }

      // Update user's Stripe Connect Account ID (stored on users table)
      await storage.upsertUser({
        ...user,
        stripeConnectAccountId: connectAccountId,
      });

      // Update role-specific data
      if (user.role === 'driver') {
        const driver = await storage.getDriver(userId);
        if (driver) {
          await storage.updateDriver(driver.id, {
            stripeTreasuryAccountId: treasuryAccountId,
          });

          // Step 3: Create Stripe Issuing Cardholder for driver (for debit cards)
          try {
            console.log('Creating Stripe Issuing cardholder for driver:', driver.id);

            const cardholder = await stripeService.createCardholder({
              connectedAccountId: connectAccountId,
              name: `${validatedData.firstName} ${validatedData.lastName}`,
              email: validatedData.email,
              phone: user.phone || '',
              billing: {
                address: {
                  line1: validatedData.address.line1,
                  city: validatedData.address.city,
                  state: validatedData.address.state,
                  postal_code: validatedData.address.postalCode,
                  country: 'US',
                },
              },
            });

            await storage.updateDriver(driver.id, {
              stripeIssuingCardholderId: cardholder.id,
            });

            console.log('Stripe Issuing cardholder created:', cardholder.id);
          } catch (cardholderError) {
            // Log error but don't fail onboarding - driver can still use platform
            console.error('Stripe Issuing cardholder creation failed (non-fatal):', cardholderError);
          }
        }
      } else if (user.role === 'owner') {
        const owner = await storage.getOwner(userId);
        if (owner) {
          await storage.updateOwner(owner.id, {
            stripeTreasuryAccountId: treasuryAccountId,
          });
        }
      }

      res.json({
        success: true,
        entityId: connectAccountId,
        bankAccountId: treasuryAccountId,
        accountSetupLink: accountSetupLink, // Link to complete Treasury wallet activation
        requiresSetup: accountSetupLink !== null, // Flag to indicate if additional setup is needed
        message: treasuryAccountId 
          ? "Successfully onboarded to payment platform"
          : "Account created (Treasury unavailable in sandbox)",
      });
    } catch (error: any) {
      console.error("❌ Error during onboarding:", error);
      console.error("❌ Error details:", {
        message: error.message,
        type: error.type,
        code: error.code,
        stack: error.stack
      });
      
      // Provide more specific error messages
      let errorMessage = "Failed to complete onboarding";
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  // Driver payout request endpoint - initiates ACH transfer via Stripe Treasury
  app.post('/api/driver/payout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Only drivers can request payouts" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Validate request
      const { amount } = driverPayoutRequestSchema.parse(req.body);

      // Check if Stripe wallet is set up
      if (!driver.stripeTreasuryAccountId || !driver.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: "Please complete account setup for withdrawals. Go to your profile to complete onboarding." 
        });
      }

      // Get driver wallet
      const wallet = await storage.getDriverWallet(driver.id);
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Check available balance
      const availableBalance = parseFloat(wallet.availableBalance);
      if (availableBalance < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Create withdrawal record
      const withdrawal = await storage.createWithdrawal({
        driverId: driver.id,
        amountRequested: amount.toString(),
        feeAmount: "0.00", // No fee for now
        amountNet: amount.toString(),
        status: "requested",
      });

      // Get driver's external bank account info (where they want to receive funds)
      if (!driver.routingNumber || !driver.accountNumber) {
        return res.status(400).json({ 
          message: "External bank account not configured. Please add your bank details in settings." 
        });
      }

      // Create ACH transfer from driver's Stripe Treasury wallet to their external bank
      const transferResult = await stripeService.createACHTransfer({
        connectedAccountId: driver.stripeConnectAccountId,
        financialAccountId: driver.stripeTreasuryAccountId,
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        externalBankAccount: {
          accountNumber: driver.accountNumber,
          routingNumber: driver.routingNumber,
          accountHolderName: `${user.firstName} ${user.lastName}`,
        },
        description: `CreteXchange withdrawal - $${amount.toFixed(2)}`,
      });
      
      // Update withdrawal with Stripe transfer ID
      await storage.updateWithdrawalStatus(
        withdrawal.id, 
        "processing", 
        transferResult.id,
        undefined, // failureReason
        undefined // counterpartyId not needed with Stripe
      );

      // Deduct from available balance and add to pending
      await storage.adjustDriverWalletBalance(
        driver.id,
        -amount, // Deduct from available
        amount, // Add to pending (waiting for transfer to complete)
      );

      // Create wallet transaction record
      await storage.createWalletTransaction({
        driverId: driver.id,
        amount: amount.toString(),
        direction: "debit",
        balanceAfter: (availableBalance - amount).toString(),
        currency: "USD",
        sourceType: "withdrawal",
        sourceId: withdrawal.id,
        status: "pending",
        description: `Payout request for $${amount.toFixed(2)}`,
      });

      res.json({
        success: true,
        withdrawalId: withdrawal.id,
        amount,
        status: "processing",
        message: "Payout request submitted successfully",
      });
    } catch (error) {
      console.error("Error processing payout request:", error);
      res.status(500).json({ message: "Failed to process payout request" });
    }
  });

  // Process payment when washout is completed
  // Routes to either credit card or Treasury wallet payment based on feature flag
  app.post('/api/payments/process-washout', isAuthenticated, async (req: any, res) => {
    try {
      const { activityId } = req.body;
      
      if (!activityId) {
        return res.status(400).json({ message: "Activity ID is required" });
      }

      // Get activity details
      const activity = await storage.getActivity(activityId);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // Verify activity is verified
      if (activity.status !== 'verified') {
        return res.status(400).json({ message: "Activity must be verified before processing payment" });
      }

      // Get location and owner
      const location: any = await storage.getWashoutLocation(activity.locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }

      const owner = await storage.getOwnerById(location.ownerId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const driver = await storage.getDriverById(activity.driverId);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      // Get users for usernames
      const ownerUser = await storage.getUser(owner.userId);
      const driverUser = await storage.getUser(driver.userId);

      const MIN_PLATFORM_WASHOUT_FEE = 0.0;

      // Get platform fee - check for owner-specific override first, then use global fee
      const systemSettings = await storage.getSystemSettings();
      let platformFee: number;
      
      // Check if this owner has a custom platform fee
      const customFeeValue = owner.customPlatformFee !== null && owner.customPlatformFee !== undefined
        ? parseFloat(owner.customPlatformFee)
        : NaN;
      if (!isNaN(customFeeValue)) {
        platformFee = Math.max(customFeeValue, MIN_PLATFORM_WASHOUT_FEE);
        console.log('💰 Using custom platform fee for owner:', ownerUser?.username, '- $' + platformFee);
      } else {
        // Use global platform fee from settings
        platformFee = Math.max(
          parseFloat(systemSettings.platformWashoutFee || '5.00'),
          MIN_PLATFORM_WASHOUT_FEE
        );
        console.log('💰 Using global platform fee: $' + platformFee);
      }
      
      // Validate platform fee (safety check)
      if (isNaN(platformFee) || platformFee < MIN_PLATFORM_WASHOUT_FEE) {
        console.error('⚠️ Invalid platform fee detected:', platformFee);
        platformFee = MIN_PLATFORM_WASHOUT_FEE; // Fallback to minimum platform fee
        console.log('✅ Using fallback platform fee:', platformFee);
      }
      
      // Payment structure: platform fee + optional owner-funded driver incentive tip
      // Driver receives the location rate; tip is tracked separately when present
      const locationRate = parseFloat(location.rate);
      const driverTip = resolveLocationDriverIncentiveTipCents(location.driverIncentiveTip) / 100;
      const PLATFORM_FEE = platformFee; // Configurable via admin settings (global or per-owner)
      const DRIVER_PAYMENT = locationRate; // Set by location owner
      const OWNER_CHARGE = locationRate + PLATFORM_FEE + driverTip;

      // Convert to cents for Stripe
      const driverPayoutCents = Math.round((DRIVER_PAYMENT + driverTip) * 100);
      const platformFeeCents = Math.round(PLATFORM_FEE * 100);
      const driverTipCents = Math.round(driverTip * 100);

      // Check wallet funding feature flag to determine payment method
      const walletFundingFlag = await storage.getFeatureFlag('wallet_funding');
      const isWalletFundingEnabled = walletFundingFlag?.enabled || false;

      console.log('💰 Processing washout payment:', {
        activityId,
        locationRate: DRIVER_PAYMENT,
        platformFee: PLATFORM_FEE,
        driverTip,
        driverPayoutCents,
        platformFeeCents,
        driverTipCents,
        totalCharge: OWNER_CHARGE,
        paymentMethod: isWalletFundingEnabled ? 'treasury_wallet' : 'credit_card',
      });

      if (isWalletFundingEnabled) {
        // ===== TREASURY WALLET PAYMENT (when approved) =====
        
        // Verify owner has sufficient wallet balance
        const ownerBalance = parseFloat(owner.walletBalance);
        if (ownerBalance < OWNER_CHARGE) {
          return res.status(400).json({ 
            message: "Insufficient wallet balance. Please fund your wallet to continue.",
            requiredAmount: OWNER_CHARGE,
            currentBalance: ownerBalance,
          });
        }

        // Deduct from owner wallet
        await storage.updateOwnerWalletBalance(
          owner.id, 
          OWNER_CHARGE.toFixed(2), 
          'debit',
          `Washout payment - ${driverUser?.username || driver.id}`
        );

        // Credit driver wallet
        const driverWallet = await storage.getDriverWallet(driver.id);
        if (!driverWallet) {
          await storage.createDriverWallet({ driverId: driver.id });
        }

        await storage.adjustDriverWalletBalance(driver.id, DRIVER_PAYMENT + driverTip, 0);

        const updatedWallet = await storage.getDriverWallet(driver.id);
        const newBalance = parseFloat(updatedWallet?.availableBalance || "0");

        // Create driver wallet transaction
        await storage.createWalletTransaction({
          driverId: driver.id,
          amount: (DRIVER_PAYMENT + driverTip).toFixed(2),
          direction: "credit",
          balanceAfter: newBalance.toString(),
          currency: "USD",
          sourceType: "washout",
          sourceId: activityId,
          status: "posted",
          description: `Washout payment - ${location.name}`,
        });

        console.log('✅ Processed via Treasury wallet');

      } else {
        // ===== BATCHED PAYMENT PROCESSING (default) =====
        // Queue payment for hourly batch processing instead of immediate charge
        
        // Verify owner has saved payment method (required for batch processing)
        if (!owner.stripeCustomerId) {
          return res.status(400).json({ 
            message: "Please add a credit card in Payment Methods before processing washouts.",
            needsPaymentMethod: true,
          });
        }

        // Verify driver has Connect account
        if (!driver.stripeConnectAccountId) {
          return res.status(400).json({ 
            message: "Driver payment account not set up. Please contact support.",
          });
        }

        // Queue payment for batch processing
        await storage.createPendingWashoutPayment({
          activityId,
          driverId: driver.id,
          ownerId: owner.id,
          locationId: location.id,
          driverAmount: DRIVER_PAYMENT.toFixed(2),
          platformFee: PLATFORM_FEE.toFixed(2),
          totalAmount: OWNER_CHARGE.toFixed(2),
          status: 'queued',
          metadata: {
            ownerUsername: ownerUser?.username || owner.id,
            driverUsername: driverUser?.username || driver.id,
            locationName: location.name,
            driverTip: driverTip.toFixed(2),
          },
        });

        console.log('✅ Payment queued for batch processing');
      }

      // Create payment record (common for both flows)
      await storage.createPayment({
        driverId: driver.id,
        ownerId: owner.id,
        activityId,
        amount: DRIVER_PAYMENT.toFixed(2),
        processingFee: PLATFORM_FEE.toFixed(2),
        washoutServiceFee: driverTip.toFixed(2),
        tipAmountCents: driverTipCents,
        status: "completed",
      });

      res.json({
        success: true,
        ownerCharge: OWNER_CHARGE,
        platformFee: PLATFORM_FEE,
        driverPayment: DRIVER_PAYMENT + driverTip,
        driverTip,
        paymentMethod: isWalletFundingEnabled ? 'wallet' : 'batched',
        message: isWalletFundingEnabled ? "Payment processed successfully" : "Payment queued for batch processing",
        batchProcessing: !isWalletFundingEnabled,
      });
    } catch (error: any) {
      console.error("Error processing washout payment:", error);
      res.status(500).json({ 
        message: error.message || "Failed to process payment",
      });
    }
  });

  // Batch processor for washout payments - processes all queued payments
  // Designed to run hourly via cron or be manually triggered by admins
  app.post('/api/payments/process-batch', isAuthenticated, async (req: any, res) => {
    try {
      // Only allow super admins to trigger batch processing
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can trigger batch processing" });
      }

      console.log('🔄 Starting batch payment processing...');

      // Get all queued pending payments
      const queuedPayments = await storage.getPendingWashoutPaymentsByStatus('queued') as QueuedPendingWashoutPayment[];

      if (queuedPayments.length === 0) {
        return res.json({
          success: true,
          message: "No pending payments to process",
          batchesCreated: 0,
        });
      }

      console.log(`📊 Found ${queuedPayments.length} queued payments`);

      // Group payments by owner
      const paymentsByOwner = queuedPayments.reduce<Record<string, QueuedPendingWashoutPayment[]>>((acc, payment) => {
        const ownerId = payment.ownerId;
        if (!acc[ownerId]) {
          acc[ownerId] = [];
        }
        acc[ownerId].push(payment);
        return acc;
      }, {});

      const ownerIds = Object.keys(paymentsByOwner);
      console.log(`👥 Processing batches for ${ownerIds.length} owners`);

      const results = {
        batchesCreated: 0,
        batchesProcessed: 0,
        batchesFailed: 0,
        totalPayments: queuedPayments.length,
        errors: [] as string[],
      };

      // Process each owner's batch
      for (const ownerId of ownerIds) {
        const ownerPayments = paymentsByOwner[ownerId];
        const batchTime = new Date();

        try {
          // Get owner details
          const owner = await storage.getOwnerById(ownerId);
          if (!owner) {
            console.error(`❌ Owner not found: ${ownerId}`);
            results.errors.push(`Owner not found: ${ownerId}`);
            continue;
          }

          // Verify owner has payment method
          if (!owner.stripeCustomerId) {
            console.error(`❌ Owner ${ownerId} has no Stripe customer ID`);
            results.errors.push(`Owner has no payment method set up`);
            // Mark all payments as failed
            for (const payment of ownerPayments) {
              await storage.updatePendingPaymentStatus(
                payment.id,
                'failed',
                undefined,
                'Owner has no payment method'
              );
            }
            continue;
          }

          // Calculate totals for this batch
          const totalDriverPayments = ownerPayments.reduce((sum, p) => {
            const driverTip = Number((p.metadata as { driverTip?: string | number } | null)?.driverTip || 0);
            return sum + parseFloat(p.driverAmount) + driverTip;
          }, 0);
          const totalPlatformFees = ownerPayments.reduce((sum, p) => sum + parseFloat(p.platformFee), 0);
          const totalOwnerCharge = ownerPayments.reduce((sum, p) => sum + parseFloat(p.totalAmount), 0);

          console.log(`💰 Owner ${ownerId} batch: ${ownerPayments.length} payments, $${totalOwnerCharge.toFixed(2)} total`);

          // Create batch record
          const batch = await storage.createWashoutPaymentBatch({
            ownerId,
            batchTime,
            paymentCount: ownerPayments.length,
            totalDriverPayments: totalDriverPayments.toFixed(2),
            totalPlatformFees: totalPlatformFees.toFixed(2),
            totalAmount: totalOwnerCharge.toFixed(2),
            status: 'pending',
            metadata: {
              paymentIds: ownerPayments.map(p => p.id),
            },
          });

          results.batchesCreated++;

          // Link all pending payments to this batch
          for (const payment of ownerPayments) {
            await storage.updatePendingPaymentStatus(payment.id, 'processing', batch.id);
          }

          // Update batch status to processing
          await storage.updateWashoutPaymentBatchStatus(batch.id, 'processing');

          try {
            // Charge owner's card (single charge for all washouts)
            const amountInCents = Math.round(totalOwnerCharge * 100);
            const paymentIntent = await stripeService.stripe.paymentIntents.create({
              amount: amountInCents,
              currency: 'usd',
              customer: owner.stripeCustomerId,
              payment_method: owner.stripePaymentMethodId || undefined,
              description: `Batch payment - ${ownerPayments.length} washouts (Driver payouts: $${totalDriverPayments.toFixed(2)}, Platform fees: $${totalPlatformFees.toFixed(2)})`,
              metadata: {
                batchId: batch.id,
                ownerId,
                paymentCount: ownerPayments.length.toString(),
                totalDriverPayments: totalDriverPayments.toFixed(2),
                totalPlatformFees: totalPlatformFees.toFixed(2),
                type: 'washout_batch_payment',
              },
              confirm: true,
              automatic_payment_methods: {
                enabled: true,
              },
            });

            console.log(`✅ Charged owner card: ${paymentIntent.id}`);

            // Update batch with payment intent ID
            await storage.updateWashoutPaymentBatchStatus(batch.id, 'processing', paymentIntent.id);

            // Transfer funds to each driver via Stripe Connect
            for (const payment of ownerPayments) {
              try {
                const driver = await storage.getDriverById(payment.driverId);
                if (!driver || !driver.stripeConnectAccountId) {
                  throw new Error(`Driver ${payment.driverId} has no Connect account`);
                }

                const driverTip = Number((payment.metadata as { driverTip?: string | number } | null)?.driverTip || 0);
                const driverAmountCents = Math.round((parseFloat(payment.driverAmount) + driverTip) * 100);

                // Create transfer to driver's Connect account
                const transfer = await stripeService.stripe.transfers.create({
                  amount: driverAmountCents,
                  currency: 'usd',
                  destination: driver.stripeConnectAccountId,
                  description: `Washout payment - ${payment.locationId}`,
                  metadata: {
                    batchId: batch.id,
                    paymentId: payment.id,
                    activityId: payment.activityId,
                    driverId: payment.driverId,
                    driverTip: driverTip.toFixed(2),
                    type: 'driver_washout_payout',
                  },
                });

                console.log(`  ↳ Transferred $${(parseFloat(payment.driverAmount) + driverTip).toFixed(2)} to driver ${payment.driverId}`);

                // Mark payment as processed
                await storage.updatePendingPaymentStatus(payment.id, 'processed', batch.id);

              } catch (driverError: any) {
                console.error(`  ❌ Failed to transfer to driver ${payment.driverId}:`, driverError.message);
                await storage.updatePendingPaymentStatus(
                  payment.id,
                  'failed',
                  batch.id,
                  driverError.message
                );
              }
            }

            // Mark batch as completed
            await storage.markWashoutPaymentBatchCompleted(batch.id);
            results.batchesProcessed++;

            console.log(`✅ Batch ${batch.id} completed successfully`);

          } catch (stripeError: any) {
            console.error(`❌ Stripe error for batch ${batch.id}:`, stripeError.message);

            // Mark batch as failed
            await storage.updateWashoutPaymentBatchStatus(
              batch.id,
              'failed',
              undefined,
              stripeError.message
            );

            // Mark all payments in this batch as failed
            for (const payment of ownerPayments) {
              await storage.updatePendingPaymentStatus(
                payment.id,
                'failed',
                batch.id,
                `Batch processing failed: ${stripeError.message}`
              );
            }

            results.batchesFailed++;
            results.errors.push(`Batch ${batch.id}: ${stripeError.message}`);
          }

        } catch (error: any) {
          console.error(`❌ Error processing owner ${ownerId}:`, error.message);
          results.errors.push(`Owner ${ownerId}: ${error.message}`);
          results.batchesFailed++;
        }
      }

      console.log('✅ Batch processing complete:', results);

      res.json({
        success: true,
        message: `Processed ${results.batchesProcessed} batches successfully`,
        ...results,
      });

    } catch (error: any) {
      console.error("Error in batch payment processing:", error);
      res.status(500).json({ 
        message: error.message || "Failed to process batch payments",
      });
    }
  });

  // Get all pending payments (admin only)
  app.get('/api/admin/pending-payments', isAuthenticated, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const pendingPayments = await storage.getAllPendingWashoutPayments();
      res.json(pendingPayments);
    } catch (error: any) {
      console.error("Error fetching pending payments:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch pending payments",
      });
    }
  });

  // Get payment batch history (admin only)
  app.get('/api/admin/payment-batches', isAuthenticated, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const batches = await storage.getWashoutPaymentBatchesByStatus('completed');
      const processing = await storage.getWashoutPaymentBatchesByStatus('processing');
      const failed = await storage.getWashoutPaymentBatchesByStatus('failed');

      // Combine and sort by batch time descending
      const allBatches = [...batches, ...processing, ...failed].sort((a, b) => 
        new Date(b.batchTime).getTime() - new Date(a.batchTime).getTime()
      );

      res.json(allBatches);
    } catch (error: any) {
      console.error("Error fetching payment batches:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch payment batches",
      });
    }
  });

  // RETROACTIVE STRIPE T&C UPDATE: Update all existing Stripe Connect accounts with T&C acceptance (super_admin only)
  // This backfills T&C acceptance for accounts created before the automatic sync was implemented
  app.post('/api/admin/update-existing-stripe-accounts', isAuthenticated, async (req: any, res) => {
    try {
      // Super admin-only endpoint
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ message: "Unauthorized" });
      }

      console.log('🔄 Starting retroactive Stripe T&C update for all existing accounts...');

      // Get all users with Stripe Connect accounts
      const allUsers = await storage.getAllUsers();
      const usersWithStripeAccounts = allUsers.filter((user: any) => user.stripeConnectAccountId);

      console.log(`📊 Found ${usersWithStripeAccounts.length} users with Stripe Connect accounts`);

      const results = {
        total: usersWithStripeAccounts.length,
        updated: 0,
        failed: 0,
        errors: [] as any[],
      };

      const ip = extractIPv4(req) || '0.0.0.0';
      const timestamp = Math.floor(Date.now() / 1000);

      // Process each user
      for (const user of usersWithStripeAccounts) {
        try {
          console.log(`📤 Processing user ${user.id} (${user.username})...`);

          // Get driver or owner data for this user
          let userInfo: any = {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            street: user.street,
            city: user.city,
            state: user.state,
            zip: user.zip,
          };

          if (user.role === 'driver') {
            const driver = await storage.getDriver(user.id);
            if (driver) {
              userInfo.dateOfBirth = driver.dateOfBirth;
              userInfo.ssnLast4 = driver.ssnLast4;
              userInfo.businessWebsite = driver.businessWebsite;
            }
          } else if (user.role === 'owner') {
            const owner = await storage.getOwner(user.id);
            if (owner) {
              userInfo.dateOfBirth = owner.dateOfBirth;
              userInfo.ssnLast4 = owner.ssnLast4;
              userInfo.businessWebsite = owner.businessWebsite;
              userInfo.companyName = owner.companyName;
              userInfo.taxId = owner.taxId;
            }
          }

          // Update Stripe Connect account with T&C acceptance
          await stripeService.updateConnectedAccountWithCompleteInfo(
            user.stripeConnectAccountId || '',
            userInfo,
            {
              timestamp,
              ip
            }
          );

          console.log(`✅ Successfully updated ${user.username}`);
          results.updated++;
        } catch (error: any) {
          console.error(`❌ Failed to update ${user.username}:`, error.message);
          results.failed++;
          results.errors.push({
            userId: user.id,
            username: user.username,
            error: error.message
          });
        }
      }

      console.log(`\n📊 Retroactive update complete:`, results);

      res.json({
        message: 'Retroactive Stripe T&C update completed',
        summary: results,
      });
    } catch (error: any) {
      console.error('Error during retroactive Stripe update:', error);
      res.status(500).json({
        message: 'Failed to update Stripe accounts',
        error: error.message
      });
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
      
      const todayActivities = await storage.getActivitiesByDriver(driver.id, today, tomorrow) as Array<WashoutActivity & { washout_activities?: { amount?: string | number | null } }>;
      
      // Get 7-day stats
      const weekStats = await storage.getDriverStats(driver.id, 7);
      
      // Get recent activities
      const recentActivities = await storage.getRecentActivitiesByDriver(driver.id, 5);
      const awaitingDriverStripePayments = await storage.getPaymentsAwaitingDriverStripeByDriver(driver.id);

      const dailyEarnings = todayActivities.reduce((sum, activity) => {
        // Handle both possible data structures from Drizzle joins
        const amount = Number(activity.washout_activities?.amount || activity.amount || 0);
        return sum + amount;
      }, 0);

      // Get user data for profile completion checks
      const user = await storage.getUser(userId);

      // Get driver lottery entry count and current draw status
      let lotteryActive = true;
      let lotteryEntryCount = 0;
      let lotteryStatus: LotteryStatusSnapshot | null = null;
      try {
        lotteryStatus = await buildLotteryStatusSnapshot(driver.id);
        lotteryActive = lotteryStatus.enabled;
        lotteryEntryCount = lotteryStatus.driverEntryCount ?? 0;
      } catch (e) {
        console.log('Lottery status unavailable:', e);
        lotteryActive = true;
      }
      
      // Combine user data with driver-specific data for profile completion checks
      const userWithRoleData = {
        ...user,
        roleData: {
          employerName: driver.employerName,
          employerStreet: driver.employerStreet,
          employerCity: driver.employerCity,
          employerState: driver.employerState,
          employerZip: driver.employerZip,
          employerPhone: driver.employerPhone,
          truckNumber: driver.truckNumber,
          licenseNumber: driver.licenseNumber,
          hasAgreedToTerms: driver.hasAgreedToTerms,
          termsAgreedAt: driver.termsAgreedAt,
          isGpsEnabled: driver.isGpsEnabled,
          currentLatitude: driver.currentLatitude,
          currentLongitude: driver.currentLongitude,
          lastLocationUpdate: driver.lastLocationUpdate,
        }
      };

      res.json({
        dailyStats: {
          visits: todayActivities.length,
          earnings: dailyEarnings,
        },
        weeklyStats: weekStats,
        recentActivities,
        user: userWithRoleData,
        lotteryEntryCount,
        lotteryActive,
        lotteryStatus,
        awaitingDriverStripePayments: awaitingDriverStripePayments.slice(0, 5),
        awaitingDriverStripeCount: awaitingDriverStripePayments.length,
      });
    } catch (error) {
      console.error("Error fetching driver dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  app.get('/api/drivers/locations', isAuthenticated, async (req: any, res) => {
    try {
      const locations = await storage.getActiveLocations();
      
      // Enrich locations with material intents if rubble service is enabled
      const locationsWithMaterials = await Promise.all(
        locations.map(async (location: any) => {
          try {
            const materialIntents = await storage.getLocationMaterialIntents(location.id);
            
            // Get material details for each intent
            const materialsWithDetails = await Promise.all(
              materialIntents.map(async (intent: any) => {
                const material = await storage.getMaterialBySlug(intent.materialSlug);
                return {
                  ...intent,
                  material: material || null
                };
              })
            );
            
            return {
              ...location,
              materialIntents: materialsWithDetails
            };
          } catch (error) {
            console.error(`Error fetching materials for location ${location.id}:`, error);
            return {
              ...location,
              materialIntents: []
            };
          }
        })
      );
      
      res.json(locationsWithMaterials);
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

      const location: any = await storage.getWashoutLocation(req.body.locationId);
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
      const body = req.body || {};
      const pick = <T,>(nextValue: unknown, currentValue: T): T =>
        (nextValue !== undefined ? (nextValue as T) : currentValue);
      
      // First, get or create the driver record
      let driver = await storage.getDriver(userId);
      if (!driver) {
        // Create driver record if it doesn't exist
        const driverData = {
          userId,
          employerName: body.employerName ?? "",
          employerStreet: body.employerStreet ?? "",
          employerCity: body.employerCity ?? "",
          employerState: body.employerState ?? "",
          employerZip: body.employerZip ?? "",
          employerPhone: body.employerPhone ?? "",
          licenseNumber: body.licenseNumber ?? "",
          truckNumber: body.truckNumber ?? "",
        };
        driver = await storage.createDriver(driverData);
      } else {
        // Update existing driver record
        driver = await storage.updateDriver(driver.id, {
          employerName: pick(body.employerName, driver.employerName),
          employerStreet: pick(body.employerStreet, driver.employerStreet),
          employerCity: pick(body.employerCity, driver.employerCity),
          employerState: pick(body.employerState, driver.employerState),
          employerZip: pick(body.employerZip, driver.employerZip),
          employerPhone: pick(body.employerPhone, driver.employerPhone),
          licenseNumber: pick(body.licenseNumber, driver.licenseNumber),
          truckNumber: pick(body.truckNumber, driver.truckNumber),
          // Payment details - map frontend field names to database column names
          paymentMethod: pick(body.paymentMethod, driver.paymentMethod),
          venmoHandle: pick(body.venmoUsername, driver.venmoHandle),
          zelleEmail: pick(body.zelleInfo, driver.zelleEmail),
          bankName: pick(body.bankName, driver.bankName),
          routingNumber: pick(body.routingNumber, driver.routingNumber),
          accountNumber: pick(body.accountNumber, driver.accountNumber),
          accountHolderName: pick(body.accountHolderName, driver.accountHolderName),
          // Stripe verification fields
          dateOfBirth: pick(body.dateOfBirth, driver.dateOfBirth),
          ssnLast4: pick(body.ssnLast4, driver.ssnLast4),
          businessWebsite: pick(body.businessWebsite, driver.businessWebsite),
          // Lottery prize payout preference
          payoutPreference: pick(body.payoutPreference, driver.payoutPreference),
          payoutPreferenceNote: body.payoutPreferenceNote !== undefined ? body.payoutPreferenceNote : driver.payoutPreferenceNote,
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
        firstName: pick(body.firstName, currentUser.firstName),
        lastName: pick(body.lastName, currentUser.lastName),
        email: pick(body.email, currentUser.email),
        phone: pick(body.phone, currentUser.phone),
        street: pick(body.street, currentUser.street),
        city: pick(body.city, currentUser.city),
        state: pick(body.state, currentUser.state),
        zip: pick(body.zip, currentUser.zip),
        paymentMethod: pick(body.paymentMethod, currentUser.paymentMethod),
        paymentFrequency: pick(body.paymentFrequency, currentUser.paymentFrequency),
        role: currentUser.role, // Preserve existing role
      });

      // Create or update Stripe account with complete verification info
      let stripeAccountId = currentUser.stripeConnectAccountId;
      
      // If no Stripe account exists, create one
      if (!stripeAccountId) {
        try {
          console.log(`📝 No Stripe account found for driver ${currentUser.username}, creating one...`);
          const connectedAccount = await stripeService.createConnectedAccount({
            type: 'express',
            userId: userId,
            username: currentUser.username,
            email: currentUser.email || '',
            businessType: 'individual',
          });
          stripeAccountId = connectedAccount.id;
          
          // Update user with new Stripe account ID
          await storage.updateUserStripeInfo(userId, { stripeConnectAccountId: stripeAccountId });
          console.log(`✅ Created Stripe account ${stripeAccountId} for driver ${currentUser.username}`);
        } catch (createError: any) {
          console.error('Error creating Stripe account for driver:', createError.message);
          // Continue with profile update even if Stripe account creation fails
        }
      }
      
      // Now update the Stripe account with verification info
      let stripeSyncStatus = { synced: false, error: null as string | null, requirements: [] as string[] };
      
      if (stripeAccountId && driver) {
        try {
          await stripeService.updateConnectedAccountWithCompleteInfo(
            stripeAccountId,
            {
              firstName: pick(body.firstName, currentUser.firstName),
              lastName: pick(body.lastName, currentUser.lastName),
              email: pick(body.email, currentUser.email),
              phone: pick(body.phone, currentUser.phone),
              street: pick(body.street, currentUser.street),
              city: pick(body.city, currentUser.city),
              state: pick(body.state, currentUser.state),
              zip: pick(body.zip, currentUser.zip),
              dateOfBirth: pick(body.dateOfBirth, driver.dateOfBirth),
              ssnLast4: pick(body.ssnLast4, driver.ssnLast4),
              businessWebsite: pick(body.businessWebsite, driver.businessWebsite),
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              ip: extractIPv4(req) || '0.0.0.0'
            }
          );
          
          // Fetch updated requirements after sync
          const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
          stripeSyncStatus = {
            synced: true,
            error: null,
            requirements: stripeAccount.requirements?.currently_due || [],
          };
          console.log(`✅ Updated Stripe account ${stripeAccountId} with driver verification info`);
        } catch (stripeError: any) {
          console.error('Note: Could not update Stripe with verification info:', stripeError.message);
          stripeSyncStatus = {
            synced: false,
            error: stripeError.message,
            requirements: [],
          };
        }
      }

      res.json({ 
        message: "Profile updated successfully",
        stripeSyncStatus,
      });
    } catch (error) {
      console.error("Error updating driver profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // FINANCIAL CONNECTIONS: Create session for instant bank verification (DRIVERS)
  app.post('/api/drivers/bank-connect/session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Ensure driver has Stripe Connect account
      if (!user.stripeConnectAccountId) {
        // Get driver data for verification fields
        const driver = await storage.getDriver(userId);
        
        // IMPORTANT: Validate required fields before creating Stripe account
        const { checkProfileCompleteness, formatPhoneE164, parseDateOfBirth, generateBusinessUrl } = await import('./stripeUtils');
        
        const completeness = checkProfileCompleteness({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          street: user.street,
          city: user.city,
          state: user.state,
          zip: user.zip,
          dateOfBirth: driver?.dateOfBirth,
          ssnLast4: driver?.ssnLast4,
        });
        
        if (!completeness.isComplete) {
          return res.status(400).json({
            message: 'Please complete your profile before linking a bank account',
            missingFields: completeness.missingRequired,
            warnings: completeness.warnings,
          });
        }
        
        // Parse DOB for Stripe format
        const dob = parseDateOfBirth(driver?.dateOfBirth);
        if (!dob) {
          return res.status(400).json({
            message: 'Invalid date of birth format. Please update your profile.',
          });
        }
        
        // Create Connect account with REAL user data
        const connectedAccount = await stripeService.createConnectedAccount({
          type: 'express',
          userId: userId,
          username: user.username,
          email: user.email,
          businessType: 'individual',
          capabilities: ['card_payments', 'transfers'],
          individual: {
            firstName: user.firstName!,
            lastName: user.lastName!,
            email: user.email,
            phone: formatPhoneE164(user.phone),
            address: {
              line1: user.street!,
              city: user.city!,
              state: user.state!,
              postalCode: user.zip!,
              country: 'US',
            },
            dob,
            ssn: driver?.ssnLast4,
          },
          businessProfile: {
            url: generateBusinessUrl(user.username, 'driver'),
            mcc: '7542',
          },
        });

        await storage.updateUserStripeInfo(userId, {
          stripeConnectAccountId: connectedAccount.id
        });
        
        user.stripeConnectAccountId = connectedAccount.id;
      }

      // Create Financial Connections session for driver
      // Force HTTPS for return URL (Stripe requirement) - always use HTTPS for production
      const host = req.get('host') || '';
      const protocol = (host.includes('replit') || host.includes('localhost')) && req.protocol === 'http' ? 'https' : req.protocol;
      const session = await stripeService.createFinancialConnectionsSession({
        userType: 'driver',
        connectedAccountId: user.stripeConnectAccountId,
        returnUrl: `${protocol}://${host}/driver/profile`,
      });

      res.json({
        clientSecret: session.client_secret,
        sessionId: session.id,
      });
    } catch (error: any) {
      console.error('Error creating bank link session:', error);
      res.status(500).json({
        message: 'Failed to create bank link session',
        error: error.message
      });
    }
  });

  // FINANCIAL CONNECTIONS: Complete bank linking (DRIVERS)
  app.post('/api/drivers/bank-connect/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID required' });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.stripeConnectAccountId) {
        return res.status(404).json({ message: 'Stripe Connect account not found' });
      }

      // Create external account from Financial Connections
      const result = await stripeService.createExternalAccountFromFinancialConnections({
        sessionId,
        connectedAccountId: user.stripeConnectAccountId,
      });

      if (!result.success) {
        return res.status(400).json({ message: result.error || 'Failed to link bank account' });
      }

      // Update driver record with bank info
      const driver = await storage.getDriver(userId);
      if (driver) {
        await storage.updateDriver(driver.id, {
          bankName: result.bankName || 'Bank Account',
        });

        // IMPORTANT: Sync all verification info to Stripe after Financial Connections succeeds
        // This ensures DOB, SSN, business website and other verification details are sent to Stripe
        try {
          console.log('📤 Syncing verification info to Stripe Connect account (Financial Connections)...');
          await stripeService.updateConnectedAccountWithCompleteInfo(
            user.stripeConnectAccountId,
            {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
              street: user.street,
              city: user.city,
              state: user.state,
              zip: user.zip,
              dateOfBirth: driver.dateOfBirth,
              ssnLast4: driver.ssnLast4,
              businessWebsite: driver.businessWebsite,
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              ip: extractIPv4(req) || '0.0.0.0'
            }
          );
          console.log('✅ Verification info synced to Stripe Connect account');
        } catch (stripeError: any) {
          console.error('⚠️  Warning: Could not sync verification info to Stripe:', stripeError.message);
          // Continue - the bank account is linked, verification info will sync on next profile update
        }
      }

      res.json({
        message: 'Bank account linked successfully',
        bankName: result.bankName,
        last4: result.last4,
      });
    } catch (error: any) {
      console.error('Error completing bank link:', error);
      res.status(500).json({
        message: 'Failed to complete bank link',
        error: error.message
      });
    }
  });

  // MANUAL ENTRY FALLBACK: Driver bank account setup for ACH payouts via Stripe Connect
  app.post('/api/drivers/bank-account', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { bankName, accountHolderName, routingNumber, accountNumber } = req.body;

      // Validate required fields
      if (!bankName || !accountHolderName || !routingNumber || !accountNumber) {
        return res.status(400).json({ message: 'All bank account fields are required' });
      }

      // Validate routing number (9 digits)
      if (!/^\d{9}$/.test(routingNumber)) {
        return res.status(400).json({ message: 'Routing number must be exactly 9 digits' });
      }

      // Get or create driver profile
      let driver = await storage.getDriver(userId);
      if (!driver) {
        driver = await storage.createDriver({
          userId,
          employerName: "",
        });
      }

      // Get user for Stripe Connect account
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Create Stripe Connect account if driver doesn't have one
      if (!user.stripeConnectAccountId) {
        // IMPORTANT: Validate required fields before creating Stripe account
        const { checkProfileCompleteness, formatPhoneE164, parseDateOfBirth, generateBusinessUrl } = await import('./stripeUtils');
        
        const completeness = checkProfileCompleteness({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          street: user.street,
          city: user.city,
          state: user.state,
          zip: user.zip,
          dateOfBirth: driver?.dateOfBirth,
          ssnLast4: driver?.ssnLast4,
        });
        
        if (!completeness.isComplete) {
          return res.status(400).json({
            message: 'Please complete your profile before adding a bank account',
            missingFields: completeness.missingRequired,
            warnings: completeness.warnings,
          });
        }
        
        // Parse DOB for Stripe format
        const dob = parseDateOfBirth(driver?.dateOfBirth);
        if (!dob) {
          return res.status(400).json({
            message: 'Invalid date of birth format. Please update your profile with format YYYY-MM-DD.',
          });
        }
        
        const connectedAccount = await stripeService.createConnectedAccount({
          type: 'express',
          userId: userId,
          username: user.username,
          email: user.email,
          businessType: 'individual',
          individual: {
            firstName: user.firstName!,
            lastName: user.lastName!,
            email: user.email,
            phone: formatPhoneE164(user.phone),
            address: {
              line1: user.street!,
              city: user.city!,
              state: user.state!,
              postalCode: user.zip!,
              country: 'US',
            },
            dob,
            ssn: driver?.ssnLast4,
          },
          businessProfile: {
            url: generateBusinessUrl(user.username, 'driver'),
            mcc: '7542',
          },
        });

        // Update user with Stripe Connect account ID
        await storage.updateUserStripeInfo(userId, {
          stripeConnectAccountId: connectedAccount.id
        });

        console.log(`✅ Created Stripe Connect account for driver ${userId}: ${connectedAccount.id}`);
      }

      // Attach bank account as external account to Stripe Connect account
      const userUpdated = await storage.getUser(userId);
      if (userUpdated?.stripeConnectAccountId) {
        try {
          // Check if Stripe account has blocking requirements before adding external account
          const stripeAccount = await stripe.accounts.retrieve(userUpdated.stripeConnectAccountId);
          const currentlyDue = stripeAccount.requirements?.currently_due || [];
          const hasBlockingRequirements = currentlyDue.length > 0 && 
            !currentlyDue.every(req => req.includes('external_account'));
          
          if (hasBlockingRequirements) {
            console.log('⚠️  Stripe account has blocking requirements, may affect external account:', {
              accountId: userUpdated.stripeConnectAccountId,
              currentlyDue,
            });
          }
          
          await stripeService.createBankPaymentMethod({
            connectedAccountId: userUpdated.stripeConnectAccountId,
            bankAccount: {
              country: 'US',
              currency: 'usd',
              accountHolderName,
              accountHolderType: 'individual',
              routingNumber,
              accountNumber,
            },
          });

          console.log(`✅ Attached bank account to Stripe Connect account ${userUpdated.stripeConnectAccountId}`);
        } catch (stripeError: any) {
          console.error('Failed to attach bank account to Stripe:', stripeError.message);
          // Continue anyway - we'll store the info in database
        }
      }

      // Update driver with bank account information (encrypted in database)
      await storage.updateDriver(driver.id, {
        bankName,
        accountHolderName,
        routingNumber,
        accountNumber, // This will be encrypted by the database layer
      });

      // IMPORTANT: Sync all verification info to Stripe when bank account is added manually
      // This ensures DOB, SSN, business website and other verification details are sent to Stripe
      const driverUpdated = await storage.getDriver(userId);
      if (user.stripeConnectAccountId && driverUpdated) {
        try {
          console.log('📤 Syncing verification info to Stripe Connect account...');
          await stripeService.updateConnectedAccountWithCompleteInfo(
            user.stripeConnectAccountId,
            {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
              street: user.street,
              city: user.city,
              state: user.state,
              zip: user.zip,
              dateOfBirth: driverUpdated.dateOfBirth,
              ssnLast4: driverUpdated.ssnLast4,
              businessWebsite: driverUpdated.businessWebsite,
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              ip: extractIPv4(req) || '0.0.0.0'
            }
          );
          console.log('✅ Verification info synced to Stripe Connect account');
        } catch (stripeError: any) {
          console.error('⚠️  Warning: Could not sync verification info to Stripe:', stripeError.message);
          // Continue - the bank account is still created, verification info will sync on next profile update
        }
      }

      res.json({
        message: 'Bank account added successfully',
        accountLast4: accountNumber.slice(-4)
      });
    } catch (error: any) {
      console.error('Error setting up bank account:', error.message);
      res.status(500).json({
        message: 'Failed to set up bank account',
        error: error.message
      });
    }
  });

  // GET /api/drivers/stripe-onboarding - Get Stripe onboarding link for Express account
  app.get('/api/drivers/stripe-onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.role !== 'driver') {
        return res.status(403).json({ message: 'Driver access required' });
      }

      // Ensure driver has Stripe Connect account
      if (!user.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: 'Stripe Connect account not found. Please contact support.' 
        });
      }

      // Check account requirements
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      
      // If account is fully verified, return success
      if (account.requirements?.currently_due?.length === 0) {
        return res.json({
          onboardingComplete: true,
          message: 'Account onboarding is complete',
          capabilities: account.capabilities,
        });
      }

      // Create Account Link for onboarding
      const host = req.get('host') || '';
      const protocol = (host.includes('replit') || host.includes('localhost')) && req.protocol === 'http' ? 'https' : req.protocol;
      const baseUrl = `${protocol}://${host}`;
      
      const accountLink = await stripeService.createAccountLink({
        accountId: user.stripeConnectAccountId,
        refreshUrl: `${baseUrl}/driver/profile?stripe_refresh=true`,
        returnUrl: `${baseUrl}/driver/profile?stripe_complete=true`,
        type: 'account_onboarding',
      });

      res.json({
        onboardingUrl: accountLink.url,
        expiresAt: accountLink.expires_at,
        requirements: account.requirements,
      });
    } catch (error: any) {
      console.error('Error creating Stripe onboarding link:', error);
      res.status(500).json({
        message: 'Failed to create onboarding link',
        error: error.message
      });
    }
  });

  // GET /api/drivers/stripe-requirements - Check Stripe account requirements
  app.get('/api/drivers/stripe-requirements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.role !== 'driver') {
        return res.status(403).json({ message: 'Driver access required' });
      }

      if (!user.stripeConnectAccountId) {
        return res.json({
          hasAccount: false,
          message: 'Stripe Connect account not created yet',
        });
      }

      // Get account status from Stripe
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      
      // Import utility functions for human-readable translations
      const { formatStripeRequirements } = await import('./stripeUtils');
      
      const currentlyDue = account.requirements?.currently_due || [];
      const pastDue = account.requirements?.past_due || [];
      const eventuallyDue = account.requirements?.eventually_due || [];
      
      // Check if full SSN is required
      const needsFullSsn = currentlyDue.includes('individual.id_number') || pastDue.includes('individual.id_number');
      const needsIdDocument = currentlyDue.includes('individual.verification.document') || pastDue.includes('individual.verification.document');
      
      res.json({
        hasAccount: true,
        accountId: account.id,
        type: account.type,
        capabilities: account.capabilities,
        requirements: {
          currently_due: currentlyDue,
          currently_due_readable: formatStripeRequirements(currentlyDue),
          eventually_due: eventuallyDue,
          eventually_due_readable: formatStripeRequirements(eventuallyDue),
          past_due: pastDue,
          past_due_readable: formatStripeRequirements(pastDue),
          current_deadline: account.requirements?.current_deadline || null,
        },
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        // Helper flags for UI
        isVerified: account.payouts_enabled && currentlyDue.length === 0 && pastDue.length === 0,
        needsFullSsn,
        needsIdDocument,
        hasBlockingRequirements: currentlyDue.length > 0 || pastDue.length > 0,
      });
    } catch (error: any) {
      console.error('Error checking Stripe requirements:', error);
      res.status(500).json({
        message: 'Failed to check account requirements',
        error: error.message
      });
    }
  });

  // GET /api/owners/stripe-onboarding - Get Stripe onboarding link for Express account (owners)
  app.get('/api/owners/stripe-onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.role !== 'owner') {
        return res.status(403).json({ message: 'Owner access required' });
      }

      // Ensure owner has Stripe Connect account
      if (!user.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: 'Stripe Connect account not found. Please contact support.' 
        });
      }

      // Check account requirements
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      
      // If account is fully verified, return success
      if (account.requirements?.currently_due?.length === 0) {
        return res.json({
          onboardingComplete: true,
          message: 'Account onboarding is complete',
          capabilities: account.capabilities,
        });
      }

      // Create Account Link for onboarding
      const host = req.get('host') || '';
      const protocol = (host.includes('replit') || host.includes('localhost')) && req.protocol === 'http' ? 'https' : req.protocol;
      const baseUrl = `${protocol}://${host}`;
      
      const accountLink = await stripeService.createAccountLink({
        accountId: user.stripeConnectAccountId,
        refreshUrl: `${baseUrl}/owner/profile?stripe_refresh=true`,
        returnUrl: `${baseUrl}/owner/profile?stripe_complete=true`,
        type: 'account_onboarding',
      });

      res.json({
        onboardingUrl: accountLink.url,
        expiresAt: accountLink.expires_at,
        requirements: account.requirements,
      });
    } catch (error: any) {
      console.error('Error creating Stripe onboarding link for owner:', error);
      res.status(500).json({
        message: 'Failed to create onboarding link',
        error: error.message
      });
    }
  });

  // GET /api/owners/stripe-requirements - Check Stripe account requirements (owners)
  app.get('/api/owners/stripe-requirements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.role !== 'owner') {
        return res.status(403).json({ message: 'Owner access required' });
      }

      if (!user.stripeConnectAccountId) {
        return res.json({
          hasAccount: false,
          message: 'Stripe Connect account not created yet',
        });
      }

      // Get account status from Stripe
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      
      // Import utility functions for human-readable translations
      const { formatStripeRequirements } = await import('./stripeUtils');
      
      const currentlyDue = account.requirements?.currently_due || [];
      const pastDue = account.requirements?.past_due || [];
      const eventuallyDue = account.requirements?.eventually_due || [];
      
      // Check if full SSN is required
      const needsFullSsn = currentlyDue.includes('individual.id_number') || pastDue.includes('individual.id_number');
      const needsIdDocument = currentlyDue.includes('individual.verification.document') || pastDue.includes('individual.verification.document');
      
      res.json({
        hasAccount: true,
        accountId: account.id,
        type: account.type,
        capabilities: account.capabilities,
        requirements: {
          currently_due: currentlyDue,
          currently_due_readable: formatStripeRequirements(currentlyDue),
          eventually_due: eventuallyDue,
          eventually_due_readable: formatStripeRequirements(eventuallyDue),
          past_due: pastDue,
          past_due_readable: formatStripeRequirements(pastDue),
          current_deadline: account.requirements?.current_deadline || null,
        },
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        // Helper flags for UI - owners need both charges and payouts enabled
        isVerified: account.charges_enabled && account.payouts_enabled && currentlyDue.length === 0 && pastDue.length === 0,
        needsFullSsn,
        needsIdDocument,
        hasBlockingRequirements: currentlyDue.length > 0 || pastDue.length > 0,
      });
    } catch (error: any) {
      console.error('Error checking Stripe requirements for owner:', error);
      res.status(500).json({
        message: 'Failed to check account requirements',
        error: error.message
      });
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
      const user = await storage.getUser(userId);
      const authRole = req.user?.role || user?.role || null;

      console.info("Owner location create route called:", {
        userId,
        authRole,
        hasRequestBody: Boolean(req.body),
        requestedName: req.body?.name || null,
        requestedStreet: req.body?.street || null,
        requestedCity: req.body?.city || null,
        requestedState: req.body?.state || null,
        requestedZip: req.body?.zip || null,
        hasLatitude: req.body?.latitude !== undefined && req.body?.latitude !== null && req.body?.latitude !== "",
        hasLongitude: req.body?.longitude !== undefined && req.body?.longitude !== null && req.body?.longitude !== "",
      });
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const membershipState = resolveOwnerMembershipState(owner);
      if (!membershipState.dashboardAccessAllowed) {
        return res.status(403).json({
          message: membershipState.accountStatusMessage || "Your owner account is not yet approved.",
        });
      }

      const locationAccessState = resolveOwnerLocationAccessState(owner, user);
      console.info("Owner location access resolved:", {
        userId,
        ownerId: owner.id,
        profileCompleted: locationAccessState.profileCompleted,
        paymentMethodOnFile: locationAccessState.paymentMethodOnFile,
        canManageLocations: locationAccessState.canManageLocations,
        missingFields: locationAccessState.missingProfileFields,
      });
      if (!locationAccessState.canManageLocations) {
        return res.status(403).json({
          message: locationAccessState.blockingMessage || "Please complete your owner profile and add a payment method before setting up washout locations.",
          missingFields: locationAccessState.missingProfileFields,
          missingFieldLabels: locationAccessState.missingProfileFieldLabels,
          profileCompleted: locationAccessState.profileCompleted,
          paymentMethodOnFile: locationAccessState.paymentMethodOnFile,
        });
      }

      // Validate location data. Owner creates must arrive with verified coordinates from Mapbox Places.
      const locationData = insertWashoutLocationSchema.parse({
        ...req.body,
        ownerId: owner.id,
      });

      locationData.driverIncentiveTip = locationData.driverIncentiveTip ?? 0;

      if (!locationData.latitude || !locationData.longitude) {
        try {
          const geo = await geocodeAddress(locationData.street, locationData.city, locationData.state, locationData.zip);
          locationData.latitude = geo.latitude;
          locationData.longitude = geo.longitude;
        } catch (geoError: any) {
          console.error("Owner location geocoding failed:", {
            userId,
            ownerId: owner.id,
            message: geoError?.message,
          });
          return res.status(400).json({
            message: geoError?.message || "We could not verify this address. Please select a valid address from the dropdown suggestions or contact support."
          });
        }
      }

      // Create the location
      const location = await storage.createWashoutLocation(locationData as any);
      console.log(`📍 Location created: ${location.id} - ${location.name}`);

      res.status(201).json({
        location,
        message: "Location created successfully."
      });

    } catch (error) {
      const dbError = summarizeDatabaseError(error, {
        phase: "owner-location-create",
        table: "washout_locations",
      });
      console.error("Error creating location:", {
        userId: req.user?.id,
        ownerId: (await storage.getOwner(req.user.id))?.id,
        ...dbError,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (dbError.category === "schema_mismatch" || dbError.category === "enum_mismatch") {
        return res.status(500).json({
          message: dbError.column
            ? `Location creation is missing the required database field '${dbError.column}'. Please deploy the latest migration.`
            : "Location creation is missing a required database field. Please deploy the latest migration.",
        });
      }

      if (dbError.category === "null_violation") {
        return res.status(400).json({
          message: dbError.column
            ? `Location data is incomplete. Missing required field '${dbError.column}'.`
            : "Location data is incomplete. Please check the required fields and try again.",
        });
      }

      if (dbError.category === "foreign_key_violation") {
        return res.status(400).json({
          message: dbError.constraint
            ? `The location could not be saved because a related record is invalid (${dbError.constraint}).`
            : "The selected owner or location reference is invalid. Please try again.",
        });
      }

      if (dbError.category === "unique_violation" || dbError.category === "constraint_violation") {
        return res.status(400).json({
          message: dbError.constraint
            ? `Location could not be created because of a database constraint (${dbError.constraint}).`
            : "Location could not be created because of a database constraint. Please try again.",
        });
      }

      return res.status(500).json({
        message: "Failed to create location. Please try again.",
      });
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

      // Re-geocode if any address field changed and no lat/lng provided
      const addressChanged = req.body.street || req.body.city || req.body.state || req.body.zip;
      if (addressChanged && (!validatedData.latitude || !validatedData.longitude)) {
        const street = req.body.street || existingLocation.street;
        const city = req.body.city || existingLocation.city;
        const state = req.body.state || existingLocation.state;
        const zip = req.body.zip || existingLocation.zip;
        try {
          console.log(`🗺️ Re-geocoding address for location ${id}: ${street}, ${city}, ${state} ${zip}`);
          const geo = await geocodeAddress(street, city, state, zip);
          validatedData.latitude = geo.latitude;
          validatedData.longitude = geo.longitude;
          console.log(`✅ Re-geocoded: lat=${geo.latitude}, lng=${geo.longitude}`);
        } catch (geoError: any) {
          return res.status(400).json({ message: geoError.message });
        }
      }

      const location = await storage.updateLocation(id, owner.id, validatedData as any);
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
      const location: any = await storage.getWashoutLocation(id);
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
      console.log('🔍 Owner activities request:', {
        userId,
        query: req.query,
        timestamp: new Date().toISOString()
      });
      
      const owner = await storage.getOwner(userId);
      console.log('👤 Owner lookup result:', {
        found: !!owner,
        ownerId: owner?.id,
        ownerUserId: owner?.userId
      });
      
      // CRITICAL: Log every step to debug phantom activities
      console.log('🔍 OWNER VERIFICATION:', {
        authenticatedUserId: userId,
        ownerRecordFound: !!owner,
        ownerIdFromDb: owner?.id,
        userIdMatches: owner?.userId === userId
      });

      // CRITICAL: Get the actual user details to check identity mismatch
      const authenticatedUser = await storage.getUser(userId);
      console.log('🆔 AUTHENTICATED USER DETAILS:', {
        environment: process.env.REPLIT_DEPLOYMENT ? 'PRODUCTION' : 'DEVELOPMENT',
        userId: authenticatedUser?.id,
        username: authenticatedUser?.username,
        firstName: authenticatedUser?.firstName,
        lastName: authenticatedUser?.lastName,
        email: authenticatedUser?.email,
        role: authenticatedUser?.role,
        userExists: !!authenticatedUser,
        requestedUserId: userId
      });
      
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

      const activities = await storage.getActivitiesByOwner(owner.id, start, end) as WashoutActivity[];
      
      console.log('📊 Activities query result:', {
        ownerId: owner.id,
        totalActivities: activities.length,
        statusBreakdown: activities.reduce<Record<string, number>>((acc, activity) => {
          acc[activity.status] = (acc[activity.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        sampleActivityIds: activities.slice(0, 3).map(a => a.id),
        allActivityIds: activities.map(a => a.id),
        activitiesWithPhotos: activities.filter(a => a.photoUrls && a.photoUrls.length > 0)
          .map(a => ({ id: a.id, photoUrls: a.photoUrls }))
      });

      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.put('/api/owners/activities/:id/verify', isAuthenticated, async (req: any, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const authRole = req.user?.role || null;
    let approvedActivity: WashoutActivity | null = null;
    let approvalResponseMessage = "Washout approved.";
    let approvalResponsePaymentStatus: string | null = null;
    let approvalResponsePayoutStatus: string | null = null;
    let approvalResponseDeferReason: string | null = null;
    const approvalDebugContext: Record<string, unknown> = {
      route: '/api/owners/activities/:id/verify',
      activityId: id,
      ownerId: null,
      locationId: null,
      driverId: null,
      currentStatus: null,
      currentApprovalStatus: null,
      resolvedLocationOwnerId: null,
      authUserId: userId,
      authRole,
      permissionCheckResult: null,
      paymentStatus: null,
      payoutStatus: null,
      deferReason: null,
    };

    try {

      // Get the owner to ensure they have permission
      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }
      approvalDebugContext.ownerId = owner.id;

      // Get the activity details before verification
      const activityDetails = await storage.getWashoutActivity(id);
      if (!activityDetails) {
        return res.status(404).json({ message: "Activity not found" });
      }
      approvalDebugContext.locationId = activityDetails.locationId;
      approvalDebugContext.driverId = activityDetails.driverId;
      approvalDebugContext.currentStatus = activityDetails.status;
      approvalDebugContext.currentApprovalStatus = getWashoutApprovalDisplayStatus(activityDetails.status);
      const activityLocation = await storage.getWashoutLocation(activityDetails.locationId) as WashoutLocation | undefined;
      if (!activityLocation || activityLocation.ownerId !== owner.id) {
        approvalDebugContext.resolvedLocationOwnerId = activityLocation?.ownerId || null;
        approvalDebugContext.permissionCheckResult = false;
        const failureDetails = {
          activityId: activityDetails.id,
          ownerId: owner.id,
          locationId: activityDetails.locationId,
          resolvedLocationOwnerId: activityLocation?.ownerId || null,
          driverId: activityDetails.driverId,
          authRole,
        };
        console.error("❌ Washout approval rejected due to ownership mismatch:", failureDetails);
        return res.status(403).json({
          message: "This washout does not belong to your location.",
          details: failureDetails,
        });
      }
      if (!isPendingWashoutApproval(activityDetails.status)) {
        approvalDebugContext.permissionCheckResult = false;
        const failureDetails = {
          activityId: activityDetails.id,
          ownerId: owner.id,
          locationId: activityDetails.locationId,
          driverId: activityDetails.driverId,
          currentStatus: activityDetails.status,
          displayStatus: getWashoutApprovalDisplayStatus(activityDetails.status),
          requiredTransition: "pending -> verified",
          authRole,
        };
        console.error("❌ Washout approval rejected due to invalid state transition:", failureDetails);
        return res.status(409).json({
          message: "This washout has already been processed or is not awaiting owner approval.",
          details: failureDetails,
        });
      }

      // Approval is persisted before payment processing so payment failures cannot block owner approval.

      const systemSettings = await storage.getSystemSettings();

      // ========== CHECK FOR CUSTOM BILLING MODEL (LOTTERY PROGRAM) ==========
      // Custom billing model: Owner pays fixed custom rate, driver gets lottery entry (no payout)
      const useCustomBillingModel = owner.useCustomBillingModel === true;
      let defaultCustomWashoutRate = 5.00;
      try {
        defaultCustomWashoutRate = parseFloat(systemSettings?.platformWashoutFee || "5.00");
      } catch (error) {
        console.warn("⚠️ Unable to load system settings for custom billing fallback; using default rate", {
          ownerId: owner.id,
          activityId: activityDetails.id,
          message: (error as Error)?.message,
        });
      }
      const customWashoutRate = owner.customWashoutRate !== null && owner.customWashoutRate !== undefined && owner.customWashoutRate !== ""
        ? parseFloat(owner.customWashoutRate)
        : defaultCustomWashoutRate;

      // FEE STRUCTURE: Depends on billing model
        // Standard: Driver receives full location rate, Owner pays location rate + platform fee
      // Custom (Lottery): Owner pays customWashoutRate only, Driver gets lottery entry (no cash)
      let driverAmount: number;
      let platformFee: number;
      let ownerFee: number;
      let driverTip = 0;

      if (useCustomBillingModel) {
        // CUSTOM BILLING MODEL: Owner pays flat custom rate, platform keeps it all
        driverAmount = 0; // Driver gets lottery entry, not cash
        platformFee = customWashoutRate; // Platform keeps entire custom rate
        ownerFee = customWashoutRate; // Owner pays only the custom rate
        console.log(`🎰 Custom billing model active for owner ${owner.id}: ownerFee=$${ownerFee}, driver gets lottery entry`);
      } else {
        // STANDARD BILLING MODEL: Driver gets paid, platform takes fee
        driverAmount = Number(activityDetails.amount); // Driver gets exact location rate
        const billingComponents = resolveWashoutChargeComponents({
          owner,
          location: activityLocation,
          systemSettings,
          baseAmount: driverAmount,
        });
        platformFee = billingComponents.platformFee;
        driverTip = billingComponents.driverTip;
        ownerFee = billingComponents.ownerCharge; // Owner pays total: driver amount + platform fee + driver tip
      }

      // Get owner's billing settings for business date calculation
      const billingSettings = await storage.getOwnerBillingSettings(owner.id);
      let billingCadence: 'immediate' | 'daily' | 'weekly' = 'immediate';
      let businessDate = new Date().toISOString().slice(0, 10);
      if (billingSettings) {
        billingCadence = billingSettings.billingCadence;
        try {
          // Calculate business date using proper cutoff time logic
          businessDate = await storage.calculateBusinessDateForOwner(
            owner.id,
            billingSettings.billingTimezone,
            billingSettings.billingCutoffTime
          );
        } catch (businessDateError: any) {
          console.warn(`⚠️ Failed to calculate business date for washout ${id}; using today's date instead:`, businessDateError?.message || businessDateError);
        }
      } else {
        console.warn(`⚠️ Owner billing settings not found for owner ${owner.id}; defaulting approval billing context for washout ${id}`);
      }

      // Get driver information for payment processing
      const driver = await storage.getDriverById(activityDetails.driverId);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }
      
      // Get driver's user record for Stripe Connect Account ID
      const driverUser = await storage.getUserById(driver.userId);
      if (!driverUser) {
        return res.status(404).json({ message: "Driver user account not found" });
      }

      const driverStripeReadiness = await resolveDriverStripeReadiness(driverUser);
      approvalDebugContext.permissionCheckResult = true;
      approvalDebugContext.paymentStatus = driverStripeReadiness.ready ? 'ready' : 'deferred';
      approvalDebugContext.deferReason = driverStripeReadiness.reason || null;

      // ========== CHECK BILLING CADENCE TO DETERMINE PAYMENT PROCESSING ==========
      // Approve the activity first so payment processing can never block owner approval.
      approvedActivity = await storage.verifyWashoutActivity(id, userId);
      console.log(`✅ Washout ${id} approval persisted before payment processing`, {
        ownerId: owner.id,
        locationId: activityDetails.locationId,
        driverId: activityDetails.driverId,
        authRole,
        currentStatus: activityDetails.status,
        approvalStatus: getWashoutApprovalDisplayStatus(activityDetails.status),
      });

      if (!driverStripeReadiness.ready) {
        const deferredReason = `${driverStripeReadiness.reason || 'Driver Stripe account not ready'} - owner-funded tip held for onboarding`;
        console.log(`⏸️ Deferring washout ${id} payment until driver Stripe setup is complete: ${deferredReason}`);
        approvalResponseMessage = "Washout approved. Payment will be processed once the driver completes payment setup.";
        approvalResponsePaymentStatus = "awaiting_driver_stripe";
        approvalResponsePayoutStatus = "held_for_onboarding";
        approvalResponseDeferReason = deferredReason;
        approvalDebugContext.paymentStatus = "awaiting_driver_stripe";
        approvalDebugContext.payoutStatus = "held_for_onboarding";
        approvalDebugContext.deferReason = deferredReason;

        const payment = await storage.createPayment({
          activityId: id,
          driverId: activityDetails.driverId,
          ownerId: owner.id,
          amount: driverAmount.toString(),
          processingFee: platformFee.toFixed(2),
          washoutServiceFee: driverTip.toFixed(2),
          tipAmountCents: Math.round(driverTip * 100),
          status: 'awaiting_driver_stripe',
          payoutStatus: 'held_for_onboarding',
          deferReason: deferredReason,
          deferredAt: new Date(),
          businessDate,
        });

        const activity = approvedActivity || await storage.verifyWashoutActivity(id, userId);

        console.log(`✅ Washout ${id} approved with deferred payment ${payment.id} awaiting driver Stripe setup`, {
          ownerId: owner.id,
          activityId: id,
          driverId: driver.id,
          paymentStatus: payment.status,
          payoutStatus: payment.payoutStatus,
          deferReason: deferredReason,
        });
        approvalResponseMessage = "Washout approved. Payment will be processed once the driver completes payment setup.";
        approvalResponsePaymentStatus = payment.status;
        approvalResponsePayoutStatus = payment.payoutStatus;
        approvalResponseDeferReason = payment.deferReason;

        return res.json({
          ...activity,
          message: approvalResponseMessage,
          paymentStatus: approvalResponsePaymentStatus,
          payoutStatus: approvalResponsePayoutStatus,
          deferReason: approvalResponseDeferReason,
        });
      }

      // For daily/weekly batch processing, create pending payment and skip immediate processing
      if (billingCadence === 'daily' || billingCadence === 'weekly') {
        console.log(`📅 Owner ${owner.id} uses ${billingCadence} billing cadence - creating pending payment for batch processing`);
        approvalResponseMessage = "Washout approved. Payment will be processed in the next billing run.";
        approvalResponsePaymentStatus = "pending";
        approvalResponsePayoutStatus = "not_started";
        approvalResponseDeferReason = null;
        approvalDebugContext.paymentStatus = "pending";
        approvalDebugContext.payoutStatus = "not_started";
        approvalDebugContext.deferReason = null;
        
        // Create pending payment record for batch processing
        const payment = await storage.createPayment({
          activityId: id,
          driverId: activityDetails.driverId,
          ownerId: owner.id,
          amount: driverAmount.toString(),
          processingFee: platformFee.toFixed(2),
          washoutServiceFee: driverTip.toFixed(2),
          tipAmountCents: Math.round(driverTip * 100),
          status: 'pending', // Will be processed by batch processor
          businessDate,
        });
        
        // Record owner wallet transaction (ledger entry for pending charge)
        try {
          console.log(`📝 Creating owner wallet transaction (pending) for washout ${id}:`, {
            ownerId: owner.id,
            type: 'washout_charge_pending',
            amount: ownerFee.toFixed(2),
            paymentId: payment.id,
            billingCadence,
          });
          
          const [insertedTxn] = await db.insert(ownerWalletTransactions).values({
            ownerId: owner.id,
            type: 'washout_charge_pending',
            amount: ownerFee.toFixed(2),
            balanceBefore: "0.00",
            balanceAfter: "0.00",
            description: `Pending washout - ${driverUser?.username || 'Driver'} at ${activityLocation?.name || 'Location'} (${billingCadence} billing)`,
            paymentId: payment.id,
          }).returning();
          
          console.log(`✅ Owner wallet transaction (pending) recorded for washout ${id}, transaction ID: ${insertedTxn?.id}`);
        } catch (txnError: any) {
          console.error(`❌ Failed to record owner wallet transaction (pending) for washout ${id}:`, txnError);
          console.error(`   Error message: ${txnError.message}`);
          console.error(`   Owner ID: ${owner.id}, Payment ID: ${payment.id}`);
        }
        
        // Verify activity immediately (payment will be processed later in batch)
        const activity = approvedActivity || await storage.verifyWashoutActivity(id, userId);

        // ========== DRIVER COMPENSATION FOR BATCH PROCESSING ==========
        if (useCustomBillingModel && activityDetails.serviceType !== 'rubble_dropoff') {
          // CUSTOM BILLING MODEL: Create lottery entry only if lottery program is enabled
          try {
            const lotteryEnabled = (await resolveLotteryEnabled(storage)).enabled;
            if (lotteryEnabled) {
              const lotteryEntry = await storage.createDriverLotteryEntry({
                driverId: driver.id,
                activityId: id,
                ownerId: owner.id,
                entriesEarned: 1,
              });
              console.log(`🎰 Lottery entry created for driver ${driver.id} (batch billing), entry ID: ${lotteryEntry.id}`);
            } else {
              console.log(`🎰 Lottery program disabled — no entry created for driver ${driver.id} on washout ${id}`);
            }
          } catch (lotteryError: any) {
            console.error(`❌ Failed to create lottery entry for washout ${id}:`, lotteryError);
          }
        }
        // NOTE: For standard model, driver wallet credit happens when batch payment succeeds (in batch processor)
        
        const compensationType = useCustomBillingModel ? 'lottery entry' : 'pending payment';
        console.log(`✅ Washout ${id} approved with ${billingCadence} billing. Payment ${payment.id} pending batch processing. Driver receives: ${compensationType}`);
        approvalResponseMessage = "Washout approved. Payment will be processed in the next billing run.";
        approvalResponsePaymentStatus = payment.status;
        approvalResponsePayoutStatus = "not_started";
        
        return res.json({
          ...activity,
          message: approvalResponseMessage,
          paymentStatus: approvalResponsePaymentStatus,
          payoutStatus: approvalResponsePayoutStatus,
        });
      }
      
      // ========== IMMEDIATE STRIPE CONNECT PAYMENT PROCESSING ==========
      // Only for owners with 'immediate' billing cadence
      let paymentProcessedSuccessfully = false;
      let shouldFallbackToPending = false;
      let fallbackReason = '';
      let fallbackDetails: Record<string, unknown> | null = null;
      
      try {
        console.log(`🔄 Processing immediate Stripe Connect payment for washout ${id} (immediate cadence)...`);
        
        // Check if Stripe is configured - fallback to pending if not
        if (!stripe) {
          console.log(`⚠️ Stripe not configured - falling back to pending payment for batch processing`);
          shouldFallbackToPending = true;
          fallbackReason = 'Stripe not configured';
          fallbackDetails = {
            ownerId: owner.id,
            activityId: id,
            driverId: driver.id,
            reason: fallbackReason,
          };
        }
        // Only proceed with Stripe validations and processing if not falling back
        else {
          // Validate owner has Stripe Customer and Payment Method
          if (!owner.stripeCustomerId || !owner.stripePaymentMethodId) {
            const errorMsg = `Owner missing ${!owner.stripeCustomerId ? 'Stripe Customer ID' : 'payment method'}`;
            console.warn(`⚠️ ${errorMsg} - falling back to pending payment so approval can complete`);
            shouldFallbackToPending = true;
            fallbackReason = errorMsg;
            fallbackDetails = {
              ownerId: owner.id,
              activityId: id,
              driverId: driver.id,
              reason: fallbackReason,
            };
          }
          // Validate driver has Stripe Connect Account
          if (!driverUser.stripeConnectAccountId) {
            console.warn(`⚠️ Driver ${driver.id} (user ${driverUser.id}) missing Stripe Connect Account - falling back to pending payment`);
            shouldFallbackToPending = true;
            fallbackReason = 'Driver missing Stripe Connect account';
            fallbackDetails = {
              ownerId: owner.id,
              activityId: id,
              driverId: driver.id,
              reason: fallbackReason,
            };
          }
          
          // Validate driver's Stripe account has active transfers capability (required for Destination Charges)
          if (!shouldFallbackToPending) {
            const driverAccount = await stripe.accounts.retrieve(driverUser.stripeConnectAccountId);
            const transfersCapability = driverAccount.capabilities?.transfers;
            
            if (transfersCapability !== 'active') {
              console.warn(`⚠️ Driver ${driver.id} (account ${driverAccount.id}) transfers capability is ${transfersCapability || 'not requested'} - falling back to pending payment`);
              console.warn(`   Driver can still complete washouts without Stripe; approval will continue and payment will queue.`);
              shouldFallbackToPending = true;
              fallbackReason = `Driver transfers capability ${transfersCapability || 'inactive'}`;
              fallbackDetails = {
                ownerId: owner.id,
                activityId: id,
                driverId: driver.id,
                reason: fallbackReason,
              };
            } else {
              console.log(`✅ Driver ${driver.id} has active transfers capability - proceeding with payment`);
            }
          }
        
          if (!shouldFallbackToPending) {
            // All prerequisites met - process payment
            // Verify payment method is card or link-based (Link uses card details underneath)
            const paymentMethod = await stripe.paymentMethods.retrieve(owner.stripePaymentMethodId);
            console.log(`🔍 Owner payment method: type=${paymentMethod.type}, id=${paymentMethod.id}`);
            
            if (paymentMethod.type !== 'card' && paymentMethod.type !== 'link') {
              console.warn(`⚠️ Payment method ${paymentMethod.id} is ${paymentMethod.type}, falling back to pending payment`);
              shouldFallbackToPending = true;
              fallbackReason = `Unsupported payment method type (${paymentMethod.type})`;
              fallbackDetails = {
                ownerId: owner.id,
                activityId: id,
                driverId: driver.id,
                reason: fallbackReason,
              };
            }
          }
          
          if (!shouldFallbackToPending) {
            const paymentMethod = await stripe.paymentMethods.retrieve(owner.stripePaymentMethodId);
          
          // Process immediate Stripe Connect Destination Charge
          const cardInfo = paymentMethod.type === 'card' && paymentMethod.card 
            ? `${paymentMethod.card.brand} ****${paymentMethod.card.last4}` 
            : 'Stripe Link';
          console.log(`💳 Creating Stripe Destination Charge: $${ownerFee.toFixed(2)} (Driver: $${driverAmount}, Platform Fee: $${platformFee})`);
          console.log(`   Owner Customer: ${owner.stripeCustomerId}`);
          console.log(`   Payment Method: ${owner.stripePaymentMethodId} (${cardInfo})`);
          console.log(`   Driver Connect Account: ${driverUser.stripeConnectAccountId}`);
          
          // Stripe Destination Charges: Use application_fee_amount ONLY (not transfer_data.amount)
          // Driver receives: total charge - application_fee_amount
          // Platform receives: application_fee_amount
          // Note: Accept both card and link payment types for flexibility
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(ownerFee * 100), // Convert to cents - total charged to owner
            currency: 'usd',
            customer: owner.stripeCustomerId,
            payment_method: owner.stripePaymentMethodId,
            payment_method_types: ['card', 'link'], // Allow card and Link payments
            capture_method: 'automatic', // Capture immediately
            off_session: true, // Owner not present
            confirm: true, // Confirm immediately
            description: `Washout payment - Activity ${id}`,
            metadata: {
              activityId: id,
              ownerId: owner.id,
              driverId: driver.id,
              driverAmount: driverAmount.toFixed(2),
              platformFee: platformFee.toFixed(2),
              driverTip: driverTip.toFixed(2),
              businessDate: businessDate,
            },
            transfer_data: {
              destination: driverUser.stripeConnectAccountId, // Driver's Connect account receives the rest
            },
            application_fee_amount: Math.round(platformFee * 100), // Platform keeps fee, driver gets remainder
          });
          
          console.log(`✅ Stripe Payment Intent created: ${paymentIntent.id}, Status: ${paymentIntent.status}`);
          
          // Verify payment succeeded before recording it
          if (paymentIntent.status === 'succeeded') {
            paymentProcessedSuccessfully = true;
            approvalDebugContext.paymentStatus = "completed";
            approvalDebugContext.payoutStatus = "completed";
            approvalDebugContext.deferReason = null;
            console.log(`✅ Stripe payment succeeded for washout ${id}: ${paymentIntent.id}`);
          } else {
            // Payment not immediately successful - fallback to pending payment
            console.warn(`⚠️ Payment Intent ${paymentIntent.id} has status: ${paymentIntent.status} (expected: succeeded), falling back to pending`);
            shouldFallbackToPending = true;
            fallbackReason = `Payment status: ${paymentIntent.status}`;
            fallbackDetails = {
              ownerId: owner.id,
              activityId: id,
              driverId: driver.id,
              paymentIntentId: paymentIntent.id,
              reason: fallbackReason,
            };
          }
        }
        } // End of else block (Stripe configured)
      } catch (stripePaymentError: any) {
        console.error(`❌ Error processing Stripe payment for washout ${id}:`, stripePaymentError);
        console.error(`   Error type:`, stripePaymentError.type);
        console.error(`   Error code:`, stripePaymentError.code);
        console.error(`   Decline code:`, stripePaymentError.decline_code);
        console.error(`   Error message:`, stripePaymentError.message);
        
        console.warn(`⚠️ Stripe API error, falling back to pending payment: ${stripePaymentError.message}`);
        shouldFallbackToPending = true;
        fallbackReason = `Stripe API error: ${stripePaymentError.message}`;
        fallbackDetails = {
          ownerId: owner.id,
          activityId: id,
          driverId: driver.id,
          reason: fallbackReason,
          stripeErrorType: stripePaymentError.type,
          stripeErrorCode: stripePaymentError.code,
          declineCode: stripePaymentError.decline_code,
        };
      }
      
      // ========== FALLBACK TO PENDING PAYMENT IF NEEDED ==========
      // When Stripe is unavailable or unconfigured for immediate cadence owners
      if (shouldFallbackToPending) {
        console.log(`⚠️ Falling back to pending payment for washout ${id}: ${fallbackReason}`, fallbackDetails || {});
        approvalResponseMessage = "Washout approved. Payment will be processed later.";
        approvalResponsePaymentStatus = "pending";
        approvalResponsePayoutStatus = "not_started";
        approvalResponseDeferReason = fallbackReason;
        approvalDebugContext.paymentStatus = "pending";
        approvalDebugContext.payoutStatus = "not_started";
        approvalDebugContext.deferReason = fallbackReason;
        
        // Create pending payment record for batch processing
        const payment = await storage.createPayment({
          activityId: id,
          driverId: activityDetails.driverId,
          ownerId: owner.id,
          amount: driverAmount.toString(),
          processingFee: platformFee.toFixed(2),
          washoutServiceFee: driverTip.toFixed(2),
          tipAmountCents: Math.round(driverTip * 100),
          status: 'pending', // Will be processed by batch processor
          businessDate,
        });
        
        // Verify activity (payment will be processed later in batch)
        const activity = approvedActivity || await storage.verifyWashoutActivity(id, userId);
        
        console.log(`✅ Washout ${id} approved with pending payment ${payment.id} (fallback: ${fallbackReason})`, fallbackDetails || {});
        approvalResponseMessage = "Washout approved. Payment will be processed later.";
        approvalResponsePaymentStatus = payment.status;
        approvalResponsePayoutStatus = "not_started";
        approvalResponseDeferReason = fallbackReason;
        
        return res.json({
          ...activity,
          message: approvalResponseMessage,
          paymentStatus: approvalResponsePaymentStatus,
          payoutStatus: approvalResponsePayoutStatus,
          deferReason: approvalResponseDeferReason,
        });
      }
      
      // ========== STOP HERE IF IMMEDIATE PAYMENT FAILED ==========
      // Don't proceed to database writes if Connect payment failed
      if (!paymentProcessedSuccessfully) {
        console.error(`❌ Stripe Connect payment failed for washout ${id} - using pending fallback instead`, {
          ownerId: owner.id,
          activityId: id,
          driverId: driver.id,
          fallbackReason,
          fallbackDetails,
        });
        shouldFallbackToPending = true;
        fallbackReason = fallbackReason || 'Payment processing did not complete';
        fallbackDetails = fallbackDetails || {
          ownerId: owner.id,
          activityId: id,
          driverId: driver.id,
          reason: fallbackReason,
        };
        approvalResponseMessage = "Washout approved. Payment will be processed later.";
        approvalResponsePaymentStatus = "pending";
        approvalResponsePayoutStatus = "not_started";
        approvalResponseDeferReason = fallbackReason;
      }

      // ========== LEGACY: STRIPE TREASURY TRANSFERS (disabled) ==========
      // Treasury transfers are currently not in use
      // All payments processed via Stripe Connect Destination Charges above

      // ========== FINALIZE TRANSACTION AFTER SUCCESSFUL PAYMENT ==========
      // At this point, payment has succeeded via Stripe Connect Destination Charge
      // Now record the transaction in our database and credit the driver

      // Create payment record AFTER successful Stripe charge
      const payment = await storage.createPayment({
        activityId: id,
        driverId: activityDetails.driverId,
        ownerId: owner.id,
        amount: driverAmount.toString(),
        processingFee: platformFee.toFixed(2), // Platform fee (default $5.00, configurable)
        washoutServiceFee: driverTip.toFixed(2), // Driver incentive tip per washout
        tipAmountCents: Math.round(driverTip * 100),
        status: 'completed', // Payment already succeeded via Stripe
        businessDate, // Set business date for reporting
      });

      // Update payment with Stripe Payment Intent ID
      await storage.updatePaymentStatus(payment.id, 'completed', ''); // Stripe ID will be set separately
      
      // Record owner wallet transaction (ledger entry for the charge)
      // For Stripe Connect Destination Charges, owner is charged directly via their payment method
      // balanceBefore/After are 0 since we're not maintaining an internal wallet balance
      try {
        console.log(`📝 Creating owner wallet transaction for washout ${id}:`, {
          ownerId: owner.id,
          type: 'washout_charge',
          amount: ownerFee.toFixed(2),
          paymentId: payment.id,
        });
        
        const [insertedTxn] = await db.insert(ownerWalletTransactions).values({
          ownerId: owner.id,
          type: 'washout_charge',
          amount: ownerFee.toFixed(2),
          balanceBefore: "0.00", // Not using internal wallet - direct Stripe charge
          balanceAfter: "0.00",  // Not using internal wallet - direct Stripe charge
          description: `Washout payment - ${driverUser?.username || 'Driver'} at ${activityLocation?.name || 'Location'}`,
          paymentId: payment.id,
        }).returning();
        
        console.log(`✅ Owner wallet transaction recorded for washout ${id}, transaction ID: ${insertedTxn?.id}`);
      } catch (txnError: any) {
        console.error(`❌ Failed to record owner wallet transaction for washout ${id}:`, txnError);
        console.error(`   Error message: ${txnError.message}`);
        console.error(`   Owner ID: ${owner.id}, Payment ID: ${payment.id}`);
      }
      
      // ========== DRIVER COMPENSATION: CASH OR LOTTERY ENTRY ==========
      if (useCustomBillingModel && activityDetails.serviceType !== 'rubble_dropoff') {
        // CUSTOM BILLING MODEL: Create lottery entry instead of cash payment
        try {
          const lotteryEnabled = (await resolveLotteryEnabled(storage)).enabled;
          if (lotteryEnabled) {
            const lotteryEntry = await storage.createDriverLotteryEntry({
              driverId: driver.id,
              activityId: id,
              ownerId: owner.id,
              entriesEarned: 1, // 1 entry per washout
            });
            console.log(`🎰 Lottery entry created for driver ${driver.id}, entry ID: ${lotteryEntry.id}`);
          } else {
            console.log(`🎰 Lottery program disabled — no entry created for driver ${driver.id} on washout ${id}`);
          }
        } catch (lotteryError: any) {
          console.error(`❌ Failed to create lottery entry for washout ${id}:`, lotteryError);
          // Don't fail the transaction - lottery entry is nice-to-have
        }
      } else {
        // STANDARD MODEL: Credit driver's wallet with cash
        // Ensure driver has a wallet
        let driverWallet = await storage.getDriverWallet(driver.id);
        if (!driverWallet) {
          await storage.createDriverWallet({ driverId: driver.id });
        }
        
        // Credit driver's wallet balance AFTER successful payment
        await storage.adjustDriverWalletBalance(driver.id, driverAmount, 0);
        
        // Get updated wallet for transaction record
        const updatedWallet = await storage.getDriverWallet(driver.id);
        const newBalance = parseFloat(updatedWallet?.availableBalance || "0");
        
        // Create wallet transaction record
        await storage.createWalletTransaction({
          driverId: driver.id,
          amount: driverAmount.toString(),
          direction: "credit",
          balanceAfter: newBalance.toString(),
          currency: "USD",
          sourceType: "washout",
          sourceId: id,
          status: "posted",
          description: `Washout payment for activity ${id}`,
        });
      }

      // Verify activity as final step
      const activity = approvedActivity || await storage.verifyWashoutActivity(id, userId);
      
      if (useCustomBillingModel && activityDetails.serviceType !== 'rubble_dropoff') {
        try {
          const lotteryEnabled = (await resolveLotteryEnabled(storage)).enabled;
          if (lotteryEnabled) {
            const lotteryEntry = await storage.createDriverLotteryEntry({
              driverId: driver.id,
              activityId: id,
              ownerId: owner.id,
              entriesEarned: 1,
            });
            console.log(`🎰 Lottery entry created for driver ${driver.id}, entry ID: ${lotteryEntry.id}`);
          } else {
            console.log(`🎰 Lottery program disabled — no entry created for driver ${driver.id} on washout ${id}`);
          }
        } catch (lotteryError: any) {
          console.error(`❌ Failed to create lottery entry for washout ${id}:`, lotteryError);
          // Don't fail the transaction - lottery entry is nice-to-have
        }
      }
      
      const compensationType = useCustomBillingModel ? 'lottery entry' : `$${driverAmount}`;
      console.log(`✅ Washout ${id} fully processed: Payment completed, driver received ${compensationType}, activity verified`);
      approvalResponseMessage = "Washout approved and payment completed.";
      approvalResponsePaymentStatus = "completed";
      approvalResponsePayoutStatus = "completed";

      res.json({
        ...activity,
        message: approvalResponseMessage,
        paymentStatus: approvalResponsePaymentStatus,
        payoutStatus: approvalResponsePayoutStatus,
      });
    } catch (error) {
      const dbError = summarizeDatabaseError(error, {
        phase: "washout-approval",
        table: "washout_activities",
      });
      console.error("Error verifying activity:", {
        error,
        dbError,
        approvalDebugContext,
        query: typeof error === "object" && error && "query" in error ? (error as { query?: string }).query : undefined,
        params: typeof error === "object" && error && "params" in error ? (error as { params?: unknown[] }).params : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (approvedActivity) {
        return res.json({
          ...approvedActivity,
          message: approvalResponseMessage,
          paymentStatus: approvalResponsePaymentStatus || undefined,
          payoutStatus: approvalResponsePayoutStatus || undefined,
          deferReason: approvalResponseDeferReason || undefined,
          warning: errorMessage,
        });
      }
      res.status(500).json({
        message: "Failed to verify activity",
        error: errorMessage,
        details: {
          ...approvalDebugContext,
          dbError,
        },
      });
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

  app.post('/api/admin/payments/process-awaiting-driver-stripe', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const paymentId = typeof req.body?.paymentId === 'string' ? req.body.paymentId : null;
      const awaitingPayments: any[] = paymentId
        ? [await storage.getPaymentById(paymentId)].filter(Boolean)
        : await storage.getPaymentsAwaitingDriverStripe();

      if (awaitingPayments.length === 0) {
        return res.json({
          message: 'No deferred driver Stripe payments found',
          processed: 0,
          skipped: 0,
          failed: 0,
          results: [],
        });
      }

      const results: Array<Record<string, unknown>> = [];
      let processed = 0;
      let skipped = 0;
      let failed = 0;

      for (const payment of awaitingPayments) {
        if (!payment) continue;

        try {
          const activityDetails = await storage.getWashoutActivity(payment.activityId);
          if (!activityDetails) {
            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: 'Activity not found',
            });
            continue;
          }

          const owner = await storage.getOwnerById(payment.ownerId);
          if (!owner) {
            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: 'Owner not found',
            });
            continue;
          }

          const ownerUser = await storage.getUser(owner.userId);
          if (!ownerUser) {
            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: 'Owner user not found',
            });
            continue;
          }

          const driver = await storage.getDriverById(payment.driverId);
          if (!driver) {
            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: 'Driver not found',
            });
            continue;
          }

          const driverUser = await storage.getUser(driver.userId);
          if (!driverUser) {
            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: 'Driver user not found',
            });
            continue;
          }

          const readiness = await resolveDriverStripeReadiness(driverUser);
          if (!readiness.ready) {
            const heldReason = `${readiness.reason || payment.deferReason || 'Driver Stripe not ready'} - owner-funded tip held for onboarding`;
            await db
              .update(payments)
              .set({
                deferReason: heldReason,
                updatedAt: new Date(),
              })
              .where(eq(payments.id, payment.id));

            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: heldReason,
              paymentStatus: payment.status,
              payoutStatus: payment.payoutStatus,
            });
            continue;
          }

          if (!ownerUser.stripeCustomerId || !ownerUser.stripePaymentMethodId) {
            await db
              .update(payments)
              .set({
                deferReason: 'Owner payment method missing',
                updatedAt: new Date(),
              })
              .where(eq(payments.id, payment.id));

            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: 'Owner payment method missing',
              paymentStatus: payment.status,
              payoutStatus: payment.payoutStatus,
            });
            continue;
          }

          const paymentMethod = await stripe.paymentMethods.retrieve(ownerUser.stripePaymentMethodId);
          if (paymentMethod.type !== 'card' && paymentMethod.type !== 'link') {
            await db
              .update(payments)
              .set({
                deferReason: `Unsupported payment method type (${paymentMethod.type})`,
                updatedAt: new Date(),
              })
              .where(eq(payments.id, payment.id));

            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: `Unsupported payment method type (${paymentMethod.type})`,
              paymentStatus: payment.status,
              payoutStatus: payment.payoutStatus,
            });
            continue;
          }

          const driverAmount = Number(payment.amount);
          const platformFee = Number(payment.processingFee);
          const driverTip = Number((payment as any).tipAmountCents || 0) / 100;
          const ownerFee = calculateOwnerWashoutChargeCents(driverAmount * 100, Math.round(platformFee * 100), Math.round(driverTip * 100)) / 100;

          await db
            .update(payments)
            .set({
              payoutStatus: 'processing',
              updatedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));

          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(ownerFee * 100),
            currency: 'usd',
            customer: ownerUser.stripeCustomerId,
            payment_method: ownerUser.stripePaymentMethodId,
            payment_method_types: ['card', 'link'],
            capture_method: 'automatic',
            off_session: true,
            confirm: true,
            description: `Washout payment - Activity ${payment.activityId}`,
            metadata: {
              activityId: payment.activityId,
              ownerId: owner.id,
              driverId: driver.id,
              driverAmount: driverAmount.toFixed(2),
              platformFee: platformFee.toFixed(2),
              driverTip: driverTip.toFixed(2),
              businessDate: payment.businessDate || '',
            },
            transfer_data: {
              destination: driverUser.stripeConnectAccountId,
            },
            application_fee_amount: Math.round(platformFee * 100),
          });

          if (paymentIntent.status !== 'succeeded') {
            await db
              .update(payments)
              .set({
                payoutStatus: 'not_started',
                deferReason: `Payment status: ${paymentIntent.status}`,
                updatedAt: new Date(),
              })
              .where(eq(payments.id, payment.id));

            skipped += 1;
            results.push({
              paymentId: payment.id,
              status: 'skipped',
              reason: `Payment status: ${paymentIntent.status}`,
              paymentStatus: payment.status,
            });
            continue;
          }

          await finalizeChargedWashoutPayment({
            paymentId: payment.id,
            paymentIntentId: paymentIntent.id,
            owner,
            driver,
            driverUser,
            activityId: payment.activityId,
            activityLocation: activityDetails.locationId ? await storage.getWashoutLocation(activityDetails.locationId) : null,
            ownerFee,
            driverAmount,
            platformFee,
            useCustomBillingModel: owner.useCustomBillingModel === true,
            activityDetails,
            businessDate: payment.businessDate || '',
          });

          processed += 1;
          results.push({
            paymentId: payment.id,
            status: 'processed',
            paymentStatus: 'completed',
            payoutStatus: 'completed',
            paymentIntentId: paymentIntent.id,
          });
        } catch (error: any) {
          failed += 1;
          console.error('❌ Failed to process deferred driver Stripe payment:', {
            paymentId: payment.id,
            activityId: payment.activityId,
            ownerId: payment.ownerId,
            driverId: payment.driverId,
            error: error?.message,
          });
          results.push({
            paymentId: payment.id,
            status: 'failed',
            error: error?.message || 'Unknown error',
          });
        }
      }

      res.json({
        message: 'Deferred driver Stripe payments processed',
        processed,
        skipped,
        failed,
        results,
      });
    } catch (error: any) {
      console.error('❌ Error processing deferred driver Stripe payments:', error);
      res.status(500).json({
        message: 'Failed to process deferred driver Stripe payments',
        error: error.message,
      });
    }
  });

  // GET /api/owners/profile - Get owner profile with payment method details
  app.get('/api/owners/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const response: any = {
        stripePaymentMethodId: owner.stripePaymentMethodId,
      };

      // If owner has a payment method, fetch details from Stripe
      if (owner.stripePaymentMethodId) {
        try {
          const paymentMethod = await stripe.paymentMethods.retrieve(owner.stripePaymentMethodId);
          if (paymentMethod.type === 'card' && paymentMethod.card) {
            response.paymentMethod = {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expiryMonth: paymentMethod.card.exp_month,
              expiryYear: paymentMethod.card.exp_year,
            };
          }
        } catch (stripeError) {
          console.error("Error fetching payment method from Stripe:", stripeError);
          // Don't fail the request if Stripe lookup fails
        }
      }

      res.json(response);
    } catch (error: any) {
      console.error("Error fetching owner profile:", error);
      res.status(500).json({ message: "Failed to fetch profile: " + error.message });
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
          businessWebsite: req.body.businessWebsite || owner.businessWebsite,
          // Stripe verification fields
          dateOfBirth: req.body.dateOfBirth || owner.dateOfBirth,
          ssnLast4: req.body.ssnLast4 || owner.ssnLast4,
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
        street: req.body.street,
        city: req.body.city,
        state: req.body.state,
        zip: req.body.zip,
        paymentMethod: req.body.paymentMethod,
        role: currentUser.role, // Preserve existing role
      });

      // Create or update Stripe account with complete verification info
      let stripeAccountId = currentUser.stripeConnectAccountId;
      
      // If no Stripe account exists, create one
      if (!stripeAccountId) {
        try {
          console.log(`📝 No Stripe account found for owner ${currentUser.username}, creating one...`);
          const connectedAccount = await stripeService.createConnectedAccount({
            type: 'express',
            userId: userId,
            username: currentUser.username,
            email: currentUser.email || '',
            businessType: 'company',
          });
          stripeAccountId = connectedAccount.id;
          
          // Update user with new Stripe account ID
          await storage.updateUserStripeInfo(userId, { stripeConnectAccountId: stripeAccountId });
          console.log(`✅ Created Stripe account ${stripeAccountId} for owner ${currentUser.username}`);
        } catch (createError: any) {
          console.error('Error creating Stripe account for owner:', createError.message);
          // Continue with profile update even if Stripe account creation fails
        }
      }
      
      // Now update the Stripe account with verification info
      let stripeSyncStatus = { synced: false, error: null as string | null, requirements: [] as string[] };
      
      if (stripeAccountId && owner) {
        try {
          await stripeService.updateConnectedAccountWithCompleteInfo(
            stripeAccountId,
            {
              firstName: req.body.firstName || currentUser.firstName,
              lastName: req.body.lastName || currentUser.lastName,
              email: req.body.email || currentUser.email,
              phone: req.body.phone || currentUser.phone,
              street: req.body.street || currentUser.street,
              city: req.body.city || currentUser.city,
              state: req.body.state || currentUser.state,
              zip: req.body.zip || currentUser.zip,
              companyName: req.body.companyName || owner.companyName,
              businessWebsite: req.body.businessWebsite || owner.businessWebsite,
              taxId: req.body.taxId || owner.taxId,
              dateOfBirth: req.body.dateOfBirth || owner.dateOfBirth,
              ssnLast4: req.body.ssnLast4 || owner.ssnLast4,
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              ip: extractIPv4(req) || '0.0.0.0'
            }
          );
          
          // Fetch updated requirements after sync
          const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
          stripeSyncStatus = {
            synced: true,
            error: null,
            requirements: stripeAccount.requirements?.currently_due || [],
          };
          console.log(`✅ Updated Stripe account ${stripeAccountId} with owner verification info`);
        } catch (stripeError: any) {
          console.error('Note: Could not update Stripe with verification info:', stripeError.message);
          stripeSyncStatus = {
            synced: false,
            error: stripeError.message,
            requirements: [],
          };
        }
      }

      res.json({ 
        message: "Profile updated successfully",
        stripeSyncStatus,
      });
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
      if (!user) {
        return res.status(404).json({ message: "User not found" });
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

      // Check for idempotency - if already agreed, check if they need Stripe account
      if (driver.hasAgreedToTerms) {
        // If they agreed but don't have Stripe account, create one now (migration support)
        if (!driver.stripeConnectAccountId) {
          try {
            console.log(`🔧 Migrating driver ${driver.id} - creating missing Stripe Connect account...`);
            const connectAccount = await stripeService.createConnectedAccount({
              type: 'express', // Express accounts for marketplace - auto-activate capabilities
              userId: userId, // REQUIRED - prevents duplicates
              username: user.username,
              email: user.email,
              businessType: 'individual',
              individual: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone || undefined
              }
            });
            await storage.updateDriver(driver.id, {
              stripeConnectAccountId: connectAccount.id
            });
            console.log(`✅ Migration complete: Stripe Connect account ${connectAccount.id} created for driver ${driver.id}`);
            return res.json({ 
              success: true, 
              message: "Terms already accepted, payment account now configured",
              agreedAt: driver.termsAgreedAt
            });
          } catch (stripeError: any) {
            console.error('Failed to create Stripe Connect account during migration:', stripeError);
            return res.status(500).json({ message: "Failed to configure payment account" });
          }
        }
        
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

      // Create Stripe Connect account for driver if they don't have one
      let stripeConnectAccountId = driver.stripeConnectAccountId;
      if (!stripeConnectAccountId) {
        try {
          console.log(`🔵 Creating Stripe Connect account for driver ${driver.id}...`);
          const connectAccount = await stripeService.createConnectedAccount({
            type: 'express', // Express accounts for marketplace - auto-activate capabilities
            userId: userId, // REQUIRED - prevents duplicates
            username: user.username,
            email: user.email,
            businessType: 'individual',
            individual: {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone || undefined
            }
          });
          stripeConnectAccountId = connectAccount.id;
          console.log(`✅ Stripe Connect account created: ${stripeConnectAccountId}`);
        } catch (stripeError: any) {
          console.error('Failed to create Stripe Connect account for driver:', stripeError);
          // Continue anyway - they can retry later
        }
      }

      // Safe partial update - only update the fields we need to change
      await storage.updateDriver(driver.id, {
        hasAgreedToTerms: true,
        termsAgreedAt: now,
        ...(stripeConnectAccountId && !driver.stripeConnectAccountId ? { stripeConnectAccountId } : {})
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

  // Debit card request endpoints
  // Get debit card request status
  app.get('/api/drivers/debit-card-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const driver = await storage.getDriver(userId);
      
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const cardRequest = await storage.getDebitCardRequestByDriverId(driver.id);
      
      if (!cardRequest) {
        return res.json({ hasRequested: false });
      }

      res.json({
        hasRequested: true,
        status: cardRequest.cardStatus,
        cardLast4: cardRequest.cardLast4,
        requestedAt: cardRequest.requestedAt,
        issuedAt: cardRequest.issuedAt,
        activatedAt: cardRequest.activatedAt
      });
    } catch (error) {
      console.error("Error getting debit card status:", error);
      res.status(500).json({ message: "Failed to get card status" });
    }
  });

  // Get driver's debit card status
  app.get('/api/drivers/debit-card', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Only drivers can access debit cards" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Fetch the driver's debit card if they have one
      const debitCard = await db
        .select()
        .from(debitCardRequests)
        .where(eq(debitCardRequests.driverId, driver.id))
        .limit(1);

      if (debitCard.length === 0) {
        return res.json({ hasCard: false });
      }

      const card = debitCard[0];
      return res.json({
        hasCard: true,
        card: {
          id: card.id,
          cardType: card.cardType,
          cardLast4: card.cardLast4,
          cardStatus: card.cardStatus,
          expirationMonth: card.expirationMonth,
          expirationYear: card.expirationYear,
          requestedAt: card.requestedAt,
          issuedAt: card.issuedAt,
        }
      });
    } catch (error: any) {
      console.error("Error fetching debit card status:", error);
      return res.status(500).json({ message: "Failed to fetch debit card status" });
    }
  });

  // Request a debit card (Stripe Issuing)
  app.post('/api/drivers/request-debit-card', isAuthenticated, async (req: any, res) => {
    try {
      // Check if Stripe Issuing is enabled via feature flag
      const issuingFlag = await storage.getFeatureFlag('issuing_enabled');
      const isIssuingEnabled = issuingFlag?.enabled || false;
      
      if (!isIssuingEnabled) {
        console.log('📋 Stripe Issuing disabled via feature flag');
        return res.status(403).json({ 
          message: "Debit cards are currently unavailable. Drivers receive payments directly to their bank accounts via Stripe Connect.",
          featureDisabled: true
        });
      }
      
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      // Verify user is a driver
      if (!user || user.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }

      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      // Check if driver has Stripe accounts set up - if not, create them automatically
      if (!driver.stripeConnectAccountId) {
        console.log('⚠️  Driver missing Stripe Connect account, creating one...');
        
        try {
          const connectAccount = await stripeService.createConnectedAccount({
            type: 'express', // Express accounts for marketplace - auto-activate capabilities
            userId: userId, // REQUIRED - prevents duplicates
            username: user.username,
            email: user.email,
            businessType: 'individual',
            individual: {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone || undefined
            }
          });

          await storage.updateDriver(driver.id, {
            stripeConnectAccountId: connectAccount.id,
          });

          driver.stripeConnectAccountId = connectAccount.id;
          console.log('✅ Stripe Connect account created:', connectAccount.id);
        } catch (error) {
          console.error('❌ Stripe Connect account creation failed:', error);
          return res.status(400).json({ 
            message: "Account setup failed. Please try again or contact support.",
          });
        }
      }

      // Check if Treasury is enabled before creating Financial Account for driver
      const treasuryFlag = await storage.getFeatureFlag('treasury_enabled');
      const isTreasuryEnabled = treasuryFlag?.enabled || false;
      
      if (!driver.stripeTreasuryAccountId && isTreasuryEnabled) {
        console.log('⚠️  Driver missing Stripe Treasury account, attempting to create one...');
        
        try {
          const treasuryAccount = await stripeService.createFinancialAccount(driver.stripeConnectAccountId!);

          await storage.updateDriver(driver.id, {
            stripeTreasuryAccountId: treasuryAccount.id,
          });

          driver.stripeTreasuryAccountId = treasuryAccount.id;
          console.log('✅ Stripe Treasury account created:', treasuryAccount.id);
        } catch (error) {
          console.error('❌ Stripe Treasury account creation failed (sandbox limitation):', error);
          // Treasury not available in sandbox - continue without it for debit card
          console.log('⚠️  Continuing without Treasury (sandbox mode) - card will still be created');
        }
      } else if (!isTreasuryEnabled) {
        console.log('ℹ️ Stripe Treasury disabled via feature flag - skipping Financial Account creation');
      }

      // Check if driver has Stripe Issuing cardholder
      // If missing, create one automatically (only if issuing is enabled - checked above)
      // Note: issuing_enabled flag already checked at top of this endpoint
      if (!driver.stripeIssuingCardholderId) {
        console.log('⚠️  Driver missing Stripe Issuing cardholder, creating one...');
        
        try {
          // Use actual user address - don't use hardcoded defaults
          const billingAddress = {
            line1: user.street || '',
            city: user.city || '',
            state: user.state || '',
            postal_code: user.zip || '',
            country: 'US',
          };
          
          // Validate address before creating cardholder
          if (!billingAddress.line1 || !billingAddress.city || !billingAddress.state || !billingAddress.postal_code) {
            return res.status(400).json({
              message: 'Please complete your address in your profile before requesting a debit card.',
              missingFields: ['street', 'city', 'state', 'zip'].filter(f => !user[f as keyof typeof user]),
            });
          }
          
            const cardholder = await stripeService.createCardholder({
              connectedAccountId: driver.stripeConnectAccountId,
              name: `${user.firstName} ${user.lastName}`,
              email: user.email,
              phone: user.phone || undefined,
              billing: {
                address: billingAddress,
              },
            });

          await storage.updateDriver(driver.id, {
            stripeIssuingCardholderId: cardholder.id,
          });

          // Refresh driver data
          const updatedDriver = await storage.getDriver(userId);
          if (updatedDriver) {
            Object.assign(driver, updatedDriver);
          }

          console.log('✅ Stripe Issuing cardholder created:', cardholder.id);
        } catch (cardholderError) {
          console.error('❌ Cardholder creation failed:', cardholderError);
          return res.status(400).json({ 
            message: "Card setup failed. Please contact support.",
            error: cardholderError instanceof Error ? cardholderError.message : 'Unknown error'
          });
        }
      }

      // Check if driver already has a card request
      const existingRequest = await storage.getDebitCardRequestByDriverId(driver.id);
      if (existingRequest && existingRequest.cardStatus !== 'cancelled') {
        return res.status(400).json({ 
          message: "Card request already exists",
          status: existingRequest.cardStatus 
        });
      }

      // Validate request data
      const { shippingName, shippingStreet, shippingCity, shippingState, shippingZip, cardType } = req.body;
      
      if (!shippingName || !shippingStreet || !shippingCity || !shippingState || !shippingZip) {
        return res.status(400).json({ message: "All shipping address fields are required" });
      }

      const requestedCardType = cardType || 'virtual'; // Default to virtual ($0.01), physical is $0.30

      // Create debit card via Stripe Issuing
      let stripeCard;
      try {
        stripeCard = await stripeService.issueCard({
          connectedAccountId: driver.stripeConnectAccountId || '',
          cardholderId: driver.stripeIssuingCardholderId!,
          cardType: requestedCardType,
          financialAccountId: driver.stripeTreasuryAccountId || undefined, // Optional in sandbox
          shipping: requestedCardType === 'physical' ? {
            name: shippingName,
            address: {
              line1: shippingStreet,
              city: shippingCity,
              state: shippingState,
              postal_code: shippingZip,
              country: 'US',
            },
          } : undefined,
        });
        console.log(`✅ Stripe Issuing card created: ${stripeCard.id}, last4: ${stripeCard.last4}`);
      } catch (cardError: any) {
        console.error("❌ Stripe card creation failed:", cardError.message);
        return res.status(500).json({ 
          message: "Failed to create debit card",
          error: cardError.message 
        });
      }

      // Map Stripe card status to our status enum
      // Stripe statuses: active, inactive, canceled, pending
      // Our enum: requested, processing, issued, active, blocked, cancelled
      let cardStatus: 'requested' | 'processing' | 'issued' | 'active' | 'blocked' | 'cancelled' = 'processing';
      if (stripeCard.status === 'active') {
        cardStatus = 'active';
      } else if (stripeCard.status === 'inactive') {
        cardStatus = 'issued';
      } else if (stripeCard.status === 'canceled') {
        cardStatus = 'cancelled';
      }

      // Create debit card request record with Stripe card details
      const cardRequest = await storage.createDebitCardRequest({
        driverId: driver.id,
        userId: userId,
        shippingName,
        shippingStreet,
        shippingCity,
        shippingState,
        shippingZip,
        cardType: requestedCardType,
        cardStatus,
        stripeIssuingCardId: stripeCard.id,
        cardLast4: stripeCard.last4,
        expirationMonth: stripeCard.exp_month.toString(),
        expirationYear: stripeCard.exp_year.toString(),
      });

      console.log(`💳 Debit card requested for driver ${driver.id} - ${shippingName} (${requestedCardType})`);

      res.json({
        success: true,
        message: `Debit card request submitted successfully (${requestedCardType === 'virtual' ? '$0.01' : '$0.30 with 2-day shipping'})`,
        requestId: cardRequest.id,
        status: cardRequest.cardStatus,
        cardType: requestedCardType,
        fee: requestedCardType === 'virtual' ? 0.01 : 0.30
      });
    } catch (error) {
      console.error("Error requesting debit card:", error);
      res.status(500).json({ message: "Failed to request debit card" });
    }
  });

  // Create Stripe payment intent for $15.00 membership fee
  app.post('/api/owners/create-membership-payment', isAuthenticated, async (req: any, res) => {
    try {
      console.log('🔍 [MEMBERSHIP] Starting membership payment creation for user:', req.user?.id);
      
      const userId = req.user.id;
      
      console.log('🔍 [MEMBERSHIP] Fetching user from database...');
      const user = await storage.getUser(userId);
      console.log('🔍 [MEMBERSHIP] User found:', !!user, user ? `(${user.username})` : '');
      
      console.log('🔍 [MEMBERSHIP] Fetching owner from database...');
      const owner = await storage.getOwner(userId);
      console.log('🔍 [MEMBERSHIP] Owner found:', !!owner, owner ? `(id: ${owner.id})` : '');

      if (!user || !owner) {
        console.log('❌ [MEMBERSHIP] User or owner not found in database');
        return res.status(404).json({ message: "User or owner not found" });
      }

      console.log('🔍 [MEMBERSHIP] Wallet status:', owner.walletStatus);
      if (owner.walletStatus === 'active') {
        console.log('❌ [MEMBERSHIP] Membership already activated');
        return res.status(400).json({ message: "Membership already activated" });
      }

      // Additional check: Query Stripe for existing successful membership payments
      console.log('🔍 [MEMBERSHIP] Checking for duplicate payments in Stripe...');
      if (owner.stripeCustomerId) {
        try {
          const existingPayments = await stripe.paymentIntents.list({
            customer: owner.stripeCustomerId,
            limit: 10,
          });

          const successfulMembershipPayment = existingPayments.data.find(
            pi => pi.metadata?.transaction_type === 'membership_fee' && 
                  pi.status === 'succeeded' &&
                  pi.amount === 1500
          );

          if (successfulMembershipPayment) {
            console.log('❌ [MEMBERSHIP] Duplicate payment prevented! Found existing payment:', successfulMembershipPayment.id);
            return res.status(400).json({ 
              message: "Membership fee already paid. Please contact support if you believe this is an error.",
              existingPaymentId: successfulMembershipPayment.id
            });
          }
        } catch (error) {
          console.error('⚠️ [MEMBERSHIP] Error checking for duplicates:', error);
          // Continue - don't block payment due to check failure
        }
      }

      const membershipFee = 1500; // $15.00 in cents
      const hasSavedPaymentMethod = !!(owner.stripeCustomerId && owner.stripePaymentMethodId);
      
      console.log('🔍 [MEMBERSHIP] Payment method status:', {
        hasSaved: hasSavedPaymentMethod,
        customerId: owner.stripeCustomerId,
        paymentMethodId: owner.stripePaymentMethodId
      });
      
      if (hasSavedPaymentMethod) {
        // Use saved payment method - backend confirms automatically
        console.log('🔍 [MEMBERSHIP] Using saved payment method - auto-confirming...');
        const paymentIntent = await stripeService.createMembershipPaymentIntent({
          amount: membershipFee,
          customerEmail: user.email,
          userId: userId,
          username: user.username,
          customerId: owner.stripeCustomerId,
          paymentMethodId: owner.stripePaymentMethodId,
          metadata: {
            ownerId: owner.id,
            plan: 'annual'
          }
        });

        console.log(`✅ [MEMBERSHIP] Payment auto-confirmed: ${paymentIntent.id} - Status: ${paymentIntent.status}`);

        // Return success with payment already completed
        res.json({ 
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          usedSavedPaymentMethod: true
        });
      } else {
        // No saved payment method - create unconfirmed intent for frontend
        console.log('🔍 [MEMBERSHIP] No saved payment method - creating intent for frontend...');
        const paymentIntent = await stripeService.createMembershipPaymentIntent({
          amount: membershipFee,
          customerEmail: user.email,
          userId: userId,
          username: user.username,
          metadata: {
            ownerId: owner.id,
            plan: 'annual'
          }
        });

        console.log(`✅ [MEMBERSHIP] Created payment intent for frontend: ${paymentIntent.id}`);

        res.json({ 
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          usedSavedPaymentMethod: false
        });
      }
    } catch (error: any) {
      console.error("❌ [MEMBERSHIP] Error creating membership payment:", {
        message: error.message,
        stack: error.stack,
        type: error.type,
        code: error.code
      });
      res.status(500).json({ 
        message: "Failed to create payment intent",
        error: error.message 
      });
    }
  });

  // Owner subscription activation (requires Stripe payment verification)
  app.post('/api/owners/subscribe', isAuthenticated, async (req: any, res) => {
    try {
      console.log("Owner subscription request started for user:", req.user.id);
      
      const userId = req.user.id;
      const { paymentIntentId } = req.body;
      
      const user = await storage.getUser(userId);
      const owner = await storage.getOwner(userId);

      console.log("User found:", !!user, "Owner found:", !!owner);

      if (!user || !owner) {
        console.log("User or owner not found");
        return res.status(404).json({ message: "User or owner not found" });
      }

      if (owner.walletStatus === 'active') {
        console.log("Wallet already active");
        return res.json({ message: "Wallet already active" });
      }

      // Verify Stripe payment was successful
      if (!paymentIntentId) {
        return res.status(400).json({ message: "Payment intent ID required" });
      }

      if (!stripe) {
        return res.status(500).json({ message: "Payment processing is not configured" });
      }

      console.log("Verifying Stripe payment intent:", paymentIntentId);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        console.log("Payment not completed:", paymentIntent.status);
        return res.status(400).json({ 
          message: "Payment not completed", 
          status: paymentIntent.status 
        });
      }

      if (paymentIntent.amount !== 1500) { // $15.00 in cents
        return res.status(400).json({ message: "Invalid payment amount" });
      }

      console.log("✅ Payment verified - $15.00 received via Stripe");
      console.log("Setting up Stripe Connect and Treasury wallet, activating subscription...");
      
      // Check if Treasury is enabled via feature flag
      const treasuryFlag = await storage.getFeatureFlag('treasury_enabled');
      const isTreasuryEnabled = treasuryFlag?.enabled || false;
      console.log(`📋 Feature Flag: treasury_enabled = ${isTreasuryEnabled}`);
      
      // Create or reuse Stripe Connected Account (Treasury is optional)
      let connectedAccount, treasuryAccount;
      let walletStatus: 'active' | 'pending_verification' = 'active'; // Default to active - Connect account is sufficient
      let treasuryUnavailable = false;
      
      try {
        // Check if Connect Account already exists
        if (owner.stripeConnectAccountId) {
          console.log("♻️ Reusing existing Stripe Connect account:", owner.stripeConnectAccountId);
          connectedAccount = { id: owner.stripeConnectAccountId };
        } else {
          // IMPORTANT: Validate required fields before creating Stripe account
          const { checkProfileCompleteness, formatPhoneE164, parseDateOfBirth, generateBusinessUrl } = await import('./stripeUtils');
          
          const completeness = checkProfileCompleteness({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            street: user.street,
            city: user.city,
            state: user.state,
            zip: user.zip,
            dateOfBirth: owner?.dateOfBirth,
            ssnLast4: owner?.ssnLast4,
          });
          
          if (!completeness.isComplete) {
            return res.status(400).json({
              message: 'Please complete your profile before activating membership',
              missingFields: completeness.missingRequired,
              warnings: completeness.warnings,
            });
          }
          
          // Parse DOB for Stripe format
          const dob = parseDateOfBirth(owner?.dateOfBirth);
          if (!dob) {
            return res.status(400).json({
              message: 'Invalid date of birth format. Please update your profile.',
            });
          }
          
          // Create new Stripe Connect Account with REAL user data
          connectedAccount = await stripeService.createConnectedAccount({
            type: 'express',
            userId: userId,
            username: user.username,
            email: user.email,
            businessType: 'individual',
            individual: {
              firstName: user.firstName!,
              lastName: user.lastName!,
              email: user.email,
              phone: formatPhoneE164(user.phone),
              address: {
                line1: user.street!,
                city: user.city!,
                state: user.state!,
                postalCode: user.zip!,
                country: 'US',
              },
              dob,
              ssn: owner?.ssnLast4,
            },
            businessProfile: {
              url: generateBusinessUrl(user.username, 'owner'),
              mcc: '7542',
            },
          });
          console.log("✅ Created Stripe Connect account:", connectedAccount.id);
        }

        // Try to create Stripe Treasury Financial Account (wallet) - ONLY if feature flag enabled
        if (isTreasuryEnabled) {
          try {
            treasuryAccount = await stripeService.createFinancialAccount(connectedAccount.id);
            console.log("✅ Created Stripe Treasury account:", treasuryAccount.id);
          } catch (treasuryError: any) {
            // Treasury is optional - continue without it
            console.log("ℹ️ Stripe Treasury not available - wallet will use database balance tracking");
            console.log("Treasury error:", treasuryError.message);
            treasuryUnavailable = true;
            // Keep walletStatus as 'active' - Treasury isn't required for basic functionality
          }
        } else {
          console.log("ℹ️ Stripe Treasury disabled via feature flag - wallet will use database balance tracking");
          treasuryUnavailable = true;
        }
      } catch (error: any) {
        console.error("Failed to create Stripe Connect account:", error);
        return res.status(500).json({ 
          message: "Payment received but failed to create account. Please contact support.",
          error: error.message 
        });
      }

      // Update owner with Stripe info and subscription
      await storage.updateOwner(owner.id, { 
        stripeConnectAccountId: connectedAccount.id,
        stripeTreasuryAccountId: treasuryAccount?.id || null,
        walletStatus: walletStatus,
        subscriptionPlan: 'annual', // One-time membership
        subscriptionStatus: 'active',
        isApproved: true, // Auto-approve after successful payment
        stripeCustomerId: paymentIntent.customer as string || null,
        stripePaymentIntentId: paymentIntentId,
        membershipPaymentMethod: 'stripe',
        membershipActivatedAt: new Date()
      });

      // Record the $15.00 membership payment in fees_ledger for tracking
      const today = new Date();
      const periodStart = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const oneYearLater = new Date(today);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const periodEnd = oneYearLater.toISOString().split('T')[0]; // YYYY-MM-DD
      
      await storage.createFeeLedgerEntry({
        ownerId: owner.id,
        feeType: 'subscription_annual',
        amountCents: 1500, // $15.00 in cents
        periodStart,
        periodEnd,
        status: 'paid',
        stripeTransferId: paymentIntentId, // Store payment intent ID
        paidAt: new Date(),
        metadata: {
          paymentMethod: 'stripe',
          stripeCustomerId: paymentIntent.customer as string || null,
          stripeConnectAccountId: connectedAccount.id
        }
      });

      console.log("✅ Subscription activated successfully and payment recorded in fees_ledger");

      const responseMessage = treasuryUnavailable 
        ? "Membership activated! Your wallet is ready to use with card payments. ACH transfers will be enabled when Stripe Treasury is approved."
        : "Membership activated! Your wallet is fully operational with card and ACH payment options.";

      res.json({
        success: true,
        connectAccountId: connectedAccount.id,
        treasuryAccountId: treasuryAccount?.id || null,
        message: responseMessage,
        walletStatus: walletStatus,
        paymentStatus: 'completed',
        treasuryUnavailable: treasuryUnavailable, // Keep for backward compatibility
        hasTreasury: !treasuryUnavailable // Add for forward compatibility
      });
    } catch (error: any) {
      console.error("Subscription error:", {
        message: error.message,
        stack: error.stack
      });
      res.status(500).json({ 
        message: "Failed to create subscription",
        error: error.message 
      });
    }
  });

  // Payment handling for additional features
  app.post('/api/payments/create-payment-intent', isAuthenticated, async (req: any, res) => {
    try {
      console.log("Payment request - processing via Stripe");
      
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

      // Check subscription status - approved owners with active subscription or active wallet
      const isSubscriptionActive = owner.subscriptionStatus === 'active' || 
                                    (owner.isApproved && owner.subscriptionPlan !== 'none');
      
      const subscriptionData = {
        status: isSubscriptionActive ? 'active' : 'inactive',
        plan: owner.subscriptionPlan || 'wallet', // Show actual plan
        walletBalance: owner.walletBalance,
        walletStatus: owner.walletStatus,
        isApproved: owner.isApproved,
        subscriptionPlan: owner.subscriptionPlan,
      };

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
      const paymentMethods = await storage.getOwnerPaymentMethods(owner.id) as OwnerFundingSource[];
      
      // Format for frontend
      const formattedMethods = paymentMethods.map((method) => ({
        id: method.id,
        type: method.type,
        last4: method.last4,
        ...(method.type === 'card' ? {
          expiryMonth: method.expiryMonth,
          expiryYear: method.expiryYear,
          cardholderName: method.cardholderName || method.accountHolderName || method.bankName
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

      // For bank accounts, store details for Stripe Treasury external account verification
      // TODO: Implement Stripe Treasury external account verification flow
      // Stripe Treasury requires micro-deposit verification or instant verification via Plaid
      let externalAccountId = null;
      if ((type === 'bank_account' || type === 'ach') && accountNumber && routingNumber) {
        console.log('Bank account details stored for Stripe Treasury verification...');
        // External account will be verified via Stripe Treasury flows in production
        externalAccountId = `pending_verification_${Date.now()}`;
      }

      // Normalize type for database (convert bank_account to ach)
      const dbType = type === 'bank_account' ? 'ach' : type;
      
      // Create payment method record in database
      const paymentMethodData = {
        ownerId: owner.id,
        type: dbType,
        last4: type === 'card' ? cardNumber.slice(-4) : accountNumber.slice(-4),
        ...(type === 'card' ? {
          expiryMonth,
          expiryYear,
          cardholderName
        } : {
          bankName,
          accountHolderName,
          routingNumber,
          accountNumber,
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
            accountHolderName: savedMethod.accountHolderName,
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

  // COLUMN WALLET API ENDPOINTS FOR OWNERS

  // Helper function to check and manage low balance alerts for owners
  async function checkAndManageLowBalanceAlert(owner: any, userId: string) {
    const balance = parseFloat(owner.walletBalance || '0');
    const threshold = parseFloat(owner.lowBalanceThreshold || '100');
    const isLowBalance = balance < threshold;

    if (isLowBalance) {
      // Trigger auto top-up if enabled
      if (owner.autoTopupEnabled) {
        const autoTopupAmount = parseFloat(owner.autoTopupAmount || '500');
        console.log(`⚡ Auto top-up check for owner ${owner.id}: balance $${balance}, threshold $${threshold}, top-up amount $${autoTopupAmount}`);
        
        try {
          // Get default funding source
          const fundingSources = await storage.getOwnerFundingSources(owner.id) as OwnerFundingSource[];
          const defaultSource = fundingSources.find((fs) => fs.isDefault && fs.isActive);
          
          if (!defaultSource) {
            console.warn(`No default funding source found for auto top-up (owner ${owner.id})`);
            // Create notification about missing funding source
            await storage.createNotification({
              userId: userId,
              title: 'Auto Top-up Unable to Process',
              message: `Your wallet balance is low but auto top-up requires a default payment method. Please add a payment method.`,
              type: 'auto_topup_failed',
              isRead: false,
              data: {}
            });
          } else if (!owner.stripeTreasuryAccountId) {
            console.warn(`Owner ${owner.id} has no Stripe Treasury account for auto top-up`);
          } else {
            // TODO: Implement Stripe Treasury external account ACH debit for auto top-up
            // Requires: Stripe Treasury OutboundPayment API with verified external bank account
            console.warn(`Auto top-up with Stripe Treasury not yet implemented for owner ${owner.id}`);
            await storage.createNotification({
              userId: userId,
              title: 'Auto Top-up Unavailable',
              message: `Auto top-up is temporarily unavailable. Please fund your wallet manually.`,
              type: 'auto_topup_failed',
              isRead: false,
              data: {}
            });
          }
        } catch (error: any) {
          console.error(`Auto top-up failed for owner ${owner.id}:`, error.message);
          // Create notification about auto top-up failure
          await storage.createNotification({
            userId: userId,
            title: 'Auto Top-up Failed',
            message: `We were unable to automatically fund your wallet. Please fund your wallet manually or check your payment method.`,
            type: 'auto_topup_failed',
            isRead: false,
            data: { error: error.message }
          });
        }
      } else {
        // Create low balance notification if auto top-up is disabled
        const existingNotifications = await storage.getNotificationsByUser(userId);
        const hasLowBalanceAlert = (existingNotifications as Notification[]).some((n) => n.type === 'low_balance' && !n.isRead);
        
        if (!hasLowBalanceAlert) {
          await storage.createNotification({
            userId: userId,
            title: 'Low Balance Alert',
            message: `Your wallet balance ($${balance.toFixed(2)}) is below your threshold of $${threshold.toFixed(2)}. Please fund your wallet to continue service.`,
            type: 'low_balance',
            isRead: false,
            data: { balance: balance.toFixed(2), threshold: threshold.toFixed(2) }
          });
          console.log(`Created low balance alert for owner ${owner.id}`);
        }
      }
    } else {
      // Clear any low balance notifications
      await storage.clearNotificationsByType(userId, 'low_balance');
      console.log(`Cleared low balance alerts for owner ${owner.id}`);
    }
  }

  // GET /api/owners/wallet - Get owner's wallet data (balance, status, settings)
  app.get('/api/owners/wallet', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Default to database values (used when Treasury is unavailable)
      let balance = owner.walletBalance || '0.00';
      let status = owner.walletStatus || 'pending_verification';

      // If owner has Stripe Treasury account, fetch live balance and sync to database
      if (owner.stripeTreasuryAccountId && owner.stripeConnectAccountId) {
        try {
          const treasuryBalance = await stripeService.getTreasuryBalance({
            connectedAccountId: owner.stripeConnectAccountId,
            financialAccountId: owner.stripeTreasuryAccountId,
          });
          
          if (treasuryBalance) {
            // Convert from cents to dollars
            balance = (treasuryBalance.balance / 100).toFixed(2);
            
            // Sync the balance to database if it differs
            const currentBalance = parseFloat(owner.walletBalance || '0');
            const treasuryBalanceDollars = parseFloat(balance);
            if (treasuryBalanceDollars !== currentBalance) {
              await db
                .update(owners)
                .set({
                  walletBalance: balance,
                  walletStatus: 'active',
                  updatedAt: new Date()
                })
                .where(eq(owners.id, owner.id));
              
              console.log(`💰 Stripe Treasury balance synced: $${currentBalance} -> $${treasuryBalanceDollars}`);
            }
            
            status = 'active';
          }
        } catch (error: any) {
          console.error(`Stripe Treasury API error for owner ${owner.id}:`, error.message);
          // Fall back to database value
        }
      }

      const walletData = {
        balance,
        status,
        isConfigured: true,
        lowBalanceThreshold: owner.lowBalanceThreshold || '100.00',
        autoTopupEnabled: owner.autoTopupEnabled || false,
        autoTopupAmount: owner.autoTopupAmount || '500.00',
        walletId: `wallet_${owner.id}`,
        stripeConnectAccountId: owner.stripeConnectAccountId,
        stripeTreasuryAccountId: owner.stripeTreasuryAccountId,
        hasStripeAccount: !!owner.stripeConnectAccountId, // Only require Connect account; Treasury is optional
        createdAt: owner.createdAt
      };

      res.json(walletData);
    } catch (error: any) {
      console.error("Error getting owner wallet:", error);
      res.status(500).json({ message: "Failed to get wallet data: " + error.message });
    }
  });

  // POST /api/owners/column/onboard - Create Stripe accounts for owner (legacy endpoint name)
  app.post('/api/owners/column/onboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const user = await storage.getUser(userId);
      
      if (!owner || !user) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Check if already fully onboarded (both accounts exist)
      if (owner.stripeConnectAccountId && owner.stripeTreasuryAccountId) {
        return res.json({ 
          success: true,
          message: "Payment account already configured",
          connectAccountId: owner.stripeConnectAccountId,
          treasuryAccountId: owner.stripeTreasuryAccountId,
          alreadyOnboarded: true
        });
      }

      const { companyName, businessLicense, taxId, address } = req.body;

      if (!companyName || !taxId || !address) {
        return res.status(400).json({ 
          message: "Missing required fields: companyName, taxId, and address are required" 
        });
      }

      // Create or reuse Stripe Connect Account
      let connectedAccount;
      if (owner.stripeConnectAccountId) {
        // Already has Connect account from subscription
        connectedAccount = { id: owner.stripeConnectAccountId };
      } else {
        try {
          // IMPORTANT: Validate required fields before creating Stripe account
          const { checkProfileCompleteness, formatPhoneE164, parseDateOfBirth, generateBusinessUrl } = await import('./stripeUtils');
          
          const completeness = checkProfileCompleteness({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            street: address.line1,
            city: address.city,
            state: address.state,
            zip: address.postalCode,
            dateOfBirth: owner?.dateOfBirth,
            ssnLast4: owner?.ssnLast4,
          });
          
          if (!completeness.isComplete) {
            return res.status(400).json({
              message: 'Please complete your profile before onboarding',
              missingFields: completeness.missingRequired,
              warnings: completeness.warnings,
            });
          }
          
          // Parse DOB for Stripe format
          const dob = parseDateOfBirth(owner?.dateOfBirth);
          if (!dob) {
            return res.status(400).json({
              message: 'Invalid date of birth format. Please update your profile.',
            });
          }
          
          connectedAccount = await stripeService.createConnectedAccount({
            type: 'express',
            userId: userId,
            username: user.username,
            email: user.email,
            businessType: 'individual',
            individual: {
              firstName: user.firstName!,
              lastName: user.lastName!,
              email: user.email,
              phone: formatPhoneE164(user.phone),
              address: {
                line1: address.line1,
                city: address.city,
                state: address.state,
                postalCode: address.postalCode,
                country: 'US',
              },
              dob,
              ssn: owner?.ssnLast4,
            },
            businessProfile: {
              url: generateBusinessUrl(user.username, 'owner'),
              mcc: '7542',
            },
          });
        } catch (error: any) {
          return res.status(500).json({ 
            message: "Failed to create payment account",
            error: error.message 
          });
        }
      }

      // Try to create Stripe Treasury Financial Account
      let treasuryAccount;
      let walletStatus: 'active' | 'pending_verification' = 'active';
      let treasuryUnavailable = false;
      
      try {
        treasuryAccount = await stripeService.createFinancialAccount(connectedAccount.id);
      } catch (error: any) {
        // Check if this is a Treasury access issue
        if (error.message?.includes('treasury') || error.message?.includes('onboarded')) {
          console.log("⚠️ Stripe Treasury not available - onboarding will proceed without wallet features");
          console.log("Treasury error:", error.message);
          treasuryUnavailable = true;
          walletStatus = 'pending_verification';
        } else {
          // Some other error - return error
          return res.status(500).json({ 
            message: "Failed to create wallet account",
            error: error.message 
          });
        }
      }

      // Store Stripe IDs in database
      await storage.updateOwner(owner.id, {
        stripeConnectAccountId: connectedAccount.id,
        stripeTreasuryAccountId: treasuryAccount?.id || null,
      });

      // Update company info
      await db
        .update(owners)
        .set({
          companyName,
          businessLicense,
          taxId,
          walletStatus: walletStatus,
          updatedAt: new Date()
        })
        .where(eq(owners.id, owner.id));

      const responseMessage = treasuryUnavailable 
        ? "Payment account created - wallet features require Stripe Treasury approval"
        : "Payment account created successfully";

      res.json({
        success: true,
        message: responseMessage,
        connectAccountId: connectedAccount.id,
        treasuryAccountId: treasuryAccount?.id || null,
        treasuryUnavailable: treasuryUnavailable
      });
    } catch (error: any) {
      console.error("Error onboarding owner:", error);
      res.status(500).json({ message: "Failed to complete onboarding: " + error.message });
    }
  });

  // POST /api/owners/wallet/sync - Sync wallet balance from Stripe Treasury
  app.post('/api/owners/wallet/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      if (!owner.stripeTreasuryAccountId || !owner.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: "No payment account found. Please complete onboarding first.",
          needsOnboarding: true
        });
      }

      // Fetch balance from Stripe Treasury
      const treasuryBalance = await stripeService.getTreasuryBalance({
        connectedAccountId: owner.stripeConnectAccountId,
        financialAccountId: owner.stripeTreasuryAccountId,
      });
      
      if (!treasuryBalance) {
        return res.status(500).json({ message: "Failed to fetch account data" });
      }

      // Convert balance from cents to dollars
      const balance = (treasuryBalance.balance / 100).toFixed(2);
      const currentBalance = parseFloat(owner.walletBalance || '0');
      const balanceFloat = parseFloat(balance);

      // Update database balance to match Stripe Treasury
      if (balanceFloat !== currentBalance) {
        await db
          .update(owners)
          .set({
            walletBalance: balance,
            updatedAt: new Date()
          })
          .where(eq(owners.id, owner.id));

        console.log(`Synced balance for owner ${owner.id}: ${currentBalance} -> ${balance}`);
      }

      res.json({
        success: true,
        message: "Balance synced successfully",
        balance: balance,
        previousBalance: currentBalance.toFixed(2),
        syncedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error syncing wallet balance:", error);
      res.status(500).json({ message: "Failed to sync balance: " + error.message });
    }
  });

  // GET /api/owners/funding-sources - Get owner's funding sources
  app.get('/api/owners/funding-sources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Get funding sources from database
      const fundingSources = await storage.getOwnerFundingSources(owner.id) as OwnerFundingSource[];
      
      // Format for frontend
      const formattedSources = fundingSources.map((source) => ({
        id: source.id,
        sourceType: (source.type === 'ach' || source.type === 'bank_account') ? 'bank_account' : 'credit_card',
        bankName: source.bankName || undefined,
        accountNumberLast4: (source.type === 'ach' || source.type === 'bank_account') ? source.last4 : undefined,
        accountType: (source.type === 'ach' || source.type === 'bank_account') ? 'checking' : undefined,
        cardBrand: (source.type === 'credit_card' || source.type === 'debit_card') ? source.cardBrand : undefined,
        cardLast4: (source.type === 'credit_card' || source.type === 'debit_card') ? source.last4 : undefined,
        expiryMonth: source.expiryMonth || undefined,
        expiryYear: source.expiryYear || undefined,
        isPrimary: source.isDefault,
        isVerified: source.isActive,
        status: source.isActive ? 'active' : 'inactive',
        createdAt: source.createdAt?.toISOString() ?? new Date().toISOString()
      }));

      res.json(formattedSources);
    } catch (error: any) {
      console.error("Error getting funding sources:", error);
      res.status(500).json({ message: "Failed to get funding sources: " + error.message });
    }
  });

  // POST /api/owners/create-setup-intent - Create Stripe Setup Intent for saving payment method
  app.post('/api/owners/create-setup-intent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const user = await storage.getUser(userId);
      
      if (!owner || !user) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Create or get Stripe Customer with error recovery
      let customerId = owner.stripeCustomerId;
      
      // If we have a customer ID, verify it exists in Stripe
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
          console.log(`✅ Verified existing Stripe Customer: ${customerId} for owner ${user.username}`);
        } catch (error: any) {
          if (error.code === 'resource_missing') {
            console.log(`⚠️  Customer ${customerId} not found in Stripe, creating new customer for ${user.username}`);
            customerId = null; // Force creation of new customer
          } else {
            throw error; // Re-throw unexpected errors
          }
        }
      }
      
      // Create new customer if needed
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: user.id,
            username: user.username,
          },
        });
        customerId = customer.id;
        await storage.updateOwner(owner.id, { stripeCustomerId: customerId });
        console.log(`✅ Created new Stripe Customer: ${customerId} for owner ${user.username}`);
      }

      // Create Setup Intent for future payments
      // Use automatic payment methods for better compatibility
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never', // Prevent redirect-based payment methods
        },
        usage: 'off_session', // Allow charging without customer present
        metadata: {
          userId: user.id,
          ownerId: owner.id,
          purpose: 'monthly_location_fees',
        },
      });

      console.log(`✅ Created Setup Intent: ${setupIntent.id} for owner ${user.username}`);

      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating setup intent:", error);
      res.status(500).json({ message: "Failed to create setup intent: " + error.message });
    }
  });

  // POST /api/owners/save-payment-method - Save payment method after Stripe Elements confirms
  app.post('/api/owners/save-payment-method', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { paymentMethodId } = req.body;

      if (!paymentMethodId) {
        return res.status(400).json({ message: "Payment method ID required" });
      }

      // Retrieve payment method details from Stripe
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      console.log(`🔍 Payment method details: type=${paymentMethod.type}, id=${paymentMethod.id}`);

      // Accept card and link payment methods (Link is Stripe's saved payment method system)
      if (paymentMethod.type !== 'card' && paymentMethod.type !== 'link') {
        console.error(`❌ Unsupported payment method type: ${paymentMethod.type}`);
        return res.status(400).json({ message: `Unsupported payment method type: ${paymentMethod.type}. Please use a credit or debit card.` });
      }
      
      // For Link payment methods, we need to handle differently
      // Link payment methods store the underlying card info
      const cardDetails = paymentMethod.type === 'card' ? paymentMethod.card : null;

      // Set as default payment method for the customer
      if (owner.stripeCustomerId) {
        await stripe.customers.update(owner.stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }

      // Store payment method ID in owners table (for location creation checks)
      await storage.updateOwner(owner.id, { 
        stripePaymentMethodId: paymentMethodId 
      });

      // Also create entry in ownerFundingSources table (for payment methods page display)
      // First check if this payment method already exists
      const existingSources = await storage.getOwnerFundingSources(owner.id) as OwnerFundingSource[];
      const existingCard = existingSources.find((s) => s.stripePaymentMethodId === paymentMethodId);
      
      if (!existingCard) {
        // Determine if there are any other sources to decide on default
        const shouldBeDefault = existingSources.length === 0;
        
        // Handle both card and link payment methods
        const fundingType = cardDetails?.funding === 'debit' ? 'debit_card' : 'credit_card';
        const brand = cardDetails?.brand || 'link';
        const last4 = cardDetails?.last4 || 'link';
        
        await storage.createOwnerFundingSource({
          ownerId: owner.id,
          type: fundingType,
          bankName: brand,
          last4: last4,
          stripePaymentMethodId: paymentMethodId,
          isDefault: shouldBeDefault,
          isActive: true,
        });
      }

      console.log(`✅ Saved payment method ${paymentMethodId} (type: ${paymentMethod.type}) for owner ${owner.id}`);

      res.json({
        message: "Payment method saved successfully",
        paymentMethod: {
          id: paymentMethodId,
          brand: cardDetails?.brand || 'link',
          last4: cardDetails?.last4 || '****',
          expiryMonth: cardDetails?.exp_month || null,
          expiryYear: cardDetails?.exp_year || null,
        },
      });
    } catch (error: any) {
      console.error("Error saving payment method:", error);
      res.status(500).json({ message: "Failed to save payment method: " + error.message });
    }
  });

  // POST /api/admin/backfill-owner-payment-methods - Backfill payment methods from Stripe for existing owners
  app.post('/api/admin/backfill-owner-payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      // Check super admin role
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ message: "Unauthorized - super admin only" });
      }

      console.log('🔄 Starting owner payment method backfill...');
      
      // Get all owners
      const allOwners = await storage.getAllOwners();
      
      const results = {
        total: allOwners.length,
        alreadyHadPaymentMethod: 0,
        backfilled: 0,
        noStripeCustomer: 0,
        noPaymentMethodInStripe: 0,
        errors: [] as string[],
      };

      for (const owner of allOwners) {
        try {
          // Skip if already has payment method
          if (owner.stripePaymentMethodId) {
            results.alreadyHadPaymentMethod++;
            continue;
          }

          // Skip if no Stripe customer
          if (!owner.stripeCustomerId) {
            results.noStripeCustomer++;
            continue;
          }

          // Get default payment method from Stripe
          const customer = await stripe.customers.retrieve(owner.stripeCustomerId);
          
          if (customer.deleted) {
            results.errors.push(`Owner ${owner.id}: Stripe customer deleted`);
            continue;
          }

          const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method;
          
          if (!defaultPaymentMethodId) {
            results.noPaymentMethodInStripe++;
            continue;
          }

          // Update owner record with payment method
          await storage.updateOwner(owner.id, {
            stripePaymentMethodId: defaultPaymentMethodId as string,
          });

          console.log(`✅ Backfilled payment method for owner ${owner.id}: ${defaultPaymentMethodId}`);
          results.backfilled++;

        } catch (error: any) {
          console.error(`❌ Error backfilling owner ${owner.id}:`, error);
          results.errors.push(`Owner ${owner.id}: ${error.message}`);
        }
      }

      console.log('✅ Payment method backfill complete:', results);
      res.json(results);

    } catch (error: any) {
      console.error("Error in payment method backfill:", error);
      res.status(500).json({ message: "Failed to backfill payment methods: " + error.message });
    }
  });

  // POST /api/admin/migrate-custom-to-express - Migrate existing Custom accounts to Express accounts
  app.post('/api/admin/migrate-custom-to-express', isAuthenticated, async (req: any, res) => {
    try {
      // Check super admin role
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ message: "Unauthorized - super admin only" });
      }

      // Check if Stripe is initialized
      if (!stripe) {
        return res.status(503).json({ 
          message: "Stripe is not configured.",
          details: "This operation requires Stripe to be initialized."
        });
      }

      console.log('🔄 Starting migration from Custom to Express accounts...');
      
      // Get all drivers with Stripe Connect accounts
      const allUsers = await db.select().from(users).where(eq(users.role, 'driver'));
      
      const results = {
        totalDrivers: allUsers.length,
        processed: 0,
        migrated: 0,
        errors: [] as string[],
      };

      for (const user of allUsers) {
        if (!user.stripeConnectAccountId) {
          continue; // Skip drivers without Connect accounts
        }

        results.processed++;

        try {
          // Get the existing account from Stripe
          const existingAccount = await stripe.accounts.retrieve(user.stripeConnectAccountId);
          
          // Check if it's a Custom account
          if (existingAccount.type === 'custom') {
            console.log(`🔄 Migrating driver ${user.username} from Custom to Express...`);
            
            // Delete the old Custom account
            try {
              await stripe.accounts.del(user.stripeConnectAccountId);
              console.log(`✅ Deleted Custom account: ${user.stripeConnectAccountId}`);
            } catch (deleteError: any) {
              console.error(`⚠️ Error deleting Custom account: ${deleteError.message}`);
              // Continue anyway - account might already be deleted
            }

            // Get IP for TOS acceptance
            const manualIp = req.body?.ipOverride;
            const adminIp = manualIp || extractIPv4(req);
            if (!adminIp) {
              results.errors.push(`${user.username}: No valid IPv4 address. Provide ipOverride.`);
              continue;
            }

            // Create new Express account
            const newExpressAccount = await stripeService.createConnectedAccount({
              userId: user.id,
              username: user.username,
              email: user.email,
              type: 'express',
              businessType: 'individual',
              capabilities: ['card_payments', 'transfers'],
              individual: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone || undefined
              },
              businessProfile: {
                mcc: '7542',
                url: process.env.REPLIT_DEV_DOMAIN || 'https://creteexchange.com',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@creteexchange.com'
              },
              tosAcceptance: {
                date: Math.floor(Date.now() / 1000),
                ip: adminIp
              }
            });

            // Update user record with new Express account
            await storage.updateUserStripeInfo(user.id, {
              stripeConnectAccountId: newExpressAccount.id
            });

            console.log(`✅ Migrated ${user.username}: ${user.stripeConnectAccountId} → ${newExpressAccount.id}`);
            results.migrated++;
          } else {
            console.log(`✅ Driver ${user.username} already has Express account - no migration needed`);
          }
        } catch (error: any) {
          console.error(`❌ Error migrating user ${user.username}:`, error);
          results.errors.push(`${user.username}: ${error.message}`);
        }
      }

      console.log('✅ Migration complete:', results);
      res.json(results);

    } catch (error: any) {
      console.error("Error in Custom→Express migration:", error);
      res.status(500).json({ message: "Failed to migrate accounts: " + error.message });
    }
  });

  // POST /api/admin/backfill-stripe-accounts - Create Stripe accounts for existing users
  app.post('/api/admin/backfill-stripe-accounts', isAuthenticated, async (req: any, res) => {
    try {
      // Check super admin role
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ message: "Unauthorized - super admin only" });
      }

      // Check if Stripe is initialized
      if (!stripe) {
        return res.status(503).json({ 
          message: "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable to enable payment processing.",
          details: "This operation requires Stripe to be initialized. Contact platform administrator."
        });
      }

      // Get manual IP override if provided (for IPv6-only networks)
      const manualIp = req.body?.ipOverride;
      if (manualIp && !isValidIPv4(manualIp)) {
        return res.status(400).json({ 
          message: "Invalid IP override provided. Must be a valid IPv4 address (e.g., 192.168.1.1)." 
        });
      }

      console.log('🔄 Starting Stripe account backfill...', manualIp ? `(Manual IP: ${manualIp})` : '');
      
      // Get all users
      const allUsers = await db.select().from(users);
      
      const results = {
        totalUsers: allUsers.length,
        driversProcessed: 0,
        driversCreated: 0,
        driversAlreadyHad: 0,
        ownersProcessed: 0,
        ownersCreated: 0,
        ownersAlreadyHad: 0,
        errors: [] as string[],
      };

      for (const user of allUsers) {
        try {
          if (user.role === 'driver') {
            results.driversProcessed++;
            
            // Skip if already has Connect account in database
            if (user.stripeConnectAccountId) {
              results.driversAlreadyHad++;
              continue;
            }

            // IDEMPOTENCY CHECK: Search Stripe for existing account by email
            // Note: Connect accounts can't be searched by metadata, so we search by email
            try {
              const existingAccounts = await stripe.accounts.list({
                limit: 100, // Fetch more accounts to search through
              });
              
              // Check if account with this user's email or userId exists
              const matchingAccount = existingAccounts.data.find(
                acc => acc.email === user.email || acc.metadata?.userId === user.id
              );
              
              if (matchingAccount) {
                console.log(`♻️ Found existing Stripe Connect account for driver ${user.username}: ${matchingAccount.id}`);
                
                // Update database with found account
                await storage.updateUserStripeInfo(user.id, {
                  stripeConnectAccountId: matchingAccount.id
                });
                
                results.driversAlreadyHad++;
                continue;
              }
            } catch (searchError: any) {
              console.error(`⚠️ Error searching for existing account for ${user.username}:`, searchError.message);
              // Continue to create new account if search fails
            }

            // Get admin IP for TOS acceptance (backfill is admin action, Stripe requires IPv4)
            // Try manual override first, then auto-detect
            const adminIp = manualIp || extractIPv4(req);
            if (!adminIp) {
              results.errors.push(`${user.username} (driver): No valid IPv4 address found. Provide ipOverride in request body for IPv6-only networks.`);
              continue;
            }
            
            // Create Stripe Connect account (Express type for marketplace)
            // Express accounts auto-activate capabilities without manual verification
            const stripeAccount = await stripeService.createConnectedAccount({
              userId: user.id,
              username: user.username,
              email: user.email,
              type: 'express', // Express accounts for marketplace - auto-activate capabilities
              businessType: 'individual',
              capabilities: ['card_payments', 'transfers'],
              individual: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone || undefined
              },
              businessProfile: {
                mcc: '7542', // MCC for Car Washes (washout services)
                url: process.env.REPLIT_DEV_DOMAIN || 'https://creteexchange.com',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@creteexchange.com'
              },
              tosAcceptance: {
                date: Math.floor(Date.now() / 1000),
                ip: adminIp // Real admin IPv4 performing backfill
              }
            });

            // Update user record
            await storage.updateUserStripeInfo(user.id, {
              stripeConnectAccountId: stripeAccount.id
            });

            console.log(`✅ Created Stripe Connect account for driver ${user.username}: ${stripeAccount.id}`);
            results.driversCreated++;

          } else if (user.role === 'owner') {
            results.ownersProcessed++;
            
            // Skip if already has Customer account in database
            if (user.stripeCustomerId) {
              results.ownersAlreadyHad++;
              continue;
            }

            // Check if Stripe is initialized
            if (!stripe) {
              results.errors.push(`${user.username} (owner): Stripe not initialized`);
              continue;
            }

            // IDEMPOTENCY CHECK: Search Stripe for existing customer by metadata
            try {
              const existingCustomers = await stripe.customers.search({
                query: `metadata['userId']:'${user.id}'`,
                limit: 1,
              });
              
              if (existingCustomers.data.length > 0) {
                const matchingCustomer = existingCustomers.data[0];
                console.log(`♻️ Found existing Stripe Customer for owner ${user.username}: ${matchingCustomer.id}`);
                
                // Update database with found customer
                await storage.updateUserStripeInfo(user.id, {
                  stripeCustomerId: matchingCustomer.id
                });
                
                results.ownersAlreadyHad++;
                continue;
              }
            } catch (searchError: any) {
              console.error(`⚠️ Error searching for existing customer for ${user.username}:`, searchError.message);
              // Continue to create new customer if search fails
            }

            // Create Stripe Customer
            const stripeCustomer = await stripe.customers.create({
              email: user.email,
              name: `${user.firstName} ${user.lastName}`,
              metadata: {
                userId: user.id,
                username: user.username,
                role: 'owner'
              }
            });

            // Update user record
            await storage.updateUserStripeInfo(user.id, {
              stripeCustomerId: stripeCustomer.id
            });

            console.log(`✅ Created Stripe Customer for owner ${user.username}: ${stripeCustomer.id}`);
            results.ownersCreated++;
          }

        } catch (error: any) {
          console.error(`❌ Error backfilling user ${user.username}:`, error);
          results.errors.push(`${user.username} (${user.role}): ${error.message}`);
        }
      }

      console.log('✅ Stripe account backfill complete:', results);
      res.json(results);

    } catch (error: any) {
      console.error("Error in Stripe account backfill:", error);
      res.status(500).json({ message: "Failed to backfill Stripe accounts: " + error.message });
    }
  });

  // ==================== ADMIN STRIPE DIAGNOSTIC & VERIFICATION TOOLS ====================
  
  // GET /api/admin/stripe/account/:userId - Get full Stripe account details for debugging
  app.get('/api/admin/stripe/account/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getUser(req.user.id);
      if (adminUser?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { userId } = req.params;
      const targetUser = await storage.getUser(userId);
      
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!targetUser.stripeConnectAccountId) {
        return res.status(404).json({ 
          message: "User does not have a Stripe Connect account",
          user: {
            id: targetUser.id,
            username: targetUser.username,
            role: targetUser.role,
          }
        });
      }

      // Fetch full Stripe account details
      const stripeAccount = await stripe.accounts.retrieve(targetUser.stripeConnectAccountId);
      
      // Get role-specific data
      let roleData = null;
      if (targetUser.role === 'driver') {
        roleData = await storage.getDriver(userId);
      } else if (targetUser.role === 'owner') {
        roleData = await storage.getOwner(userId);
      }

      // Translate requirements to human-readable format
      const { translateStripeRequirement } = await import('./stripeUtils');
      const currentlyDue = stripeAccount.requirements?.currently_due || [];
      const eventuallyDue = stripeAccount.requirements?.eventually_due || [];
      const pastDue = stripeAccount.requirements?.past_due || [];

      res.json({
        user: {
          id: targetUser.id,
          username: targetUser.username,
          role: targetUser.role,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          email: targetUser.email,
          phone: targetUser.phone,
          address: {
            street: targetUser.street,
            city: targetUser.city,
            state: targetUser.state,
            zip: targetUser.zip,
          },
        },
        roleData: roleData ? {
          dateOfBirth: roleData.dateOfBirth,
          ssnLast4: roleData.ssnLast4 ? '****' : null,
          businessWebsite: roleData.businessWebsite,
          companyName: roleData.companyName,
        } : null,
        stripeAccount: {
          id: stripeAccount.id,
          type: stripeAccount.type,
          charges_enabled: stripeAccount.charges_enabled,
          payouts_enabled: stripeAccount.payouts_enabled,
          details_submitted: stripeAccount.details_submitted,
          created: stripeAccount.created ? new Date(stripeAccount.created * 1000).toISOString() : new Date().toISOString(),
          capabilities: stripeAccount.capabilities,
          requirements: {
            currently_due: currentlyDue,
            currently_due_readable: currentlyDue.map(translateStripeRequirement),
            eventually_due: eventuallyDue,
            eventually_due_readable: eventuallyDue.map(translateStripeRequirement),
            past_due: pastDue,
            past_due_readable: pastDue.map(translateStripeRequirement),
            disabled_reason: stripeAccount.requirements?.disabled_reason,
          },
          business_profile: stripeAccount.business_profile,
          individual: stripeAccount.individual ? {
            first_name: stripeAccount.individual.first_name,
            last_name: stripeAccount.individual.last_name,
            email: stripeAccount.individual.email,
            phone: stripeAccount.individual.phone,
            dob: stripeAccount.individual.dob,
            ssn_last_4_provided: stripeAccount.individual.ssn_last_4_provided,
            id_number_provided: stripeAccount.individual.id_number_provided,
            verification: stripeAccount.individual.verification,
            address: stripeAccount.individual.address,
          } : null,
          tos_acceptance: stripeAccount.tos_acceptance,
          external_accounts: stripeAccount.external_accounts?.data?.length || 0,
        },
      });

    } catch (error: any) {
      console.error("Error fetching Stripe account details:", error);
      res.status(500).json({ message: "Failed to fetch Stripe account details: " + error.message });
    }
  });

  // GET /api/admin/stripe/verification-audit - Audit all accounts for verification issues
  app.get('/api/admin/stripe/verification-audit', isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getUser(req.user.id);
      if (adminUser?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { translateStripeRequirement } = await import('./stripeUtils');
      const allUsers = await storage.getAllUsers();
      
      const auditResults = {
        totalUsers: 0,
        usersWithStripeAccounts: 0,
        accountsNeedingAction: [] as any[],
        accountsFullyVerified: 0,
        accountsWithBlockingRequirements: 0,
        accountsWithExternalAccounts: 0,
        summary: {
          drivers: { total: 0, verified: 0, needsAction: 0 },
          owners: { total: 0, verified: 0, needsAction: 0 },
        },
      };

      for (const user of allUsers) {
        if (!['driver', 'owner'].includes(user.role)) continue;
        
        auditResults.totalUsers++;
        
        if (user.role === 'driver') auditResults.summary.drivers.total++;
        if (user.role === 'owner') auditResults.summary.owners.total++;
        
        if (!user.stripeConnectAccountId) continue;
        
        auditResults.usersWithStripeAccounts++;
        
        try {
          const stripeAccount = await stripe.accounts.retrieve(user.stripeConnectAccountId);
          const currentlyDue = stripeAccount.requirements?.currently_due || [];
          const isFullyVerified = 
            (user.role === 'driver' && stripeAccount.payouts_enabled) ||
            (user.role === 'owner' && stripeAccount.charges_enabled && stripeAccount.payouts_enabled);
          
          if (stripeAccount.external_accounts?.data?.length) {
            auditResults.accountsWithExternalAccounts++;
          }
          
          if (isFullyVerified && currentlyDue.length === 0) {
            auditResults.accountsFullyVerified++;
            if (user.role === 'driver') auditResults.summary.drivers.verified++;
            if (user.role === 'owner') auditResults.summary.owners.verified++;
          } else {
            auditResults.accountsWithBlockingRequirements++;
            if (user.role === 'driver') auditResults.summary.drivers.needsAction++;
            if (user.role === 'owner') auditResults.summary.owners.needsAction++;
            
            auditResults.accountsNeedingAction.push({
              userId: user.id,
              username: user.username,
              role: user.role,
              stripeAccountId: stripeAccount.id,
              charges_enabled: stripeAccount.charges_enabled,
              payouts_enabled: stripeAccount.payouts_enabled,
              details_submitted: stripeAccount.details_submitted,
              requirements: currentlyDue,
              requirements_readable: currentlyDue.map(translateStripeRequirement),
              hasExternalAccount: (stripeAccount.external_accounts?.data?.length || 0) > 0,
            });
          }
        } catch (error: any) {
          auditResults.accountsNeedingAction.push({
            userId: user.id,
            username: user.username,
            role: user.role,
            stripeAccountId: user.stripeConnectAccountId,
            error: error.message,
          });
        }
      }

      res.json(auditResults);

    } catch (error: any) {
      console.error("Error running verification audit:", error);
      res.status(500).json({ message: "Failed to run verification audit: " + error.message });
    }
  });

  // POST /api/admin/stripe/sync-verification/:userId - Force sync user verification info to Stripe
  app.post('/api/admin/stripe/sync-verification/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getUser(req.user.id);
      if (adminUser?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { userId } = req.params;
      const targetUser = await storage.getUser(userId);
      
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!targetUser.stripeConnectAccountId) {
        return res.status(404).json({ message: "User does not have a Stripe Connect account" });
      }

      // Get role-specific data
      let roleData = null;
      if (targetUser.role === 'driver') {
        roleData = await storage.getDriver(userId);
      } else if (targetUser.role === 'owner') {
        roleData = await storage.getOwner(userId);
      }

      // Sync to Stripe
      const { formatPhoneE164, parseDateOfBirth, generateBusinessUrl } = await import('./stripeUtils');
      
      try {
        await stripeService.updateConnectedAccountWithCompleteInfo(
          targetUser.stripeConnectAccountId,
          {
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            email: targetUser.email,
            phone: targetUser.phone ?? undefined,
            street: targetUser.street ?? undefined,
            city: targetUser.city ?? undefined,
            state: targetUser.state ?? undefined,
            zip: targetUser.zip ?? undefined,
            dateOfBirth: roleData?.dateOfBirth,
            ssnLast4: roleData?.ssnLast4,
            businessWebsite: roleData?.businessWebsite || generateBusinessUrl(targetUser.username, targetUser.role === 'owner' ? 'owner' : 'driver'),
            companyName: roleData && 'companyName' in roleData ? roleData.companyName : undefined,
          },
          {
            timestamp: Math.floor(Date.now() / 1000),
            ip: extractIPv4(req) || '0.0.0.0'
          }
        );

        // Get updated account status
        const stripeAccount = await stripe.accounts.retrieve(targetUser.stripeConnectAccountId);
        
        res.json({
          message: "Verification info synced successfully",
          accountStatus: {
            charges_enabled: stripeAccount.charges_enabled,
            payouts_enabled: stripeAccount.payouts_enabled,
            requirements: stripeAccount.requirements?.currently_due || [],
          },
        });
      } catch (syncError: any) {
        res.status(400).json({
          message: "Failed to sync verification info",
          error: syncError.message,
        });
      }

    } catch (error: any) {
      console.error("Error syncing verification:", error);
      res.status(500).json({ message: "Failed to sync verification: " + error.message });
    }
  });

  // FINANCIAL CONNECTIONS: Create session for instant bank verification (OWNERS)
  app.post('/api/owners/bank-connect/session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Ensure owner has Stripe Customer ID
      if (!user.stripeCustomerId) {
        const customer = await stripeService.createCustomer({
          userId,
          username: user.username,
          email: user.email,
        });

        await storage.updateUserStripeInfo(userId, {
          stripeCustomerId: customer.id
        });
        
        user.stripeCustomerId = customer.id;
      }

      // Create Financial Connections session for owner
      // Force HTTPS for return URL (Stripe requirement) - always use HTTPS for production
      const host = req.get('host') || '';
      const protocol = (host.includes('replit') || host.includes('localhost')) && req.protocol === 'http' ? 'https' : req.protocol;
      const session = await stripeService.createFinancialConnectionsSession({
        userType: 'owner',
        customerId: user.stripeCustomerId,
        returnUrl: `${protocol}://${host}/owner/payment-methods`,
      });

      res.json({
        clientSecret: session.client_secret,
        sessionId: session.id,
      });
    } catch (error: any) {
      console.error('Error creating bank link session:', error);
      res.status(500).json({
        message: 'Failed to create bank link session',
        error: error.message
      });
    }
  });

  // FINANCIAL CONNECTIONS: Complete bank linking (OWNERS)
  app.post('/api/owners/bank-connect/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID required' });
      }

      const owner = await storage.getOwner(userId);
      if (!owner) {
        return res.status(404).json({ message: 'Owner not found' });
      }

      // Get payment method from Financial Connections
      const paymentMethod = await stripeService.getFinancialConnectionsPaymentMethod(sessionId);
      
      if (!paymentMethod || !paymentMethod.us_bank_account) {
        return res.status(400).json({ message: 'Failed to link bank account' });
      }

      const usBankAccount = paymentMethod.us_bank_account as any;

      // Save funding source to database
      const fundingSourceData = {
        ownerId: owner.id,
        type: 'ach' as const,
        isDefault: true,
        bankName: usBankAccount.bank_name || 'Bank Account',
        accountHolderName: usBankAccount.account_holder_name || '',
        last4: usBankAccount.last4,
        stripePaymentMethodId: paymentMethod.id,
      };

      await storage.createOwnerFundingSource(fundingSourceData);

      // IMPORTANT: Sync all verification info to Stripe after Financial Connections succeeds (OWNERS)
      // This ensures DOB, SSN, business website and other verification details are sent to Stripe
      const user = await storage.getUser(userId);
      if (user && user.stripeConnectAccountId) {
        try {
          console.log('📤 Syncing verification info to Stripe Connect account (Owner Financial Connections)...');
          await stripeService.updateConnectedAccountWithCompleteInfo(
            user.stripeConnectAccountId,
            {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
              street: user.street,
              city: user.city,
              state: user.state,
              zip: user.zip,
              dateOfBirth: owner.dateOfBirth,
              ssnLast4: owner.ssnLast4,
              businessWebsite: owner.businessWebsite,
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              ip: extractIPv4(req) || '0.0.0.0'
            }
          );
          console.log('✅ Verification info synced to Stripe Connect account');
        } catch (stripeError: any) {
          console.error('⚠️  Warning: Could not sync verification info to Stripe:', stripeError.message);
          // Continue - the bank account is linked, verification info will sync on next profile update
        }
      }

      res.json({
        message: 'Bank account linked successfully',
        bankName: usBankAccount.bank_name,
        last4: usBankAccount.last4,
      });
    } catch (error: any) {
      console.error('Error completing bank link:', error);
      res.status(500).json({
        message: 'Failed to complete bank link',
        error: error.message
      });
    }
  });

  // MANUAL ENTRY FALLBACK: Add a new funding source (ACH only now)
  app.post('/api/owners/funding-sources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const user = await storage.getUser(userId);
      
      if (!owner || !user) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const { 
        sourceType,
        bankName,
        accountHolderName,
        routingNumber,
        accountNumber,
      } = req.body;

      // Only ACH/bank accounts are handled here now
      // Credit cards use Stripe Elements via /create-setup-intent endpoint
      if (sourceType !== 'bank_account' && sourceType !== 'ach') {
        return res.status(400).json({ 
          message: "Use Stripe Elements for credit card setup via /create-setup-intent endpoint" 
        });
      }

      console.log(`Adding ACH funding source for owner ${owner.id}:`, { 
        bankName, 
        accountHolderName, 
        routingNumber, 
        accountNumber: accountNumber ? `${accountNumber.substring(0, 4)}****` : undefined 
      });

      // Store ACH bank account for wallet funding
      const fundingSourceData: any = {
        ownerId: owner.id,
        type: 'ach',
        isDefault: true,
        bankName,
        accountHolderName,
        routingNumber,
        accountNumber,
        last4: accountNumber.slice(-4),
      };

      // Save to database
      const savedSource = await storage.createOwnerFundingSource(fundingSourceData);

      // IMPORTANT: Sync all verification info to Stripe when manual bank account is added (OWNERS)
      // This ensures DOB, SSN, business website and other verification details are sent to Stripe
      if (user.stripeConnectAccountId) {
        try {
          console.log('📤 Syncing verification info to Stripe Connect account (Owner Manual Entry)...');
          await stripeService.updateConnectedAccountWithCompleteInfo(
            user.stripeConnectAccountId,
            {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
              street: user.street,
              city: user.city,
              state: user.state,
              zip: user.zip,
              dateOfBirth: owner.dateOfBirth,
              ssnLast4: owner.ssnLast4,
              businessWebsite: owner.businessWebsite,
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              ip: extractIPv4(req) || '0.0.0.0'
            }
          );
          console.log('✅ Verification info synced to Stripe Connect account');
        } catch (stripeError: any) {
          console.error('⚠️  Warning: Could not sync verification info to Stripe:', stripeError.message);
          // Continue - the bank account is linked, verification info will sync on next profile update
        }
      }

      res.json({
        message: "Funding source added successfully",
        source: {
          id: savedSource.id,
          sourceType: 'bank_account',
          bankName: savedSource.bankName,
          accountNumberLast4: savedSource.last4,
          isPrimary: savedSource.isDefault,
          isVerified: savedSource.isActive,
        },
      });
    } catch (error: any) {
      console.error("Error adding funding source:", error);
      res.status(500).json({ message: "Failed to add funding source: " + error.message });
    }
  });

  // GET /api/owners/wallet/transactions - Get owner's wallet transaction history
  app.get('/api/owners/wallet/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const { dateRange } = req.query;
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Calculate date filter based on range
      let startDate: Date | undefined;
      let endDate: Date | undefined = new Date();
      
      switch (dateRange) {
        case '7days':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30days':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90days':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate = undefined; // All time
          endDate = undefined;
      }

      // Get actual transactions from database
      const dbTransactions = await storage.getOwnerWalletTransactions(owner.id, startDate, endDate);
      
      // Format transactions for frontend
      const transactions = dbTransactions.map((txn: any) => ({
        id: txn.id,
        transactionType: txn.type,
        amount: txn.amount,
        description: txn.description || `${txn.type} transaction`,
        status: 'posted',
        externalTransactionId: null,
        createdAt: txn.createdAt
      }));

      res.json(transactions);
    } catch (error: any) {
      console.error("Error getting wallet transactions:", error);
      res.status(500).json({ message: "Failed to get transactions: " + error.message });
    }
  });

  // GET /api/owners/wallet/analytics - Get owner's wallet analytics
  app.get('/api/owners/wallet/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owner = await storage.getOwner(userId);
      const { dateRange } = req.query;
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Calculate date filter based on range
      let startDate: Date | undefined;
      let endDate: Date | undefined = new Date();
      let daysInRange = 30; // Default
      
      switch (dateRange) {
        case '7days':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          daysInRange = 7;
          break;
        case '30days':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 30);
          daysInRange = 30;
          break;
        case '90days':
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 90);
          daysInRange = 90;
          break;
        default:
          startDate = undefined; // All time
          endDate = undefined;
          daysInRange = 30; // Use 30 days for average calculation
      }

      // Get actual transactions from database
      const transactions = await storage.getOwnerWalletTransactions(owner.id, startDate, endDate);
      
      // Calculate analytics from real data
      let totalFunded = 0;
      let totalSpent = 0;
      
      transactions.forEach((txn: any) => {
        const amount = parseFloat(txn.amount);
        
        if (txn.type === 'topup') {
          totalFunded += amount;
        } else if (txn.type === 'payment' || txn.type === 'fee' || txn.type === 'withdrawal' || txn.type === 'washout_debit' || txn.type === 'fee_debit') {
          totalSpent += amount;
        }
      });
      
      // Calculate average monthly spend
      const monthsInRange = daysInRange / 30;
      const avgMonthlySpend = monthsInRange > 0 ? totalSpent / monthsInRange : 0;

      const analytics = {
        totalFunded: totalFunded.toFixed(2),
        totalSpent: totalSpent.toFixed(2),
        avgMonthlySpend: avgMonthlySpend.toFixed(2),
        transactionCount: transactions.length,
        dateRange: dateRange || 'all'
      };

      res.json(analytics);
    } catch (error: any) {
      console.error("Error getting wallet analytics:", error);
      res.status(500).json({ message: "Failed to get analytics: " + error.message });
    }
  });

  // POST /api/owners/wallet/fund - Fund wallet from a saved funding source
  app.post('/api/owners/wallet/fund', isAuthenticated, async (req: any, res) => {
    try {
      // Check if wallet funding feature is enabled
      const walletFundingFlag = await storage.getFeatureFlag('wallet_funding');
      if (!walletFundingFlag || !walletFundingFlag.enabled) {
        return res.status(403).json({ 
          message: "Wallet funding is currently unavailable. This feature requires Stripe Treasury approval. Please contact support for more information.",
          featureDisabled: true
        });
      }

      const userId = req.user.id;
      const { amount, fundingSourceId } = req.body;
      const user = await storage.getUser(userId);
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Note: Treasury is optional - we can fund wallets via card payments and track balance in database
      // Treasury will be used when available for enhanced features (ACH transfers, etc.)
      const hasTreasury = !!(owner.stripeTreasuryAccountId && owner.stripeConnectAccountId);

      if (!amount) {
        return res.status(400).json({ message: "Amount is required" });
      }

      if (!fundingSourceId) {
        return res.status(400).json({ message: "Funding source is required" });
      }

      const fundAmount = parseFloat(amount);
      if (isNaN(fundAmount) || fundAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Get the funding source
      const fundingSource = await storage.getOwnerFundingSourceById(fundingSourceId);
      if (!fundingSource || fundingSource.ownerId !== owner.id) {
        return res.status(404).json({ message: "Funding source not found" });
      }

      // Check Treasury feature flag EARLY - before any funding logic
      const treasuryFlag = await storage.getFeatureFlag('treasury_enabled');
      const isTreasuryEnabled = treasuryFlag?.enabled || false;
      
      // Block ACH/bank account funding if Treasury is disabled
      if (!isTreasuryEnabled && (fundingSource.type === 'bank_account' || fundingSource.type === 'ach')) {
        console.log('🚫 ACH funding blocked - treasury_enabled flag is disabled');
        return res.status(400).json({ 
          message: "ACH transfers are currently disabled. Please use a card payment method.",
          featureDisabled: true,
          treasuryDisabled: true
        });
      }

      console.log(`Funding wallet for owner ${owner.id}: $${fundAmount} from funding source ${fundingSourceId}`);

      // Handle card payments for wallet funding
      if (fundingSource.type === 'credit_card' || fundingSource.type === 'card') {
        console.log(`💳 Processing card payment for wallet funding: $${fundAmount}`);
        
        try {
          if (!user.stripeCustomerId || !fundingSource.stripePaymentMethodId) {
            return res.status(400).json({ 
              message: "Payment information incomplete. Please re-add your payment method." 
            });
          }

          // Use the dedicated wallet funding function with proper labeling
          const paymentIntent = await stripeService.createWalletFundingPayment({
            amount: Math.round(fundAmount * 100), // Convert to cents
            customerId: user.stripeCustomerId,
            paymentMethodId: fundingSource.stripePaymentMethodId,
            userId: user.id,
            username: user.username,
            metadata: {
              owner_id: owner.id,
            }
          });

          // Handle different payment statuses
          if (paymentIntent.status === 'succeeded') {
            // Payment succeeded - update wallet balance immediately
            const previousBalance = parseFloat(owner.walletBalance || '0');
            const newBalance = previousBalance + fundAmount;
            await db
              .update(owners)
              .set({
                walletBalance: newBalance.toFixed(2),
                updatedAt: new Date()
              })
              .where(eq(owners.id, owner.id));

            // Record transaction
            await db.insert(ownerWalletTransactions).values({
              ownerId: owner.id,
              type: 'funding',
              amount: fundAmount.toFixed(2),
              balanceBefore: previousBalance.toFixed(2),
              balanceAfter: newBalance.toFixed(2),
              description: `Wallet funded via card (${paymentIntent.id})`,
            });

            console.log(`✅ Card funding successful: $${fundAmount}`);
            
            return res.json({
              success: true,
              balance: newBalance.toFixed(2),
              transactionId: paymentIntent.id,
              message: "Wallet funded successfully via card"
            });
          } else if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
            // Card requires 3DS/SCA - return client secret for frontend confirmation
            console.log(`🔐 Card requires 3DS/SCA verification:`, paymentIntent.id);
            
            return res.json({
              success: false,
              requiresAction: true,
              clientSecret: paymentIntent.client_secret,
              paymentIntentId: paymentIntent.id,
              message: "Additional verification required"
            });
          } else {
            // Payment failed or in an unexpected state
            throw new Error(`Payment failed with status: ${paymentIntent.status}`);
          }
        } catch (cardError: any) {
          console.error('❌ Card payment failed:', cardError.message);
          return res.status(500).json({ 
            message: "Card payment failed: " + cardError.message 
          });
        }
      }

      // Implement Stripe Treasury ACH funding from external bank account (if Treasury is available AND enabled)
      // Note: Treasury flag already checked above - only card payments reach this point
      let transferResult;
      
      if (isTreasuryEnabled && hasTreasury && owner.stripeTreasuryAccountId && user.stripeConnectAccountId) {
        try {
          // Use Stripe Treasury InboundTransfer to pull funds from external bank account
          // The fundingSource contains the Stripe payment method ID
          if (!fundingSource.stripePaymentMethodId) {
            return res.status(400).json({ 
              message: "Bank account not verified. Please re-add your funding source." 
            });
          }

          console.log(`🏦 Initiating Stripe Treasury InboundTransfer: $${fundAmount}`);
          console.log(`   From payment method: ${fundingSource.stripePaymentMethodId}`);
          console.log(`   To financial account: ${owner.stripeTreasuryAccountId}`);

          transferResult = await stripeService.fundFinancialAccountACH({
            financialAccountId: owner.stripeTreasuryAccountId,
            connectedAccountId: user.stripeConnectAccountId!,
            paymentMethodId: fundingSource.stripePaymentMethodId,
            amount: Math.round(fundAmount * 100), // Convert to cents
            description: `Wallet funding - ${user?.username || owner.id}`
          });

          console.log(`✅ InboundTransfer created: ${transferResult.id}, status: ${transferResult.status}`);
          console.log(`⏳ Transfer pending - balance will update when Stripe settles the transfer (1-3 business days)`);

        } catch (fundingError: any) {
          console.error('❌ Stripe Treasury funding failed:', fundingError.message);
          return res.status(500).json({ 
            message: "Failed to initiate wallet funding: " + fundingError.message 
          });
        }
      } else {
        // Treasury not available or not enabled - only card payments supported
        const reason = !isTreasuryEnabled ? 'feature flag disabled' : 'Stripe Treasury not available';
        console.log(`ℹ️ ACH funding disabled (${reason}). Use card payment method.`);
        if (fundingSource.type === 'bank_account' || fundingSource.type === 'ach') {
          const message = !isTreasuryEnabled 
            ? "ACH transfers are currently disabled. Please use a card payment method."
            : "ACH transfers require Stripe Treasury approval. Please use a card payment method or contact support.";
          
          return res.status(400).json({ 
            message,
            needsTreasury: true,
            treasuryDisabled: !isTreasuryEnabled
          });
        }
      }

      // Sync balance from Stripe Treasury to ensure consistency
      let updatedOwner = owner;
      try {
        if (owner.stripeTreasuryAccountId && user.stripeConnectAccountId) {
          const treasuryBalance = await stripeService.getTreasuryBalance({
            connectedAccountId: user.stripeConnectAccountId,
            financialAccountId: owner.stripeTreasuryAccountId,
          });
          
          if (treasuryBalance) {
            const balance = (treasuryBalance.balance / 100).toFixed(2);
            
            await db
              .update(owners)
              .set({
                walletBalance: balance,
                updatedAt: new Date()
              })
              .where(eq(owners.id, owner.id));
            
            updatedOwner = await storage.getOwnerById(owner.id) || owner;
          }
        }
      } catch (syncError: any) {
        console.error('Balance sync failed:', syncError.message);
        // Continue even if sync fails
      }

      // Check and manage low balance alerts after funding
      await checkAndManageLowBalanceAlert(updatedOwner, userId);

      // Return appropriate response based on funding method
      if (transferResult) {
        // Treasury ACH transfer initiated
        res.json({
          message: "Wallet funding initiated successfully. Funds will appear in 1-3 business days.",
          transaction: {
            transactionId: transferResult.id,
            amount: fundAmount.toFixed(2),
            status: transferResult.status || 'pending',
            fundingSource: fundingSourceId,
            createdAt: new Date().toISOString(),
            estimatedCompletionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          }
        });
      } else {
        // Card payment already completed above - balance already updated
        res.json({
          success: true,
          message: "Wallet funded successfully",
          balance: updatedOwner.walletBalance,
          amount: fundAmount.toFixed(2),
          fundingSource: fundingSourceId
        });
      }
    } catch (error: any) {
      console.error("Error funding wallet:", error);
      res.status(500).json({ message: "Failed to fund wallet: " + error.message });
    }
  });

  // POST /api/owners/wallet/simulate-funding - Simulate wallet funding for testing (development only)
  app.post('/api/owners/wallet/simulate-funding', isAuthenticated, async (req: any, res) => {
    try {
      // Only allow in development/local mode - fail closed in production or deployments
      const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === 'true';
      if (isProduction) {
        return res.status(404).json({ message: "Not found" }); // Return 404 to hide endpoint in production
      }

      const userId = req.user.id;
      const { amount } = req.body;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      if (!amount) {
        return res.status(400).json({ message: "Amount is required" });
      }

      const fundAmount = parseFloat(amount);
      if (isNaN(fundAmount) || fundAmount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      console.log(`🧪 SIMULATION: Funding wallet for owner ${owner.id}: $${fundAmount}`);

      // Update wallet balance directly in database
      const currentBalance = parseFloat(owner.walletBalance || '0');
      const newBalance = (currentBalance + fundAmount).toFixed(2);

      await db
        .update(owners)
        .set({
          walletBalance: newBalance,
          walletStatus: 'active',
          updatedAt: new Date()
        })
        .where(eq(owners.id, owner.id));

      // Create a transaction record in ownerWalletTransactions
      const transaction = await db
        .insert(ownerWalletTransactions)
        .values({
          id: crypto.randomUUID(),
          ownerId: owner.id,
          type: 'topup',
          amount: fundAmount.toFixed(2),
          balanceBefore: currentBalance.toFixed(2),
          balanceAfter: newBalance,
          description: `[TEST] Simulated wallet funding`,
          stripeTransferId: `sim_${crypto.randomUUID().slice(0, 8)}`,
          createdAt: new Date()
        })
        .returning();

      console.log(`✅ SIMULATION: Wallet funded. New balance: $${newBalance}`);

      res.json({
        success: true,
        message: "Wallet funded successfully (simulated)",
        simulation: true,
        balance: newBalance,
        transaction: transaction[0]
      });
    } catch (error: any) {
      console.error("Error simulating wallet funding:", error);
      res.status(500).json({ message: "Failed to simulate funding: " + error.message });
    }
  });

  // POST /api/owners/wallet/simulate-settlement - Simulate ACH settlement (sandbox only)
  app.post('/api/owners/wallet/simulate-settlement', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { transferId } = req.body;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      if (!transferId) {
        return res.status(400).json({ message: "Transfer ID is required" });
      }

      console.log(`🧪 Simulating settlement for transfer ${transferId} (Stripe test mode)`);

      // In Stripe test mode, ACH transfers are automatically processed
      // No explicit settlement call needed - just sync the balance

      // Sync balance from Stripe Treasury to get updated balance
      try {
        if (owner.stripeTreasuryAccountId && owner.stripeConnectAccountId) {
          const treasuryBalance = await stripeService.getTreasuryBalance({
            connectedAccountId: owner.stripeConnectAccountId,
            financialAccountId: owner.stripeTreasuryAccountId,
          });
          
          if (treasuryBalance) {
            const balance = (treasuryBalance.balance / 100).toFixed(2);
            
            await db
              .update(owners)
              .set({
                walletBalance: balance,
                updatedAt: new Date()
              })
              .where(eq(owners.id, owner.id));
            
            console.log(`✅ Settlement simulated. New balance: $${balance}`);
          }
        }
      } catch (syncError: any) {
        console.error('Balance sync failed after settlement:', syncError.message);
      }

      res.json({
        message: "Transfer settled successfully (Stripe test mode)",
        success: true
      });
    } catch (error: any) {
      console.error("Error simulating settlement:", error);
      res.status(500).json({ message: "Failed to simulate settlement: " + error.message });
    }
  });

  // PUT /api/owners/wallet/settings - Update wallet settings (auto top-up, threshold)
  app.put('/api/owners/wallet/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { lowBalanceThreshold, autoTopupEnabled, autoTopupAmount } = req.body;
      const owner = await storage.getOwner(userId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Validate inputs
      if (lowBalanceThreshold && (isNaN(parseFloat(lowBalanceThreshold)) || parseFloat(lowBalanceThreshold) < 0)) {
        return res.status(400).json({ message: "Invalid low balance threshold" });
      }

      if (autoTopupAmount && (isNaN(parseFloat(autoTopupAmount)) || parseFloat(autoTopupAmount) <= 0)) {
        return res.status(400).json({ message: "Invalid auto top-up amount" });
      }

      // Update owner settings
      const updateData: any = {};
      if (lowBalanceThreshold !== undefined) {
        updateData.lowBalanceThreshold = parseFloat(lowBalanceThreshold).toFixed(2);
      }
      if (autoTopupEnabled !== undefined) {
        updateData.autoTopupEnabled = autoTopupEnabled;
      }
      if (autoTopupAmount !== undefined) {
        updateData.autoTopupAmount = parseFloat(autoTopupAmount).toFixed(2);
      }

      await storage.updateOwner(owner.id, updateData);

      console.log(`Updated wallet settings for owner ${owner.id}:`, updateData);

      // Get updated owner record and check for low balance alerts
      const updatedOwner = await storage.getOwnerById(owner.id);
      if (updatedOwner) {
        await checkAndManageLowBalanceAlert(updatedOwner, userId);
      }

      res.json({
        message: "Wallet settings updated successfully",
        settings: updateData
      });
    } catch (error: any) {
      console.error("Error updating wallet settings:", error);
      res.status(500).json({ message: "Failed to update settings: " + error.message });
    }
  });

  // STRIPE FINANCIAL CONNECTIONS API ENDPOINTS (Instant ACH Verification)
  
  // POST /api/financial-connections/create - Create bank linking session for instant ACH verification
  app.post('/api/financial-connections/create', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.stripeCustomerId) {
        return res.status(400).json({ 
          message: "Stripe customer account required. Please set up your payment account first." 
        });
      }

      console.log('🏦 Creating Financial Connections session for instant ACH verification');

      // Get the frontend URL for return redirect - force HTTPS for production
      const host = req.get('host') || '';
      const protocol = (host.includes('replit') || host.includes('localhost')) && req.protocol === 'http' ? 'https' : req.protocol;
      const returnUrl = `${protocol}://${host}/wallet`;

      const session = await stripeService.createFinancialConnectionsSession({
        userType: 'owner',
        customerId: user.stripeCustomerId,
        returnUrl: returnUrl,
      });

      console.log('✅ Financial Connections session created:', session.id);

      res.json({
        success: true,
        sessionId: session.id,
        clientSecret: session.client_secret,
      });
    } catch (error: any) {
      console.error("Error creating Financial Connections session:", error);
      res.status(500).json({ message: "Failed to create bank linking session: " + error.message });
    }
  });

  // POST /api/financial-connections/complete - Complete bank linking and create funding source
  app.post('/api/financial-connections/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { sessionId } = req.body;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      console.log('🏦 Completing Financial Connections and creating payment method');

      // Get payment method from the completed session
      const paymentMethod = await stripeService.getFinancialConnectionsPaymentMethod(sessionId);

      if (!paymentMethod) {
        return res.status(400).json({ 
          message: "No bank account was linked. Please try again." 
        });
      }

      // Attach payment method to customer
      if (user.stripeCustomerId) {
        await stripeClient.paymentMethods.attach(paymentMethod.id, {
          customer: user.stripeCustomerId,
        });
      }

      // Create funding source record in database
      const fundingSource = await db.insert(ownerFundingSources).values({
        ownerId: (await storage.getOwner(userId))!.id,
        type: 'bank_account',
        bankName: (paymentMethod.us_bank_account as any)?.bank_name || 'Bank Account',
        last4: (paymentMethod.us_bank_account as any)?.last4 || '0000',
        stripePaymentMethodId: paymentMethod.id,
      }).returning();

      console.log('✅ Bank account linked and verified instantly:', {
        paymentMethodId: paymentMethod.id,
        bankName: (paymentMethod.us_bank_account as any)?.bank_name,
        last4: (paymentMethod.us_bank_account as any)?.last4,
      });

      res.json({
        success: true,
        fundingSource: fundingSource[0],
        message: "Bank account linked successfully with instant verification"
      });
    } catch (error: any) {
      console.error("Error completing Financial Connections:", error);
      res.status(500).json({ message: "Failed to complete bank linking: " + error.message });
    }
  });

  // END COLUMN WALLET API ENDPOINTS

  // NOTIFICATIONS API ENDPOINTS

  // GET /api/notifications - Get all notifications for current user
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications: " + error.message });
    }
  });

  // GET /api/notifications/unread - Get unread notifications count
  app.get('/api/notifications/unread', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const unreadNotifications = await storage.getUnreadNotificationsByUser(userId);
      res.json({ count: unreadNotifications.length, notifications: unreadNotifications });
    } catch (error: any) {
      console.error("Error fetching unread notifications:", error);
      res.status(500).json({ message: "Failed to fetch unread notifications: " + error.message });
    }
  });

  // PUT /api/notifications/read-all - Mark all notifications as read
  app.put('/api/notifications/read-all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // PUT /api/notifications/:id/read - Mark notification as read
  app.put('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const notification = await storage.markNotificationAsRead(id);
      res.json(notification);
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read: " + error.message });
    }
  });

  // END NOTIFICATIONS API ENDPOINTS

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
      const awaitingDriverStripePayments = await storage.getPaymentsAwaitingDriverStripe();

      res.json({
        weekStats,
        monthStats,
        awaitingDriverStripePayments: awaitingDriverStripePayments.slice(0, 5),
        awaitingDriverStripeCount: awaitingDriverStripePayments.length,
      });
    } catch (error) {
      console.error("Error fetching admin dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // System Settings endpoints (super admin only)
  app.get('/api/admin/settings', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error: any) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Failed to fetch system settings: " + error.message });
    }
  });

  // Backfill driver accounts with transfers capability (super admin only)
  app.post('/api/admin/backfill-driver-capabilities', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      console.log('🔄 Starting driver capability backfill...');
      
      // Get all drivers (not users) to access stripeConnectAccountId
      const allDrivers = await storage.getAllDrivers();
      
      const results = {
        total: allDrivers.length,
        updated: 0,
        skipped: 0,
        errors: [] as any[],
      };

      for (const driverData of allDrivers) {
        try {
          const driverUser = driverData.user;
          
          if (!driverUser.stripeConnectAccountId) {
            results.skipped++;
            console.log(`⏭️  Skipping driver ${driverUser.id} (${driverUser.username}) - no Stripe account`);
            continue;
          }

          // Update account to request transfers capability
          const account = await stripeService.requestTransfersCapability(driverUser.stripeConnectAccountId);
          results.updated++;
          
          console.log(`✅ Updated driver ${driverUser.id} (${driverUser.username}) - transfers: ${account.capabilities?.transfers}`);
        } catch (error: any) {
          const driverUser = driverData.user;
          results.errors.push({
            driverId: driverUser.id,
            username: driverUser.username,
            error: error.message,
          });
          console.error(`❌ Failed to update driver ${driverUser.id}:`, error.message);
        }
      }

      console.log('✅ Driver capability backfill complete:', results);
      res.json(results);
    } catch (error: any) {
      console.error("Error in driver capability backfill:", error);
      res.status(500).json({ message: "Backfill failed: " + error.message });
    }
  });

  // Test a specific Stripe account's Account Link capability (super admin only)
  app.post('/api/admin/test-account-link', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ message: "accountId is required" });
      }

      console.log(`🔧 Testing Account Link for: ${accountId}`);
      
      const result = await stripeService.backfillExpressAccountController(accountId);
      
      console.log(`✅ Account Link test result:`, result);
      res.json(result);
    } catch (error: any) {
      console.error("Error testing Account Link:", error);
      res.status(500).json({ message: "Test failed: " + error.message });
    }
  });

  // Backfill ALL Express accounts with controller configuration (super admin only)
  app.post('/api/admin/backfill-express-accounts', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      console.log('🔧 Starting Express account backfill for Account Links...');
      
      const result = await stripeService.backfillAllExpressAccounts();
      
      console.log(`✅ Express account backfill complete:`, {
        totalProcessed: result.totalProcessed,
        successful: result.successful,
        failed: result.failed,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error in Express account backfill:", error);
      res.status(500).json({ message: "Backfill failed: " + error.message });
    }
  });

  app.put('/api/admin/settings', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Validate platform fee if being updated
      if (req.body.platformWashoutFee !== undefined) {
        const feeRaw = typeof req.body.platformWashoutFee === "number"
          ? req.body.platformWashoutFee.toString()
          : String(req.body.platformWashoutFee).trim();
        const fee = parseFloat(feeRaw);
        if (!feeRaw || isNaN(fee) || fee < 0) {
          return res.status(400).json({ 
            message: "Platform washout fee must be zero or greater" 
          });
        }
      }

      const settings = await storage.updateSystemSettings(req.body, req.user.id);
      
      console.log('✅ System settings updated by', user.username, ':', settings);
      
      res.json(settings);
    } catch (error: any) {
      const dbError = summarizeDatabaseError(error, {
        phase: "platform-fee-update",
        table: "system_settings",
      });
      console.error("Error updating system settings:", {
        ...dbError,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (dbError.category === "schema_mismatch" || dbError.category === "enum_mismatch") {
        return res.status(500).json({
          message: "Platform fee settings are missing a required database field. Please deploy the latest migration.",
        });
      }

      if (dbError.category === "null_violation") {
        return res.status(400).json({
          message: "Platform fee settings are incomplete. Please enter zero or greater.",
        });
      }

      return res.status(500).json({ message: "Failed to update system settings. Please try again." });
    }
  });

  app.get('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const driversData = await storage.getAllDrivers() as DriverWithUser[];
      const ownersData = await storage.getAllOwners() as OwnerWithUser[];
      const admins = await storage.getAllAdmins();

      // Transform data to match frontend expectations
      const drivers = driversData.map((d) => ({
        users: d.user,
        drivers: {
          id: d.id,
          userId: d.userId,
          employerName: d.employerName,
          employerStreet: d.employerStreet,
          employerCity: d.employerCity,
          employerState: d.employerState,
          employerZip: d.employerZip,
          employerPhone: d.employerPhone,
          licenseNumber: d.licenseNumber,
          truckNumber: d.truckNumber,
          isGpsEnabled: d.isGpsEnabled,
          currentLatitude: d.currentLatitude,
          currentLongitude: d.currentLongitude,
          lastLocationUpdate: d.lastLocationUpdate,
          stripeTreasuryAccountId: d.stripeTreasuryAccountId,
          stripeIssuingCardholderId: d.stripeIssuingCardholderId,
          paymentMethod: d.paymentMethod,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }
      }));

      const owners = ownersData.map((o) => ({
        users: o.user,
        owners: {
          id: o.id,
          userId: o.userId,
          companyName: o.companyName,
          businessLicense: o.businessLicense,
          taxId: o.taxId,
          stripeConnectAccountId: o.stripeConnectAccountId,
          stripeTreasuryAccountId: o.stripeTreasuryAccountId,
          stripeCustomerId: o.stripeCustomerId,
          subscriptionStatus: o.subscriptionStatus,
          subscriptionPlan: o.subscriptionPlan,
          walletBalance: o.walletBalance,
          walletStatus: o.walletStatus,
          membershipPaymentMethod: o.membershipPaymentMethod,
          membershipPaymentNotes: o.membershipPaymentNotes,
          membershipActivatedBy: o.membershipActivatedBy,
          membershipActivatedAt: o.membershipActivatedAt,
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

  // Admin payments endpoint (super admin only)
  app.get('/api/admin/payments', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
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

  // Admin subscription management endpoint (super admin only)
  app.get('/api/admin/subscriptions', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      // Get all owners with subscription information
      const owners = await storage.getAllOwners() as OwnerWithUser[];
      
      // Get all user details in parallel for efficiency
      const ownerUserPromises = owners.map((owner) => storage.getUser(owner.userId) as Promise<User | undefined>);
      const ownerUsers = await Promise.all(ownerUserPromises);

      // Filter out owners without valid user records
      const validOwnerData = owners
        .map((owner, index) => ({ owner, user: ownerUsers[index] }))
        .filter((entry): entry is { owner: OwnerWithUser; user: User } => entry.user != null);

      // Get location counts for each owner to calculate monthly revenue
      const locationCountsPromises = validOwnerData.map(async ({ owner }) => {
        const locations = await storage.getLocationsByOwner(owner.id) as WashoutLocation[];
        return {
          ownerId: owner.id,
          activeLocationCount: locations.filter((loc) => loc.isActive).length
        };
      });
      const locationCounts = await Promise.all(locationCountsPromises);
      const locationCountMap = new Map(locationCounts.map(lc => [lc.ownerId, lc.activeLocationCount]));

      // Prepare subscription data for wallet-based system
      const subscriptionsData = validOwnerData.map(({ owner, user }) => {
        // Determine status based on wallet and approval
        let status = 'inactive';
        if (!owner.isApproved) {
          status = 'pending_approval';
        } else if (owner.walletStatus === 'active') {
          status = 'active';
        }

        const activeLocations = locationCountMap.get(owner.id) || 0;
        const monthlyRevenue = activeLocations * 1; // $1.00 per location per month

        return {
          id: owner.id,
          ownerId: owner.id, // Add unique owner ID for table keys
          userId: owner.userId,
          ownerName: `${user!.firstName} ${user!.lastName}`,
          email: user!.email,
          companyName: owner.companyName || 'N/A',
          status: status,
          plan: owner.subscriptionPlan || 'none',
          localEndsAt: null, // No subscription end date for wallet-based
          stripeCustomerId: owner.stripeCustomerId || null,
          stripeConnectAccountId: owner.stripeConnectAccountId || null,
          stripeTreasuryAccountId: owner.stripeTreasuryAccountId || null,
          stripeSubscriptionId: null, // No Stripe subscription in wallet system
          createdAt: user!.createdAt,
          nextBillingDate: null, // Fees charged when locations are active
          currentPeriodEnd: null,
          amount: monthlyRevenue, // Monthly revenue from active locations
          currency: 'usd',
          cancelAtPeriodEnd: false,
          cancelAt: null,
          trialEnd: null,
          walletBalance: owner.walletBalance,
          walletStatus: owner.walletStatus,
          membershipPaymentMethod: owner.membershipPaymentMethod,
          membershipActivatedAt: owner.membershipActivatedAt,
          activeLocations: activeLocations, // Number of active locations
        };
      });

      // Get active subscriptions (approved owners with active wallets)
      const activeSubscriptions = subscriptionsData.filter((subscription) => 
        subscription.status === 'active'
      );

      // Sort by creation date (newest first)
      subscriptionsData.sort((a, b) => {
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        return bDate.getTime() - aDate.getTime();
      });

      const responseData = {
        subscriptions: subscriptionsData,
        totalActive: activeSubscriptions.length,
        totalSubscriptions: subscriptionsData.length
      };

      console.log('📊 Subscription data:', {
        totalOwners: owners.length,
        validOwners: validOwnerData.length,
        totalActive: activeSubscriptions.length,
        totalSubscriptions: subscriptionsData.length,
        sampleSubscription: subscriptionsData[0] || null
      });

      // Set cache-control headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(responseData);
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

  // Update user status (activate/deactivate)
  app.put('/api/admin/users/:userId/status', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userId } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      // Update user status
      const updatedUser = await storage.updateUserStatus(userId, isActive);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "User status updated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
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

  // GET all owners (for admin location creation owner picker)
  app.get('/api/admin/owners', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const owners = await storage.getAllOwners();
      res.json(owners);
    } catch (error) {
      console.error("Error fetching owners:", error);
      res.status(500).json({ message: "Failed to fetch owners" });
    }
  });

  // POST create a location on behalf of an owner (admin override — skips CC/Stripe checks)
  app.post('/api/admin/locations', isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getUser(req.user.id);
      if (adminUser?.role !== 'admin' && adminUser?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { ownerId, ...rest } = req.body;
      if (!ownerId) {
        return res.status(400).json({ message: "ownerId is required" });
      }

      const owner = await storage.getOwnerById(ownerId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Validate core location fields (lat/lng optional — will be geocoded)
      const locationData = insertWashoutLocationSchema.parse({
        ...rest,
        ownerId: owner.id,
      });

      // Auto-geocode lat/lng from address
      if (!locationData.latitude || !locationData.longitude) {
        try {
          const geo = await geocodeAddress(rest.street, rest.city, rest.state, rest.zip);
          locationData.latitude = geo.latitude;
          locationData.longitude = geo.longitude;
        } catch (geoError: any) {
          return res.status(400).json({ message: geoError.message });
        }
      }

      const location = await storage.createWashoutLocation(locationData as any);
      console.log(`📍 Admin created location: ${location.id} - ${location.name} for owner ${owner.id}`);

      res.status(201).json({ location, message: 'Location created by admin on behalf of owner.' });
    } catch (error: any) {
      console.error("Error creating location (admin):", error);
      res.status(500).json({ message: error.message || "Failed to create location" });
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

  app.post('/api/admin/owners/:id/activate-membership', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { id } = req.params;
      const validatedData = activateMembershipSchema.parse(req.body);
      
      const owner = await storage.activateMembership(
        id, 
        validatedData.paymentMethod, 
        validatedData.paymentNotes,
        user.id
      );
      
      res.json(owner);
    } catch (error) {
      console.error("Error activating membership:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to activate membership" });
    }
  });

  // Update owner's custom platform fee (super admin only)
  app.put('/api/admin/owners/:id/platform-fee', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const ownerId = req.params.id;
      const { customPlatformFee } = req.body;

      const hasCustomPlatformFee = customPlatformFee !== null && customPlatformFee !== undefined && customPlatformFee !== '';
      if (hasCustomPlatformFee) {
        const fee = parseFloat(customPlatformFee);
        if (isNaN(fee) || fee < 0) {
          return res.status(400).json({
            message: "Custom platform fee must be zero or greater, or blank to use the global fee"
          });
        }
      }

      const owner = await storage.getOwner(ownerId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Update custom fee
      await storage.updateOwnerCustomPlatformFee(ownerId, customPlatformFee);

      const ownerUser = await storage.getUser(owner.userId);
      console.log('✅ Custom platform fee updated for owner:', ownerUser?.username, 'New fee:', customPlatformFee || 'using global');

      res.json({ message: "Custom platform fee updated successfully", customPlatformFee });
    } catch (error: any) {
      console.error("Error updating custom platform fee:", error);
      res.status(500).json({ message: error.message || "Failed to update custom platform fee" });
    }
  });

  // Update owner's custom billing model settings (super admin only)
  app.put('/api/admin/owners/:id/custom-billing', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const ownerId = req.params.id;
      const { useCustomBillingModel, customWashoutRate } = req.body;

      const hasCustomWashoutRate = customWashoutRate !== null && customWashoutRate !== undefined && customWashoutRate !== '';
      if (hasCustomWashoutRate) {
        const rate = parseFloat(customWashoutRate);
        if (isNaN(rate) || rate < 0) {
          return res.status(400).json({
            message: "Custom washout rate must be zero or greater, or blank to use the default rate"
          });
        }
      }

      const owner = await storage.getOwnerById(ownerId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      // Update custom billing settings
      await storage.updateOwnerCustomBillingSettings(
        ownerId, 
        useCustomBillingModel === true,
        hasCustomWashoutRate ? customWashoutRate : null
      );

      const ownerUser = await storage.getUserById(owner.userId);
      console.log('✅ Custom billing settings updated for owner:', ownerUser?.username, 
        'useCustomBillingModel:', useCustomBillingModel, 
        'customWashoutRate:', hasCustomWashoutRate ? customWashoutRate : 'default');

      res.json({ 
        message: "Custom billing settings updated successfully", 
        useCustomBillingModel,
        customWashoutRate 
      });
    } catch (error: any) {
      console.error("Error updating custom billing settings:", error);
      res.status(500).json({ message: error.message || "Failed to update custom billing settings" });
    }
  });

  // ========== DRIVER LOTTERY ENTRIES ENDPOINTS ==========

  // Get this driver's individual lottery entries (with location/owner details)
  app.get('/api/drivers/lottery-entries', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }
      const driver = await storage.getDriver(user.id);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }
      const { month, year } = req.query;
      const monthNum = month ? parseInt(month as string) : undefined;
      const yearNum = year ? parseInt(year as string) : undefined;
      const entries = await storage.getDriverLotteryEntriesWithDetails(driver.id, monthNum, yearNum);
      res.json(entries);
    } catch (error: any) {
      console.error("Error fetching driver lottery entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery entries" });
    }
  });

  // Shared lottery status endpoint for drivers/admins
  app.get('/api/lottery/status', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['driver', 'admin', 'super_admin'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const driver = user.role === 'driver' ? await storage.getDriver(user.id) : undefined;
      const status = await buildLotteryStatusSnapshot(driver?.id);
      const monthName = new Date(status.currentYear, status.currentMonth - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      const currentDrawing = status.currentDrawing ? {
        ...status.currentDrawing,
        monthName,
      } : null;

      res.json({
        ...status,
        currentDrawing,
        currentDrawingMessage: status.enabled
          ? currentDrawing
            ? `Current drawing is open for ${monthName} ${status.currentYear}.`
            : `Lottery is active for ${monthName} ${status.currentYear}, but no drawing has been posted yet.`
          : 'Lottery is currently disabled by an administrator.',
      });
    } catch (error: any) {
      console.error("Error fetching lottery status:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery status" });
    }
  });

  // Alias for driver-owned lottery entries
  app.get('/api/lottery/entries', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'driver') {
        return res.status(403).json({ message: "Driver access required" });
      }
      const driver = await storage.getDriver(user.id);
      if (!driver) {
        return res.status(404).json({ message: "Driver profile not found" });
      }

      const { month, year } = req.query;
      const monthNum = month ? parseInt(month as string) : undefined;
      const yearNum = year ? parseInt(year as string) : undefined;
      const entries = await storage.getDriverLotteryEntriesWithDetails(driver.id, monthNum, yearNum);
      res.json(entries);
    } catch (error: any) {
      console.error("Error fetching lottery entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery entries" });
    }
  });

  // ========== ADMIN LOTTERY MANAGEMENT ENDPOINTS ==========

  // Combined admin lottery overview
  app.get('/api/admin/lottery', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { month, year } = req.query;
      const now = new Date();
      const selectedMonth = month ? parseInt(month as string) : now.getMonth() + 1;
      const selectedYear = year ? parseInt(year as string) : now.getFullYear();
      const status = await buildLotteryStatusSnapshot();
      const [entries, totals, months, drawings, pendingDrawings] = await Promise.all([
        storage.getAllDriverLotteryEntries(new Date(selectedYear, selectedMonth - 1, 1), new Date(selectedYear, selectedMonth, 0, 23, 59, 59)),
        storage.getDriverLotteryEntryTotals(selectedMonth, selectedYear),
        storage.getLotteryMonths(),
        storage.getLotteryDrawings(),
        storage.getPendingLotteryDrawings(),
      ]);

      const totalTickets = totals.reduce((sum: number, row: { totalEntries?: number | string | null }) => sum + Number(row.totalEntries || 0), 0);

      res.json({
        status,
        selectedMonth,
        selectedYear,
        totalEligibleWashouts: entries.length,
        totalTickets,
        driversEntered: totals.length,
        totals,
        months,
        drawings,
        pendingDrawings,
        currentDrawing: status.currentDrawing,
      });
    } catch (error: any) {
      console.error("Error fetching admin lottery summary:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery summary" });
    }
  });

  // Support a friendlier draw endpoint that forwards to the existing execute handler.
  app.post('/api/admin/lottery/draw', isAuthenticated, async (_req: any, res) => {
    res.redirect(307, '/api/admin/lottery/execute');
  });

  // Get all lottery entries with driver details (admin/super admin)
  app.get('/api/admin/lottery/entries', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const entries = await storage.getAllDriverLotteryEntries(start, end);
      res.json(entries);
    } catch (error: any) {
      console.error("Error fetching lottery entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery entries" });
    }
  });

  // Get lottery entry totals per driver (admin/super admin)
  app.get('/api/admin/lottery/totals', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { month, year } = req.query;
      const monthNum = month ? parseInt(month as string) : undefined;
      const yearNum = year ? parseInt(year as string) : undefined;

      const totals = await storage.getDriverLotteryEntryTotals(monthNum, yearNum);
      res.json(totals);
    } catch (error: any) {
      console.error("Error fetching lottery totals:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery totals" });
    }
  });

  // Get all lottery months with status (admin/super admin)
  app.get('/api/admin/lottery/months', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const months = await storage.getLotteryMonths();
      res.json(months);
    } catch (error: any) {
      console.error("Error fetching lottery months:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lottery months" });
    }
  });

  // Archive/close a lottery month (super admin only)
  app.post('/api/admin/lottery/archive', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { month, year } = req.body;
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }

      const archivedCount = await storage.archiveLotteryMonth(month, year);
      console.log(`🎰 Lottery month ${month}/${year} archived by ${user.username}: ${archivedCount} entries`);
      
      res.json({ 
        message: `Successfully archived ${archivedCount} entries for ${month}/${year}`,
        archivedCount,
        month,
        year
      });
    } catch (error: any) {
      console.error("Error archiving lottery month:", error);
      res.status(500).json({ message: error.message || "Failed to archive lottery month" });
    }
  });

  // Send lottery winner notification to a driver (admin/super admin)
  app.post('/api/admin/lottery/notify-winner', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { driverId, message, month, year, prize } = req.body;
      if (!driverId || !message) {
        return res.status(400).json({ message: "Driver ID and message are required" });
      }

      if (message.length > 2000) {
        return res.status(400).json({ message: "Message cannot exceed 2000 characters" });
      }

      if (prize && prize.length > 200) {
        return res.status(400).json({ message: "Prize description cannot exceed 200 characters" });
      }

      const driver = await storage.getDriverById(driverId);
      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      const driverUser = await storage.getUser(driver.userId);
      if (!driverUser) {
        return res.status(404).json({ message: "Driver user not found" });
      }

      const monthName = month ? new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'long' }) : '';
      const title = prize 
        ? `Congratulations! You won ${prize} in the ${monthName} ${year || ''} lottery!`
        : `Lottery Winner Notification`;

      await storage.createNotification({
        userId: driver.userId,
        title,
        message,
        type: 'lottery_winner',
        data: { month, year, prize, sentBy: user.username },
      });

      console.log(`🎉 Lottery winner notification sent to driver ${driverId} by ${user.username}`);
      
      res.json({ 
        message: `Winner notification sent to ${driverUser.firstName} ${driverUser.lastName}`,
        driverName: `${driverUser.firstName} ${driverUser.lastName}`,
      });
    } catch (error: any) {
      console.error("Error sending lottery winner notification:", error);
      res.status(500).json({ message: error.message || "Failed to send notification" });
    }
  });

  // ========== LOTTERY DRAWINGS ENDPOINTS ==========

  // Execute a lottery drawing for a given month/year (admin/super_admin)
  app.post('/api/admin/lottery/execute', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { month, year, firstPrize, secondPrize, thirdPrize, numberOfWinners: rawWinners } = req.body;
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required" });
      }
      const numberOfWinners = Math.min(3, Math.max(1, parseInt(rawWinners) || 3));

      // Get all non-archived entries for this month/year
      const allEntries = await storage.getDriverLotteryEntryTotals(month, year);
      if (!allEntries || allEntries.length === 0) {
        return res.status(400).json({ message: "No entries found for this period" });
      }

      // Get individual entries to pick winning ticket numbers
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      const individualEntries = await storage.getAllDriverLotteryEntries(startDate, endDate);

      // Build weighted pool (one slot per entry earned)
      const pool: { driverId: string; driverName: string; ticketNumber: string | null; payoutPreference: string | null }[] = [];
      for (const t of allEntries) {
        const driverIndividualEntries = individualEntries.filter((e: any) => e.driverId === t.driverId);
        for (let i = 0; i < t.totalEntries; i++) {
          const entryForSlot = driverIndividualEntries[i % driverIndividualEntries.length];
          pool.push({
            driverId: t.driverId,
            driverName: t.driverName,
            ticketNumber: entryForSlot?.ticketNumber || null,
            payoutPreference: t.payoutPreference,
          });
        }
      }

      const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      const existing = await storage.getLotteryDrawingByMonthYear(month, year);

      let winners: LotteryWinnerSummary[];
      let prizes: (string | null)[];
      if (existing) {
        winners = [];
        if (existing.firstPlaceDriverId && existing.firstPlaceDriverName) {
          winners.push({
            place: 1,
            driverId: existing.firstPlaceDriverId,
            driverName: existing.firstPlaceDriverName,
            ticketNumber: existing.firstPlaceTicketNumber || null,
            payoutPreference: existing.firstPlacePayoutPreference || null,
            prize: existing.firstPrize || null,
          });
        }
        if (existing.secondPlaceDriverId && existing.secondPlaceDriverName) {
          winners.push({
            place: 2,
            driverId: existing.secondPlaceDriverId,
            driverName: existing.secondPlaceDriverName,
            ticketNumber: existing.secondPlaceTicketNumber || null,
            payoutPreference: existing.secondPlacePayoutPreference || null,
            prize: existing.secondPrize || null,
          });
        }
        if (existing.thirdPlaceDriverId && existing.thirdPlaceDriverName) {
          winners.push({
            place: 3,
            driverId: existing.thirdPlaceDriverId,
            driverName: existing.thirdPlaceDriverName,
            ticketNumber: existing.thirdPlaceTicketNumber || null,
            payoutPreference: existing.thirdPlacePayoutPreference || null,
            prize: existing.thirdPrize || null,
          });
        }
        prizes = [existing.firstPrize || null, existing.secondPrize || null, existing.thirdPrize || null];
      } else {
        // Shuffle pool using Fisher-Yates
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        // Pick up to numberOfWinners unique winners
        winners = [];
        const pickedDriverIds = new Set<string>();
        for (const slot of pool) {
          if (!pickedDriverIds.has(slot.driverId)) {
            winners.push({
              place: winners.length + 1,
              driverId: slot.driverId,
              driverName: slot.driverName,
              ticketNumber: slot.ticketNumber,
              payoutPreference: slot.payoutPreference,
              prize: null,
            });
            pickedDriverIds.add(slot.driverId);
            if (winners.length === numberOfWinners) break;
          }
        }

        if (winners.length < 1) {
          return res.status(400).json({ message: "Not enough unique drivers to hold a drawing" });
        }
        prizes = [firstPrize || null, secondPrize || null, thirdPrize || null];
      }

      const [first, second, third] = winners;
      const nextMonthDate = new Date(year, month, 1);
      const nextMonthName = nextMonthDate.toLocaleDateString('en-US', { month: 'long' });
      const nextMonthYear = nextMonthDate.getFullYear();
      const participantDriverIds = Array.from(new Set<string>(allEntries.map((entry: { driverId: string }) => entry.driverId)));
      const allDrivers = await storage.getAllDrivers() as DriverWithUser[];
      const driverMap = new Map(allDrivers.map((driver) => [driver.id, driver]));

      const drawing = existing || await storage.createLotteryDrawing({
        lotteryMonth: month,
        lotteryYear: year,
        executedBy: user.id,
        firstPlaceDriverId: first?.driverId || null,
        firstPlaceDriverName: first?.driverName || null,
        firstPlaceTicketNumber: first?.ticketNumber || null,
        firstPlacePayoutPreference: first?.payoutPreference || null,
        firstPrize: prizes[0],
        secondPlaceDriverId: second?.driverId || null,
        secondPlaceDriverName: second?.driverName || null,
        secondPlaceTicketNumber: second?.ticketNumber || null,
        secondPlacePayoutPreference: second?.payoutPreference || null,
        secondPrize: prizes[1],
        thirdPlaceDriverId: third?.driverId || null,
        thirdPlaceDriverName: third?.driverName || null,
        thirdPlaceTicketNumber: third?.ticketNumber || null,
        thirdPlacePayoutPreference: third?.payoutPreference || null,
        thirdPrize: prizes[2],
      });

      const winnerMessages = winners.map((winner, index) => ({
        winner,
        ...buildLotteryWinnerMessage({ ...winner, prize: prizes[index] }, monthName, year),
        prize: prizes[index],
      }));
      const participantMessage = buildLotteryParticipantMessage(monthName, year, winners, nextMonthName, nextMonthYear);

      let winnerNotificationCount = 0;
      for (const { winner, title, message, prize } of winnerMessages) {
        const driver = driverMap.get(winner.driverId);
        if (!driver) continue;
        const result = await storage.createLotteryNotificationOnce({
          lotteryDrawingId: drawing.id,
          lotteryMonth: month,
          lotteryYear: year,
          userId: driver.userId,
          driverId: driver.id,
          notificationKind: 'winner',
          place: winner.place,
          title,
          message,
          data: {
            month,
            year,
            place: winner.place,
            ticketNumber: winner.ticketNumber,
            prize,
            driverName: winner.driverName,
          },
        });
        if (result.created) {
          winnerNotificationCount += 1;
        }
      }

      let participantNotificationCount = 0;
      for (const driverId of participantDriverIds) {
        const driver = driverMap.get(driverId);
        if (!driver) continue;
        const result = await storage.createLotteryNotificationOnce({
          lotteryDrawingId: drawing.id,
          lotteryMonth: month,
          lotteryYear: year,
          userId: driver.userId,
          driverId: driver.id,
          notificationKind: 'participant',
          title: participantMessage.title,
          message: participantMessage.message,
          data: {
            month,
            year,
            winners: winners.map((winner) => ({
              place: winner.place,
              driverName: winner.driverName,
            })),
            nextMonth: nextMonthDate.getMonth() + 1,
            nextYear: nextMonthYear,
          },
        });
        if (result.created) {
          participantNotificationCount += 1;
        }
      }

      const summary = await storage.getLotteryNotificationSummary(drawing.id);
      if (summary) {
        await storage.updateLotteryDrawingNotificationSummary(drawing.id, summary);
      }

      if (!existing) {
        await storage.archiveLotteryMonth(month, year);
      }

      console.log(`🎰 Lottery drawing executed for ${monthName} ${year} by ${user.username}. Winners: ${winners.map(w => w.driverName).join(', ')}`);
      console.log(`📣 Lottery notifications ${existing ? 'ensured' : 'sent'} for drawing ${drawing.id}: ${winnerNotificationCount} winner messages, ${participantNotificationCount} participant announcements`);

      res.json({
        message: `Drawing complete! ${winners.length} winner${winners.length !== 1 ? 's' : ''} selected and notified.`,
        drawing: summary ? { ...drawing, ...summary } : drawing,
        winners: winners.map((w) => ({ ...w })),
      });
    } catch (error: any) {
      console.error("Error executing lottery drawing:", error);
      res.status(500).json({ message: error.message || "Failed to execute drawing" });
    }
  });

  // Get all past lottery drawings (admin/super_admin)
  app.get('/api/admin/lottery/drawings', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const drawings = await storage.getLotteryDrawings();
      res.json(drawings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch drawings" });
    }
  });

  // Get drawings with undelivered prizes (admin/super_admin)
  app.get('/api/admin/lottery/drawings/pending', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const drawings = await storage.getPendingLotteryDrawings();
      res.json(drawings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch pending drawings" });
    }
  });

  // Mark a specific prize as delivered (admin/super_admin)
  app.put('/api/admin/lottery/drawings/:id/mark-delivered', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'admin' && user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id } = req.params;
      const { place } = req.body;
      if (!['first', 'second', 'third'].includes(place)) {
        return res.status(400).json({ message: "Place must be 'first', 'second', or 'third'" });
      }
      const updated = await storage.markLotteryPrizeDelivered(id, place);
      res.json({ message: "Prize marked as delivered", drawing: updated });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to mark prize as delivered" });
    }
  });

  // ========== ADMIN PRICING MANAGEMENT ENDPOINTS ==========
  
  // Update all location rates platform-wide (for switching between test/production pricing)
  app.post('/api/admin/pricing/update-location-rates', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { newRate } = req.body;
      
      if (newRate === undefined || newRate === null || newRate === '' || isNaN(parseFloat(newRate)) || parseFloat(newRate) < 0) {
        return res.status(400).json({ message: "Valid rate required (e.g., '0.50' for testing, '5.00' for production)" });
      }

      console.log(`🔧 Admin ${user.username} updating all location rates to $${newRate}`);
      
      const result = await storage.batchUpdateAllLocationRates(newRate);
      
      console.log(`✅ Updated ${result.updated} location rates to $${newRate}`);
      
      res.json({
        message: `Successfully updated ${result.updated} location rates to $${newRate}`,
        updated: result.updated,
        newRate
      });
    } catch (error: any) {
      console.error("Error updating location rates:", error);
      res.status(500).json({ message: error.message || "Failed to update location rates" });
    }
  });

  // Update pending activity amounts (for fixing activities created with wrong pricing)
  app.post('/api/admin/pricing/update-pending-activities', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { newAmount } = req.body;
      
      if (newAmount === undefined || newAmount === null || newAmount === '' || isNaN(parseFloat(newAmount)) || parseFloat(newAmount) < 0) {
        return res.status(400).json({ message: "Valid amount required (e.g., '0.50' for testing)" });
      }

      console.log(`🔧 Admin ${user.username} updating pending activity amounts to $${newAmount}`);
      
      const result = await storage.batchUpdatePendingActivityAmounts(newAmount);
      
      console.log(`✅ Updated ${result.updated} pending activity amounts to $${newAmount}`);
      
      res.json({
        message: `Successfully updated ${result.updated} pending activities to $${newAmount}`,
        updated: result.updated,
        newAmount
      });
    } catch (error: any) {
      console.error("Error updating pending activities:", error);
      res.status(500).json({ message: error.message || "Failed to update pending activities" });
    }
  });

  // Get current pricing summary for admin dashboard
  app.get('/api/admin/pricing/summary', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all locations and their rates
      const locations = await storage.getAllLocations() as Array<WashoutLocation & { owner: OwnerWithUser }>;
      const pendingActivities = await storage.getPendingActivities() as WashoutActivity[];
      
      // Get system settings for platform fee
      const systemSettings = await storage.getSystemSettings();
      const platformFee = Math.max(
        parseFloat(systemSettings?.platformWashoutFee || '5.00'),
        5.0
      ).toFixed(2);

      // Calculate rate distribution
      const rateDistribution: Record<string, number> = {};
      locations.forEach((loc) => {
        const rate = loc.rate || '0.00';
        rateDistribution[rate] = (rateDistribution[rate] || 0) + 1;
      });

      // Calculate pending activity amount distribution  
      const pendingAmountDistribution: Record<string, number> = {};
      pendingActivities.forEach((act) => {
        const amount = act.amount || '0.00';
        pendingAmountDistribution[amount] = (pendingAmountDistribution[amount] || 0) + 1;
      });

      res.json({
        platformFee,
        totalLocations: locations.length,
        rateDistribution,
        pendingActivities: pendingActivities.length,
        pendingAmountDistribution,
        testPricing: {
          driverPayment: '0.50',
          platformFee: '5.00',
          totalOwnerCharge: '0.90'
        },
        productionPricing: {
          driverPayment: '5.00',
          platformFee: '5.00',
          totalOwnerCharge: '10.00'
        }
      });
    } catch (error: any) {
      console.error("Error fetching pricing summary:", error);
      res.status(500).json({ message: error.message || "Failed to fetch pricing summary" });
    }
  });

  // ========== AUTO-APPROVAL ADMIN ENDPOINTS ==========
  
  // Get expired pending activities that are candidates for auto-approval
  app.get('/api/admin/auto-approval/pending', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const hoursOld = parseInt(req.query.hours as string) || 72;
      const expiredActivities = await storage.getExpiredPendingActivities(hoursOld) as ExpiredPendingActivity[];
      
      res.json({
        hoursThreshold: hoursOld,
        count: expiredActivities.length,
        activities: expiredActivities.map((activity) => ({
          id: activity.id,
          serviceType: activity.serviceType || 'washout',
          amount: activity.amount,
          createdAt: activity.createdAt,
          checkInTime: activity.checkInTime,
          driverName: `${activity.driver.user.firstName} ${activity.driver.user.lastName}`,
          driverUsername: activity.driver.user.username,
          locationName: activity.location.name,
          locationCity: activity.location.city,
          hoursOld: Math.round((Date.now() - new Date(activity.createdAt!).getTime()) / (1000 * 60 * 60))
        }))
      });
    } catch (error: any) {
      console.error("Error fetching expired activities:", error);
      res.status(500).json({ message: error.message || "Failed to fetch expired activities" });
    }
  });

  // Manually trigger auto-approval for expired activities
  app.post('/api/admin/auto-approval/run', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const hoursOld = parseInt(req.body.hours) || 72;
      console.log(`🤖 [ADMIN] Manual auto-approval triggered by ${user.username} for activities older than ${hoursOld} hours`);
      
      const result = await storage.autoApproveExpiredActivities(hoursOld);
      
      res.json({
        message: `Auto-approval complete: ${result.approved} approved, ${result.failed} failed`,
        hoursThreshold: hoursOld,
        approved: result.approved,
        failed: result.failed,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("Error running auto-approval:", error);
      res.status(500).json({ message: error.message || "Failed to run auto-approval" });
    }
  });

  // Get auto-approval statistics
  app.get('/api/admin/auto-approval/stats', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get counts for different hour thresholds
      const expired72h = await storage.getExpiredPendingActivities(72);
      const expired48h = await storage.getExpiredPendingActivities(48);
      const expired24h = await storage.getExpiredPendingActivities(24);
      
      res.json({
        autoApprovalThreshold: '72 hours',
        pendingCounts: {
          olderThan24h: expired24h.length,
          olderThan48h: expired48h.length,
          olderThan72h: expired72h.length,
        },
        readyForAutoApproval: expired72h.length,
        approaching: expired48h.length - expired72h.length,
        description: 'Activities not approved within 72 hours will be automatically approved'
      });
    } catch (error: any) {
      console.error("Error fetching auto-approval stats:", error);
      res.status(500).json({ message: error.message || "Failed to fetch auto-approval stats" });
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

  // ========== ADMIN BILLING SETTINGS MANAGEMENT ENDPOINTS ==========
  
  // Get all owners' billing settings (for admin dashboard)
  app.get('/api/admin/billing/settings', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const billingSettings = await storage.getAllOwnersBillingSettings();
      
      res.json({
        owners: billingSettings,
        billingCadenceOptions: [
          { value: 'immediate', label: 'Immediate (process each washout instantly)' },
          { value: 'daily', label: 'Daily (batch at end of day)' },
          { value: 'weekly', label: 'Weekly (batch at end of week)' }
        ],
        dayOfWeekOptions: [
          { value: 0, label: 'Sunday' },
          { value: 1, label: 'Monday' },
          { value: 2, label: 'Tuesday' },
          { value: 3, label: 'Wednesday' },
          { value: 4, label: 'Thursday' },
          { value: 5, label: 'Friday' },
          { value: 6, label: 'Saturday' }
        ],
        timezoneOptions: [
          'America/New_York',
          'America/Chicago',
          'America/Denver',
          'America/Los_Angeles',
          'America/Phoenix',
          'America/Anchorage',
          'Pacific/Honolulu'
        ]
      });
    } catch (error: any) {
      console.error("Error fetching billing settings:", error);
      res.status(500).json({ message: error.message || "Failed to fetch billing settings" });
    }
  });

  // Get specific owner's billing settings
  app.get('/api/admin/billing/settings/:ownerId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin' && user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { ownerId } = req.params;
      const billingSettings = await storage.getOwnerBillingSettings(ownerId);
      
      if (!billingSettings) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const owner = await storage.getOwnerById(ownerId);
      const ownerUser = owner ? await storage.getUser(owner.userId) : null;

      res.json({
        ownerId,
        companyName: owner?.companyName || ownerUser?.username || 'Unknown',
        username: ownerUser?.username || 'Unknown',
        ...billingSettings
      });
    } catch (error: any) {
      console.error("Error fetching owner billing settings:", error);
      res.status(500).json({ message: error.message || "Failed to fetch billing settings" });
    }
  });

  // Update owner's billing settings
  app.put('/api/admin/billing/settings/:ownerId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { ownerId } = req.params;
      const { billingCadence, billingCutoffTime, billingTimezone, billingDayOfWeek } = req.body;

      // Validate billing cadence
      if (billingCadence && !['immediate', 'daily', 'weekly'].includes(billingCadence)) {
        return res.status(400).json({ message: "Invalid billing cadence. Must be 'immediate', 'daily', or 'weekly'" });
      }

      // Validate day of week (0-6)
      if (billingDayOfWeek !== undefined && (billingDayOfWeek < 0 || billingDayOfWeek > 6)) {
        return res.status(400).json({ message: "Invalid day of week. Must be 0 (Sunday) through 6 (Saturday)" });
      }

      // Validate cutoff time format (HH:MM:SS or HH:MM)
      if (billingCutoffTime) {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:[0-5][0-9])?$/;
        if (!timeRegex.test(billingCutoffTime)) {
          return res.status(400).json({ message: "Invalid cutoff time format. Use HH:MM or HH:MM:SS (24-hour)" });
        }
      }

      const owner = await storage.getOwnerById(ownerId);
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      const settings: any = {};
      if (billingCadence !== undefined) settings.billingCadence = billingCadence;
      if (billingCutoffTime !== undefined) settings.billingCutoffTime = billingCutoffTime.includes(':') && billingCutoffTime.split(':').length === 2 ? billingCutoffTime + ':00' : billingCutoffTime;
      if (billingTimezone !== undefined) settings.billingTimezone = billingTimezone;
      if (billingDayOfWeek !== undefined) settings.billingDayOfWeek = parseInt(billingDayOfWeek);

      await storage.updateOwnerBillingSettings(ownerId, settings);

      const ownerUser = await storage.getUser(owner.userId);
      console.log(`✅ Billing settings updated for owner ${ownerUser?.username}:`, settings);

      res.json({ 
        message: "Billing settings updated successfully",
        ownerId,
        settings 
      });
    } catch (error: any) {
      console.error("Error updating billing settings:", error);
      res.status(500).json({ message: error.message || "Failed to update billing settings" });
    }
  });

  // Bulk update billing settings for all owners (e.g., switch all to daily for production)
  app.post('/api/admin/billing/settings/bulk-update', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { billingCadence, billingCutoffTime, billingTimezone, billingDayOfWeek } = req.body;

      if (!billingCadence) {
        return res.status(400).json({ message: "Billing cadence is required for bulk update" });
      }

      if (!['immediate', 'daily', 'weekly'].includes(billingCadence)) {
        return res.status(400).json({ message: "Invalid billing cadence. Must be 'immediate', 'daily', or 'weekly'" });
      }

      // Get all owners
      const allOwners = await storage.getAllOwners();
      let updated = 0;

      for (const owner of allOwners) {
        const settings: any = { billingCadence };
        if (billingCutoffTime) settings.billingCutoffTime = billingCutoffTime;
        if (billingTimezone) settings.billingTimezone = billingTimezone;
        if (billingDayOfWeek !== undefined) settings.billingDayOfWeek = parseInt(billingDayOfWeek);

        await storage.updateOwnerBillingSettings(owner.id, settings);
        updated++;
      }

      console.log(`✅ Bulk updated billing settings for ${updated} owners to ${billingCadence}`);

      res.json({
        message: `Successfully updated billing settings for ${updated} owners`,
        updated,
        newSettings: {
          billingCadence,
          billingCutoffTime: billingCutoffTime || 'unchanged',
          billingTimezone: billingTimezone || 'unchanged',
          billingDayOfWeek: billingDayOfWeek !== undefined ? billingDayOfWeek : 'unchanged'
        }
      });
    } catch (error: any) {
      console.error("Error bulk updating billing settings:", error);
      res.status(500).json({ message: error.message || "Failed to bulk update billing settings" });
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

      let availableBalance = 0;
      let balanceSource = 'local';

      // Get balance from Stripe Treasury (system of record)
      if (driver.stripeTreasuryAccountId && driver.stripeConnectAccountId) {
        try {
          const treasuryBalance = await stripeService.getTreasuryBalance({
            connectedAccountId: driver.stripeConnectAccountId,
            financialAccountId: driver.stripeTreasuryAccountId,
          });
          // Stripe Treasury balance is in cents, convert to dollars
          availableBalance = treasuryBalance.balance / 100;
          balanceSource = 'stripe';
        } catch (stripeError) {
          console.error('Error fetching Stripe Treasury balance, falling back to local:', stripeError);
          // Fall back to local wallet if Stripe fails
          const wallet = await storage.getDriverWallet(driver.id);
          availableBalance = wallet ? parseFloat(wallet.availableBalance) : 0;
        }
      } else {
        // No Stripe Treasury account yet, use local wallet balance
        const wallet = await storage.getDriverWallet(driver.id);
        if (!wallet) {
          await storage.createDriverWallet({
            driverId: driver.id,
            availableBalance: "0.00",
            pendingBalance: "0.00"
          });
          availableBalance = 0;
        } else {
          availableBalance = parseFloat(wallet.availableBalance);
        }
      }

      // Calculate pending balance dynamically from activities with status='pending'
      const dynamicPendingBalance = await storage.calculatePendingBalance(driver.id);

      res.json({
        availableBalance: availableBalance,
        pendingBalance: dynamicPendingBalance,
        totalBalance: availableBalance + dynamicPendingBalance,
        balanceSource: balanceSource // 'column' or 'local' for debugging
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
      ) as WalletTransaction[];

      // Filter by type if specified
      let filteredTransactions = allTransactions;
      if (queryParams.type) {
        filteredTransactions = allTransactions.filter((t) => t.direction === queryParams.type);
      }

      // Calculate pagination
      const total = filteredTransactions.length;
      const offset = (queryParams.page - 1) * queryParams.limit;
      const transactions = filteredTransactions.slice(offset, offset + queryParams.limit);
      const hasMore = offset + queryParams.limit < total;

      // Format transactions for response
      const formattedTransactions = transactions.map((transaction) => ({
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
      const existingPendingWithdrawals = await storage.getWithdrawalsByDriver(driver.id) as Withdrawal[];
      const pendingWithdrawals = existingPendingWithdrawals.filter((w) => 
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

      // Rate limiting: Check for recent successful withdrawal attempts (last 5 minutes)
      // Exclude failed withdrawals from rate limiting to allow retry
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentWithdrawals = existingPendingWithdrawals.filter((w) => 
        w.createdAt && 
        new Date(w.createdAt) > fiveMinutesAgo &&
        w.status !== 'failed' // Exclude failed withdrawals
      );
      
      if (recentWithdrawals.length > 0) {
        const nextAllowedTime = new Date((recentWithdrawals[0].createdAt?.getTime() || Date.now()) + 5 * 60 * 1000);
        return res.status(429).json({ 
          message: "Too many withdrawal requests. Please wait before submitting another.",
          nextAllowedTime: nextAllowedTime.toISOString(),
          waitSeconds: Math.ceil((nextAllowedTime.getTime() - Date.now()) / 1000)
        });
      }

      // Check if driver has Stripe Treasury wallet set up
      if (!driver.stripeTreasuryAccountId || !driver.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: "Please complete payment account setup for withdrawals. Go to your profile to connect your payment account." 
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
            stripeTreasuryAccountId: driver.stripeTreasuryAccountId,
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

      // TODO: Implement driver withdrawal via Stripe Treasury ACH
      // This requires using the createACHTransfer function from stripeService
      // For now, mark withdrawal as processing (will be handled manually by admin)
      console.warn(`Driver withdrawal ${withdrawal.id} created - Stripe Treasury ACH transfer not yet automated`);
      await storage.updateWithdrawalStatus(
        withdrawal.id, 
        'processing',
        undefined,
        undefined,
        undefined
      );

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

      const withdrawals = await storage.getAllWithdrawals(start, end) as AdminWithdrawal[];
      
      // Filter by status if provided
      let filteredWithdrawals = withdrawals;
      if (status) {
        filteredWithdrawals = withdrawals.filter((w) => w.status === status);
      }

      // Format response
      const formattedWithdrawals = filteredWithdrawals.map((withdrawal) => ({
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
        columnTransferId: withdrawal.columnTransferId,
        columnCounterpartyId: withdrawal.columnCounterpartyId,
        failureReason: withdrawal.failureReason,
        createdAt: withdrawal.createdAt,
        processedAt: withdrawal.processedAt
      }));

      res.json({
        withdrawals: formattedWithdrawals,
        total: filteredWithdrawals.length,
        summary: {
          requested: filteredWithdrawals.filter((w) => w.status === 'requested').length,
          processing: filteredWithdrawals.filter((w) => w.status === 'processing').length,
          paid: filteredWithdrawals.filter((w) => w.status === 'paid').length,
          failed: filteredWithdrawals.filter((w) => w.status === 'failed').length,
          canceled: filteredWithdrawals.filter((w) => w.status === 'canceled').length
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
        validatedData.columnTransferId,
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
      
      const { base64Data, filename, locationId } = req.body;
      
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
      
      // Create ACL policy with location owner access
      const aclPolicy: ObjectAclPolicy = {
        owner: req.user.id,
        visibility: "private"
      };
      
      // If locationId is provided, add location owner read access
      if (locationId) {
        aclPolicy.aclRules = [
          {
            group: {
              type: ObjectAccessGroupType.LOCATION_OWNER,
              id: locationId,
            },
            permission: ObjectPermission.READ,
          },
        ];
        console.log(`📷 Adding location owner access for location ${locationId} to uploaded photo`);
      }
      
      // Set ACL policy with location owner access
      await setObjectAclPolicy(file, aclPolicy);
      
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
    const userRole = req.user?.role;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      console.log(`📁 Object file found: ${req.path}`);
      
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        userRole,
        requestedPermission: ObjectPermission.READ,
      });
      console.log("Photo object ACL decision:", {
        path: req.path,
        userId,
        role: userRole,
        allowed: canAccess,
      });
      
      if (!canAccess) {
        console.log(`❌ Access denied for user ${req.user?.username} to ${req.path}`);
        return res.status(403).json({ message: "You are not authorized to view this photo." });
      }
      
      console.log(`✅ Access granted for user ${req.user?.username} to ${req.path}`);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        console.log(`❌ Object not found: ${req.path}`);
        return res.status(404).json({ message: "Photo not found" });
      }
      return res.status(500).json({ message: error instanceof Error ? error.message : "Failed to load photo" });
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
    const { locationId } = req.body;

    try {
      const objectStorageService = new ObjectStorageService();
      
      // Create ACL policy with location owner access
      const aclPolicy: ObjectAclPolicy = {
        owner: userId,
        visibility: "private",
      };
      
      // If locationId is provided, add location owner read access
      if (locationId) {
        aclPolicy.aclRules = [
          {
            group: {
              type: ObjectAccessGroupType.LOCATION_OWNER,
              id: locationId,
            },
            permission: ObjectPermission.READ,
          },
        ];
        console.log(`📷 Adding location owner access for location ${locationId} to photo ACL`);
      }
      
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoURL,
        aclPolicy,
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting photo ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Backfill ACL policies for existing washout photos
  app.post("/api/admin/backfill-photo-acls", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      
      // Restrict to admin and super_admin roles only
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ 
          error: 'Admin access required' 
        });
      }

      console.log("🔄 Starting ACL backfill for existing washout photos...");
      
      // Get all washout activities with photo URLs
      const activities = await db.select({
        id: washoutActivities.id,
        locationId: washoutActivities.locationId,
        photoUrls: washoutActivities.photoUrls,
        driverId: washoutActivities.driverId
      })
      .from(washoutActivities)
      .where(sql`photo_urls IS NOT NULL AND array_length(photo_urls, 1) > 0`);

      console.log(`Found ${activities.length} activities to process for ACL backfill`);

      let updatedCount = 0;
      let errorCount = 0;
      const objectStorageService = new ObjectStorageService();

      for (const activity of activities) {
        if (!activity.photoUrls || activity.photoUrls.length === 0) {
          continue;
        }

        for (const photoUrl of activity.photoUrls) {
          try {
            // Skip if not an object storage URL
            if (!photoUrl.startsWith('/objects/photos/')) {
              continue;
            }

            // Get the current ACL policy
            const objectFile = await objectStorageService.getObjectEntityFile(photoUrl);
            const currentPolicy = await getObjectAclPolicy(objectFile);

            if (!currentPolicy) {
              console.log(`⚠️ No ACL policy found for photo: ${photoUrl}`);
              continue;
            }

            // Check if location owner access already exists
            const hasLocationOwnerAccess = currentPolicy.aclRules?.some((rule: any) => 
              rule.group.type === ObjectAccessGroupType.LOCATION_OWNER &&
              rule.group.id === activity.locationId
            );

            if (hasLocationOwnerAccess) {
              console.log(`✅ Photo ${photoUrl} already has location owner access`);
              continue;
            }

            // Add location owner access to existing ACL policy
            const updatedPolicy: ObjectAclPolicy = {
              ...currentPolicy,
              aclRules: [
                ...(currentPolicy.aclRules || []),
                {
                  group: {
                    type: ObjectAccessGroupType.LOCATION_OWNER,
                    id: activity.locationId,
                  },
                  permission: ObjectPermission.READ,
                },
              ],
            };

            await setObjectAclPolicy(objectFile, updatedPolicy);
            updatedCount++;
            console.log(`✅ Updated ACL for photo: ${photoUrl}, location: ${activity.locationId}`);

          } catch (error) {
            errorCount++;
            console.error(`❌ Failed to update ACL for photo: ${photoUrl}`, error);
          }
        }
      }

      console.log(`🎯 ACL backfill completed: ${updatedCount} photos updated, ${errorCount} errors`);

      res.json({
        message: "ACL backfill completed",
        activitiesProcessed: activities.length,
        photosUpdated: updatedCount,
        errors: errorCount
      });

    } catch (error) {
      console.error("Error during ACL backfill:", error);
      res.status(500).json({ error: "Failed to backfill ACL policies" });
    }
  });

  app.get("/api/reports/owner", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !["owner", "admin", "super_admin"].includes(user.role || "")) {
        return res.status(403).json({ message: "Owner or admin access required" });
      }

      const reportQuery: ReportQueryInput = {
        dateRange: req.query.dateRange as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        ownerId: req.query.ownerId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        washoutStatus: req.query.washoutStatus as string | undefined,
      };

      if (reportQuery.dateRange === "custom" && (!reportQuery.startDate || !reportQuery.endDate)) {
        return res.status(400).json({ message: "Custom date range requires startDate and endDate" });
      }

      const isAdmin = user.role === "admin" || user.role === "super_admin";
      const owner = user.role === "owner" ? await storage.getOwner(user.id) : null;

      if (user.role === "owner") {
        if (!owner) {
          return res.status(404).json({ message: "Owner not found" });
        }

        const membershipState = resolveOwnerMembershipState(owner);
        if (!membershipState.dashboardAccessAllowed) {
          return res.status(403).json({ message: membershipState.accountStatusMessage || "Your account is pending review." });
        }

        if (reportQuery.ownerId && reportQuery.ownerId !== owner.id) {
          return res.status(403).json({ message: "You can only access reports for your own owner account" });
        }

        if (reportQuery.locationId) {
          const location = await storage.getWashoutLocation(reportQuery.locationId);
          if (!location || location.ownerId !== owner.id) {
            return res.status(403).json({ message: "You can only access reports for your own locations" });
          }
        }
      }

      const report = await buildOwnerReport(storage, {
        userId: user.id,
        role: user.role || "owner",
        owner: owner || undefined,
      }, reportQuery);

      if ((req.query.format as string | undefined) === "csv") {
        const csv = reportResponseToCsv(report);
        const filename = `owner-report-${new Date().toISOString().split("T")[0]}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      res.json(reportResponseToJsonWithColumns(report));
    } catch (error: any) {
      const statusCode = error?.message === "Forbidden" ? 403 : 500;
      console.error("Error generating owner report:", error);
      res.status(statusCode).json({ message: error?.message || "Failed to generate owner report" });
    }
  });

  app.get("/api/reports/driver", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !["driver", "admin", "super_admin"].includes(user.role || "")) {
        return res.status(403).json({ message: "Driver or admin access required" });
      }

      const reportQuery: ReportQueryInput = {
        dateRange: req.query.dateRange as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        driverId: req.query.driverId as string | undefined,
        ownerId: req.query.ownerId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        washoutStatus: req.query.washoutStatus as string | undefined,
      };

      if (reportQuery.dateRange === "custom" && (!reportQuery.startDate || !reportQuery.endDate)) {
        return res.status(400).json({ message: "Custom date range requires startDate and endDate" });
      }

      const driver = user.role === "driver" ? await storage.getDriver(user.id) : null;
      if (user.role === "driver") {
        if (!driver) {
          return res.status(404).json({ message: "Driver not found" });
        }
        if (reportQuery.driverId && reportQuery.driverId !== driver.id) {
          return res.status(403).json({ message: "You can only access reports for your own driver account" });
        }
      }

      const report = await buildDriverReport(storage, {
        userId: user.id,
        role: user.role || "driver",
        driver: driver || undefined,
      }, reportQuery);

      if ((req.query.format as string | undefined) === "csv") {
        const csv = reportResponseToCsv(report);
        const filename = `driver-report-${new Date().toISOString().split("T")[0]}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      res.json(reportResponseToJsonWithColumns(report));
    } catch (error: any) {
      const statusCode = error?.message === "Forbidden" ? 403 : 500;
      console.error("Error generating driver report:", error);
      res.status(statusCode).json({ message: error?.message || "Failed to generate driver report" });
    }
  });

  app.get("/api/reports/billing-audit", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== "super_admin") {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const reportQuery: BillingAuditReportQueryInput = {
        dateRange: req.query.dateRange as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        ownerId: req.query.ownerId as string | undefined,
        locationId: req.query.locationId as string | undefined,
        driverId: req.query.driverId as string | undefined,
        stripeTransactionId: req.query.stripeTransactionId as string | undefined,
        billingRunId: req.query.billingRunId as string | undefined,
        status: req.query.status as string | undefined,
      };

      if (reportQuery.dateRange === "custom" && (!reportQuery.startDate || !reportQuery.endDate)) {
        return res.status(400).json({ message: "Custom date range requires startDate and endDate" });
      }

      const report = await buildBillingAuditReport(storage as any, reportQuery);
      const format = String(req.query.format || "json").toLowerCase();

      if (format === "csv") {
        const csv = billingAuditReportToCsv(report);
        const filename = `billing-audit-report-${new Date().toISOString().split("T")[0]}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(csv);
      }

      if (format === "pdf") {
        const pdf = billingAuditReportToPdfBuffer(report);
        const filename = `billing-audit-report-${new Date().toISOString().split("T")[0]}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(pdf);
      }

      return res.json(billingAuditReportToJson(report));
    } catch (error: any) {
      const statusCode = error?.message === "Forbidden" ? 403 : 500;
      console.error("Error generating billing audit report:", error);
      res.status(statusCode).json({ message: error?.message || "Failed to generate billing audit report" });
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

      // Check if user is admin or super admin
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ message: "Administrator access required" });
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

      console.log(`📧 Email updated for ${user.role}: ${user.username} (${user.email} → ${newEmail})`);

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
      // Check for test webhook secret first, then fall back to regular webhook secret
      // Note: Replit UI may store secrets with mixed case (e.g., Stripe_test_webhook_secret)
      const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET || 
                           process.env.Stripe_test_webhook_secret ||
                           process.env.STRIPE_WEBHOOK_SECRET ||
                           process.env.Stripe_webhook_secret;

      // Validate webhook signature and secret
      if (!webhookSecret) {
        console.error(`❌ [${environment}] STRIPE_TEST_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET not configured`);
        return res.status(400).json({ error: 'Webhook secret not configured' });
      }

      if (!sig) {
        console.error(`❌ [${environment}] Missing Stripe signature header`);
        return res.status(400).json({ error: 'Missing signature' });
      }

      // Construct and verify event with raw body
      let event: Stripe.Event;
      try {
      console.log(`🔍 [${environment}] Verifying webhook signature...`);
      console.log(`  - Body type: ${typeof req.body}, Is Buffer: ${Buffer.isBuffer(req.body)}`);
      console.log(`  - Secret configured: ${webhookSecret ? 'yes' : 'no'}`);
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
        eventId = event.id;
      } catch (err: any) {
        console.error(`❌ [${environment}] Webhook signature verification failed: ${err.message}`);
        console.error(`  - Make sure the webhook secret in Replit matches the one in Stripe Dashboard`);
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
          await (storage as any).updateOwnerSubscription(ownerFailed.id, 'past_due');
          
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
          await (storage as any).updateOwnerSubscription(ownerSucceeded.id, 'active');
          
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
            await (storage as any).updateOwnerSubscription(ownerUpdated.id, newStatus, undefined, subscriptionEndsAt);
            
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
          
          await (storage as any).updateOwnerSubscription(ownerDeleted.id, 'inactive');
          
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

      const { businessDate, dryRun = false, ownerId, startDate, endDate, runType } = req.body;
      const cutoffDate = businessDate || new Date().toISOString().split('T')[0];

      console.log(`🔄 Admin triggered ${dryRun ? 'DRY RUN' : 'manual'} batch processing for ${cutoffDate}`);

      const shouldUseUnifiedEngine = Boolean(ownerId || startDate || endDate);
      const results = dryRun
        ? await storage.getDryRunBatchPreview(cutoffDate)
        : shouldUseUnifiedEngine
          ? await processOwnerBillingRun({
              ownerId: ownerId || undefined,
              startDate: startDate ? new Date(startDate) : undefined,
              endDate: endDate ? new Date(endDate) : undefined,
              runType: (runType || "admin_manual") as "weekly_scheduled" | "admin_manual",
              triggeredByAdminId: req.user.id,
              storage: storage as any,
              stripeClient: stripeClient,
            })
          : await storage.processDailyBatches(cutoffDate);
      
      res.json({
        message: dryRun ? "Dry run completed" : shouldUseUnifiedEngine ? "Billing run completed" : "Batch processing completed",
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

  // ==================== MONTHLY FEE LEDGER ADMIN ENDPOINTS ====================

  // Get all fee ledger entries with filtering (super admin only)
  app.get('/api/admin/fees/ledger', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { status = 'pending' } = req.query;
      const fees = await storage.getFeeLedgerEntriesByStatus(status as string);
      
      res.json(fees);
    } catch (error) {
      console.error("Error fetching fee ledger:", error);
      res.status(500).json({ message: "Failed to fetch fee ledger" });
    }
  });

  // Get fee summary statistics (super admin only) - MUST come before /:id route
  app.get('/api/admin/fees/summary', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const pendingFees = await storage.getFeeLedgerEntriesByStatus('pending') as FeeLedger[];
      const paidFees = await storage.getFeeLedgerEntriesByStatus('paid') as FeeLedger[];
      const failedFees = await storage.getFeeLedgerEntriesByStatus('failed') as FeeLedger[];

      const summary = {
        pending: {
          count: pendingFees.length,
          totalAmount: pendingFees.reduce((sum, f) => sum + f.amountCents, 0) / 100,
        },
        paid: {
          count: paidFees.length,
          totalAmount: paidFees.reduce((sum, f) => sum + f.amountCents, 0) / 100,
        },
        failed: {
          count: failedFees.length,
          totalAmount: failedFees.reduce((sum, f) => sum + f.amountCents, 0) / 100,
        },
        total: {
          count: pendingFees.length + paidFees.length + failedFees.length,
          totalAmount: (
            pendingFees.reduce((sum, f) => sum + f.amountCents, 0) +
            paidFees.reduce((sum, f) => sum + f.amountCents, 0) +
            failedFees.reduce((sum, f) => sum + f.amountCents, 0)
          ) / 100,
        },
      };

      res.json(summary);
    } catch (error) {
      console.error("Error fetching fee summary:", error);
      res.status(500).json({ message: "Failed to fetch fee summary" });
    }
  });

  // Get fees for a specific owner (super admin only) - specific route before /:id
  app.get('/api/admin/fees/owner/:ownerId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { ownerId } = req.params;
      const { startDate, endDate } = req.query;
      
      const fees = await storage.getFeeLedgerEntriesByOwner(
        ownerId,
        startDate as string,
        endDate as string
      );
      
      res.json(fees);
    } catch (error) {
      console.error("Error fetching owner fees:", error);
      res.status(500).json({ message: "Failed to fetch owner fees" });
    }
  });

  // Get specific fee details (super admin only) - parameterized route comes LAST
  app.get('/api/admin/fees/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { id } = req.params;
      const fee = await storage.getFeeLedgerEntry(id);
      
      if (!fee) {
        return res.status(404).json({ message: "Fee not found" });
      }

      res.json(fee);
    } catch (error) {
      console.error("Error fetching fee details:", error);
      res.status(500).json({ message: "Failed to fetch fee details" });
    }
  });

  // Retry failed fee (super admin only)
  app.post('/api/admin/fees/:id/retry', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { id } = req.params;
      const fee = await storage.getFeeLedgerEntry(id);
      
      if (!fee) {
        return res.status(404).json({ message: "Fee not found" });
      }

      if (fee.status !== 'failed') {
        return res.status(400).json({ message: "Only failed fees can be retried" });
      }

      // Reset status to pending for retry
      await storage.updateFeeLedgerStatus(id, 'pending');

      // Trigger fee processing
      const result = await storage.processPendingFees();

      res.json({
        message: "Fee retry initiated",
        result,
      });
    } catch (error) {
      console.error("Error retrying fee:", error);
      res.status(500).json({ message: "Failed to retry fee" });
    }
  });

  // Manual fee generation (super admin only - for testing)
  app.post('/api/admin/fees/generate', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const { billingDate } = req.body;
      const date = billingDate || new Date().toISOString().split('T')[0];

      console.log(`🔧 Admin triggered manual fee generation for ${date}`);
      
      const result = await storage.generateMonthlyFeesForDate(date);
      
      res.json({
        message: "Fee generation completed",
        billingDate: date,
        result,
      });
    } catch (error) {
      console.error("Error generating fees:", error);
      res.status(500).json({ message: "Failed to generate fees" });
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

      const pendingPayments = await storage.getPendingPaymentsForBatch(owner.id, businessDate) as BatchPayment[];
      
      const summary = {
        businessDate,
        timezone,
        cutoffTime: billingSettings?.billingCutoffTime || '23:59:00',
        pendingPayments: pendingPayments.length,
        totalAmount: pendingPayments.reduce((sum, p) => sum + parseFloat(p.amount) + parseFloat(p.processingFee) + Number((p.tipAmountCents || 0) / 100), 0).toFixed(2),
        totalFees: pendingPayments.reduce((sum, p) => sum + parseFloat(p.processingFee) + Number((p.tipAmountCents || 0) / 100), 0).toFixed(2),
        payments: pendingPayments.map((p) => ({
          id: p.id,
          amount: p.amount,
          processingFee: p.processingFee,
          driverTip: Number((p.tipAmountCents || 0) / 100).toFixed(2),
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
          await (storage as any).updateOwnerSubscription(owner.id, 'inactive');
          
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

  // Manually activate owner wallet (superadmin only) - useful when Treasury approval is pending
  app.post('/api/superadmin/owners/:id/activate-wallet', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }

      const ownerId = req.params.id;
      const owner = await storage.getOwnerById(ownerId);
      
      if (!owner) {
        return res.status(404).json({ message: "Owner not found" });
      }

      console.log(`🔧 [ADMIN] Manually activating wallet for owner ${ownerId} (${owner.id})`);

      // Activate wallet - set status to active even without Treasury
      await storage.updateOwner(ownerId, {
        walletStatus: 'active',
        updatedAt: new Date()
      });

      console.log(`✅ [ADMIN] Wallet activated for owner ${ownerId}`);

      res.json({
        success: true,
        message: "Wallet activated successfully",
        ownerId: ownerId,
        walletStatus: 'active'
      });
    } catch (error: any) {
      console.error("[ADMIN] Error activating wallet:", error);
      res.status(500).json({ message: "Failed to activate wallet: " + error.message });
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

  // ===== NEW CLEAN PHOTO SYSTEM =====
  
  // Get signed URLs for activity photos (for owners to view)
  app.get('/api/photos/activity/:activityId', isAuthenticated, async (req: any, res) => {
    try {
      const { activityId } = req.params;
      const userId = req.user.id;

      console.log("Photo view endpoint called:", {
        endpoint: "/api/photos/activity/:activityId",
        activityId,
        userId,
        role: req.user?.role,
        objectPathPrefix: "photos/",
      });
      
      // Get the activity to verify access
      const activity = await storage.getWashoutActivity(activityId);
      if (!activity) {
        return res.status(404).json({ message: 'Activity not found' });
      }
      
      // Verify user has access (either owner of the location OR driver who performed the washout)
      const location: any = await storage.getWashoutLocation(activity.locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }
      
      const user = await storage.getUser(userId);
      const owner = await storage.getOwner(userId);
      const isOwner = !!owner && location.ownerId === owner.id;
      const driver = await storage.getDriver(userId);
      const isDriver = !!driver && activity.driverId === driver.id;
      const isAdmin = user?.role === "admin" || user?.role === "super_admin";
      const allowed = isOwner || isDriver || isAdmin;
      const aclReason = isAdmin
        ? "admin-role"
        : isOwner
          ? "location-owner"
          : isDriver
            ? "driver-owns-activity"
            : "access-denied";

      console.log("Photo activity ACL decision:", {
        endpoint: "/api/photos/activity/:activityId",
        activityId,
        userId,
        role: user?.role,
        reason: aclReason,
        objectPathPrefix: "photos/",
        locationId: activity.locationId,
        locationOwnerId: location.ownerId,
        activityDriverId: activity.driverId,
        isOwner,
        isDriver,
        isAdmin,
        allowed,
      });
      
      if (!allowed) {
        return res.status(403).json({ message: 'You are not authorized to view these washout photos.' });
      }
      
      // Get photos for this activity
      const photos = await storage.getPhotosByActivity(activityId) as WashoutPhoto[];

      const readSelection = getPhotoReadProviderSelection();
      console.log("Photo view signed GET provider selected:", {
        provider: readSelection.provider,
        bucket: readSelection.bucket,
        s3EndpointPresent: readSelection.s3EndpointPresent,
      });

      const privateDir = readSelection.provider === "s3"
        ? new ObjectStorageService().getPrivateObjectDir()
        : "";

      const duplicateWindowStart = new Date();
      duplicateWindowStart.setDate(duplicateWindowStart.getDate() - PHOTO_DUPLICATE_LOOKBACK_DAYS);
      let recentDuplicateCandidates: PhotoFingerprintCandidate[] = [];
      if (isAdmin) {
        try {
          recentDuplicateCandidates = await storage.getRecentWashoutPhotoDuplicateCandidates(duplicateWindowStart);
        } catch (error) {
          console.warn("Admin duplicate photo lookup failed; continuing without duplicate matches:", {
            endpoint: "/api/photos/activity/:activityId",
            activityId,
            userId,
            ...summarizeDatabaseError(error, {
              phase: "photo-duplicate-candidate-lookup",
              table: "washout_photos",
            }),
            query: typeof error === "object" && error && "query" in error ? (error as { query?: string }).query : undefined,
            params: typeof error === "object" && error && "params" in error ? (error as { params?: unknown[] }).params : undefined,
            stack: error instanceof Error ? error.stack : undefined,
          });
          recentDuplicateCandidates = [];
        }
      }

      const previewPhotos = await Promise.all(photos.map(async (photo) => {
        const url = readSelection.provider === "s3"
          ? await signObjectURL({
              bucketName: readSelection.bucket,
              objectName: `${privateDir}/photos/${photo.storageKey}`,
              method: "GET",
              ttlSec: 300,
            })
          : `/objects/photos/${photo.storageKey}`;
        const duplicateMatches = isAdmin
          ? findLikelyDuplicatePhotoMatches(
              photo.imageFingerprint,
              recentDuplicateCandidates.filter((candidate: PhotoFingerprintCandidate) => candidate.photoId !== photo.id),
            )
          : [];

        return {
          id: photo.id,
          url,
          uploadedAt: photo.uploadedAt,
          photoTakenAt: photo.photoTakenAt,
          gpsLatitude: photo.gpsLatitude,
          gpsLongitude: photo.gpsLongitude,
          verificationStatus: photo.verificationStatus,
          verificationDistanceMiles: photo.verificationDistanceMiles,
          verificationReason: photo.verificationReason,
          duplicateMatchedPhotoId: photo.duplicateMatchedPhotoId,
          duplicateMatchedUploadedAt: photo.duplicateMatchedUploadedAt,
          duplicateSimilarityScore: photo.duplicateSimilarityScore,
          duplicateHashDistance: photo.duplicateHashDistance,
          locationId: photo.locationId,
          driverId: photo.driverId,
          contentType: photo.contentType,
          duplicateMatches: isAdmin ? duplicateMatches : undefined,
        };
      }));

      res.json({ photos: previewPhotos });
    } catch (error) {
      console.error('Error getting activity photos:', error);
      const message = error instanceof Error ? error.message : 'Failed to get photos';
      res.status(500).json({ message });
    }
  });
  
  // Get upload URL for new photos
  app.post('/api/photos/upload-url', isAuthenticated, async (req: any, res) => {
    try {
      const storageSelection = getPhotoUploadProviderSelection();
      console.log(`Photo upload provider selected: ${storageSelection.provider}`);
      if (storageSelection.provider !== "s3") {
        return res.status(500).json({
          message: `Missing object storage env vars: ${storageSelection.missing?.join(", ") || "S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET"}`,
          endpoint: '/api/photos/upload-url',
        });
      }
      console.log("Upload URL route called:", {
        provider: storageSelection.provider,
        bucket: storageSelection.bucket,
        s3EndpointPresent: storageSelection.s3EndpointPresent,
      });

      const { contentType = 'image/jpeg', fileSize } = req.body;
      if (!SUPPORTED_PHOTO_CONTENT_TYPES.has(contentType)) {
        return res.status(400).json({
          message: `Unsupported photo format: ${contentType}. Please use JPEG, PNG, WebP, HEIC, or HEIF.`,
          endpoint: '/api/photos/upload-url',
        });
      }

      if (fileSize != null) {
        const numericFileSize = Number(fileSize);
        if (!Number.isFinite(numericFileSize) || numericFileSize <= 0) {
          return res.status(400).json({
            message: "Invalid fileSize. Please reselect the photo and try again.",
            endpoint: '/api/photos/upload-url',
          });
        }

        if (numericFileSize > MAX_PHOTO_UPLOAD_BYTES) {
          return res.status(400).json({
            message: `Photo is too large. Please use a photo smaller than ${Math.floor(MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024))} MB.`,
            endpoint: '/api/photos/upload-url',
          });
        }
      }
      
      // Generate unique filename
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const extension =
        contentType === "image/png" ? "png" :
        contentType === "image/webp" ? "webp" :
        contentType === "image/heic" ? "heic" :
        contentType === "image/heif" ? "heif" : "jpg";
      const storageKey = `photo-${timestamp}-${randomId}.${extension}`;
      const objectStorageService = new ObjectStorageService();
      const privateDir = objectStorageService.getPrivateObjectDir();
      
      // Generate signed upload URL  
      const uploadUrl = await signUploadObjectURL({
        objectName: `${privateDir}/photos/${storageKey}`,
        method: 'PUT',
        ttlSec: 600, // 10 minutes to complete upload
        contentType,
      });

      console.log("Upload URL generated successfully:", {
        provider: storageSelection.provider,
        bucket: storageSelection.bucket,
        storageKey,
        contentType,
      });
      
      res.json({ 
        uploadUrl,
        storageKey,
        contentType 
      });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Failed to generate upload URL',
        endpoint: '/api/photos/upload-url'
      });
    }
  });
  
  // Create activity with photos (transactional)
  app.post('/api/activities/create-with-photos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { activityData, photoData } = req.body;
      console.info("Create-with-photos request received:", {
        endpoint: "/api/activities/create-with-photos",
        userId,
        hasActivityData: Boolean(activityData),
        hasPhotoData: Array.isArray(photoData),
        photoCount: Array.isArray(photoData) ? photoData.length : 0,
      });
      
      // Verify user is a driver FIRST
      const driver = await storage.getDriver(userId);
      if (!driver) {
        return res.status(403).json({ message: "Driver access required" });
      }
      
      // Add driverId to activity data before validation
      const completeActivityData = {
        ...activityData,
        driverId: driver.id
      };
      
      // Validate input with complete data
      const activityResult = insertWashoutActivitySchema.safeParse(completeActivityData);
      console.info("Create-with-photos activity validation result:", {
        endpoint: "/api/activities/create-with-photos",
        userId,
        driverId: driver.id,
        locationId: activityData?.locationId ?? null,
        status: activityData?.status ?? null,
        amount: activityData?.amount ?? null,
        success: activityResult.success,
        issueCount: activityResult.success ? 0 : activityResult.error.issues.length,
      });
      if (!activityResult.success) {
        return res.status(400).json({ 
          message: "Invalid activity data", 
          errors: activityResult.error.issues 
        });
      }
      
      const location = await storage.getWashoutLocation(activityResult.data.locationId);
      console.info("Create-with-photos location lookup result:", {
        endpoint: "/api/activities/create-with-photos",
        locationId: activityResult.data.locationId,
        found: Boolean(location),
        ownerId: location?.ownerId ?? null,
      });
      if (!location) {
        return res.status(400).json({ message: "Invalid location. Please reselect the washout site and try again." });
      }

      if (activityResult.data.status !== "pending") {
        return res.status(400).json({
          message: "Checkout must start in pending status.",
        });
      }

      if (!Array.isArray(photoData) || photoData.length === 0) {
        return res.status(400).json({
          message: "At least one photo is required to complete checkout.",
        });
      }

      const locationLatitude = location.latitude != null ? Number(location.latitude) : null;
      const locationLongitude = location.longitude != null ? Number(location.longitude) : null;

      const duplicateWindowStart = new Date();
      duplicateWindowStart.setDate(duplicateWindowStart.getDate() - PHOTO_DUPLICATE_LOOKBACK_DAYS);
      let recentDuplicateCandidates: PhotoFingerprintCandidate[] = [];
      let duplicateLookupFailed = false;
      try {
        recentDuplicateCandidates = await storage.getRecentWashoutPhotoDuplicateCandidates(duplicateWindowStart);
      } catch (error) {
        duplicateLookupFailed = true;
        console.warn("Duplicate photo lookup failed; continuing without duplicate matches:", {
          endpoint: "/api/activities/create-with-photos",
          ...summarizeDatabaseError(error, {
            phase: "photo-duplicate-candidate-lookup",
            table: "washout_photos",
          }),
          query: typeof error === "object" && error && "query" in error ? (error as { query?: string }).query : undefined,
          params: typeof error === "object" && error && "params" in error ? (error as { params?: unknown[] }).params : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          ownerUserId: req.user?.id ?? null,
          driverId: driver.id,
          locationId: activityResult?.data?.locationId ?? null,
          photoCount: Array.isArray(photoData) ? photoData.length : 0,
        });
      }

      // Prepare photos with verification metadata
      const photos = [];
      for (let index = 0; index < (photoData || []).length; index += 1) {
        const photo = (photoData || [])[index];
        if (!photo || typeof photo !== "object") {
          return res.status(400).json({
            message: "Invalid photo metadata. Please re-upload the photo and try again.",
          });
        }

        if (typeof photo.storageKey !== "string" || !photo.storageKey.trim()) {
          return res.status(400).json({
            message: "Photo upload is missing its storage key. Please re-upload the photo.",
          });
        }

        if (typeof photo.contentType !== "string" || !photo.contentType.trim()) {
          return res.status(400).json({
            message: "Photo upload is missing its content type. Please re-upload the photo.",
          });
        }

        if (photo.fileSize == null || !Number.isFinite(Number(photo.fileSize)) || Number(photo.fileSize) <= 0) {
          return res.status(400).json({
            message: "Photo upload is missing its file size. Please re-upload the photo.",
          });
        }

        if (photo.gpsLatitude == null || photo.gpsLongitude == null) {
          return res.status(400).json({
            message: "Please enable GPS and retake the photo so it can be verified.",
          });
        }

        const uploadedAt = photo.uploadedAt ? new Date(photo.uploadedAt) : new Date();
        const photoTakenAt = photo.photoTakenAt
          ? new Date(photo.photoTakenAt)
          : uploadedAt;
        const gpsLatitude = photo.gpsLatitude != null ? Number(photo.gpsLatitude) : null;
        const gpsLongitude = photo.gpsLongitude != null ? Number(photo.gpsLongitude) : null;
        const imageFingerprint = typeof photo.imageFingerprint === "string" && photo.imageFingerprint.trim()
          ? photo.imageFingerprint.trim().toLowerCase()
          : null;
        if (!Number.isFinite(photoTakenAt.getTime()) || !Number.isFinite(uploadedAt.getTime())) {
          return res.status(400).json({
            message: "Photo timestamps are invalid. Please re-upload the photo.",
          });
        }

        const freshness = evaluatePhotoFreshness({
          photoTakenAt,
          uploadedAt,
        });

        console.info("Create-with-photos photo freshness result:", {
          endpoint: "/api/activities/create-with-photos",
          userId,
          locationId: activityResult.data.locationId,
          photoIndex: index,
          storageKey: photo.storageKey,
          status: freshness.status,
          ageHours: freshness.ageHours,
          reason: freshness.reason,
        });

        if (freshness.status === "rejected") {
          return res.status(400).json({
            message: freshness.reason,
          });
        }

        const verification = evaluatePhotoVerification({
          gpsLatitude,
          gpsLongitude,
          locationLatitude,
          locationLongitude,
        });
        let duplicateMatches: ReturnType<typeof findLikelyDuplicatePhotoMatches> = [];
        let duplicateReason: string | null = null;
        try {
          duplicateMatches = findLikelyDuplicatePhotoMatches(imageFingerprint, recentDuplicateCandidates);
          duplicateReason = duplicateMatches.length > 0
            ? `Possible duplicate photo detected${duplicateMatches.length > 1 ? ` (${duplicateMatches.length} matches)` : ""}.`
            : !imageFingerprint
              ? "Image fingerprint unavailable."
              : duplicateLookupFailed
                ? "Duplicate verification unavailable."
                : null;
        } catch (error) {
          duplicateLookupFailed = true;
          duplicateReason = "Duplicate verification unavailable.";
          console.warn("Duplicate fingerprint comparison failed; continuing without duplicate matches:", {
            endpoint: "/api/activities/create-with-photos",
            reason: error instanceof Error ? error.message : String(error),
          });
        }

        const freshnessReason =
          freshness.status === "review"
            ? freshness.reason
            : null;
        const hasDuplicateSignal = duplicateMatches.length > 0 || !imageFingerprint || duplicateLookupFailed || freshness.status === "review";
        const verificationReason = [duplicateReason, freshnessReason, verification.reason].filter(Boolean).join(" ").trim();
        console.info("Create-with-photos photo verification result:", {
          endpoint: "/api/activities/create-with-photos",
          userId,
          locationId: activityResult.data.locationId,
          photoIndex: index,
          storageKey: photo.storageKey,
          gpsLatitude,
          gpsLongitude,
          verificationStatus: hasDuplicateSignal ? "needs_review" : verification.status,
          verificationDistanceMiles: verification.distanceMiles,
          duplicateMatchCount: duplicateMatches.length,
          duplicateLookupFailed,
          freshnessStatus: freshness.status,
          freshnessReason,
          verificationReason,
        });

        const photoRow = {
          storageKey: photo.storageKey,
          contentType: photo.contentType || 'image/jpeg',
          fileSize: photo.fileSize,
          driverId: driver.id,
          locationId: activityResult.data.locationId,
          photoTakenAt,
          uploadedAt,
          gpsLatitude,
          gpsLongitude,
          imageFingerprint,
          duplicateMatchedPhotoId: duplicateMatches[0]?.photoId ?? null,
          duplicateMatchedUploadedAt: duplicateMatches[0]?.priorUploadedAt ? new Date(duplicateMatches[0].priorUploadedAt) : null,
          duplicateSimilarityScore: duplicateMatches[0]?.confidence ?? null,
          duplicateHashDistance: duplicateMatches[0]?.hashDistance ?? null,
          verificationStatus: hasDuplicateSignal ? "needs_review" : verification.status,
          verificationDistanceMiles: verification.distanceMiles == null ? null : verification.distanceMiles.toFixed(3),
          verificationReason,
        };

        photos.push(photoRow);
      }

      // Create activity with photos atomically
      console.info("Create-with-photos DB insert starting:", {
        endpoint: "/api/activities/create-with-photos",
        userId,
        driverId: driver.id,
        locationId: activityResult.data.locationId,
        photoCount: photos.length,
      });

      let result;
      try {
        result = await storage.createWashoutActivityWithPhotos(
          activityResult.data,
          photos
        );
      } catch (error) {
        const dbError = summarizeDatabaseError(error, {
          phase: "create-with-photos",
          table: "washout_photos",
        });
        console.error("Create-with-photos DB insert failed:", {
          endpoint: "/api/activities/create-with-photos",
          userId,
          driverId: driver.id,
          locationId: activityResult.data.locationId,
          photoCount: photos.length,
          ...dbError,
        });
        if (dbError.category === "schema_mismatch" || dbError.category === "enum_mismatch") {
          return res.status(500).json({
            message: "Database schema is missing required photo metadata fields. Please deploy the latest migration.",
          });
        }

        if (dbError.category === "null_violation") {
          return res.status(500).json({
            message: "Database rejected required photo metadata. Please re-upload the photo.",
          });
        }

        if (dbError.category === "foreign_key_violation") {
          return res.status(500).json({
            message: "Database rejected an invalid location or photo reference. Please try again.",
          });
        }

        if (dbError.category === "unique_violation" || dbError.category === "constraint_violation") {
          return res.status(500).json({
            message: "Database constraint prevented checkout. Please try again.",
          });
        }

        return res.status(500).json({
          message: "Database insert failed. Please try again.",
        });
      }
      console.info("Create-with-photos DB insert completed:", {
        endpoint: "/api/activities/create-with-photos",
        userId,
        driverId: driver.id,
        locationId: activityResult.data.locationId,
        activityId: result.activity.id,
        photoCount: result.photos.length,
      });

      if (result.photos.length > 0) {
        const objectStorageService = new ObjectStorageService();
        const aclPolicy: ObjectAclPolicy = {
          owner: userId,
          visibility: "private",
          aclRules: [
            {
              group: {
                type: ObjectAccessGroupType.LOCATION_OWNER,
                id: activityResult.data.locationId,
              },
              permission: ObjectPermission.READ,
            },
          ],
        };

        for (const photo of result.photos) {
          try {
            await objectStorageService.trySetObjectEntityAclPolicy(
              `/objects/photos/${photo.storageKey}`,
              aclPolicy,
            );
            console.log("Photo ACL applied:", {
              activityId: result.activity.id,
              locationId: activityResult.data.locationId,
              objectPathPrefix: "photos/",
              photoId: photo.id,
            });
          } catch (error) {
            console.warn("Photo ACL application failed:", {
              activityId: result.activity.id,
              locationId: activityResult.data.locationId,
              objectPathPrefix: "photos/",
              photoId: photo.id,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      
      res.json({
        activity: result.activity,
        photoCount: result.photos.length
      });
    } catch (error) {
      const dbError = summarizeDatabaseError(error, {
        phase: "create-with-photos",
        table: "washout_activities",
      });
      console.error('Error creating activity with photos:', {
        endpoint: "/api/activities/create-with-photos",
        ...dbError,
      });

      if (dbError.category === "schema_mismatch" || dbError.category === "enum_mismatch") {
        return res.status(500).json({
          message: "Database schema is missing required photo metadata fields. Please deploy the latest migration.",
        });
      }

      if (dbError.category === "null_violation") {
        return res.status(500).json({
          message: "Database rejected required photo metadata. Please re-upload the photo.",
        });
      }

      if (dbError.category === "foreign_key_violation") {
        return res.status(500).json({
          message: "Database rejected an invalid location or photo reference. Please try again.",
        });
      }

      if (dbError.category === "unique_violation" || dbError.category === "constraint_violation") {
        return res.status(500).json({
          message: "Database constraint prevented checkout. Please try again.",
        });
      }

      res.status(500).json({ message: 'Checkout failed unexpectedly. Please try again.' });
    }
  });

  // ===== OLD COMPLEX PHOTO SYSTEM (TO BE REMOVED) =====
  
  // Photo proxy endpoint with proper authentication
  app.get('/api/objects/photos/:key', isAuthenticated, async (req: any, res) => {
    try {
      const { key } = req.params;
      const storageSelection = getPhotoReadProviderSelection();
      console.log('📸 Photo proxy request:', {
        endpoint: '/api/objects/photos/:key',
        userId: req.user?.id,
        role: req.user?.role,
        objectPathPrefix: "photos/",
        timestamp: new Date().toISOString()
      });
      
      if (!key) {
        return res.status(400).json({ message: 'Photo key is required' });
      }

      console.log("Photo proxy provider selected:", {
        provider: storageSelection.provider,
        bucket: storageSelection.bucket,
        s3EndpointPresent: storageSelection.s3EndpointPresent,
      });

      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(`/objects/photos/${key}`);
      const aclPolicy = await getObjectAclPolicy(objectFile);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: req.user?.id,
        userRole: req.user?.role,
        requestedPermission: ObjectPermission.READ,
      });
      const aclReason = req.user?.role === "admin" || req.user?.role === "super_admin"
        ? "admin-role"
        : !aclPolicy
          ? "missing-acl-policy"
          : aclPolicy.owner === req.user?.id
            ? "object-owner"
            : aclPolicy.visibility === "public"
              ? "public-visibility"
              : canAccess
                ? "acl-rules-allowed"
                : "acl-rules-denied";
      console.log("Photo proxy ACL decision:", {
        key,
        userId: req.user?.id,
        role: req.user?.role,
        reason: aclReason,
        allowed: canAccess,
      });

      if (!canAccess) {
        return res.status(403).json({
          message: "You are not authorized to view this photo.",
          photoKey: key,
        });
      }

      await objectStorageService.downloadObject(objectFile, res);
      
    } catch (error) {
      console.error('❌ Error serving photo:', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        objectPathPrefix: "photos/"
      });
      const message = error instanceof ObjectNotFoundError
        ? "Photo not found"
        : error instanceof Error
          ? error.message
          : "Failed to serve photo";
      const status = error instanceof ObjectNotFoundError ? 404 : 500;
      res.status(status).json({ message });
    }
  });

  // Legacy photo presigned URL endpoint (for debugging)
  app.post('/api/objects/photos/sign', isAuthenticated, async (req: any, res) => {
    console.log('📸 Photo presigned URL request received:', {
      body: req.body,
      userId: req.user?.id
    });
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
      const objectStorageService = new ObjectStorageService();
      const privateDir = objectStorageService.getPrivateObjectDir();
      const signedUrl = await signObjectURL({
        bucketName: getDefaultObjectStorageBucketName(),
        objectName: `${privateDir}/photos/${key}`,
        method: 'GET',
        ttlSec: 120
      });
      
      console.log('✅ Presigned URL generated successfully:', {
        key,
        signedUrlLength: signedUrl.length,
        signedUrlPreview: signedUrl.substring(0, 100) + '...'
      });

      res.json({ signedUrl });
    } catch (error) {
      console.error('❌ Error generating presigned URL:', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        key: req.body?.key
      });
      res.status(500).json({ message: 'Failed to generate signed URL' });
    }
  });

  // TEMPORARY ADMIN ROUTE: Fix photo ownership for production issue
  app.post('/api/admin/fix-photo-ownership', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      
      // Restrict to admin access only
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { photoKey, newOwnerId } = req.body;
      
      if (!photoKey || !newOwnerId) {
        return res.status(400).json({ error: 'photoKey and newOwnerId are required' });
      }

      console.log('🔧 Admin fixing photo ownership:', { photoKey, newOwnerId, adminId: user.id });

      // Get the photo file from object storage
      const objectStorage = new ObjectStorageService();
      const objectFile = await objectStorage.getObjectEntityFile(`/objects/photos/${photoKey}`);
      
      // Get current ACL policy
      const currentPolicy = await getObjectAclPolicy(objectFile);
      
      if (!currentPolicy) {
        return res.status(404).json({ error: 'Photo ACL policy not found' });
      }

      console.log('📋 Current ACL policy:', currentPolicy);

      // Update the owner field to the correct owner ID
      const updatedPolicy = {
        ...currentPolicy,
        owner: newOwnerId
      };

      // Set the updated ACL policy
      await setObjectAclPolicy(objectFile, updatedPolicy);

      console.log('✅ Updated ACL policy:', updatedPolicy);

      res.json({
        success: true,
        message: 'Photo ownership updated successfully',
        oldOwner: currentPolicy.owner,
        newOwner: newOwnerId,
        photoKey
      });

    } catch (error) {
      console.error('Error fixing photo ownership:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // ====================================
  // Feature Flag Management Routes
  // ====================================

  // Get all feature flags (admin only)
  app.get("/api/feature-flags", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const flags = await storage.getAllFeatureFlags() as FeatureFlag[];
      console.log(`🚩 Feature flags retrieved: ${flags.length} flags`, flags.map((f) => f.flagKey));
      res.json(flags);
    } catch (error) {
      console.error('❌ Error fetching feature flags:', error);
      res.status(500).json({ message: 'Failed to fetch feature flags' });
    }
  });

  // Check if a feature is enabled for current user
  app.get("/api/feature-flags/:flagKey/check", isAuthenticated, async (req: any, res) => {
    try {
      const { flagKey } = req.params;
      const user = await storage.getUser(req.user.id);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const enabled = await storage.checkFeatureFlag(flagKey, user.id, user.role);
      res.json({ enabled });
    } catch (error) {
      console.error('❌ Error checking feature flag:', error);
      res.status(500).json({ message: 'Failed to check feature flag' });
    }
  });

  // Toggle feature flag globally (admin only)
  app.put("/api/feature-flags/:flagKey/toggle", isAuthenticated, async (req: any, res) => {
    try {
      const { flagKey } = req.params;
      const { enabled } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      // Auto-create the flag if it doesn't exist yet (upsert behavior)
      let existingFlag = await storage.getFeatureFlag(flagKey);
      if (!existingFlag) {
        const { FEATURE_FLAG_DEFINITIONS } = await import('../shared/featureFlags');
        const definition = FEATURE_FLAG_DEFINITIONS.find(d => d.key === flagKey);
        existingFlag = await storage.createFeatureFlag({
          flagKey,
          enabled: definition?.enabled ?? false,
          description: definition?.description || flagKey,
          allowedRoles: definition?.allowedRoles || [],
        });
      }

      // Toggle: if enabled is explicitly provided use it, otherwise flip the current value
      const newEnabled = typeof enabled === 'boolean' ? enabled : !existingFlag.enabled;
      const flag = await storage.updateFeatureFlag(flagKey, newEnabled);
      res.json(flag);
    } catch (error) {
      console.error('❌ Error toggling feature flag:', error);
      res.status(500).json({ message: 'Failed to toggle feature flag' });
    }
  });

  // Set user-specific override (admin only)
  app.put("/api/feature-flags/:flagKey/override/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { flagKey, userId } = req.params;
      const { enabled } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const override = await storage.setFeatureFlagOverride(flagKey, userId, enabled);
      res.json(override);
    } catch (error) {
      console.error('❌ Error setting feature flag override:', error);
      res.status(500).json({ message: 'Failed to set feature flag override' });
    }
  });

  // Update allowed roles for a feature flag (admin only)
  app.put("/api/feature-flags/:flagKey/roles", isAuthenticated, async (req: any, res) => {
    try {
      const { flagKey } = req.params;
      const { allowedRoles } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const flag = await storage.updateFeatureFlagRoles(flagKey, allowedRoles);
      res.json(flag);
    } catch (error) {
      console.error('❌ Error updating feature flag roles:', error);
      res.status(500).json({ message: 'Failed to update feature flag roles' });
    }
  });

  // Seed predefined feature flags (super admin only)
  app.post("/api/feature-flags/seed", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      // Import feature flag definitions
      const { FEATURE_FLAG_DEFINITIONS } = await import('../shared/featureFlags');
      
      const seededFlags = [];
      for (const definition of FEATURE_FLAG_DEFINITIONS) {
        try {
          const flag = await storage.createFeatureFlag({
            flagKey: definition.key,
            description: definition.description,
            enabled: definition.enabled,
            allowedRoles: definition.allowedRoles || [],
          });
          seededFlags.push(flag);
        } catch (error: any) {
          // If flag already exists, skip it
          if (error.message && error.message.includes('duplicate')) {
            console.log(`⏭️  Flag ${definition.key} already exists, skipping`);
          } else {
            throw error;
          }
        }
      }
      
      res.json({ 
        message: 'Feature flags seeded successfully',
        seededCount: seededFlags.length,
        flags: seededFlags
      });
    } catch (error) {
      console.error('❌ Error seeding feature flags:', error);
      res.status(500).json({ message: 'Failed to seed feature flags' });
    }
  });

  // Create a new feature flag (admin only)
  app.post("/api/feature-flags", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const flag = await storage.createFeatureFlag(req.body);
      res.json(flag);
    } catch (error) {
      console.error('❌ Error creating feature flag:', error);
      res.status(500).json({ message: 'Failed to create feature flag' });
    }
  });

  // ========== BALANCE RECONCILIATION ENDPOINTS ==========
  
  // POST /api/admin/reconciliation/run - Run balance reconciliation (admin only)
  app.post('/api/admin/reconciliation/run', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const { performBalanceReconciliation } = await import('./reconciliationService');
      
      console.log(`🔍 Manual reconciliation triggered by ${user.username}`);
      const result = await performBalanceReconciliation(user.id);

      res.json({
        message: 'Reconciliation completed successfully',
        result
      });
    } catch (error: any) {
      console.error('❌ Error running reconciliation:', error.message);
      res.status(500).json({ 
        message: 'Failed to run reconciliation',
        error: error.message 
      });
    }
  });

  // GET /api/admin/reconciliation/:id - Get reconciliation report (admin only)
  app.get('/api/admin/reconciliation/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const { getReconciliationReport } = await import('./reconciliationService');
      const report = await getReconciliationReport(req.params.id);

      res.json(report);
    } catch (error: any) {
      console.error('❌ Error fetching reconciliation report:', error.message);
      res.status(500).json({ 
        message: 'Failed to fetch reconciliation report',
        error: error.message 
      });
    }
  });

  // GET /api/admin/reconciliation/history - Get reconciliation history (admin only)
  app.get('/api/admin/reconciliation/history', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const reconciliations = await db
        .select()
        .from(balanceReconciliations)
        .orderBy(desc(balanceReconciliations.createdAt))
        .limit(50);

      res.json(reconciliations);
    } catch (error: any) {
      console.error('❌ Error fetching reconciliation history:', error.message);
      res.status(500).json({ 
        message: 'Failed to fetch reconciliation history',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/discrepancy/:id/resolve - Resolve a discrepancy (admin only)
  app.post('/api/admin/reconciliation/discrepancy/:id/resolve', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const { resolutionNotes } = req.body;
      if (!resolutionNotes) {
        return res.status(400).json({ message: 'Resolution notes required' });
      }

      const { resolveDiscrepancy } = await import('./reconciliationService');
      await resolveDiscrepancy(req.params.id, user.id, resolutionNotes);

      res.json({ message: 'Discrepancy resolved successfully' });
    } catch (error: any) {
      console.error('❌ Error resolving discrepancy:', error.message);
      res.status(500).json({ 
        message: 'Failed to resolve discrepancy',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/run-daily - Alias for daily cron reconciliation (admin only)
  app.post('/api/admin/reconciliation/run-daily', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const { performBalanceReconciliation } = await import('./reconciliationService');
      
      console.log(`🔍 Daily reconciliation triggered by ${user.username}`);
      const result = await performBalanceReconciliation(user.id);

      res.json(result);
    } catch (error: any) {
      console.error('❌ Error running reconciliation:', error.message);
      res.status(500).json({ 
        message: 'Failed to run reconciliation',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/test-discrepancy - Inject test discrepancy (admin only)
  app.post('/api/admin/reconciliation/test-discrepancy', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      // Find users with Stripe Connect accounts (these are the ones being reconciled)
      const driverUsers = await db
        .select()
        .from(users)
        .where(and(
          eq(users.role, 'driver'),
          isNotNull(users.stripeConnectAccountId)
        ))
        .limit(1);

      if (driverUsers.length === 0) {
        return res.status(400).json({ 
          message: 'No drivers with Stripe Connect accounts found',
          hint: 'Drivers need Stripe Connect accounts to be reconciled. Create a test driver or use an existing driver with a complete setup.'
        });
      }

      const driverUser = driverUsers[0];
      
      // Get or create driver profile
      let driverProfile = await storage.getDriverByUserId(driverUser.id);
      if (!driverProfile) {
        return res.status(400).json({ 
          message: 'Driver has no profile',
          hint: 'Driver user found but missing driver profile. Complete driver setup first.'
        });
      }

      // Get or create wallet
      let wallet = await storage.getDriverWallet(driverProfile.id);
      if (!wallet) {
        return res.status(400).json({ 
          message: 'Driver has no wallet',
          hint: 'Driver profile found but missing wallet. Complete driver setup first.'
        });
      }

      const oldBalance = parseFloat(wallet.availableBalance);
      const newBalance = oldBalance + 5.00;

      await (storage as any).updateDriverWallet(driverProfile.id, {
        availableBalance: newBalance.toFixed(2)
      });

      console.log(`✅ Injected $5.00 discrepancy for driver ${driverProfile.id} (${driverUser.username})`);

      res.json({
        message: 'Test discrepancy injected successfully',
        driverId: driverProfile.id,
        username: driverUser.username,
        oldBalance: `$${oldBalance.toFixed(2)}`,
        newBalance: `$${newBalance.toFixed(2)}`,
        discrepancy: '$5.00',
        note: 'Run reconciliation to detect and auto-correct this discrepancy'
      });
    } catch (error: any) {
      console.error('❌ Error injecting discrepancy:', error.message);
      res.status(500).json({ 
        message: 'Failed to inject discrepancy',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/test-payment-flow - Test complete payment flow (admin only)
  app.post('/api/admin/reconciliation/test-payment-flow', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      res.json({
        message: 'Test payment flow simulation - using test Stripe data',
        note: 'In test mode, payments use Stripe test keys. Use POST /api/test/stripe-connect-payment for full flow testing.'
      });
    } catch (error: any) {
      console.error('❌ Error in test payment flow:', error.message);
      res.status(500).json({ 
        message: 'Failed to run test payment flow',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/payments - Run payment reconciliation (admin only)
  app.post('/api/admin/reconciliation/payments', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      const { startDate, endDate, limit } = req.body;
      
      const { performPaymentReconciliation } = await import('./reconciliationService');
      const result = await performPaymentReconciliation(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
        limit || 100
      );

      res.json({
        message: 'Payment reconciliation completed',
        result
      });
    } catch (error: any) {
      console.error('❌ Error in payment reconciliation:', error.message);
      res.status(500).json({ 
        message: 'Failed to run payment reconciliation',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/batches - Run batch payment reconciliation (admin only)
  app.post('/api/admin/reconciliation/batches', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      const { startDate, endDate, limit } = req.body;
      
      const { performBatchReconciliation } = await import('./reconciliationService');
      const result = await performBatchReconciliation(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined,
        limit || 50
      );

      res.json({
        message: 'Batch reconciliation completed',
        result
      });
    } catch (error: any) {
      console.error('❌ Error in batch reconciliation:', error.message);
      res.status(500).json({ 
        message: 'Failed to run batch reconciliation',
        error: error.message 
      });
    }
  });

  // POST /api/admin/reconciliation/sync-payment/:paymentId - Sync single payment from Stripe (admin only)
  app.post('/api/admin/reconciliation/sync-payment/:paymentId', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      const { paymentId } = req.params;
      
      const { syncPaymentFromStripe } = await import('./reconciliationService');
      const result = await syncPaymentFromStripe(paymentId);

      if (!result.success) {
        return res.status(400).json({
          message: 'Failed to sync payment',
          error: result.error
        });
      }

      res.json({
        message: 'Payment synced from Stripe',
        changes: result.changes
      });
    } catch (error: any) {
      console.error('❌ Error syncing payment:', error.message);
      res.status(500).json({ 
        message: 'Failed to sync payment',
        error: error.message 
      });
    }
  });

  // GET /api/admin/reconciliation/full-audit - Run comprehensive audit (admin only)
  app.get('/api/admin/reconciliation/full-audit', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      const { 
        performBalanceReconciliation, 
        performPaymentReconciliation,
        performBatchReconciliation 
      } = await import('./reconciliationService');

      console.log('\n========== FULL AUDIT STARTED ==========\n');

      // Run all reconciliations
      const [balanceResult, paymentResult, batchResult] = await Promise.all([
        performBalanceReconciliation(user.username),
        performPaymentReconciliation(undefined, undefined, 50),
        performBatchReconciliation(undefined, undefined, 25)
      ]);

      const auditSummary = {
        timestamp: new Date().toISOString(),
        triggeredBy: user.username,
        balanceReconciliation: {
          accountsChecked: balanceResult.accountsChecked,
          discrepanciesFound: balanceResult.discrepanciesFound,
          totalAmountDiscrepancy: balanceResult.totalAmountDiscrepancy
        },
        paymentReconciliation: {
          paymentsChecked: paymentResult.paymentsChecked,
          discrepanciesFound: paymentResult.discrepanciesFound,
          breakdown: {
            missingInStripe: paymentResult.missingInStripe,
            amountMismatches: paymentResult.amountMismatches,
            statusMismatches: paymentResult.statusMismatches
          }
        },
        batchReconciliation: {
          batchesChecked: batchResult.batchesChecked,
          discrepanciesFound: batchResult.discrepanciesFound
        },
        overallHealth: (
          balanceResult.discrepanciesFound === 0 && 
          paymentResult.discrepanciesFound === 0 && 
          batchResult.discrepanciesFound === 0
        ) ? 'HEALTHY' : 'NEEDS_ATTENTION'
      };

      console.log('\n========== FULL AUDIT COMPLETE ==========');
      console.log('Overall Health:', auditSummary.overallHealth);

      res.json({
        message: 'Full audit completed',
        summary: auditSummary,
        details: {
          balance: balanceResult,
          payments: paymentResult,
          batches: batchResult
        }
      });
    } catch (error: any) {
      console.error('❌ Error in full audit:', error.message);
      res.status(500).json({ 
        message: 'Failed to run full audit',
        error: error.message 
      });
    }
  });

  // ========== TEST ENDPOINT: Stripe Connect Payment Flow ==========
  // POST /api/test/stripe-connect-payment - Test Stripe Connect Destination Charges
  app.post('/api/test/stripe-connect-payment', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required for testing' });
      }

      console.log('\n========== STRIPE CONNECT PAYMENT FLOW TEST ==========\n');

      const { ownerUsername, driverUsername, washoutAmount, platformFee } = req.body;

      if (!ownerUsername || !driverUsername) {
        return res.status(400).json({ 
          message: 'Missing required fields: ownerUsername, driverUsername' 
        });
      }

      const testWashoutAmount = washoutAmount || 5.00; // $5.00 default
      const testPlatformFee = platformFee || 5.00; // $5.00 default

      // 1. Get owner and verify they have a Stripe Connect account and payment method
      const ownerUser = await storage.getUserByUsername(ownerUsername);
      if (!ownerUser) {
        return res.status(404).json({ message: `Owner user '${ownerUsername}' not found` });
      }

      const owner = await storage.getOwner(ownerUser.id);
      if (!owner) {
        return res.status(404).json({ message: `Owner profile not found for '${ownerUsername}'` });
      }

      if (!owner.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: `Owner '${ownerUsername}' does not have a Stripe Connect account. Please complete subscription first.` 
        });
      }

      console.log('✅ Owner verified:', {
        username: ownerUsername,
        connectAccountId: owner.stripeConnectAccountId,
        hasCustomerId: !!ownerUser.stripeCustomerId
      });

      // Get owner's payment method
      if (!ownerUser.stripeCustomerId) {
        return res.status(400).json({ 
          message: `Owner '${ownerUsername}' does not have a Stripe customer ID. Please add a payment method first.` 
        });
      }

      // Get owner's default payment method
      const customer = await stripe.customers.retrieve(ownerUser.stripeCustomerId);
      if (!customer.deleted && customer.invoice_settings?.default_payment_method) {
        console.log('✅ Owner has default payment method:', customer.invoice_settings.default_payment_method);
      } else {
        return res.status(400).json({ 
          message: `Owner '${ownerUsername}' does not have a payment method configured. Please add a card first.` 
        });
      }

      // 2. Get driver and verify they have a Stripe Connect account
      const driverUser = await storage.getUserByUsername(driverUsername);
      if (!driverUser) {
        return res.status(404).json({ message: `Driver user '${driverUsername}' not found` });
      }

      const driver = await storage.getDriver(driverUser.id);
      if (!driver) {
        return res.status(404).json({ message: `Driver profile not found for '${driverUsername}'` });
      }

      if (!driver.stripeConnectAccountId) {
        return res.status(400).json({ 
          message: `Driver '${driverUsername}' does not have a Stripe Connect account. Creating one now...` 
        });
      }

      console.log('✅ Driver verified:', {
        username: driverUsername,
        connectAccountId: driver.stripeConnectAccountId
      });

      // 3. Process payment using Stripe Connect Destination Charges
      console.log('\n💳 Processing Stripe Connect Destination Charge...');
      console.log(`   Owner: ${ownerUsername} (pays: $${(testWashoutAmount + testPlatformFee).toFixed(2)})`);
      console.log(`   Driver: ${driverUsername} (receives: $${testWashoutAmount.toFixed(2)})`);
      console.log(`   Platform fee: $${testPlatformFee.toFixed(2)}`);

      const paymentIntent = await stripeService.processWashoutPaymentViaCard({
        ownerStripeCustomerId: ownerUser.stripeCustomerId!,
        ownerPaymentMethodId: customer.invoice_settings?.default_payment_method as string,
        ownerUsername: ownerUsername,
        driverConnectedAccountId: driver.stripeConnectAccountId,
        driverUsername: driverUsername,
        washoutAmount: Math.round(testWashoutAmount * 100), // Convert to cents
        platformFee: Math.round(testPlatformFee * 100), // Convert to cents
        activityId: 'test_' + Date.now(),
        locationId: 'test_location'
      });

      console.log('\n✅ Payment processed successfully!');
      console.log(`   Payment Intent ID: ${paymentIntent.id}`);
      console.log(`   Status: ${paymentIntent.status}`);
      console.log(`   Amount charged: $${(paymentIntent.amount / 100).toFixed(2)}`);

      // 4. Return test results
      res.json({
        success: true,
        message: 'Stripe Connect payment flow test completed successfully!',
        testResults: {
          ownerCharged: `$${(paymentIntent.amount / 100).toFixed(2)}`,
          driverReceived: `$${testWashoutAmount.toFixed(2)}`,
          platformFeeCollected: `$${testPlatformFee.toFixed(2)}`,
          paymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status
        },
        details: {
          owner: {
            username: ownerUsername,
            stripeConnectAccountId: owner.stripeConnectAccountId,
            stripeCustomerId: ownerUser.stripeCustomerId
          },
          driver: {
            username: driverUsername,
            stripeConnectAccountId: driver.stripeConnectAccountId
          }
        }
      });

    } catch (error: any) {
      console.error('\n❌ Stripe Connect Payment Test Failed:', error.message);
      console.error(error);
      res.status(500).json({ 
        success: false,
        message: 'Stripe Connect payment test failed: ' + error.message,
        error: error.message
      });
    }
  });

  // ========== TEST ENDPOINT: Manual Reconciliation Trigger ==========
  // POST /api/test/reconciliation/run - Manually trigger balance reconciliation (admin only)
  app.post('/api/test/reconciliation/run', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: 'Admin access required for reconciliation testing' });
      }

      console.log('\n========== MANUAL RECONCILIATION TEST ==========\n');
      console.log('Triggered by:', user.email);

      const { reconcileAllConnectedAccounts } = await import('./reconciliationService');
      const results = await reconcileAllConnectedAccounts();

      console.log('\n✅ Reconciliation completed!');
      console.log(`   Accounts checked: ${results.totalAccounts}`);
      console.log(`   Discrepancies found: ${results.discrepancies.length}`);
      console.log(`   Balances synced: ${results.balancesSynced}`);

      res.json({
        success: true,
        message: 'Reconciliation completed successfully!',
        results: {
          totalAccounts: results.totalAccounts,
          discrepanciesFound: results.discrepancies.length,
          balancesSynced: results.balancesSynced,
          discrepancies: results.discrepancies.map(d => ({
            userId: d.userId,
            username: d.username,
            type: d.type,
            dbBalance: d.dbBalance,
            stripeBalance: d.stripeBalance,
            difference: d.difference,
            severity: d.severity
          }))
        }
      });

    } catch (error: any) {
      console.error('\n❌ Reconciliation Test Failed:', error.message);
      console.error(error);
      res.status(500).json({ 
        success: false,
        message: 'Reconciliation test failed: ' + error.message,
        error: error.message
      });
    }
  });

  // ========== TEST ENDPOINT: Inject Discrepancy for Testing ==========
  // POST /api/test/reconciliation/inject-discrepancy - Inject a test discrepancy (admin only)
  app.post('/api/test/reconciliation/inject-discrepancy', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required for discrepancy injection' });
      }

      const { username, amountCents } = req.body;
      
      if (!username || !amountCents) {
        return res.status(400).json({ 
          message: 'Missing required fields: username, amountCents' 
        });
      }

      console.log('\n========== INJECT TEST DISCREPANCY ==========\n');
      console.log(`Target user: ${username}`);
      console.log(`Discrepancy amount: $${(amountCents / 100).toFixed(2)}`);

      // Get the target user
      const targetUser = await storage.getUserByUsername(username);
      if (!targetUser) {
        return res.status(404).json({ message: `User '${username}' not found` });
      }

      // Check if user is a driver or owner
      let accountType: 'driver' | 'owner' | null = null;
      let currentBalance = 0;

      const driver = await storage.getDriver(targetUser.id);
      if (driver && driver.stripeConnectAccountId) {
        accountType = 'driver';
        currentBalance = driver.stripeConnectBalance || 0;
      } else {
        const owner = await storage.getOwner(targetUser.id);
        if (owner && owner.stripeConnectAccountId) {
          accountType = 'owner';
          currentBalance = owner.stripeConnectBalance || 0;
        }
      }

      if (!accountType) {
        return res.status(400).json({ 
          message: `User '${username}' does not have a Stripe Connect account` 
        });
      }

      // Inject discrepancy by modifying the database balance
      const oldBalance = currentBalance;
      const newBalance = currentBalance + amountCents;

      if (accountType === 'driver') {
        await storage.updateDriver(targetUser.id, {
          stripeConnectBalance: newBalance
        });
      } else {
        await storage.updateOwner(targetUser.id, {
          stripeConnectBalance: newBalance
        });
      }

      console.log(`✅ Discrepancy injected!`);
      console.log(`   Old balance: $${(oldBalance / 100).toFixed(2)}`);
      console.log(`   New balance: $${(newBalance / 100).toFixed(2)}`);
      console.log(`   Difference: $${(amountCents / 100).toFixed(2)}`);
      console.log('\n💡 Now run reconciliation to detect and fix this discrepancy!');

      res.json({
        success: true,
        message: 'Test discrepancy injected successfully!',
        details: {
          username,
          accountType,
          oldBalance: `$${(oldBalance / 100).toFixed(2)}`,
          newBalance: `$${(newBalance / 100).toFixed(2)}`,
          discrepancy: `$${(amountCents / 100).toFixed(2)}`,
          nextStep: 'Run POST /api/test/reconciliation/run to detect and fix this'
        }
      });

    } catch (error: any) {
      console.error('\n❌ Discrepancy Injection Failed:', error.message);
      console.error(error);
      res.status(500).json({ 
        success: false,
        message: 'Discrepancy injection failed: ' + error.message,
        error: error.message
      });
    }
  });

  // ============================================
  // Rubble Service API Endpoints
  // ============================================

  // Get all materials catalog (simple endpoint for UI)
  app.get('/api/materials', isAuthenticated, async (req: any, res) => {
    try {
      const materials = await storage.getAllMaterials();
      res.json(materials);
    } catch (error: any) {
      console.error('Error fetching materials:', error);
      res.status(500).json({ message: 'Failed to fetch materials' });
    }
  });

  // Get all materials catalog (legacy endpoint)
  app.get('/api/rubble/materials', isAuthenticated, async (req: any, res) => {
    try {
      const materials = await storage.getAllMaterials();
      res.json(materials);
    } catch (error: any) {
      console.error('Error fetching materials:', error);
      res.status(500).json({ message: 'Failed to fetch materials' });
    }
  });

  // Search for rubble drop-off locations
  app.post('/api/rubble/search', isAuthenticated, async (req: any, res) => {
    try {
      const { materialSlug, materialCustomLabel, driverLat, driverLng, hasRebar, hasTrash, hasWood } = req.body;

      // Validate required fields
      if (!driverLat || !driverLng) {
        return res.status(400).json({ message: 'Driver location is required' });
      }

      if (!materialSlug && !materialCustomLabel) {
        return res.status(400).json({ message: 'Material is required' });
      }

      // Get all active locations with material intents
      const allLocations = await storage.getActiveLocations() as Array<WashoutLocation & { owner: OwnerWithUser }>;
      
      // For each location, get their material intents
      const locationsWithIntents = await Promise.all(
        allLocations.map(async (location): Promise<RubbleLocationWithIntents> => {
          const intents = await storage.getLocationMaterialIntents(location.id) as LocationMaterialIntent[];
          return {
            ...location,
            materialIntents: intents
          };
        })
      );

      // Filter locations by material matching and rules
      const matchingLocations = locationsWithIntents.filter((location) => {
        // Must have at least one material intent
        if (location.materialIntents.length === 0) return false;

        // Check if any material intent matches the search
        const hasMatchingMaterial = location.materialIntents.some((intent) => {
          if (materialSlug) {
            return intent.materialSlug === materialSlug;
          } else if (materialCustomLabel) {
            return intent.materialCustomLabel?.toLowerCase() === materialCustomLabel.toLowerCase();
          }
          return false;
        });

        if (!hasMatchingMaterial) return false;

        // Get the matching intent for rule checking
        const matchingIntent = location.materialIntents.find((intent) => 
          materialSlug ? intent.materialSlug === materialSlug : 
          intent.materialCustomLabel?.toLowerCase() === materialCustomLabel.toLowerCase()
        );

        if (!matchingIntent) return false;

        // Check rules
        if (hasRebar && !matchingIntent.acceptsRebar) return false;
        if (hasTrash && !matchingIntent.acceptsTrash) return false;
        if (hasWood && !matchingIntent.acceptsWood) return false;

        // Check daily capacity
        if (matchingIntent.dailyCapacity !== null) {
          // TODO: Check actual visits for today against capacity
          // For now, we'll include it in results
        }

        return true;
      });

      // Calculate distance and add pay rate information
      const resultsWithDistance = matchingLocations.map((location) => {
        const matchingIntent = location.materialIntents.find((intent) => 
          materialSlug ? intent.materialSlug === materialSlug : 
          intent.materialCustomLabel?.toLowerCase() === materialCustomLabel.toLowerCase()
        );

        // Calculate distance using Haversine formula
        const R = 3959; // Earth radius in miles
        const locationLat = parseFloat(location.latitude);
        const locationLng = parseFloat(location.longitude);
        const driverLatitude = Number(driverLat);
        const driverLongitude = Number(driverLng);
        const dLat = (locationLat - driverLatitude) * Math.PI / 180;
        const dLon = (locationLng - driverLongitude) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(driverLatitude * Math.PI / 180) * Math.cos(locationLat * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        return {
          locationId: location.id,
          name: location.name,
          address: location.address,
          city: location.city,
          state: location.state,
          zip: location.zip,
          latitude: location.latitude,
          longitude: location.longitude,
          distance: Math.round(distance * 10) / 10, // Round to 1 decimal
          payRate: matchingIntent?.driverPayCents || 0,
          pricingUnit: matchingIntent?.pricingUnit || 'load',
          acceptsRebar: matchingIntent?.acceptsRebar || false,
          acceptsTrash: matchingIntent?.acceptsTrash || false,
          acceptsWood: matchingIntent?.acceptsWood || false,
          dailyCapacity: matchingIntent?.dailyCapacity,
          materialSlug: matchingIntent?.materialSlug,
          materialCustomLabel: matchingIntent?.materialCustomLabel,
          intentId: matchingIntent?.id,
        };
      });

      // Sort by distance (closest first), then by pay rate (highest first)
      resultsWithDistance.sort((a, b) => {
        if (Math.abs(a.distance - b.distance) < 0.1) {
          // If distances are within 0.1 miles, sort by pay rate
          return b.payRate - a.payRate;
        }
        return a.distance - b.distance;
      });

      res.json(resultsWithDistance);

    } catch (error: any) {
      console.error('Error searching rubble locations:', error);
      res.status(500).json({ message: 'Failed to search locations' });
    }
  });

  // Get location material intents (for owner editing)
  app.get('/api/rubble/locations/:locationId/materials', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      
      // Verify user owns this location or is admin
      const location: any = await storage.getWashoutLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }

      const owner = await storage.getOwner(req.user.id);
      if (!owner && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      if (owner && location.ownerId !== owner.id && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'You do not own this location' });
      }

      const intents = await storage.getLocationMaterialIntents(locationId);
      res.json(intents);

    } catch (error: any) {
      console.error('Error fetching location materials:', error);
      res.status(500).json({ message: 'Failed to fetch location materials' });
    }
  });

  // Create or update location material intents
  app.post('/api/rubble/locations/:locationId/materials', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      const { materials: materialIntents } = req.body;

      // Verify user owns this location or is admin
      const location: any = await storage.getWashoutLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }

      const owner = await storage.getOwner(req.user.id);
      if (!owner && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      if (owner && location.ownerId !== owner.id && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'You do not own this location' });
      }

      // Delete all existing intents for this location
      await storage.deleteAllLocationMaterialIntents(locationId);

      // Create new intents
      const createdIntents = [];
      for (const intent of materialIntents) {
        const newIntent = await storage.createLocationMaterialIntent({
          locationId,
          materialSlug: intent.materialSlug,
          materialCustomLabel: intent.materialCustomLabel,
          unit: intent.unit || 'per_load',
          driverPayCents: intent.driverPayCents,
          pricingUnit: intent.pricingUnit || 'load',
          acceptsRebar: intent.acceptsRebar || false,
          acceptsTrash: intent.acceptsTrash || false,
          acceptsWood: intent.acceptsWood || false,
          dailyCapacity: intent.dailyCapacity,
        });
        createdIntents.push(newIntent);
      }

      res.json(createdIntents);

    } catch (error: any) {
      console.error('Error saving location materials:', error);
      res.status(500).json({ message: 'Failed to save location materials' });
    }
  });

  // Simplified REST endpoints for frontend compatibility
  
  // GET material intents for a location
  app.get('/api/locations/:locationId/material-intents', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      const intents = await storage.getLocationMaterialIntents(locationId);
      res.json(intents);
    } catch (error: any) {
      console.error('Error fetching material intents:', error);
      res.status(500).json({ message: 'Failed to fetch material intents' });
    }
  });

  // CREATE a single material intent
  app.post('/api/locations/:locationId/material-intents', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      const intentData = req.body;

      const newIntent = await storage.createLocationMaterialIntent({
        locationId,
        ...intentData,
      });

      res.json(newIntent);
    } catch (error: any) {
      console.error('Error creating material intent:', error);
      res.status(500).json({ message: 'Failed to create material intent' });
    }
  });

  // DELETE all material intents for a location
  app.delete('/api/locations/:locationId/material-intents', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      await storage.deleteAllLocationMaterialIntents(locationId);
      res.json({ message: 'Material intents cleared' });
    } catch (error: any) {
      console.error('Error deleting material intents:', error);
      res.status(500).json({ message: 'Failed to delete material intents' });
    }
  });

  // Create a rubble visit
  app.post('/api/rubble/visits', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId, materialSlug, materialCustomLabel, hasRebar, hasTrash, hasWood } = req.body;

      // Get driver
      const driver = await storage.getDriver(req.user.id);
      if (!driver) {
        return res.status(403).json({ message: 'Only drivers can create rubble visits' });
      }

      // Verify location exists
      const location: any = await storage.getWashoutLocation(locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }

      // Verify location has matching material intent
      const intents = await storage.getLocationMaterialIntents(locationId) as LocationMaterialIntent[];
      const matchingIntent = intents.find((intent) => {
        if (materialSlug) {
          return intent.materialSlug === materialSlug;
        } else if (materialCustomLabel) {
          return intent.materialCustomLabel?.toLowerCase() === materialCustomLabel.toLowerCase();
        }
        return false;
      });

      if (!matchingIntent) {
        return res.status(400).json({ message: 'This location does not accept this material' });
      }

      // Validate rules
      if (hasRebar && !matchingIntent.acceptsRebar) {
        return res.status(400).json({ message: 'This location does not accept rebar in this material' });
      }
      if (hasTrash && !matchingIntent.acceptsTrash) {
        return res.status(400).json({ message: 'This location does not accept trash in this material' });
      }
      if (hasWood && !matchingIntent.acceptsWood) {
        return res.status(400).json({ message: 'This location does not accept wood in this material' });
      }

      // Platform fee for rubble: $2.00 in production, $0.20 in testing (10% scale)
      const RUBBLE_PLATFORM_FEE_CENTS = 20; // $0.20 for testing

      // Create rubble visit
      const visit = await storage.createWashoutActivity({
        driverId: driver.id,
        locationId,
        status: 'pending',
        serviceType: 'rubble_dropoff',
        materialSlug: matchingIntent.materialSlug,
        materialCustomLabel: matchingIntent.materialCustomLabel,
        feeCentsPlatform: RUBBLE_PLATFORM_FEE_CENTS,
        checkInTime: new Date(),
      });

      res.json(visit);

    } catch (error: any) {
      console.error('Error creating rubble visit:', error);
      res.status(500).json({ message: 'Failed to create rubble visit' });
    }
  });

  // Arrive at rubble location
  app.post('/api/rubble/visits/:visitId/arrive', isAuthenticated, async (req: any, res) => {
    try {
      const { visitId } = req.params;
      const { latitude, longitude } = req.body;

      // Get driver
      const driver = await storage.getDriver(req.user.id);
      if (!driver) {
        return res.status(403).json({ message: 'Only drivers can arrive at locations' });
      }

      // Get visit
      const visit = await storage.getWashoutActivity(visitId);
      if (!visit) {
        return res.status(404).json({ message: 'Visit not found' });
      }

      if (visit.driverId !== driver.id) {
        return res.status(403).json({ message: 'This is not your visit' });
      }

      if (visit.serviceType !== 'rubble_dropoff') {
        return res.status(400).json({ message: 'This is not a rubble visit' });
      }

      if (visit.status !== 'pending') {
        return res.status(400).json({ message: 'Visit is not in pending state' });
      }

      // Get location for geofence check
      const location: any = await storage.getWashoutLocation(visit.locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }

      // Geofence validation (500 feet = ~0.095 miles)
      const R = 3959; // Earth radius in miles
      const dLat = (location.latitude - latitude) * Math.PI / 180;
      const dLon = (location.longitude - longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(latitude * Math.PI / 180) * Math.cos(location.latitude * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;

      const MAX_DISTANCE_MILES = 0.095; // 500 feet
      if (distance > MAX_DISTANCE_MILES) {
        return res.status(400).json({ 
          message: 'You are not at the location. Please get closer to check in.',
          distance: Math.round(distance * 5280) // Convert to feet
        });
      }

      // Update visit status to in_progress
      const updatedVisit = await storage.updateWashoutActivityStatus(visitId, 'in_progress');

      res.json(updatedVisit);

    } catch (error: any) {
      console.error('Error arriving at rubble location:', error);
      res.status(500).json({ message: 'Failed to arrive at location' });
    }
  });

  // Complete rubble visit with photos
  app.post('/api/rubble/visits/:visitId/complete', isAuthenticated, async (req: any, res) => {
    try {
      const { visitId } = req.params;
      const { beforePhotoUrl, afterPhotoUrl, latitude, longitude } = req.body;
      const numericLatitude = Number(latitude);
      const numericLongitude = Number(longitude);

      if (!beforePhotoUrl || !afterPhotoUrl) {
        return res.status(400).json({ message: 'Before and after photos are required' });
      }

      if (!Number.isFinite(numericLatitude) || !Number.isFinite(numericLongitude)) {
        return res.status(400).json({ message: 'GPS coordinates are required to complete the visit' });
      }

      // Get driver
      const driver = await storage.getDriver(req.user.id);
      if (!driver) {
        return res.status(403).json({ message: 'Only drivers can complete visits' });
      }

      // Get visit
      const visit = await storage.getWashoutActivity(visitId);
      if (!visit) {
        return res.status(404).json({ message: 'Visit not found' });
      }

      if (visit.driverId !== driver.id) {
        return res.status(403).json({ message: 'This is not your visit' });
      }

      if (visit.serviceType !== 'rubble_dropoff') {
        return res.status(400).json({ message: 'This is not a rubble visit' });
      }

      if (visit.status !== 'in_progress') {
        return res.status(400).json({ message: 'Visit is not in progress' });
      }

      // Get location for geofence check
      const location: any = await storage.getWashoutLocation(visit.locationId);
      if (!location) {
        return res.status(404).json({ message: 'Location not found' });
      }

      // Geofence validation (500 feet = ~0.095 miles)
      const R = 3959; // Earth radius in miles
      const dLat = (location.latitude - numericLatitude) * Math.PI / 180;
      const dLon = (location.longitude - numericLongitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(numericLatitude * Math.PI / 180) * Math.cos(location.latitude * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;

      const MAX_DISTANCE_MILES = 0.095; // 500 feet
      if (distance > MAX_DISTANCE_MILES) {
        return res.status(400).json({ 
          message: 'You are not at the location. Please get closer to complete the visit.',
          distance: Math.round(distance * 5280) // Convert to feet
        });
      }

      const photoVerification = evaluatePhotoVerification({
        gpsLatitude: numericLatitude,
        gpsLongitude: numericLongitude,
        locationLatitude: location.latitude,
        locationLongitude: location.longitude,
      });

      // Update visit status to completed
      const updatedVisit = await storage.updateWashoutActivityStatus(visitId, 'completed');

      // Create photos
      await storage.createWashoutPhoto({
        activityId: visitId,
        driverId: driver.id,
        locationId: visit.locationId,
        storageKey: beforePhotoUrl,
        photoTakenAt: new Date(),
        uploadedAt: new Date(),
        gpsLatitude: numericLatitude,
        gpsLongitude: numericLongitude,
        verificationStatus: photoVerification.status,
        verificationDistanceMiles: photoVerification.distanceMiles == null ? null : photoVerification.distanceMiles.toFixed(3),
        verificationReason: photoVerification.reason,
      });

      await storage.createWashoutPhoto({
        activityId: visitId,
        driverId: driver.id,
        locationId: visit.locationId,
        storageKey: afterPhotoUrl,
        photoTakenAt: new Date(),
        uploadedAt: new Date(),
        gpsLatitude: numericLatitude,
        gpsLongitude: numericLongitude,
        verificationStatus: photoVerification.status,
        verificationDistanceMiles: photoVerification.distanceMiles == null ? null : photoVerification.distanceMiles.toFixed(3),
        verificationReason: photoVerification.reason,
      });

      // Get the material intent for payment calculation
      const intents = await storage.getLocationMaterialIntents(visit.locationId) as LocationMaterialIntent[];
      const matchingIntent = intents.find((intent) => 
        visit.materialSlug ? intent.materialSlug === visit.materialSlug :
        intent.materialCustomLabel?.toLowerCase() === visit.materialCustomLabel?.toLowerCase()
      );

      if (!matchingIntent) {
        return res.status(400).json({
          message: "Material configuration is missing for this location. Please contact support before completing checkout.",
        });
      }

      // Book the $2 platform fee (or $0.20 in testing)
      // This will be processed by the batch payment system later
      // For now, just mark the visit as needing payment processing

      res.json({
        visit: updatedVisit,
        message: 'Rubble drop-off completed successfully! Payment will be processed shortly.',
        driverPayCents: matchingIntent.driverPayCents,
        platformFeeCents: visit.feeCentsPlatform || 20,
      });

    } catch (error: any) {
      console.error('Error completing rubble visit:', error);
      res.status(500).json({ message: 'Failed to complete visit' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
