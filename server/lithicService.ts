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
const LITHIC_BASE_URL = 'https://sandbox.lithic.com/v1'; // Using sandbox for testing

interface LithicCardRequest {
  financialAccountToken: string; // Lithic Financial Account Token (linked to Column bank account)
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
    // Link card to Lithic Financial Account (connected to Column bank account)
    // This enables real fund access in production
    financial_account_token: request.financialAccountToken
  };

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
  }

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

  const payload = {
    workflow: 'KYC_EXEMPT',
    kyc_exemption_type: 'AUTHORIZED_USER',
    tos_timestamp: new Date().toISOString(),
    first_name: data.firstName,
    last_name: data.lastName,
    dob: data.dob,
    ssn: data.ssn,
    phone_number: data.phoneNumber,
    email: data.email,
    address: {
      address1: data.address.street,
      city: data.address.city,
      state: data.address.state,
      postal_code: data.address.zip,
      country: 'USA'
    }
  };

  console.log('🔍 Lithic API Request:', {
    url: `${LITHIC_BASE_URL}/account_holders`,
    payload: JSON.stringify(payload, null, 2)
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
  return { token: result.token };
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
