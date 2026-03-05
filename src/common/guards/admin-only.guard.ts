import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (!user) throw new UnauthorizedException('No autenticado');

    const roleId = Number(user.roleId);
    const nivel = Number(user.nivel);

    const adminRoleIds = this.parseIds(
      process.env.ADMIN_ROLE_IDS,
      process.env.ADMIN_ROLE_ID,
    );
    const adminNiveles = this.parseIds(
      process.env.ADMIN_NIVELES,
      process.env.ADMIN_NIVEL,
    );

    const roleAllowed = (adminRoleIds.length ? adminRoleIds : [0]).includes(
      roleId,
    );
    const nivelAllowed =
      adminNiveles.length > 0 && adminNiveles.includes(nivel);

    if (!roleAllowed && !nivelAllowed) {
      throw new ForbiddenException('Solo ADMIN puede realizar esta acción');
    }

    return true;
  }

  private parseIds(...values: Array<string | undefined>) {
    const out: number[] = [];
    for (const value of values) {
      if (!value) continue;
      for (const part of value.split(',')) {
        const n = Number(part.trim());
        if (Number.isFinite(n)) out.push(n);
      }
    }
    return out;
  }
}
