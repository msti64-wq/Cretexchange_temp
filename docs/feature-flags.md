# Feature Flags System Documentation

## Overview

CreteXchange uses a comprehensive feature flag system to safely roll out new features in a controlled manner. This system allows you to:

- Enable/disable features globally
- Target specific users or user roles
- Gradually roll out features to test with small user groups
- Quickly disable problematic features without code changes

## Architecture

### Database Tables

1. **feature_flags** - Global feature flag definitions
   - `key` (varchar, primary) - Unique identifier for the feature
   - `name` (text) - Human-readable name
   - `description` (text) - Detailed description
   - `enabled` (boolean) - Global on/off switch
   - `allowedRoles` (text[]) - Array of roles allowed to use this feature

2. **feature_flag_overrides** - User-specific overrides
   - `flagKey` (varchar) - Reference to feature flag
   - `userId` (varchar) - User ID for this override
   - `enabled` (boolean) - Override value for this user

### Resolution Logic

When checking if a feature is enabled for a user:

1. First check for user-specific override → if exists, use that value
2. If no override, check if user's role is in `allowedRoles`
3. If role is allowed, return the global `enabled` value
4. Otherwise, return `false`

This allows for flexible targeting:
- **Global rollout**: Set `enabled: true` and `allowedRoles: ['driver', 'owner', 'admin']`
- **Role-specific**: Set `allowedRoles: ['admin']` to limit to admins only
- **Beta testing**: Set `enabled: false` globally, then add user overrides for beta testers

## Usage Guide

### Backend (Storage Layer)

The storage interface provides these methods:

```typescript
// Check if a feature is enabled for a user
const isEnabled = await storage.checkFeatureFlag(
  'rubble_service',  // flag key
  userId,            // user ID
  userRole           // user role
);

// Get all feature flags (admin only)
const flags = await storage.getAllFeatureFlags();

// Update global flag status
await storage.updateFeatureFlag('rubble_service', true);

// Set user-specific override
await storage.setFeatureFlagOverride('rubble_service', userId, true);

// Create a new feature flag
await storage.createFeatureFlag({
  key: 'new_feature',
  name: 'New Feature Name',
  description: 'Description of the feature',
  enabled: false,
  allowedRoles: ['admin']
});
```

### Frontend (React Hooks)

Use the `useFeatureFlag` hook in your components:

```typescript
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

function MyComponent() {
  const { isEnabled, isLoading } = useFeatureFlag('rubble_service');

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isEnabled) {
    return null; // Hide feature
  }

  return (
    <div>
      {/* Your feature UI */}
    </div>
  );
}
```

The hook automatically:
- Fetches the flag status on mount
- Handles loading states
- Caches results with React Query
- Uses the current authenticated user's context

### API Endpoints

All endpoints require authentication. Admin endpoints require `admin` or `super_admin` role.

#### Get All Feature Flags (Admin)
```
GET /api/feature-flags
```

Response:
```json
[
  {
    "key": "rubble_service",
    "name": "Concrete Rubble Service",
    "description": "Enable concrete rubble pickup and disposal service",
    "enabled": false,
    "allowedRoles": ["admin"]
  }
]
```

#### Check Feature Status (Any authenticated user)
```
GET /api/feature-flags/:flagKey/check
```

Response:
```json
{
  "enabled": true
}
```

#### Toggle Feature Globally (Admin)
```
PUT /api/feature-flags/:flagKey/toggle
Body: { "enabled": true }
```

#### Set User Override (Admin)
```
PUT /api/feature-flags/:flagKey/override/:userId
Body: { "enabled": true }
```

#### Create Feature Flag (Admin)
```
POST /api/feature-flags
Body: {
  "key": "new_feature",
  "name": "New Feature",
  "description": "Description",
  "enabled": false,
  "allowedRoles": ["admin"]
}
```

## Admin UI

Access the feature flags management interface at `/feature-flags` (admin only).

The UI provides:
- List of all feature flags with current status
- Toggle switches for global enable/disable
- Role restrictions display
- Create new feature flags

## Adding a New Feature Flag

### Step 1: Define the Flag Key

Add your flag to `shared/featureFlags.ts`:

```typescript
export const FEATURE_FLAGS = {
  RUBBLE_SERVICE: 'rubble_service',
  NEW_FEATURE: 'new_feature', // Add here
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];
```

### Step 2: Create the Flag in Database

Via Admin UI:
1. Go to `/feature-flags`
2. Click "Create New Flag"
3. Fill in details:
   - Key: `new_feature` (must match Step 1)
   - Name: Human-readable name
   - Description: What this feature does
   - Enabled: Start with `false` for safety
   - Allowed Roles: Choose who can access

Or via API/code:
```typescript
await storage.createFeatureFlag({
  key: FEATURE_FLAGS.NEW_FEATURE,
  name: 'My New Feature',
  description: 'Description of what this feature does',
  enabled: false,
  allowedRoles: ['admin'] // Start with admin only
});
```

### Step 3: Use in Your Code

Backend:
```typescript
const canUseFeature = await storage.checkFeatureFlag(
  FEATURE_FLAGS.NEW_FEATURE,
  req.user.id,
  req.user.role
);

if (!canUseFeature) {
  return res.status(403).json({ message: 'Feature not available' });
}
```

Frontend:
```typescript
function NewFeatureComponent() {
  const { isEnabled } = useFeatureFlag(FEATURE_FLAGS.NEW_FEATURE);

  if (!isEnabled) return null;

  return <div>Feature UI</div>;
}
```

## Rollout Strategy

### Phase 1: Internal Testing
- Create flag with `enabled: false`, `allowedRoles: ['admin']`
- Set user overrides for internal testers
- Test thoroughly

### Phase 2: Beta Testing
- Keep `enabled: false`
- Add user overrides for beta users
- Monitor for issues

### Phase 3: Gradual Rollout
- Set `enabled: true`
- Keep `allowedRoles: ['admin']` initially
- Gradually expand to `['admin', 'owner']`, then `['admin', 'owner', 'driver']`

### Phase 4: Full Launch
- Set `enabled: true`
- Set `allowedRoles: ['driver', 'owner', 'admin']`
- Remove all user overrides (no longer needed)

### Emergency Rollback
If issues arise:
1. Go to `/feature-flags` admin UI
2. Toggle the feature off immediately
3. No code deployment needed!

## Best Practices

1. **Always start disabled**: New flags should default to `enabled: false`

2. **Use type-safe keys**: Always use constants from `FEATURE_FLAGS` enum

3. **Document your flags**: Write clear descriptions in the admin UI

4. **Clean up old flags**: Remove flags from database once features are fully launched and stable (usually after 30 days)

5. **Test both states**: Always test your code with the feature both enabled and disabled

6. **Handle loading states**: Use the `isLoading` state from `useFeatureFlag` hook

7. **Backend validation**: Always check feature flags on the backend for security-critical features

## Example: Rubble Service Implementation

The concrete rubble service is ready to implement using the `rubble_service` feature flag:

```typescript
// shared/featureFlags.ts
export const FEATURE_FLAGS = {
  RUBBLE_SERVICE: 'rubble_service',
} as const;

// Backend route
app.post('/api/rubble-orders', isAuthenticated, async (req: any, res) => {
  const user = await storage.getUser(req.user.id);
  
  const canUseRubble = await storage.checkFeatureFlag(
    FEATURE_FLAGS.RUBBLE_SERVICE,
    user.id,
    user.role
  );
  
  if (!canUseRubble) {
    return res.status(403).json({ message: 'Rubble service not available' });
  }
  
  // Process rubble order...
});

// Frontend component
function RubbleServiceButton() {
  const { isEnabled, isLoading } = useFeatureFlag(FEATURE_FLAGS.RUBBLE_SERVICE);
  
  if (isLoading) return <Skeleton />;
  if (!isEnabled) return null;
  
  return (
    <Button onClick={handleRubbleOrder}>
      Order Rubble Pickup
    </Button>
  );
}
```

## Monitoring

Feature flag usage is automatically logged to:
- Server logs: Check `/api/feature-flags/:flagKey/check` endpoints
- Admin dashboard: View which features are enabled
- User overrides: Track beta testers in the database

## Troubleshooting

**Problem**: Feature not showing for user
- Check if flag is enabled globally
- Verify user's role is in `allowedRoles`
- Check for user-specific override (may be disabling it)

**Problem**: Feature showing for wrong users
- Review `allowedRoles` array
- Check for unintended user overrides
- Verify role assignment in user table

**Problem**: Changes not taking effect
- Frontend uses React Query cache (30s default)
- Refresh page or wait for cache invalidation
- Check browser console for errors
