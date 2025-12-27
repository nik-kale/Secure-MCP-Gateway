/**
 * @secure-mcp-gateway/core
 *
 * Core security policy engine, audit logging, and approval flow
 * for the Secure MCP Gateway.
 */

// Types
export * from './types.js';

// Policy Engine
export { PolicyEngine, createDefaultPolicy } from './policy-engine.js';

// Audit Logger
export { AuditLogger, type IAuditLogger, type AuditLoggerConfig } from './audit-logger.js';

// Approval Manager
export { ApprovalManager, type ApprovalManagerConfig } from './approval-manager.js';
export { IApprovalStore } from './stores/approval-store.js';
export { MemoryApprovalStore } from './stores/memory-approval-store.js';
export { RedisApprovalStore } from './stores/redis-approval-store.js';

// Webhook Notifier
export { WebhookNotifier, type WebhookConfig } from './webhook-notifier.js';

// Gateway Orchestrator
export {
  SecureMCPGateway,
  type GatewayConfig,
  type GatewayCallResult,
} from './gateway.js';

// Error Classes
export * from './errors.js';

// Validation Utilities
export * from './validation.js';
