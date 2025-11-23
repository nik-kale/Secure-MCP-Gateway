/**
 * Metrics routes (Prometheus format)
 */

import { Router, Request, Response } from 'express';
import { SecureMCPGateway } from '@secure-mcp-gateway/core';

export function metricsRoutes(gateway: SecureMCPGateway): Router {
  const router = Router();

  /**
   * GET /metrics
   * Prometheus-compatible metrics endpoint
   */
  router.get('/', (req: Request, res: Response) => {
    const pending = gateway.listPendingApprovals();

    // Count by severity
    const pendingBySeverity = pending.reduce((acc, approval) => {
      acc[approval.context.severity] = (acc[approval.context.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Generate Prometheus format
    const metrics: string[] = [
      '# HELP gateway_pending_approvals_total Number of pending approvals',
      '# TYPE gateway_pending_approvals_total gauge',
      `gateway_pending_approvals_total ${pending.length}`,
      '',
      '# HELP gateway_pending_approvals_by_severity Number of pending approvals by severity',
      '# TYPE gateway_pending_approvals_by_severity gauge',
    ];

    for (const [severity, count] of Object.entries(pendingBySeverity)) {
      metrics.push(`gateway_pending_approvals_by_severity{severity="${severity}"} ${count}`);
    }

    metrics.push('');
    metrics.push('# HELP gateway_uptime_seconds Gateway uptime in seconds');
    metrics.push('# TYPE gateway_uptime_seconds gauge');
    metrics.push(`gateway_uptime_seconds ${process.uptime()}`);

    metrics.push('');
    metrics.push('# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes');
    metrics.push('# TYPE nodejs_memory_usage_bytes gauge');
    const memUsage = process.memoryUsage();
    metrics.push(`nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}`);
    metrics.push(`nodejs_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}`);
    metrics.push(`nodejs_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}`);
    metrics.push(`nodejs_memory_usage_bytes{type="external"} ${memUsage.external}`);

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.join('\n'));
  });

  return router;
}
