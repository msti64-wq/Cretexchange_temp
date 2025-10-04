#!/usr/bin/env tsx
/**
 * Migration Script: Backfill Missing Driver/Owner Profiles
 * 
 * This script creates missing driver/owner profile records for existing users
 * who have a role of 'driver' or 'owner' but no corresponding profile in the
 * drivers or owners tables.
 * 
 * Usage: tsx server/scripts/backfillProfiles.ts
 */

import { db } from "../db";
import { users, drivers, owners } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

async function backfillMissingProfiles() {
  console.log("🔍 Starting profile backfill migration...\n");

  try {
    // Find all users with role='driver' who don't have a driver profile
    const usersWithoutDriverProfile = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .leftJoin(drivers, eq(users.id, drivers.userId))
      .where(
        and(
          eq(users.role, 'driver'),
          isNull(drivers.id)
        )
      );

    console.log(`📊 Found ${usersWithoutDriverProfile.length} drivers without profiles`);

    // Create driver profiles for users missing them
    let driversCreated = 0;
    for (const user of usersWithoutDriverProfile) {
      try {
        await db.insert(drivers).values({
          userId: user.id,
          licenseNumber: '',
          employerName: '',
          employerPhone: '',
          truckNumber: '',
        });
        console.log(`✅ Created driver profile for user: ${user.username} (${user.email})`);
        driversCreated++;
      } catch (error) {
        console.error(`❌ Failed to create driver profile for ${user.username}:`, error);
      }
    }

    // Find all users with role='owner' who don't have an owner profile
    const usersWithoutOwnerProfile = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .leftJoin(owners, eq(users.id, owners.userId))
      .where(
        and(
          eq(users.role, 'owner'),
          isNull(owners.id)
        )
      );

    console.log(`\n📊 Found ${usersWithoutOwnerProfile.length} owners without profiles`);

    // Create owner profiles for users missing them
    let ownersCreated = 0;
    for (const user of usersWithoutOwnerProfile) {
      try {
        await db.insert(owners).values({
          userId: user.id,
          companyName: '',
          businessLicense: '',
          taxId: '',
        });
        console.log(`✅ Created owner profile for user: ${user.username} (${user.email})`);
        ownersCreated++;
      } catch (error) {
        console.error(`❌ Failed to create owner profile for ${user.username}:`, error);
      }
    }

    console.log("\n✨ Migration complete!");
    console.log(`   - Created ${driversCreated} driver profiles`);
    console.log(`   - Created ${ownersCreated} owner profiles`);
    console.log(`   - Total profiles created: ${driversCreated + ownersCreated}\n`);

    // Verify the results
    const [driverCount] = await db.select({ count: sql<number>`count(*)::int` }).from(drivers);
    const [ownerCount] = await db.select({ count: sql<number>`count(*)::int` }).from(owners);
    
    console.log("📈 Final counts:");
    console.log(`   - Total driver profiles: ${driverCount.count}`);
    console.log(`   - Total owner profiles: ${ownerCount.count}\n`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run the migration
backfillMissingProfiles()
  .then(() => {
    console.log("✅ Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration script failed:", error);
    process.exit(1);
  });
