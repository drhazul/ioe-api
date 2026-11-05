import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

export type OdooMapEntryRole =
  | 'PRINCIPAL'
  | 'DEBE'
  | 'HABER'
  | 'CONTRAPARTIDA';

export interface ResolveOdooAccountMapInput {
  fiscalEntityId: number;
  sourceAccount: string;
  branch: string;
  eventType: string;
  entryRole: OdooMapEntryRole;
  sourceAmount: number;
  eventDate: string;
}

export interface ResolvedOdooAccountMap {
  mapId: number;
  fiscalEntityId: number;
  branch: string;
  eventType: string;
  entryRole: OdooMapEntryRole;
  sourceSign: 'POSITIVO' | 'NEGATIVO';
  odooEnvironment: 'ONLINE';
  odooCompanyId: number;
  odooAccountCode: string;
}

type FiscalEntityRow = {
  ID_ENTIDAD_FISCAL: number;
  ESTADO_VALIDACION: string;
};

type BranchLinkRow = {
  ID_RELACION: number;
  ESTADO_VALIDACION: string;
};

type MapRow = {
  ID_MAPEO: number | string;
  ID_ENTIDAD_FISCAL: number | string;
  SUC: string | null;
  TIPO_EVENTO: string;
  ROL_APUNTE: OdooMapEntryRole;
  SIGNO_IMPORTE: string;
  ODOO_ENTORNO: string;
  ODOO_COMPANY_ID: number | string;
  ODOO_COD_CUENTA: string;
  ESTADO_MAPEO: string;
  APROBADO_POR: string | null;
  REFERENCIA_APROBACION: string | null;
  FCN_APROBACION_UTC: Date | string | null;
};

@Injectable()
export class OdooAccountMapService {
  constructor(private readonly db: DataSource) {}

  async resolve(input: ResolveOdooAccountMapInput): Promise<ResolvedOdooAccountMap> {
    const normalized = this.validateInput(input);
    const [entity] = (await this.db.query(
      `SELECT ID_ENTIDAD_FISCAL,ESTADO_VALIDACION
       FROM dbo.ENTIDAD_FISCAL WHERE ID_ENTIDAD_FISCAL=@0;`,
      [normalized.fiscalEntityId],
    )) as FiscalEntityRow[];
    if (!entity) throw new NotFoundException('Entidad fiscal no existe');
    if (entity.ESTADO_VALIDACION !== 'VALIDADA') {
      throw new ConflictException(
        'Entidad fiscal sigue pendiente; no se resuelve cuenta Odoo.',
      );
    }

    const links = (await this.db.query(
      `SELECT ID_RELACION,ESTADO_VALIDACION
       FROM dbo.ENTIDAD_FISCAL_SUCURSAL
       WHERE ID_ENTIDAD_FISCAL=@0 AND SUC=@1
         AND VIGENTE_DESDE<=CONVERT(date,@2,23)
         AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=CONVERT(date,@2,23))
       ORDER BY ID_RELACION;`,
      [normalized.fiscalEntityId, normalized.branch, normalized.eventDate],
    )) as BranchLinkRow[];
    if (links.length !== 1 || links[0].ESTADO_VALIDACION !== 'VALIDADA') {
      throw new ConflictException(
        'Sucursal sin un vínculo fiscal único y validado en fecha del evento.',
      );
    }

    const candidates = (await this.db.query(
      `SELECT ID_MAPEO,ID_ENTIDAD_FISCAL,SUC,TIPO_EVENTO,ROL_APUNTE,
         SIGNO_IMPORTE,ODOO_ENTORNO,ODOO_COMPANY_ID,ODOO_COD_CUENTA,
         ESTADO_MAPEO,APROBADO_POR,REFERENCIA_APROBACION,FCN_APROBACION_UTC
       FROM dbo.INT_ODOO_CTA_MAP
       WHERE ODOO_ENTORNO='ONLINE' AND ID_ENTIDAD_FISCAL=@0 AND CTA_IOE=@1
         AND TIPO_EVENTO=@2 AND ROL_APUNTE=@3
         AND SIGNO_IMPORTE IN(@4,'CUALQUIERA')
         AND (SUC=@5 OR SUC IS NULL)
       ORDER BY CASE WHEN SUC=@5 THEN 0 ELSE 1 END,
         CASE WHEN SIGNO_IMPORTE=@4 THEN 0 ELSE 1 END;`,
      [
        normalized.fiscalEntityId,
        normalized.sourceAccount,
        normalized.eventType,
        normalized.entryRole,
        normalized.sourceSign,
        normalized.branch,
      ],
    )) as MapRow[];
    if (!candidates.length) {
      throw new NotFoundException('No existe equivalencia para cuenta/evento.');
    }

    const best = candidates.filter(
      (row) =>
        (row.SUC === normalized.branch) ===
          (candidates[0].SUC === normalized.branch) &&
        (row.SIGNO_IMPORTE === normalized.sourceSign) ===
          (candidates[0].SIGNO_IMPORTE === normalized.sourceSign),
    );
    if (best.length !== 1) {
      throw new ConflictException(
        'Más de una equivalencia tiene la misma prioridad; detener y revisar mapa.',
      );
    }

    const map = best[0];
    if (map.ESTADO_MAPEO !== 'VALIDADA') {
      throw new ConflictException(
        `Equivalencia está ${map.ESTADO_MAPEO}; solo se resuelven mapas VALIDADA.`,
      );
    }
    if (!map.APROBADO_POR || !map.REFERENCIA_APROBACION || !map.FCN_APROBACION_UTC) {
      throw new ConflictException(
        'Equivalencia carece de evidencia completa de aprobación.',
      );
    }
    if (map.ODOO_ENTORNO !== 'ONLINE' || Number(map.ODOO_COMPANY_ID) <= 0) {
      throw new ConflictException('Destino Odoo inválido o no habilitado.');
    }

    return {
      mapId: Number(map.ID_MAPEO),
      fiscalEntityId: Number(map.ID_ENTIDAD_FISCAL),
      branch: normalized.branch,
      eventType: map.TIPO_EVENTO,
      entryRole: map.ROL_APUNTE,
      sourceSign: normalized.sourceSign,
      odooEnvironment: 'ONLINE',
      odooCompanyId: Number(map.ODOO_COMPANY_ID),
      odooAccountCode: map.ODOO_COD_CUENTA,
    };
  }

  private validateInput(input: ResolveOdooAccountMapInput) {
    if (!Number.isInteger(input?.fiscalEntityId) || input.fiscalEntityId <= 0) {
      throw new BadRequestException('ID de entidad fiscal inválido.');
    }
    const sourceAccount = String(input.sourceAccount ?? '').trim();
    const branch = String(input.branch ?? '').trim();
    const eventType = String(input.eventType ?? '').trim();
    if (!sourceAccount || sourceAccount.length > 255) {
      throw new BadRequestException('Cuenta fuente inválida.');
    }
    if (!branch || branch.length > 10) {
      throw new BadRequestException('Sucursal requerida o inválida.');
    }
    if (!eventType || eventType.length > 64) {
      throw new BadRequestException('Tipo de evento inválido.');
    }
    if (
      !['PRINCIPAL', 'DEBE', 'HABER', 'CONTRAPARTIDA'].includes(
        input.entryRole,
      )
    ) {
      throw new BadRequestException('Rol de apunte inválido.');
    }
    if (!Number.isFinite(input.sourceAmount) || input.sourceAmount === 0) {
      throw new BadRequestException(
        'Importe fuente debe ser numérico y distinto de cero.',
      );
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) ||
      Number.isNaN(Date.parse(`${input.eventDate}T00:00:00Z`)) ||
      new Date(`${input.eventDate}T00:00:00Z`).toISOString().slice(0, 10) !==
        input.eventDate
    ) {
      throw new BadRequestException('Fecha del evento debe ser YYYY-MM-DD válida.');
    }
    return {
      fiscalEntityId: input.fiscalEntityId,
      sourceAccount,
      branch,
      eventType,
      entryRole: input.entryRole,
      eventDate: input.eventDate,
      sourceSign: input.sourceAmount > 0 ? 'POSITIVO' : 'NEGATIVO',
    } as const;
  }
}
