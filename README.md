# Secure-MCP-Gateway

> A security-first Model Context Protocol (MCP) gateway for AI-powered autonomous operations, SRE, and support agents.

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that enables AI applications to securely connect with external data sources and tools. It provides a uniform way for AI agents to interact with services like databases, APIs, and development tools.

## Why a Secure Gateway?

While MCP enables powerful integrations, letting AI agents directly access production infrastructure introduces significant risks:

- **Uncontrolled writes**: Agents could accidentally delete resources, close critical incidents, or corrupt data
- **Privilege escalation**: Without proper controls, agents might perform actions beyond their intended scope
- **Audit gaps**: Direct access makes it hard to track what agents did and why
- **Compliance risks**: Regulatory requirements often mandate human oversight for certain operations

**Secure-MCP-Gateway** solves these problems by providing:

- **Policy-based access control**: Define rules for what actions are allowed, denied, or require approval
- **Human-in-the-loop approvals**: High-risk operations pause for human review before execution
- **Comprehensive audit logging**: Every tool call and policy decision is logged for compliance and debugging
- **Safe integration with existing MCP ecosystems**: Works with directories like [PulseMCP](https://pulsemcp.com) and [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers), adding security without replacing them

This is a **reference architecture** for enterprises deploying autonomous operations agents in production environments.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Agents / Claude Desktop / Custom Clients                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │   Secure-MCP-Gateway          │
         │  ┌─────────────────────────┐  │
         │  │  Policy Engine          │  │  ← Evaluate: allow/deny/review
         │  │  - Config-driven rules  │  │
         │  │  - Severity matching    │  │
         │  └─────────────────────────┘  │
         │                                │
         │  ┌─────────────────────────┐  │
         │  │  Approval Manager       │  │  ← Human-in-the-loop
         │  │  - Pending approvals    │  │
         │  │  - Token management     │  │
         │  └─────────────────────────┘  │
         │                                │
         │  ┌─────────────────────────┐  │
         │  │  Audit Logger           │  │  ← Log everything
         │  │  - JSON structured logs │  │
         │  │  - File + console       │  │
         │  └─────────────────────────┘  │
         └────────────┬──────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌────────┐  ┌─────────┐  ┌──────────┐
    │ Jira   │  │ K8s     │  │ Splunk   │  ... (MCP Servers)
    │ MCP    │  │ MCP     │  │ MCP      │
    └────────┘  └─────────┘  └──────────┘
         │            │            │
         ▼            ▼            ▼
    ┌────────────────────────────────────┐
    │  Production Infrastructure         │
    │  - Jira / PagerDuty                │
    │  - Kubernetes / Cloud APIs         │
    │  - Observability (Splunk, Datadog) │
    └────────────────────────────────────┘
```

**Data Flow:**

1. **Agent calls tool** → Gateway receives the request
2. **Policy evaluation** → Match against configured rules (allow/deny/review)
3. **Audit log** → Record the decision
4. **If ALLOW** → Execute immediately and log result
5. **If DENY** → Reject and return error
6. **If REVIEW** → Create approval token, pause execution, wait for human decision
7. **Human approves** → Execute tool call and log result
8. **Human denies** → Reject and log denial

## Quickstart

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/nik-kale/Secure-MCP-Gateway.git
cd Secure-MCP-Gateway

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Running the Local Ops Demo Server

The `mcp-local-ops` server simulates incident management operations and is perfect for testing the gateway without external dependencies.

```bash
# Run the local ops server
node packages/mcp-local-ops/dist/server.js
```

This server provides tools like:

- `list_services` (SAFE) - List all services and their status
- `get_service` (SAFE) - Get details about a specific service
- `simulate_incident` (MEDIUM) - Simulate an incident (requires approval)
- `scale_service` (MEDIUM) - Scale a service (requires approval)
- `restart_service` (HIGH) - Restart a service (requires approval)

### Using with Claude Desktop

Add this to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "local-ops": {
      "command": "node",
      "args": ["/path/to/Secure-MCP-Gateway/packages/mcp-local-ops/dist/server.js"]
    }
  }
}
```

### Example: Policy in Action

When you try a **safe read operation**:

```
Tool: list_services
Policy Decision: ALLOW (safe read-only operation)
Execution: Immediate
Audit: Logged to console/file
```

When you try a **medium-risk operation**:

```
Tool: scale_service (replicas=10)
Policy Decision: REVIEW (medium-risk operation requires approval)
Execution: Paused
Response: { approvalToken: "abc-123-def", message: "Awaiting approval..." }
```

A human operator can then approve or deny:

```typescript
gateway.grantApprovalAndExecute(approvalToken, approver, executor);
// OR
gateway.denyApproval(approvalToken, denier);
```

## Packages

### 1. `@secure-mcp-gateway/core`

Core security engine with policy evaluation, audit logging, and approval flow.

**Key exports:**

- `SecureMCPGateway` - Main orchestrator
- `PolicyEngine` - Rule-based policy evaluation
- `AuditLogger` - Structured logging
- `ApprovalManager` - Human-in-the-loop flow

### 2. `@secure-mcp-gateway/mcp-local-ops`

Demo MCP server for incident simulations. Self-contained, safe for testing.

### 3. `@secure-mcp-gateway/mcp-jira-ops`

Jira integration with read operations (search, get issue) and write operations requiring approval (add comment, transition issue).

**Configuration:**

```bash
export JIRA_URL=https://yourcompany.atlassian.net
export JIRA_EMAIL=your-email@company.com
export JIRA_TOKEN=your-api-token
```

### 4. `@secure-mcp-gateway/mcp-pulsemcp-discovery`

Discovery tool that queries external MCP directories (PulseMCP, awesome-mcp-servers) to find ops-related MCP servers.

**Example:**

```typescript
// Discover all ops-related servers
const servers = await discoveryClient.discoverOpsServers();

// Filter by tags
const k8sServers = await discoveryClient.discoverAll(['kubernetes', 'cloud']);
```

This package demonstrates that **Secure-MCP-Gateway integrates with and consumes existing MCP directories** rather than competing with them.

## Integration with MCP Directories

Secure-MCP-Gateway is designed to work **alongside** existing MCP ecosystems:

- **[PulseMCP](https://pulsemcp.com)**: Directory of production-ready MCP servers
- **[awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)**: Curated list of community MCP servers

We provide `mcp-pulsemcp-discovery` as a reference for discovering and filtering servers from these directories. The gateway then adds security policies and approval workflows on top of those servers.

**We do not replace these directories. We make them safer for autonomous agent use in production.**

## How This Fits Into an Autonomous Ops Stack

Secure-MCP-Gateway is a foundational component for AI-powered SRE and support systems:

```
┌─────────────────────────────────────────────────────────────┐
│  AutoRCA-Core (ADAPT-RCA)                                   │
│  Graph-based root cause analysis engine                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Ops-Agent-Desktop                                          │
│  Visual mission control for autonomous ops agents           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Secure-MCP-Gateway  ◄── YOU ARE HERE                       │
│  Security-first access to production tools                  │
└────────────────┬────────────────────────────────────────────┘
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
   Jira      Kubernetes   Splunk   ... (via MCP servers)
```

- **AutoRCA-Core** performs root cause analysis and suggests remediation
- **Ops-Agent-Desktop** orchestrates missions and displays live progress
- **Secure-MCP-Gateway** ensures agents can only perform approved actions on real infrastructure
- **MCP Servers** (Jira, K8s, Splunk, etc.) provide the actual integrations

Together, these form a reference stack for **autonomous reliability engineering**.

## Security and Safety Considerations

1. **Least Privilege**: Default policy requires review for anything beyond safe reads
2. **Defense in Depth**: Multiple layers: policy engine, approval flow, audit trail
3. **Fail Secure**: If policy evaluation fails, default is to deny or require review
4. **Audit Everything**: All decisions, approvals, and executions are logged
5. **Time-Limited Approvals**: Approval tokens expire after a configurable TTL
6. **No Hardcoded Secrets**: Credentials come from environment variables

See [SECURITY_MODEL.md](./SECURITY_MODEL.md) for full details.

## Example Policy Configuration

```json
{
  "rules": [
    {
      "id": "deny-critical-delete",
      "match": { "action": "delete_*", "minSeverity": "critical" },
      "effect": "deny"
    },
    {
      "id": "review-high-risk",
      "match": { "minSeverity": "high" },
      "effect": "review"
    },
    {
      "id": "allow-safe-reads",
      "match": { "minSeverity": "safe" },
      "effect": "allow"
    }
  ],
  "defaultEffect": "review"
}
```

See `examples/policy-config.json` for a complete example.

## Roadmap

- [ ] HTTP API for approval UI (integrate with Slack, Teams, Ops-Agent-Desktop)
- [ ] Support for external policy engines (OPA, Cedar)
- [ ] Pre-built MCP servers for Kubernetes, Prometheus, Datadog
- [ ] Integration with AutoRCA-Core for automated RCA + remediation
- [ ] Fine-grained RBAC with team/user permissions
- [ ] Webhook notifications for approval requests

## Contributing

Contributions are welcome! This project aims to be a reference architecture for secure autonomous operations.

Please open issues for bugs, feature requests, or questions.

## License

MIT

## Related Projects

- [AutoRCA-Core](https://github.com/nik-kale/AutoRCA-Core) - Agentic root cause analysis engine
- [Ops-Agent-Desktop](https://github.com/nik-kale/Ops-Agent-Desktop) - Visual mission control for ops agents
- [awesome-autonomous-ops](https://github.com/nik-kale/awesome-autonomous-ops) - Curated list of autonomous ops tools
- [Model Context Protocol](https://modelcontextprotocol.io) - Official MCP specification
- [PulseMCP](https://pulsemcp.com) - Directory of production MCP servers
- [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) - Community MCP server list

---

**Built by [Nik Kale](https://github.com/nik-kale)** as part of the autonomous operations and AI-powered reliability ecosystem.
