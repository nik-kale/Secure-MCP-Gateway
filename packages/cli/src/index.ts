#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();
const API_URL = process.env.SMCP_API_URL || 'http://localhost:3000/api/v1';
const API_KEY = process.env.SMCP_API_KEY;

// Headers helper
const getHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
};

program
  .name('smcp')
  .description('Secure-MCP-Gateway CLI')
  .version('0.1.0');

// Approvals
const approvals = program.command('approvals').description('Manage pending approvals');

approvals
  .command('list')
  .description('List pending approvals')
  .option('-o, --output <format>', 'Output format (json|table)', 'json')
  .action(async (options) => {
    const spinner = ora('Fetching pending approvals...').start();
    try {
      const res = await fetch(`${API_URL}/approvals/pending`, {
        headers: getHeaders(),
      });
      
      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      spinner.stop();

      if (options.output === 'json') {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.table(data.approvals);
      }
    } catch (error) {
      spinner.fail('Failed to fetch approvals');
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
    }
  });

approvals
  .command('approve <token>')
  .description('Approve a pending request')
  .action(async (token) => {
    const spinner = ora(`Approving request ${token}...`).start();
    try {
      const res = await fetch(`${API_URL}/approvals/${token}/approve`, {
        method: 'POST',
        headers: getHeaders(),
      });

      if (!res.ok) {
         const err = await res.json().catch(() => ({}));
         throw new Error(err.error || res.statusText);
      }
      
      const data = await res.json();
      spinner.succeed(chalk.green('Approval granted successfully'));
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      spinner.fail('Failed to approve request');
       if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
    }
  });

approvals
  .command('deny <token>')
  .description('Deny a pending request')
  .option('-r, --reason <reason>', 'Reason for denial')
  .action(async (token, options) => {
    const spinner = ora(`Denying request ${token}...`).start();
    try {
      const res = await fetch(`${API_URL}/approvals/${token}/deny`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reason: options.reason }),
      });

      if (!res.ok) {
         const err = await res.json().catch(() => ({}));
         throw new Error(err.error || res.statusText);
      }
      
      const data = await res.json();
      spinner.succeed(chalk.red('Approval denied successfully'));
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      spinner.fail('Failed to deny request');
       if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }
    }
  });

// Health
program
  .command('health')
  .description('Check gateway health')
  .action(async () => {
    try {
        const res = await fetch(API_URL.replace('/api/v1', '/health'));
        const data = await res.json();
        if (data.status === 'ok') {
            console.log(chalk.green('Gateway is healthy'));
        } else {
            console.log(chalk.yellow('Gateway status:', data.status));
        }
        console.log(data);
    } catch (error) {
        console.error(chalk.red('Gateway is unreachable'));
    }
  });

program.parse();

