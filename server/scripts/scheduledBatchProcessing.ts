#!/usr/bin/env tsx
/**
 * Scheduled Batch Processing Job
 * 
 * This script processes pending billing batches for all owners based on their
 * configured billing cadence (daily/weekly). Designed to run daily via Replit 
 * Scheduled Deployments.
 * 
 * Usage: 
 *   npm run job:batch-processing
 *   OR
 *   tsx server/scripts/scheduledBatchProcessing.ts
 * 
 * Environment Variables:
 *   STRIPE_SECRET_KEY - Required for Stripe API access
 *   DATABASE_URL - Required for database access
 * 
 * Scheduled Deployment Configuration:
 *   Schedule: "Every day at 6:00 AM UTC" (after business hours close)
 *   Command: npm run job:batch-processing
 *   Timeout: 10 minutes
 */

import { db } from "../db";
import { DatabaseStorage } from "../storage";

interface BatchProcessingResult {
  startTime: string;
  endTime: string;
  durationMs: number;
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  details: {
    ownerId: string;
    ownerName: string;
    batchId: string;
    amount: string;
    status: 'success' | 'failed';
    error?: string;
  }[];
}

async function runScheduledBatchProcessing(): Promise<BatchProcessingResult> {
  const startTime = new Date();
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║       SCHEDULED BATCH PROCESSING JOB - STARTING                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`⏰ Start Time: ${startTime.toISOString()}`);
  console.log(`📅 Date: ${startTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  console.log('');

  const result: BatchProcessingResult = {
    startTime: startTime.toISOString(),
    endTime: '',
    durationMs: 0,
    success: false,
    processed: 0,
    failed: 0,
    errors: [],
    details: []
  };

  try {
    const storage = new DatabaseStorage();
    
    // Get today's date in YYYY-MM-DD format for batch processing
    const today = new Date();
    const cutoffDate = today.toISOString().split('T')[0];
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Processing batches for cutoff date: ${cutoffDate}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Call the storage method for daily batch processing
    const batchResult = await storage.processDailyBatches(cutoffDate);
    
    result.processed = batchResult.processed;
    result.failed = batchResult.failed;
    result.errors = batchResult.errors;
    result.success = batchResult.failed === 0 && batchResult.errors.length === 0;

    console.log('');
    console.log(`✅ Batches processed successfully: ${batchResult.processed}`);
    console.log(`❌ Batches failed: ${batchResult.failed}`);
    
    if (batchResult.errors.length > 0) {
      console.log('');
      console.log('⚠️ Errors encountered:');
      batchResult.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

  } catch (error: any) {
    console.error('\n❌ CRITICAL ERROR in batch processing job:', error.message);
    result.errors.push(`Critical error: ${error.message}`);
    result.success = false;
  }

  const endTime = new Date();
  result.endTime = endTime.toISOString();
  result.durationMs = endTime.getTime() - startTime.getTime();

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    JOB SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`⏱️  Duration: ${(result.durationMs / 1000).toFixed(2)} seconds`);
  console.log(`📊 Processed: ${result.processed} batches`);
  console.log(`❌ Failed: ${result.failed} batches`);
  console.log(`⚠️ Errors: ${result.errors.length}`);
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(result.success ? '✅ JOB COMPLETED SUCCESSFULLY' : '❌ JOB COMPLETED WITH ERRORS');
  console.log('════════════════════════════════════════════════════════════════');

  return result;
}

// Main execution
runScheduledBatchProcessing()
  .then((result) => {
    if (!result.success) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
