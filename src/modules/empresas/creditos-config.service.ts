import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  CreditosConfigDto,
  CreditosSucursalConfigDto,
} from './dto/creditos-config.dto';

@Injectable()
export class CreditosConfigService {
  constructor(private readonly db: DataSource) {}

  private authorize(user: JwtPayload) {
    if (Number(user?.roleId) !== 1)
      throw new ForbiddenException(
        'Configuración de créditos exclusiva de ADMIN (ROL 1)',
      );
  }

  async get(id: number, user: JwtPayload) {
    this.authorize(user);
    try {
      // JSON keeps multiple result sets and binary rowversions independent of driver shape.
      const [row] = await this.db.query(
        `
        IF NOT EXISTS(SELECT 1 FROM dbo.EMPRESA WHERE idempresa=@0) THROW 53400,'Empresa inexistente.',1;
        SELECT (SELECT e.IDEMPRESA,e.MODO,e.VALOR_BIT permitir,CONVERT(varchar(16),CONVERT(binary(8),e.VERSION),2) version,
          d.CLAVE,d.SEGMENTO,d.ETIQUETA FROM dbo.EMPRESA_CFG e
          JOIN dbo.DAT_CFG_DEF d ON d.CLAVE=e.CLAVE
          WHERE e.IDEMPRESA=@0 AND e.CLAVE='CRED_PERMITIR_PARCIALIDADES' FOR JSON PATH) reglas,
          (SELECT s.SUC suc,s.[DESC] descripcion,c.VALOR_SUCURSAL permitir,c.PERMITIR_PARCIAL efectivo,
          CONVERT(varchar(16),CONVERT(binary(8),c.VERSION_SUCURSAL),2) version
          FROM dbo.DAT_SUC s CROSS APPLY dbo.fn_creditos_config_efectiva(s.SUC) c
          WHERE s.IDEMPRESA=@0 ORDER BY s.SUC FOR JSON PATH,INCLUDE_NULL_VALUES) sucursales`,
        [id],
      );
      const reglas = JSON.parse(row.reglas || '[]');
      if (!reglas.length)
        throw new ConflictException(
          'Empresa sin configuración inicial de créditos; requiere alta controlada',
        );
      return {
        idempresa: id,
        credito: reglas[0],
        sucursales: JSON.parse(row.sucursales || '[]'),
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async set(id: number, dto: CreditosConfigDto, user: JwtPayload) {
    this.authorize(user);
    try {
      await this.db.query(
        'EXEC dbo.sp_creditos_config_set @IDEMPRESA=@0,@MODO=@1,@PERMITIR=@2,@VERSION_ESPERADA=@3,@ACTOR=@4',
        [
          id,
          dto.modo,
          dto.permitir,
          Buffer.from(dto.version, 'hex'),
          this.actor(user),
        ],
      );
      return { ok: true };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async setSucursal(
    id: number,
    suc: string,
    dto: CreditosSucursalConfigDto,
    user: JwtPayload,
  ) {
    this.authorize(user);
    try {
      await this.db.query(
        'EXEC dbo.sp_creditos_config_sucursal_set @IDEMPRESA=@0,@SUC=@1,@PERMITIR=@2,@VERSION_ESPERADA=@3,@ACTOR=@4',
        [
          id,
          suc.trim(),
          dto.permitir,
          Buffer.from(dto.version, 'hex'),
          this.actor(user),
        ],
      );
      return { ok: true };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private actor(user: JwtPayload) {
    return `${user.sub}:${user.username}`.slice(0, 255);
  }

  private mapError(error: any): Error {
    const number = Number(
      error?.driverError?.number ??
        error?.driverError?.originalError?.info?.number ??
        error?.number,
    );
    if (number === 53400) return new NotFoundException('Empresa inexistente');
    if ([53403, 53405, 53406].includes(number))
      return new ConflictException(
        'Configuración modificada o sucursal ajena. Recargue antes de guardar.',
      );
    if (number === 53402)
      return new ServiceUnavailableException(
        'Configuración ocupada. Reintente.',
      );
    if ([53401, 53404].includes(number))
      return new BadRequestException('Modo, valor o versión inválidos');
    return error;
  }
}
