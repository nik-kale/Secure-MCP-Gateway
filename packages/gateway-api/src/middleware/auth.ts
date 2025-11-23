/**
 * Authentication middleware for API requests
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CallerIdentity, AuthenticationRequiredError, AuthenticationInvalidError } from '@secure-mcp-gateway/core';

export interface AuthRequest extends Request {
  user?: CallerIdentity;
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const API_KEY_HEADER = 'x-api-key';

/**
 * Authenticate request using JWT or API key
 */
export function authenticateRequest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Check for JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = {
          id: decoded.sub || decoded.id,
          name: decoded.name || 'Unknown',
          type: decoded.type || 'human',
          metadata: decoded.metadata,
        };
        return next();
      } catch (error) {
        throw new AuthenticationInvalidError('Invalid or expired JWT token');
      }
    }

    // Check for API key in header
    const apiKey = req.headers[API_KEY_HEADER] as string;
    if (apiKey) {
      // In production, validate against database or secret store
      // For now, check against environment variable
      const validApiKeys = (process.env.API_KEYS || '').split(',').filter(k => k);
      if (validApiKeys.includes(apiKey)) {
        req.user = {
          id: `api-key-${apiKey.substring(0, 8)}`,
          name: 'API Key User',
          type: 'service',
          metadata: { apiKey: apiKey.substring(0, 8) },
        };
        return next();
      } else {
        throw new AuthenticationInvalidError('Invalid API key');
      }
    }

    // No authentication provided
    throw new AuthenticationRequiredError();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError || error instanceof AuthenticationInvalidError) {
      return res.status(401).json({
        error: error.name,
        message: error.message,
        code: error.code,
      });
    }
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Generate JWT token for a user
 */
export function generateToken(caller: CallerIdentity, expiresIn: string = '24h'): string {
  return jwt.sign(
    {
      sub: caller.id,
      name: caller.name,
      type: caller.type,
      metadata: caller.metadata,
    },
    JWT_SECRET,
    { expiresIn }
  );
}
