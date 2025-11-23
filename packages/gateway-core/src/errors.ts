/**
 * Custom error classes for Secure-MCP-Gateway
 * Provides structured error handling with error codes and context
 */

/**
 * Error codes for programmatic error handling
 */
export enum GatewayErrorCode {
  // Policy errors (1000-1999)
  POLICY_DENIED = 'POLICY_DENIED_1001',
  POLICY_EVALUATION_FAILED = 'POLICY_EVALUATION_FAILED_1002',
  POLICY_CONFIG_INVALID = 'POLICY_CONFIG_INVALID_1003',

  // Approval errors (2000-2999)
  APPROVAL_NOT_FOUND = 'APPROVAL_NOT_FOUND_2001',
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED_2002',
  APPROVAL_ALREADY_PROCESSED = 'APPROVAL_ALREADY_PROCESSED_2003',
  APPROVAL_TOKEN_INVALID = 'APPROVAL_TOKEN_INVALID_2004',

  // Execution errors (3000-3999)
  EXECUTION_FAILED = 'EXECUTION_FAILED_3001',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT_3002',
  EXECUTION_UNAUTHORIZED = 'EXECUTION_UNAUTHORIZED_3003',

  // Authentication errors (4000-4999)
  AUTH_REQUIRED = 'AUTH_REQUIRED_4001',
  AUTH_INVALID = 'AUTH_INVALID_4002',
  AUTH_EXPIRED = 'AUTH_EXPIRED_4003',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS_4004',

  // Validation errors (5000-5999)
  VALIDATION_FAILED = 'VALIDATION_FAILED_5001',
  INPUT_INVALID = 'INPUT_INVALID_5002',

  // Audit errors (6000-6999)
  AUDIT_LOG_FAILED = 'AUDIT_LOG_FAILED_6001',

  // General errors (9000-9999)
  INTERNAL_ERROR = 'INTERNAL_ERROR_9001',
  CONFIG_ERROR = 'CONFIG_ERROR_9002',
}

/**
 * Base gateway error class
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public code: GatewayErrorCode,
    public context?: Record<string, unknown>,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'GatewayError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      suggestion: this.suggestion,
    };
  }
}

/**
 * Policy denied error - operation explicitly denied by policy
 */
export class PolicyDeniedError extends GatewayError {
  constructor(
    message: string,
    public rule?: string,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      GatewayErrorCode.POLICY_DENIED,
      { ...context, rule },
      'Review your policy configuration or contact an administrator'
    );
    this.name = 'PolicyDeniedError';
  }
}

/**
 * Policy evaluation failed error
 */
export class PolicyEvaluationError extends GatewayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(
      message,
      GatewayErrorCode.POLICY_EVALUATION_FAILED,
      context,
      'Check policy configuration for errors'
    );
    this.name = 'PolicyEvaluationError';
  }
}

/**
 * Invalid policy configuration error
 */
export class PolicyConfigError extends GatewayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(
      message,
      GatewayErrorCode.POLICY_CONFIG_INVALID,
      context,
      'Validate your policy configuration against the schema'
    );
    this.name = 'PolicyConfigError';
  }
}

/**
 * Approval not found error
 */
export class ApprovalNotFoundError extends GatewayError {
  constructor(token: string) {
    super(
      `Approval token not found: ${token}`,
      GatewayErrorCode.APPROVAL_NOT_FOUND,
      { token },
      'Verify the approval token is correct or check if it has expired'
    );
    this.name = 'ApprovalNotFoundError';
  }
}

/**
 * Approval expired error
 */
export class ApprovalExpiredError extends GatewayError {
  constructor(token: string, expiresAt: Date) {
    super(
      `Approval token has expired`,
      GatewayErrorCode.APPROVAL_EXPIRED,
      { token, expiresAt },
      'Request a new approval token'
    );
    this.name = 'ApprovalExpiredError';
  }
}

/**
 * Approval already processed error
 */
export class ApprovalAlreadyProcessedError extends GatewayError {
  constructor(token: string, status: string) {
    super(
      `Approval has already been ${status}`,
      GatewayErrorCode.APPROVAL_ALREADY_PROCESSED,
      { token, status },
      'This approval cannot be modified'
    );
    this.name = 'ApprovalAlreadyProcessedError';
  }
}

/**
 * Invalid approval token error
 */
export class ApprovalTokenInvalidError extends GatewayError {
  constructor(message: string) {
    super(
      message,
      GatewayErrorCode.APPROVAL_TOKEN_INVALID,
      undefined,
      'Verify the approval token format'
    );
    this.name = 'ApprovalTokenInvalidError';
  }
}

/**
 * Execution failed error
 */
export class ExecutionError extends GatewayError {
  constructor(
    message: string,
    public originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      GatewayErrorCode.EXECUTION_FAILED,
      { ...context, originalError: originalError?.message },
      'Check the tool implementation and arguments'
    );
    this.name = 'ExecutionError';
  }
}

/**
 * Execution timeout error
 */
export class ExecutionTimeoutError extends GatewayError {
  constructor(timeout: number, context?: Record<string, unknown>) {
    super(
      `Execution timed out after ${timeout}ms`,
      GatewayErrorCode.EXECUTION_TIMEOUT,
      { ...context, timeout },
      'Increase timeout or optimize the operation'
    );
    this.name = 'ExecutionTimeoutError';
  }
}

/**
 * Authentication required error
 */
export class AuthenticationRequiredError extends GatewayError {
  constructor(message: string = 'Authentication required') {
    super(
      message,
      GatewayErrorCode.AUTH_REQUIRED,
      undefined,
      'Provide valid authentication credentials'
    );
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * Invalid authentication error
 */
export class AuthenticationInvalidError extends GatewayError {
  constructor(message: string = 'Invalid authentication credentials') {
    super(
      message,
      GatewayErrorCode.AUTH_INVALID,
      undefined,
      'Verify your credentials are correct'
    );
    this.name = 'AuthenticationInvalidError';
  }
}

/**
 * Authentication expired error
 */
export class AuthenticationExpiredError extends GatewayError {
  constructor(message: string = 'Authentication credentials have expired') {
    super(
      message,
      GatewayErrorCode.AUTH_EXPIRED,
      undefined,
      'Re-authenticate to continue'
    );
    this.name = 'AuthenticationExpiredError';
  }
}

/**
 * Insufficient permissions error
 */
export class InsufficientPermissionsError extends GatewayError {
  constructor(
    message: string,
    required: string[],
    actual: string[]
  ) {
    super(
      message,
      GatewayErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      { required, actual },
      'Contact an administrator to request required permissions'
    );
    this.name = 'InsufficientPermissionsError';
  }
}

/**
 * Validation failed error
 */
export class ValidationError extends GatewayError {
  constructor(
    message: string,
    public validationErrors: Array<{ field: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      GatewayErrorCode.VALIDATION_FAILED,
      { ...context, validationErrors },
      'Fix the validation errors and try again'
    );
    this.name = 'ValidationError';
  }
}

/**
 * Input invalid error
 */
export class InputInvalidError extends GatewayError {
  constructor(field: string, message: string, value?: unknown) {
    super(
      `Invalid input for field '${field}': ${message}`,
      GatewayErrorCode.INPUT_INVALID,
      { field, value },
      'Provide valid input according to the schema'
    );
    this.name = 'InputInvalidError';
  }
}

/**
 * Audit log failed error
 */
export class AuditLogError extends GatewayError {
  constructor(message: string, originalError?: Error) {
    super(
      message,
      GatewayErrorCode.AUDIT_LOG_FAILED,
      { originalError: originalError?.message },
      'Check audit log configuration and permissions'
    );
    this.name = 'AuditLogError';
  }
}

/**
 * Internal error - generic fallback
 */
export class InternalError extends GatewayError {
  constructor(message: string, originalError?: Error) {
    super(
      message,
      GatewayErrorCode.INTERNAL_ERROR,
      { originalError: originalError?.message },
      'This is an unexpected error. Please report it to the development team'
    );
    this.name = 'InternalError';
  }
}

/**
 * Configuration error
 */
export class ConfigError extends GatewayError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(
      message,
      GatewayErrorCode.CONFIG_ERROR,
      context,
      'Review and correct the configuration'
    );
    this.name = 'ConfigError';
  }
}

/**
 * Helper to check if error is a gateway error
 */
export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}

/**
 * Helper to convert any error to a gateway error
 */
export function toGatewayError(error: unknown): GatewayError {
  if (isGatewayError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, error);
  }

  return new InternalError(String(error));
}
