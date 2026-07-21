import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { getJwtSecret } from "./jwtSecret";

const JWT_SECRET = getJwtSecret();

export async function setupAuth(app: Express) {
  // Login route
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      // Check if user exists (case-insensitive username lookup)
      const user = await storage.getUserByUsernameInsensitive(username);
      if (!user) {
        console.log("Login attempt failed: user not found");
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        console.log("Login attempt failed: invalid password");
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.isActive === false) {
        console.log("Login blocked for inactive user");
        return res.status(403).json({ message: "Account is inactive" });
      }

      // Create JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username, authTokenVersion: user.authTokenVersion ?? 0 },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Remove password hash from user object
      const { passwordHash, ...userWithoutPassword } = user;

      console.log(`User logged in successfully: role=${user.role}`);
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
      const { username, email, password, firstName, lastName, phone, street, city, state, zip, role } = req.body;

      // Public self-registration is limited to normal user roles.
      if (!role || !['driver', 'owner'].includes(role)) {
        return res.status(400).json({ 
          message: `Invalid role: '${role}'. Must be one of: driver, owner` 
        });
      }

      // Check if user already exists (case-insensitive check)
      const existingUser = await storage.getUserByUsernameInsensitive(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user with all mandatory fields
      const newUser = await storage.createUser({
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        street,
        city,
        state,
        zip,
        role,
      });

      // Create role-specific profile
      if (role === 'driver') {
        await storage.createDriver({
          userId: newUser.id,
          licenseNumber: '',
          employerName: '',
          employerPhone: '',
          truckNumber: '',
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
        { userId: newUser.id, username: newUser.username, authTokenVersion: newUser.authTokenVersion ?? 0 },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      console.log(`User registered successfully: role=${newUser.role}`);
      res.json({ 
        message: "Registration successful", 
        user: userWithoutPassword,
        token 
      });
    } catch (error) {
      console.error("Registration error:", error);
      const errorMessage = (error as any).message || "Internal server error";
      console.error("Detailed error:", JSON.stringify(error, null, 2));
      res.status(500).json({ message: "Registration failed: " + errorMessage });
    }
  });

  // Logout route (client-side only since we're using JWT)
  app.post("/api/logout", (req, res) => {
    res.json({ message: "Logout successful" });
  });

  // Forgot password route
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ message: "If an account exists with this email, password reset instructions have been sent." });
      }

      // Generate reset token (use crypto-secure random string)
      const { randomBytes } = await import('crypto');
      const resetToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store reset token
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt
      });

      res.json({ 
        message: "If an account exists with this email, password reset instructions have been sent.",
        // In development, include the token for testing
        ...(process.env.NODE_ENV === 'development' && { resetToken })
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reset password route
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
      }

      // Find and validate reset token
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Get user
      const user = await storage.getUserById(resetToken.userId);
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, 10);

      // Update user password
      await storage.updateUserPassword(user.id, passwordHash);

      // Delete the reset token
      await storage.deletePasswordResetToken(resetToken.id);

      console.log("Password reset successfully");
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    console.log(`🔐 Auth check for ${req.method} ${req.path}`);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`❌ Auth failed: Missing or invalid auth header`);
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Get user from database
    const user = await storage.getUserById(decoded.userId);
    if (!user) {
      console.log(`❌ Auth failed: User not found`);
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isActive === false) {
      console.log(`❌ Auth failed: Inactive user`);
      return res.status(403).json({ message: "Account is inactive" });
    }

    if ((decoded.authTokenVersion ?? 0) !== (user.authTokenVersion ?? 0)) {
      console.log("❌ Auth failed: token invalidated");
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }

    console.log(`✅ Auth success: role=${user.role}`);

    // Remove password hash and attach user to request
    const { passwordHash, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};
