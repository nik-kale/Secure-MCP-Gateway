import { Issuer, Client, TokenSet } from 'openid-client';
import { CallerIdentity } from '@secure-mcp-gateway/core';

export interface OIDCConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  roleClaimPath?: string;
}

export class OIDCAuthProvider {
  private client!: Client;
  private config: OIDCConfig;

  constructor(config: OIDCConfig) {
    this.config = {
      scopes: ['openid', 'profile', 'email'],
      ...config,
    };
  }

  async initialize(): Promise<void> {
    const issuer = await Issuer.discover(this.config.issuerUrl);
    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uris: [this.config.redirectUri],
      response_types: ['code'],
    });
  }

  getAuthorizationUrl(state: string, nonce?: string): string {
    return this.client.authorizationUrl({
      scope: this.config.scopes!.join(' '),
      state,
      nonce,
    });
  }

  async handleCallback(req: any): Promise<{ identity: CallerIdentity; tokenSet: TokenSet }> {
    const params = this.client.callbackParams(req);
    // state checking should be done by caller validation of session/cookie
    const tokenSet = await this.client.callback(this.config.redirectUri, params, { state: req.query.state });
    
    const claims = tokenSet.claims();
    
    const identity: CallerIdentity = {
      id: claims.sub,
      name: (claims.name as string) || (claims.email as string) || 'Unknown',
      type: 'human',
      metadata: {
        email: claims.email,
        roles: this.extractRoles(claims),
      },
    };

    return { identity, tokenSet };
  }

  private extractRoles(claims: any): string[] {
    if (!this.config.roleClaimPath) return [];
    return (claims[this.config.roleClaimPath] as string[]) || [];
  }
}

