import bcrypt from "bcryptjs";
import { storage } from "../storage";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function createSuperAdmin() {
  try {
    console.log("Creating super admin account...");

    const username = getRequiredEnv("SUPER_ADMIN_USERNAME");
    const email = getRequiredEnv("SUPER_ADMIN_EMAIL");
    const password = getRequiredEnv("SUPER_ADMIN_PASSWORD");
    const firstName = process.env.SUPER_ADMIN_FIRST_NAME?.trim() || "Super";
    const lastName = process.env.SUPER_ADMIN_LAST_NAME?.trim() || "Admin";

    if (password.length < 12) {
      throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters");
    }

    // Check if super admin already exists
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) {
      console.log("Super admin account already exists!");
      console.log(`Username: ${existingUser.username}`);
      console.log(`Email: ${existingUser.email}`);
      console.log(`Role: ${existingUser.role}`);
      process.exit(0);
    }

    // Hash password (10 rounds, matching tokenAuth.ts)
    const passwordHash = await bcrypt.hash(password, 10);

    // Create super admin user
    const superAdmin = await storage.createUser({
      username,
      email,
      passwordHash,
      firstName,
      lastName,
      phone: "555-0000",
      street: "123 Admin St",
      city: "Admin City",
      state: "CA",
      zip: "90000",
      role: "super_admin",
    });

    console.log("✅ Super admin account created successfully!");
    console.log(`Username: ${superAdmin.username}`);
    console.log(`Email: ${superAdmin.email}`);
    console.log(`Role: ${superAdmin.role}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating super admin:", error);
    process.exit(1);
  }
}

createSuperAdmin();
