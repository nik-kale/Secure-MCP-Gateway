/**
 * Client for discovering MCP servers from external directories.
 *
 * This demonstrates how Secure-MCP-Gateway integrates with and consumes
 * existing MCP directories like PulseMCP and awesome-mcp-servers,
 * rather than competing with them.
 */

import fetch from 'node-fetch';

/**
 * MCP server metadata from a directory.
 */
export interface MCPServerInfo {
  /** Server name */
  name: string;
  /** Description */
  description: string;
  /** Repository URL */
  repository?: string;
  /** Package name (npm, pypi, etc.) */
  package?: string;
  /** Tags/categories */
  tags: string[];
  /** Vendor/author */
  vendor?: string;
  /** Source directory */
  source: 'pulsemcp' | 'awesome-mcp-servers' | 'custom';
}

/**
 * Discovery client for external MCP directories.
 */
export class MCPDiscoveryClient {
  /**
   * Discover MCP servers from PulseMCP directory.
   *
   * Note: This is a simplified implementation. In production, you would
   * use the actual PulseMCP API or MCP server if available.
   */
  async discoverFromPulseMCP(tags?: string[]): Promise<MCPServerInfo[]> {
    try {
      // PulseMCP directory URL (hypothetical - adjust based on actual API)
      const url = 'https://pulsemcp.com/api/servers';

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`PulseMCP API error: ${response.status} ${response.statusText}`);
      }

      const servers = (await response.json()) as any[];

      // Filter by tags if provided
      let filtered = servers.map((s) => ({
        name: s.name,
        description: s.description,
        repository: s.repository,
        package: s.package,
        tags: s.tags || [],
        vendor: s.vendor,
        source: 'pulsemcp' as const,
      }));

      if (tags && tags.length > 0) {
        filtered = filtered.filter((s) => tags.some((tag) => s.tags.includes(tag)));
      }

      return filtered;
    } catch (error) {
      // If PulseMCP is not accessible, return mock data for demonstration
      console.error('PulseMCP discovery failed, using mock data:', error);
      return this.getMockPulseMCPServers(tags);
    }
  }

  /**
   * Discover MCP servers from awesome-mcp-servers repository.
   *
   * In production, you might parse the GitHub README or use a structured API.
   */
  async discoverFromAwesomeMCP(tags?: string[]): Promise<MCPServerInfo[]> {
    try {
      // This would typically parse the awesome-mcp-servers README from GitHub
      // For now, return mock data
      return this.getMockAwesomeMCPServers(tags);
    } catch (error) {
      console.error('awesome-mcp-servers discovery failed:', error);
      return [];
    }
  }

  /**
   * Discover all servers from all sources.
   */
  async discoverAll(tags?: string[]): Promise<MCPServerInfo[]> {
    const [pulsemcp, awesome] = await Promise.all([
      this.discoverFromPulseMCP(tags),
      this.discoverFromAwesomeMCP(tags),
    ]);

    return [...pulsemcp, ...awesome];
  }

  /**
   * Filter servers by ops-related tags.
   */
  async discoverOpsServers(): Promise<MCPServerInfo[]> {
    const opsTags = [
      'observability',
      'monitoring',
      'logging',
      'kubernetes',
      'docker',
      'prometheus',
      'grafana',
      'splunk',
      'datadog',
      'incident',
      'sre',
      'devops',
      'cloud',
    ];

    return await this.discoverAll(opsTags);
  }

  /**
   * Mock PulseMCP servers for demonstration.
   */
  private getMockPulseMCPServers(tags?: string[]): MCPServerInfo[] {
    const servers: MCPServerInfo[] = [
      {
        name: 'kubernetes-mcp',
        description: 'MCP server for Kubernetes cluster management and operations',
        repository: 'https://github.com/example/kubernetes-mcp',
        package: '@mcp/kubernetes',
        tags: ['kubernetes', 'cloud', 'devops', 'sre'],
        vendor: 'PulseMCP Community',
        source: 'pulsemcp',
      },
      {
        name: 'prometheus-mcp',
        description: 'Query and manage Prometheus metrics via MCP',
        repository: 'https://github.com/example/prometheus-mcp',
        package: '@mcp/prometheus',
        tags: ['observability', 'monitoring', 'prometheus'],
        vendor: 'PulseMCP Community',
        source: 'pulsemcp',
      },
      {
        name: 'splunk-mcp',
        description: 'Search and analyze Splunk logs through MCP',
        repository: 'https://github.com/example/splunk-mcp',
        package: '@mcp/splunk',
        tags: ['logging', 'observability', 'splunk'],
        vendor: 'PulseMCP Community',
        source: 'pulsemcp',
      },
      {
        name: 'datadog-mcp',
        description: 'Datadog integration for metrics, logs, and traces',
        repository: 'https://github.com/example/datadog-mcp',
        package: '@mcp/datadog',
        tags: ['observability', 'monitoring', 'logging', 'datadog'],
        vendor: 'PulseMCP Community',
        source: 'pulsemcp',
      },
    ];

    if (!tags || tags.length === 0) {
      return servers;
    }

    return servers.filter((s) => tags.some((tag) => s.tags.includes(tag)));
  }

  /**
   * Mock awesome-mcp-servers for demonstration.
   */
  private getMockAwesomeMCPServers(tags?: string[]): MCPServerInfo[] {
    const servers: MCPServerInfo[] = [
      {
        name: 'grafana-mcp',
        description: 'Grafana dashboard and alert management via MCP',
        repository: 'https://github.com/example/grafana-mcp',
        tags: ['observability', 'monitoring', 'grafana'],
        source: 'awesome-mcp-servers',
      },
      {
        name: 'pagerduty-mcp',
        description: 'PagerDuty incident management through MCP',
        repository: 'https://github.com/example/pagerduty-mcp',
        tags: ['incident', 'sre', 'devops'],
        source: 'awesome-mcp-servers',
      },
    ];

    if (!tags || tags.length === 0) {
      return servers;
    }

    return servers.filter((s) => tags.some((tag) => s.tags.includes(tag)));
  }
}
