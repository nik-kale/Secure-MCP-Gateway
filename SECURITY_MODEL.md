# Security Model

This document describes the security architecture, policy enforcement model, and human-in-the-loop approval flow of **Secure-MCP-Gateway**.

## Table of Contents

- [Design Principles](#design-principles)
- [Policy Engine](#policy-engine)
- [Operation Severity Levels](#operation-severity-levels)
- [Policy Decision Flow](#policy-decision-flow)
- [Human-in-the-Loop Approvals](#human-in-the-loop-approvals)
- [Audit Logging](#audit-logging)
- [Threat Model](#threat-model)
- [Best Practices](#best-practices)

---

## Design Principles

The security model of Secure-MCP-Gateway is built on these core principles:

### 1. **Least Privilege by Default**

- All operations default to requiring review unless explicitly allowed
- Safe read-only operations can be allowed automatically
- Write operations require progressively stricter controls based on severity

### 2. **Defense in Depth**

- Multiple layers of protection:
  - Policy-based access control
  - Human-in-the-loop approvals
  - Comprehensive audit logging
  - Time-limited approval tokens

### 3. **Fail Secure**

- If policy evaluation fails → deny or require review
- If approval token is expired → deny
- If audit logging fails → operation is still blocked if policy says so

### 4. **Transparency and Auditability**

- Every tool call is logged
- Every policy decision is logged with reason
- Every approval/denial is logged with approver identity
- Logs are structured JSON for easy analysis

### 5. **Separation of Concerns**

- **Policy Engine**: Decides what's allowed
- **Approval Manager**: Handles human review workflow
- **Audit Logger**: Records everything
- **Gateway**: Orchestrates the flow

---

## Policy Engine

The policy engine evaluates tool calls against a set of **ordered rules**. The first rule that matches determines the outcome.

### Policy Rule Structure

```typescript
{
  "id": "unique-rule-id",
  "description": "Human-readable description",
  "match": {
    "tool": "tool-name-pattern",        // Supports wildcards (*)
    "action": "action-name-pattern",    // Supports wildcards (*)
    "minSeverity": "safe|low|medium|high|critical",
    "callerType": "human|agent|service"
  },
  "effect": "allow|deny|review",
  "reason": "Why this decision was made"
}
```

### Match Logic

All conditions in the `match` object must be satisfied for the rule to apply:

- **tool**: Pattern match against tool name (e.g., `"jira"`, `"kubernetes*"`)
- **action**: Pattern match against action name (e.g., `"delete_*"`, `"get_issue"`)
- **minSeverity**: Matches if operation severity >= specified level
- **callerType**: Matches if caller type equals specified type

### Policy Effects

- **ALLOW**: Operation proceeds immediately without human intervention
- **DENY**: Operation is rejected outright
- **REVIEW**: Operation is paused pending human approval

### First-Match-Wins

Rules are evaluated **in order**. The first rule that matches wins. This allows you to:

1. Add specific exceptions at the top (e.g., "allow delete_test_pod")
2. Add broad restrictions below (e.g., "review all deletes")

### Default Effect

If no rules match, the `defaultEffect` is applied. Recommended: `review`.

---

## Operation Severity Levels

Every tool call is assigned a **severity level** that indicates its risk and impact:

### Severity Definitions

| Severity   | Description                                         | Examples                                      | Default Policy |
|------------|-----------------------------------------------------|-----------------------------------------------|----------------|
| **SAFE**   | Read-only, no side effects, low risk                | list_services, search_issues, get_logs        | ALLOW          |
| **LOW**    | Minimal writes, low impact, easily reversible       | add_label, update_description                 | ALLOW or REVIEW|
| **MEDIUM** | Moderate writes, medium impact, some risk           | scale_service, add_comment, restart_pod       | REVIEW         |
| **HIGH**   | High-risk writes, significant impact                | restart_service, close_incident, deploy_code  | REVIEW         |
| **CRITICAL**| Critical operations, production-breaking potential | delete_database, shutdown_cluster, delete_pvc | DENY or REVIEW |

### How to Assign Severity

When implementing an MCP server tool, consider:

1. **Read vs Write**: Reads are usually SAFE, writes are at least MEDIUM
2. **Scope of Impact**: Single resource (MEDIUM) vs entire service (HIGH)
3. **Reversibility**: Easy to undo (LOW) vs permanent (HIGH/CRITICAL)
4. **Production Impact**: No downtime (LOW) vs possible outage (HIGH/CRITICAL)

**Example:**

```typescript
// SAFE: Read-only query
gateway.executeToolCall('jira', 'search_issues', OperationSeverity.SAFE, ...);

// MEDIUM: Update issue status (reversible)
gateway.executeToolCall('jira', 'transition_issue', OperationSeverity.MEDIUM, ...);

// HIGH: Restart production service (potential downtime)
gateway.executeToolCall('kubernetes', 'restart_service', OperationSeverity.HIGH, ...);

// CRITICAL: Delete production database (irreversible, catastrophic)
gateway.executeToolCall('database', 'delete_database', OperationSeverity.CRITICAL, ...);
```

---

## Policy Decision Flow

```
┌─────────────────────────────────────┐
│  Agent calls tool                   │
│  (tool, action, severity, caller)   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gateway creates ToolCallContext    │
│  - callId, timestamp, args, etc.    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Policy Engine evaluates rules      │
│  - Match against ordered rules      │
│  - First match wins                 │
│  - Apply default if no match        │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┬──────────────┐
        ▼             ▼              ▼
    ┌────────┐   ┌────────┐    ┌──────────┐
    │ ALLOW  │   │ DENY   │    │ REVIEW   │
    └───┬────┘   └───┬────┘    └────┬─────┘
        │            │              │
        │            │              ▼
        │            │         ┌──────────────────┐
        │            │         │ Create approval  │
        │            │         │ token, pause     │
        │            │         └────┬─────────────┘
        │            │              │
        │            │              ▼
        │            │         ┌──────────────────┐
        │            │         │ Wait for human   │
        │            │         └────┬─────────────┘
        │            │              │
        │            │      ┌───────┴────────┐
        │            │      ▼                ▼
        │            │  ┌─────────┐   ┌──────────┐
        │            │  │ Approved│   │ Denied   │
        │            │  └────┬────┘   └────┬─────┘
        │            │       │             │
        ▼            ▼       ▼             ▼
    ┌──────────────────────────────────────────┐
    │  Audit log: tool call + decision         │
    └──────────────┬───────────────────────────┘
                   │
            ┌──────┴──────┐
            ▼             ▼
       ┌─────────┐   ┌─────────┐
       │ Execute │   │ Reject  │
       │ tool    │   │         │
       └────┬────┘   └─────────┘
            │
            ▼
       ┌─────────────────┐
       │ Audit log result│
       └─────────────────┘
```

---

## Human-in-the-Loop Approvals

For operations marked `REVIEW`, the gateway pauses execution and creates an **approval request**.

### Approval Workflow

1. **Policy decision is REVIEW** → Gateway creates `PendingApproval`
2. **Approval token is generated** → Unique, time-limited token
3. **Token returned to caller** → Agent receives token + reason for review
4. **Human operator reviews** → Via CLI, Slack bot, web UI, or Ops-Agent-Desktop
5. **Operator approves or denies**:
   - **Approve** → Tool is executed, result logged
   - **Deny** → Tool is rejected, denial logged

### Approval Token Properties

- **Unique**: Each token is a UUID
- **Time-Limited**: Expires after TTL (default: 1 hour)
- **Single-Use**: Cannot be reused after approval/denial
- **Audited**: Creation, approval, and denial are all logged

### Approval API

**Grant Approval:**

```typescript
const result = await gateway.grantApprovalAndExecute(
  approvalToken,
  approver,  // CallerIdentity of the human approver
  executor   // Function that executes the tool
);
```

**Deny Approval:**

```typescript
await gateway.denyApproval(approvalToken, denier);
```

**List Pending Approvals:**

```typescript
const pending = gateway.listPendingApprovals();
```

### Integration Points

Approvals can be integrated with:

- **CLI tools**: Simple command-line approval tool
- **Slack/Teams bots**: Notifications with approve/deny buttons
- **Ops-Agent-Desktop**: Visual approval UI with context
- **ITSM systems**: ServiceNow, Jira Service Desk approval workflows
- **Custom web UI**: React/Vue app calling gateway HTTP API (future)

---

## Audit Logging

Every interaction with the gateway is logged in **structured JSON format**.

### Log Events

| Event Type            | When                                  | What's Logged                                     |
|-----------------------|---------------------------------------|---------------------------------------------------|
| `tool_call`           | Tool is invoked                       | Context, caller, tool, action, args, severity     |
| `policy_decision`     | Policy is evaluated                   | Decision (allow/deny/review), reason, rule        |
| `approval_granted`    | Human approves                        | Approver identity, timestamp                      |
| `approval_denied`     | Human denies                          | Denier identity, timestamp                        |
| `execution_success`   | Tool executes successfully            | Result output                                     |
| `execution_failure`   | Tool execution fails                  | Error message                                     |

### Log Format

```json
{
  "entryId": "uuid",
  "timestamp": "2025-01-15T10:30:00Z",
  "eventType": "policy_decision",
  "context": {
    "callId": "uuid",
    "tool": "jira",
    "action": "transition_issue",
    "severity": "medium",
    "caller": {
      "id": "agent-001",
      "name": "Ops Agent",
      "type": "agent"
    },
    "args": { "issueKey": "PROJ-123", "transitionId": "5" }
  },
  "decision": {
    "effect": "review",
    "reason": "Medium-risk operations require human approval",
    "rule": "review-medium-writes",
    "approvalToken": "abc-def-ghi"
  }
}
```

### Log Outputs

- **Console (stdout)**: Colored, human-readable
- **File**: Append-only JSON lines (for SIEM ingestion)
- **Custom backends**: Implement `IAuditLogger` interface

### Log Analysis

Use tools like:

- **jq**: Query JSON logs (`cat audit.log | jq '.eventType == "approval_denied"'`)
- **Splunk/Elasticsearch**: Ingest logs for dashboards and alerts
- **Grafana Loki**: Stream logs and create alerts on denied operations

---

## Threat Model

### Threats Mitigated

| Threat                                  | Mitigation                                                                 |
|-----------------------------------------|----------------------------------------------------------------------------|
| **Unauthorized writes**                 | Policy engine blocks or requires approval for writes                       |
| **Accidental deletion**                 | Critical deletes denied or require approval                                |
| **Privilege escalation**                | Caller identity checked, policy can restrict by caller type                |
| **Lack of audit trail**                 | All actions logged with context and decision                               |
| **Rogue agent behavior**                | High-risk actions require human approval                                   |
| **Compromised credentials**             | No hardcoded secrets, env vars only, least privilege                       |

### Threats NOT Mitigated (Out of Scope)

- **MCP server vulnerabilities**: Gateway assumes MCP servers are trusted
- **Network attacks**: No TLS/encryption (assumes secure network or handled by transport)
- **DoS attacks**: No rate limiting (future enhancement)
- **Advanced persistent threats**: No intrusion detection (use external monitoring)

---

## Best Practices

### 1. Policy Configuration

- **Start restrictive**: Default to `review`, then relax specific rules
- **Use wildcards carefully**: `delete_*` catches all deletes, be specific where needed
- **Order matters**: Put exceptions first, broad rules later
- **Document rules**: Use `description` field for every rule

### 2. Severity Assignment

- **Be conservative**: When in doubt, choose higher severity
- **Test in staging**: Validate severity levels before production
- **Review periodically**: As tools evolve, update severity

### 3. Approval Management

- **Set reasonable TTLs**: Long enough for humans to respond, short enough to avoid stale approvals
- **Integrate with existing tools**: Slack, Teams, ITSM systems
- **Monitor pending approvals**: Alert on old/stale approvals

### 4. Audit Logging

- **Store logs securely**: Centralized logging with access controls
- **Retain for compliance**: Follow regulatory requirements (SOC2, GDPR, etc.)
- **Alert on anomalies**: Detect patterns like repeated denials, unexpected approvers

### 5. Caller Identity

- **Authenticate properly**: Use real identity from auth system, not hardcoded
- **Use service accounts**: For agents, create distinct identities per agent
- **Principle of least privilege**: Agents should only have access to what they need

### 6. Secrets Management

- **Never hardcode secrets**: Use environment variables or secret managers
- **Rotate credentials**: Regular rotation of API tokens
- **Audit secret access**: Log when secrets are used

---

## Example Policy Scenarios

### Scenario 1: Development Environment

**Goal**: Allow agents more freedom, but still log everything.

```json
{
  "rules": [
    { "id": "allow-all-reads", "match": { "minSeverity": "safe" }, "effect": "allow" },
    { "id": "allow-low-writes", "match": { "minSeverity": "low" }, "effect": "allow" },
    { "id": "review-medium-high", "match": { "minSeverity": "medium" }, "effect": "review" }
  ],
  "defaultEffect": "allow"
}
```

### Scenario 2: Production Environment

**Goal**: Maximum safety, humans approve almost everything.

```json
{
  "rules": [
    { "id": "deny-critical-delete", "match": { "action": "delete_*", "minSeverity": "critical" }, "effect": "deny" },
    { "id": "allow-safe-reads", "match": { "minSeverity": "safe" }, "effect": "allow" },
    { "id": "review-everything-else", "match": {}, "effect": "review" }
  ],
  "defaultEffect": "deny"
}
```

### Scenario 3: Read-Only Agent

**Goal**: Agent can observe but never write.

```json
{
  "rules": [
    { "id": "allow-safe-reads", "match": { "minSeverity": "safe" }, "effect": "allow" },
    { "id": "deny-all-writes", "match": { "minSeverity": "low" }, "effect": "deny" }
  ],
  "defaultEffect": "deny"
}
```

---

## Future Enhancements

- **Fine-grained RBAC**: Per-user, per-team policies
- **External policy engines**: OPA, Cedar integration
- **Rate limiting**: Prevent abuse/DoS
- **Approval delegation**: Route approvals to on-call engineer
- **Risk scoring**: ML-based anomaly detection
- **Integration with SIEM**: Real-time alerts on suspicious activity

---

**Built as a standard pattern for human-in-the-loop approvals in AI-powered autonomous operations.**

For questions or contributions, see [README.md](./README.md).
