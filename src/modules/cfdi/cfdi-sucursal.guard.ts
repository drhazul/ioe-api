import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validarRfcEmisor } from './quadrum-config';

@Injectable()
export class CfdiSucursalGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Usuario no autenticado.');
    const idFol = req.params?.idFol;
    const uuid = req.params?.uuid || req.body?.uuid;
    if (!idFol && !uuid) return true;
    const rows = await this.db.query(
      `SELECT TOP 1 RfcEmisor AS RFC_EMISOR FROM dbo.FAC_SVR_SHAP WHERE ${idFol ? 'IDFOL' : 'CFDI_UUID'}=@0`,
      [idFol || uuid],
    );
    if (!rows?.length)
      throw new NotFoundException('Documento no encontrado en IOE.');
    // Autorización del titular: identidad fiscal del documento, sin límite SUC.
    // CSD, cuenta y habilitación del RFC se comprueban en el servicio de emisión.
    validarRfcEmisor(String(rows[0].RFC_EMISOR ?? ''));
    return true;
  }
}
