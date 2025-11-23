/**
 * Human-in-the-loop approval manager for review-flagged operations.
 */

import {
  PendingApproval,
  ApprovalResult,
  ToolCallContext,
  PolicyDecision,
  CallerIdentity,
} from './types.js';

/**
 * Approval manager configuration.
 */
export interface ApprovalManagerConfig {
  /** Default TTL for approvals in milliseconds (default: 1 hour) */
  defaultTTL?: number;
}

/**
 * Manages pending approvals for tool calls that require human review.
 */
export class ApprovalManager {
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private config: ApprovalManagerConfig;

  constructor(config?: ApprovalManagerConfig) {
    this.config = {
      defaultTTL: 60 * 60 * 1000, // 1 hour
      ...config,
    };
  }

  /**
   * Create a new pending approval for a tool call.
   */
  public createApproval(
    context: ToolCallContext,
    decision: PolicyDecision,
    ttl?: number
  ): PendingApproval {
    if (!decision.approvalToken) {
      throw new Error('Cannot create approval without approval token');
    }

    const expiresAt = ttl
      ? new Date(Date.now() + ttl)
      : new Date(Date.now() + this.config.defaultTTL!);

    const approval: PendingApproval = {
      token: decision.approvalToken,
      context,
      decision,
      createdAt: new Date(),
      expiresAt,
      status: 'pending',
    };

    this.pendingApprovals.set(decision.approvalToken, approval);

    // Schedule automatic expiration
    setTimeout(() => {
      this.expireApproval(decision.approvalToken!);
    }, ttl || this.config.defaultTTL!);

    return approval;
  }

  /**
   * Get a pending approval by token.
   */
  public getApproval(token: string): PendingApproval | undefined {
    return this.pendingApprovals.get(token);
  }

  /**
   * List all pending approvals.
   */
  public listPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values()).filter((a) => a.status === 'pending');
  }

  /**
   * Grant approval for a pending request.
   */
  public grantApproval(token: string, approver: CallerIdentity): ApprovalResult {
    const approval = this.pendingApprovals.get(token);

    if (!approval) {
      return {
        success: false,
        error: 'Approval token not found',
      };
    }

    if (approval.status !== 'pending') {
      return {
        success: false,
        error: `Approval is already ${approval.status}`,
      };
    }

    if (approval.expiresAt && approval.expiresAt < new Date()) {
      approval.status = 'expired';
      return {
        success: false,
        error: 'Approval token has expired',
      };
    }

    approval.status = 'approved';

    return {
      success: true,
      approval,
    };
  }

  /**
   * Deny approval for a pending request.
   */
  public denyApproval(token: string, denier: CallerIdentity): ApprovalResult {
    const approval = this.pendingApprovals.get(token);

    if (!approval) {
      return {
        success: false,
        error: 'Approval token not found',
      };
    }

    if (approval.status !== 'pending') {
      return {
        success: false,
        error: `Approval is already ${approval.status}`,
      };
    }

    approval.status = 'denied';

    return {
      success: true,
      approval,
    };
  }

  /**
   * Expire an approval (called automatically after TTL).
   */
  private expireApproval(token: string): void {
    const approval = this.pendingApprovals.get(token);
    if (approval && approval.status === 'pending') {
      approval.status = 'expired';
    }
  }

  /**
   * Clean up old approvals (optional maintenance).
   */
  public cleanup(olderThan?: Date): number {
    const cutoff = olderThan || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleaned = 0;

    for (const [token, approval] of this.pendingApprovals.entries()) {
      if (approval.status !== 'pending' && approval.createdAt < cutoff) {
        this.pendingApprovals.delete(token);
        cleaned++;
      }
    }

    return cleaned;
  }
}
