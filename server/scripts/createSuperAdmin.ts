import bcrypt from "bcryptjs";
import { storage } from "../storage";

async function createSuperAdmin() {
  try {
    console.log("Creating super admin account...");

    // Super admin credentials
    const username = "superadmin";
    const email = "admin@cretexchange.com";
    const password = "Admin123!"; // Change this after first login
    const firstName = "Super";
    const lastName = "Admin";

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
    console.log(`\nLogin credentials:`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`\n⚠️  IMPORTANT: Change the password after first login!`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating super admin:", error);
    process.exit(1);
  }
}

createSuperAdmin();
