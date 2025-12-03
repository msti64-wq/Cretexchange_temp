import Stripe from 'stripe';
import { db } from './db';
import { webhookEvents, payments, driverWallets, walletTransactions, ownerFundingSources, users, drivers, owners } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { formatStripeRequirements } from './stripeUtils';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

export interface WebhookHandlerResult {
  success: boolean;
  message: string;
  error?: string;
}

export async function processStripeWebhook(
  rawBody: string,
  signature: string
): Promise<WebhookHandlerResult> {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
      return {
        success: false,
        message: 'Webhook secret not configured',
        error: 'Missing webhook secret'
      };
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return {
        success: false,
        message: 'Invalid signature',
        error: err.message
      };
    }

    console.log(`📨 Received webhook: ${event.type} (${event.id})`);

    // Check for duplicate event (idempotency)
    const existingEvent = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, event.id))
      .limit(1);

    if (existingEvent.length > 0) {
      // If event was already successfully processed, skip it
      if (existingEvent[0].status === 'processed') {
        console.log(`⏭️  Event ${event.id} already processed successfully, skipping`);
        return {
          success: true,
          message: 'Event already processed (idempotent)'
        };
      }
      
      // If event is still processing or recently received, skip to avoid duplicate processing
      if (existingEvent[0].status === 'processing' || existingEvent[0].status === 'received') {
        console.log(`⏭️  Event ${event.id} is currently being processed, skipping`);
        return {
          success: true,
          message: 'Event currently being processed'
        };
      }
      
      // If event previously failed, allow retry
      const retryCount = existingEvent[0].retryCount ?? 0;
      console.log(`🔄 Event ${event.id} previously failed (attempt ${retryCount + 1}), retrying...`);
    }

    // Save or update webhook event in database
    if (existingEvent.length > 0) {
      // Update existing event for retry
      await db.update(webhookEvents)
        .set({
          status: 'processing',
          payload: event as any,
          retryCount: (existingEvent[0].retryCount || 0) + 1,
        })
        .where(eq(webhookEvents.stripeEventId, event.id));
    } else {
      // Insert new event
      await db.insert(webhookEvents).values({
        stripeEventId: event.id,
        eventType: event.type,
        status: 'processing',
        payload: event as any, // Store full event payload
        accountId: event.account || null,
      });
    }

    // Process the event
    let result: WebhookHandlerResult;
    try {
      result = await handleWebhookEvent(event);
      
      // Update event status
      await db
        .update(webhookEvents)
        .set({
          status: result.success ? 'processed' : 'failed',
          processedAt: new Date(),
          errorMessage: result.error || null,
        })
        .where(eq(webhookEvents.stripeEventId, event.id));

      return result;
    } catch (error: any) {
      console.error(`❌ Error processing webhook ${event.type}:`, error.message);
      
      // Update event status to failed (retryCount already incremented when we set status to 'processing')
      await db
        .update(webhookEvents)
        .set({
          status: 'failed',
          errorMessage: error.message,
        })
        .where(eq(webhookEvents.stripeEventId, event.id));

      return {
        success: false,
        message: 'Error processing webhook',
        error: error.message
      };
    }
  } catch (error: any) {
    console.error('❌ Fatal webhook processing error:', error.message);
    return {
      success: false,
      message: 'Fatal error processing webhook',
      error: error.message
    };
  }
}

async function handleWebhookEvent(event: Stripe.Event): Promise<WebhookHandlerResult> {
  // Use string comparison to avoid TypeScript narrowing issues with Stripe's union types
  const eventType: string = event.type;
  
  // Payment Intent Events - Used for Card Payments (Connect Destination Charges)
  if (eventType === 'payment_intent.succeeded') {
    return await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
  }
  
  if (eventType === 'payment_intent.payment_failed') {
    return await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
  }

  // Charge Events - Refunds and Disputes
  if (eventType === 'charge.refunded') {
    return await handleChargeRefunded(event.data.object as Stripe.Charge);
  }

  if (eventType === 'charge.dispute.created') {
    return await handleDisputeCreated(event.data.object as Stripe.Dispute);
  }

  // Transfer Events - For Connect payments to drivers
  if (eventType === 'transfer.failed') {
    return await handleTransferFailed(event.data.object as Stripe.Transfer);
  }
  
  if (eventType === 'transfer.reversed') {
    return await handleTransferReversed(event.data.object as Stripe.Transfer);
  }

  // Connected Account Events - Critical for verification status tracking
  if (eventType === 'account.updated') {
    return await handleAccountUpdated(event.data.object as Stripe.Account);
  }
  
  if (eventType === 'account.external_account.created') {
    console.log('🏦 External account created for connected account');
    return { success: true, message: 'External account event logged' };
  }

  // Payout Events - Track when money leaves Stripe to bank accounts
  if (eventType === 'payout.failed') {
    return await handlePayoutFailed(event.data.object as Stripe.Payout);
  }

  console.log(`ℹ️  Unhandled webhook event type: ${eventType}`);
  return { success: true, message: `Event type ${eventType} not handled` };
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<WebhookHandlerResult> {
  console.log(`✅ Payment succeeded: ${paymentIntent.id}`);
  
  // Extract metadata to find related payment record
  const activityId = paymentIntent.metadata.activity_id;
  
  if (!activityId) {
    console.log('⚠️  No activity_id in payment metadata - may be subscription payment');
    return { success: true, message: 'Payment succeeded (no activity tracking needed)' };
  }

  // Update payment record to "completed" status
  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.activityId, activityId))
      .limit(1);

    if (payment) {
      await db
        .update(payments)
        .set({
          status: 'completed',
          stripePaymentIntentId: paymentIntent.id,
        })
        .where(eq(payments.id, payment.id));

      console.log(`✅ Updated payment ${payment.id} to completed`);
      return { success: true, message: `Payment ${payment.id} confirmed` };
    } else {
      console.log(`⚠️  No payment found for activity ${activityId}`);
      return { success: true, message: 'Payment succeeded but no record found' };
    }
  } catch (error: any) {
    console.error('❌ Error updating payment status:', error.message);
    return { success: false, message: 'Error updating payment', error: error.message };
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<WebhookHandlerResult> {
  console.log(`❌ Payment failed: ${paymentIntent.id} - ${paymentIntent.last_payment_error?.message}`);
  
  const activityId = paymentIntent.metadata.activity_id;
  
  if (!activityId) {
    return { success: true, message: 'Payment failed (no activity to update)' };
  }

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.activityId, activityId))
      .limit(1);

    if (payment) {
      // Mark payment as failed
      await db
        .update(payments)
        .set({
          status: 'failed',
          stripePaymentIntentId: paymentIntent.id,
        })
        .where(eq(payments.id, payment.id));

      // TODO: Reverse driver wallet credit if already applied
      // This would require checking if the driver was already credited optimistically
      
      console.log(`✅ Marked payment ${payment.id} as failed`);
      return { success: true, message: `Payment ${payment.id} marked as failed` };
    } else {
      return { success: true, message: 'Payment failed but no record found' };
    }
  } catch (error: any) {
    console.error('❌ Error handling failed payment:', error.message);
    return { success: false, message: 'Error handling failed payment', error: error.message };
  }
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<WebhookHandlerResult> {
  const refundAmountCents = charge.amount_refunded;
  const refundAmountDollars = refundAmountCents / 100;
  console.log(`💸 Charge refunded: ${charge.id} - Amount: $${refundAmountDollars.toFixed(2)}`);
  
  const paymentIntentId = charge.payment_intent as string;
  
  if (!paymentIntentId) {
    console.log('⚠️  No payment_intent on charge - cannot track refund');
    return { success: true, message: 'Refund processed (no payment intent to track)' };
  }
  
  try {
    // Find payment by Stripe PaymentIntent ID
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (payment) {
      // Update payment record with refund details
      const isFullRefund = refundAmountCents >= (parseFloat(payment.amount) * 100);
      
      await db
        .update(payments)
        .set({
          status: isFullRefund ? 'refunded' : 'partially_refunded',
          refundedAt: new Date(),
          refundAmount: refundAmountDollars.toFixed(2),
          refundReason: charge.refunds?.data?.[0]?.reason || 'Manual refund',
          stripeChargeId: charge.id,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      
      console.log(`✅ Updated payment ${payment.id} - ${isFullRefund ? 'fully' : 'partially'} refunded: $${refundAmountDollars.toFixed(2)}`);
      
      // CRITICAL: If driver was already paid via transfer, the transfer needs to be reversed
      // This is handled separately via transfer.reversed webhook
      if (payment.stripeTransferId) {
        console.log(`⚠️  Payment ${payment.id} has transfer ${payment.stripeTransferId} - transfer reversal may be needed`);
      }
      
      return { 
        success: true, 
        message: `Refund recorded: ${isFullRefund ? 'full' : 'partial'} refund of $${refundAmountDollars.toFixed(2)} for payment ${payment.id}` 
      };
    } else {
      console.log(`⚠️  No payment record found for PaymentIntent ${paymentIntentId}`);
      return { success: true, message: 'Refund processed (no payment record found)' };
    }
  } catch (error: any) {
    console.error('❌ Error handling refund:', error.message);
    return { success: false, message: 'Error handling refund', error: error.message };
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<WebhookHandlerResult> {
  console.log(`⚠️  Dispute created: ${dispute.id} - Reason: ${dispute.reason}`);
  
  // TODO: Implement dispute handling
  // 1. Notify admin
  // 2. Flag payment/activity for review
  // 3. Potentially freeze related account funds
  
  return { success: true, message: `Dispute ${dispute.id} logged - needs manual review` };
}

async function handleTransferFailed(transfer: Stripe.Transfer): Promise<WebhookHandlerResult> {
  console.log(`❌ Transfer failed: ${transfer.id}`);
  console.log(`   Destination: ${transfer.destination}`);
  console.log(`   Amount: $${(transfer.amount / 100).toFixed(2)}`);
  
  try {
    // Find payment by transfer ID
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeTransferId, transfer.id))
      .limit(1);

    if (payment) {
      // Mark payment as failed - driver did NOT receive funds
      await db
        .update(payments)
        .set({
          status: 'transfer_failed',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      
      console.log(`⚠️  Payment ${payment.id} transfer failed - driver ${payment.driverId} did NOT receive funds`);
      
      // Log critical issue for admin attention
      console.error(`🚨 CRITICAL: Transfer ${transfer.id} failed for payment ${payment.id}`);
      console.error(`   Driver ${payment.driverId} should have received $${payment.amount}`);
      console.error(`   This requires manual intervention`);
      
      return { 
        success: true, 
        message: `Transfer failure recorded: payment ${payment.id} marked as transfer_failed` 
      };
    } else {
      // Check washout payment batches as alternative
      console.log(`⚠️  No individual payment found for transfer ${transfer.id} - may be batch transfer`);
      return { success: true, message: `Transfer failure logged: ${transfer.id} (no payment record)` };
    }
  } catch (error: any) {
    console.error('❌ Error handling transfer failure:', error.message);
    return { success: false, message: 'Error handling transfer failure', error: error.message };
  }
}

async function handleTransferReversed(transfer: Stripe.Transfer): Promise<WebhookHandlerResult> {
  console.log(`🔄 Transfer reversed: ${transfer.id}`);
  console.log(`   Amount reversed: $${(transfer.amount / 100).toFixed(2)}`);
  
  try {
    // Find payment by transfer ID
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeTransferId, transfer.id))
      .limit(1);

    if (payment) {
      // Update payment status to reflect that transfer was reversed
      await db
        .update(payments)
        .set({
          status: 'transfer_reversed',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      
      console.log(`✅ Payment ${payment.id} marked as transfer_reversed`);
      console.log(`   Driver ${payment.driverId} funds have been clawed back`);
      
      return { 
        success: true, 
        message: `Transfer reversal recorded: payment ${payment.id}` 
      };
    } else {
      return { success: true, message: `Transfer reversal logged: ${transfer.id} (no payment record)` };
    }
  } catch (error: any) {
    console.error('❌ Error handling transfer reversal:', error.message);
    return { success: false, message: 'Error handling transfer reversal', error: error.message };
  }
}

async function handlePayoutFailed(payout: Stripe.Payout): Promise<WebhookHandlerResult> {
  console.log(`❌ Payout failed: ${payout.id}`);
  console.log(`   Amount: $${(payout.amount / 100).toFixed(2)}`);
  console.log(`   Failure Code: ${payout.failure_code}`);
  console.log(`   Failure Message: ${payout.failure_message}`);
  
  // Payouts fail when money cannot be sent to a bank account
  // This typically means the bank account details are wrong
  // For Connect accounts, we should flag the user's account
  
  console.error(`🚨 PAYOUT FAILED: ${payout.id}`);
  console.error(`   This may indicate a bank account issue for a driver`);
  console.error(`   Failure: ${payout.failure_code} - ${payout.failure_message}`);
  
  return { 
    success: true, 
    message: `Payout failure logged: ${payout.id} - ${payout.failure_code}` 
  };
}

// ============================================================================
// CONNECTED ACCOUNT VERIFICATION TRACKING
// ============================================================================

async function handleAccountUpdated(account: Stripe.Account): Promise<WebhookHandlerResult> {
  console.log(`🔄 Account updated: ${account.id}`);
  
  // Extract key verification info
  const accountInfo = {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    currentlyDue: account.requirements?.currently_due || [],
    eventuallyDue: account.requirements?.eventually_due || [],
    pastDue: account.requirements?.past_due || [],
    disabledReason: account.requirements?.disabled_reason,
  };
  
  console.log('📊 Account verification status:', {
    ...accountInfo,
    currentlyDueCount: accountInfo.currentlyDue.length,
    pastDueCount: accountInfo.pastDue.length,
  });
  
  // Find the user by their Stripe Connect account ID
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeConnectAccountId, account.id))
      .limit(1);
    
    if (!user) {
      console.log(`⚠️  No user found for account ${account.id}`);
      return { success: true, message: 'Account updated but no matching user found' };
    }
    
    console.log(`👤 Found user ${user.username} (${user.role}) for account ${account.id}`);
    
    // Determine if verification status changed significantly
    const hasBlockingRequirements = accountInfo.currentlyDue.length > 0 || accountInfo.pastDue.length > 0;
    const isFullyVerified = accountInfo.chargesEnabled && accountInfo.payoutsEnabled && !hasBlockingRequirements;
    
    // Log human-readable requirements
    if (hasBlockingRequirements) {
      const allDue = [...accountInfo.currentlyDue, ...accountInfo.pastDue];
      const humanReadable = formatStripeRequirements(allDue);
      console.log(`📋 Missing requirements for ${user.username}:`, humanReadable);
    }
    
    // Prepare verification status data - clear requirements when resolved
    const requirementsJson = accountInfo.currentlyDue.length > 0 
      ? JSON.stringify(accountInfo.currentlyDue) 
      : null; // Explicitly null when no requirements (clears stale data)
    
    // Update role-specific table with verification status
    // Drivers: primarily need payouts_enabled for receiving washout payments
    // Owners: need charges_enabled (for receiving payments) AND payouts_enabled (for paying drivers)
    if (user.role === 'driver') {
      const [driver] = await db
        .select()
        .from(drivers)
        .where(eq(drivers.userId, user.id))
        .limit(1);
      
      if (driver) {
        // For drivers, verified = payouts_enabled and no blocking requirements
        const driverVerified = accountInfo.payoutsEnabled && !hasBlockingRequirements;
        
        await db.update(drivers)
          .set({
            stripePayoutsEnabled: accountInfo.payoutsEnabled,
            stripeChargesEnabled: accountInfo.chargesEnabled,
            stripeRequirements: requirementsJson,
            stripeVerifiedAt: driverVerified && !driver.stripeVerifiedAt ? new Date() : undefined,
            updatedAt: new Date(),
          })
          .where(eq(drivers.id, driver.id));
        
        console.log(`✅ Updated driver ${driver.id} verification: payouts=${accountInfo.payoutsEnabled} (required for payments), requirements=${accountInfo.currentlyDue.length}`);
        
        // Log status change for monitoring
        if (driverVerified && !driver.stripeVerifiedAt) {
          console.log(`🎉 Driver ${user.username} is now VERIFIED for receiving payments!`);
        }
      }
    } else if (user.role === 'owner') {
      const [owner] = await db
        .select()
        .from(owners)
        .where(eq(owners.userId, user.id))
        .limit(1);
      
      if (owner) {
        // For owners, verified = charges_enabled AND payouts_enabled (needed to pay drivers)
        const ownerVerified = accountInfo.chargesEnabled && accountInfo.payoutsEnabled && !hasBlockingRequirements;
        
        await db.update(owners)
          .set({
            stripePayoutsEnabled: accountInfo.payoutsEnabled,
            stripeChargesEnabled: accountInfo.chargesEnabled,
            stripeRequirements: requirementsJson,
            stripeVerifiedAt: ownerVerified && !owner.stripeVerifiedAt ? new Date() : undefined,
            updatedAt: new Date(),
          })
          .where(eq(owners.id, owner.id));
        
        console.log(`✅ Updated owner ${owner.id} verification: charges=${accountInfo.chargesEnabled}, payouts=${accountInfo.payoutsEnabled}, requirements=${accountInfo.currentlyDue.length}`);
        
        // Log status change for monitoring
        if (ownerVerified && !owner.stripeVerifiedAt) {
          console.log(`🎉 Owner ${user.username} is now VERIFIED for receiving and sending payments!`);
        }
      }
    }
    
    // Log significant status changes for monitoring
    if (isFullyVerified) {
      console.log(`🎉 Account ${account.id} (${user.username}) is FULLY VERIFIED!`);
      console.log(`   - Charges: ${accountInfo.chargesEnabled ? 'ENABLED' : 'disabled'}`);
      console.log(`   - Payouts: ${accountInfo.payoutsEnabled ? 'ENABLED' : 'disabled'}`);
    } else if (accountInfo.disabledReason) {
      console.log(`⚠️  Account ${account.id} has disabled reason: ${accountInfo.disabledReason}`);
    }
    
    return { 
      success: true, 
      message: `Account ${account.id} updated - verified: ${isFullyVerified}, blocking requirements: ${hasBlockingRequirements ? accountInfo.currentlyDue.length : 0}` 
    };
  } catch (error: any) {
    console.error('❌ Error handling account update:', error.message);
    return { success: false, message: 'Error handling account update', error: error.message };
  }
}
