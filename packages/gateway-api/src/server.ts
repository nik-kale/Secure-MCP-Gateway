#!/usr/bin/env node
/**
 * Secure-MCP-Gateway HTTP API Server
 *
 * Provides REST API for approval management, policy queries, and gateway configuration.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { createLogger, format, transports } from 'winston';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import {
  SecureMCPGateway,
  GatewayConfig,
  createDefaultPolicy,
  GatewayError,
  isGatewayError,
  CallerIdentity,
} from '@secure-mcp-gateway/core';
import { authenticateRequest, AuthRequest } from './middleware/auth.js';
import { approvalRoutes } from './routes/approvals.js';
import { policyRoutes } from './routes/policy.js';
import { metricsRoutes } from './routes/metrics.js';
import { healthRoutes } from './routes/health.js';

// Load environment variables
config();

// Configure logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
    }),
    new transports.File({ filename: 'logs/api-error.log', level: 'error' }),
    new transports.File({ filename: 'logs/api-combined.log' }),
  ],
});

// Initialize gateway
const gatewayConfig: GatewayConfig = {
  policy: createDefaultPolicy(),
  approvalTTL: parseInt(process.env.APPROVAL_TTL || '3600000'), // 1 hour default
};

const gateway = new SecureMCPGateway(gatewayConfig);

// Create Express app
const app: Express = express();
const port = parseInt(process.env.PORT || '3000');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// API Documentation - Swagger
const swaggerDocument = YAML.load(path.join(__dirname, '../openapi.yml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check routes (no auth required)
app.use('/health', healthRoutes(gateway));

// Metrics routes (may require auth based on config)
app.use('/metrics', metricsRoutes(gateway));

// Protected API routes
app.use('/api/v1/approvals', authenticateRequest, approvalRoutes(gateway));
app.use('/api/v1/policy', authenticateRequest, policyRoutes(gateway));

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Secure-MCP-Gateway API',
    version: '0.1.0',
    documentation: '/api-docs',
    health: '/health',
    metrics: '/metrics',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (isGatewayError(err)) {
    return res.status(400).json({
      error: err.name,
      message: err.message,
      code: err.code,
      suggestion: err.suggestion,
      context: err.context,
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
  });
});

// Start server
const server = app.listen(port, () => {
  logger.info(`🚀 Secure-MCP-Gateway API server running on port ${port}`);
  logger.info(`📚 API Documentation: http://localhost:${port}/api-docs`);
  logger.info(`❤️  Health Check: http://localhost:${port}/health`);
  logger.info(`📊 Metrics: http://localhost:${port}/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, gateway, logger };
