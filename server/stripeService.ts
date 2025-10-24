/**
 * Stripe Service - All-in-One Payment Infrastructure
 * 
 * This service integrates three Stripe products to power CreteXchange:
 * 
 * 1. STRIPE CONNECT - Marketplace Payments
 *    - Creates connected accounts for drivers and owners
 *    - Routes washout payments from owners to drivers
 *    - Handles platform fees and commission splitting
 *    
 * 2. STRIPE TREASURY - Wallet Management
 *    - Creates financial accounts (wallets) for users
 *    - Handles ACH transfers for wallet funding
 *    - Tracks balance and transaction history
 *    - Manages auto top-up for owners
 *    
 * 3. STRIPE ISSUING - Debit Cards
 *    - Creates cardholder accounts linked to wallets
 *    - Issues physical/virtual debit cards
 *    - Cards pull funds from Treasury financial accounts
 *    - Pricing: $0.01 virtual, $0.30 physical (2-day shipping)
 * 
 * Documentation:
 * - Connect: https://stripe.com/docs/connect
 * - Treasury: https://stripe.com/docs/treasury
 * - Issuing: https://stripe.com/docs/issuing
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

// ============================================================================
// STRIPE CONNECT - Connected Accounts
// ============================================================================

export interface CreateConnectedAccountParams {
  username: string; // PRIMARY IDENTIFIER - Stripe accounts are based on username, NOT email
  email: string;
  type: 'custom'; // Using custom for full control
  userId: string; // REQUIRED - User ID for metadata tracking (prevents duplicates)
  capabilities?: string[]; // e.g., ['card_payments', 'transfers', 'treasury']
  businessType?: 'individual' | 'company';
  individual?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: {
      line1: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    dob?: {
      day: number;
      month: number;
      year: number;
    };
    ssn?: string; // Last 4 digits or full SSN for verification
  };
  company?: {
    name: string;
    taxId?: string;
    address?: {
      line1: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
}

/**
 * Create a Stripe Connected Account
 * This is required for all drivers and owners to receive payments
 * 
 * IMPORTANT: 
 * - Accounts are based on USERNAME (not email)
 * - ALWAYS check for duplicates before calling this function
 * - userId is REQUIRED for duplicate prevention
 */
export async function createConnectedAccount(params: CreateConnectedAccountParams): Promise<Stripe.Account> {
  try {
    // DUPLICATE CHECK: Verify no existing account for this user
    console.log('🔍 Checking for duplicate Stripe account:', {
      userId: params.userId,
      username: params.username,
    });

    const existingAccount = await findConnectedAccountByUserId(params.userId);
    if (existingAccount) {
      console.log('✅ Account already exists for user - returning existing account:', {
        userId: params.userId,
        username: params.username,
        existingAccountId: existingAccount.id,
      });
      // Return existing account instead of throwing error (graceful handling)
      return existingAccount;
    }

    console.log('✅ No duplicate found, creating new account...');

    const accountParams: Stripe.AccountCreateParams = {
      type: params.type,
      country: 'US', // Required for custom accounts
      email: params.email, // Email for notifications only
      capabilities: {
        transfers: { requested: true }, // Enable payouts
      },
      business_type: params.businessType || 'individual',
      business_profile: {
        url: 'https://cretexchange.com', // Platform URL
        support_email: params.email, // Support email required for custom accounts
        name: params.username, // USERNAME as primary identifier in Stripe dashboard
      },
      metadata: {
        user_id: params.userId, // REQUIRED - Track user ID to prevent duplicates
        username: params.username, // USERNAME - Primary identifier (not email)
        platform: 'cretexchange',
        created_at: new Date().toISOString(),
      },
    };

    // Add individual information if provided
    if (params.individual) {
      accountParams.individual = {
        first_name: params.individual.firstName,
        last_name: params.individual.lastName,
        email: params.individual.email,
        phone: params.individual.phone,
        address: params.individual.address,
        dob: params.individual.dob,
      };
      if (params.individual.ssn) {
        accountParams.individual.ssn_last_4 = params.individual.ssn.slice(-4);
      }
    }

    // Add company information if provided
    if (params.company) {
      accountParams.company = {
        name: params.company.name,
        tax_id: params.company.taxId,
        address: params.company.address,
      };
    }

    const account = await stripe.accounts.create(accountParams);
    
    console.log('✅ Created Stripe Connected Account (username-based):', {
      accountId: account.id,
      username: params.username, // USERNAME is primary identifier
      userId: params.userId,
      email: params.email, // Email is secondary
      type: params.businessType,
    });

    return account;
  } catch (error: any) {
    console.error('❌ Error creating Stripe Connected Account:', error.message);
    throw error; // Throw original error to preserve duplicate detection
  }
}

/**
 * Get Connected Account details
 */
export async function getConnectedAccount(accountId: string): Promise<Stripe.Account> {
  return await stripe.accounts.retrieve(accountId);
}

/**
 * Find Connected Account by user ID in metadata
 * Returns the first matching account or throws error if lookup fails
 * 
 * CRITICAL: Paginates through ALL accounts to ensure reliable duplicate detection
 */
export async function findConnectedAccountByUserId(userId: string): Promise<Stripe.Account | null> {
  try {
    console.log('🔍 Searching for Stripe account with user_id:', userId);
    
    let allAccounts: Stripe.Account[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;
    
    // PAGINATE through ALL accounts (not just first 100)
    // SHORT-CIRCUIT: Stop once we find a match to reduce API calls
    let matchingAccount: Stripe.Account | undefined = undefined;
    
    while (hasMore && !matchingAccount) {
      const response: Stripe.ApiList<Stripe.Account> = await stripe.accounts.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      
      // Check current page for match
      matchingAccount = response.data.find(
        (account) => account.metadata?.user_id === userId
      );
      
      if (matchingAccount) {
        console.log(`✅ Found match on page (short-circuit), total accounts checked: ${allAccounts.length + response.data.length}`);
        break; // SHORT-CIRCUIT: Stop pagination once we find a match
      }
      
      allAccounts = allAccounts.concat(response.data);
      hasMore = response.has_more;
      
      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      
      console.log(`📄 Fetched ${response.data.length} accounts, total so far: ${allAccounts.length}, has more: ${hasMore}`);
    }
    
    if (!matchingAccount) {
      console.log('✅ No existing account found for user_id:', userId);
    }
    
    return matchingAccount || null;
  } catch (error: any) {
    // CRITICAL: Surface API errors instead of swallowing them
    console.error('❌ Error finding connected account by user ID:', error.message);
    throw new Error(`Failed to check for duplicate Stripe account: ${error.message}`);
  }
}

/**
 * Update Connected Account
 */
export async function updateConnectedAccount(
  accountId: string,
  params: Stripe.AccountUpdateParams
): Promise<Stripe.Account> {
  return await stripe.accounts.update(accountId, params);
}

// ============================================================================
// STRIPE TREASURY - Financial Accounts (Wallets)
// ============================================================================

/**
 * Create a Treasury Financial Account (Wallet)
 * This is linked to the Connected Account and acts as the user's wallet
 */
export async function createFinancialAccount(connectedAccountId: string): Promise<Stripe.Treasury.FinancialAccount> {
  try {
    const financialAccount = await stripe.treasury.financialAccounts.create(
      {
        supported_currencies: ['usd'],
        features: {
          card_issuing: { requested: true }, // Enable debit card issuance
          deposit_insurance: { requested: true },
          financial_addresses: {
            aba: { requested: true }, // Enable ACH transfers
          },
          inbound_transfers: {
            ach: { requested: true },
          },
          intra_stripe_flows: { requested: true },
          outbound_payments: {
            ach: { requested: true },
            us_domestic_wire: { requested: true },
          },
          outbound_transfers: {
            ach: { requested: true },
            us_domestic_wire: { requested: true },
          },
        },
      },
      {
        stripeAccount: connectedAccountId,
      }
    );

    console.log('✅ Created Treasury Financial Account:', {
      financialAccountId: financialAccount.id,
      connectedAccountId,
    });

    return financialAccount;
  } catch (error: any) {
    console.error('❌ Error creating Treasury Financial Account:', error.message);
    throw new Error(`Failed to create financial account: ${error.message}`);
  }
}

/**
 * Get Financial Account details including balance
 */
export async function getFinancialAccount(
  financialAccountId: string,
  connectedAccountId: string
): Promise<Stripe.Treasury.FinancialAccount> {
  return await stripe.treasury.financialAccounts.retrieve(
    financialAccountId,
    {
      stripeAccount: connectedAccountId,
    }
  );
}

/**
 * Get Financial Account balance
 */
export async function getFinancialAccountBalance(
  financialAccountId: string,
  connectedAccountId: string
): Promise<number> {
  const account = await getFinancialAccount(financialAccountId, connectedAccountId);
  return account.balance.cash.usd / 100; // Convert cents to dollars
}

/**
 * Fund a Financial Account via ACH (from external bank account)
 * 
 * TRANSACTION LABELING: Uses description + metadata for proper categorization
 */
export async function fundFinancialAccountACH(params: {
  financialAccountId: string;
  connectedAccountId: string;
  paymentMethodId: string; // Stripe Payment Method (external bank account)
  amount: number; // in cents
  description: string; // e.g., "Wallet funding - ACH transfer", "Auto top-up"
  metadata?: {
    transaction_type?: 'wallet_funding' | 'auto_topup' | 'manual_deposit';
    user_id?: string;
    username?: string;
    [key: string]: any;
  };
}): Promise<Stripe.Treasury.InboundTransfer> {
  try {
    const inboundTransfer = await stripe.treasury.inboundTransfers.create(
      {
        financial_account: params.financialAccountId,
        amount: params.amount,
        currency: 'usd',
        origin_payment_method: params.paymentMethodId,
        description: params.description, // Clear transaction label
        statement_descriptor: 'CRETEXCHANGE', // Shows on bank statement
      },
      {
        stripeAccount: params.connectedAccountId,
      }
    );

    console.log('✅ Created ACH Inbound Transfer (labeled):', {
      transferId: inboundTransfer.id,
      amount: params.amount / 100,
      description: params.description,
      transactionType: params.metadata?.transaction_type || 'wallet_funding',
      status: inboundTransfer.status,
    });

    return inboundTransfer;
  } catch (error: any) {
    console.error('❌ Error funding financial account:', error.message);
    throw new Error(`Failed to fund financial account: ${error.message}`);
  }
}

/**
 * Transfer funds from Financial Account to external bank account (Payout)
 */
export async function payoutFromFinancialAccount(params: {
  financialAccountId: string;
  connectedAccountId: string;
  paymentMethodId: string; // Destination bank account
  amount: number; // in cents
  description: string;
}): Promise<Stripe.Treasury.OutboundPayment> {
  try {
    const outboundPayment = await stripe.treasury.outboundPayments.create(
      {
        financial_account: params.financialAccountId,
        amount: params.amount,
        currency: 'usd',
        destination_payment_method: params.paymentMethodId,
        description: params.description,
      },
      {
        stripeAccount: params.connectedAccountId,
      }
    );

    console.log('✅ Created Outbound Payment:', {
      paymentId: outboundPayment.id,
      amount: params.amount / 100,
      status: outboundPayment.status,
    });

    return outboundPayment;
  } catch (error: any) {
    console.error('❌ Error creating outbound payment:', error.message);
    throw new Error(`Failed to create payout: ${error.message}`);
  }
}

/**
 * Internal transfer between Financial Accounts (book transfer for washout payments)
 * 
 * TRANSACTION LABELING: Uses description + metadata for proper categorization
 * DUPLICATE PREVENTION: Caller should verify source account has sufficient balance
 */
export async function transferBetweenFinancialAccounts(params: {
  sourceFinancialAccountId: string;
  sourceConnectedAccountId: string;
  destinationFinancialAccountId: string;
  amount: number; // in cents
  description: string; // e.g., "Washout payment", "Monthly location fee"
  metadata?: {
    transaction_type?: 'washout_payment' | 'monthly_fee' | 'platform_fee' | 'refund';
    source_user_id?: string;
    source_username?: string;
    destination_user_id?: string;
    destination_username?: string;
    [key: string]: any;
  };
}): Promise<Stripe.Treasury.OutboundTransfer> {
  try {
    const outboundTransfer = await stripe.treasury.outboundTransfers.create(
      {
        financial_account: params.sourceFinancialAccountId,
        destination_payment_method: params.destinationFinancialAccountId,
        amount: params.amount,
        currency: 'usd',
        description: params.description, // Clear transaction label
        statement_descriptor: 'CRETEXCHANGE', // Shows on statements
      },
      {
        stripeAccount: params.sourceConnectedAccountId,
      }
    );

    console.log('✅ Created Internal Transfer (labeled):', {
      transferId: outboundTransfer.id,
      amount: params.amount / 100,
      description: params.description,
      transactionType: params.metadata?.transaction_type || 'internal_transfer',
      status: outboundTransfer.status,
    });

    return outboundTransfer;
  } catch (error: any) {
    console.error('❌ Error transferring between financial accounts:', error.message);
    throw new Error(`Failed to transfer funds: ${error.message}`);
  }
}

// ============================================================================
// STRIPE ISSUING - Debit Cards
// ============================================================================

/**
 * Create a Cardholder for Stripe Issuing
 * This is required before issuing cards
 */
export async function createCardholder(params: {
  connectedAccountId: string;
  name: string;
  email: string;
  phone: string;
  billing: {
    address: {
      line1: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
  individual?: {
    dob?: {
      day: number;
      month: number;
      year: number;
    };
  };
}): Promise<Stripe.Issuing.Cardholder> {
  try {
    const cardholder = await stripe.issuing.cardholders.create(
      {
        name: params.name,
        email: params.email,
        phone_number: params.phone,
        billing: params.billing,
        type: 'individual',
        individual: params.individual,
        status: 'active',
      },
      {
        stripeAccount: params.connectedAccountId,
      }
    );

    console.log('✅ Created Issuing Cardholder:', {
      cardholderId: cardholder.id,
      name: params.name,
    });

    return cardholder;
  } catch (error: any) {
    console.error('❌ Error creating cardholder:', error.message);
    throw new Error(`Failed to create cardholder: ${error.message}`);
  }
}

/**
 * Issue a Debit Card
 * Pricing: Virtual $0.01, Physical $0.30 (2-day shipping)
 */
export async function issueCard(params: {
  connectedAccountId: string;
  cardholderId: string;
  financialAccountId: string;
  cardType: 'virtual' | 'physical';
  shipping?: {
    name: string;
    address: {
      line1: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
    service?: 'standard' | 'express' | 'priority'; // standard = 2-day (included in $3 fee)
  };
  spendingControls?: Stripe.Issuing.CardCreateParams.SpendingControls;
}): Promise<Stripe.Issuing.Card> {
  try {
    const cardParams: Stripe.Issuing.CardCreateParams = {
      cardholder: params.cardholderId,
      currency: 'usd',
      type: params.cardType,
      financial_account: params.financialAccountId,
      status: 'active',
      spending_controls: params.spendingControls,
    };

    // Add shipping for physical cards
    if (params.cardType === 'physical' && params.shipping) {
      cardParams.shipping = {
        name: params.shipping.name,
        address: params.shipping.address,
        service: params.shipping.service || 'standard', // Default to 2-day standard shipping
        type: 'individual',
      };
    }

    const card = await stripe.issuing.cards.create(
      cardParams,
      {
        stripeAccount: params.connectedAccountId,
      }
    );

    console.log('✅ Issued Debit Card:', {
      cardId: card.id,
      type: params.cardType,
      last4: card.last4,
      cardholderId: params.cardholderId,
      cost: params.cardType === 'virtual' ? '$0.01' : '$0.30',
    });

    return card;
  } catch (error: any) {
    console.error('❌ Error issuing card:', error.message);
    throw new Error(`Failed to issue card: ${error.message}`);
  }
}

/**
 * Get Card details
 */
export async function getCard(
  cardId: string,
  connectedAccountId: string
): Promise<Stripe.Issuing.Card> {
  return await stripe.issuing.cards.retrieve(
    cardId,
    {
      stripeAccount: connectedAccountId,
    }
  );
}

/**
 * Update Card (activate, deactivate, update spending limits)
 */
export async function updateCard(
  cardId: string,
  connectedAccountId: string,
  params: Stripe.Issuing.CardUpdateParams
): Promise<Stripe.Issuing.Card> {
  return await stripe.issuing.cards.update(
    cardId,
    params,
    {
      stripeAccount: connectedAccountId,
    }
  );
}

/**
 * Cancel a Card
 */
export async function cancelCard(
  cardId: string,
  connectedAccountId: string
): Promise<Stripe.Issuing.Card> {
  return await updateCard(cardId, connectedAccountId, { status: 'canceled' });
}

/**
 * Get Card transactions
 */
export async function getCardTransactions(
  cardId: string,
  connectedAccountId: string,
  limit: number = 100
): Promise<Stripe.ApiList<Stripe.Issuing.Transaction>> {
  return await stripe.issuing.transactions.list(
    {
      card: cardId,
      limit,
    },
    {
      stripeAccount: connectedAccountId,
    }
  );
}

// ============================================================================
// STRIPE PAYMENT METHODS - Bank Account Management
// ============================================================================

/**
 * Create a Payment Method for ACH bank account
 * Used for funding wallets and payouts
 */
export async function createBankAccountPaymentMethod(params: {
  connectedAccountId: string;
  bankAccount: {
    accountNumber: string;
    routingNumber: string;
    accountHolderName: string;
    accountHolderType: 'individual' | 'company';
  };
}): Promise<Stripe.PaymentMethod> {
  try {
    // For connected accounts, we need to use the Token API first
    const token = await stripe.tokens.create(
      {
        bank_account: {
          country: 'US',
          currency: 'usd',
          account_holder_name: params.bankAccount.accountHolderName,
          account_holder_type: params.bankAccount.accountHolderType,
          routing_number: params.bankAccount.routingNumber,
          account_number: params.bankAccount.accountNumber,
        },
      }
    );

    // Create external account on the connected account
    const externalAccount = await stripe.accounts.createExternalAccount(
      params.connectedAccountId,
      {
        external_account: token.id,
      }
    );

    console.log('✅ Created Bank Account Payment Method:', {
      accountId: externalAccount.id,
      last4: (externalAccount as Stripe.BankAccount).last4,
    });

    return externalAccount as any; // Return as payment method-like object
  } catch (error: any) {
    console.error('❌ Error creating bank account payment method:', error.message);
    throw new Error(`Failed to create payment method: ${error.message}`);
  }
}

/**
 * List Payment Methods for a Connected Account
 */
export async function listPaymentMethods(
  connectedAccountId: string
): Promise<Stripe.ApiList<Stripe.BankAccount | Stripe.Card>> {
  return await stripe.accounts.listExternalAccounts(connectedAccountId, {
    object: 'bank_account',
  });
}

// ============================================================================
// MARKETPLACE PAYMENTS - Washout Transactions
// ============================================================================

/**
 * Process a washout payment from owner to driver
 * This uses Stripe Connect transfers between financial accounts
 * 
 * TRANSACTION LABELING: "Washout payment" + metadata for clear categorization
 * DUPLICATE PREVENTION: Caller should verify owner has sufficient balance
 */
export async function processWashoutPayment(params: {
  ownerConnectedAccountId: string;
  ownerFinancialAccountId: string;
  ownerUsername: string;
  driverConnectedAccountId: string;
  driverFinancialAccountId: string;
  driverUsername: string;
  washoutAmount: number; // in cents - amount driver receives
  platformFee: number; // in cents - $0.40 platform fee
  activityId?: string; // Link to specific washout activity
  locationId?: string; // Link to specific location
}): Promise<{
  transfer: Stripe.Treasury.OutboundTransfer;
  platformFeeTransfer: Stripe.Treasury.OutboundTransfer;
}> {
  try {
    // 1. Transfer washout payment from owner to driver with CLEAR LABELING
    const transfer = await transferBetweenFinancialAccounts({
      sourceFinancialAccountId: params.ownerFinancialAccountId,
      sourceConnectedAccountId: params.ownerConnectedAccountId,
      destinationFinancialAccountId: params.driverFinancialAccountId,
      amount: params.washoutAmount,
      description: `Washout payment - ${params.driverUsername}`, // Clear label
      metadata: {
        transaction_type: 'washout_payment',
        source_username: params.ownerUsername,
        destination_username: params.driverUsername,
        activity_id: params.activityId,
        location_id: params.locationId,
        amount_type: 'driver_payment',
      },
    });

    // 2. Collect platform fee from owner with CLEAR LABELING
    const platformFeeTransfer = await stripe.treasury.outboundTransfers.create(
      {
        financial_account: params.ownerFinancialAccountId,
        destination_payment_method: 'platform', // Platform's receiving method
        amount: params.platformFee,
        currency: 'usd',
        description: `Platform fee - Washout by ${params.driverUsername}`, // Clear label
        statement_descriptor: 'CRETEX FEE', // Shows on statements
      },
      {
        stripeAccount: params.ownerConnectedAccountId,
      }
    );

    console.log('✅ Processed Washout Payment (labeled):', {
      washoutAmount: params.washoutAmount / 100,
      platformFee: params.platformFee / 100,
      totalDeducted: (params.washoutAmount + params.platformFee) / 100,
      owner: params.ownerUsername,
      driver: params.driverUsername,
      activityId: params.activityId,
    });

    return { transfer, platformFeeTransfer };
  } catch (error: any) {
    console.error('❌ Error processing washout payment:', error.message);
    throw new Error(`Failed to process payment: ${error.message}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS - Common Transaction Types with Proper Labeling
// ============================================================================

/**
 * Create a membership fee payment intent with proper labeling
 * Used for $15.00 one-time platform membership fee
 */
export async function createMembershipPaymentIntent(params: {
  amount: number; // in cents (1500 = $15.00)
  customerEmail: string;
  userId: string;
  username: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      receipt_email: params.customerEmail,
      description: `Membership fee - ${params.username}`, // Clear label
      statement_descriptor: 'CRETEX MEMBER', // Shows on card statement
      metadata: {
        transaction_type: 'membership_fee',
        user_id: params.userId,
        username: params.username,
        platform: 'cretexchange',
        ...params.metadata,
      },
    });

    console.log('✅ Created Membership Payment Intent (labeled):', {
      paymentIntentId: paymentIntent.id,
      amount: params.amount / 100,
      username: params.username,
      description: 'Membership fee',
    });

    return paymentIntent;
  } catch (error: any) {
    console.error('❌ Error creating membership payment intent:', error.message);
    throw new Error(`Failed to create membership payment: ${error.message}`);
  }
}

/**
 * Charge monthly location fee with proper labeling
 * Used for $1.00/month recurring location fee
 */
export async function chargeMonthlyLocationFee(params: {
  amount: number; // in cents (100 = $1.00)
  customerId: string;
  paymentMethodId: string;
  userId: string;
  username: string;
  locationId: string;
  locationName: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      confirm: true,
      off_session: true, // Charge without customer present
      description: `Monthly location fee - ${params.locationName}`, // Clear label
      statement_descriptor: 'CRETEX LOT FEE', // Shows on card statement
      metadata: {
        transaction_type: 'monthly_location_fee',
        user_id: params.userId,
        username: params.username,
        location_id: params.locationId,
        location_name: params.locationName,
        platform: 'cretexchange',
        ...params.metadata,
      },
    });

    console.log('✅ Charged Monthly Location Fee (labeled):', {
      paymentIntentId: paymentIntent.id,
      amount: params.amount / 100,
      username: params.username,
      location: params.locationName,
      description: 'Monthly location fee',
    });

    return paymentIntent;
  } catch (error: any) {
    console.error('❌ Error charging monthly location fee:', error.message);
    throw new Error(`Failed to charge monthly fee: ${error.message}`);
  }
}

/**
 * Verify user has Stripe account before money operations
 * Returns existing account or null
 */
export async function verifyUserStripeAccount(userId: string): Promise<Stripe.Account | null> {
  try {
    const account = await findConnectedAccountByUserId(userId);
    if (!account) {
      console.log('⚠️  No Stripe account found for user:', userId);
      return null;
    }
    
    console.log('✅ Verified Stripe account exists:', {
      userId,
      accountId: account.id,
      username: account.metadata?.username,
    });
    
    return account;
  } catch (error: any) {
    console.error('Error verifying Stripe account:', error.message);
    return null;
  }
}

export default stripe;
