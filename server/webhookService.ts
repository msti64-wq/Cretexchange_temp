import Stripe from 'stripe';
import { db } from './db';
import { webhookEvents, payments, driverWallets, walletTransactions, ownerFundingSources } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
      console.log(`🔄 Event ${event.id} previously failed (attempt ${existingEvent[0].retryCount + 1}), retrying...`);
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
  switch (event.type) {
    // Payment Intent Events - Used for Card Payments (Connect Destination Charges)
    case 'payment_intent.succeeded':
      return await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
    
    case 'payment_intent.payment_failed':
      return await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);

    // Charge Events - Refunds and Disputes
    case 'charge.refunded':
      return await handleChargeRefunded(event.data.object as Stripe.Charge);

    case 'charge.dispute.created':
      return await handleDisputeCreated(event.data.object as Stripe.Dispute);

    // Transfer Events - For Connect payments
    case 'transfer.failed':
      return await handleTransferFailed(event.data.object as Stripe.Transfer);

    // Financial Account Events - For Treasury (if enabled)
    case 'treasury.financial_account.balance_changed':
      console.log('💰 Treasury balance changed - no action needed (tracked in Stripe)');
      return { success: true, message: 'Treasury balance event logged' };

    default:
      console.log(`ℹ️  Unhandled webhook event type: ${event.type}`);
      return { success: true, message: `Event type ${event.type} not handled` };
  }
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
  console.log(`💸 Charge refunded: ${charge.id} - Amount: $${charge.amount_refunded / 100}`);
  
  // Find payment by Stripe charge ID
  const paymentIntentId = charge.payment_intent as string;
  
  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (payment) {
      // TODO: Implement refund logic
      // 1. Debit driver's wallet
      // 2. Credit owner's wallet or initiate refund
      // 3. Update payment status
      
      console.log(`⚠️  Payment ${payment.id} was refunded - manual reconciliation needed`);
      return { success: true, message: `Refund detected for payment ${payment.id} - needs manual handling` };
    } else {
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
  
  // TODO: Implement transfer failure handling
  // This could happen if driver's Connect account has issues
  
  return { success: true, message: `Transfer failure logged: ${transfer.id}` };
}
