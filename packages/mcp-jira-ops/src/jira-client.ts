/**
 * Simple Jira API client wrapper.
 */

import fetch from 'node-fetch';

/**
 * Jira client configuration.
 */
export interface JiraConfig {
  /** Jira instance URL (e.g., https://yourcompany.atlassian.net) */
  url: string;
  /** Jira email for authentication */
  email?: string;
  /** Jira API token */
  token?: string;
}

/**
 * Jira issue data.
 */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    priority?: {
      name: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    created: string;
    updated: string;
    description?: string;
  };
}

/**
 * Simple Jira API client.
 */
export class JiraClient {
  private config: JiraConfig;
  private authHeader: string;

  constructor(config: JiraConfig) {
    this.config = config;

    // Create basic auth header if credentials provided
    if (config.email && config.token) {
      const credentials = Buffer.from(`${config.email}:${config.token}`).toString('base64');
      this.authHeader = `Basic ${credentials}`;
    } else {
      this.authHeader = '';
    }
  }

  /**
   * Search for issues using JQL.
   */
  async searchIssues(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    const url = `${this.config.url}/rest/api/3/search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        jql,
        maxResults,
        fields: ['summary', 'status', 'priority', 'assignee', 'created', 'updated', 'description'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { issues: JiraIssue[] };
    return data.issues;
  }

  /**
   * Get a specific issue by key.
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const url = `${this.config.url}/rest/api/3/issue/${issueKey}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as JiraIssue;
  }

  /**
   * Add a comment to an issue.
   * (Write operation - will be routed through gateway with REVIEW policy)
   */
  async addComment(issueKey: string, comment: string): Promise<void> {
    const url = `${this.config.url}/rest/api/3/issue/${issueKey}/comment`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment,
                },
              ],
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Transition an issue to a new status.
   * (Write operation - will be routed through gateway with REVIEW policy)
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const url = `${this.config.url}/rest/api/3/issue/${issueKey}/transitions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        transition: {
          id: transitionId,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }
  }
}
