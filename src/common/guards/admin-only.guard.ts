import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (!user) throw new UnauthorizedException('No autenticado');

    const roleId = Number(user.roleId);
    if (roleId !== 1) throw new ForbiddenException('Solo ADMIN puede realizar esta acción');

    return true;
  }
}
