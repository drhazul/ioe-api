import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

type PvCtrOrdsRelationScope = 'RELACION_VENTA_ANTERIOR';

type PvCtrOrdsRelationAuthSession = {
  token: string;
  scope: PvCtrOrdsRelationScope;
  supervisorUserId: number;
  requestedByUserId: number;
  issuedAtMs: number;
};

@Injectable()
export class PvCtrOrdsRelationAuthStore {
  private readonly sessions = new Map<string, PvCtrOrdsRelationAuthSession>();
  private readonly tokenByUserScope = new Map<string, string>();
  private readonly maxSessions = 2000;

  issue(input: {
    scope: PvCtrOrdsRelationScope;
    supervisorUserId: number;
    requestedByUserId: number;
  }): PvCtrOrdsRelationAuthSession {
    const scopeKey = this.scopeKey(input.scope, input.requestedByUserId);
    const previousToken = this.tokenByUserScope.get(scopeKey);
    if (previousToken) {
      this.sessions.delete(previousToken);
      this.tokenByUserScope.delete(scopeKey);
    }

    const token = randomBytes(32).toString('base64url');
    const session: PvCtrOrdsRelationAuthSession = {
      token,
      scope: input.scope,
      supervisorUserId: input.supervisorUserId,
      requestedByUserId: input.requestedByUserId,
      issuedAtMs: Date.now(),
    };
    this.sessions.set(token, session);
    this.tokenByUserScope.set(scopeKey, token);
    this.trimOverflow();
    return session;
  }

  validate(
    token: string,
    input: {
      scope: PvCtrOrdsRelationScope;
      requestedByUserId: number;
    },
  ): PvCtrOrdsRelationAuthSession | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.scope !== input.scope) return null;
    if (session.requestedByUserId !== input.requestedByUserId) return null;
    return session;
  }

  private scopeKey(
    scope: PvCtrOrdsRelationScope,
    requestedByUserId: number,
  ): string {
    return `${scope}:${requestedByUserId}`;
  }

  private trimOverflow(): void {
    while (this.sessions.size > this.maxSessions) {
      const oldestToken = this.sessions.keys().next().value as
        | string
        | undefined;
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
