import Redis from 'ioredis';
import { IApprovalStore } from './approval-store.js';
import { PendingApproval } from '../types.js';

export class RedisApprovalStore implements IApprovalStore {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redisUrl: string = 'redis://localhost:6379', keyPrefix = 'smcp:approval:') {
    this.redis = new Redis(redisUrl);
    this.keyPrefix = keyPrefix;
  }

  async create(approval: PendingApproval): Promise<void> {
    const ttlSeconds = Math.ceil((new Date(approval.expiresAt).getTime() - Date.now()) / 1000);
    if (ttlSeconds <= 0) return;

    await this.redis.set(
      `${this.keyPrefix}${approval.token}`,
      JSON.stringify(approval),
      'EX',
      ttlSeconds
    );
  }

  async get(token: string): Promise<PendingApproval | null> {
    const data = await this.redis.get(`${this.keyPrefix}${token}`);
    if (!data) return null;
    return JSON.parse(data, (key, value) => {
      // Restore Date objects
      if (key === 'createdAt' || key === 'expiresAt' || key === 'timestamp') {
        return new Date(value);
      }
      return value;
    });
  }

  async update(token: string, updates: Partial<PendingApproval>): Promise<boolean> {
    const existing = await this.get(token);
    if (!existing) return false;

    const updated = { ...existing, ...updates };
    const ttlSeconds = Math.ceil((new Date(updated.expiresAt).getTime() - Date.now()) / 1000);
    
    if (ttlSeconds <= 0) {
        await this.delete(token);
        return true;
    }

    await this.redis.set(
      `${this.keyPrefix}${token}`,
      JSON.stringify(updated),
      'EX',
      ttlSeconds
    );
    return true;
  }

  async delete(token: string): Promise<boolean> {
    const result = await this.redis.del(`${this.keyPrefix}${token}`);
    return result > 0;
  }

  async listPending(): Promise<PendingApproval[]> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    const approvals: PendingApproval[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const approval = JSON.parse(data, (key, value) => {
          if (key === 'createdAt' || key === 'expiresAt' || key === 'timestamp') {
            return new Date(value);
          }
          return value;
        }) as PendingApproval;
        
        if (approval.status === 'pending') {
          approvals.push(approval);
        }
      }
    }
    return approvals;
  }

  async cleanup(olderThan: Date): Promise<number> {
    // Redis handles TTL expiration automatically.
    // This could be used to clean up denied/approved records if we kept them longer.
    // For now, we rely on TTL.
    return 0;
  }

  // Close connection
  async disconnect(): Promise<void> {
      await this.redis.quit();
  }
}

