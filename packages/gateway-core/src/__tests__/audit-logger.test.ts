/**
 * Comprehensive test suite for AuditLogger
 */

import * as fs from 'fs';
import * as path from 'path';
import { AuditLogger } from '../audit-logger.js';
import {
  CallerIdentity,
  PolicyDecision,
  PolicyEffect,
  ToolCallContext,
  OperationSeverity,
} from '../types.js';

describe('AuditLogger', () => {
  let testContext: ToolCallContext;
  let testDecision: PolicyDecision;
  let testCaller: CallerIdentity;
  const testLogPath = '/tmp/test-audit.log';

  beforeEach(() => {
    testCaller = {
      id: 'test-caller-001',
      name: 'Test Caller',
      type: 'agent',
    };

    testContext = {
      callId: 'test-call-001',
      tool: 'test-tool',
      action: 'test-action',
      severity: OperationSeverity.MEDIUM,
      caller: testCaller,
      timestamp: new Date(),
    };

    testDecision = {
      effect: PolicyEffect.ALLOW,
      reason: 'Test decision',
      rule: 'test-rule',
    };

    // Clean up test log file
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  describe('Constructor and Configuration', () => {
    test('should create logger with default configuration', () => {
      const logger = new AuditLogger();
      expect(logger).toBeDefined();
    });

    test('should create logger with custom configuration', () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });
      expect(logger).toBeDefined();
    });

    test('should create log directory if it does not exist', () => {
      const logDir = '/tmp/test-audit-dir';
      const logPath = path.join(logDir, 'audit.log');

      // Ensure directory doesn't exist
      if (fs.existsSync(logDir)) {
        fs.rmSync(logDir, { recursive: true });
      }

      const logger = new AuditLogger({
        logToFile: true,
        filePath: logPath,
      });

      expect(fs.existsSync(logDir)).toBe(true);

      // Cleanup
      fs.rmSync(logDir, { recursive: true });
    });
  });

  describe('logToolCall', () => {
    test('should log tool call event', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      await logger.logToolCall(testContext, testDecision);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      expect(lines.length).toBe(2); // tool_call + policy_decision

      const toolCallEntry = JSON.parse(lines[0]);
      expect(toolCallEntry.eventType).toBe('tool_call');
      expect(toolCallEntry.context.callId).toBe('test-call-001');

      const policyEntry = JSON.parse(lines[1]);
      expect(policyEntry.eventType).toBe('policy_decision');
      expect(policyEntry.decision.effect).toBe('allow');
    });
  });

  describe('logApprovalGranted', () => {
    test('should log approval granted event', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      await logger.logApprovalGranted(testContext, approver);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(logContent.trim());

      expect(entry.eventType).toBe('approval_granted');
      expect(entry.approval.approvedBy.id).toBe('approver-001');
      expect(entry.approval.approvedAt).toBeDefined();
    });
  });

  describe('logApprovalDenied', () => {
    test('should log approval denied event', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      await logger.logApprovalDenied(testContext, denier);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(logContent.trim());

      expect(entry.eventType).toBe('approval_denied');
      expect(entry.approval.approvedBy.id).toBe('denier-001');
    });
  });

  describe('logExecutionSuccess', () => {
    test('should log successful execution', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      const output = { result: 'success', data: [1, 2, 3] };

      await logger.logExecutionSuccess(testContext, output);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(logContent.trim());

      expect(entry.eventType).toBe('execution_success');
      expect(entry.result.success).toBe(true);
      expect(entry.result.output).toEqual(output);
    });

    test('should log execution success without output', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      await logger.logExecutionSuccess(testContext);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(logContent.trim());

      expect(entry.eventType).toBe('execution_success');
      expect(entry.result.success).toBe(true);
      expect(entry.result.output).toBeUndefined();
    });
  });

  describe('logExecutionFailure', () => {
    test('should log execution failure', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      const error = 'Something went wrong';

      await logger.logExecutionFailure(testContext, error);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const entry = JSON.parse(logContent.trim());

      expect(entry.eventType).toBe('execution_failure');
      expect(entry.result.success).toBe(false);
      expect(entry.result.error).toBe(error);
    });
  });

  describe('Log Entry Structure', () => {
    test('should include all required fields in log entry', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      await logger.logToolCall(testContext, testDecision);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');
      const entry = JSON.parse(lines[0]);

      expect(entry.entryId).toBeDefined();
      expect(typeof entry.entryId).toBe('string');
      expect(entry.timestamp).toBeDefined();
      expect(entry.eventType).toBeDefined();
      expect(entry.context).toBeDefined();
    });

    test('should generate unique entry IDs', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      await logger.logToolCall(testContext, testDecision);
      await logger.logToolCall(testContext, testDecision);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[2]); // Skip policy_decision

      expect(entry1.entryId).not.toBe(entry2.entryId);
    });
  });

  describe('Pretty Print', () => {
    test('should pretty print when enabled', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: true,
      });

      await logger.logExecutionSuccess(testContext, { test: 'data' });

      const logContent = fs.readFileSync(testLogPath, 'utf-8');

      // Pretty printed JSON should have newlines and indentation
      expect(logContent).toContain('\n');
      expect(logContent).toContain('  '); // Indentation
    });

    test('should not pretty print when disabled', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      await logger.logExecutionSuccess(testContext, { test: 'data' });

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      // Each log entry should be on a single line
      expect(lines.length).toBe(1);

      // Should be valid JSON
      expect(() => JSON.parse(lines[0])).not.toThrow();
    });
  });

  describe('Console vs File Logging', () => {
    test('should only log to console when file logging disabled', async () => {
      const logger = new AuditLogger({
        logToConsole: true,
        logToFile: false,
      });

      await logger.logToolCall(testContext, testDecision);

      // File should not exist
      expect(fs.existsSync(testLogPath)).toBe(false);
    });

    test('should only log to file when console logging disabled', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
      });

      await logger.logToolCall(testContext, testDecision);

      // File should exist
      expect(fs.existsSync(testLogPath)).toBe(true);
    });

    test('should log to both when both enabled', async () => {
      const logger = new AuditLogger({
        logToConsole: true,
        logToFile: true,
        filePath: testLogPath,
      });

      await logger.logToolCall(testContext, testDecision);

      // File should exist
      expect(fs.existsSync(testLogPath)).toBe(true);

      // Console would also have output (but we can't easily test that)
    });
  });

  describe('Concurrent Logging', () => {
    test('should handle multiple concurrent log calls', async () => {
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: testLogPath,
        prettyPrint: false,
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(logger.logExecutionSuccess(testContext, { index: i }));
      }

      await Promise.all(promises);

      const logContent = fs.readFileSync(testLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      expect(lines.length).toBe(10);
    });
  });

  describe('Error Handling', () => {
    test('should handle write errors gracefully', async () => {
      // Create logger with invalid path (read-only directory)
      const logger = new AuditLogger({
        logToConsole: false,
        logToFile: true,
        filePath: '/invalid/path/audit.log',
      });

      // Should not throw, but log write will fail silently
      // In a real implementation, you might want to add error handling
      await expect(
        logger.logToolCall(testContext, testDecision)
      ).rejects.toThrow();
    });
  });
});
