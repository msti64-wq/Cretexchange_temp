import { db } from '../db';
import { users, owners, feesLedger } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function createTestSubscription() {
  try {
    console.log('🧪 Creating test owner subscription...');
    
    // Create test user
    const passwordHash = await bcrypt.hash('testpass123', 10);
    const [user] = await db.insert(users).values({
      username: 'testowner2',
      email: 'testowner2@test.com',
      passwordHash,
      firstName: 'Test',
      lastName: 'Owner2',
      phone: '555-0102',
      street: '123 Test St',
      city: 'Test City',
      state: 'CA',
      zip: '90210',
      role: 'owner',
    }).returning();
    
    console.log('✅ Created user:', user.id);
    
    // Create owner profile
    const [owner] = await db.insert(owners).values({
      userId: user.id,
      companyName: 'Test Company 2',
      businessPhone: '555-0102',
      businessEmail: 'testowner2@test.com',
      businessStreet: '123 Test St',
      businessCity: 'Test City',
      businessState: 'CA',
      businessZip: '90210',
      subscriptionPlan: 'annual',
      subscriptionStatus: 'active',
      isApproved: true,
      walletBalance: '0.00',
      walletStatus: 'active',
      stripeConnectAccountId: 'acct_test_12345',
      stripeTreasuryAccountId: 'fa_test_67890',
      stripeCustomerId: 'cus_test_abcde',
      stripePaymentIntentId: 'pi_test_xyz123',
      membershipPaymentMethod: 'stripe',
      membershipActivatedAt: new Date(),
    }).returning();
    
    console.log('✅ Created owner:', owner.id);
    
    // Create fees_ledger entry for $1,500 membership
    const today = new Date();
    const periodStart = today.toISOString().split('T')[0];
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const periodEnd = oneYearLater.toISOString().split('T')[0];
    
    const [feeLedger] = await db.insert(feesLedger).values({
      ownerId: owner.id,
      feeType: 'subscription_annual',
      amountCents: 150000, // $1,500
      periodStart,
      periodEnd,
      status: 'paid',
      stripeTransferId: 'pi_test_xyz123',
      paidAt: new Date(),
      metadata: {
        paymentMethod: 'stripe',
        stripeCustomerId: 'cus_test_abcde',
        stripeConnectAccountId: 'acct_test_12345',
      },
    }).returning();
    
    console.log('✅ Created fees_ledger entry:', feeLedger.id);
    console.log('');
    console.log('📊 Test Subscription Summary:');
    console.log('  User ID:', user.id);
    console.log('  Username:', user.username);
    console.log('  Owner ID:', owner.id);
    console.log('  Fee Ledger ID:', feeLedger.id);
    console.log('  Amount: $1,500.00');
    console.log('  Status:', feeLedger.status);
    console.log('  Period:', periodStart, 'to', periodEnd);
    console.log('');
    console.log('✅ Test subscription created successfully!');
    console.log('🔍 Check the Superadmin Fees page to see the payment');
    
  } catch (error) {
    console.error('❌ Error creating test subscription:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

createTestSubscription();
