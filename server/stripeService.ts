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
 *    - Pricing: $0.10 virtual, $3 physical (2-day shipping)
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
  email: string;
  username: string; // Unique username for account identification
  type: 'custom'; // Using custom for full control
  userId?: string; // User ID for metadata tracking (prevents duplicates)
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
 */
export async function createConnectedAccount(params: CreateConnectedAccountParams): Promise<Stripe.Account> {
  try {
    const accountParams: Stripe.AccountCreateParams = {
      type: params.type,
      country: 'US', // Required for custom accounts
      email: params.email, // Email for notifications
      capabilities: {
        transfers: { requested: true }, // Enable payouts
      },
      business_type: params.businessType || 'individual',
      business_profile: {
        url: 'https://cretexchange.com', // Platform URL
        support_email: params.email, // Support email required for custom accounts
        name: params.username, // Use username as display name in Stripe dashboard
      },
      metadata: params.userId ? {
        user_id: params.userId, // Track user ID to prevent duplicates
        username: params.username, // Track username for easy identification
        platform: 'cretexchange',
      } : {
        username: params.username, // Track username even without userId
        platform: 'cretexchange',
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
    
    console.log('✅ Created Stripe Connected Account:', {
      accountId: account.id,
      email: params.email,
      type: params.businessType,
    });

    return account;
  } catch (error: any) {
    console.error('❌ Error creating Stripe Connected Account:', error.message);
    throw new Error(`Failed to create connected account: ${error.message}`);
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
 * Returns the first matching account or null if none found
 */
export async function findConnectedAccountByUserId(userId: string): Promise<Stripe.Account | null> {
  try {
    // List all accounts and filter by metadata
    // Note: Stripe doesn't support metadata filtering in API, so we fetch and filter locally
    const accounts = await stripe.accounts.list({ limit: 100 });
    
    const matchingAccount = accounts.data.find(
      (account) => account.metadata?.user_id === userId
    );
    
    return matchingAccount || null;
  } catch (error: any) {
    console.error('Error finding connected account by user ID:', error.message);
    return null;
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
 */
export async function fundFinancialAccountACH(params: {
  financialAccountId: string;
  connectedAccountId: string;
  paymentMethodId: string; // Stripe Payment Method (external bank account)
  amount: number; // in cents
  description: string;
}): Promise<Stripe.Treasury.InboundTransfer> {
  try {
    const inboundTransfer = await stripe.treasury.inboundTransfers.create(
      {
        financial_account: params.financialAccountId,
        amount: params.amount,
        currency: 'usd',
        origin_payment_method: params.paymentMethodId,
        description: params.description,
      },
      {
        stripeAccount: params.connectedAccountId,
      }
    );

    console.log('✅ Created ACH Inbound Transfer:', {
      transferId: inboundTransfer.id,
      amount: params.amount / 100,
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
 */
export async function transferBetweenFinancialAccounts(params: {
  sourceFinancialAccountId: string;
  sourceConnectedAccountId: string;
  destinationFinancialAccountId: string;
  amount: number; // in cents
  description: string;
}): Promise<Stripe.Treasury.OutboundTransfer> {
  try {
    const outboundTransfer = await stripe.treasury.outboundTransfers.create(
      {
        financial_account: params.sourceFinancialAccountId,
        destination_payment_method: params.destinationFinancialAccountId,
        amount: params.amount,
        currency: 'usd',
        description: params.description,
      },
      {
        stripeAccount: params.sourceConnectedAccountId,
      }
    );

    console.log('✅ Created Internal Transfer:', {
      transferId: outboundTransfer.id,
      amount: params.amount / 100,
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
 * Pricing: Virtual $0.10, Physical $3 (2-day shipping)
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
      cost: params.cardType === 'virtual' ? '$0.10' : '$3.00',
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
 */
export async function processWashoutPayment(params: {
  ownerConnectedAccountId: string;
  ownerFinancialAccountId: string;
  driverConnectedAccountId: string;
  driverFinancialAccountId: string;
  washoutAmount: number; // in cents - amount driver receives
  platformFee: number; // in cents - $4.00 platform fee
  description: string;
}): Promise<{
  transfer: Stripe.Treasury.OutboundTransfer;
  platformFeeTransfer: Stripe.Treasury.OutboundTransfer;
}> {
  try {
    // 1. Transfer washout payment from owner to driver
    const transfer = await transferBetweenFinancialAccounts({
      sourceFinancialAccountId: params.ownerFinancialAccountId,
      sourceConnectedAccountId: params.ownerConnectedAccountId,
      destinationFinancialAccountId: params.driverFinancialAccountId,
      amount: params.washoutAmount,
      description: params.description,
    });

    // 2. Collect platform fee from owner to platform account
    // Note: Platform fees are typically collected via application_fee on charges
    // or via separate transfers. For Treasury-to-Treasury transfers, we use a separate outbound transfer
    const platformFeeTransfer = await stripe.treasury.outboundTransfers.create(
      {
        financial_account: params.ownerFinancialAccountId,
        destination_payment_method: 'platform', // This would be the platform's receiving method
        amount: params.platformFee,
        currency: 'usd',
        description: `Platform fee - ${params.description}`,
      },
      {
        stripeAccount: params.ownerConnectedAccountId,
      }
    );

    console.log('✅ Processed Washout Payment:', {
      washoutAmount: params.washoutAmount / 100,
      platformFee: params.platformFee / 100,
      totalDeducted: (params.washoutAmount + params.platformFee) / 100,
    });

    return { transfer, platformFeeTransfer };
  } catch (error: any) {
    console.error('❌ Error processing washout payment:', error.message);
    throw new Error(`Failed to process payment: ${error.message}`);
  }
}

export default stripe;
