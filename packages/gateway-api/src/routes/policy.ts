/**
 * Policy management routes
 */

import { Router, Response } from 'express';
import { SecureMCPGateway, PolicyConfig, PolicyConfigError } from '@secure-mcp-gateway/core';
import { AuthRequest } from '../middleware/auth.js';

export function policyRoutes(gateway: SecureMCPGateway): Router {
  const router = Router();

  /**
   * GET /api/v1/policy
   * Get current policy configuration
   */
  router.get('/', (req: AuthRequest, res: Response) => {
    const policy = gateway.getPolicyEngine().getConfig();
    res.json(policy);
  });

  /**
   * GET /api/v1/policy/rules
   * List all policy rules
   */
  router.get('/rules', (req: AuthRequest, res: Response) => {
    const policy = gateway.getPolicyEngine().getConfig();
    res.json({
      count: policy.rules.length,
      rules: policy.rules,
      defaultEffect: policy.defaultEffect,
      defaultReason: policy.defaultReason,
    });
  });

  /**
   * GET /api/v1/policy/rules/:id
   * Get specific policy rule
   */
  router.get('/rules/:id', (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const policy = gateway.getPolicyEngine().getConfig();
    const rule = policy.rules.find(r => r.id === id);

    if (!rule) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Policy rule '${id}' not found`,
      });
    }

    res.json(rule);
  });

  /**
   * PUT /api/v1/policy
   * Update policy configuration (admin only)
   */
  router.put('/', (req: AuthRequest, res: Response) => {
    // Check if user is admin (implement your own authorization logic)
    if (req.user!.type !== 'human') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only human administrators can update policies',
      });
    }

    try {
      const newPolicy: PolicyConfig = req.body;

      // Validate policy (basic validation)
      if (!newPolicy.rules || !Array.isArray(newPolicy.rules)) {
        throw new PolicyConfigError('Policy must have a rules array');
      }

      if (!newPolicy.defaultEffect) {
        throw new PolicyConfigError('Policy must have a defaultEffect');
      }

      // Update policy
      gateway.getPolicyEngine().updateConfig(newPolicy);

      res.json({
        success: true,
        message: 'Policy updated successfully',
        policy: newPolicy,
      });
    } catch (error) {
      if (error instanceof PolicyConfigError) {
        return res.status(400).json({
          error: error.name,
          message: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  return router;
}
