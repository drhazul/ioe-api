import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { FactClientShpEntity } from './factclientshp.entity';
import { CreateFactClientShpDto } from './dto/create-factclientshp.dto';
import { UpdateFactClientShpDto } from './dto/update-factclientshp.dto';

@Injectable()
export class FactClientShpService {
  private facSvrShapColumnsCache: Set<string> | null = null;

  constructor(
    @InjectRepository(FactClientShpEntity)
    private readonly repo: Repository<FactClientShpEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private normalizeUsoCfdi(value: string) {
    const trimmed = value.trim();
    const parts = trimmed.split(' - ');
    return (parts[0] ?? trimmed).trim();
  }

  private parseRegimenFiscal(value: number | string) {
    if (typeof value === 'number') return value;
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+)/);
    if (!match) return NaN;
    return Number(match[1]);
  }

  private isAdmin(user?: { roleId?: number } | null) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private async getFacSvrShapColumns(manager: EntityManager) {
    if (this.facSvrShapColumnsCache) return this.facSvrShapColumnsCache;

    const tableRows = await manager.query(
      "SELECT CASE WHEN OBJECT_ID('dbo.FAC_SVR_SHAP','U') IS NULL THEN 0 ELSE 1 END AS HAS_TABLE",
    );
    const hasTable = Number((tableRows?.[0] ?? {}).HAS_TABLE ?? 0) === 1;
    if (!hasTable) {
      this.facSvrShapColumnsCache = new Set<string>();
      return this.facSvrShapColumnsCache;
    }

    const colsRows = await manager.query(
      `SELECT UPPER(name) AS COL
       FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.FAC_SVR_SHAP')`,
    );

    this.facSvrShapColumnsCache = new Set<string>(
      (colsRows ?? [])
        .map((row: Record<string, unknown>) =>
          String(row.COL ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((value: string) => value.length > 0),
    );
    return this.facSvrShapColumnsCache;
  }

  private async syncPendingFacSvrShapByCliente(
    manager: EntityManager,
    cliente: FactClientShpEntity,
  ) {
    const columns = await this.getFacSvrShapColumns(manager);
    if (!columns.size) return;

    const clienColumn = columns.has('CLIEN')
      ? 'CLIEN'
      : columns.has('CLIENTE')
      ? 'CLIENTE'
      : null;
    if (!clienColumn) return;

    const setClauses: string[] = [];
    const params: unknown[] = [cliente.IDC];
    const addParam = (value: unknown) => {
      params.push(value);
      return `@${params.length - 1}`;
    };

    const addSet = (column: string, value: unknown) => {
      if (!columns.has(column.toUpperCase())) return;
      setClauses.push(`${column}=${addParam(value)}`);
    };

    addSet('RazonSocialReceptor', cliente.RAZONSOCIALRECEPTOR ?? null);
    addSet('RfcReceptor', cliente.RFCRECEPTOR ?? null);
    addSet('EmailReceptor', cliente.EMAILRECEPTOR ?? null);
    addSet('RfcEmisor', cliente.RFCEMISOR ?? null);
    addSet('UsoCfdi', cliente.USOCFDI ?? null);
    addSet('CodigoPostalReceptor', cliente.CODIGOPOSTALRECEPTOR ?? null);
    addSet('RegimenFiscalReceptor', cliente.REGIMENFISCALRECEPTOR ?? null);

    if (!setClauses.length) return;

    const estatusParam = addParam('PENDIENTE');
    await manager.query(
      `UPDATE FAC_SVR_SHAP
         SET ${setClauses.join(', ')}
       WHERE ${clienColumn}=@0
         AND UPPER(LTRIM(RTRIM(ISNULL(CAST(ESTATUS AS NVARCHAR(255)), ''))))=${estatusParam}`,
      params,
    );
  }

  findAll(user?: { roleId?: number; suc?: string | null }) {
    const table = this.repo.metadata.tablePath;
    if (this.isAdmin(user)) {
      return this.repo.query(`SELECT * FROM ${table} ORDER BY IDC ASC`);
    }
    const suc = (user?.suc ?? '').trim();
    if (!suc) return [];
    return this.repo.query(
      `SELECT * FROM ${table} WHERE SUC = @0 ORDER BY IDC ASC`,
      [suc],
    );
  }

  async findOne(id: number, user?: { roleId?: number; suc?: string | null }) {
    const table = this.repo.metadata.tablePath;
    if (this.isAdmin(user)) {
      const rows = await this.repo.query(
        `SELECT TOP 1 * FROM ${table} WHERE IDC = @0`,
        [id],
      );
      if (!rows?.length)
        throw new NotFoundException(`FACT_CLIENT_SHP ${id} no existe`);
      return rows[0];
    }
    const suc = (user?.suc ?? '').trim();
    if (!suc) throw new NotFoundException(`FACT_CLIENT_SHP ${id} no existe`);
    const rows = await this.repo.query(
      `SELECT TOP 1 * FROM ${table} WHERE IDC = @0 AND SUC = @1`,
      [id, suc],
    );
    if (!rows?.length)
      throw new NotFoundException(`FACT_CLIENT_SHP ${id} no existe`);
    return rows[0];
  }

  async create(
    dto: CreateFactClientShpDto,
    user?: { roleId?: number; suc?: string | null },
  ) {
    const isAdmin = this.isAdmin(user);
    const suc = (user?.suc ?? '').trim();
    if (!isAdmin && !suc) {
      throw new ForbiddenException('Usuario sin sucursal');
    }

    const sucFinal = isAdmin ? (dto.SUC ?? '').trim() : suc;
    if (!sucFinal) throw new BadRequestException('SUC requerida');

    const usoCfdi = this.normalizeUsoCfdi(dto.USOCFDI ?? '');
    if (!usoCfdi) throw new BadRequestException('UsoCfdi requerido');

    const regimenFiscal = this.parseRegimenFiscal(dto.REGIMENFISCALRECEPTOR);
    if (!Number.isFinite(regimenFiscal) || regimenFiscal <= 0) {
      throw new BadRequestException('RegimenFiscalReceptor inválido');
    }

    const params = [
      sucFinal,
      dto.RAZONSOCIALRECEPTOR,
      dto.RFCRECEPTOR,
      dto.EMAILRECEPTOR,
      dto.RFCEMISOR,
      usoCfdi,
      dto.CODIGOPOSTALRECEPTOR,
      regimenFiscal,
      dto.DOMI ?? null,
      dto.NCEL ?? null,
      dto.OPTICA ?? null,
    ];

    let result: any[];
    try {
      result = await this.dataSource.query(
        `
        DECLARE @IDC_OUT FLOAT;
        EXEC dbo.sp_factclientshp_create
          @SUC=@0,
          @RazonSocialReceptor=@1,
          @RfcReceptor=@2,
          @EmailReceptor=@3,
          @RfcEmisor=@4,
          @UsoCfdi=@5,
          @CodigoPostalReceptor=@6,
          @RegimenFiscalReceptor=@7,
          @DOMI=@8,
          @NCEL=@9,
          @OPTICA=@10,
          @IDC_OUT=@IDC_OUT OUTPUT;
        SELECT @IDC_OUT AS IDC_GENERADO;
        `,
        params,
      );
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo crear FACT_CLIENT_SHP: ${err?.message ?? 'error inesperado'}`,
      );
    }

    const firstRow = result?.[0] ?? null;
    let idc: any =
      firstRow?.IDC_GENERADO ??
      firstRow?.IDC ??
      firstRow?.Idc ??
      firstRow?.idc ??
      null;
    if (!idc && firstRow) {
      const key = Object.keys(firstRow).find((k) => {
        const normalized = k.toLowerCase();
        return (
          normalized === 'idc' ||
          normalized === 'idc_generado' ||
          normalized === 'idc_out'
        );
      });
      if (key) idc = firstRow[key];
    }

    const idcNumber = typeof idc === 'number' ? idc : Number(idc);
    if (!Number.isFinite(idcNumber)) {
      // Si el SP retornó directamente el registro, úsalo como respuesta
      if (firstRow && firstRow.IDC !== undefined) {
        return firstRow;
      }
      throw new ConflictException('No se pudo generar IDC');
    }

    const rows = await this.dataSource.query(
      `SELECT * FROM ${this.repo.metadata.tablePath} WHERE IDC = @0`,
      [idcNumber],
    );
    if (!rows?.length)
      throw new NotFoundException(`FACT_CLIENT_SHP ${idcNumber} no existe`);
    return rows[0];
  }

  async update(
    id: number,
    dto: UpdateFactClientShpDto,
    user?: { roleId?: number; suc?: string | null },
  ) {
    const row = await this.findOne(id, user);
    const isAdmin = this.isAdmin(user);
    const suc = (user?.suc ?? '').trim();
    if (!isAdmin && !suc) {
      throw new ForbiddenException('Usuario sin sucursal');
    }

    const partial: Partial<FactClientShpEntity> = {};
    if (dto.CLIEN_UNI !== undefined) partial.CLIEN_UNI = dto.CLIEN_UNI ?? null;
    if (dto.TIPO !== undefined) partial.TIPO = dto.TIPO ?? null;
    if (dto.FCNR !== undefined)
      partial.FCNR = dto.FCNR ? new Date(dto.FCNR) : null;
    if (dto.RAZONSOCIALRECEPTOR !== undefined)
      partial.RAZONSOCIALRECEPTOR = dto.RAZONSOCIALRECEPTOR;
    if (dto.DOMI !== undefined) partial.DOMI = dto.DOMI ?? null;
    if (dto.RFCRECEPTOR !== undefined) partial.RFCRECEPTOR = dto.RFCRECEPTOR;
    if (dto.NCEL !== undefined) partial.NCEL = dto.NCEL ?? null;
    if (dto.NTJT !== undefined) partial.NTJT = dto.NTJT ?? null;
    if (dto.EMAILRECEPTOR !== undefined)
      partial.EMAILRECEPTOR = dto.EMAILRECEPTOR;
    if (dto.RFCEMISOR !== undefined) partial.RFCEMISOR = dto.RFCEMISOR;
    if (dto.OPTICA !== undefined) partial.OPTICA = dto.OPTICA ?? null;
    if (dto.USOCFDI !== undefined) {
      const usoCfdi = this.normalizeUsoCfdi(dto.USOCFDI ?? '');
      if (!usoCfdi) throw new BadRequestException('UsoCfdi requerido');
      partial.USOCFDI = usoCfdi;
    }
    if (dto.CODIGOPOSTALRECEPTOR !== undefined) {
      partial.CODIGOPOSTALRECEPTOR = dto.CODIGOPOSTALRECEPTOR;
    }
    if (dto.REGIMENFISCALRECEPTOR !== undefined) {
      const regimenFiscal = this.parseRegimenFiscal(dto.REGIMENFISCALRECEPTOR);
      if (!Number.isFinite(regimenFiscal) || regimenFiscal <= 0) {
        throw new BadRequestException('RegimenFiscalReceptor inválido');
      }
      partial.REGIMENFISCALRECEPTOR = regimenFiscal;
    }
    if (dto.I_CRED !== undefined) partial.I_CRED = dto.I_CRED ?? null;
    if (dto.VF !== undefined) partial.VF = dto.VF ?? null;
    if (dto.ESTATUS !== undefined) partial.ESTATUS = dto.ESTATUS ?? null;
    if (dto.DATVAL !== undefined) partial.DATVAL = dto.DATVAL ?? null;
    if (dto.MOD !== undefined) partial.MOD = dto.MOD ?? null;
    if (isAdmin) {
      if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    } else {
      partial.SUC = suc;
    }
    if (dto.DESCUENTOAPLI !== undefined)
      partial.DESCUENTOAPLI = dto.DESCUENTOAPLI ?? null;

    const updated = this.repo.merge(row, partial);

    return this.dataSource.transaction(async (manager) => {
      const trxRepo = manager.getRepository(FactClientShpEntity);
      const saved = await trxRepo.save(updated);
      await this.syncPendingFacSvrShapByCliente(manager, saved);
      const rows = await manager.query(
        `SELECT TOP 1 * FROM ${this.repo.metadata.tablePath} WHERE IDC = @0`,
        [saved.IDC],
      );
      return rows?.[0] ?? saved;
    });
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar FACT_CLIENT_SHP ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IDC: id };
  }
}
