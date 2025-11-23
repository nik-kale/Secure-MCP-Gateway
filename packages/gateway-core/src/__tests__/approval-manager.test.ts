/**
 * Comprehensive test suite for ApprovalManager
 */

import { ApprovalManager } from '../approval-manager.js';
import {
  CallerIdentity,
  PolicyDecision,
  PolicyEffect,
  ToolCallContext,
  OperationSeverity,
} from '../types.js';

describe('ApprovalManager', () => {
  let manager: ApprovalManager;
  let testContext: ToolCallContext;
  let testDecision: PolicyDecision;
  let testCaller: CallerIdentity;

  beforeEach(() => {
    manager = new ApprovalManager({ defaultTTL: 60000 }); // 1 minute for tests

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
      effect: PolicyEffect.REVIEW,
      reason: 'Test approval required',
      rule: 'test-rule',
      approvalToken: 'test-token-001',
    };
  });

  describe('createApproval', () => {
    test('should create a new pending approval', () => {
      const approval = manager.createApproval(testContext, testDecision);

      expect(approval.token).toBe('test-token-001');
      expect(approval.context).toEqual(testContext);
      expect(approval.decision).toEqual(testDecision);
      expect(approval.status).toBe('pending');
      expect(approval.createdAt).toBeInstanceOf(Date);
      expect(approval.expiresAt).toBeInstanceOf(Date);
    });

    test('should throw error if decision has no approval token', () => {
      const invalidDecision = { ...testDecision, approvalToken: undefined };

      expect(() => {
        manager.createApproval(testContext, invalidDecision);
      }).toThrow('Cannot create approval without approval token');
    });

    test('should set expiration based on default TTL', () => {
      const approval = manager.createApproval(testContext, testDecision);
      const expectedExpiry = new Date(approval.createdAt.getTime() + 60000);

      expect(approval.expiresAt!.getTime()).toBeCloseTo(expectedExpiry.getTime(), -2);
    });

    test('should set expiration based on custom TTL', () => {
      const customTTL = 120000; // 2 minutes
      const approval = manager.createApproval(testContext, testDecision, customTTL);
      const expectedExpiry = new Date(approval.createdAt.getTime() + customTTL);

      expect(approval.expiresAt!.getTime()).toBeCloseTo(expectedExpiry.getTime(), -2);
    });

    test('should store approval for later retrieval', () => {
      manager.createApproval(testContext, testDecision);
      const retrieved = manager.getApproval('test-token-001');

      expect(retrieved).toBeDefined();
      expect(retrieved!.token).toBe('test-token-001');
    });
  });

  describe('getApproval', () => {
    test('should retrieve an existing approval', () => {
      manager.createApproval(testContext, testDecision);
      const approval = manager.getApproval('test-token-001');

      expect(approval).toBeDefined();
      expect(approval!.token).toBe('test-token-001');
    });

    test('should return undefined for non-existent token', () => {
      const approval = manager.getApproval('non-existent-token');
      expect(approval).toBeUndefined();
    });
  });

  describe('listPendingApprovals', () => {
    test('should list only pending approvals', () => {
      const decision1 = { ...testDecision, approvalToken: 'token-001' };
      const decision2 = { ...testDecision, approvalToken: 'token-002' };
      const decision3 = { ...testDecision, approvalToken: 'token-003' };

      manager.createApproval(testContext, decision1);
      manager.createApproval(testContext, decision2);
      manager.createApproval(testContext, decision3);

      // Approve one
      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };
      manager.grantApproval('token-002', approver);

      const pending = manager.listPendingApprovals();
      expect(pending).toHaveLength(2);
      expect(pending.map(a => a.token)).toEqual(['token-001', 'token-003']);
    });

    test('should return empty array when no pending approvals', () => {
      const pending = manager.listPendingApprovals();
      expect(pending).toEqual([]);
    });
  });

  describe('grantApproval', () => {
    test('should grant approval successfully', () => {
      manager.createApproval(testContext, testDecision);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const result = manager.grantApproval('test-token-001', approver);

      expect(result.success).toBe(true);
      expect(result.approval).toBeDefined();
      expect(result.approval!.status).toBe('approved');
    });

    test('should fail if token not found', () => {
      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const result = manager.grantApproval('non-existent-token', approver);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Approval token not found');
    });

    test('should fail if approval is already approved', () => {
      manager.createApproval(testContext, testDecision);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      manager.grantApproval('test-token-001', approver);
      const result = manager.grantApproval('test-token-001', approver);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Approval is already approved');
    });

    test('should fail if approval is already denied', () => {
      manager.createApproval(testContext, testDecision);

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      manager.denyApproval('test-token-001', denier);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      const result = manager.grantApproval('test-token-001', approver);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Approval is already denied');
    });

    test('should fail if approval has expired', () => {
      // Create approval with very short TTL
      const shortTTL = 10; // 10ms
      manager.createApproval(testContext, testDecision, shortTTL);

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const approver: CallerIdentity = {
            id: 'approver-001',
            name: 'Approver',
            type: 'human',
          };

          const result = manager.grantApproval('test-token-001', approver);

          expect(result.success).toBe(false);
          expect(result.error).toBe('Approval token has expired');

          // Verify status was updated
          const approval = manager.getApproval('test-token-001');
          expect(approval!.status).toBe('expired');

          resolve();
        }, 50);
      });
    });
  });

  describe('denyApproval', () => {
    test('should deny approval successfully', () => {
      manager.createApproval(testContext, testDecision);

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      const result = manager.denyApproval('test-token-001', denier);

      expect(result.success).toBe(true);
      expect(result.approval).toBeDefined();
      expect(result.approval!.status).toBe('denied');
    });

    test('should fail if token not found', () => {
      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      const result = manager.denyApproval('non-existent-token', denier);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Approval token not found');
    });

    test('should fail if approval is already denied', () => {
      manager.createApproval(testContext, testDecision);

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      manager.denyApproval('test-token-001', denier);
      const result = manager.denyApproval('test-token-001', denier);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Approval is already denied');
    });

    test('should fail if approval is already approved', () => {
      manager.createApproval(testContext, testDecision);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      manager.grantApproval('test-token-001', approver);

      const denier: CallerIdentity = {
        id: 'denier-001',
        name: 'Denier',
        type: 'human',
      };

      const result = manager.denyApproval('test-token-001', denier);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Approval is already approved');
    });
  });

  describe('Automatic Expiration', () => {
    test('should automatically expire approvals after TTL', () => {
      const shortTTL = 50; // 50ms
      manager.createApproval(testContext, testDecision, shortTTL);

      const approval = manager.getApproval('test-token-001');
      expect(approval!.status).toBe('pending');

      // Wait for automatic expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const expiredApproval = manager.getApproval('test-token-001');
          expect(expiredApproval!.status).toBe('expired');
          resolve();
        }, 100);
      });
    });
  });

  describe('cleanup', () => {
    test('should remove old completed approvals', () => {
      // Create multiple approvals
      const decision1 = { ...testDecision, approvalToken: 'token-001' };
      const decision2 = { ...testDecision, approvalToken: 'token-002' };
      const decision3 = { ...testDecision, approvalToken: 'token-003' };

      manager.createApproval(testContext, decision1);
      manager.createApproval(testContext, decision2);
      manager.createApproval(testContext, decision3);

      // Approve some
      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };
      manager.grantApproval('token-001', approver);
      manager.grantApproval('token-002', approver);

      // Cleanup old ones (set cutoff to future to clean all non-pending)
      const futureDate = new Date(Date.now() + 1000000);
      const cleaned = manager.cleanup(futureDate);

      expect(cleaned).toBe(2); // Should have cleaned 2 approved approvals

      // Pending should still exist
      expect(manager.getApproval('token-003')).toBeDefined();

      // Approved should be removed
      expect(manager.getApproval('token-001')).toBeUndefined();
      expect(manager.getApproval('token-002')).toBeUndefined();
    });

    test('should not remove recent completed approvals', () => {
      const decision1 = { ...testDecision, approvalToken: 'token-001' };
      manager.createApproval(testContext, decision1);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };
      manager.grantApproval('token-001', approver);

      // Cleanup with cutoff in the past (should not clean recent ones)
      const pastDate = new Date(Date.now() - 1000);
      const cleaned = manager.cleanup(pastDate);

      expect(cleaned).toBe(0);
      expect(manager.getApproval('token-001')).toBeDefined();
    });

    test('should use default cutoff of 24 hours if not specified', () => {
      const decision1 = { ...testDecision, approvalToken: 'token-001' };
      manager.createApproval(testContext, decision1);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };
      manager.grantApproval('token-001', approver);

      // Cleanup without cutoff (default 24 hours ago)
      const cleaned = manager.cleanup();

      // Recent approval should not be cleaned
      expect(cleaned).toBe(0);
      expect(manager.getApproval('token-001')).toBeDefined();
    });
  });

  describe('Multiple Approvals Workflow', () => {
    test('should handle multiple concurrent approvals', () => {
      const decisions = [
        { ...testDecision, approvalToken: 'token-001' },
        { ...testDecision, approvalToken: 'token-002' },
        { ...testDecision, approvalToken: 'token-003' },
      ];

      decisions.forEach(decision => {
        manager.createApproval(testContext, decision);
      });

      expect(manager.listPendingApprovals()).toHaveLength(3);

      const approver: CallerIdentity = {
        id: 'approver-001',
        name: 'Approver',
        type: 'human',
      };

      // Approve first
      manager.grantApproval('token-001', approver);
      expect(manager.listPendingApprovals()).toHaveLength(2);

      // Deny second
      manager.denyApproval('token-002', approver);
      expect(manager.listPendingApprovals()).toHaveLength(1);

      // Third still pending
      const pending = manager.listPendingApprovals();
      expect(pending[0].token).toBe('token-003');
    });
  });

  describe('Edge Cases', () => {
    test('should handle approval with no expiration', () => {
      // Create manager with no default TTL
      const noTTLManager = new ApprovalManager({ defaultTTL: undefined });
      const decision = { ...testDecision, approvalToken: 'token-no-ttl' };

      const approval = noTTLManager.createApproval(testContext, decision);

      expect(approval.expiresAt).toBeUndefined();
    });

    test('should handle very long TTL', () => {
      const longTTL = 365 * 24 * 60 * 60 * 1000; // 1 year
      const approval = manager.createApproval(testContext, testDecision, longTTL);

      const expectedExpiry = new Date(approval.createdAt.getTime() + longTTL);
      expect(approval.expiresAt!.getTime()).toBeCloseTo(expectedExpiry.getTime(), -2);
    });

    test('should handle zero TTL', () => {
      const approval = manager.createApproval(testContext, testDecision, 0);

      expect(approval.expiresAt!.getTime()).toBeCloseTo(approval.createdAt.getTime(), -2);
    });
  });
});
