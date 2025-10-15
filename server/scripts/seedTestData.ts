#!/usr/bin/env tsx
/**
 * Production Seed Script: Test Data for CreteXchange
 * 
 * This script seeds test data that can be used for testing in both
 * development and production environments. It creates:
 * - 2 verified owners (O1, O2) with Column wallet data
 * - 2 drivers (D1, D2) with payment methods
 * - 1 pending owner (NO1) for testing membership payment flow
 * 
 * Features:
 * - Idempotent: Safe to run multiple times
 * - Transaction-based: All-or-nothing execution
 * - Production-safe: Requires confirmation before running
 * 
 * Usage:
 *   Development: npm run seed:test
 *   Production:  npm run seed:test --force
 */

import { db } from "../db";
import { users, drivers, owners } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcryptjs";

// Test data constants
const TEST_PASSWORD_HASH = bcrypt.hashSync("test123", 10);

const TEST_USERS = [
  // Owner 1 - Active with Column wallet
  {
    username: "O1",
    email: "O1@email.com",
    firstName: "Owner",
    lastName: "One",
    phone: "555-0001",
    role: "owner" as const,
    columnCustomerId: "col_cust_test_owner1",
    ownerProfile: {
      companyName: "Test Washout Co 1",
      businessLicense: "BL-001-2024",
      taxId: "TAX-001",
      columnEntityId: "col_ent_test_o1_123456",
      columnAccountId: "col_acct_test_o1_abc123",
      walletBalance: "1000.00",
      walletStatus: "active" as const,
      isApproved: true,
      membershipPaymentMethod: "stripe" as const,
      membershipActivatedAt: new Date("2024-01-15T10:00:00Z"),
    }
  },
  // Owner 2 - Active with Column wallet
  {
    username: "O2",
    email: "o2@email.com",
    firstName: "Owner",
    lastName: "Two",
    phone: "555-0002",
    role: "owner" as const,
    columnCustomerId: "col_cust_test_owner2",
    ownerProfile: {
      companyName: "Test Washout Co 2",
      businessLicense: "BL-002-2024",
      taxId: "TAX-002",
      columnEntityId: "col_ent_test_o2_789012",
      columnAccountId: "col_acct_test_o2_def456",
      walletBalance: "1000.00",
      walletStatus: "active" as const,
      isApproved: true,
      membershipPaymentMethod: "stripe" as const,
      membershipActivatedAt: new Date("2024-01-20T10:00:00Z"),
    }
  },
  // Driver 1 - Venmo payment
  {
    username: "D1",
    email: "D1@email.com",
    firstName: "Driver",
    lastName: "One",
    phone: "555-1001",
    role: "driver" as const,
    driverProfile: {
      licenseNumber: "DL-D1-12345",
      employerName: "Concrete Co 1",
      employerPhone: "555-2001",
      truckNumber: "TRK-001",
      paymentMethod: "venmo" as const,
      venmoHandle: "@driver-d1-test",
    }
  },
  // Driver 2 - Zelle payment
  {
    username: "D2",
    email: "d2@email.com",
    firstName: "Driver",
    lastName: "Two",
    phone: "555-1002",
    role: "driver" as const,
    driverProfile: {
      licenseNumber: "DL-D2-67890",
      employerName: "Concrete Co 2",
      employerPhone: "555-2002",
      truckNumber: "TRK-002",
      paymentMethod: "zelle" as const,
      zelleEmail: "d2-test@zelle.com",
    }
  },
  // New Owner 1 - Pending membership (for testing Stripe payment flow)
  {
    username: "NO1",
    email: "no1@test.com",
    firstName: "New",
    lastName: "Owner1",
    phone: "555-0101",
    role: "owner" as const,
    columnCustomerId: "col_cust_test_no1",
    ownerProfile: {
      companyName: "New Owner 1 LLC",
      businessLicense: "BL-NO1-2024",
      taxId: "TAX-123456789",
      columnEntityId: "col_ent_test_no1_999888",
      columnAccountId: "col_acct_test_no1_xyz789",
      walletBalance: "0.00",
      walletStatus: "pending_verification" as const,
      isApproved: false,
    }
  },
];

async function seedTestData() {
  console.log("🌱 Starting test data seed...\n");

  try {
    // Wrap everything in a transaction for atomicity
    await db.transaction(async (tx) => {
      let usersCreated = 0;
      let usersUpdated = 0;
      let profilesCreated = 0;
      let profilesUpdated = 0;

      for (const testUser of TEST_USERS) {
        // Check if user already exists
        const existingUser = await tx
          .select()
          .from(users)
          .where(eq(users.username, testUser.username))
          .limit(1);

        let userId: string;

        if (existingUser.length === 0) {
          // Create new user
          const [newUser] = await tx
            .insert(users)
            .values({
              username: testUser.username,
              email: testUser.email,
              passwordHash: TEST_PASSWORD_HASH,
              firstName: testUser.firstName,
              lastName: testUser.lastName,
              phone: testUser.phone,
              role: testUser.role,
              columnCustomerId: testUser.columnCustomerId,
              isActive: true,
            })
            .returning();

          userId = newUser.id;
          console.log(`✅ Created user: ${testUser.username} (${testUser.email})`);
          usersCreated++;
        } else {
          userId = existingUser[0].id;
          
          // Update existing user with latest data (including password hash)
          await tx
            .update(users)
            .set({
              email: testUser.email,
              passwordHash: TEST_PASSWORD_HASH,
              firstName: testUser.firstName,
              lastName: testUser.lastName,
              phone: testUser.phone,
              role: testUser.role,
              columnCustomerId: testUser.columnCustomerId,
              isActive: true,
            })
            .where(eq(users.id, userId));

          console.log(`🔄 Updated user: ${testUser.username} (${testUser.email})`);
          usersUpdated++;
        }

        // Handle owner profile
        if (testUser.ownerProfile) {
          const existingOwner = await tx
            .select()
            .from(owners)
            .where(eq(owners.userId, userId))
            .limit(1);

          if (existingOwner.length === 0) {
            await tx.insert(owners).values({
              userId,
              ...testUser.ownerProfile,
            });
            console.log(`  ↳ Created owner profile for ${testUser.username}`);
            profilesCreated++;
          } else {
            await tx
              .update(owners)
              .set(testUser.ownerProfile)
              .where(eq(owners.userId, userId));
            console.log(`  ↳ Updated owner profile for ${testUser.username}`);
            profilesUpdated++;
          }
        }

        // Handle driver profile
        if (testUser.driverProfile) {
          const existingDriver = await tx
            .select()
            .from(drivers)
            .where(eq(drivers.userId, userId))
            .limit(1);

          if (existingDriver.length === 0) {
            await tx.insert(drivers).values({
              userId,
              ...testUser.driverProfile,
            });
            console.log(`  ↳ Created driver profile for ${testUser.username}`);
            profilesCreated++;
          } else {
            await tx
              .update(drivers)
              .set(testUser.driverProfile)
              .where(eq(drivers.userId, userId));
            console.log(`  ↳ Updated driver profile for ${testUser.username}`);
            profilesUpdated++;
          }
        }
      }

      console.log("\n✨ Seed complete!");
      console.log(`   - Users created: ${usersCreated}`);
      console.log(`   - Users updated: ${usersUpdated}`);
      console.log(`   - Profiles created: ${profilesCreated}`);
      console.log(`   - Profiles updated: ${profilesUpdated}`);
      console.log(`   - Total operations: ${usersCreated + usersUpdated + profilesCreated + profilesUpdated}\n`);
    });

    // Display summary of seeded data
    console.log("📊 Test Data Summary:");
    console.log("\nOwners:");
    console.log("  - O1: Active owner with $1,000 Column wallet balance");
    console.log("  - O2: Active owner with $1,000 Column wallet balance");
    console.log("  - NO1: Pending owner for testing membership payment\n");
    console.log("Drivers:");
    console.log("  - D1: Venmo payment method (@driver-d1-test)");
    console.log("  - D2: Zelle payment method (d2-test@zelle.com)\n");
    console.log("Login credentials for all test users:");
    console.log("  Password: test123\n");

  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  }
}

// Safety check: require --force flag in production-like environments
function checkEnvironment() {
  const hasForceFlag = process.argv.includes("--force");
  const isProd = process.env.DATABASE_URL?.includes("neon.tech");

  if (isProd && !hasForceFlag) {
    console.error("⚠️  PRODUCTION DATABASE DETECTED");
    console.error("This script will modify production data.");
    console.error("Add --force flag to proceed: npm run seed:test -- --force\n");
    process.exit(1);
  }

  if (hasForceFlag) {
    console.log("⚠️  Running with --force flag\n");
  }
}

// Run the seed
checkEnvironment();

seedTestData()
  .then(() => {
    console.log("✅ Seed script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed script failed:", error);
    process.exit(1);
  });
