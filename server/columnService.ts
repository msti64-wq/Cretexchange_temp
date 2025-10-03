import axios, { AxiosInstance } from 'axios';

interface ColumnConfig {
  apiKey: string;
  baseURL?: string;
}

interface CreatePersonEntityParams {
  firstName: string;
  lastName: string;
  ssn: string;
  dateOfBirth: string; // YYYY-MM-DD format
  email: string;
  address: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;
  };
}

interface CreateBankAccountParams {
  entityId: string;
  description: string;
}

interface CreateCounterpartyParams {
  accountNumber: string;
  routingNumber: string;
  name?: string;
}

interface CreateACHTransferParams {
  counterpartyId: string;
  bankAccountId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number; // in cents
  currencyCode: string;
  description: string;
  entryClassCode?: string; // Default: 'WEB' for internet-initiated consumer transactions
  receiverName: string; // Name of the receiver (max 22 characters)
}

interface CreateBookTransferParams {
  sourceAccountNumberId: string;
  destinationAccountNumberId: string;
  amount: number; // in cents
  currencyCode: string;
  description: string;
  idempotencyKey: string;
}

interface SimulateReceiveWireParams {
  destinationAccountNumberId: string;
  amount: number; // in cents
  currencyCode: string;
}

export class ColumnService {
  private client: AxiosInstance;

  constructor(config: ColumnConfig) {
    this.client = axios.create({
      baseURL: config.baseURL || 'https://api.column.com',
      auth: {
        username: '',
        password: config.apiKey,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  private logError(message: string, error: any) {
    // Only log safe error info - no PII from request config or response data
    const safeError = {
      message: error?.message,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
    };
    console.error(message, safeError);
  }

  async createPersonEntity(params: CreatePersonEntityParams) {
    try {
      const formData = new URLSearchParams();
      formData.append('first_name', params.firstName);
      formData.append('last_name', params.lastName);
      formData.append('ssn', params.ssn);
      formData.append('date_of_birth', params.dateOfBirth);
      formData.append('email', params.email);
      formData.append('address[line_1]', params.address.line1);
      formData.append('address[city]', params.address.city);
      formData.append('address[state]', params.address.state);
      formData.append('address[postal_code]', params.address.postalCode);
      formData.append('address[country_code]', params.address.countryCode);

      const response = await this.client.post('/entities/person', formData);
      return response.data;
    } catch (error) {
      this.logError('Error creating Column person entity:', error);
      throw error;
    }
  }

  async createBankAccount(params: CreateBankAccountParams) {
    try {
      const formData = new URLSearchParams();
      formData.append('entity_id', params.entityId);
      formData.append('description', params.description);

      const response = await this.client.post('/bank-accounts', formData);
      return response.data;
    } catch (error) {
      this.logError('Error creating Column bank account:', error);
      throw error;
    }
  }

  async getBankAccount(bankAccountId: string) {
    try {
      const response = await this.client.get(`/bank-accounts/${bankAccountId}`);
      return response.data;
    } catch (error) {
      this.logError('Error fetching Column bank account:', error);
      throw error;
    }
  }

  async createCounterparty(params: CreateCounterpartyParams) {
    try {
      const formData = new URLSearchParams();
      formData.append('account_number', params.accountNumber);
      formData.append('routing_number', params.routingNumber);
      if (params.name) {
        formData.append('name', params.name);
      }

      const response = await this.client.post('/counterparties', formData);
      return response.data;
    } catch (error) {
      this.logError('Error creating Column counterparty:', error);
      throw error;
    }
  }

  async createACHTransfer(params: CreateACHTransferParams) {
    try {
      const formData = new URLSearchParams();
      formData.append('counterparty_id', params.counterpartyId);
      formData.append('bank_account_id', params.bankAccountId);
      formData.append('type', params.type);
      formData.append('amount', params.amount.toString());
      formData.append('currency_code', params.currencyCode);
      formData.append('description', params.description);
      // Entry class code: WEB for internet-initiated consumer transactions
      formData.append('entry_class_code', params.entryClassCode || 'WEB');
      // Receiver name (max 22 characters)
      formData.append('receiver_name', params.receiverName.substring(0, 22));
      // Receiver ID (max 15 characters) - required for WEB entry class code
      // Use last 15 chars of counterparty ID as unique identifier
      formData.append('receiver_id', params.counterpartyId.substring(0, 15));

      const response = await this.client.post('/transfers/ach', formData);
      return response.data;
    } catch (error: any) {
      this.logError('Error creating Column ACH transfer:', error);
      // Log the full error response for debugging
      if (error.response?.data) {
        console.error('❌ ACH transfer failed:', error.message, error.response.data);
      }
      throw error;
    }
  }

  async createBookTransfer(params: CreateBookTransferParams) {
    try {
      const formData = new URLSearchParams();
      formData.append('source_account_number_id', params.sourceAccountNumberId);
      formData.append('destination_account_number_id', params.destinationAccountNumberId);
      formData.append('amount', params.amount.toString());
      formData.append('currency_code', params.currencyCode);
      formData.append('description', params.description);
      formData.append('idempotency_key', params.idempotencyKey);

      const response = await this.client.post('/transfers/book', formData);
      return response.data;
    } catch (error: any) {
      this.logError('Error creating Column book transfer:', error);
      if (error.response?.data) {
        console.error('❌ Book transfer failed:', error.message, error.response.data);
      }
      throw error;
    }
  }

  async simulateReceiveWire(params: SimulateReceiveWireParams) {
    try {
      const formData = new URLSearchParams();
      formData.append('destination_account_number_id', params.destinationAccountNumberId);
      formData.append('amount', params.amount.toString());
      formData.append('currency_code', params.currencyCode);

      const response = await this.client.post('/simulate/receive-wire', formData);
      return response.data;
    } catch (error) {
      this.logError('Error simulating Column wire receipt:', error);
      throw error;
    }
  }

  async settleACHTransfer(transferId: string) {
    try {
      const formData = new URLSearchParams();
      formData.append('transfer_id', transferId);

      const response = await this.client.post('/simulate/settle-ach-transfer', formData);
      return response.data;
    } catch (error) {
      this.logError('Error settling Column ACH transfer:', error);
      throw error;
    }
  }
}

const columnApiKey = process.env.COLUMN_API_KEY;
if (!columnApiKey) {
  throw new Error('COLUMN_API_KEY environment variable is required');
}

// Always use production API endpoint - sandbox not accessible from Replit
// Test credentials work with production endpoint
const columnBaseURL = 'https://api.column.com';

console.log('🔧 Column Service Configuration:', {
  apiKeyPrefix: columnApiKey?.substring(0, 10) + '...',
  baseURL: columnBaseURL,
  environment: process.env.NODE_ENV,
  note: 'Using production endpoint - sandbox not accessible from Replit'
});

export const columnService = new ColumnService({
  apiKey: columnApiKey,
  baseURL: columnBaseURL,
});

// Platform operating account credentials
export const platformConfig = {
  entityId: process.env.COLUMN_PLATFORM_ENTITY_ID || '',
  accountId: process.env.COLUMN_PLATFORM_ACCOUNT_ID || '',
  routingNumber: process.env.COLUMN_PLATFORM_ROUTING || '',
  accountNumber: process.env.COLUMN_PLATFORM_ACCOUNT_NUMBER || '',
};

// Validate platform config is complete
if (!platformConfig.entityId || !platformConfig.accountId || !platformConfig.routingNumber || !platformConfig.accountNumber) {
  console.warn('⚠️ Platform operating account credentials not fully configured. Some payment features may be limited.');
}
