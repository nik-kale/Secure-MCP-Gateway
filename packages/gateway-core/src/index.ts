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

// Gateway Orchestrator
export {
  SecureMCPGateway,
  type GatewayConfig,
  type GatewayCallResult,
} from './gateway.js';
