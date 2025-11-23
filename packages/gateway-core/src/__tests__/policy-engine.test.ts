/**
 * Comprehensive test suite for PolicyEngine
 */

import { PolicyEngine, createDefaultPolicy } from '../policy-engine.js';
import {
  PolicyConfig,
  PolicyEffect,
  OperationSeverity,
  ToolCallContext,
  CallerIdentity,
} from '../types.js';

describe('PolicyEngine', () => {
  let defaultCaller: CallerIdentity;

  beforeEach(() => {
    defaultCaller = {
      id: 'test-agent-001',
      name: 'Test Agent',
      type: 'agent',
    };
  });

  describe('Basic Policy Evaluation', () => {
    test('should allow safe operations with default policy', () => {
      const engine = new PolicyEngine(createDefaultPolicy());
      const context: ToolCallContext = {
        callId: 'test-001',
        tool: 'jira',
        action: 'search_issues',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);

      expect(decision.effect).toBe(PolicyEffect.ALLOW);
      expect(decision.reason).toContain('Safe read-only operation');
      expect(decision.rule).toBe('allow-safe-reads');
    });

    test('should require review for medium operations', () => {
      const engine = new PolicyEngine(createDefaultPolicy());
      const context: ToolCallContext = {
        callId: 'test-002',
        tool: 'jira',
        action: 'add_comment',
        severity: OperationSeverity.MEDIUM,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);

      expect(decision.effect).toBe(PolicyEffect.REVIEW);
      expect(decision.reason).toContain('Medium-risk');
      expect(decision.rule).toBe('review-medium-writes');
      expect(decision.approvalToken).toBeDefined();
    });

    test('should require review for high operations', () => {
      const engine = new PolicyEngine(createDefaultPolicy());
      const context: ToolCallContext = {
        callId: 'test-003',
        tool: 'kubernetes',
        action: 'restart_service',
        severity: OperationSeverity.HIGH,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);

      expect(decision.effect).toBe(PolicyEffect.REVIEW);
      expect(decision.reason).toContain('High-risk');
      expect(decision.rule).toBe('review-high-risk');
    });

    test('should deny critical delete operations', () => {
      const engine = new PolicyEngine(createDefaultPolicy());
      const context: ToolCallContext = {
        callId: 'test-004',
        tool: 'database',
        action: 'delete_database',
        severity: OperationSeverity.CRITICAL,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);

      expect(decision.effect).toBe(PolicyEffect.DENY);
      expect(decision.reason).toContain('Critical delete operations are not allowed');
      expect(decision.rule).toBe('deny-critical-delete');
    });
  });

  describe('Pattern Matching', () => {
    test('should match wildcard patterns in action', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'deny-all-deletes',
            match: { action: 'delete_*' },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-005',
        tool: 'test',
        action: 'delete_pod',
        severity: OperationSeverity.HIGH,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.effect).toBe(PolicyEffect.DENY);
      expect(decision.rule).toBe('deny-all-deletes');
    });

    test('should match wildcard patterns in tool', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'review-cloud-ops',
            match: { tool: 'cloud-*' },
            effect: PolicyEffect.REVIEW,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-006',
        tool: 'cloud-aws',
        action: 'create_instance',
        severity: OperationSeverity.MEDIUM,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.effect).toBe(PolicyEffect.REVIEW);
    });

    test('should match exact strings without wildcards', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'allow-specific-tool',
            match: { tool: 'jira', action: 'get_issue' },
            effect: PolicyEffect.ALLOW,
          },
        ],
        defaultEffect: PolicyEffect.DENY,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-007',
        tool: 'jira',
        action: 'get_issue',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.effect).toBe(PolicyEffect.ALLOW);
    });

    test('should be case-insensitive in pattern matching', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'test-rule',
            match: { action: 'Delete_*' },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-008',
        tool: 'test',
        action: 'delete_resource',
        severity: OperationSeverity.HIGH,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.effect).toBe(PolicyEffect.DENY);
    });
  });

  describe('Severity Matching', () => {
    test('should match minimum severity correctly', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'review-medium-and-above',
            match: { minSeverity: OperationSeverity.MEDIUM },
            effect: PolicyEffect.REVIEW,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      // MEDIUM should match
      let context: ToolCallContext = {
        callId: 'test-009',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.MEDIUM,
        caller: defaultCaller,
        timestamp: new Date(),
      };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.REVIEW);

      // HIGH should match (above MEDIUM)
      context.severity = OperationSeverity.HIGH;
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.REVIEW);

      // LOW should not match (below MEDIUM)
      context.severity = OperationSeverity.LOW;
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);
    });

    test('should handle all severity levels in order', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'test-critical',
            match: { minSeverity: OperationSeverity.CRITICAL },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      const severities = [
        { severity: OperationSeverity.SAFE, shouldDeny: false },
        { severity: OperationSeverity.LOW, shouldDeny: false },
        { severity: OperationSeverity.MEDIUM, shouldDeny: false },
        { severity: OperationSeverity.HIGH, shouldDeny: false },
        { severity: OperationSeverity.CRITICAL, shouldDeny: true },
      ];

      severities.forEach(({ severity, shouldDeny }) => {
        const context: ToolCallContext = {
          callId: `test-${severity}`,
          tool: 'test',
          action: 'test',
          severity,
          caller: defaultCaller,
          timestamp: new Date(),
        };
        const decision = engine.evaluatePolicy(context);
        expect(decision.effect).toBe(shouldDeny ? PolicyEffect.DENY : PolicyEffect.ALLOW);
      });
    });
  });

  describe('Caller Type Matching', () => {
    test('should match caller type', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'restrict-agents',
            match: { callerType: 'agent' },
            effect: PolicyEffect.REVIEW,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      const agentCaller: CallerIdentity = {
        id: 'agent-001',
        name: 'Test Agent',
        type: 'agent',
      };

      const humanCaller: CallerIdentity = {
        id: 'human-001',
        name: 'Test Human',
        type: 'human',
      };

      // Agent should require review
      let context: ToolCallContext = {
        callId: 'test-010',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.SAFE,
        caller: agentCaller,
        timestamp: new Date(),
      };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.REVIEW);

      // Human should be allowed
      context.caller = humanCaller;
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);
    });
  });

  describe('Custom Matcher', () => {
    test('should evaluate custom matcher function', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'custom-rule',
            match: {
              custom: (context) => {
                return context.args?.dangerous === true;
              },
            },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      // Should deny when dangerous arg is true
      let context: ToolCallContext = {
        callId: 'test-011',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        args: { dangerous: true },
        timestamp: new Date(),
      };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.DENY);

      // Should allow when dangerous arg is false
      context.args = { dangerous: false };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);
    });
  });

  describe('Rule Ordering (First Match Wins)', () => {
    test('should apply first matching rule', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'allow-specific',
            match: { tool: 'jira', action: 'delete_test_issue' },
            effect: PolicyEffect.ALLOW,
          },
          {
            id: 'deny-all-deletes',
            match: { action: 'delete_*' },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.REVIEW,
      };
      const engine = new PolicyEngine(config);

      // Should allow the specific exception
      const context: ToolCallContext = {
        callId: 'test-012',
        tool: 'jira',
        action: 'delete_test_issue',
        severity: OperationSeverity.MEDIUM,
        caller: defaultCaller,
        timestamp: new Date(),
      };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);
      expect(engine.evaluatePolicy(context).rule).toBe('allow-specific');

      // Should deny other deletes
      context.action = 'delete_prod_issue';
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.DENY);
      expect(engine.evaluatePolicy(context).rule).toBe('deny-all-deletes');
    });
  });

  describe('Default Effect', () => {
    test('should apply default effect when no rules match', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'specific-rule',
            match: { tool: 'jira' },
            effect: PolicyEffect.ALLOW,
          },
        ],
        defaultEffect: PolicyEffect.DENY,
        defaultReason: 'Default denial for unmatched operations',
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-013',
        tool: 'kubernetes',
        action: 'list_pods',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.effect).toBe(PolicyEffect.DENY);
      expect(decision.reason).toBe('Default denial for unmatched operations');
      expect(decision.rule).toBeUndefined();
    });

    test('should generate approval token for default REVIEW', () => {
      const config: PolicyConfig = {
        rules: [],
        defaultEffect: PolicyEffect.REVIEW,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-014',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.effect).toBe(PolicyEffect.REVIEW);
      expect(decision.approvalToken).toBeDefined();
    });
  });

  describe('Config Management', () => {
    test('should update configuration', () => {
      const initialConfig: PolicyConfig = {
        rules: [],
        defaultEffect: PolicyEffect.DENY,
      };
      const engine = new PolicyEngine(initialConfig);

      const context: ToolCallContext = {
        callId: 'test-015',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      // Should deny with initial config
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.DENY);

      // Update to allow
      const newConfig: PolicyConfig = {
        rules: [],
        defaultEffect: PolicyEffect.ALLOW,
      };
      engine.updateConfig(newConfig);

      // Should allow with new config
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);
    });

    test('should get current configuration', () => {
      const config: PolicyConfig = {
        rules: [{ id: 'test-rule', match: {}, effect: PolicyEffect.ALLOW }],
        defaultEffect: PolicyEffect.DENY,
      };
      const engine = new PolicyEngine(config);

      const retrieved = engine.getConfig();
      expect(retrieved).toEqual(config);
      expect(retrieved.rules).toHaveLength(1);
      expect(retrieved.rules[0].id).toBe('test-rule');
    });
  });

  describe('Complex Multi-Condition Matching', () => {
    test('should require all match conditions to be satisfied', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'complex-rule',
            match: {
              tool: 'jira',
              action: 'delete_*',
              minSeverity: OperationSeverity.HIGH,
              callerType: 'agent',
            },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      // All conditions match - should deny
      let context: ToolCallContext = {
        callId: 'test-016',
        tool: 'jira',
        action: 'delete_issue',
        severity: OperationSeverity.HIGH,
        caller: { id: 'agent-001', name: 'Agent', type: 'agent' },
        timestamp: new Date(),
      };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.DENY);

      // Wrong tool - should allow
      context.tool = 'github';
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);

      // Wrong action - should allow
      context.tool = 'jira';
      context.action = 'update_issue';
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);

      // Wrong severity - should allow
      context.action = 'delete_issue';
      context.severity = OperationSeverity.MEDIUM;
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);

      // Wrong caller type - should allow
      context.severity = OperationSeverity.HIGH;
      context.caller = { id: 'human-001', name: 'Human', type: 'human' };
      expect(engine.evaluatePolicy(context).effect).toBe(PolicyEffect.ALLOW);
    });
  });

  describe('Approval Token Generation', () => {
    test('should generate approval token for REVIEW decisions', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'review-rule',
            match: { minSeverity: OperationSeverity.MEDIUM },
            effect: PolicyEffect.REVIEW,
          },
        ],
        defaultEffect: PolicyEffect.ALLOW,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-017',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.MEDIUM,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision = engine.evaluatePolicy(context);
      expect(decision.approvalToken).toBeDefined();
      expect(typeof decision.approvalToken).toBe('string');
      expect(decision.approvalToken!.length).toBeGreaterThan(0);
    });

    test('should not generate approval token for ALLOW or DENY', () => {
      const config: PolicyConfig = {
        rules: [
          {
            id: 'allow-rule',
            match: { severity: OperationSeverity.SAFE },
            effect: PolicyEffect.ALLOW,
          },
          {
            id: 'deny-rule',
            match: { severity: OperationSeverity.CRITICAL },
            effect: PolicyEffect.DENY,
          },
        ],
        defaultEffect: PolicyEffect.REVIEW,
      };
      const engine = new PolicyEngine(config);

      // ALLOW should not have token
      let context: ToolCallContext = {
        callId: 'test-018',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };
      expect(engine.evaluatePolicy(context).approvalToken).toBeUndefined();

      // DENY should not have token
      context.severity = OperationSeverity.CRITICAL;
      expect(engine.evaluatePolicy(context).approvalToken).toBeUndefined();
    });

    test('should generate unique tokens for each REVIEW decision', () => {
      const config: PolicyConfig = {
        rules: [],
        defaultEffect: PolicyEffect.REVIEW,
      };
      const engine = new PolicyEngine(config);

      const context: ToolCallContext = {
        callId: 'test-019',
        tool: 'test',
        action: 'test',
        severity: OperationSeverity.SAFE,
        caller: defaultCaller,
        timestamp: new Date(),
      };

      const decision1 = engine.evaluatePolicy(context);
      const decision2 = engine.evaluatePolicy(context);

      expect(decision1.approvalToken).toBeDefined();
      expect(decision2.approvalToken).toBeDefined();
      expect(decision1.approvalToken).not.toBe(decision2.approvalToken);
    });
  });
});
