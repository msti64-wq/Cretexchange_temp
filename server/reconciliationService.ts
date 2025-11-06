import Stripe from 'stripe';
import { db } from './db';
import {
  balanceReconciliations,
  reconciliationDiscrepancies,
  drivers,
  owners,
  driverWallets,
  users,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

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
