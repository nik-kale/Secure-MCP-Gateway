#!/usr/bin/env node
/**
 * Local Ops MCP Server
 *
 * A demonstration MCP server for incident simulations and autonomous operations.
 * All tool calls are routed through the Secure MCP Gateway for policy enforcement.
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

/**
 * Simulated service state for demo purposes.
 */
interface ServiceState {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  replicas: number;
  lastIncident?: string;
}

const services: Map<string, ServiceState> = new Map([
  ['api-gateway', { name: 'api-gateway', status: 'healthy', replicas: 3 }],
  ['user-service', { name: 'user-service', status: 'healthy', replicas: 5 }],
  ['payment-service', { name: 'payment-service', status: 'healthy', replicas: 4 }],
  ['notification-service', { name: 'notification-service', status: 'healthy', replicas: 2 }],
]);

/**
 * Simulated incidents for demo purposes.
 */
const incidents: Array<{ id: string; title: string; severity: string; status: string }> = [];

/**
 * Default caller identity for demo purposes.
 * In production, this would come from authentication/authorization.
 */
const defaultCaller: CallerIdentity = {
  id: 'agent-001',
  name: 'Autonomous Ops Agent',
  type: 'agent',
  metadata: {
    team: 'sre',
    permissions: ['read', 'write'],
  },
};

/**
 * Initialize the gateway with default policy.
 */
const gateway = new SecureMCPGateway({
  policy: createDefaultPolicy(),
});

/**
 * Create and configure the MCP server.
 */
const server = new Server(
  {
    name: 'local-ops-server',
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
        name: 'list_services',
        description: 'List all services and their current status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_service',
        description: 'Get detailed information about a specific service',
        inputSchema: {
          type: 'object',
          properties: {
            serviceName: {
              type: 'string',
              description: 'Name of the service to query',
            },
          },
          required: ['serviceName'],
        },
      },
      {
        name: 'simulate_incident',
        description: 'Simulate an incident for testing autonomous operations (MEDIUM severity)',
        inputSchema: {
          type: 'object',
          properties: {
            serviceName: {
              type: 'string',
              description: 'Service to affect',
            },
            incidentType: {
              type: 'string',
              enum: ['latency', 'error_rate', 'downtime'],
              description: 'Type of incident to simulate',
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Severity of the simulated incident',
            },
          },
          required: ['serviceName', 'incidentType', 'severity'],
        },
      },
      {
        name: 'scale_service',
        description: 'Scale a service up or down (MEDIUM severity - requires approval)',
        inputSchema: {
          type: 'object',
          properties: {
            serviceName: {
              type: 'string',
              description: 'Name of the service to scale',
            },
            replicas: {
              type: 'number',
              description: 'Target number of replicas',
            },
          },
          required: ['serviceName', 'replicas'],
        },
      },
      {
        name: 'restart_service',
        description: 'Restart a service (HIGH severity - requires approval)',
        inputSchema: {
          type: 'object',
          properties: {
            serviceName: {
              type: 'string',
              description: 'Name of the service to restart',
            },
            reason: {
              type: 'string',
              description: 'Reason for restart',
            },
          },
          required: ['serviceName', 'reason'],
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
      case 'list_services': {
        const result = await gateway.executeToolCall(
          'local-ops',
          'list_services',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            return Array.from(services.values());
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
                  approvalToken: result.approvalToken,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.result?.output, null, 2),
            },
          ],
        };
      }

      case 'get_service': {
        const { serviceName } = args as { serviceName: string };

        const result = await gateway.executeToolCall(
          'local-ops',
          'get_service',
          OperationSeverity.SAFE,
          defaultCaller,
          async () => {
            const service = services.get(serviceName);
            if (!service) {
              throw new Error(`Service not found: ${serviceName}`);
            }
            return service;
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
                  approvalToken: result.approvalToken,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.result?.output, null, 2),
            },
          ],
        };
      }

      case 'simulate_incident': {
        const { serviceName, incidentType, severity } = args as {
          serviceName: string;
          incidentType: string;
          severity: string;
        };

        const result = await gateway.executeToolCall(
          'local-ops',
          'simulate_incident',
          OperationSeverity.MEDIUM,
          defaultCaller,
          async () => {
            const service = services.get(serviceName);
            if (!service) {
              throw new Error(`Service not found: ${serviceName}`);
            }

            // Update service state based on incident
            if (incidentType === 'downtime' && severity === 'high') {
              service.status = 'down';
            } else if (incidentType === 'error_rate' || severity === 'medium') {
              service.status = 'degraded';
            }

            // Create incident record
            const incident = {
              id: `INC-${Date.now()}`,
              title: `${incidentType} on ${serviceName}`,
              severity,
              status: 'open',
            };
            incidents.push(incident);
            service.lastIncident = incident.id;

            return {
              incident,
              service,
              message: `Simulated ${incidentType} incident on ${serviceName}`,
            };
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
                    'Use the approval token to grant permission for this medium-risk operation',
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

      case 'scale_service': {
        const { serviceName, replicas } = args as { serviceName: string; replicas: number };

        const result = await gateway.executeToolCall(
          'local-ops',
          'scale_service',
          OperationSeverity.MEDIUM,
          defaultCaller,
          async () => {
            const service = services.get(serviceName);
            if (!service) {
              throw new Error(`Service not found: ${serviceName}`);
            }

            const oldReplicas = service.replicas;
            service.replicas = replicas;

            return {
              service: serviceName,
              oldReplicas,
              newReplicas: replicas,
              message: `Scaled ${serviceName} from ${oldReplicas} to ${replicas} replicas`,
            };
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
                    'Use the approval token to grant permission for this medium-risk operation',
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

      case 'restart_service': {
        const { serviceName, reason } = args as { serviceName: string; reason: string };

        const result = await gateway.executeToolCall(
          'local-ops',
          'restart_service',
          OperationSeverity.HIGH,
          defaultCaller,
          async () => {
            const service = services.get(serviceName);
            if (!service) {
              throw new Error(`Service not found: ${serviceName}`);
            }

            // Simulate restart
            service.status = 'healthy';

            return {
              service: serviceName,
              reason,
              message: `Restarted ${serviceName}. Reason: ${reason}`,
              timestamp: new Date().toISOString(),
            };
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
                    'Use the approval token to grant permission for this high-risk operation',
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
  console.error('Local Ops MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
