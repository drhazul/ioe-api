import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/jwt.strategy';
import { CajonEstadoAutorizarDto } from './dto/cajon-estado-autorizar.dto';
import { CajonEstadoResumenQueryDto } from './dto/cajon-estado-resumen-query.dto';
import { CajonEstadoSessionStore } from './cajon-estado-session.store';
import { CajonEstadoResumenRow } from './cajon-estado.types';

type SupervisorRow = {
  IDUSUARIO?: number;
  USERNAME?: string;
  PASSWORD_HASH?: string;
  ROLE_CODE?: string;
  ROLE_NAME?: string;
};

@Injectable()
export class CajonEstadoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly sessionStore: CajonEstadoSessionStore,
  ) {}

  async autorizarSupervisor(
    dto: CajonEstadoAutorizarDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const passwordSupervisor = this.normalize(dto.passwordSupervisor);
    if (!passwordSupervisor) {
      throw new BadRequestException('passwordSupervisor es obligatorio');
    }

    const requestedByUserId = this.resolveUserId(user);
    const opvSolicitante = this.resolveOpv(user);
    const supervisor = await this.findSupervisorByPassword(passwordSupervisor);
    if (!supervisor) {
      throw new ForbiddenException(
        'Password de supervisor invalida o sin rol SUPERVISOR',
      );
    }

    const session = this.sessionStore.issue({
      scope: 'CAJON_ESTADO',
      supervisorUserId: supervisor.idUsuario,
      requestedByUserId,
    });

    await this.audit.log({
      IDUSUARIO: requestedByUserId,
      ACTION: 'POST',
      MODULO: 'cajon_estado',
      ENTIDAD: 'autorizar',
      METADATA_JSON: JSON.stringify({
        opvSolicitante,
        supervisorUserId: supervisor.idUsuario,
        ok: true,
      }),
      SUC: user.suc ?? null,
      IP: ip,
    });

    return {
      authorizationToken: session.token,
      supervisorUserId: String(supervisor.idUsuario),
    };
  }

  async getResumen(
    query: CajonEstadoResumenQueryDto,
    user: JwtPayload,
    ip: string | null,
  ): Promise<CajonEstadoResumenRow[]> {
    const opv = this.resolveOpv(user);
    const requestedByUserId = this.resolveUserId(user);
    const fechaDate = this.parseFecha(query.fecha);
    const fecha = this.formatDate(fechaDate);

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_cajon_estado_resumen
          @OPV = @0,
          @FECHA = @1
        `,
        [opv, fecha],
      );

      const mapped = (rows ?? []).map((raw: Record<string, unknown>) => ({
        OPV: this.normalize(raw.OPV) || opv,
        FORM: this.normalizeUpper(raw.FORM),
        NOM: this.normalize(raw.NOM),
        IMPT: this.toNumber(raw.IMPT) ?? 0,
        IMPR: this.toNumber(raw.IMPR) ?? 0,
        IMPE: raw.IMPE == null ? null : this.toNumber(raw.IMPE) ?? 0,
        DIFD: this.toNumber(raw.DIFD) ?? 0,
      }));

      await this.audit.log({
        IDUSUARIO: requestedByUserId,
        ACTION: 'GET',
        MODULO: 'cajon_estado',
        ENTIDAD: 'resumen',
        METADATA_JSON: JSON.stringify({
          opv,
          fecha,
        }),
        SUC: user.suc ?? null,
        IP: ip,
      });

      return mapped;
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar estado de cajon');
    }
  }

  private async findSupervisorByPassword(password: string): Promise<{
    idUsuario: number;
    username: string;
  } | null> {
    const rows = await this.dataSource.query(
      `
      SELECT
        U.IDUSUARIO,
        U.USERNAME,
        U.PASSWORD_HASH,
        R.CODIGO AS ROLE_CODE,
        R.NOMBRE AS ROLE_NAME
      FROM dbo.USUARIO U
      INNER JOIN dbo.ROL R ON R.IDROL = U.IDROL
      WHERE U.ESTATUS = 'ACTIVO'
        AND R.ACTIVO = 1
        AND (
          UPPER(LTRIM(RTRIM(ISNULL(R.CODIGO, '')))) = 'SUPERVISOR'
          OR UPPER(LTRIM(RTRIM(ISNULL(R.NOMBRE, '')))) LIKE '%SUPERVISOR%'
        )
      `,
    );

    for (const raw of rows ?? []) {
      const row = raw as SupervisorRow;
      const hash = this.normalize(row.PASSWORD_HASH);
      if (!hash) continue;
      const ok = await bcrypt.compare(password, hash);
      if (!ok) continue;
      const idUsuario = Number(row.IDUSUARIO ?? 0) || 0;
      if (idUsuario <= 0) continue;
      return {
        idUsuario,
        username: this.normalize(row.USERNAME),
      };
    }
    return null;
  }

  private resolveOpv(user: JwtPayload): string {
    const opv = this.normalizeUpper(user?.username ?? '');
    if (!opv) {
      throw new BadRequestException(
        'No se pudo resolver OPV del usuario autenticado',
      );
    }
    return opv;
  }

  private resolveUserId(user: JwtPayload): number {
    const idUsuario = Number(user?.sub ?? 0) || 0;
    if (idUsuario <= 0) {
      throw new BadRequestException(
        'No se pudo resolver usuario autenticado para auditoria',
      );
    }
    return idUsuario;
  }

  private parseFecha(fecha?: string): Date {
    const text = this.normalize(fecha);
    if (!text) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException('fecha invalida');
    }
    const [yy, mm, dd] = text.split('-').map((part) => Number(part));
    const parsed = new Date(yy, mm - 1, dd);
    if (
      parsed.getFullYear() !== yy ||
      parsed.getMonth() !== mm - 1 ||
      parsed.getDate() !== dd
    ) {
      throw new BadRequestException('fecha invalida');
    }
    return parsed;
  }

  private formatDate(value: Date): string {
    const y = value.getFullYear().toString().padStart(4, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private normalize(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown): string {
    return this.normalize(value).toUpperCase();
  }

  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mapError(error: unknown, fallback: string) {
    if (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException
    ) {
      return error;
    }
    if (error instanceof QueryFailedError) {
      const message = this.normalize((error as Error).message);
      if (message) return new BadRequestException(message);
    }
    return new BadRequestException(fallback);
  }
}
