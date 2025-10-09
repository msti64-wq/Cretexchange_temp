/**
 * Lithic Card Issuing Service
 * 
 * This service provides integration with Lithic's card issuing platform for instant debit card access.
 * Lithic offers a processor-only model that works seamlessly with Column's banking infrastructure.
 * 
 * Documentation: https://docs.lithic.com
 * 
 * SETUP INSTRUCTIONS:
 * 1. Sign up for Lithic at https://lithic.com
 * 2. Get your API key from the Lithic dashboard
 * 3. Add LITHIC_API_KEY to your Replit Secrets
 * 4. Uncomment the implementation below
 */

// Lithic API configuration
const LITHIC_API_KEY = process.env.LITHIC_API_KEY;
const LITHIC_BASE_URL = process.env.LITHIC_BASE_URL || 'https://api.lithic.com/v1';

interface LithicCardRequest {
  accountId: string; // Column bank account ID
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

  // TODO: Implement Lithic API integration
  // Example implementation:
  /*
  const response = await fetch(`${LITHIC_BASE_URL}/cards`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LITHIC_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: request.cardType.toUpperCase(),
      account_token: request.accountId,
      shipping_address: {
        first_name: request.shipping.firstName,
        last_name: request.shipping.lastName,
        line1: request.shipping.address.street,
        city: request.shipping.address.city,
        state: request.shipping.address.state,
        postal_code: request.shipping.address.zip,
        country: 'USA'
      },
      shipping_method: 'STANDARD'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Lithic API error: ${error.message || response.statusText}`);
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
  */

  // Placeholder response for development
  throw new Error('Lithic integration not yet implemented. Please add Lithic API key and uncomment the implementation above.');
}

/**
 * Get card details from Lithic
 */
export async function getCard(cardToken: string): Promise<LithicCard> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Activate a physical card (required after delivery)
 */
export async function activateCard(cardToken: string): Promise<void> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  // TODO: Implement card activation via Lithic API
  throw new Error('Not implemented');
}

/**
 * Pause/unpause a card
 */
export async function updateCardStatus(cardToken: string, state: 'OPEN' | 'PAUSED'): Promise<void> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  // TODO: Implement
  throw new Error('Not implemented');
}

/**
 * Close a card (cannot be reopened)
 */
export async function closeCard(cardToken: string): Promise<void> {
  if (!LITHIC_API_KEY) {
    throw new Error('Lithic API key not configured');
  }

  // TODO: Implement
  throw new Error('Not implemented');
}

export default {
  createDebitCard,
  getCard,
  activateCard,
  updateCardStatus,
  closeCard,
};
