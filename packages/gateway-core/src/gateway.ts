/**
 * Main gateway orchestrator that integrates policy, audit, and approval flow.
 */

import { v4 as uuidv4 } from 'uuid';
import { PolicyEngine } from './policy-engine.js';
import { AuditLogger, IAuditLogger } from './audit-logger.js';
import { ApprovalManager } from './approval-manager.js';
import {
  ToolCallContext,
  PolicyDecision,
  PolicyEffect,
  OperationSeverity,
  CallerIdentity,
  PolicyConfig,
} from './types.js';

/**
 * Result of a gateway-mediated tool call.
 */
export interface GatewayCallResult {
  /** Whether the call was allowed to proceed */
  allowed: boolean;
  /** Policy decision */
  decision: PolicyDecision;
  /** If review is required, approval token for human-in-the-loop */
  approvalToken?: string;
  /** Tool call context */
  context: ToolCallContext;
  /** Execution result (only if allowed and executed) */
  result?: {
    success: boolean;
    output?: unknown;
    error?: string;
  };
}

/**
 * Configuration for the gateway.
 */
export interface GatewayConfig {
  /** Policy configuration */
  policy: PolicyConfig;
  /** Custom audit logger (optional) */
  auditLogger?: IAuditLogger;
  /** Approval TTL in milliseconds */
  approvalTTL?: number;
}

/**
 * Secure MCP Gateway orchestrator.
 *
 * This is the main entry point for enforcing security policies on tool calls.
 * It integrates policy evaluation, audit logging, and human-in-the-loop approvals.
 */
export class SecureMCPGateway {
  private policyEngine: PolicyEngine;
  private auditLogger: IAuditLogger;
  private approvalManager: ApprovalManager;

  constructor(config: GatewayConfig) {
    this.policyEngine = new PolicyEngine(config.policy);
    this.auditLogger = config.auditLogger || new AuditLogger();
    this.approvalManager = new ApprovalManager({
      defaultTTL: config.approvalTTL,
    });
  }

  /**
   * Evaluate a tool call against security policies.
   *
   * This method performs policy evaluation and audit logging but does NOT execute the tool.
   * The caller is responsible for executing the tool if allowed.
   */
  public async evaluateToolCall(
    tool: string,
    action: string,
    severity: OperationSeverity,
    caller: CallerIdentity,
    args?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<GatewayCallResult> {
    const context: ToolCallContext = {
      callId: uuidv4(),
      tool,
      action,
      severity,
      caller,
      args,
      timestamp: new Date(),
      metadata,
    };

    // Evaluate policy
    const decision = this.policyEngine.evaluatePolicy(context);

    // Log the tool call and decision
    await this.auditLogger.logToolCall(context, decision);

    // Handle based on policy decision
    switch (decision.effect) {
      case PolicyEffect.ALLOW:
        return {
          allowed: true,
          decision,
          context,
        };

      case PolicyEffect.DENY:
        return {
          allowed: false,
          decision,
          context,
        };

      case PolicyEffect.REVIEW:
        // Create pending approval
        const approval = this.approvalManager.createApproval(context, decision);
        return {
          allowed: false,
          decision,
          approvalToken: approval.token,
          context,
        };

      default:
        throw new Error(`Unknown policy effect: ${decision.effect}`);
    }
  }

  /**
   * Execute a tool call with gateway protection.
   *
   * This is a convenience method that evaluates the policy AND executes the tool if allowed.
   *
   * @param tool Tool name
   * @param action Action name
   * @param severity Operation severity
   * @param caller Caller identity
   * @param executor Function that executes the tool and returns the result
   * @param args Tool arguments (optional)
   * @param metadata Additional metadata (optional)
   */
  public async executeToolCall<T = unknown>(
    tool: string,
    action: string,
    severity: OperationSeverity,
    caller: CallerIdentity,
    executor: () => Promise<T>,
    args?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<GatewayCallResult> {
    const evalResult = await this.evaluateToolCall(tool, action, severity, caller, args, metadata);

    if (!evalResult.allowed) {
      return evalResult;
    }

    // Execute the tool
    try {
      const output = await executor();
      await this.auditLogger.logExecutionSuccess(evalResult.context, output);

      return {
        ...evalResult,
        result: {
          success: true,
          output,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.auditLogger.logExecutionFailure(evalResult.context, errorMessage);

      return {
        ...evalResult,
        result: {
          success: false,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Grant approval for a pending tool call and execute it.
   */
  public async grantApprovalAndExecute<T = unknown>(
    approvalToken: string,
    approver: CallerIdentity,
    executor: () => Promise<T>
  ): Promise<GatewayCallResult> {
    const result = this.approvalManager.grantApproval(approvalToken, approver);

    if (!result.success || !result.approval) {
      throw new Error(result.error || 'Failed to grant approval');
    }

    const { context } = result.approval;

    await this.auditLogger.logApprovalGranted(context, approver);

    // Execute the tool
    try {
      const output = await executor();
      await this.auditLogger.logExecutionSuccess(context, output);

      return {
        allowed: true,
        decision: result.approval.decision,
        context,
        result: {
          success: true,
          output,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.auditLogger.logExecutionFailure(context, errorMessage);

      return {
        allowed: true,
        decision: result.approval.decision,
        context,
        result: {
          success: false,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Deny a pending approval.
   */
  public async denyApproval(approvalToken: string, denier: CallerIdentity): Promise<void> {
    const result = this.approvalManager.denyApproval(approvalToken, denier);

    if (!result.success || !result.approval) {
      throw new Error(result.error || 'Failed to deny approval');
    }

    await this.auditLogger.logApprovalDenied(result.approval.context, denier);
  }

  /**
   * List pending approvals.
   */
  public listPendingApprovals() {
    return this.approvalManager.listPendingApprovals();
  }

  /**
   * Get the policy engine (for configuration updates).
   */
  public getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  /**
   * Get the approval manager.
   */
  public getApprovalManager(): ApprovalManager {
    return this.approvalManager;
  }
}
