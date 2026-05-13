import bcrypt from "bcryptjs";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import type { User } from "../shared/schema";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // Use memory store for development to avoid database session issues
  return session({
    secret: process.env.SESSION_SECRET || "development-secret-key-change-in-production",
    resave: true,
    saveUninitialized: true,
    name: 'connect.sid', // Standard session cookie name
    cookie: {
      httpOnly: false, // Allow JS access for debugging
      secure: false,
      maxAge: sessionTtl,
      sameSite: 'lax',
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Local strategy for username/password authentication
  passport.use(new LocalStrategy(
    async (username: string, password: string, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "User not found" });
        }

        if (user.isActive === false) {
          return done(null, false, { message: "Account is inactive" });
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
          return done(null, false, { message: "Invalid password" });
        }

        // Remove password hash from user object
        const { passwordHash, ...userWithoutPassword } = user;
        return done(null, userWithoutPassword);
      } catch (error) {
        return done(error);
      }
    }
  ));

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUserById(id);
      if (user) {
        const { passwordHash, ...userWithoutPassword } = user;
        done(null, userWithoutPassword);
      } else {
        done(null, false);
      }
    } catch (error) {
      done(error);
    }
  });

  // Login route
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Internal server error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Failed to log in" });
        }
        console.log(`User logged in successfully: role=${user.role}`);
        return res.json({ message: "Login successful", user });
      });
    })(req, res, next);
  });

  // Registration route
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;

      // Public self-registration is limited to normal user roles.
      if (!role || !['driver', 'owner'].includes(role)) {
        return res.status(400).json({ 
          message: `Invalid role: '${role}'. Must be one of: driver, owner` 
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

      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      // Log the user in
      req.logIn(userWithoutPassword, (err) => {
        if (err) {
          return res.status(500).json({ message: "Registration successful but failed to log in" });
        }
        return res.json({ message: "Registration successful", user: userWithoutPassword });
      });
    } catch (error) {
      console.error("Registration error:", error);
      const errorMessage = error.message || "Internal server error";
      console.error("Detailed error:", JSON.stringify(error, null, 2));
      res.status(500).json({ message: "Registration failed: " + errorMessage });
    }
  });

  // Logout route
  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to log out" });
      }
      res.json({ message: "Logout successful" });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  console.log('Auth check', {
    method: req.method,
    path: req.path,
    isAuthenticated: req.isAuthenticated(),
  });
  if (req.isAuthenticated() && (req.user as any)?.isActive !== false) {
    return next();
  }
  res.status(401).json({ message: (req.user as any)?.isActive === false ? "Account is inactive" : "Unauthorized" });
};
