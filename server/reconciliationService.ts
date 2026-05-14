import Stripe from 'stripe';
import { db } from './db';
import {
  balanceReconciliations,
  reconciliationDiscrepancies,
  drivers,
  owners,
  driverWallets,
  users,
  payments,
  billingBatches,
  washoutPaymentBatches,
  pendingWashoutPayments,
} from '@shared/schema';
import { eq, and, gte, lte, inArray, isNotNull, desc } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export interface ReconciliationResult {
  reconciliationId: string;
  accountsChecked: number;
  discrepanciesFound: number;
  totalAmountDiscrepancy: number;
  discrepancies: Array<{
    accountType: string;
    accountId: string;
    userId?: string;
    username?: string;
    type?: string;
    databaseBalance: number;
    dbBalance?: string;
    stripeBalance: number;
    difference: number;
    severity?: 'critical' | 'warning' | 'minor';
  }>;
}

export async function performBalanceReconciliation(triggeredBy?: string): Promise<ReconciliationResult> {
  console.log('\n========== BALANCE RECONCILIATION STARTED ==========\n');
  
  // Create reconciliation record
  const [reconciliation] = await db.insert(balanceReconciliations).values({
    status: 'running',
    startedAt: new Date(),
    triggeredBy: triggeredBy || null,
  }).returning();

  try {
    const discrepancies: ReconciliationResult['discrepancies'] = [];
    let accountsChecked = 0;

    // Check driver wallets
    const driverAccounts = await db
      .select({
        driver: drivers,
        user: users,
        wallet: driverWallets,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .leftJoin(driverWallets, eq(driverWallets.driverId, drivers.id));

    for (const { driver, user, wallet } of driverAccounts) {
      accountsChecked++;

      // Skip if no Stripe Connect account
      if (!user.stripeConnectAccountId) {
        console.log(`⏭️  Driver ${driver.id} has no Stripe Connect account - skipping`);
        continue;
      }

      try {
        // Get Stripe balance for driver's Connect account
        const stripeBalance = await stripe.balance.retrieve({
          stripeAccount: user.stripeConnectAccountId,
        });

        // Stripe balance is in cents, convert to dollars
        const stripeAvailableBalance = stripeBalance.available[0]?.amount / 100 || 0;
        const databaseBalance = parseFloat(wallet?.availableBalance || '0');

        // Check for discrepancies (allow $0.01 tolerance for rounding)
        const difference = Math.abs(databaseBalance - stripeAvailableBalance);
        
        // Calculate severity based on difference amount
        let severity: 'critical' | 'warning' | 'minor' | null = null;
        if (difference > 10) {
          severity = 'critical';
        } else if (difference > 1) {
          severity = 'warning';
        } else if (difference > 0.01) {
          severity = 'minor';
        }
        
        if (difference > 0.01) {
          console.log(`⚠️  ${severity?.toUpperCase()} discrepancy found for driver ${driver.id}:`, {
            database: databaseBalance,
            stripe: stripeAvailableBalance,
            difference,
            severity
          });

          // AUTO-CORRECT: Update database balance to match Stripe (source of truth)
          if (wallet) {
            await db.update(driverWallets)
              .set({
                availableBalance: stripeAvailableBalance.toFixed(2),
              })
              .where(eq(driverWallets.driverId, driver.id));
            
            console.log(`✅ Auto-corrected driver ${driver.id} balance: $${databaseBalance.toFixed(2)} → $${stripeAvailableBalance.toFixed(2)}`);
          }

          // Record discrepancy with severity
          await db.insert(reconciliationDiscrepancies).values({
            reconciliationId: reconciliation.id,
            accountId: driver.id,
            accountType: 'driver',
            discrepancyType: 'amount_mismatch',
            databaseBalance: databaseBalance.toFixed(2),
            stripeBalance: stripeAvailableBalance.toFixed(2),
            difference: difference.toFixed(2),
            severity,
            stripeAccountId: user.stripeConnectAccountId,
            description: `Driver wallet balance mismatch (${severity}): DB=$${databaseBalance.toFixed(2)}, Stripe=$${stripeAvailableBalance.toFixed(2)}, auto-corrected to match Stripe`,
          });

          discrepancies.push({
            accountType: 'driver',
            accountId: driver.id,
            userId: user.id,
            username: user.username,
            type: 'driver',
            databaseBalance,
            dbBalance: `$${databaseBalance.toFixed(2)}`,
            stripeBalance: stripeAvailableBalance,
            difference,
            severity: severity!,
          });
        } else {
          console.log(`✅ Driver ${driver.id} balance matches: $${databaseBalance.toFixed(2)}`);
        }
      } catch (error: any) {
        console.error(`❌ Error checking driver ${driver.id} balance:`, error.message);
        
        // Record as error discrepancy
        await db.insert(reconciliationDiscrepancies).values({
          reconciliationId: reconciliation.id,
          accountType: 'driver',
          accountId: driver.id,
          discrepancyType: 'missing_transaction',
          description: `Error retrieving Stripe balance: ${error.message}`,
        });
      }
    }

    // TODO: Add owner wallet reconciliation when Treasury is enabled
    // For now, owners fund via cards so no stored balance to reconcile

    // Calculate totals
    const totalAmountDiscrepancy = discrepancies.reduce((sum, d) => sum + d.difference, 0);

    // Update reconciliation record
    await db.update(balanceReconciliations)
      .set({
        status: 'completed',
        accountsChecked,
        discrepanciesFound: discrepancies.length,
        totalAmountDiscrepancy: totalAmountDiscrepancy.toFixed(2),
        completedAt: new Date(),
      })
      .where(eq(balanceReconciliations.id, reconciliation.id));

    console.log('\n========== RECONCILIATION COMPLETE ==========');
    console.log(`Accounts checked: ${accountsChecked}`);
    console.log(`Discrepancies found: ${discrepancies.length}`);
    console.log(`Total amount discrepancy: $${totalAmountDiscrepancy.toFixed(2)}\n`);

    return {
      reconciliationId: reconciliation.id,
      accountsChecked,
      discrepanciesFound: discrepancies.length,
      totalAmountDiscrepancy,
      discrepancies,
    };
  } catch (error: any) {
    console.error('❌ Reconciliation failed:', error.message);

    // Mark reconciliation as failed
    await db.update(balanceReconciliations)
      .set({
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
      })
      .where(eq(balanceReconciliations.id, reconciliation.id));

    throw error;
  }
}

export async function reconcileAllConnectedAccounts() {
  const result = await performBalanceReconciliation();
  return {
    totalAccounts: result.accountsChecked,
    discrepancies: result.discrepancies,
    balancesSynced: Math.max(result.accountsChecked - result.discrepanciesFound, 0),
  };
}

export async function getReconciliationReport(reconciliationId: string) {
  const [reconciliation] = await db
    .select()
    .from(balanceReconciliations)
    .where(eq(balanceReconciliations.id, reconciliationId));

  if (!reconciliation) {
    throw new Error('Reconciliation not found');
  }

  const discrepanciesData = await db
    .select()
    .from(reconciliationDiscrepancies)
    .where(eq(reconciliationDiscrepancies.reconciliationId, reconciliationId));

  return {
    reconciliation,
    discrepancies: discrepanciesData,
  };
}

export async function resolveDiscrepancy(
  discrepancyId: string,
  resolvedBy: string,
  resolutionNotes: string
) {
  await db.update(reconciliationDiscrepancies)
    .set({
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy,
      resolutionNotes,
    })
    .where(eq(reconciliationDiscrepancies.id, discrepancyId));
}

// ============================================================================
// PAYMENT RECONCILIATION - Verify database matches Stripe
// ============================================================================

export interface PaymentReconciliationResult {
  paymentsChecked: number;
  discrepanciesFound: number;
  missingInStripe: number;
  amountMismatches: number;
  statusMismatches: number;
  details: PaymentDiscrepancy[];
}

export interface PaymentDiscrepancy {
  paymentId: string;
  activityId: string;
  type: 'missing_in_stripe' | 'amount_mismatch' | 'status_mismatch' | 'missing_stripe_id';
  severity: 'critical' | 'warning' | 'info';
  dbAmount: string;
  stripeAmount?: string;
  dbStatus: string;
  stripeStatus?: string;
  stripePaymentIntentId?: string | null;
  description: string;
  recommendation: string;
}

export async function performPaymentReconciliation(
  startDate?: Date,
  endDate?: Date,
  limit: number = 100
): Promise<PaymentReconciliationResult> {
  console.log('\n========== PAYMENT RECONCILIATION STARTED ==========\n');
  
  const result: PaymentReconciliationResult = {
    paymentsChecked: 0,
    discrepanciesFound: 0,
    missingInStripe: 0,
    amountMismatches: 0,
    statusMismatches: 0,
    details: [],
  };

  try {
    // Build query conditions
    const conditions = [];
    if (startDate) {
      conditions.push(gte(payments.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(payments.createdAt, endDate));
    }

    // Get payments with Stripe IDs (completed or processed payments)
    const paymentRecords = await db
      .select()
      .from(payments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(limit);

    console.log(`📊 Found ${paymentRecords.length} payments to check`);

    for (const payment of paymentRecords) {
      result.paymentsChecked++;

      // Check 1: Payments marked as completed should have a Stripe PaymentIntent ID
      if (payment.status === 'completed' && !payment.stripePaymentIntentId) {
        result.discrepanciesFound++;
        result.details.push({
          paymentId: payment.id,
          activityId: payment.activityId,
          type: 'missing_stripe_id',
          severity: 'critical',
          dbAmount: payment.amount,
          dbStatus: payment.status,
          stripePaymentIntentId: null,
          description: 'Payment marked as completed but has no Stripe PaymentIntent ID',
          recommendation: 'Verify payment was actually processed in Stripe and update the record',
        });
        continue;
      }

      // Check 2: Verify Stripe PaymentIntent if we have an ID
      if (payment.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

          // Verify amount matches
          const stripeAmountDollars = paymentIntent.amount / 100;
          const dbAmount = parseFloat(payment.amount);
          const amountDifference = Math.abs(stripeAmountDollars - dbAmount);

          if (amountDifference > 0.01) {
            result.discrepanciesFound++;
            result.amountMismatches++;
            result.details.push({
              paymentId: payment.id,
              activityId: payment.activityId,
              type: 'amount_mismatch',
              severity: amountDifference > 1 ? 'critical' : 'warning',
              dbAmount: payment.amount,
              stripeAmount: stripeAmountDollars.toFixed(2),
              dbStatus: payment.status,
              stripeStatus: paymentIntent.status,
              stripePaymentIntentId: payment.stripePaymentIntentId,
              description: `Amount mismatch: DB=$${dbAmount.toFixed(2)}, Stripe=$${stripeAmountDollars.toFixed(2)}`,
              recommendation: 'Investigate why amounts differ. Stripe is source of truth.',
            });
          }

          // Verify status aligns with Stripe
          const stripeSucceeded = paymentIntent.status === 'succeeded';
          const dbCompleted = payment.status === 'completed';
          
          if (stripeSucceeded !== dbCompleted) {
            result.discrepanciesFound++;
            result.statusMismatches++;
            result.details.push({
              paymentId: payment.id,
              activityId: payment.activityId,
              type: 'status_mismatch',
              severity: 'warning',
              dbAmount: payment.amount,
              stripeAmount: (paymentIntent.amount / 100).toFixed(2),
              dbStatus: payment.status,
              stripeStatus: paymentIntent.status,
              stripePaymentIntentId: payment.stripePaymentIntentId,
              description: `Status mismatch: DB=${payment.status}, Stripe=${paymentIntent.status}`,
              recommendation: stripeSucceeded 
                ? 'Update database status to completed' 
                : 'Investigate failed payment and update status',
            });
          }

        } catch (stripeError: any) {
          if (stripeError.code === 'resource_missing') {
            result.discrepanciesFound++;
            result.missingInStripe++;
            result.details.push({
              paymentId: payment.id,
              activityId: payment.activityId,
              type: 'missing_in_stripe',
              severity: 'critical',
              dbAmount: payment.amount,
              dbStatus: payment.status,
              stripePaymentIntentId: payment.stripePaymentIntentId,
              description: `PaymentIntent ${payment.stripePaymentIntentId} not found in Stripe`,
              recommendation: 'This may indicate the PaymentIntent ID was incorrectly stored or belongs to a different Stripe account',
            });
          } else {
            console.error(`❌ Error verifying payment ${payment.id}:`, stripeError.message);
          }
        }
      }
    }

    console.log('\n========== PAYMENT RECONCILIATION COMPLETE ==========');
    console.log(`Payments checked: ${result.paymentsChecked}`);
    console.log(`Discrepancies found: ${result.discrepanciesFound}`);
    console.log(`  - Missing in Stripe: ${result.missingInStripe}`);
    console.log(`  - Amount mismatches: ${result.amountMismatches}`);
    console.log(`  - Status mismatches: ${result.statusMismatches}\n`);

    return result;

  } catch (error: any) {
    console.error('❌ Payment reconciliation failed:', error.message);
    throw error;
  }
}

// ============================================================================
// BATCH PAYMENT RECONCILIATION - Verify billing batches match Stripe
// ============================================================================

export interface BatchReconciliationResult {
  batchesChecked: number;
  discrepanciesFound: number;
  details: BatchDiscrepancy[];
}

export interface BatchDiscrepancy {
  batchId: string;
  ownerId: string;
  type: 'missing_in_stripe' | 'amount_mismatch' | 'status_mismatch';
  severity: 'critical' | 'warning';
  dbAmount: string;
  stripeAmount?: string;
  dbStatus: string;
  stripeStatus?: string;
  stripePaymentIntentId?: string | null;
  description: string;
}

export async function performBatchReconciliation(
  startDate?: Date,
  endDate?: Date,
  limit: number = 50
): Promise<BatchReconciliationResult> {
  console.log('\n========== BATCH RECONCILIATION STARTED ==========\n');
  
  const result: BatchReconciliationResult = {
    batchesChecked: 0,
    discrepanciesFound: 0,
    details: [],
  };

  try {
    const conditions = [];
    if (startDate) {
      conditions.push(gte(billingBatches.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(billingBatches.createdAt, endDate));
    }
    // Only check batches with Stripe Transfer IDs
    conditions.push(isNotNull(billingBatches.stripeBatchTransferId));

    const batches = await db
      .select()
      .from(billingBatches)
      .where(and(...conditions))
      .orderBy(desc(billingBatches.createdAt))
      .limit(limit);

    console.log(`📊 Found ${batches.length} billing batches to check`);

    for (const batch of batches) {
      result.batchesChecked++;

      if (!batch.stripeBatchTransferId) continue;

      try {
        // For billing batches, we track via Transfer ID, not PaymentIntent
        // Try to retrieve as a Transfer first
        const transfer = await stripe.transfers.retrieve(batch.stripeBatchTransferId);

        // Verify amount (batch totalAmount should equal Stripe transfer)
        const expectedAmountDollars = parseFloat(batch.totalAmount);
        const stripeAmountDollars = transfer.amount / 100;
        const difference = Math.abs(expectedAmountDollars - stripeAmountDollars);

        if (difference > 0.01) {
          result.discrepanciesFound++;
          result.details.push({
            batchId: batch.id,
            ownerId: batch.ownerId,
            type: 'amount_mismatch',
            severity: difference > 10 ? 'critical' : 'warning',
            dbAmount: expectedAmountDollars.toFixed(2),
            stripeAmount: stripeAmountDollars.toFixed(2),
            dbStatus: batch.status,
            stripeStatus: transfer.reversed ? 'reversed' : 'completed',
            stripePaymentIntentId: batch.stripeBatchTransferId,
            description: `Batch amount mismatch: DB total=$${expectedAmountDollars.toFixed(2)}, Stripe=$${stripeAmountDollars.toFixed(2)}`,
          });
        }

        // Verify status alignment
        const stripeCompleted = !transfer.reversed;
        const dbCompleted = batch.status === 'completed';
        
        if (stripeCompleted !== dbCompleted && batch.status !== 'failed') {
          result.discrepanciesFound++;
          result.details.push({
            batchId: batch.id,
            ownerId: batch.ownerId,
            type: 'status_mismatch',
            severity: 'warning',
            dbAmount: expectedAmountDollars.toFixed(2),
            stripeAmount: stripeAmountDollars.toFixed(2),
            dbStatus: batch.status,
            stripeStatus: transfer.reversed ? 'reversed' : 'completed',
            stripePaymentIntentId: batch.stripeBatchTransferId,
            description: `Batch status mismatch: DB=${batch.status}, Stripe=${transfer.reversed ? 'reversed' : 'completed'}`,
          });
        }

      } catch (stripeError: any) {
        if (stripeError.code === 'resource_missing') {
          result.discrepanciesFound++;
          result.details.push({
            batchId: batch.id,
            ownerId: batch.ownerId,
            type: 'missing_in_stripe',
            severity: 'critical',
            dbAmount: batch.totalAmount,
            dbStatus: batch.status,
            stripePaymentIntentId: batch.stripeBatchTransferId,
            description: `Transfer ${batch.stripeBatchTransferId} not found in Stripe`,
          });
        }
      }
    }

    console.log('\n========== BATCH RECONCILIATION COMPLETE ==========');
    console.log(`Batches checked: ${result.batchesChecked}`);
    console.log(`Discrepancies found: ${result.discrepanciesFound}\n`);

    return result;

  } catch (error: any) {
    console.error('❌ Batch reconciliation failed:', error.message);
    throw error;
  }
}

// ============================================================================
// AUTO-FIX UTILITIES - Correct database from Stripe source of truth
// ============================================================================

export async function syncPaymentFromStripe(paymentId: string): Promise<{
  success: boolean;
  changes: string[];
  error?: string;
}> {
  const changes: string[] = [];

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));

    if (!payment) {
      return { success: false, changes: [], error: 'Payment not found' };
    }

    if (!payment.stripePaymentIntentId) {
      return { success: false, changes: [], error: 'No Stripe PaymentIntent ID on payment' };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

    const updates: Partial<typeof payment> = {};

    // Sync status
    if (paymentIntent.status === 'succeeded' && payment.status !== 'completed') {
      updates.status = 'completed';
      updates.paidAt = new Date();
      changes.push(`Status: ${payment.status} → completed`);
    } else if (paymentIntent.status === 'canceled' && payment.status !== 'cancelled') {
      updates.status = 'cancelled';
      changes.push(`Status: ${payment.status} → cancelled`);
    }

    // Sync charge ID if available
    if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'string') {
      if (payment.stripeChargeId !== paymentIntent.latest_charge) {
        updates.stripeChargeId = paymentIntent.latest_charge;
        changes.push(`ChargeID: added ${paymentIntent.latest_charge}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(payments)
        .set(updates)
        .where(eq(payments.id, paymentId));
    }

    return { success: true, changes };

  } catch (error: any) {
    return { success: false, changes: [], error: error.message };
  }
}
