import { Request, Response, NextFunction } from 'express';
import type { IStorage } from './storage';

/**
 * Data integrity middleware to prevent API errors from orphaned user accounts
 * Validates that users have required role-specific profiles before processing requests
 */

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  storage?: IStorage;
}

/**
 * Middleware to ensure driver has a valid driver profile
 * Use this on routes that access driver-specific data
 */
export function requireDriverProfile(storage: IStorage) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (req.user.role !== 'driver') {
        return res.status(403).json({ message: 'Driver role required' });
      }

      // Check if driver profile exists
      const driverProfile = await storage.getDriver(req.user.id);
      
      if (!driverProfile) {
        console.error(`[DATA INTEGRITY] User ${req.user.id} has driver role but no driver profile`);
        return res.status(500).json({ 
          message: 'Driver profile not found. Please contact support.',
          code: 'MISSING_DRIVER_PROFILE',
          userId: req.user.id
        });
      }

      next();
    } catch (error) {
      console.error('[DATA INTEGRITY] Error checking driver profile:', error);
      res.status(500).json({ message: 'Failed to validate driver profile' });
    }
  };
}

/**
 * Middleware to ensure owner has a valid owner profile
 * Use this on routes that access owner-specific data
 */
export function requireOwnerProfile(storage: IStorage) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (req.user.role !== 'owner') {
        return res.status(403).json({ message: 'Owner role required' });
      }

      // Check if owner profile exists
      const ownerProfile = await storage.getOwner(req.user.id);
      
      if (!ownerProfile) {
        console.error(`[DATA INTEGRITY] User ${req.user.id} has owner role but no owner profile`);
        return res.status(500).json({ 
          message: 'Owner profile not found. Please contact support.',
          code: 'MISSING_OWNER_PROFILE',
          userId: req.user.id
        });
      }

      next();
    } catch (error) {
      console.error('[DATA INTEGRITY] Error checking owner profile:', error);
      res.status(500).json({ message: 'Failed to validate owner profile' });
    }
  };
}

/**
 * Middleware to validate profile exists for any role
 * Use this as a general safeguard on authenticated routes
 */
export function validateRoleProfile(storage: IStorage) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const { id: userId, role } = req.user;

      // Skip validation for admin/super_admin roles (no profile needed)
      if (role === 'admin' || role === 'super_admin') {
        return next();
      }

      // Validate driver profile
      if (role === 'driver') {
        const driverProfile = await storage.getDriver(userId);
        if (!driverProfile) {
          console.error(`[DATA INTEGRITY] Driver ${userId} missing profile`);
          return res.status(500).json({ 
            message: 'Driver profile not found. Please contact support.',
            code: 'MISSING_DRIVER_PROFILE'
          });
        }
      }

      // Validate owner profile
      if (role === 'owner') {
        const ownerProfile = await storage.getOwner(userId);
        if (!ownerProfile) {
          console.error(`[DATA INTEGRITY] Owner ${userId} missing profile`);
          return res.status(500).json({ 
            message: 'Owner profile not found. Please contact support.',
            code: 'MISSING_OWNER_PROFILE'
          });
        }
      }

      next();
    } catch (error) {
      console.error('[DATA INTEGRITY] Error validating role profile:', error);
      res.status(500).json({ message: 'Failed to validate user profile' });
    }
  };
}
