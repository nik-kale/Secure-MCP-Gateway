/**
 * Audit logging for tool calls, policy decisions, and approvals.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  AuditLogEntry,
  ToolCallContext,
  PolicyDecision,
  CallerIdentity,
} from './types.js';
import { redactSensitiveFields } from './validation.js';

/**
 * Configuration for audit logger.
 */
export interface AuditLoggerConfig {
  /** Log to console (stdout) */
  logToConsole?: boolean;
  /** Log to file */
  logToFile?: boolean;
  /** File path for audit log */
  filePath?: string;
  /** Pretty print JSON logs */
  prettyPrint?: boolean;
}

/**
 * Audit logger interface for extensibility.
 */
export interface IAuditLogger {
  logToolCall(context: ToolCallContext, decision: PolicyDecision): Promise<void>;
  logApprovalGranted(context: ToolCallContext, approvedBy: CallerIdentity): Promise<void>;
  logApprovalDenied(context: ToolCallContext, deniedBy: CallerIdentity): Promise<void>;
  logExecutionSuccess(context: ToolCallContext, output?: unknown): Promise<void>;
  logExecutionFailure(context: ToolCallContext, error: string): Promise<void>;
}

/**
 * Default audit logger implementation that writes to console and/or file.
 */
export class AuditLogger implements IAuditLogger {
  private config: AuditLoggerConfig;

  constructor(config?: AuditLoggerConfig) {
    this.config = {
      logToConsole: true,
      logToFile: false,
      prettyPrint: true,
      ...config,
    };

    // Create log directory if logging to file
    if (this.config.logToFile && this.config.filePath) {
      const dir = path.dirname(this.config.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Log a tool call with its policy decision.
   */
  public async logToolCall(context: ToolCallContext, decision: PolicyDecision): Promise<void> {
    // Redact sensitive fields from context before logging
    const redactedContext = {
      ...context,
      args: context.args ? redactSensitiveFields(context.args) : undefined,
      metadata: context.metadata ? redactSensitiveFields(context.metadata) : undefined,
    };

    const entry: AuditLogEntry = {
      entryId: uuidv4(),
      timestamp: new Date(),
      eventType: 'tool_call',
      context: redactedContext,
      decision,
    };

    await this.writeLogEntry(entry);

    const policyEntry: AuditLogEntry = {
      entryId: uuidv4(),
      timestamp: new Date(),
      eventType: 'policy_decision',
      context: redactedContext,
      decision,
    };

    await this.writeLogEntry(policyEntry);
  }

  /**
   * Log an approval granted event.
   */
  public async logApprovalGranted(
    context: ToolCallContext,
    approvedBy: CallerIdentity
  ): Promise<void> {
    const entry: AuditLogEntry = {
      entryId: uuidv4(),
      timestamp: new Date(),
      eventType: 'approval_granted',
      context,
      approval: {
        approvedBy,
        approvedAt: new Date(),
      },
    };

    await this.writeLogEntry(entry);
  }

  /**
   * Log an approval denied event.
   */
  public async logApprovalDenied(
    context: ToolCallContext,
    deniedBy: CallerIdentity
  ): Promise<void> {
    const entry: AuditLogEntry = {
      entryId: uuidv4(),
      timestamp: new Date(),
      eventType: 'approval_denied',
      context,
      approval: {
        approvedBy: deniedBy,
        approvedAt: new Date(),
      },
    };

    await this.writeLogEntry(entry);
  }

  /**
   * Log successful execution of a tool call.
   */
  public async logExecutionSuccess(context: ToolCallContext, output?: unknown): Promise<void> {
    // Redact sensitive fields from output
    const redactedOutput = output && typeof output === 'object'
      ? redactSensitiveFields(output)
      : output;

    const redactedContext = {
      ...context,
      args: context.args ? redactSensitiveFields(context.args) : undefined,
      metadata: context.metadata ? redactSensitiveFields(context.metadata) : undefined,
    };

    const entry: AuditLogEntry = {
      entryId: uuidv4(),
      timestamp: new Date(),
      eventType: 'execution_success',
      context: redactedContext,
      result: {
        success: true,
        output: redactedOutput,
      },
    };

    await this.writeLogEntry(entry);
  }

  /**
   * Log failed execution of a tool call.
   */
  public async logExecutionFailure(context: ToolCallContext, error: string): Promise<void> {
    const entry: AuditLogEntry = {
      entryId: uuidv4(),
      timestamp: new Date(),
      eventType: 'execution_failure',
      context,
      result: {
        success: false,
        error,
      },
    };

    await this.writeLogEntry(entry);
  }

  /**
   * Write a log entry to configured outputs.
   */
  private async writeLogEntry(entry: AuditLogEntry): Promise<void> {
    const logLine = this.config.prettyPrint
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    // Log to console
    if (this.config.logToConsole) {
      this.logToConsole(entry, logLine);
    }

    // Log to file
    if (this.config.logToFile && this.config.filePath) {
      await this.logToFile(logLine);
    }
  }

  /**
   * Write to console with color coding based on event type.
   */
  private logToConsole(entry: AuditLogEntry, logLine: string): void {
    const prefix = `[AUDIT ${entry.eventType.toUpperCase()}]`;

    // Color code based on event type
    switch (entry.eventType) {
      case 'policy_decision':
        if (entry.decision?.effect === 'deny') {
          console.error(`\x1b[31m${prefix}\x1b[0m`, logLine);
        } else if (entry.decision?.effect === 'review') {
          console.warn(`\x1b[33m${prefix}\x1b[0m`, logLine);
        } else {
          console.log(`\x1b[32m${prefix}\x1b[0m`, logLine);
        }
        break;
      case 'approval_denied':
      case 'execution_failure':
        console.error(`\x1b[31m${prefix}\x1b[0m`, logLine);
        break;
      case 'approval_granted':
      case 'execution_success':
        console.log(`\x1b[32m${prefix}\x1b[0m`, logLine);
        break;
      default:
        console.log(`\x1b[36m${prefix}\x1b[0m`, logLine);
    }
  }

  /**
   * Append to log file.
   */
  private async logToFile(logLine: string): Promise<void> {
    if (!this.config.filePath) return;

    return new Promise((resolve, reject) => {
      fs.appendFile(this.config.filePath!, logLine + '\n', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
