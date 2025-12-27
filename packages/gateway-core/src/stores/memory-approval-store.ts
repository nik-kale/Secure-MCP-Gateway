import { IApprovalStore } from './approval-store.js';
import { PendingApproval } from '../types.js';

export class MemoryApprovalStore implements IApprovalStore {
  private approvals: Map<string, PendingApproval> = new Map();

  async create(approval: PendingApproval): Promise<void> {
    this.approvals.set(approval.token, approval);
  }

  async get(token: string): Promise<PendingApproval | null> {
    return this.approvals.get(token) || null;
  }

  async update(token: string, updates: Partial<PendingApproval>): Promise<boolean> {
    const existing = this.approvals.get(token);
    if (!existing) return false;
    this.approvals.set(token, { ...existing, ...updates });
    return true;
  }

  async delete(token: string): Promise<boolean> {
    return this.approvals.delete(token);
  }

  async listPending(): Promise<PendingApproval[]> {
    return Array.from(this.approvals.values()).filter((a) => a.status === 'pending');
  }

  async cleanup(olderThan: Date): Promise<number> {
    let count = 0;
    for (const [token, approval] of this.approvals.entries()) {
      if (approval.status !== 'pending' && approval.createdAt < olderThan) {
        this.approvals.delete(token);
        count++;
      }
    }
    return count;
  }
}

