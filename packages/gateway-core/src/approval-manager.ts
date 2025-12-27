/**
 * Human-in-the-loop approval manager for review-flagged operations.
 */

import {
  PendingApproval,
  ApprovalResult,
  ToolCallContext,
  PolicyDecision,
  CallerIdentity,
  EscalationPolicy,
  EscalationTier,
  OperationSeverity,
} from './types.js';
import { WebhookNotifier } from './webhook-notifier.js';
import { IApprovalStore } from './stores/approval-store.js';
import { MemoryApprovalStore } from './stores/memory-approval-store.js';

/**
 * Severity ordering for comparison.
 */
const SEVERITY_ORDER: Record<OperationSeverity, number> = {
  [OperationSeverity.SAFE]: 0,
  [OperationSeverity.LOW]: 1,
  [OperationSeverity.MEDIUM]: 2,
  [OperationSeverity.HIGH]: 3,
  [OperationSeverity.CRITICAL]: 4,
};

/**
 * Approval manager configuration.
 */
export interface ApprovalManagerConfig {
  /** Default TTL for approvals in milliseconds (default: 1 hour) */
  defaultTTL?: number;
  /** Optional webhook notifier */
  webhookNotifier?: WebhookNotifier;
  /** Optional storage backend */
  store?: IApprovalStore;
  /** Escalation policies */
  escalationPolicies?: EscalationPolicy[];
}

/**
 * Manages pending approvals for tool calls that require human review.
 */
export class ApprovalManager {
  private config: ApprovalManagerConfig;
  private notifier?: WebhookNotifier;
  private store: IApprovalStore;
  private escalationPolicies: EscalationPolicy[];

  constructor(config?: ApprovalManagerConfig) {
    this.config = {
      defaultTTL: 60 * 60 * 1000, // 1 hour
      ...config,
    };
    this.notifier = config?.webhookNotifier;
    this.store = config?.store || new MemoryApprovalStore();
    this.escalationPolicies = config?.escalationPolicies || [];
  }

  /**
   * Create a new pending approval for a tool call.
   */
  public async createApproval(
    context: ToolCallContext,
    decision: PolicyDecision,
    ttl?: number
  ): Promise<PendingApproval> {
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

    await this.store.create(approval);

    // Notify webhook
    if (this.notifier) {
      this.notifier.notify('pending', approval).catch(err => {
        console.error('Failed to send pending approval webhook:', err);
      });
    }

    // Schedule automatic expiration (best effort for local instance)
    // In distributed setup, Redis TTL handles storage, but notification requires worker
    // For now, we keep local timeout as fallback/notification trigger
    setTimeout(() => {
      this.expireApproval(decision.approvalToken!);
    }, ttl || this.config.defaultTTL!);

    return approval;
  }

  /**
   * Get a pending approval by token.
   */
  public async getApproval(token: string): Promise<PendingApproval | undefined> {
    const approval = await this.store.get(token);
    return approval || undefined;
  }

  /**
   * List all pending approvals.
   */
  public async listPendingApprovals(): Promise<PendingApproval[]> {
    return this.store.listPending();
  }

  /**
   * Grant approval for a pending request.
   */
  public async grantApproval(token: string, approver: CallerIdentity): Promise<ApprovalResult> {
    const approval = await this.store.get(token);

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

    if (approval.expiresAt && new Date(approval.expiresAt) < new Date()) {
      approval.status = 'expired';
      await this.store.update(token, { status: 'expired' });
      return {
        success: false,
        error: 'Approval token has expired',
      };
    }

    approval.status = 'approved';
    await this.store.update(token, { status: 'approved' });

    if (this.notifier) {
      this.notifier.notify('approved', approval).catch(err => {
        console.error('Failed to send approved webhook:', err);
      });
    }

    return {
      success: true,
      approval,
    };
  }

  /**
   * Deny approval for a pending request.
   */
  public async denyApproval(token: string, denier: CallerIdentity): Promise<ApprovalResult> {
    const approval = await this.store.get(token);

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
    await this.store.update(token, { status: 'denied' });

    if (this.notifier) {
      this.notifier.notify('denied', approval).catch(err => {
        console.error('Failed to send denied webhook:', err);
      });
    }

    return {
      success: true,
      approval,
    };
  }

  /**
   * Expire an approval (called automatically after TTL).
   */
  private async expireApproval(token: string): Promise<void> {
    const approval = await this.store.get(token);
    if (approval && approval.status === 'pending') {
      approval.status = 'expired';
      await this.store.update(token, { status: 'expired' });
      if (this.notifier) {
        this.notifier.notify('expired', approval).catch(err => {
          console.error('Failed to send expired webhook:', err);
        });
      }
    }
  }

  /**
   * Clean up old approvals (optional maintenance).
   */
  public async cleanup(olderThan?: Date): Promise<number> {
    const cutoff = olderThan || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    return this.store.cleanup(cutoff);
  }

  /**
   * Check and trigger escalations for pending approvals.
   */
  public async checkEscalations(): Promise<void> {
    const pending = await this.listPendingApprovals();
    const now = Date.now();

    for (const approval of pending) {
      const elapsedMinutes = (now - new Date(approval.createdAt).getTime()) / 60000;

      for (const policy of this.escalationPolicies) {
        if (this.matchesEscalation(approval, policy)) {
          for (const tier of policy.tiers) {
            const currentLevel = (approval.metadata?.escalationLevel as number) || 0;

            if (elapsedMinutes >= tier.afterMinutes && tier.afterMinutes > currentLevel) {
              await this.escalate(approval, policy, tier);
            }
          }
        }
      }
    }
  }

  private matchesEscalation(approval: PendingApproval, policy: EscalationPolicy): boolean {
    if (policy.match.minSeverity) {
      if (SEVERITY_ORDER[approval.context.severity] < SEVERITY_ORDER[policy.match.minSeverity]) {
        return false;
      }
    }
    
    if (policy.match.action) {
        // Simple exact match for now, or regex if I wanted to duplicate PolicyEngine logic
        // Assuming simple contains or exact match
        if (approval.context.action !== policy.match.action && !approval.context.action.includes(policy.match.action.replace('*',''))) {
            return false;
        }
    }
    
    return true;
  }

  private async escalate(approval: PendingApproval, policy: EscalationPolicy, tier: EscalationTier): Promise<void> {
    const metadata = approval.metadata || {};
    metadata.escalationLevel = tier.afterMinutes;
    metadata.lastEscalation = new Date().toISOString();

    await this.store.update(approval.token, { metadata });

    // Notify logic
    if (this.notifier) {
        // Send a special 'pending' notification with escalation context?
        // Or we need a new event type 'escalated'
        // For now, re-sending 'pending' might trigger alerts if configured
        // But ideally we want to notify specific channels in tier.notifyChannels
        // Since WebhookNotifier is configured with specific URL, we can't easily change it here without refactor.
        // We will just log for now as the requirement is "Escalation Rules" logic, and notification infrastructure is partial.
        console.log(`[Escalation] Approval ${approval.token} escalated to tier ${tier.afterMinutes}m (${tier.escalationMessage || 'Urgent'})`);
    }
  }
}
