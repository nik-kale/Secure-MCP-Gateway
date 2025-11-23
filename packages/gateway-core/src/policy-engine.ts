/**
 * Policy engine for evaluating tool calls against security policies.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  PolicyConfig,
  PolicyRule,
  PolicyDecision,
  PolicyEffect,
  ToolCallContext,
  OperationSeverity,
} from './types.js';

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
 * Policy engine that evaluates tool calls against configured rules.
 */
export class PolicyEngine {
  private config: PolicyConfig;

  constructor(config: PolicyConfig) {
    this.config = config;
  }

  /**
   * Update the policy configuration.
   */
  public updateConfig(config: PolicyConfig): void {
    this.config = config;
  }

  /**
   * Get the current policy configuration.
   */
  public getConfig(): PolicyConfig {
    return this.config;
  }

  /**
   * Evaluate a tool call against the policy rules.
   * Returns the first matching rule's decision, or the default effect if no rules match.
   */
  public evaluatePolicy(context: ToolCallContext): PolicyDecision {
    // Evaluate rules in order (first match wins)
    for (const rule of this.config.rules) {
      if (this.matchesRule(context, rule)) {
        const decision: PolicyDecision = {
          effect: rule.effect,
          reason: rule.reason || this.getDefaultReason(rule.effect, rule),
          rule: rule.id,
        };

        // Generate approval token for REVIEW decisions
        if (rule.effect === PolicyEffect.REVIEW) {
          decision.approvalToken = uuidv4();
        }

        return decision;
      }
    }

    // No rules matched, apply default effect
    const decision: PolicyDecision = {
      effect: this.config.defaultEffect,
      reason: this.config.defaultReason || this.getDefaultReason(this.config.defaultEffect),
    };

    if (this.config.defaultEffect === PolicyEffect.REVIEW) {
      decision.approvalToken = uuidv4();
    }

    return decision;
  }

  /**
   * Check if a tool call context matches a policy rule.
   */
  private matchesRule(context: ToolCallContext, rule: PolicyRule): boolean {
    const { match } = rule;

    // Check tool pattern
    if (match.tool && !this.matchesPattern(context.tool, match.tool)) {
      return false;
    }

    // Check action pattern
    if (match.action && !this.matchesPattern(context.action, match.action)) {
      return false;
    }

    // Check minimum severity
    if (match.minSeverity) {
      if (SEVERITY_ORDER[context.severity] < SEVERITY_ORDER[match.minSeverity]) {
        return false;
      }
    }

    // Check caller type
    if (match.callerType && context.caller.type !== match.callerType) {
      return false;
    }

    // Check custom matcher
    if (match.custom && !match.custom(context)) {
      return false;
    }

    return true;
  }

  /**
   * Match a string against a pattern (supports * wildcard).
   */
  private matchesPattern(value: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(value);
  }

  /**
   * Generate a default reason for a policy effect.
   */
  private getDefaultReason(effect: PolicyEffect, rule?: PolicyRule): string {
    const ruleDesc = rule ? ` (rule: ${rule.id})` : '';
    switch (effect) {
      case PolicyEffect.ALLOW:
        return `Operation allowed by policy${ruleDesc}`;
      case PolicyEffect.DENY:
        return `Operation denied by policy${ruleDesc}`;
      case PolicyEffect.REVIEW:
        return `Operation requires human approval${ruleDesc}`;
      default:
        return `Policy decision: ${effect}${ruleDesc}`;
    }
  }
}

/**
 * Create a default policy configuration for common use cases.
 */
export function createDefaultPolicy(): PolicyConfig {
  return {
    rules: [
      // Deny critical destructive operations
      {
        id: 'deny-critical-delete',
        description: 'Deny critical delete operations',
        match: {
          action: 'delete_*',
          minSeverity: OperationSeverity.CRITICAL,
        },
        effect: PolicyEffect.DENY,
        reason: 'Critical delete operations are not allowed',
      },
      // Require review for high-risk operations
      {
        id: 'review-high-risk',
        description: 'Require review for high-risk operations',
        match: {
          minSeverity: OperationSeverity.HIGH,
        },
        effect: PolicyEffect.REVIEW,
        reason: 'High-risk operations require human approval',
      },
      // Require review for medium-risk write operations
      {
        id: 'review-medium-writes',
        description: 'Require review for medium-risk operations',
        match: {
          minSeverity: OperationSeverity.MEDIUM,
        },
        effect: PolicyEffect.REVIEW,
        reason: 'Medium-risk operations require human approval',
      },
      // Allow safe read-only operations
      {
        id: 'allow-safe-reads',
        description: 'Allow safe read-only operations',
        match: {
          minSeverity: OperationSeverity.SAFE,
        },
        effect: PolicyEffect.ALLOW,
        reason: 'Safe read-only operation',
      },
    ],
    defaultEffect: PolicyEffect.REVIEW,
    defaultReason: 'Default policy requires review for unclassified operations',
  };
}
