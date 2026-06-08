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
 *    - Pricing: $0.01 virtual, $30.00 physical (2-day shipping)
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

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

// ============================================================================
// STRIPE CONNECT - Connected Accounts
// ============================================================================

type ConnectedAccountAddressInput = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code?: string;
  postalCode?: string;
  country: string;
};

function toStripeAddress(address?: ConnectedAccountAddressInput): Stripe.AddressParam | undefined {
  if (!address) {
    return undefined;
  }

  return {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code ?? address.postalCode,
    country: address.country,
  };
}

export interface CreateConnectedAccountParams {
  username: string; // PRIMARY IDENTIFIER - Stripe accounts are based on username, NOT email
  email: string;
  type: 'express' | 'custom'; // Express for marketplace (auto-activates capabilities), Custom for full control
  userId: string; // REQUIRED - User ID for metadata tracking (prevents duplicates)
  capabilities?: string[]; // e.g., ['card_payments', 'transfers', 'treasury']
  businessType?: 'individual' | 'company';
  individual?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address?: ConnectedAccountAddressInput;
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
    address?: ConnectedAccountAddressInput;
  };
  businessProfile?: {
    mcc?: string;
    url?: string;
    supportEmail?: string;
  };
  tosAcceptance?: {
    date: number;
    ip: string;
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
      country: 'US', // Required
      email: params.email, // Email for notifications
      capabilities: {
        transfers: { requested: true }, // Enable payouts and receiving transfers
        card_payments: { requested: true }, // Required for Destination Charges
      },
      // CRITICAL: Controller configuration required for Express accounts to use Account Links
      // Without this, Stripe rejects Account Link creation with "account.controller.missing"
      ...(params.type === 'express' ? {
        controller: {
          fees: { payer: 'application' as const }, // Platform pays Stripe fees
          losses: { payments: 'application' as const }, // Platform handles payment losses
          stripe_dashboard: { type: 'express' as const }, // Express dashboard access
          requirement_collection: 'stripe' as const, // Stripe collects requirements via Account Links
        },
      } : {}),
      business_type: params.businessType || 'individual',
      business_profile: {
        mcc: params.businessProfile?.mcc || '7542', // Default to Car Washes (washout services)
        url: params.businessProfile?.url || 'https://cretexchange.com',
        support_email: params.businessProfile?.supportEmail || params.email,
        name: params.username, // USERNAME as primary identifier in Stripe dashboard
      },
      // TOS ACCEPTANCE: Only for Custom accounts - Express accounts MUST use Account Links
      // Stripe will reject programmatic TOS acceptance for Express accounts
      ...(params.type === 'custom' && params.tosAcceptance ? {
        tos_acceptance: {
          date: params.tosAcceptance.date,
          ip: params.tosAcceptance.ip,
        }
      } : {}),
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
        address: toStripeAddress(params.individual.address),
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
        address: toStripeAddress(params.company.address),
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

/**
 * Request transfers capability for existing driver accounts
 * This is needed for drivers created before transfers capability was added
 */
export async function requestTransfersCapability(accountId: string): Promise<Stripe.Account> {
  try {
    console.log(`🔄 Requesting transfers capability for account: ${accountId}`);
    
    const account = await stripe.accounts.update(accountId, {
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    
    console.log(`✅ Updated capabilities for ${accountId}:`, {
      transfers: account.capabilities?.transfers,
      card_payments: account.capabilities?.card_payments,
    });
    
    return account;
  } catch (error: any) {
    console.error(`❌ Error requesting transfers capability for ${accountId}:`, error.message);
    throw error;
  }
}

/**
 * Backfill existing Express accounts with controller configuration
 * REQUIRED for Account Links to work - accounts created before this fix are missing controller config
 * 
 * NOTE: The controller object CANNOT be updated after account creation via accounts.update()
 * Instead, we need to ensure the account has proper capabilities and can generate Account Links
 */
export async function backfillExpressAccountController(accountId: string): Promise<{
  success: boolean;
  accountId: string;
  message: string;
  accountDetails?: any;
}> {
  try {
    console.log(`🔧 Checking Express account configuration: ${accountId}`);
    
    // First, retrieve the account to check its current state
    const account = await stripe.accounts.retrieve(accountId);
    
    console.log(`📊 Account state for ${accountId}:`, {
      type: account.type,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements?.currently_due?.length || 0,
      controller: (account as any).controller,
    });
    
    // Check if this is an Express account
    if (account.type !== 'express') {
      return {
        success: false,
        accountId,
        message: `Account ${accountId} is not an Express account (type: ${account.type})`,
      };
    }
    
    // The controller object cannot be updated after creation, but we can:
    // 1. Ensure capabilities are requested
    // 2. Test if Account Link can be generated
    
    // Update capabilities to ensure they're properly configured
    const updatedAccount = await stripe.accounts.update(accountId, {
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    
    // Try to create an Account Link to verify it works
    try {
      const testAccountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: 'https://cretexchange.com/refresh',
        return_url: 'https://cretexchange.com/return',
        type: 'account_onboarding',
      });
      
      console.log(`✅ Account Link test successful for ${accountId}`);
      
      return {
        success: true,
        accountId,
        message: `Account ${accountId} can generate Account Links successfully`,
        accountDetails: {
          type: updatedAccount.type,
          chargesEnabled: updatedAccount.charges_enabled,
          payoutsEnabled: updatedAccount.payouts_enabled,
          detailsSubmitted: updatedAccount.details_submitted,
          accountLinkGenerated: true,
        },
      };
    } catch (linkError: any) {
      console.error(`❌ Account Link test failed for ${accountId}:`, linkError.message);
      
      // If Account Link fails, the account may need to be recreated
      // Return detailed info about what's wrong
      return {
        success: false,
        accountId,
        message: `Account ${accountId} cannot generate Account Links: ${linkError.message}. This account may need to be recreated with proper controller configuration.`,
        accountDetails: {
          type: updatedAccount.type,
          chargesEnabled: updatedAccount.charges_enabled,
          payoutsEnabled: updatedAccount.payouts_enabled,
          requirements: updatedAccount.requirements,
          error: linkError.message,
        },
      };
    }
  } catch (error: any) {
    console.error(`❌ Error checking Express account ${accountId}:`, error.message);
    return {
      success: false,
      accountId,
      message: `Failed to check account: ${error.message}`,
    };
  }
}

/**
 * Backfill ALL Express accounts in the platform
 * Returns summary of which accounts succeeded/failed
 */
export async function backfillAllExpressAccounts(): Promise<{
  totalProcessed: number;
  successful: number;
  failed: number;
  results: Array<{
    accountId: string;
    success: boolean;
    message: string;
  }>;
}> {
  console.log('🔧 Starting backfill of all Express accounts...');
  
  const results: Array<{ accountId: string; success: boolean; message: string }> = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;
  
  while (hasMore) {
    const response: any = await stripe.accounts.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    
    for (const account of response.data) {
      // Only process Express accounts from our platform
      if (account.type === 'express' && account.metadata?.platform === 'cretexchange') {
        const result = await backfillExpressAccountController(account.id);
        results.push({
          accountId: account.id,
          success: result.success,
          message: result.message,
        });
      }
    }
    
    hasMore = response.has_more;
    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Backfill complete: ${successful} successful, ${failed} failed out of ${results.length} total`);
  
  return {
    totalProcessed: results.length,
    successful,
    failed,
    results,
  };
}

/**
 * Update Connected Account with Complete Verification Information
 * Sends all available user/owner information to Stripe for account verification
 */
export async function updateConnectedAccountWithCompleteInfo(
  accountId: string,
  userInfo: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    dateOfBirth?: string | null; // YYYY-MM-DD format
    ssnLast4?: string | null; // Last 4 digits
    companyName?: string | null;
    businessWebsite?: string | null;
    taxId?: string | null;
  },
  tosAcceptance?: {
    timestamp: number;
    ip: string;
  }
): Promise<Stripe.Account> {
  try {
    console.log(`🔄 Updating Stripe account ${accountId} with complete verification info`);
    
    const accountParams: Stripe.AccountUpdateParams = {
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    };

    // Build individual object with all available info
    const individual: Stripe.AccountUpdateParams.Individual = {};
    if (userInfo.firstName) individual.first_name = userInfo.firstName;
    if (userInfo.lastName) individual.last_name = userInfo.lastName;
    if (userInfo.email) individual.email = userInfo.email;
    if (userInfo.phone) individual.phone = userInfo.phone;
    if (userInfo.dateOfBirth) {
      const [year, month, day] = userInfo.dateOfBirth.split('-');
      individual.dob = {
        year: parseInt(year),
        month: parseInt(month),
        day: parseInt(day),
      };
    }
    if (userInfo.ssnLast4) {
      individual.ssn_last_4 = userInfo.ssnLast4;
    }

    // Build address if we have location info
    if (userInfo.street || userInfo.city || userInfo.state || userInfo.zip) {
      individual.address = {
        line1: userInfo.street || 'N/A',
        city: userInfo.city || 'N/A',
        state: userInfo.state || 'N/A',
        postal_code: userInfo.zip || '00000',
        country: 'US',
      };
    }

    if (Object.keys(individual).length > 0) {
      accountParams.individual = individual;
    }

    // Build company object for owners
    if (userInfo.companyName || userInfo.businessWebsite || userInfo.taxId) {
      accountParams.company = {
        name: userInfo.companyName ?? undefined,
        tax_id: userInfo.taxId ?? undefined,
      };
    }

    // Update business profile with website if provided
    if (userInfo.businessWebsite || userInfo.companyName) {
      accountParams.business_profile = {
        url: userInfo.businessWebsite ?? undefined,
        name: userInfo.companyName ?? undefined,
        mcc: '7542', // Car wash / washout services
        support_email: userInfo.email ?? undefined,
      };
    }

    // NOTE: T&C acceptance is NOT done here for Express accounts
    // Express accounts must use Account Links (createAccountLink) for T&C acceptance
    // Stripe rejects programmatic T&C acceptance with error: 
    // "controller[requirement_collection]=stripe" prevents programmatic acceptance
    // tosAcceptance parameter is kept in function signature but ignored for Express accounts

    const account = await stripe.accounts.update(accountId, accountParams);
    
    console.log(`✅ Updated Stripe account ${accountId} with verification info`);
    return account;
  } catch (error: any) {
    console.error(`❌ Error updating account ${accountId} with verification info:`, error.message);
    throw error;
  }
}

/**
 * Create Account Link for Express account onboarding
 * This allows Express accounts to complete TOS acceptance and external account setup
 * through Stripe's hosted onboarding UI
 * 
 * CRITICAL: Express accounts CANNOT accept TOS programmatically - they MUST use Account Links
 */
export async function createAccountLink(params: {
  accountId: string;
  refreshUrl: string; // URL to redirect if link expires
  returnUrl: string; // URL to redirect after completion
  type?: 'account_onboarding' | 'account_update';
}): Promise<Stripe.AccountLink> {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: params.type || 'account_onboarding',
    });
    
    console.log('✅ Created Account Link for onboarding:', {
      accountId: params.accountId,
      url: accountLink.url,
      expiresAt: accountLink.expires_at,
    });
    
    return accountLink;
  } catch (error: any) {
    console.error('❌ Error creating Account Link:', error.message);
    throw error;
  }
}

/**
 * Create Login Link for Express Dashboard access
 * Allows connected accounts to access their Express Dashboard to manage settings
 */
export async function createLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    
    console.log('✅ Created Login Link for Express Dashboard:', {
      accountId: accountId,
      url: loginLink.url,
    });
    
    return loginLink;
  } catch (error: any) {
    console.error('❌ Error creating Login Link:', error.message);
    throw error;
  }
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

export async function getTreasuryBalance(params: {
  connectedAccountId: string;
  financialAccountId: string;
}): Promise<{ balance: number }> {
  const balance = await getFinancialAccountBalance(params.financialAccountId, params.connectedAccountId);
  return { balance: Math.round(balance * 100) };
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

export async function createACHTransfer(params: {
  connectedAccountId: string;
  financialAccountId: string;
  amount: number;
  currency: string;
  externalBankAccount: {
    accountNumber: string;
    routingNumber: string;
    accountHolderName: string;
  };
  description: string;
}): Promise<{ id: string; transferId: string }> {
  const paymentMethod = await createBankAccountPaymentMethod({
    connectedAccountId: params.connectedAccountId,
    bankAccount: {
      accountNumber: params.externalBankAccount.accountNumber,
      routingNumber: params.externalBankAccount.routingNumber,
      accountHolderName: params.externalBankAccount.accountHolderName,
      accountHolderType: 'individual',
    },
  });

  const transfer = await payoutFromFinancialAccount({
    financialAccountId: params.financialAccountId,
    connectedAccountId: params.connectedAccountId,
    paymentMethodId: paymentMethod.id,
    amount: params.amount,
    description: params.description,
  });

  return { id: transfer.id, transferId: transfer.id };
}

export async function createCustomer(params: {
  userId: string;
  username: string;
  email: string;
}): Promise<Stripe.Customer> {
  return await stripe.customers.create({
    email: params.email,
    name: params.username,
    metadata: {
      userId: params.userId,
      username: params.username,
    },
  });
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
  phone?: string | undefined;
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
        phone_number: params.phone || "",
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

export async function createIssuingCardholder(params: {
  connectedAccountId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  billing: {
    address: {
      line1: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
}): Promise<Stripe.Issuing.Cardholder> {
  return await createCardholder({
    connectedAccountId: params.connectedAccountId,
    name: params.name,
    email: params.email,
    phone: params.phoneNumber,
    billing: params.billing,
  });
}

/**
 * Issue a Debit Card
 * Pricing: Virtual $0.01, Physical $0.30 (2-day shipping)
 */
export async function issueCard(params: {
  connectedAccountId: string;
  cardholderId: string;
  financialAccountId?: string;
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
      financial_account: params.financialAccountId || undefined,
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
    country?: string;
    currency?: string;
  };
}): Promise<Stripe.PaymentMethod> {
  try {
    // For connected accounts, we need to use the Token API first
    const token = await stripe.tokens.create(
      {
        bank_account: {
          country: params.bankAccount.country || 'US',
          currency: params.bankAccount.currency || 'usd',
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

export async function createBankPaymentMethod(params: {
  connectedAccountId: string;
  bankAccount: {
    accountNumber: string;
    routingNumber: string;
    accountHolderName: string;
    accountHolderType: 'individual' | 'company';
    country?: string;
    currency?: string;
  };
}): Promise<Stripe.PaymentMethod> {
  return await createBankAccountPaymentMethod(params);
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
 * Process a washout payment via credit card using Stripe Connect Destination Charges
 * This charges the owner's saved payment method and splits funds to driver + platform
 * 
 * USE CASE: When Treasury wallet funding is disabled (pending Stripe approval)
 * TRANSACTION LABELING: "Washout payment" + metadata for clear categorization
 */
export async function processWashoutPaymentViaCard(params: {
  ownerStripeCustomerId: string; // Platform customer ID for owner
  ownerPaymentMethodId?: string; // Explicit payment method ID (recommended)
  ownerUsername: string;
  driverConnectedAccountId: string; // Driver's Stripe Connect account
  driverUsername: string;
  washoutAmount: number; // in cents - amount driver receives (e.g., 50 = $0.50)
  platformFee: number; // in cents - platform fee (e.g., 500 = $5.00)
  activityId?: string; // Link to specific washout activity
  locationId?: string; // Link to specific location
}): Promise<Stripe.PaymentIntent> {
  try {
    const totalAmount = params.washoutAmount + params.platformFee;

    console.log('💳 Processing washout payment via credit card:', {
      owner: params.ownerUsername,
      driver: params.driverUsername,
      washoutAmount: params.washoutAmount / 100,
      platformFee: params.platformFee / 100,
      totalCharge: totalAmount / 100,
      explicitPaymentMethod: !!params.ownerPaymentMethodId,
    });

    // Build payment intent parameters
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: totalAmount, // Total charged to owner (washout + platform fee)
      currency: 'usd',
      customer: params.ownerStripeCustomerId, // Charge owner's saved card
      transfer_data: {
        destination: params.driverConnectedAccountId, // Driver receives washout amount
      },
      application_fee_amount: params.platformFee, // Platform keeps fee
      description: `Washout payment - Driver: ${params.driverUsername}`,
      statement_descriptor: 'CRETEX WASHOUT', // Shows on card statement
      metadata: {
        transaction_type: 'washout_payment',
        payment_method: 'credit_card',
        owner_username: params.ownerUsername,
        driver_username: params.driverUsername,
        washout_amount: (params.washoutAmount / 100).toFixed(2),
        platform_fee: (params.platformFee / 100).toFixed(2),
        activity_id: params.activityId || '',
        location_id: params.locationId || '',
      },
      confirm: true, // Auto-confirm payment
      off_session: true, // Allow charging without user present (saved card)
    };

    // Explicitly specify payment method if provided (recommended)
    // This is more reliable than relying on customer's default payment method
    if (params.ownerPaymentMethodId) {
      paymentIntentParams.payment_method = params.ownerPaymentMethodId;
    }

    // Create Destination Charge - charges owner's card and splits payment
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    console.log('✅ Processed washout payment via card:', {
      paymentIntentId: paymentIntent.id,
      totalCharged: totalAmount / 100,
      driverReceives: params.washoutAmount / 100,
      platformFee: params.platformFee / 100,
      status: paymentIntent.status,
    });

    return paymentIntent;
  } catch (error: any) {
    console.error('❌ Error processing washout payment via card:', error.message);
    throw new Error(`Failed to process card payment: ${error.message}`);
  }
}

/**
 * Process a washout payment from owner to driver using Stripe Treasury
 * This uses Stripe Connect transfers between financial accounts
 * 
 * USE CASE: When Treasury wallet funding is enabled (after Stripe approval)
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
  platformFee: number; // in cents - $5.00 platform fee
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
  customerId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  try {
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: params.amount,
      currency: 'usd',
      receipt_email: params.customerEmail,
      description: `Membership fee - ${params.username}`, // Clear label
      statement_descriptor_suffix: 'MEMBER', // Shows on card statement (max 22 chars for suffix)
      metadata: {
        transaction_type: 'membership_fee',
        user_id: params.userId,
        username: params.username,
        platform: 'cretexchange',
        ...params.metadata,
      },
    };

    // If customer and payment method are provided, attach them and confirm automatically
    if (params.customerId && params.paymentMethodId) {
      paymentIntentParams.customer = params.customerId;
      paymentIntentParams.payment_method = params.paymentMethodId;
      paymentIntentParams.off_session = true;
      paymentIntentParams.confirm = true;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    console.log('✅ Created Membership Payment Intent (labeled):', {
      paymentIntentId: paymentIntent.id,
      amount: params.amount / 100,
      username: params.username,
      description: 'Membership fee',
      customer: params.customerId,
      paymentMethod: params.paymentMethodId,
      status: paymentIntent.status,
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
      statement_descriptor_suffix: 'LOT FEE', // Shows on card statement (max 22 chars for suffix)
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
 * Create wallet funding payment intent (card payment)
 */
export async function createWalletFundingPayment(params: {
  amount: number; // in cents
  customerId: string;
  paymentMethodId: string;
  userId: string;
  username: string;
  autoConfirm?: boolean; // Optional - set to false to allow 3DS on frontend
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      confirm: params.autoConfirm !== undefined ? params.autoConfirm : true,
      off_session: false, // Customer present for wallet funding
      description: `Wallet funding - ${params.username}`,
      statement_descriptor: 'CRETEX WALLET',
      metadata: {
        transaction_type: 'wallet_funding',
        user_id: params.userId,
        username: params.username,
        platform: 'cretexchange',
        funding_method: 'card',
        ...params.metadata,
      },
    });

    console.log('✅ Created Wallet Funding Payment (labeled):', {
      paymentIntentId: paymentIntent.id,
      amount: params.amount / 100,
      username: params.username,
      status: paymentIntent.status,
      description: 'Wallet funding via card',
    });

    return paymentIntent;
  } catch (error: any) {
    console.error('❌ Error creating wallet funding payment:', error.message);
    throw new Error(`Failed to fund wallet: ${error.message}`);
  }
}

/**
 * Create Financial Connections Session for instant ACH verification
 * STANDARDIZED for both drivers (payouts) and owners (wallet funding)
 * 
 * Use Cases:
 * - Drivers: Bank account for receiving payout transfers
 * - Owners: Bank account for ACH wallet funding
 * 
 * Cost: $1.50 per successful bank link
 */
export async function createFinancialConnectionsSession(params: {
  userType: 'driver' | 'owner';
  connectedAccountId?: string | null; // Required for drivers (Connect account)
  customerId?: string | null; // Required for owners (Customer)
  returnUrl: string;
}): Promise<Stripe.FinancialConnections.Session> {
  try {
    // Determine account holder type based on user type
    const accountHolder = params.userType === 'driver' 
      ? { type: 'account' as const, account: params.connectedAccountId! }
      : { type: 'customer' as const, customer: params.customerId! };

    const session = await stripe.financialConnections.sessions.create({
      account_holder: accountHolder,
      permissions: ['payment_method', 'balances', 'ownership'], // payment_method enables ACH
      filters: {
        countries: ['US'], // US banks only
      },
      return_url: params.returnUrl,
    });

  console.log('✅ Created Financial Connections Session:', {
    sessionId: session.id,
    userType: params.userType,
    clientSecretConfigured: !!session.client_secret,
  });

    return session;
  } catch (error: any) {
    console.error('❌ Error creating Financial Connections session:', error.message);
    throw new Error(`Failed to create bank linking session: ${error.message}`);
  }
}

/**
 * Retrieve payment method from Financial Connections session (for OWNERS - wallet funding)
 * This gets the ACH payment method after user completes bank linking
 */
export async function getFinancialConnectionsPaymentMethod(
  sessionId: string
): Promise<Stripe.PaymentMethod | null> {
  try {
    const session = await stripe.financialConnections.sessions.retrieve(sessionId);
    
    if (!session.accounts || session.accounts.data.length === 0) {
      console.log('⚠️  No accounts linked in session:', sessionId);
      return null;
    }

    const account = session.accounts.data[0];
    
    // Create payment method from the linked account
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'us_bank_account',
      us_bank_account: {
        financial_connections_account: account.id,
      },
    });

    console.log('✅ Created payment method from Financial Connections:', {
      paymentMethodId: paymentMethod.id,
      accountId: account.id,
      last4: (paymentMethod.us_bank_account as any)?.last4,
      bankName: (paymentMethod.us_bank_account as any)?.bank_name,
    });

    return paymentMethod;
  } catch (error: any) {
    console.error('❌ Error retrieving Financial Connections payment method:', error.message);
    return null;
  }
}

/**
 * Create external account for driver payouts from Financial Connections (for DRIVERS)
 * This links the verified bank account to the driver's Connect account for receiving payouts
 */
export async function createExternalAccountFromFinancialConnections(params: {
  sessionId: string;
  connectedAccountId: string;
}): Promise<{ success: boolean; bankName?: string; last4?: string; error?: string }> {
  try {
    console.log('🔍 Attempting to retrieve Financial Connections session:', params.sessionId);
    
    const session: any = await stripe.financialConnections.sessions.retrieve(params.sessionId);
    
    console.log('📋 Financial Connections session retrieved:', {
      sessionId: params.sessionId,
      status: session.status,
      accounts: session.accounts ? {
        object: session.accounts.object,
        dataLength: session.accounts.data.length,
        hasMore: session.accounts.has_more,
      } : 'null',
      fullSessionDebug: JSON.stringify(session, null, 2),
    });

    // Check if session is completed - user must have finished the flow
    if (!session.status || session.status !== 'completed') {
      console.warn(`⚠️  Session not completed. Status: ${session.status}. This usually means:`, {
        reason1: 'User cancelled the Financial Connections flow',
        reason2: 'User did not select a bank or complete authentication',
        reason3: 'Session expired or was invalid',
      });
      console.warn('Full session for debugging:', JSON.stringify(session, null, 2));
      return { 
        success: false, 
        error: `Financial Connections flow not completed. Status: ${session.status || 'undefined'}. Please try again or use manual bank entry as alternative.` 
      };
    }

    if (!session.accounts || session.accounts.data.length === 0) {
      console.warn('⚠️  No accounts found in completed session. Full session:', JSON.stringify(session, null, 2));
      return { success: false, error: 'No bank account linked in completed session' };
    }

    const linkedAccount = session.accounts.data[0];
    console.log('🏦 Linked account details:', {
      accountId: linkedAccount.id,
      displayName: (linkedAccount as any).display_name,
      status: linkedAccount.status,
      accountNumberAvailable: !!(linkedAccount as any).account_number,
      routingNumberAvailable: !!(linkedAccount as any).routing_number,
      rawAccount: JSON.stringify(linkedAccount),
    });

    // Create payment method from the Financial Connections account
    // This extracts the actual bank account details we need
    // Stripe requires billing_details with account holder name
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'us_bank_account',
      us_bank_account: {
        financial_connections_account: linkedAccount.id,
      },
      billing_details: {
        name: (linkedAccount as any).display_name || 'Account Holder',
        // Add any other required billing details if available
      },
    });

    const usBankAccount = paymentMethod.us_bank_account as any;
    const bankName = usBankAccount?.bank_name || 'Bank Account';
    const last4 = usBankAccount?.last4;
    const accountNumber = usBankAccount?.account_number;
    const routingNumber = usBankAccount?.routing_number;

    console.log('💳 Payment method created:', {
      paymentMethodId: paymentMethod.id,
      bankName,
      last4,
      accountNumber: accountNumber ? `****${accountNumber.slice(-4)}` : 'N/A',
      routingNumber: routingNumber ? `****${routingNumber.slice(-4)}` : 'N/A',
    });

    if (!accountNumber || !routingNumber) {
      console.warn('⚠️  Missing account or routing number in payment method:', {
        hasAccountNumber: !!accountNumber,
        hasRoutingNumber: !!routingNumber,
        bankName,
        last4,
      });
      return { success: false, error: 'Bank account details incomplete - missing account or routing number' };
    }

    // Create external account on the Connect account for payouts
    const externalAccount = await stripe.accounts.createExternalAccount(
      params.connectedAccountId,
      {
        external_account: {
          object: 'bank_account',
          country: 'US',
          currency: 'usd',
          account_number: accountNumber,
          routing_number: routingNumber,
          account_holder_type: 'individual',
        },
      }
    );

    console.log('✅ Created external account for driver payouts:', {
      connectedAccountId: params.connectedAccountId,
      bankAccountId: externalAccount.id,
      bankName,
      last4,
    });

    return {
      success: true,
      bankName,
      last4,
    };
  } catch (error: any) {
    console.error('❌ Error creating external account from Financial Connections:', error.message);
    console.error('Full error:', error);
    return { success: false, error: error.message };
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

/**
 * Create a Stripe Verification Session for identity document collection
 * This is required for fraud prevention - Stripe needs government-issued ID
 */
export async function createIdentityVerificationSession(
  connectedAccountId: string,
  documentType: 'drivers_license' | 'passport' | 'state_id' = 'drivers_license'
): Promise<{ session_id: string; url: string }> {
  try {
    console.log(`🔐 Creating Stripe identity verification session for ${connectedAccountId}`);
    
    // Note: Identity.VerificationSession is not fully typed in the Stripe SDK
    // We'll use the raw request method
    const session = await (stripe as any).identity.verificationSessions.create({
      type: 'id_number',
      metadata: {
        connected_account: connectedAccountId,
        document_type: documentType,
      },
    }) as any;
    
    console.log(`✅ Created verification session:`, {
      sessionId: session.id,
      status: session.status,
    });
    
    return {
      session_id: session.id,
      url: session.url || '',
    };
  } catch (error: any) {
    console.error(`❌ Error creating verification session for ${connectedAccountId}:`, error.message);
    throw error;
  }
}

/**
 * Update Connected Account with Identity Document Verification
 * Links a verified identity document to the account for fraud prevention
 */
export async function updateAccountWithIdentityDocument(
  connectedAccountId: string,
  verificationSessionId: string,
  documentType: string
): Promise<Stripe.Account> {
  try {
    console.log(`📄 Linking identity document to account ${connectedAccountId}`);
    
    const account = await stripe.accounts.update(connectedAccountId, {
      individual: {
        verification: {
          document: {
            front: verificationSessionId, // Use verification session ID as reference
          } as any,
        } as any,
      } as any,
    } as any);
    
    console.log(`✅ Account updated with identity verification`);
    return account;
  } catch (error: any) {
    console.error(`❌ Error updating account with identity document:`, error.message);
    throw error;
  }
}

export default stripe;
