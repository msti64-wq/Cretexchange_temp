import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

class RobustPool {
  private pool: Pool;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10; // Increased attempts
  private reconnectDelay = 1000; // Start with 1 second
  private isReconnecting = false;
  private reconnectionPromise: Promise<void> | null = null;
  private lastSuccessfulConnection = Date.now();
  private cooldownPeriod = 60000; // 1 minute cooldown

  constructor(connectionString: string) {
    this.pool = this.createPool(connectionString);
    this.setupErrorHandling();
    this.startHealthCheck();
  }

  private createPool(connectionString: string): Pool {
    // Add sslmode=require to connection string if not present for Neon
    const secureConnectionString = connectionString.includes('sslmode=') 
      ? connectionString 
      : `${connectionString}${connectionString.includes('?') ? '&' : '?'}sslmode=require`;

    return new Pool({ 
      connectionString: secureConnectionString,
      ssl: { rejectUnauthorized: true },
      keepAlive: true,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      query_timeout: 30000,
      application_name: 'washout-tracker',
      allowExitOnIdle: false
    });
  }

  private setupErrorHandling() {
    this.pool.on('error', async (err: any) => {
      console.error('Database pool error:', err.message);
      
      // Check for various connection errors
      if (this.isConnectionError(err)) {
        console.log('Connection error detected, triggering reconnection...');
        await this.handleReconnection();
      }
    });

    this.pool.on('connect', () => {
      this.lastSuccessfulConnection = Date.now();
      this.reconnectAttempts = 0; // Reset on successful connection
    });
  }

  private isConnectionError(err: any): boolean {
    const connectionErrors = [
      '57P01', '57P03', '08006', '08001', '08003', '08004', // PostgreSQL connection errors
      'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', // Network errors
    ];
    
    return connectionErrors.includes(err.code) ||
           err.message.includes('terminating connection') ||
           err.message.includes('connection terminated') ||
           err.message.includes('connection') ||
           err.message.includes('Connection terminated') ||
           err.message.includes('server closed the connection unexpectedly') ||
           err.message.includes('Client has encountered a connection error');
  }

  private async handleReconnection(): Promise<void> {
    // If already reconnecting, return the existing promise
    if (this.isReconnecting && this.reconnectionPromise) {
      return this.reconnectionPromise;
    }

    // Check cooldown period
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulConnection;
    if (this.reconnectAttempts >= this.maxReconnectAttempts && timeSinceLastSuccess < this.cooldownPeriod) {
      console.log('In cooldown period, not attempting reconnection');
      return;
    }

    // Reset attempts after cooldown
    if (timeSinceLastSuccess >= this.cooldownPeriod) {
      this.reconnectAttempts = 0;
    }

    this.isReconnecting = true;
    this.reconnectionPromise = this.performReconnection();
    
    try {
      await this.reconnectionPromise;
    } finally {
      this.isReconnecting = false;
      this.reconnectionPromise = null;
    }
  }

  private async performReconnection(): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Cap at 30s
    const jitter = Math.random() * 1000; // Add jitter
    
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay + jitter}ms`);
    
    await new Promise(resolve => setTimeout(resolve, delay + jitter));
    
    try {
      // End the current pool gracefully
      await this.pool.end();
      
      // Create a new pool
      this.pool = this.createPool(process.env.DATABASE_URL!);
      this.setupErrorHandling();
      
      // Test the connection with a simple query
      await this.healthCheck();
      
      console.log('Database reconnection successful');
      this.lastSuccessfulConnection = Date.now();
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Reconnection failed:', error);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        // Will try again
        await this.performReconnection();
      }
    }
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  private startHealthCheck() {
    setInterval(async () => {
      if (!this.isReconnecting) {
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
          console.log('Health check failed, triggering reconnection');
          await this.handleReconnection();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  async query(text: string, params?: any[], retries = 2): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Wait for any ongoing reconnection
        if (this.isReconnecting && this.reconnectionPromise) {
          await this.reconnectionPromise;
        }
        
        return await this.pool.query(text, params);
      } catch (error: any) {
        console.error(`Database query error (attempt ${attempt + 1}/${retries + 1}):`, error.message);
        
        if (this.isConnectionError(error)) {
          // Trigger reconnection if not already happening
          if (!this.isReconnecting) {
            await this.handleReconnection();
          }
          
          // If this isn't the last attempt, wait a bit and retry
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            continue;
          }
        }
        
        // If it's not a connection error or we've exhausted retries, throw
        throw error;
      }
    }
  }

  async connect(retries = 2): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Wait for any ongoing reconnection
        if (this.isReconnecting && this.reconnectionPromise) {
          await this.reconnectionPromise;
        }
        
        return await this.pool.connect();
      } catch (error: any) {
        console.error(`Database connect error (attempt ${attempt + 1}/${retries + 1}):`, error.message);
        
        if (this.isConnectionError(error)) {
          if (!this.isReconnecting) {
            await this.handleReconnection();
          }
          
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            continue;
          }
        }
        
        throw error;
      }
    }
  }

  async end() {
    return await this.pool.end();
  }

  // Delegate other pool methods
  get totalCount() { return this.pool.totalCount; }
  get idleCount() { return this.pool.idleCount; }
  get waitingCount() { return this.pool.waitingCount; }
}

export const pool = new RobustPool(process.env.DATABASE_URL);
export const db = drizzle(pool as any, { schema });