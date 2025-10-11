/**
 * Lithic Card Issuing Service
 * 
 * This service provides integration with Lithic's card issuing platform for instant debit card access.
 * Lithic offers a processor-only model that works seamlessly with Column's banking infrastructure.
 * 
 * Documentation: https://docs.lithic.com
 * 
 * ============================================================================
 * COLUMN-LITHIC INTEGRATION ARCHITECTURE
 * ============================================================================
 * 
 * CURRENT STATE (Sandbox):
 * - Virtual cards created without account enrollment
 * - Column bank account ID passed as account_token but not validated
 * - Cards work in Lithic sandbox for testing UI/UX flows
 * - NOT connected to actual Column wallet funds
 * 
 * PRODUCTION REQUIREMENTS:
 * 
 * Option 1: Lithic Financial Accounts (Recommended)
 * --------------------------------------------------
 * 1. Create Lithic Account Holder when driver completes Column onboarding:
 *    - Use driver's KYC data (name, DOB, SSN, address) already collected for Column
 *    - POST /account_holders with individual type
 *    - Receive account_holder_token
 * 
 * 2. Create Lithic Financial Account linked to Column:
 *    - POST /financial_accounts with account_holder_token
 *    - Link to Column using routing_number and account_number from Column API
 *    - Lithic will validate the Column account exists
 *    - Receive financial_account_token
 * 
 * 3. Issue card against Lithic Financial Account:
 *    - POST /cards with financial_account_token
 *    - Card transactions will pull funds from linked Column account
 *    - Real-time balance checks against Column wallet
 * 
 * Option 2: Direct Bank Account Linking
 * --------------------------------------
 * 1. Configure Lithic to recognize Column's BIN/routing structure
 * 2. Use Column bank account ID as Lithic account_token
 * 3. Requires partnership agreement between Column and Lithic
 * 4. May need custom integration work
 * 
 * SETUP INSTRUCTIONS FOR PRODUCTION:
 * 1. Sign up for Lithic production account at https://lithic.com
 * 2. Get production API key from Lithic dashboard
 * 3. Add LITHIC_API_KEY to Replit Secrets (production key)
 * 4. Update LITHIC_BASE_URL to production endpoint
 * 5. Configure product_id for physical card issuance
 * 6. Implement account holder enrollment flow (Option 1 recommended)
 * 7. Set up Lithic webhooks for card status updates
 * 8. Test with Column test accounts before going live
 * 
 * SECURITY NOTES:
 * - Never log card numbers or CVV
 * - Use Lithic's tokenization for sensitive card data
 * - Implement card controls (spending limits, merchant categories)
 * - Monitor for fraudulent transactions
 */

// Lithic API configuration
const LITHIC_API_KEY = process.env.LITHIC_API_KEY;
const LITHIC_BASE_URL = process.env.LITHIC_BASE_URL || 'https://sandbox.lithic.com/v1'; // Defaults to sandbox if not set
const LITHIC_CARD_PROGRAM_TOKEN = process.env.LITHIC_CARD_PROGRAM_TOKEN; // Column BIN linkage (production only)

interface LithicCardRequest {
  financialAccountToken: string; // Lithic Financial Account Token (auto-created with account holder)
  shipping: {
    firstName: string;
    lastName: string;
    address: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  cardType: 'physical' | 'virtual';
}

interface LithicCard {
  token: string; // Lithic card token
  last4: string;
  expirationMonth: string;
  expirationYear: string;
  state: 'PENDING' | 'OPEN' | 'PAUSED' | 'CLOSED';
  type: 'PHYSICAL' | 'VIRTUAL';
  created: string;
}

/**
 * Create a new debit card via Lithic
 * 
 * This will:
 * 1. Create the card in Lithic's system
 * 2. Link it to the Column bank account
 * 3. Return card details for storage
 */
export async function createDebitCard(request: LithicCardRequest): Promise<LithicCard> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured. Add LITHIC_API_KEY to Replit Secrets.');
  }

  // Build card creation payload
  const cardPayload: any = {
    type: request.cardType.toUpperCase(),
    // Link card to Lithic Financial Account (auto-created with account holder)
    account_token: request.financialAccountToken
  };

  // Add card_program_token if available (links to Column's BIN in production)
  // This token is provided by Lithic after Column BIN sponsorship is approved
  // Sandbox mode: optional (uses Lithic's test BIN)
  // Production mode: required (links to Column's dedicated BIN)
  if (LITHIC_CARD_PROGRAM_TOKEN) {
    cardPayload.card_program_token = LITHIC_CARD_PROGRAM_TOKEN;
    console.log('✅ Using card program token for Column BIN linkage');
  } else {
    console.log('⚠️  No card program token - using Lithic sandbox BIN (cards won\'t access Column funds)');
  }

  // Only add shipping info for physical cards
  if (request.cardType.toUpperCase() === 'PHYSICAL') {
    cardPayload.shipping_address = {
      first_name: request.shipping.firstName,
      last_name: request.shipping.lastName,
      address1: request.shipping.address.street,
      city: request.shipping.address.city,
      state: request.shipping.address.state,
      postal_code: request.shipping.address.zip,
      country: 'USA'
    };
    cardPayload.shipping_method = 'STANDARD';
    
    // Add product_id for physical cards (required in production)
    // This must be configured in Lithic dashboard after ordering card inventory
    const LITHIC_PRODUCT_ID = process.env.LITHIC_PRODUCT_ID;
    if (LITHIC_PRODUCT_ID) {
      cardPayload.product_id = LITHIC_PRODUCT_ID;
    }
  }

  // Log request for debugging, but redact sensitive tokens
  const redactedPayload = {
    ...cardPayload,
    account_token: cardPayload.account_token ? '[REDACTED]' : undefined,
    card_program_token: cardPayload.card_program_token ? '[REDACTED]' : undefined
  };
  
  console.log('🔍 Lithic Card Creation Request:', {
    url: `${LITHIC_BASE_URL}/cards`,
    payload: JSON.stringify(redactedPayload, null, 2)
  });

  const response = await fetch(`${LITHIC_BASE_URL}/cards`, {
    method: 'POST',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cardPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }

  const card = await response.json();
  
  return {
    token: card.token,
    last4: card.last_four,
    expirationMonth: card.exp_month,
    expirationYear: card.exp_year,
    state: card.state,
    type: card.type,
    created: card.created
  };
}

/**
 * Get card details from Lithic
 */
export async function getCard(cardToken: string): Promise<LithicCard> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const response = await fetch(`${LITHIC_BASE_URL}/cards/${cardToken}`, {
    method: 'GET',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }

  const card = await response.json();
  
  return {
    token: card.token,
    last4: card.last_four,
    expirationMonth: card.exp_month,
    expirationYear: card.exp_year,
    state: card.state,
    type: card.type,
    created: card.created
  };
}

/**
 * Activate a physical card (required after delivery)
 */
export async function activateCard(cardToken: string): Promise<void> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const response = await fetch(`${LITHIC_BASE_URL}/cards/${cardToken}`, {
    method: 'PATCH',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state: 'OPEN'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }
}

/**
 * Pause/unpause a card
 */
export async function updateCardStatus(cardToken: string, state: 'OPEN' | 'PAUSED'): Promise<void> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const response = await fetch(`${LITHIC_BASE_URL}/cards/${cardToken}`, {
    method: 'PATCH',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }
}

/**
 * Close a card (cannot be reopened)
 */
export async function closeCard(cardToken: string): Promise<void> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const response = await fetch(`${LITHIC_BASE_URL}/cards/${cardToken}`, {
    method: 'PATCH',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state: 'CLOSED'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }
}

/**
 * Create Account Holder in Lithic
 * 
 * This enrolls a driver as an account holder in Lithic using their KYC data
 * from Column onboarding. Required before creating financial accounts.
 */
export async function createAccountHolder(data: {
  firstName: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  ssn: string;
  email: string;
  phoneNumber: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}): Promise<{ token: string }> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  // Use KYC_ADVANCED workflow for individual account holders
  // Fields must be nested under 'individual' object
  const payload = {
    workflow: 'KYC_ADVANCED',
    tos_timestamp: new Date().toISOString(),
    individual: {
      first_name: data.firstName,
      last_name: data.lastName,
      dob: data.dob,
      government_id: data.ssn,
      phone_number: data.phoneNumber,
      email: data.email,
      address: {
        address1: data.address.street,
        city: data.address.city,
        state: data.address.state,
        postal_code: data.address.zip,
        country: 'USA'
      }
    }
  };

  // Log request for debugging, but redact sensitive PII
  const redactedPayload = {
    ...payload,
    individual: {
      ...payload.individual,
      government_id: '[REDACTED]',
      phone_number: '[REDACTED]',
      email: '[REDACTED]'
    }
  };
  
  console.log('🔍 Lithic Account Holder Creation:', {
    url: `${LITHIC_BASE_URL}/account_holders`,
    workflow: payload.workflow,
    firstName: data.firstName,
    lastName: data.lastName
  });

  const response = await fetch(`${LITHIC_BASE_URL}/account_holders`, {
    method: 'POST',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic account holder creation failed: ${errorMessage}`);
  }

  const result = await response.json();
  // Log response status only, don't expose tokens
  console.log('✅ Lithic Account Holder Created:', {
    status: result.status,
    hasToken: !!result.token,
    hasAccountToken: !!result.account_token
  });
  
  return { 
    token: result.token,
    accountToken: result.account_token // Financial account auto-created with account holder
  };
}

/**
 * Get Account Holder details from Lithic
 */
export async function getAccountHolder(accountHolderToken: string): Promise<any> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const response = await fetch(`${LITHIC_BASE_URL}/account_holders/${accountHolderToken}`, {
    method: 'GET',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }

  return await response.json();
}

/**
 * Create Financial Account in Lithic
 * 
 * This links a Lithic account holder to their Column bank account.
 * Lithic will validate the account exists and belongs to the account holder.
 */
export async function createFinancialAccount(data: {
  accountHolderToken: string;
  columnAccountNumber: string;
  columnRoutingNumber: string;
  ownerName: string;
}): Promise<{ token: string }> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const payload = {
    account_holder_token: data.accountHolderToken,
    type: 'OPERATING',
    bank_account: {
      account_number: data.columnAccountNumber,
      routing_number: data.columnRoutingNumber,
      account_type: 'CHECKING',
      owner_name: data.ownerName
    }
  };

  const response = await fetch(`${LITHIC_BASE_URL}/financial_accounts`, {
    method: 'POST',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic financial account creation failed: ${errorMessage}`);
  }

  const result = await response.json();
  return { token: result.token };
}

/**
 * Get Financial Account details from Lithic
 */
export async function getFinancialAccount(financialAccountToken: string): Promise<any> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  const response = await fetch(`${LITHIC_BASE_URL}/financial_accounts/${financialAccountToken}`, {
    method: 'GET',
    headers: {
      'Authorization': LITHIC_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = response.statusText;
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.message || error.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Lithic API error: ${errorMessage}`);
  }

  return await response.json();
}

export default {
  createDebitCard,
  getCard,
  activateCard,
  updateCardStatus,
  closeCard,
  createAccountHolder,
  getAccountHolder,
  createFinancialAccount,
  getFinancialAccount,
};
