import { PendingApproval } from './types';
import * as crypto from 'crypto';

export interface WebhookConfig {
  url: string;
  events: ('pending' | 'approved' | 'denied' | 'expired')[];
  format?: 'slack' | 'teams' | 'discord' | 'json';
  secret?: string; // For HMAC signing
  retries?: number;
}

export class WebhookNotifier {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = {
      format: 'json',
      retries: 3,
      ...config,
    };
  }

  /**
   * Notify webhook endpoint about an approval event
   */
  public async notify(event: 'pending' | 'approved' | 'denied' | 'expired', approval: PendingApproval): Promise<void> {
    if (!this.config.events.includes(event)) {
      return;
    }

    const payload = this.formatPayload(event, approval);
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Secure-MCP-Gateway/1.0.0',
    };

    if (this.config.secret) {
      const signature = crypto
        .createHmac('sha256', this.config.secret)
        .update(body)
        .digest('hex');
      headers['X-Hub-Signature-256'] = `sha256=${signature}`;
    }

    await this.sendWithRetry(this.config.url, {
      method: 'POST',
      headers,
      body,
    });
  }

  private formatPayload(event: string, approval: PendingApproval): any {
    if (this.config.format === 'json') {
      return {
        event,
        timestamp: new Date().toISOString(),
        approval: {
          token: approval.token,
          status: approval.status,
          tool: approval.context.tool,
          action: approval.context.action,
          caller: approval.context.caller,
          expiresAt: approval.expiresAt,
        }
      };
    } else if (this.config.format === 'slack') {
        const colorMap: Record<string, string> = {
            pending: '#f2c744', // yellow
            approved: '#36a64f', // green
            denied: '#de2e2b',   // red
            expired: '#808080'   // gray
        };

        return {
            text: `Approval ${event}: ${approval.context.tool}/${approval.context.action}`,
            attachments: [
                {
                    color: colorMap[event] || '#36a64f',
                    title: `Approval ${event.charAt(0).toUpperCase() + event.slice(1)}`,
                    fields: [
                        {
                            title: 'Tool',
                            value: approval.context.tool,
                            short: true
                        },
                        {
                            title: 'Action',
                            value: approval.context.action,
                            short: true
                        },
                        {
                            title: 'Token',
                            value: approval.token,
                            short: false
                        },
                         {
                            title: 'Caller',
                            value: approval.context.caller.id,
                            short: true
                        }
                    ],
                    footer: 'Secure MCP Gateway'
                }
            ]
        };
    }
    
    // Fallback to JSON for other formats for now
    return { event, approval };
  }

  private async sendWithRetry(url: string, options: RequestInit, attempt = 1): Promise<void> {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (attempt < (this.config.retries || 3)) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWithRetry(url, options, attempt + 1);
      }
      console.error('Failed to send webhook after retries:', error);
      // Don't throw to prevent disrupting the main flow
    }
  }
}

