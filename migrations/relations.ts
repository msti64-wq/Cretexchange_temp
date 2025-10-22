import { relations } from "drizzle-orm/relations";
import { featureFlags, featureFlagOverrides, users, drivers, debitCardRequests, washoutActivities, washoutPhotos, payments, owners, billingBatches, notifications, washoutLocations, driverWallets, messages, passwordResetTokens, ownerWalletTransactions, feesLedger, servicePaymentAccounts, ownerFundingSources, walletTransactions, withdrawals } from "./schema";

export const featureFlagOverridesRelations = relations(featureFlagOverrides, ({one}) => ({
	featureFlag: one(featureFlags, {
		fields: [featureFlagOverrides.flagId],
		references: [featureFlags.id]
	}),
	user: one(users, {
		fields: [featureFlagOverrides.userId],
		references: [users.id]
	}),
}));

export const featureFlagsRelations = relations(featureFlags, ({many}) => ({
	featureFlagOverrides: many(featureFlagOverrides),
}));

export const usersRelations = relations(users, ({many}) => ({
	featureFlagOverrides: many(featureFlagOverrides),
	debitCardRequests: many(debitCardRequests),
	notifications: many(notifications),
	washoutActivities: many(washoutActivities),
	messages: many(messages),
	passwordResetTokens: many(passwordResetTokens),
	owners: many(owners),
	servicePaymentAccounts_createdBy: many(servicePaymentAccounts, {
		relationName: "servicePaymentAccounts_createdBy_users_id"
	}),
	servicePaymentAccounts_updatedBy: many(servicePaymentAccounts, {
		relationName: "servicePaymentAccounts_updatedBy_users_id"
	}),
	drivers: many(drivers),
}));

export const debitCardRequestsRelations = relations(debitCardRequests, ({one}) => ({
	driver: one(drivers, {
		fields: [debitCardRequests.driverId],
		references: [drivers.id]
	}),
	user: one(users, {
		fields: [debitCardRequests.userId],
		references: [users.id]
	}),
}));

export const driversRelations = relations(drivers, ({one, many}) => ({
	debitCardRequests: many(debitCardRequests),
	payments: many(payments),
	washoutActivities: many(washoutActivities),
	driverWallets: many(driverWallets),
	user: one(users, {
		fields: [drivers.userId],
		references: [users.id]
	}),
	walletTransactions: many(walletTransactions),
	withdrawals: many(withdrawals),
}));

export const washoutPhotosRelations = relations(washoutPhotos, ({one}) => ({
	washoutActivity: one(washoutActivities, {
		fields: [washoutPhotos.activityId],
		references: [washoutActivities.id]
	}),
}));

export const washoutActivitiesRelations = relations(washoutActivities, ({one, many}) => ({
	washoutPhotos: many(washoutPhotos),
	payments: many(payments),
	driver: one(drivers, {
		fields: [washoutActivities.driverId],
		references: [drivers.id]
	}),
	washoutLocation: one(washoutLocations, {
		fields: [washoutActivities.locationId],
		references: [washoutLocations.id]
	}),
	user: one(users, {
		fields: [washoutActivities.verifiedBy],
		references: [users.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	driver: one(drivers, {
		fields: [payments.driverId],
		references: [drivers.id]
	}),
	owner: one(owners, {
		fields: [payments.ownerId],
		references: [owners.id]
	}),
	washoutActivity: one(washoutActivities, {
		fields: [payments.activityId],
		references: [washoutActivities.id]
	}),
	billingBatch: one(billingBatches, {
		fields: [payments.batchId],
		references: [billingBatches.id]
	}),
	ownerWalletTransactions: many(ownerWalletTransactions),
}));

export const ownersRelations = relations(owners, ({one, many}) => ({
	payments: many(payments),
	washoutLocations: many(washoutLocations),
	ownerWalletTransactions: many(ownerWalletTransactions),
	feesLedgers: many(feesLedger),
	user: one(users, {
		fields: [owners.userId],
		references: [users.id]
	}),
	billingBatches: many(billingBatches),
	ownerFundingSources: many(ownerFundingSources),
}));

export const billingBatchesRelations = relations(billingBatches, ({one, many}) => ({
	payments: many(payments),
	ownerWalletTransactions: many(ownerWalletTransactions),
	feesLedgers: many(feesLedger),
	owner: one(owners, {
		fields: [billingBatches.ownerId],
		references: [owners.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const washoutLocationsRelations = relations(washoutLocations, ({one, many}) => ({
	washoutActivities: many(washoutActivities),
	owner: one(owners, {
		fields: [washoutLocations.ownerId],
		references: [owners.id]
	}),
	feesLedgers: many(feesLedger),
}));

export const driverWalletsRelations = relations(driverWallets, ({one}) => ({
	driver: one(drivers, {
		fields: [driverWallets.driverId],
		references: [drivers.id]
	}),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	user: one(users, {
		fields: [messages.userId],
		references: [users.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const ownerWalletTransactionsRelations = relations(ownerWalletTransactions, ({one, many}) => ({
	owner: one(owners, {
		fields: [ownerWalletTransactions.ownerId],
		references: [owners.id]
	}),
	payment: one(payments, {
		fields: [ownerWalletTransactions.paymentId],
		references: [payments.id]
	}),
	billingBatch: one(billingBatches, {
		fields: [ownerWalletTransactions.batchId],
		references: [billingBatches.id]
	}),
	feesLedgers: many(feesLedger),
}));

export const feesLedgerRelations = relations(feesLedger, ({one}) => ({
	owner: one(owners, {
		fields: [feesLedger.ownerId],
		references: [owners.id]
	}),
	washoutLocation: one(washoutLocations, {
		fields: [feesLedger.locationId],
		references: [washoutLocations.id]
	}),
	ownerWalletTransaction: one(ownerWalletTransactions, {
		fields: [feesLedger.walletTxId],
		references: [ownerWalletTransactions.id]
	}),
	billingBatch: one(billingBatches, {
		fields: [feesLedger.batchId],
		references: [billingBatches.id]
	}),
}));

export const servicePaymentAccountsRelations = relations(servicePaymentAccounts, ({one}) => ({
	user_createdBy: one(users, {
		fields: [servicePaymentAccounts.createdBy],
		references: [users.id],
		relationName: "servicePaymentAccounts_createdBy_users_id"
	}),
	user_updatedBy: one(users, {
		fields: [servicePaymentAccounts.updatedBy],
		references: [users.id],
		relationName: "servicePaymentAccounts_updatedBy_users_id"
	}),
}));

export const ownerFundingSourcesRelations = relations(ownerFundingSources, ({one}) => ({
	owner: one(owners, {
		fields: [ownerFundingSources.ownerId],
		references: [owners.id]
	}),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({one}) => ({
	driver: one(drivers, {
		fields: [walletTransactions.driverId],
		references: [drivers.id]
	}),
}));

export const withdrawalsRelations = relations(withdrawals, ({one}) => ({
	driver: one(drivers, {
		fields: [withdrawals.driverId],
		references: [drivers.id]
	}),
}));