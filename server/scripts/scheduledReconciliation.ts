#!/usr/bin/env tsx
/**
 * Scheduled Reconciliation Job
 * 
 * This script runs payment and batch reconciliation to ensure database records
 * match Stripe's authoritative data. Designed to run daily via Replit Scheduled Deployments.
 * 
 * Usage: 
 *   npm run job:reconciliation
 *   OR
 *   tsx server/scripts/scheduledReconciliation.ts
 * 
 * Environment Variables:
 *   STRIPE_SECRET_KEY - Required for Stripe API access
 *   DATABASE_URL - Required for database access
 * 
 * Scheduled Deployment Configuration:
 *   Schedule: "Every day at 2:00 AM UTC" (or your preferred off-peak time)
 *   Command: npm run job:reconciliation
 *   Timeout: 5 minutes
 */

import { 
  performBalanceReconciliation, 
  performPaymentReconciliation, 
  performBatchReconciliation 
} from "../reconciliationService";

interface ReconciliationJobResult {
  startTime: string;
  endTime: string;
  durationMs: number;
  success: boolean;
  balance: {
    accountsChecked: number;
    discrepanciesFound: number;
    totalAmountDiscrepancy: string;
  };
  payments: {
    paymentsChecked: number;
    discrepanciesFound: number;
    missingInStripe: number;
    amountMismatches: number;
    statusMismatches: number;
  };
  batches: {
    batchesChecked: number;
    discrepanciesFound: number;
  };
  overallHealth: 'HEALTHY' | 'NEEDS_ATTENTION' | 'CRITICAL';
  errors: string[];
}

async function runScheduledReconciliation(): Promise<ReconciliationJobResult> {
  const startTime = new Date();
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       SCHEDULED RECONCILIATION JOB - STARTING                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`⏰ Start Time: ${startTime.toISOString()}`);
  console.log(`📅 Date: ${startTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  console.log('');

  const result: ReconciliationJobResult = {
    startTime: startTime.toISOString(),
    endTime: '',
    durationMs: 0,
    success: false,
    balance: {
      accountsChecked: 0,
      discrepanciesFound: 0,
      totalAmountDiscrepancy: '0.00'
    },
    payments: {
      paymentsChecked: 0,
      discrepanciesFound: 0,
      missingInStripe: 0,
      amountMismatches: 0,
      statusMismatches: 0
    },
    batches: {
      batchesChecked: 0,
      discrepanciesFound: 0
    },
    overallHealth: 'HEALTHY',
    errors: []
  };

  try {
    // Step 1: Balance Reconciliation
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STEP 1: Balance Reconciliation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const balanceResult = await performBalanceReconciliation(undefined);
      result.balance = {
        accountsChecked: balanceResult.accountsChecked,
        discrepanciesFound: balanceResult.discrepanciesFound,
        totalAmountDiscrepancy: String(balanceResult.totalAmountDiscrepancy)
      };
      console.log(`✅ Balance check complete: ${balanceResult.accountsChecked} accounts, ${balanceResult.discrepanciesFound} discrepancies`);
    } catch (error: any) {
      console.error('❌ Balance reconciliation failed:', error.message);
      result.errors.push(`Balance reconciliation: ${error.message}`);
    }

    // Step 2: Payment Reconciliation (last 7 days, up to 200 payments)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 STEP 2: Payment Reconciliation (Last 7 Days)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const paymentResult = await performPaymentReconciliation(sevenDaysAgo, undefined, 200);
      result.payments = {
        paymentsChecked: paymentResult.paymentsChecked,
        discrepanciesFound: paymentResult.discrepanciesFound,
        missingInStripe: paymentResult.missingInStripe,
        amountMismatches: paymentResult.amountMismatches,
        statusMismatches: paymentResult.statusMismatches
      };
      console.log(`✅ Payment check complete: ${paymentResult.paymentsChecked} payments, ${paymentResult.discrepanciesFound} discrepancies`);
      
      if (paymentResult.discrepanciesFound > 0) {
        console.log(`   - Missing in Stripe: ${paymentResult.missingInStripe}`);
        console.log(`   - Amount mismatches: ${paymentResult.amountMismatches}`);
        console.log(`   - Status mismatches: ${paymentResult.statusMismatches}`);
      }
    } catch (error: any) {
      console.error('❌ Payment reconciliation failed:', error.message);
      result.errors.push(`Payment reconciliation: ${error.message}`);
    }

    // Step 3: Batch Reconciliation (last 30 days, up to 100 batches)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 STEP 3: Batch Reconciliation (Last 30 Days)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const batchResult = await performBatchReconciliation(thirtyDaysAgo, undefined, 100);
      result.batches = {
        batchesChecked: batchResult.batchesChecked,
        discrepanciesFound: batchResult.discrepanciesFound
      };
      console.log(`✅ Batch check complete: ${batchResult.batchesChecked} batches, ${batchResult.discrepanciesFound} discrepancies`);
    } catch (error: any) {
      console.error('❌ Batch reconciliation failed:', error.message);
      result.errors.push(`Batch reconciliation: ${error.message}`);
    }

    // Determine overall health
    const totalDiscrepancies = 
      result.balance.discrepanciesFound + 
      result.payments.discrepanciesFound + 
      result.batches.discrepanciesFound;
    
    if (result.errors.length > 0) {
      result.overallHealth = 'CRITICAL';
    } else if (totalDiscrepancies > 10) {
      result.overallHealth = 'CRITICAL';
    } else if (totalDiscrepancies > 0) {
      result.overallHealth = 'NEEDS_ATTENTION';
    } else {
      result.overallHealth = 'HEALTHY';
    }

    result.success = result.errors.length === 0;

  } catch (error: any) {
    console.error('\n❌ CRITICAL ERROR in reconciliation job:', error.message);
    result.errors.push(`Critical error: ${error.message}`);
    result.overallHealth = 'CRITICAL';
  }

  const endTime = new Date();
  result.endTime = endTime.toISOString();
  result.durationMs = endTime.getTime() - startTime.getTime();

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    JOB SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`⏱️  Duration: ${(result.durationMs / 1000).toFixed(2)} seconds`);
  console.log(`🏥 Health Status: ${result.overallHealth}`);
  console.log('');
  console.log('📊 Results:');
  console.log(`   Balance:  ${result.balance.accountsChecked} accounts checked, ${result.balance.discrepanciesFound} discrepancies`);
  console.log(`   Payments: ${result.payments.paymentsChecked} payments checked, ${result.payments.discrepanciesFound} discrepancies`);
  console.log(`   Batches:  ${result.batches.batchesChecked} batches checked, ${result.batches.discrepanciesFound} discrepancies`);
  
  if (result.errors.length > 0) {
    console.log('');
    console.log('⚠️ Errors:');
    result.errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(result.success ? '✅ JOB COMPLETED SUCCESSFULLY' : '❌ JOB COMPLETED WITH ERRORS');
  console.log('════════════════════════════════════════════════════════════════');

  return result;
}

// Main execution
runScheduledReconciliation()
  .then(async (result) => {
    const { db } = await import("../db");
    try {
      if ('$pool' in db && db.$pool) {
        await (db.$pool as any).end();
      }
    } catch (e) {
    }
    
    if (result.overallHealth !== 'HEALTHY') {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Fatal error:', error);
    const { db } = await import("../db");
    try {
      if ('$pool' in db && db.$pool) {
        await (db.$pool as any).end();
      }
    } catch (e) {
    }
    process.exit(1);
  });
