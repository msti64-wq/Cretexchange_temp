import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "your-jwt-secret-key-change-in-production";

export async function setupAuth(app: Express) {
  // Login route
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`Login attempt: username=${username}, environment=${process.env.REPLIT_DEPLOYMENT ? 'production' : 'development'}`);

      // Check if user exists
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      console.log(`User found: ${username}, id=${user.id}`);

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        console.log(`Password verification failed for user: ${username}`);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Create JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Remove password hash from user object
      const { passwordHash, ...userWithoutPassword } = user;

      console.log("User logged in successfully:", user.id);
      res.json({ 
        message: "Login successful", 
        user: userWithoutPassword,
        token 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Registration route
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;

      // Validate role field
      if (!role || !['driver', 'owner', 'admin', 'super_admin'].includes(role)) {
        return res.status(400).json({ 
          message: `Invalid role: '${role}'. Must be one of: driver, owner, admin, super_admin` 
        });
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
        role,
      });

      // Create role-specific profile
      if (role === 'driver') {
        await storage.createDriver({
          userId: newUser.id,
          licenseNumber: '',
          employerName: '',
          employerPhone: '',
        });
      } else if (role === 'owner') {
        await storage.createOwner({
          userId: newUser.id,
          companyName: '',
          businessLicense: '',
          taxId: '',
        });
      }

      // Create JWT token
      const token = jwt.sign(
        { userId: newUser.id, username: newUser.username },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      console.log("User registered successfully:", newUser.id);
      res.json({ 
        message: "Registration successful", 
        user: userWithoutPassword,
        token 
      });
    } catch (error) {
      console.error("Registration error:", error);
      const errorMessage = error.message || "Internal server error";
      console.error("Detailed error:", JSON.stringify(error, null, 2));
      res.status(500).json({ message: "Registration failed: " + errorMessage });
    }
  });

  // Logout route (client-side only since we're using JWT)
  app.post("/api/logout", (req, res) => {
    res.json({ message: "Logout successful" });
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Get user from database
    const user = await storage.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Remove password hash and attach user to request
    const { passwordHash, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};