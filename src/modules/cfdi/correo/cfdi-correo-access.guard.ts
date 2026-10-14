import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AdminOnlyGuard } from '../../../common/guards/admin-only.guard';

const FACTURACION_TIENDAS_ROLE_ID = 8002;

@Injectable()
export class CfdiCorreoAccessGuard implements CanActivate {
  constructor(private readonly adminOnlyGuard: AdminOnlyGuard) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (Number(user?.roleId) === FACTURACION_TIENDAS_ROLE_ID) return true;

    return this.adminOnlyGuard.canActivate(context);
  }
}
