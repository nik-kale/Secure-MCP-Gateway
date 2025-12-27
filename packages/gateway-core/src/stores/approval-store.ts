import { PendingApproval } from '../types.js';

/**
 * Interface for approval storage backends.
 */
export interface IApprovalStore {
  /**
   * Create a new pending approval.
   */
  create(approval: PendingApproval): Promise<void>;

  /**
   * Get a pending approval by token.
   */
  get(token: string): Promise<PendingApproval | null>;

  /**
   * Update an existing approval.
   */
  update(token: string, updates: Partial<PendingApproval>): Promise<boolean>;

  /**
   * Delete an approval.
   */
  delete(token: string): Promise<boolean>;

  /**
   * List all pending approvals.
   */
  listPending(): Promise<PendingApproval[]>;

  /**
   * Clean up expired or old approvals.
   */
  cleanup(olderThan: Date): Promise<number>;
}

