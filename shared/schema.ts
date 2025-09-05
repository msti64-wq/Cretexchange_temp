import { sql, relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enums
export const userRoleEnum = pgEnum("user_role", ["driver", "owner", "admin", "super_admin"]);
export const paymentMethodEnum = pgEnum("payment_method", ["check", "venmo", "zelle", "ach", "credit_card"]);
export const paymentFrequencyEnum = pgEnum("payment_frequency", ["weekly", "biweekly", "monthly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "inactive", "trial", "past_due"]);
export const washoutStatusEnum = pgEnum("washout_status", ["pending", "verified", "rejected"]);
export const messageStatusEnum = pgEnum("message_status", ["unread", "read", "resolved"]);

// User storage table - local authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role"),
  phone: varchar("phone"),
  address: text("address"),
  paymentMethod: paymentMethodEnum("payment_method").default("check"),
  paymentFrequency: paymentFrequencyEnum("payment_frequency").default("weekly"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Driver specific information
export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  employerName: varchar("employer_name"),
  employerAddress: text("employer_address"),
  employerPhone: varchar("employer_phone"),
  licenseNumber: varchar("license_number"),
  isGpsEnabled: boolean("is_gps_enabled").default(true),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 8 }),
  currentLongitude: decimal("current_longitude", { precision: 11, scale: 8 }),
  lastLocationUpdate: timestamp("last_location_update"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Owner specific information
export const owners = pgTable("owners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("company_name"),
  businessLicense: varchar("business_license"),
  taxId: varchar("tax_id"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").default("trial"),
  subscriptionPlan: varchar("subscription_plan").default("monthly"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  isApproved: boolean("is_approved").default(false),
  hasAgreedToTerms: boolean("has_agreed_to_terms").default(false),
  termsAgreedAt: timestamp("terms_agreed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Washout locations
export const washoutLocations = pgTable("washout_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  address: text("address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  rate: decimal("rate", { precision: 10, scale: 2 }).notNull().default("10.00"),
  isActive: boolean("is_active").default(true),
  isVisible: boolean("is_visible").default(true),
  description: text("description"),
  amenities: text("amenities").array(),
  operatingHours: jsonb("operating_hours"),
  permitUrls: text("permit_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Washout activities
export const washoutActivities = pgTable("washout_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  locationId: varchar("location_id").notNull().references(() => washoutLocations.id, { onDelete: "cascade" }),
  status: washoutStatusEnum("status").notNull().default("pending"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  checkInTime: timestamp("check_in_time").notNull(),
  checkOutTime: timestamp("check_out_time"),
  photoUrls: text("photo_urls").array(),
  notes: text("notes"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  activityId: varchar("activity_id").notNull().references(() => washoutActivities.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  processingFee: decimal("processing_fee", { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: varchar("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Owner payment methods
export const ownerPaymentMethods = pgTable("owner_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(), // 'card' or 'bank'
  last4: varchar("last4").notNull(),
  // Card specific fields
  expiryMonth: varchar("expiry_month"),
  expiryYear: varchar("expiry_year"),
  cardholderName: varchar("cardholder_name"),
  // Bank specific fields
  bankName: varchar("bank_name"),
  accountHolderName: varchar("account_holder_name"),
  // Stripe integration
  stripePaymentMethodId: varchar("stripe_payment_method_id"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type").notNull().default("info"),
  isRead: boolean("is_read").default(false),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Support messages from users to admin
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject").notNull(),
  message: text("message").notNull(),
  status: messageStatusEnum("status").default("unread"),
  userRole: userRoleEnum("user_role").notNull(),
  userPhone: varchar("user_phone"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  driver: one(drivers, { fields: [users.id], references: [drivers.userId] }),
  owner: one(owners, { fields: [users.id], references: [owners.userId] }),
  notifications: many(notifications),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, { fields: [drivers.userId], references: [users.id] }),
  activities: many(washoutActivities),
  payments: many(payments),
}));

export const ownersRelations = relations(owners, ({ one, many }) => ({
  user: one(users, { fields: [owners.userId], references: [users.id] }),
  locations: many(washoutLocations),
  payments: many(payments),
  paymentMethods: many(ownerPaymentMethods),
}));

export const washoutLocationsRelations = relations(washoutLocations, ({ one, many }) => ({
  owner: one(owners, { fields: [washoutLocations.ownerId], references: [owners.id] }),
  activities: many(washoutActivities),
}));

export const washoutActivitiesRelations = relations(washoutActivities, ({ one }) => ({
  driver: one(drivers, { fields: [washoutActivities.driverId], references: [drivers.id] }),
  location: one(washoutLocations, { fields: [washoutActivities.locationId], references: [washoutLocations.id] }),
  payment: one(payments, { fields: [washoutActivities.id], references: [payments.activityId] }),
}));

export const ownerPaymentMethodsRelations = relations(ownerPaymentMethods, ({ one }) => ({
  owner: one(owners, { fields: [ownerPaymentMethods.ownerId], references: [owners.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  driver: one(drivers, { fields: [payments.driverId], references: [drivers.id] }),
  owner: one(owners, { fields: [payments.ownerId], references: [owners.id] }),
  activity: one(washoutActivities, { fields: [payments.activityId], references: [washoutActivities.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true, // This will be handled separately for security
  createdAt: true,
  updatedAt: true,
});

// Registration schema for new users
export const userRegistrationSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  address: z.string().min(5, "Address is required"),
  role: z.enum(["driver", "owner"]),
});

// Login schema
export const userLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Password reset schemas
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOwnerSchema = createInsertSchema(owners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWashoutLocationSchema = createInsertSchema(washoutLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  latitude: z.number().transform(val => val.toString()),
  longitude: z.number().transform(val => val.toString()),
  rate: z.number().transform(val => val.toString()),
});

export const insertWashoutActivitySchema = createInsertSchema(washoutActivities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertOwnerPaymentMethodSchema = createInsertSchema(ownerPaymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Owner = typeof owners.$inferSelect;
export type WashoutLocation = typeof washoutLocations.$inferSelect;
export type WashoutActivity = typeof washoutActivities.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type InsertWashoutLocation = z.infer<typeof insertWashoutLocationSchema>;
export type InsertWashoutActivity = z.infer<typeof insertWashoutActivitySchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type OwnerPaymentMethod = typeof ownerPaymentMethods.$inferSelect;
export type InsertOwnerPaymentMethod = z.infer<typeof insertOwnerPaymentMethodSchema>;
