import jwt from "jsonwebtoken";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { getJwtSecret } from "./jwtSecret";
import {
  authenticateServerSessionRequest,
  clearAuthenticationCookies,
  consumeAuthenticationRateLimit,
  consumeSecurePasswordResetToken,
  createAuthenticatedServerSession,
  createSecurePasswordResetToken,
  isSameOriginAuthenticationRequest,
  isAuthSessionFoundationEnabled,
  listActiveUserSessions,
  recordAuthenticationFailure,
  revokeAllUserSessionsWithAudit,
  revokeOtherUserSessionsWithAudit,
  revokeOwnedSessionWithAudit,
  revokeSessionFromRequest,
} from "./authSessionFoundation";
import {
  enforcePasswordPolicy,
  hashPasswordForStorage,
  isPasswordPolicyError,
  verifyPasswordForAuthentication,
} from "./passwordSecurity";

const JWT_SECRET = getJwtSecret();

export async function setupAuth(app: Express) {
  // Express owns this setting; lightweight route-test doubles may omit `set`.
  if (typeof app.set === "function") app.set("trust proxy", 1);

  // Login route
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const foundationEnabled = isAuthSessionFoundationEnabled();

      if (foundationEnabled) {
        if (!isSameOriginAuthenticationRequest(req)) {
          return res.status(403).json({ message: "Request verification failed" });
        }
        const limit = await consumeAuthenticationRateLimit("login", req, typeof username === "string" ? username : "unknown");
        if (!limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfterSeconds));
          return res.status(429).json({ message: "Unable to sign in right now. Please wait and try again." });
        }
      }

      // Check if user exists (case-insensitive username lookup)
      const user = await storage.getUserByUsernameInsensitive(username);
      if (!user) {
        console.log("Login attempt failed: user not found");
        if (foundationEnabled) await recordAuthenticationFailure({ req, eventType: "login.failed", reasonCode: "invalid_credentials" });
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Verify password
      const passwordVerification = await verifyPasswordForAuthentication(password, user.passwordHash);
      if (!passwordVerification.valid) {
        console.log("Login attempt failed: invalid password");
        if (foundationEnabled) await recordAuthenticationFailure({ req, eventType: "login.failed", reasonCode: "invalid_credentials", subjectUserId: user.id, role: user.role });
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.isActive === false) {
        console.log("Login blocked for inactive user");
        if (foundationEnabled) await recordAuthenticationFailure({ req, eventType: "login.denied", reasonCode: "account_inactive", subjectUserId: user.id, role: user.role, outcome: "denied" });
        return res.status(403).json({ message: "Account is inactive" });
      }

      if (passwordVerification.upgradedHash) {
        try {
          await storage.upgradeUserPasswordHash(user.id, user.passwordHash, passwordVerification.upgradedHash);
        } catch {
          // Authentication remains available; the atomic conditional upgrade is
          // retried after the next successful legacy login.
          console.error("PASSWORD_HASH_UPGRADE_FAILED");
        }
      }

      // Registration is not a substitute for a successful authenticated login.
      // The source-event key makes later logins a no-op for this first-login fact.
      if (user.role === "driver") await storage.recordDriverFirstLogin(user.id);

      const token = foundationEnabled
        ? undefined
        : jwt.sign(
          { userId: user.id, username: user.username, authTokenVersion: user.authTokenVersion ?? 0 },
          JWT_SECRET,
          { expiresIn: "7d" },
        );
      if (foundationEnabled) await createAuthenticatedServerSession(user, req, res, "password_login");

      // Remove password hash from user object
      const { passwordHash, ...userWithoutPassword } = user;

      console.log(`User logged in successfully: role=${user.role}`);
      res.json({ 
        message: "Login successful", 
        user: userWithoutPassword,
        ...(token ? { token, sessionMode: "legacy_bearer" } : { sessionMode: "server_cookie" }),
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
      const foundationEnabled = isAuthSessionFoundationEnabled();

      if (foundationEnabled) {
        if (!isSameOriginAuthenticationRequest(req)) {
          return res.status(403).json({ message: "Request verification failed" });
        }
        const limit = await consumeAuthenticationRateLimit("registration", req, typeof email === "string" ? email : "unknown");
        if (!limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfterSeconds));
          return res.status(429).json({ message: "Unable to register right now. Please wait and try again." });
        }
      }

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

      enforcePasswordPolicy(password, { username, email, firstName, lastName });
      const passwordHash = await hashPasswordForStorage(password);

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

      const token = foundationEnabled
        ? undefined
        : jwt.sign(
          { userId: newUser.id, username: newUser.username, authTokenVersion: newUser.authTokenVersion ?? 0 },
          JWT_SECRET,
          { expiresIn: "7d" },
        );
      if (foundationEnabled) await createAuthenticatedServerSession(newUser, req, res, "registration");

      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      console.log(`User registered successfully: role=${newUser.role}`);
      res.json({ 
        message: "Registration successful", 
        user: userWithoutPassword,
        ...(token ? { token, sessionMode: "legacy_bearer" } : { sessionMode: "server_cookie" }),
      });
    } catch (error) {
      if (isPasswordPolicyError(error)) return res.status(400).json({ message: error.message, code: error.code });
      console.error("Registration error:", error);
      const errorMessage = (error as any).message || "Internal server error";
      console.error("Detailed error:", JSON.stringify(error, null, 2));
      res.status(500).json({ message: "Registration failed: " + errorMessage });
    }
  });

  app.post("/api/logout", async (req, res) => {
    if (isAuthSessionFoundationEnabled()) {
      const auth = await authenticateServerSessionRequest(req);
      if (!auth.ok) {
        clearAuthenticationCookies(res);
        return res.status(auth.status).json({ message: auth.message, code: auth.code });
      }
      await revokeSessionFromRequest(req, res, "logout");
    } else {
      clearAuthenticationCookies(res);
    }
    return res.json({ message: "Logout successful" });
  });

  // Forgot password route
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      const foundationEnabled = isAuthSessionFoundationEnabled();

      if (foundationEnabled && !isSameOriginAuthenticationRequest(req)) {
        return res.status(403).json({ message: "Request verification failed" });
      }

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (foundationEnabled) {
        const limit = await consumeAuthenticationRateLimit("forgot_password", req, email);
        if (!limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfterSeconds));
          return res.json({ message: "If an account exists with this email, password reset instructions have been sent." });
        }
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        if (foundationEnabled) await recordAuthenticationFailure({ req, eventType: "password_reset.requested", reasonCode: "account_not_resolved" });
        return res.json({ message: "If an account exists with this email, password reset instructions have been sent." });
      }

      if (foundationEnabled) {
        const resetToken = await createSecurePasswordResetToken(user, req);
        return res.json({
          message: "If an account exists with this email, password reset instructions have been sent.",
          ...(process.env.NODE_ENV === "development" && { resetToken }),
        });
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
      const foundationEnabled = isAuthSessionFoundationEnabled();

      if (foundationEnabled && !isSameOriginAuthenticationRequest(req)) {
        return res.status(403).json({ message: "Request verification failed" });
      }

      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (foundationEnabled) {
        const limit = await consumeAuthenticationRateLimit("reset_password", req, token);
        if (!limit.allowed) {
          res.setHeader("Retry-After", String(limit.retryAfterSeconds));
          return res.status(429).json({ message: "Unable to reset the password right now. Please wait and try again." });
        }
        const consumed = await consumeSecurePasswordResetToken(token, password, req);
        if (!consumed) return res.status(400).json({ message: "Invalid or expired reset token" });
        clearAuthenticationCookies(res);
        return res.json({ message: "Password has been reset successfully" });
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

      enforcePasswordPolicy(password, user);
      const passwordHash = await hashPasswordForStorage(password);

      // Update user password
      await storage.updateUserPassword(user.id, passwordHash);

      // Delete the reset token
      await storage.deletePasswordResetToken(resetToken.id);

      console.log("Password reset successfully");
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      if (isPasswordPolicyError(error)) return res.status(400).json({ message: error.message, code: error.code });
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/sessions", isAuthenticated, async (req: any, res) => {
    if (!isAuthSessionFoundationEnabled()) return res.status(404).json({ message: "Session management is not enabled" });
    return res.json({ sessions: await listActiveUserSessions(req.user.id, req.authSessionId) });
  });

  app.delete("/api/auth/sessions/:sessionId", isAuthenticated, async (req: any, res) => {
    if (!isAuthSessionFoundationEnabled()) return res.status(404).json({ message: "Session management is not enabled" });
    const sessionId = typeof req.params.sessionId === "string" ? req.params.sessionId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return res.status(400).json({ message: "Invalid session" });
    }
    const revoked = await revokeOwnedSessionWithAudit({ user: req.user, sessionId, req });
    if (!revoked) return res.status(404).json({ message: "Session not found" });
    if (sessionId === req.authSessionId) clearAuthenticationCookies(res);
    return res.json({ message: "Session revoked" });
  });

  app.post("/api/auth/sessions/sign-out-all", isAuthenticated, async (req: any, res) => {
    if (!isAuthSessionFoundationEnabled()) return res.status(404).json({ message: "Session management is not enabled" });
    const revoked = await revokeAllUserSessionsWithAudit({ user: req.user, req });
    clearAuthenticationCookies(res);
    return res.json({ message: "All sessions revoked", revoked });
  });

  app.post("/api/auth/sessions/sign-out-others", isAuthenticated, async (req: any, res) => {
    if (!isAuthSessionFoundationEnabled()) return res.status(404).json({ message: "Session management is not enabled" });
    if (!req.authSessionId) return res.status(403).json({ message: "Current session context is required" });
    const revoked = await revokeOtherUserSessionsWithAudit({
      user: req.user,
      currentSessionId: req.authSessionId,
      req,
    });
    return res.json({ message: "Other sessions revoked", revoked });
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  try {
    console.log(`🔐 Auth check for ${req.method} ${req.path}`);

    if (isAuthSessionFoundationEnabled()) {
      const auth = await authenticateServerSessionRequest(req);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message, code: auth.code });
      req.user = auth.user;
      req.authSessionId = auth.sessionId;
      return next();
    }

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
