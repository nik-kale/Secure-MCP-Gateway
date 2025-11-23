/**
 * Approval management routes
 */

import { Router, Response } from 'express';
import { SecureMCPGateway, ApprovalNotFoundError } from '@secure-mcp-gateway/core';
import { AuthRequest } from '../middleware/auth.js';

export function approvalRoutes(gateway: SecureMCPGateway): Router {
  const router = Router();

  /**
   * GET /api/v1/approvals/pending
   * List all pending approvals
   */
  router.get('/pending', (req: AuthRequest, res: Response) => {
    const pending = gateway.listPendingApprovals();
    res.json({
      count: pending.length,
      approvals: pending.map(approval => ({
        token: approval.token,
        tool: approval.context.tool,
        action: approval.context.action,
        severity: approval.context.severity,
        caller: approval.context.caller,
        args: approval.context.args,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
        reason: approval.decision.reason,
        rule: approval.decision.rule,
      })),
    });
  });

  /**
   * GET /api/v1/approvals/:token
   * Get details of a specific approval
   */
  router.get('/:token', (req: AuthRequest, res: Response) => {
    const { token } = req.params;
    const approval = gateway.getApprovalManager().getApproval(token);

    if (!approval) {
      throw new ApprovalNotFoundError(token);
    }

    res.json({
      token: approval.token,
      status: approval.status,
      context: {
        callId: approval.context.callId,
        tool: approval.context.tool,
        action: approval.context.action,
        severity: approval.context.severity,
        caller: approval.context.caller,
        args: approval.context.args,
        timestamp: approval.context.timestamp,
      },
      decision: approval.decision,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
    });
  });

  /**
   * POST /api/v1/approvals/:token/approve
   * Approve a pending request
   */
  router.post('/:token/approve', async (req: AuthRequest, res: Response) => {
    const { token } = req.params;
    const approver = req.user!;

    // Get the approval to execute
    const approval = gateway.getApprovalManager().getApproval(token);
    if (!approval) {
      throw new ApprovalNotFoundError(token);
    }

    // The executor function would need to be stored or reconstructed
    // For now, we just approve without executing (execution happens separately)
    const result = gateway.getApprovalManager().grantApproval(token, approver);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Approval granted',
      approval: {
        token: result.approval!.token,
        status: result.approval!.status,
        tool: result.approval!.context.tool,
        action: result.approval!.context.action,
      },
      approvedBy: approver,
    });
  });

  /**
   * POST /api/v1/approvals/:token/deny
   * Deny a pending request
   */
  router.post('/:token/deny', async (req: AuthRequest, res: Response) => {
    const { token } = req.params;
    const { reason } = req.body;
    const denier = req.user!;

    await gateway.denyApproval(token, denier);

    res.json({
      success: true,
      message: 'Approval denied',
      deniedBy: denier,
      reason: reason || 'No reason provided',
    });
  });

  /**
   * GET /api/v1/approvals/stats
   * Get approval statistics
   */
  router.get('/stats', (req: AuthRequest, res: Response) => {
    const manager = gateway.getApprovalManager();
    const pending = manager.listPendingApprovals();

    // Group by severity
    const bySeverity = pending.reduce((acc, approval) => {
      const severity = approval.context.severity;
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by tool
    const byTool = pending.reduce((acc, approval) => {
      const tool = approval.context.tool;
      acc[tool] = (acc[tool] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      total: pending.length,
      bySeverity,
      byTool,
      oldestCreatedAt: pending.length > 0
        ? Math.min(...pending.map(a => a.createdAt.getTime()))
        : null,
    });
  });

  return router;
}
