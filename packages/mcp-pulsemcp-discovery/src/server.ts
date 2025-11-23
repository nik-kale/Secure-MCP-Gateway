#!/usr/bin/env node
/**
 * PulseMCP Discovery MCP Server
 *
 * Discovers external MCP servers from directories like PulseMCP and awesome-mcp-servers.
 * This demonstrates that Secure-MCP-Gateway consumes and integrates with existing
 * MCP directories rather than competing with them.
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
import { MCPDiscoveryClient } from './discovery-client.js';

/**
 * Default caller identity.
 */
const defaultCaller: CallerIdentity = {
  id: 'agent-discovery-001',
  name: 'MCP Discovery Agent',
  type: 'agent',
  metadata: {
    team: 'platform',
  },
};

/**
 * Initialize components.
 */
const discoveryClient = new MCPDiscoveryClient();
const gateway = new SecureMCPGateway({
  policy: createDefaultPolicy(),
});

/**
 * Create and configure the MCP server.
 */
const server = new Server(
  {
    name: 'pulsemcp-discovery-server',
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
        name: 'discover_all_servers',
        description:
          'Discover all MCP servers from PulseMCP and awesome-mcp-servers directories',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags to filter servers (e.g., ["kubernetes", "monitoring"])',
            },
          },
        },
      },
      {
        name: 'discover_ops_servers',
        description:
          'Discover MCP servers specifically relevant to SRE, DevOps, and operations (filtered by ops-related tags)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'discover_from_pulsemcp',
        description: 'Discover MCP servers from the PulseMCP directory',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags to filter servers',
            },
          },
        },
      },
      {
        name: 'discover_from_awesome_mcp',
        description: 'Discover MCP servers from the awesome-mcp-servers repository',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags to filter servers',
            },
          },
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
      case 'discover_all_servers': {
        const { tags } = (args as { tags?: string[] }) || {};

        const result = await gateway.executeToolCall(
          'mcp-discovery',
          'discover_all_servers',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return await discoveryClient.discoverAll(tags);
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

      case 'discover_ops_servers': {
        const result = await gateway.executeToolCall(
          'mcp-discovery',
          'discover_ops_servers',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return await discoveryClient.discoverOpsServers();
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

      case 'discover_from_pulsemcp': {
        const { tags } = (args as { tags?: string[] }) || {};

        const result = await gateway.executeToolCall(
          'mcp-discovery',
          'discover_from_pulsemcp',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return await discoveryClient.discoverFromPulseMCP(tags);
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

      case 'discover_from_awesome_mcp': {
        const { tags } = (args as { tags?: string[] }) || {};

        const result = await gateway.executeToolCall(
          'mcp-discovery',
          'discover_from_awesome_mcp',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return await discoveryClient.discoverFromAwesomeMCP(tags);
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
  console.error('PulseMCP Discovery MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
