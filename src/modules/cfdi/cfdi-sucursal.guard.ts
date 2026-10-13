import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Injectable()
export class CfdiSucursalGuard implements CanActivate {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Usuario no autenticado.');
    const adminIds = String(
      this.config.get('ADMIN_ROLE_IDS') ||
        this.config.get('ADMIN_ROLE_ID') ||
        '0,1',
    )
      .split(',')
      .map(Number);
    const adminNiveles = String(
      this.config.get('ADMIN_NIVELES') || this.config.get('ADMIN_NIVEL') || '',
    )
      .split(',')
      .filter(Boolean)
      .map(Number);
    if (
      String(user.username).toUpperCase() === 'ADMIN' ||
      adminIds.includes(Number(user.roleId)) ||
      adminNiveles.includes(Number(user.nivel))
    )
      return true;

    const idFol = req.params?.idFol;
    const uuid = req.params?.uuid || req.body?.uuid;
    if (!idFol && !uuid) return true;
    const rows = await this.db.query(
      `SELECT TOP 1 SUC FROM dbo.FAC_SVR_SHAP WHERE ${idFol ? 'IDFOL' : 'CFDI_UUID'}=@0`,
      [idFol || uuid],
    );
    if (!rows?.length)
      throw new NotFoundException('Documento no encontrado en IOE.');
    const suc = String(rows[0].SUC ?? '')
      .trim()
      .toUpperCase();
    const autorizadas = await this.db.query(
      `SELECT DISTINCT SUC FROM dbo.USR_MOD_SUC
      WHERE UPPER(LTRIM(RTRIM(USUARIO)))=@0 AND ISNULL(ACTIVO,1)=1
      AND UPPER(LTRIM(RTRIM(MODULO))) IN ('FACTURA_QUADRUM','FACTURA_PRUEBAS')`,
      [
        String(user.username ?? '')
          .trim()
          .toUpperCase(),
      ],
    );
    const permitidas = autorizadas.length
      ? autorizadas.map((r: { SUC: unknown }) =>
          String(r.SUC).trim().toUpperCase(),
        )
      : [
          String(user.suc ?? '')
            .trim()
            .toUpperCase(),
        ];
    if (!suc || !permitidas.includes(suc))
      throw new ForbiddenException(
        'Sucursal del documento no autorizada para Quadrum.',
      );
    return true;
  }
}
