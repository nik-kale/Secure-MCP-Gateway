/**
 * Comprehensive test suite for SecureMCPGateway
 */

import { SecureMCPGateway, GatewayConfig } from '../gateway.js';
import { createDefaultPolicy } from '../policy-engine.js';
import {
  CallerIdentity,
  OperationSeverity,
  PolicyEffect,
  IAuditLogger,
  ToolCallContext,
  PolicyDecision,
} from '../types.js';

// Mock audit logger for testing
class MockAuditLogger implements IAuditLogger {
  logs: any[] = [];

  async logToolCall(context: ToolCallContext, decision: PolicyDecision): Promise<void> {
    this.logs.push({ type: 'tool_call', context, decision });
  }

  async logApprovalGranted(context: ToolCallContext, approvedBy: CallerIdentity): Promise<void> {
    this.logs.push({ type: 'approval_granted', context, approvedBy });
  }

  async logApprovalDenied(context: ToolCallContext, deniedBy: CallerIdentity): Promise<void> {
    this.logs.push({ type: 'approval_denied', context, deniedBy });
  }

  async logExecutionSuccess(context: ToolCallContext, output?: unknown): Promise<void> {
    this.logs.push({ type: 'execution_success', context, output });
  }

  async logExecutionFailure(context: ToolCallContext, error: string): Promise<void> {
    this.logs.push({ type: 'execution_failure', context, error });
  }

  clear() {
    this.logs = [];
  }
}

describe('SecureMCPGateway', () => {
  let gateway: SecureMCPGateway;
  let mockLogger: MockAuditLogger;
  let testCaller: CallerIdentity;

  beforeEach(() => {
    mockLogger = new MockAuditLogger();
    const config: GatewayConfig = {
      policy: createDefaultPolicy(),
      auditLogger: mockLogger,
      approvalTTL: 60000,
    };
    gateway = new SecureMCPGateway(config);

    testCaller = {
      id: 'test-caller-001',
      name: 'Test Caller',
      type: 'agent',
    };
  });

  describe('evaluateToolCall', () => {
    test('should allow safe operations', async () => {
      const result = await gateway.evaluateToolCall(
        'jira',
        'search_issues',
        OperationSeverity.SAFE,
        testCaller
      );

      expect(result.allowed).toBe(true);
      expect(result.decision.effect).toBe(PolicyEffect.ALLOW);
      expect(result.context).toBeDefined();
      expect(mockLogger.logs).toHaveLength(1);
      expect(mockLogger.logs[0].type).toBe('tool_call');
    });

    test('should require review for medium operations', async () => {
      const result = await gateway.evaluateToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller
      );

      expect(result.allowed).toBe(false);
      expect(result.decision.effect).toBe(PolicyEffect.REVIEW);
      expect(result.approvalToken).toBeDefined();
    });

    test('should deny critical delete operations', async () => {
      const result = await gateway.evaluateToolCall(
        'database',
        'delete_database',
        OperationSeverity.CRITICAL,
        testCaller
      );

      expect(result.allowed).toBe(false);
      expect(result.decision.effect).toBe(PolicyEffect.DENY);
      expect(result.approvalToken).toBeUndefined();
    });

    test('should include args and metadata in context', async () => {
      const args = { issueKey: 'PROJ-123' };
      const metadata = { sessionId: 'session-001' };

      const result = await gateway.evaluateToolCall(
        'jira',
        'get_issue',
        OperationSeverity.SAFE,
        testCaller,
        args,
        metadata
      );

      expect(result.context.args).toEqual(args);
      expect(result.context.metadata).toEqual(metadata);
    });
  });

  describe('executeToolCall', () => {
    test('should execute allowed operations', async () => {
      const mockExecutor = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await gateway.executeToolCall(
        'jira',
        'search_issues',
        OperationSeverity.SAFE,
        testCaller,
        mockExecutor
      );

      expect(result.allowed).toBe(true);
      expect(result.result?.success).toBe(true);
      expect(result.result?.output).toEqual({ data: 'success' });
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      // Should have logged: tool_call, execution_success
      expect(mockLogger.logs.filter(l => l.type === 'tool_call')).toHaveLength(1);
      expect(mockLogger.logs.filter(l => l.type === 'execution_success')).toHaveLength(1);
    });

    test('should not execute denied operations', async () => {
      const mockExecutor = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await gateway.executeToolCall(
        'database',
        'delete_database',
        OperationSeverity.CRITICAL,
        testCaller,
        mockExecutor
      );

      expect(result.allowed).toBe(false);
      expect(result.result).toBeUndefined();
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    test('should not execute operations requiring review', async () => {
      const mockExecutor = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await gateway.executeToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller,
        mockExecutor
      );

      expect(result.allowed).toBe(false);
      expect(result.approvalToken).toBeDefined();
      expect(result.result).toBeUndefined();
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    test('should handle execution errors', async () => {
      const mockExecutor = jest.fn().mockRejectedValue(new Error('Execution failed'));

      const result = await gateway.executeToolCall(
        'jira',
        'search_issues',
        OperationSeverity.SAFE,
        testCaller,
        mockExecutor
      );

      expect(result.allowed).toBe(true);
      expect(result.result?.success).toBe(false);
      expect(result.result?.error).toBe('Execution failed');

      // Should have logged: tool_call, execution_failure
      expect(mockLogger.logs.filter(l => l.type === 'execution_failure')).toHaveLength(1);
    });

    test('should handle non-Error exceptions', async () => {
      const mockExecutor = jest.fn().mockRejectedValue('String error');

      const result = await gateway.executeToolCall(
        'jira',
        'search_issues',
        OperationSeverity.SAFE,
        testCaller,
        mockExecutor
      );

      expect(result.result?.success).toBe(false);
      expect(result.result?.error).toBe('String error');
    });
  });

  describe('grantApprovalAndExecute', () => {
    test('should execute after approval granted', async () => {
      // First, create a pending approval
      const evalResult = await gateway.evaluateToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller
      );

      const approvalToken = evalResult.approvalToken!;
      mockLogger.clear();

      // Grant approval and execute
      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const mockExecutor = jest.fn().mockResolvedValue({ comment: 'added' });

      const result = await gateway.grantApprovalAndExecute(
        approvalToken,
        approver,
        mockExecutor
      );

      expect(result.allowed).toBe(true);
      expect(result.result?.success).toBe(true);
      expect(result.result?.output).toEqual({ comment: 'added' });
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      // Should have logged: approval_granted, execution_success
      expect(mockLogger.logs.filter(l => l.type === 'approval_granted')).toHaveLength(1);
      expect(mockLogger.logs.filter(l => l.type === 'execution_success')).toHaveLength(1);
    });

    test('should fail with invalid approval token', async () => {
      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const mockExecutor = jest.fn().mockResolvedValue({ data: 'success' });

      await expect(
        gateway.grantApprovalAndExecute('invalid-token', approver, mockExecutor)
      ).rejects.toThrow('Failed to grant approval');

      expect(mockExecutor).not.toHaveBeenCalled();
    });

    test('should handle execution failure after approval', async () => {
      // Create pending approval
      const evalResult = await gateway.evaluateToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller
      );

      const approvalToken = evalResult.approvalToken!;
      mockLogger.clear();

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const mockExecutor = jest.fn().mockRejectedValue(new Error('Failed to add comment'));

      const result = await gateway.grantApprovalAndExecute(
        approvalToken,
        approver,
        mockExecutor
      );

      expect(result.allowed).toBe(true);
      expect(result.result?.success).toBe(false);
      expect(result.result?.error).toBe('Failed to add comment');

      // Should have logged: approval_granted, execution_failure
      expect(mockLogger.logs.filter(l => l.type === 'approval_granted')).toHaveLength(1);
      expect(mockLogger.logs.filter(l => l.type === 'execution_failure')).toHaveLength(1);
    });
  });

  describe('denyApproval', () => {
    test('should deny approval successfully', async () => {
      // Create pending approval
      const evalResult = await gateway.evaluateToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller
      );

      const approvalToken = evalResult.approvalToken!;
      mockLogger.clear();

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      await gateway.denyApproval(approvalToken, denier);

      // Should have logged: approval_denied
      expect(mockLogger.logs.filter(l => l.type === 'approval_denied')).toHaveLength(1);
      expect(mockLogger.logs[0].deniedBy.id).toBe('denier-001');
    });

    test('should fail with invalid approval token', async () => {
      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      await expect(
        gateway.denyApproval('invalid-token', denier)
      ).rejects.toThrow('Failed to deny approval');
    });
  });

  describe('listPendingApprovals', () => {
    test('should list pending approvals', async () => {
      // Create multiple pending approvals
      await gateway.evaluateToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller
      );

      await gateway.evaluateToolCall(
        'kubernetes',
        'restart_service',
        OperationSeverity.HIGH,
        testCaller
      );

      const pending = gateway.listPendingApprovals();
      expect(pending).toHaveLength(2);
    });

    test('should not include approved or denied approvals', async () => {
      const result1 = await gateway.evaluateToolCall(
        'jira',
        'add_comment',
        OperationSeverity.MEDIUM,
        testCaller
      );

      const result2 = await gateway.evaluateToolCall(
        'kubernetes',
        'restart_service',
        OperationSeverity.HIGH,
        testCaller
      );

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      // Approve one
      const mockExecutor = jest.fn().mockResolvedValue({});
      await gateway.grantApprovalAndExecute(result1.approvalToken!, approver, mockExecutor);

      const pending = gateway.listPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].token).toBe(result2.approvalToken);
    });
  });

  describe('getPolicyEngine', () => {
    test('should return policy engine', () => {
      const engine = gateway.getPolicyEngine();
      expect(engine).toBeDefined();
      expect(engine.getConfig()).toBeDefined();
    });
  });

  describe('getApprovalManager', () => {
    test('should return approval manager', () => {
      const manager = gateway.getApprovalManager();
      expect(manager).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete workflow: evaluate -> approve -> execute', async () => {
      // 1. Evaluate
      const evalResult = await gateway.evaluateToolCall(
        'jira',
        'transition_issue',
        OperationSeverity.MEDIUM,
        testCaller,
        { issueKey: 'PROJ-123', transitionId: '5' }
      );

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.approvalToken).toBeDefined();

      // 2. Approve
      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const mockExecutor = jest.fn().mockResolvedValue({ success: true });

      const execResult = await gateway.grantApprovalAndExecute(
        evalResult.approvalToken!,
        approver,
        mockExecutor
      );

      // 3. Verify execution
      expect(execResult.allowed).toBe(true);
      expect(execResult.result?.success).toBe(true);
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    test('should handle complete workflow: evaluate -> deny', async () => {
      const evalResult = await gateway.evaluateToolCall(
        'jira',
        'transition_issue',
        OperationSeverity.MEDIUM,
        testCaller
      );

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      await gateway.denyApproval(evalResult.approvalToken!, denier);

      // Approval should no longer be pending
      const pending = gateway.listPendingApprovals();
      expect(pending.find(a => a.token === evalResult.approvalToken)).toBeUndefined();
    });
  });
});
