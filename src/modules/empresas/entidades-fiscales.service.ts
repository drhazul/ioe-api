import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateEntidadFiscalDto } from './dto/create-entidad-fiscal.dto';
import { CreateEntidadFiscalSucursalDto } from './dto/create-entidad-fiscal-sucursal.dto';
import { UpdateEntidadFiscalDto } from './dto/update-entidad-fiscal.dto';
import { UpdateEntidadFiscalSucursalDto } from './dto/update-entidad-fiscal-sucursal.dto';

type EntityRow = Record<string, any>;

@Injectable()
export class EntidadesFiscalesService {
  constructor(private readonly db: DataSource) {}

  async list(user: JwtPayload) {
    this.authorize(user);
    const rows: EntityRow[] = await this.db.query(`
      SELECT e.ID_ENTIDAD_FISCAL idEntidadFiscal,e.RFC rfc,e.TIPO_PERSONA tipoPersona,
        e.NOMBRE_LEGAL nombreLegal,e.NOMBRE_COMERCIAL nombreComercial,
        e.REGIMEN_FISCAL regimenFiscal,e.CP_FISCAL cpFiscal,e.DOMICILIO_FISCAL domicilioFiscal,
        e.ESTADO_VALIDACION estadoValidacion,e.REFERENCIA_VALIDACION referenciaValidacion,
        e.ORIGEN_CANDIDATO origenCandidato,e.VALIDADO_POR validadoPor,
        CONVERT(varchar(16),CONVERT(binary(8),e.VERSION),2) version,
        r.ID_RELACION idRelacion,r.SUC suc,r.VIGENTE_DESDE vigenteDesde,
        r.VIGENTE_HASTA vigenteHasta,r.ESTADO_VALIDACION estadoRelacion,
        r.ORIGEN origenRelacion,r.REFERENCIA_VALIDACION referenciaRelacion,
        s.[DESC] descripcionSucursal
      FROM dbo.ENTIDAD_FISCAL e
      LEFT JOIN dbo.ENTIDAD_FISCAL_SUCURSAL r ON r.ID_ENTIDAD_FISCAL=e.ID_ENTIDAD_FISCAL
      LEFT JOIN dbo.DAT_SUC s ON s.SUC=r.SUC
      ORDER BY e.RFC,r.SUC,r.VIGENTE_DESDE,r.ID_RELACION;
    `);
    const entities = new Map<number, EntityRow>();
    for (const row of rows) {
      const id = Number(row.idEntidadFiscal);
      let entity = entities.get(id);
      if (!entity) {
        entity = {
          idEntidadFiscal: id,
          rfc: row.rfc,
          tipoPersona: row.tipoPersona,
          nombreLegal: row.nombreLegal,
          nombreComercial: row.nombreComercial,
          regimenFiscal: row.regimenFiscal,
          cpFiscal: row.cpFiscal,
          domicilioFiscal: row.domicilioFiscal,
          estadoValidacion: row.estadoValidacion,
          referenciaValidacion: row.referenciaValidacion,
          origenCandidato: row.origenCandidato,
          validadoPor: row.validadoPor,
          version: row.version,
          sucursales: [],
        };
        entities.set(id, entity);
      }
      if (row.idRelacion != null) {
        entity.sucursales.push({
          idRelacion: Number(row.idRelacion),
          suc: row.suc,
          descripcion: row.descripcionSucursal,
          vigenteDesde: this.dateOnly(row.vigenteDesde),
          vigenteHasta: this.dateOnly(row.vigenteHasta),
          estadoValidacion: row.estadoRelacion,
          origen: row.origenRelacion,
          referenciaValidacion: row.referenciaRelacion,
        });
      }
    }
    return [...entities.values()];
  }

  async get(id: number, user: JwtPayload) {
    this.authorize(user);
    const entity = (await this.list(user)).find(
      (row) => row.idEntidadFiscal === id,
    );
    if (!entity) throw new NotFoundException('Entidad fiscal no existe');
    return entity;
  }

  async listSucursales(user: JwtPayload) {
    this.authorize(user);
    return this.db.query(`
      SELECT SUC suc,[DESC] descripcion
      FROM dbo.DAT_SUC
      ORDER BY SUC;
    `);
  }

  async create(dto: CreateEntidadFiscalDto, user: JwtPayload) {
    this.authorize(user);
    const rfc = this.normalizeRfc(dto.rfc);
    this.assertRfcForType(rfc, dto.tipoPersona);
    const fields = {
      rfc,
      tipoPersona: dto.tipoPersona,
      nombreLegal: this.nullable(dto.nombreLegal),
      nombreComercial: this.nullable(dto.nombreComercial),
      regimenFiscal: this.nullable(dto.regimenFiscal),
      cpFiscal: this.nullable(dto.cpFiscal),
      domicilioFiscal: this.nullable(dto.domicilioFiscal),
    };

    try {
      const id = await this.db.transaction(async (manager) => {
        const [inserted] = await manager.query(
          `INSERT dbo.ENTIDAD_FISCAL
            (RFC,TIPO_PERSONA,NOMBRE_LEGAL,NOMBRE_COMERCIAL,REGIMEN_FISCAL,CP_FISCAL,DOMICILIO_FISCAL,
             ESTADO_VALIDACION,CREADO_POR,MODIFICADO_POR)
           OUTPUT INSERTED.ID_ENTIDAD_FISCAL idEntidadFiscal
           VALUES(@0,@1,@2,@3,@4,@5,@6,'PENDIENTE',@7,@7);`,
          [
            fields.rfc,
            fields.tipoPersona,
            fields.nombreLegal,
            fields.nombreComercial,
            fields.regimenFiscal,
            fields.cpFiscal,
            fields.domicilioFiscal,
            this.actor(user),
          ],
        );
        const id = Number(inserted.idEntidadFiscal);
        await this.audit(manager, id, null, 'ALTA', Object.keys(fields), user);
        return id;
      });
      return this.get(id, user);
    } catch (error) {
      this.mapWriteError(error);
    }
  }

  async update(id: number, dto: UpdateEntidadFiscalDto, user: JwtPayload) {
    this.authorize(user);
    try {
      await this.db.transaction(async (manager) => {
        const [row]: EntityRow[] = await manager.query(
          `SELECT ID_ENTIDAD_FISCAL idEntidadFiscal,RFC rfc,TIPO_PERSONA tipoPersona,
             NOMBRE_LEGAL nombreLegal,NOMBRE_COMERCIAL nombreComercial,REGIMEN_FISCAL regimenFiscal,
             CP_FISCAL cpFiscal,DOMICILIO_FISCAL domicilioFiscal,ESTADO_VALIDACION estadoValidacion,
             REFERENCIA_VALIDACION referenciaValidacion
           FROM dbo.ENTIDAD_FISCAL WITH(UPDLOCK,HOLDLOCK) WHERE ID_ENTIDAD_FISCAL=@0;`,
          [id],
        );
        if (!row) throw new NotFoundException('Entidad fiscal no existe');

        const next = {
          nombreLegal:
            dto.nombreLegal === undefined
              ? row.nombreLegal
              : this.nullable(dto.nombreLegal),
          nombreComercial:
            dto.nombreComercial === undefined
              ? row.nombreComercial
              : this.nullable(dto.nombreComercial),
          regimenFiscal:
            dto.regimenFiscal === undefined
              ? row.regimenFiscal
              : this.nullable(dto.regimenFiscal),
          cpFiscal:
            dto.cpFiscal === undefined
              ? row.cpFiscal
              : this.nullable(dto.cpFiscal),
          domicilioFiscal:
            dto.domicilioFiscal === undefined
              ? row.domicilioFiscal
              : this.nullable(dto.domicilioFiscal),
          referenciaValidacion:
            dto.referenciaValidacion === undefined
              ? row.referenciaValidacion
              : this.nullable(dto.referenciaValidacion),
          estadoValidacion: dto.estadoValidacion ?? row.estadoValidacion,
        };
        const dataChanged = [
          'nombreLegal',
          'nombreComercial',
          'regimenFiscal',
          'cpFiscal',
          'domicilioFiscal',
          'referenciaValidacion',
        ].some((key) => next[key] !== row[key]);
        if (
          row.estadoValidacion === 'VALIDADA' &&
          dataChanged &&
          dto.estadoValidacion !== 'PENDIENTE' &&
          dto.estadoValidacion !== 'VALIDADA'
        ) {
          throw new ConflictException(
            'Marque primero la entidad como PENDIENTE para corregir datos validados',
          );
        }
        if (
          row.estadoValidacion === 'VALIDADA' &&
          dataChanged &&
          dto.estadoValidacion === undefined
        ) {
          throw new ConflictException(
            'Marque primero la entidad como PENDIENTE para corregir datos validados',
          );
        }
        if (next.estadoValidacion === 'VALIDADA') {
          this.assertRfcForType(row.rfc, row.tipoPersona);
          this.assertReadyToValidate(next);
        }
        if (next.estadoValidacion === 'INACTIVA') {
          const [activeLink] = await manager.query(
            `SELECT TOP(1) ID_RELACION idRelacion FROM dbo.ENTIDAD_FISCAL_SUCURSAL
             WHERE ID_ENTIDAD_FISCAL=@0 AND ESTADO_VALIDACION='VALIDADA' AND VIGENTE_HASTA IS NULL;`,
            [id],
          );
          if (activeLink) {
            throw new ConflictException(
              'Cierre las vigencias de sucursal antes de inactivar entidad',
            );
          }
        }

        await manager.query(
          `UPDATE dbo.ENTIDAD_FISCAL SET
             NOMBRE_LEGAL=@1,NOMBRE_COMERCIAL=@2,REGIMEN_FISCAL=@3,CP_FISCAL=@4,
             DOMICILIO_FISCAL=@5,ESTADO_VALIDACION=@6,REFERENCIA_VALIDACION=@7,
             VALIDADO_POR=CASE WHEN @6='VALIDADA' THEN @8 ELSE NULL END,
             FCN_VALIDACION_UTC=CASE WHEN @6='VALIDADA' THEN SYSUTCDATETIME() ELSE NULL END,
             MODIFICADO_POR=@8,FCN_MODIFICACION_UTC=SYSUTCDATETIME()
           WHERE ID_ENTIDAD_FISCAL=@0;`,
          [
            id,
            next.nombreLegal,
            next.nombreComercial,
            next.regimenFiscal,
            next.cpFiscal,
            next.domicilioFiscal,
            next.estadoValidacion,
            next.referenciaValidacion,
            this.actor(user),
          ],
        );
        await this.audit(
          manager,
          id,
          null,
          'CAMBIO',
          Object.keys(dto),
          user,
        );
      });
      return this.get(id, user);
    } catch (error) {
      this.mapWriteError(error);
    }
  }

  async linkSucursal(
    id: number,
    dto: CreateEntidadFiscalSucursalDto,
    user: JwtPayload,
  ) {
    this.authorize(user);
    const suc = String(dto.suc ?? '').trim().toUpperCase();
    if (!suc) throw new BadRequestException('suc es requerida');
    try {
      return await this.db.transaction(async (manager) => {
        const [entity] = await manager.query(
          `SELECT ID_ENTIDAD_FISCAL idEntidadFiscal,ESTADO_VALIDACION estadoValidacion
           FROM dbo.ENTIDAD_FISCAL WITH(UPDLOCK,HOLDLOCK) WHERE ID_ENTIDAD_FISCAL=@0;`,
          [id],
        );
        if (!entity) throw new NotFoundException('Entidad fiscal no existe');
        if (entity.estadoValidacion === 'INACTIVA') {
          throw new ConflictException('No se puede vincular entidad inactiva');
        }
        const [branch] = await manager.query(
          'SELECT SUC FROM dbo.DAT_SUC WITH(HOLDLOCK) WHERE SUC=@0;',
          [suc],
        );
        if (!branch) throw new NotFoundException('Sucursal no existe');
        const [pending] = await manager.query(
          `SELECT TOP(1) ID_RELACION idRelacion FROM dbo.ENTIDAD_FISCAL_SUCURSAL WITH(UPDLOCK,HOLDLOCK)
           WHERE ID_ENTIDAD_FISCAL=@0 AND SUC=@1 AND ESTADO_VALIDACION='PENDIENTE';`,
          [id, suc],
        );
        if (pending) {
          throw new ConflictException(
            'Ya existe un vínculo pendiente para esta entidad y sucursal',
          );
        }
        const [inserted] = await manager.query(
          `INSERT dbo.ENTIDAD_FISCAL_SUCURSAL
            (ID_ENTIDAD_FISCAL,SUC,VIGENTE_DESDE,ESTADO_VALIDACION,ORIGEN,CREADO_POR,MODIFICADO_POR)
           OUTPUT INSERTED.ID_RELACION idRelacion
           VALUES(@0,@1,@2,'PENDIENTE','CAPTURA_ADMIN',@3,@3);`,
          [id, suc, dto.vigenteDesde ?? null, this.actor(user)],
        );
        const relationId = Number(inserted.idRelacion);
        await this.audit(
          manager,
          id,
          relationId,
          'VINCULO_ALTA',
          Object.keys(dto),
          user,
        );
        return { idRelacion: relationId, suc, estadoValidacion: 'PENDIENTE' };
      });
    } catch (error) {
      this.mapWriteError(error);
    }
  }

  async updateLink(
    id: number,
    relationId: number,
    dto: UpdateEntidadFiscalSucursalDto,
    user: JwtPayload,
  ) {
    this.authorize(user);
    try {
      await this.db.transaction(async (manager) => {
        const [row] = await manager.query(
          `SELECT r.ID_RELACION idRelacion,r.SUC suc,r.VIGENTE_DESDE vigenteDesde,
             r.VIGENTE_HASTA vigenteHasta,r.ESTADO_VALIDACION estadoValidacion,
             r.REFERENCIA_VALIDACION referenciaValidacion,e.ESTADO_VALIDACION estadoEntidad
           FROM dbo.ENTIDAD_FISCAL_SUCURSAL r WITH(UPDLOCK,HOLDLOCK)
           JOIN dbo.ENTIDAD_FISCAL e ON e.ID_ENTIDAD_FISCAL=r.ID_ENTIDAD_FISCAL
           WHERE r.ID_ENTIDAD_FISCAL=@0 AND r.ID_RELACION=@1;`,
          [id, relationId],
        );
        if (!row) throw new NotFoundException('Vínculo fiscal no existe');
        const next = {
          estadoValidacion: dto.estadoValidacion ?? row.estadoValidacion,
          vigenteDesde:
            dto.vigenteDesde === undefined
              ? this.dateOnly(row.vigenteDesde)
              : dto.vigenteDesde,
          vigenteHasta:
            dto.vigenteHasta === undefined
              ? this.dateOnly(row.vigenteHasta)
              : dto.vigenteHasta,
          referenciaValidacion:
            dto.referenciaValidacion === undefined
              ? row.referenciaValidacion
              : this.nullable(dto.referenciaValidacion),
        };
        if (
          next.vigenteDesde &&
          next.vigenteHasta &&
          next.vigenteHasta < next.vigenteDesde
        ) {
          throw new BadRequestException(
            'vigenteHasta no puede ser anterior a vigenteDesde',
          );
        }
        if (next.estadoValidacion === 'VALIDADA') {
          if (row.estadoEntidad !== 'VALIDADA') {
            throw new ConflictException(
              'Valide primero la entidad fiscal con evidencia',
            );
          }
          if (!next.vigenteDesde || !next.referenciaValidacion) {
            throw new BadRequestException(
              'La relación validada requiere vigenciaDesde y referenciaValidacion',
            );
          }
          const [overlap] = await manager.query(
            `SELECT TOP(1) ID_RELACION idRelacion FROM dbo.ENTIDAD_FISCAL_SUCURSAL WITH(UPDLOCK,HOLDLOCK)
             WHERE ID_ENTIDAD_FISCAL=@0 AND SUC=@1 AND ESTADO_VALIDACION='VALIDADA'
               AND ID_RELACION<>@2
               AND (VIGENTE_HASTA IS NULL OR VIGENTE_HASTA>=@3)
               AND (@4 IS NULL OR VIGENTE_DESDE<=@4);`,
            [id, row.suc, relationId, next.vigenteDesde, next.vigenteHasta],
          );
          if (overlap) {
            throw new ConflictException(
              'Las vigencias de esta entidad y sucursal se traslapan',
            );
          }
        }
        if (next.estadoValidacion === 'INACTIVA' && !next.vigenteHasta) {
          throw new BadRequestException(
            'Cerrar vínculo requiere vigenteHasta explícita',
          );
        }

        await manager.query(
          `UPDATE dbo.ENTIDAD_FISCAL_SUCURSAL SET
             VIGENTE_DESDE=@2,VIGENTE_HASTA=@3,ESTADO_VALIDACION=@4,
             REFERENCIA_VALIDACION=@5,MODIFICADO_POR=@6,FCN_MODIFICACION_UTC=SYSUTCDATETIME()
           WHERE ID_ENTIDAD_FISCAL=@0 AND ID_RELACION=@1;`,
          [
            id,
            relationId,
            next.vigenteDesde,
            next.vigenteHasta,
            next.estadoValidacion,
            next.referenciaValidacion,
            this.actor(user),
          ],
        );
        await this.audit(
          manager,
          id,
          relationId,
          'VINCULO_CAMBIO',
          Object.keys(dto),
          user,
        );
      });
      return this.get(id, user);
    } catch (error) {
      this.mapWriteError(error);
    }
  }

  private async audit(
    manager: EntityManager,
    entityId: number,
    relationId: number | null,
    action: string,
    fields: string[],
    user: JwtPayload,
  ) {
    await manager.query(
      `INSERT dbo.ENTIDAD_FISCAL_AUDIT(ID_ENTIDAD_FISCAL,ID_RELACION,ACCION,CAMPOS_JSON,ACTOR)
       VALUES(@0,@1,@2,@3,@4);`,
      [
        entityId,
        relationId,
        action,
        JSON.stringify({ fields: fields.sort() }),
        this.actor(user),
      ],
    );
  }

  private authorize(user: JwtPayload) {
    if (Number(user?.roleId) !== 1) {
      throw new ForbiddenException(
        'Catálogo fiscal exclusivo de ADMIN (ROL 1)',
      );
    }
  }

  private assertReadyToValidate(row: Record<string, any>) {
    if (
      !this.nullable(row.nombreLegal) ||
      !this.nullable(row.regimenFiscal) ||
      !/^\d{5}$/.test(String(row.cpFiscal ?? '')) ||
      !this.nullable(row.referenciaValidacion)
    ) {
      throw new BadRequestException(
        'Validar entidad requiere nombre legal, régimen, CP fiscal y referencia de evidencia',
      );
    }
  }

  private assertRfcForType(rfc: string, type: 'FISICA' | 'MORAL') {
    if (['CAMBIO', 'XAXX010101000', 'XEXX010101000'].includes(rfc)) {
      throw new BadRequestException('RFC placeholder/genérico no puede validarse');
    }
    const pattern =
      type === 'FISICA'
        ? /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/
        : /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
    if (!pattern.test(rfc)) {
      throw new BadRequestException(
        `RFC no coincide con el formato esperado para persona ${type.toLowerCase()}`,
      );
    }
  }

  private normalizeRfc(value: string) {
    return String(value ?? '').trim().toUpperCase();
  }

  private nullable(value?: string | null) {
    const text = String(value ?? '').trim();
    return text.length ? text : null;
  }

  private dateOnly(value?: Date | string | null) {
    if (value == null) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private actor(user: JwtPayload) {
    return `${user.sub}:${user.username}`.slice(0, 255);
  }

  private mapWriteError(error: any): never {
    const number = Number(
      error?.driverError?.number ??
        error?.driverError?.originalError?.info?.number ??
        error?.number,
    );
    if (number === 2627 || number === 2601) {
      throw new ConflictException('RFC o relación ya registrada');
    }
    if (number === 547) {
      throw new BadRequestException('Referencia a entidad o sucursal inválida');
    }
    throw error;
  }
}
