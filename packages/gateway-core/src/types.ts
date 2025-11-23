/**
 * Core types for Secure-MCP-Gateway policy enforcement and audit logging.
 */

/**
 * Severity level of a tool operation.
 */
export enum OperationSeverity {
  /** Read-only operations with no side effects */
  SAFE = 'safe',
  /** Operations that may modify state but are low-risk */
  LOW = 'low',
  /** Operations that modify critical state or have moderate risk */
  MEDIUM = 'medium',
  /** High-risk operations that could cause significant impact */
  HIGH = 'high',
  /** Critical operations that could cause severe production impact */
  CRITICAL = 'critical',
}

/**
 * Caller identity information for audit and authorization.
 */
export interface CallerIdentity {
  /** Unique identifier for the caller (user, service account, agent) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Type of caller (human, agent, service) */
  type: 'human' | 'agent' | 'service';
  /** Additional metadata (team, role, permissions, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Context information for a tool call that requires policy evaluation.
 */
export interface ToolCallContext {
  /** Unique identifier for this tool call */
  callId: string;
  /** Name of the tool being invoked */
  tool: string;
  /** Specific action within the tool (e.g., 'delete_pod', 'search_issues') */
  action: string;
  /** Operation severity level */
  severity: OperationSeverity;
  /** Identity of the caller */
  caller: CallerIdentity;
  /** Tool call arguments (for audit and policy matching) */
  args?: Record<string, unknown>;
  /** Timestamp of the call */
  timestamp: Date;
  /** Additional context (session ID, trace ID, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Policy decision outcome.
 */
export enum PolicyEffect {
  /** Tool call is allowed to proceed immediately */
  ALLOW = 'allow',
  /** Tool call is denied and should not be executed */
  DENY = 'deny',
  /** Tool call requires human approval before proceeding */
  REVIEW = 'review',
}

/**
 * Result of policy evaluation.
 */
export interface PolicyDecision {
  /** The decision effect */
  effect: PolicyEffect;
  /** Reason for the decision (for audit and user feedback) */
  reason: string;
  /** Name of the policy rule that triggered this decision */
  rule?: string;
  /** If effect is REVIEW, this token is used for approval flow */
  approvalToken?: string;
}

/**
 * Policy rule configuration.
 */
export interface PolicyRule {
  /** Unique identifier for this rule */
  id: string;
  /** Human-readable description */
  description?: string;
  /** Match conditions (all must be satisfied) */
  match: {
    /** Tool name pattern (supports wildcards with *) */
    tool?: string;
    /** Action name pattern (supports wildcards with *) */
    action?: string;
    /** Minimum severity level to match */
    minSeverity?: OperationSeverity;
    /** Caller type to match */
    callerType?: CallerIdentity['type'];
    /** Custom matcher function for advanced logic */
    custom?: (context: ToolCallContext) => boolean;
  };
  /** Effect to apply when rule matches */
  effect: PolicyEffect;
  /** Optional reason template */
  reason?: string;
}

/**
 * Complete policy configuration.
 */
export interface PolicyConfig {
  /** Ordered list of policy rules (first match wins) */
  rules: PolicyRule[];
  /** Default effect if no rules match */
  defaultEffect: PolicyEffect;
  /** Default reason if no rules match */
  defaultReason?: string;
}

/**
 * Audit log entry for tool calls and policy decisions.
 */
export interface AuditLogEntry {
  /** Unique identifier for this log entry */
  entryId: string;
  /** Timestamp of the event */
  timestamp: Date;
  /** Type of event */
  eventType: 'tool_call' | 'policy_decision' | 'approval_granted' | 'approval_denied' | 'execution_success' | 'execution_failure';
  /** Tool call context */
  context: ToolCallContext;
  /** Policy decision (if applicable) */
  decision?: PolicyDecision;
  /** Execution result (if applicable) */
  result?: {
    success: boolean;
    output?: unknown;
    error?: string;
  };
  /** Approval information (if applicable) */
  approval?: {
    approvedBy: CallerIdentity;
    approvedAt: Date;
  };
}

/**
 * Pending approval request.
 */
export interface PendingApproval {
  /** Approval token */
  token: string;
  /** Tool call context */
  context: ToolCallContext;
  /** Policy decision that triggered the review */
  decision: PolicyDecision;
  /** When the approval request was created */
  createdAt: Date;
  /** When the approval expires (optional) */
  expiresAt?: Date;
  /** Current status */
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

/**
 * Approval action result.
 */
export interface ApprovalResult {
  /** Whether the approval was successful */
  success: boolean;
  /** The updated pending approval */
  approval?: PendingApproval;
  /** Error message if unsuccessful */
  error?: string;
}
