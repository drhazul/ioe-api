import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CajonEstadoAuthSession, CajonEstadoScope } from './cajon-estado.types';

type SessionValidationInput = {
  scope: CajonEstadoScope;
  requestedByUserId: number;
};

@Injectable()
export class CajonEstadoSessionStore {
  private readonly sessions = new Map<string, CajonEstadoAuthSession>();
  private readonly tokenByUserScope = new Map<string, string>();
  private readonly maxSessions = 2000;

  issue(input: {
    scope: CajonEstadoScope;
    supervisorUserId: number;
    requestedByUserId: number;
  }): CajonEstadoAuthSession {
    const scopeKey = this.scopeKey(input.scope, input.requestedByUserId);
    const previousToken = this.tokenByUserScope.get(scopeKey);
    if (previousToken) {
      this.sessions.delete(previousToken);
      this.tokenByUserScope.delete(scopeKey);
    }

    const issuedAtMs = Date.now();
    const token = randomBytes(32).toString('base64url');

    const session: CajonEstadoAuthSession = {
      token,
      scope: input.scope,
      supervisorUserId: input.supervisorUserId,
      requestedByUserId: input.requestedByUserId,
      issuedAtMs,
    };
    this.sessions.set(token, session);
    this.tokenByUserScope.set(scopeKey, token);
    this.trimOverflow();
    return session;
  }

  validate(
    token: string,
    input: SessionValidationInput,
  ): CajonEstadoAuthSession | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.scope !== input.scope) return null;
    if (session.requestedByUserId !== input.requestedByUserId) return null;
    return session;
  }

  private scopeKey(scope: CajonEstadoScope, requestedByUserId: number): string {
    return `${scope}:${requestedByUserId}`;
  }

  private trimOverflow(): void {
    while (this.sessions.size > this.maxSessions) {
      const oldestToken = this.sessions.keys().next().value as string | undefined;
      if (!oldestToken) return;
      const oldestSession = this.sessions.get(oldestToken);
      this.sessions.delete(oldestToken);
      if (!oldestSession) continue;
      const scopeKey = this.scopeKey(
        oldestSession.scope,
        oldestSession.requestedByUserId,
      );
      const currentToken = this.tokenByUserScope.get(scopeKey);
      if (currentToken === oldestToken) {
        this.tokenByUserScope.delete(scopeKey);
      }
    }
  }
}
