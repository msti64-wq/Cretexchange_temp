import { db } from '../db';
import { owners, ownerFundingSources } from '@shared/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

async function syncPaymentMethod(username: string) {
  // Get owner
  const [owner] = await db
    .select()
    .from(owners)
    .innerJoin(users, eq(owners.userId, users.id))
    .where(eq(users.username, username));

  if (!owner) {
    console.error(`Owner ${username} not found`);
    return;
  }

  const paymentMethodId = owner.owners.stripePaymentMethodId;
  if (!paymentMethodId) {
    console.error(`No payment method found for ${username}`);
    return;
  }

  // Fetch payment method details from Stripe
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  
  if (paymentMethod.type !== 'card' || !paymentMethod.card) {
    console.error('Not a card payment method');
    return;
  }

  // Insert into ownerFundingSources
  await db.insert(ownerFundingSources).values({
    ownerId: owner.owners.id,
    type: paymentMethod.card.funding === 'debit' ? 'debit_card' : 'credit_card',
    bankName: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    stripePaymentMethodId: paymentMethodId,
    isDefault: true,
    isActive: true,
  });

  console.log(`✅ Synced payment method for ${username}: ${paymentMethod.card.brand} •••• ${paymentMethod.card.last4}`);
}

// Import users table
import { users } from '@shared/schema';

// Run sync
syncPaymentMethod('TO1')
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
