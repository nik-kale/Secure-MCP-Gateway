#!/usr/bin/env node
/**
 * Jira Ops MCP Server
 *
 * MCP server for Jira operations with gateway-enforced security policies.
 * Read operations are implemented and allowed by default.
 * Write operations require human approval through the gateway.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  SecureMCPGateway,
  createDefaultPolicy,
  OperationSeverity,
  CallerIdentity,
} from '@secure-mcp-gateway/core';
import { JiraClient, JiraConfig } from './jira-client.js';

/**
 * Load Jira configuration from environment variables.
 */
function loadJiraConfig(): JiraConfig {
  const url = process.env.JIRA_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;

  if (!url) {
    throw new Error('JIRA_URL environment variable is required');
  }

  return {
    url,
    email,
    token,
  };
}

/**
 * Default caller identity.
 * In production, this would come from authentication.
 */
const defaultCaller: CallerIdentity = {
  id: 'agent-jira-001',
  name: 'Jira Ops Agent',
  type: 'agent',
  metadata: {
    team: 'sre',
  },
};

/**
 * Initialize components.
 */
const jiraConfig = loadJiraConfig();
const jiraClient = new JiraClient(jiraConfig);
const gateway = new SecureMCPGateway({
  policy: createDefaultPolicy(),
});

/**
 * Create and configure the MCP server.
 */
const server = new Server(
  {
    name: 'jira-ops-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_issues',
        description: 'Search Jira issues using JQL (read-only, SAFE)',
        inputSchema: {
          type: 'object',
          properties: {
            jql: {
              type: 'string',
              description: 'JQL query string (e.g., "project = PROJ AND status = Open")',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return (default: 50)',
            },
          },
          required: ['jql'],
        },
      },
      {
        name: 'get_issue',
        description: 'Get detailed information about a specific Jira issue (read-only, SAFE)',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'Jira issue key (e.g., "PROJ-123")',
            },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'add_comment',
        description:
          'Add a comment to a Jira issue (write operation, MEDIUM severity - requires approval)',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'Jira issue key (e.g., "PROJ-123")',
            },
            comment: {
              type: 'string',
              description: 'Comment text to add',
            },
          },
          required: ['issueKey', 'comment'],
        },
      },
      {
        name: 'transition_issue',
        description:
          'Transition a Jira issue to a new status (write operation, MEDIUM severity - requires approval)',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'Jira issue key (e.g., "PROJ-123")',
            },
            transitionId: {
              type: 'string',
              description: 'Transition ID (use Jira API to find available transitions)',
            },
          },
          required: ['issueKey', 'transitionId'],
        },
      },
    ],
  };
});

/**
 * Handle tool calls through the gateway.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_issues': {
        const { jql, maxResults } = args as { jql: string; maxResults?: number };

        const result = await gateway.executeToolCall(
          'jira',
          'search_issues',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return await jiraClient.searchIssues(jql, maxResults);
          },
          args as Record<string, unknown>
        );

        if (!result.allowed) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Operation not allowed',
                  reason: result.decision.reason,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: result.result?.success
                ? JSON.stringify(result.result.output, null, 2)
                : `Error: ${result.result?.error}`,
            },
          ],
        };
      }

      case 'get_issue': {
        const { issueKey } = args as { issueKey: string };

        const result = await gateway.executeToolCall(
          'jira',
          'get_issue',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return await jiraClient.getIssue(issueKey);
          },
          args as Record<string, unknown>
        );

        if (!result.allowed) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Operation not allowed',
                  reason: result.decision.reason,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: result.result?.success
                ? JSON.stringify(result.result.output, null, 2)
                : `Error: ${result.result?.error}`,
            },
          ],
        };
      }

      case 'add_comment': {
        const { issueKey, comment } = args as { issueKey: string; comment: string };

        const result = await gateway.executeToolCall(
          'jira',
          'add_comment',
          OperationSeverity.MEDIUM,
          defaultCaller,
          async () => {
            await jiraClient.addComment(issueKey, comment);
            return { success: true, issueKey, comment };
          },
          args as Record<string, unknown>
        );

        if (!result.allowed) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Operation requires approval',
                  reason: result.decision.reason,
                  approvalToken: result.approvalToken,
                  message:
                    'Adding comments to Jira issues requires human approval. Use the approval token to grant permission.',
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: result.result?.success
                ? JSON.stringify(result.result.output, null, 2)
                : `Error: ${result.result?.error}`,
            },
          ],
        };
      }

      case 'transition_issue': {
        const { issueKey, transitionId } = args as { issueKey: string; transitionId: string };

        const result = await gateway.executeToolCall(
          'jira',
          'transition_issue',
          OperationSeverity.MEDIUM,
          defaultCaller,
          async () => {
            await jiraClient.transitionIssue(issueKey, transitionId);
            return { success: true, issueKey, transitionId };
          },
          args as Record<string, unknown>
        );

        if (!result.allowed) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Operation requires approval',
                  reason: result.decision.reason,
                  approvalToken: result.approvalToken,
                  message:
                    'Transitioning Jira issues requires human approval. Use the approval token to grant permission.',
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: result.result?.success
                ? JSON.stringify(result.result.output, null, 2)
                : `Error: ${result.result?.error}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jira Ops MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
