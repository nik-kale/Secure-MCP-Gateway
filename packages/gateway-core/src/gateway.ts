/**
 * Main gateway orchestrator that integrates policy, audit, and approval flow.
 */

import { v4 as uuidv4 } from 'uuid';
import { PolicyEngine } from './policy-engine.js';
import { AuditLogger, IAuditLogger } from './audit-logger.js';
import { ApprovalManager } from './approval-manager.js';
import { WebhookNotifier } from './webhook-notifier.js';
import { IApprovalStore } from './stores/approval-store.js';
import { ExecutionTimeoutError } from './errors.js';
import { withTracing } from './telemetry.js';
import {
  ToolCallContext,
  PolicyDecision,
  PolicyEffect,
  OperationSeverity,
  CallerIdentity,
  PolicyConfig,
  PendingApproval,
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
  /** Optional webhook notifier */
  webhookNotifier?: WebhookNotifier;
  /** Optional approval store */
  approvalStore?: IApprovalStore;
  /** Default execution timeout in milliseconds (default: 30000) */
  defaultTimeout?: number;
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
  private defaultTimeout: number;

  constructor(config: GatewayConfig) {
    this.policyEngine = new PolicyEngine(config.policy);
    this.auditLogger = config.auditLogger || new AuditLogger();
    this.approvalManager = new ApprovalManager({
      defaultTTL: config.approvalTTL,
      webhookNotifier: config.webhookNotifier,
      store: config.approvalStore,
    });
    this.defaultTimeout = config.defaultTimeout || 30000;
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
    return withTracing('evaluateToolCall', async () => {
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
          const approval = await this.approvalManager.createApproval(context, decision);
          return {
            allowed: false,
            decision,
            approvalToken: approval.token,
            context,
          };

        default:
          throw new Error(`Unknown policy effect: ${decision.effect}`);
      }
    }, { tool, action, severity, caller: caller.id });
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
   * @param options Execution options
   */
  public async executeToolCall<T = unknown>(
    tool: string,
    action: string,
    severity: OperationSeverity,
    caller: CallerIdentity,
    executor: (signal?: AbortSignal) => Promise<T>,
    args?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    options?: { timeout?: number }
  ): Promise<GatewayCallResult> {
    return withTracing('executeToolCall', async () => {
      const evalResult = await this.evaluateToolCall(tool, action, severity, caller, args, metadata);

      if (!evalResult.allowed) {
        return evalResult;
      }

      const timeout = options?.timeout ?? this.defaultTimeout;
      const controller = new AbortController();
      
      const timeoutId = setTimeout(() => {
          controller.abort();
      }, timeout);

      // Execute the tool
      try {
        const output = await Promise.race([
          executor(controller.signal),
          new Promise<never>((_, reject) => {
              if (controller.signal.aborted) {
                  reject(new ExecutionTimeoutError(timeout, { tool, action }));
              }
              controller.signal.addEventListener('abort', () => {
                  reject(new ExecutionTimeoutError(timeout, { tool, action }));
              });
          })
        ]);
        
        clearTimeout(timeoutId);
        await this.auditLogger.logExecutionSuccess(evalResult.context, output);

        return {
          ...evalResult,
          result: {
            success: true,
            output,
          },
        };
      } catch (error) {
        clearTimeout(timeoutId);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (error instanceof ExecutionTimeoutError) {
            await this.auditLogger.logExecutionFailure(evalResult.context, `Timeout: ${errorMessage}`);
        } else {
            await this.auditLogger.logExecutionFailure(evalResult.context, errorMessage);
        }

        return {
          ...evalResult,
          result: {
            success: false,
            error: errorMessage,
          },
        };
      }
    }, { tool, action, severity, caller: caller.id });
  }

  /**
   * Grant approval for a pending tool call and execute it.
   */
  public async grantApprovalAndExecute<T = unknown>(
    approvalToken: string,
    approver: CallerIdentity,
    executor: (signal?: AbortSignal) => Promise<T>,
    options?: { timeout?: number }
  ): Promise<GatewayCallResult> {
    return withTracing('grantApprovalAndExecute', async () => {
      const result = await this.approvalManager.grantApproval(approvalToken, approver);

      if (!result.success || !result.approval) {
        throw new Error(result.error || 'Failed to grant approval');
      }

      const { context } = result.approval;

      await this.auditLogger.logApprovalGranted(context, approver);

      const timeout = options?.timeout ?? this.defaultTimeout;
      const controller = new AbortController();
      
      const timeoutId = setTimeout(() => {
          controller.abort();
      }, timeout);

      // Execute the tool
      try {
        const output = await Promise.race([
          executor(controller.signal),
          new Promise<never>((_, reject) => {
              if (controller.signal.aborted) {
                  reject(new ExecutionTimeoutError(timeout, { tool: context.tool, action: context.action }));
              }
              controller.signal.addEventListener('abort', () => {
                  reject(new ExecutionTimeoutError(timeout, { tool: context.tool, action: context.action }));
              });
          })
        ]);
        clearTimeout(timeoutId);

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
        clearTimeout(timeoutId);
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
    }, { approvalToken, approver: approver.id });
  }

  /**
   * Deny a pending approval.
   */
  public async denyApproval(approvalToken: string, denier: CallerIdentity): Promise<void> {
    const result = await this.approvalManager.denyApproval(approvalToken, denier);

    if (!result.success || !result.approval) {
      throw new Error(result.error || 'Failed to deny approval');
    }

    await this.auditLogger.logApprovalDenied(result.approval.context, denier);
  }

  /**
   * List pending approvals.
   */
  public async listPendingApprovals(): Promise<PendingApproval[]> {
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
