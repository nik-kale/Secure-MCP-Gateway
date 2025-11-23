/**
 * Health check routes
 */

import { Router, Request, Response } from 'express';
import { SecureMCPGateway } from '@secure-mcp-gateway/core';

export function healthRoutes(gateway: SecureMCPGateway): Router {
  const router = Router();

  /**
   * GET /health
   * Basic health check
   */
  router.get('/', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * GET /health/ready
   * Readiness probe
   */
  router.get('/ready', (req: Request, res: Response) => {
    // Check if gateway is ready to serve traffic
    try {
      const policy = gateway.getPolicyEngine().getConfig();
      const ready = policy && policy.rules !== undefined;

      if (ready) {
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /health/live
   * Liveness probe
   */
  router.get('/live', (req: Request, res: Response) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
    });
  });

  return router;
}
