/**
 * Input validation schemas using Zod
 * Provides runtime type checking and validation for all gateway inputs
 */

import { z } from 'zod';
import { OperationSeverity, PolicyEffect } from './types.js';
import { ValidationError } from './errors.js';

/**
 * Caller identity schema
 */
export const CallerIdentitySchema = z.object({
  id: z.string().min(1, 'Caller ID is required'),
  name: z.string().min(1, 'Caller name is required'),
  type: z.enum(['human', 'agent', 'service']),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Tool call args schema - generic, can be extended
 */
export const ToolCallArgsSchema = z.record(z.unknown());

/**
 * Tool call context schema
 */
export const ToolCallContextSchema = z.object({
  callId: z.string().uuid('Call ID must be a valid UUID'),
  tool: z.string().min(1, 'Tool name is required'),
  action: z.string().min(1, 'Action name is required'),
  severity: z.nativeEnum(OperationSeverity),
  caller: CallerIdentitySchema,
  args: ToolCallArgsSchema.optional(),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Policy rule match schema
 */
export const PolicyRuleMatchSchema = z.object({
  tool: z.string().optional(),
  action: z.string().optional(),
  minSeverity: z.nativeEnum(OperationSeverity).optional(),
  callerType: z.enum(['human', 'agent', 'service']).optional(),
  custom: z.function().optional(),
});

/**
 * Policy rule schema
 */
export const PolicyRuleSchema = z.object({
  id: z.string().min(1, 'Rule ID is required'),
  description: z.string().optional(),
  match: PolicyRuleMatchSchema,
  effect: z.nativeEnum(PolicyEffect),
  reason: z.string().optional(),
});

/**
 * Policy config schema
 */
export const PolicyConfigSchema = z.object({
  rules: z.array(PolicyRuleSchema),
  defaultEffect: z.nativeEnum(PolicyEffect),
  defaultReason: z.string().optional(),
});

/**
 * Approval token schema - enforce format
 */
export const ApprovalTokenSchema = z.string().uuid('Approval token must be a valid UUID');

/**
 * Gateway config schema
 */
export const GatewayConfigSchema = z.object({
  policy: PolicyConfigSchema,
  auditLogger: z.any().optional(), // IAuditLogger interface
  approvalTTL: z.number().positive().optional(),
});

/**
 * Jira config schema
 */
export const JiraConfigSchema = z.object({
  url: z.string().url('Jira URL must be a valid URL'),
  email: z.string().email('Jira email must be valid').optional(),
  token: z.string().min(1, 'Jira token is required').optional(),
});

/**
 * Jira search args schema
 */
export const JiraSearchArgsSchema = z.object({
  jql: z.string().min(1, 'JQL query is required').max(1000, 'JQL query too long'),
  maxResults: z.number().int().positive().max(1000).optional(),
});

/**
 * Jira get issue args schema
 */
export const JiraGetIssueArgsSchema = z.object({
  issueKey: z.string().regex(/^[A-Z]+-\d+$/, 'Invalid Jira issue key format'),
});

/**
 * Jira add comment args schema
 */
export const JiraAddCommentArgsSchema = z.object({
  issueKey: z.string().regex(/^[A-Z]+-\d+$/, 'Invalid Jira issue key format'),
  comment: z.string().min(1, 'Comment is required').max(10000, 'Comment too long'),
});

/**
 * Jira transition issue args schema
 */
export const JiraTransitionArgsSchema = z.object({
  issueKey: z.string().regex(/^[A-Z]+-\d+$/, 'Invalid Jira issue key format'),
  transitionId: z.string().regex(/^\d+$/, 'Transition ID must be numeric'),
});

/**
 * Kubernetes pod name schema
 */
export const K8sPodNameSchema = z.string().regex(
  /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
  'Invalid Kubernetes pod name'
);

/**
 * Kubernetes namespace schema
 */
export const K8sNamespaceSchema = z.string().regex(
  /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
  'Invalid Kubernetes namespace'
);

/**
 * Helper function to validate input with Zod schema
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fieldName: string = 'input'
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map(err => ({
        field: err.path.join('.') || fieldName,
        message: err.message,
      }));

      throw new ValidationError(
        `Validation failed for ${fieldName}`,
        validationErrors,
        { data }
      );
    }
    throw error;
  }
}

/**
 * Helper function to safely validate without throwing
 */
export function validateInputSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Sanitize JQL to prevent injection attacks
 */
export function sanitizeJQL(jql: string): string {
  // Remove potentially dangerous characters and commands
  let sanitized = jql.trim();

  // Block dangerous SQL-like keywords (though JQL is not SQL, be cautious)
  const dangerousPatterns = [
    /;\s*DROP/gi,
    /;\s*DELETE/gi,
    /;\s*UPDATE\s+[^=]/gi, // Allow "AND updated", block "UPDATE table"
    /;\s*INSERT/gi,
    /;\s*EXEC/gi,
    /;\s*EXECUTE/gi,
    /--/g, // SQL comments
    /\/\*/g, // Block comments start
    /\*\//g, // Block comments end
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      throw new ValidationError(
        'JQL contains potentially dangerous patterns',
        [{ field: 'jql', message: 'Dangerous pattern detected' }],
        { jql, pattern: pattern.toString() }
      );
    }
  }

  return sanitized;
}

/**
 * Sanitize string to prevent log injection
 */
export function sanitizeForLog(value: string): string {
  // Remove control characters that could break log format
  return value
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\x00/g, ''); // Remove null bytes
}

/**
 * Redact sensitive field names
 */
const SENSITIVE_FIELD_NAMES = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'apiKey',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'privatekey',
  'private_key',
  'privateKey',
  'accesstoken',
  'access_token',
  'accessToken',
  'refreshtoken',
  'refresh_token',
  'refreshToken',
  'sessionid',
  'session_id',
  'sessionId',
  'cookie',
  'cookies',
];

/**
 * Redact sensitive fields from object
 */
export function redactSensitiveFields(
  obj: any,
  redactValue: string = '[REDACTED]'
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveFields(item, redactValue));
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELD_NAMES.some(sensitive =>
      keyLower.includes(sensitive)
    );

    if (isSensitive) {
      redacted[key] = redactValue;
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveFields(value, redactValue);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Detect potential PII in strings
 */
export function detectPII(text: string): boolean {
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{16}\b/, // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b\d{3}-\d{3}-\d{4}\b/, // Phone number
  ];

  return piiPatterns.some(pattern => pattern.test(text));
}

/**
 * Redact PII from string
 */
export function redactPII(text: string): string {
  let redacted = text;

  // Redact SSN
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, 'XXX-XX-XXXX');

  // Redact credit card
  redacted = redacted.replace(/\b\d{16}\b/g, 'XXXX-XXXX-XXXX-XXXX');

  // Redact email (keep domain)
  redacted = redacted.replace(
    /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g,
    '****@$2'
  );

  // Redact phone number
  redacted = redacted.replace(/\b\d{3}-\d{3}-\d{4}\b/g, 'XXX-XXX-XXXX');

  return redacted;
}
