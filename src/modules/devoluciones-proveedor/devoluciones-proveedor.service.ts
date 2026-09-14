import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  AddDevolucionProveedorDetalleDto,
  AddDevolucionProveedorEvidenceDto,
  ConsolidarDevolucionesProveedorDto,
  CreateDevolucionProveedorDto,
  DevolucionArticulosQueryDto,
  DevolucionProveedorActionDto,
  DevolucionesProveedorQueryDto,
  EnviarTransitoDevolucionProveedorDto,
  UpdateDevolucionProveedorDetalleDto,
  UpdateDevolucionProveedorDto,
} from './dto/devoluciones-proveedor.dto';

type UserContext = {
  userId: number;
  username: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  isAdmin: boolean;
};

@Injectable()
export class DevolucionesProveedorService {
  private static readonly MODULE_CODE = 'DEV_PROVD';

  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: DevolucionesProveedorQueryDto, user: JwtPayload) {
    await this.authorizedContext(user);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 30)));
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, value: unknown) => {
      where.push(sql.replace('?', `@${params.length}`));
      params.push(value);
    };
    if (this.text(query.doc)) add(`h.DOC LIKE ?`, `%${this.text(query.doc)}%`);
    if (this.text(query.suc))
      add(`h.SUC=?`, this.text(query.suc).toUpperCase());
    if (query.prov) add(`h.PROVD=?`, query.prov);
    if (this.text(query.estatus))
      add(`h.ESTATUS=?`, this.text(query.estatus).toUpperCase());
    if (query.from) add(`CONVERT(date,h.FCND)>=?`, query.from);
    if (query.to) add(`CONVERT(date,h.FCND)<=?`, query.to);
    if (query.motivo) {
      add(
        `EXISTS(SELECT 1 FROM dbo.DEV_CTRL_PROVD md WHERE md.DOC=h.DOC AND md.ACTIVO=1 AND md.MOV_DEV=?)`,
        query.motivo,
      );
    }
    const search = this.text(query.search).toUpperCase();
    if (search) {
      const index = params.length;
      where.push(
        `(UPPER(h.DOC) LIKE @${index} OR UPPER(ISNULL(p.ALIAS,'')) LIKE @${index} OR UPPER(ISNULL(p.RSOC,'')) LIKE @${index} OR UPPER(ISNULL(h.OBS,'')) LIKE @${index})`,
      );
      params.push(`%${search}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await this.dataSource.query(
      `SELECT COUNT(1) total FROM dbo.DEV_DOC_PROVD h JOIN dbo.DAT_PROVD p ON p.ID=h.PROVD ${whereSql}`,
      params,
    );
    const rows = await this.dataSource.query(
      `SELECT h.ID,h.DOC,h.SUC,h.ALMACEN,h.PROVD,h.DOC_OC,h.DOC_REC,h.FCND,h.TIPO_DEV,h.ESTATUS,h.OBS,
              h.USR_CREA,h.FCN_SOLICITA,h.USR_SOLICITA,h.FCN_AUTORIZA,h.USR_AUTORIZA,h.MOTIVO_RECHAZO,
              LTRIM(RTRIM(COALESCE(NULLIF(p.ALIAS,''),p.RSOC,''))) PROVEEDOR,
              t.CLAVE TIPO_CLAVE,t.[DESC] TIPO_DESC,
              ISNULL(x.RENGLONES,0) RENGLONES,ISNULL(x.CANTIDAD,0) CANTIDAD,ISNULL(x.IMPORTE,0) IMPORTE
       FROM dbo.DEV_DOC_PROVD h
       JOIN dbo.DAT_PROVD p ON p.ID=h.PROVD
       JOIN dbo.DEV_TIPO_PROVD t ON t.ID=h.TIPO_DEV
       OUTER APPLY(SELECT COUNT(1) RENGLONES,SUM(d.CTDA_DEV) CANTIDAD,SUM(d.IMPT) IMPORTE FROM dbo.DEV_CTRL_PROVD d WHERE d.DOC=h.DOC AND d.ACTIVO=1) x
       ${whereSql}
       ORDER BY h.FCND DESC,h.ID DESC
       OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY`,
      [...params, (page - 1) * limit, limit],
    );
    return {
      items: (rows ?? []).map((row: Record<string, unknown>) =>
        this.mapHeader(row),
      ),
      total: this.int(count?.[0]?.total),
      page,
      limit,
    };
  }

  async findOne(docRaw: string, user: JwtPayload) {
    await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const header = await this.headerRow(doc);
    const details = await this.dataSource.query(
      `SELECT d.IDPD,d.DOC,d.ART,a.UPC,a.DES,d.CTDA_DEV,d.CTDA_BLOQ,d.CTOP,d.IMPT,d.LOTE,d.CADUCIDAD,
              d.MOV_DEV,m.CODIGO MOTIVO_CODIGO,m.[DESC] MOTIVO_DESC,m.REQUIERE_EVIDENCIA,m.REQUIERE_DOCUMENTO,
              d.OBS,d.FCNR,ISNULL(ev.EVIDENCIAS,0) EVIDENCIAS,
              ISNULL(a.STOCK,0) STOCK,
              ISNULL(a.STOCK,0)-ISNULL(res.RESERVADO,0) DISPONIBLE,
              a.DEPA,a.SUBD,a.CLAS,a.SCLA,a.SCLA2,a.MARCA,a.SPH,a.CYL,a.ADIC
       FROM dbo.DEV_CTRL_PROVD d
       JOIN dbo.DEV_DOC_PROVD h ON h.DOC=d.DOC
       JOIN dbo.DAT_ART a ON a.SUC=h.SUC AND a.ART=d.ART
       JOIN dbo.DEV_MOTIVO_PROVD m ON m.ID=d.MOV_DEV
       OUTER APPLY(SELECT COUNT(1) EVIDENCIAS FROM dbo.DEV_EVIDENCIA_PROVD e WHERE e.IDPD=d.IDPD) ev
       OUTER APPLY(SELECT SUM(r.CTDA_BLOQ) RESERVADO FROM dbo.DEV_CTRL_PROVD r JOIN dbo.DEV_DOC_PROVD rh ON rh.DOC=r.DOC WHERE rh.SUC=h.SUC AND rh.ESTATUS='PENDIENTE' AND r.ACTIVO=1 AND r.ART=d.ART) res
       WHERE d.DOC=@0 AND d.ACTIVO=1 ORDER BY d.IDPD`,
      [doc],
    );
    const shipment = await this.dataSource.query(
      `SELECT TOP 1 e.ENVIO,e.ESTATUS,e.TRANSPORTISTA,e.GUIA,e.CAJAS,e.RMA,e.OBS,e.FCN_SALIDA,e.USR_SALIDA
       FROM dbo.DEV_ENVIO_DOC ed JOIN dbo.DEV_ENVIO_PROVD e ON e.ID=ed.IDENVIO WHERE ed.DOC=@0`,
      [doc],
    );
    return {
      ...this.mapHeader(header),
      detalle: (details ?? []).map((row: Record<string, unknown>) =>
        this.mapDetail(row),
      ),
      envio: shipment?.[0] ? this.mapShipment(shipment[0]) : null,
    };
  }

  async listEvidencias(docRaw: string, idpdRaw: string, user: JwtPayload) {
    await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const idpd = this.positiveInt(idpdRaw, 'renglon');
    const detail = await this.dataSource.query(
      `SELECT 1 ok FROM dbo.DEV_CTRL_PROVD WHERE DOC=@0 AND IDPD=@1 AND ACTIVO=1`,
      [doc, idpd],
    );
    if (!detail?.length) throw new NotFoundException('Renglon no encontrado.');
    const rows = await this.dataSource.query(
      `SELECT ID,NOMBRE_ARCHIVO,MIME_TYPE,CONTENIDO,FCNR FROM dbo.DEV_EVIDENCIA_PROVD WHERE IDPD=@0 ORDER BY FCNR DESC`,
      [idpd],
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: `${row.ID ?? ''}`,
      nombreArchivo: this.text(row.NOMBRE_ARCHIVO),
      mimeType: this.text(row.MIME_TYPE),
      contenido: this.text(row.CONTENIDO),
      fecha: row.FCNR ?? null,
    }));
  }

  async catalogTipos(user: JwtPayload) {
    await this.authorizedContext(user);
    return this.dataSource.query(
      `SELECT ID id,CLAVE clave,[DESC] descripcion FROM dbo.DEV_TIPO_PROVD WHERE ACTIVO=1 ORDER BY [DESC]`,
    );
  }

  async catalogMotivos(user: JwtPayload) {
    await this.authorizedContext(user);
    return this.dataSource.query(
      `SELECT ID id,CODIGO codigo,[DESC] descripcion,REQUIERE_EVIDENCIA requiereEvidencia,REQUIERE_DOCUMENTO requiereDocumento,PERMITE_PARCIAL permiteParcial FROM dbo.DEV_MOTIVO_PROVD WHERE ACTIVO=1 ORDER BY CODIGO`,
    );
  }

  async catalogProveedores(user: JwtPayload) {
    await this.authorizedContext(user);
    return this.dataSource.query(
      `SELECT ID id,LTRIM(RTRIM(COALESCE(NULLIF(ALIAS,''),RSOC,''))) nombre,RSOC razonSocial,RFC rfc FROM dbo.DAT_PROVD WHERE ISNULL(BLOQ,0)<>-1 ORDER BY TRY_CONVERT(INT,ID),ALIAS,RSOC`,
    );
  }

  async catalogSucursales(user: JwtPayload) {
    await this.authorizedContext(user);
    return this.dataSource.query(
      `SELECT LTRIM(RTRIM(SUC)) suc,LTRIM(RTRIM(ISNULL([DESC],''))) nombre FROM dbo.DAT_SUC ORDER BY SUC`,
    );
  }

  async catalogArticulos(query: DevolucionArticulosQueryDto, user: JwtPayload) {
    await this.authorizedContext(user);
    const suc = this.required(query.suc, 'sucursal').toUpperCase();
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 30)));
    const params: unknown[] = [suc];
    const where = [`a.SUC=@0`, `ISNULL(a.BLOQ,0)<>-1`];
    if (query.prov) {
      where.push(
        `@${params.length} IN (TRY_CONVERT(INT,a.PROV_1),TRY_CONVERT(INT,a.PROV_2),TRY_CONVERT(INT,a.PROV_3))`,
      );
      params.push(query.prov);
    }
    const search = this.text(query.search).toUpperCase();
    const searchBy = this.text(query.searchBy || 'ART').toUpperCase();
    if (!['ART', 'UPC', 'DES', 'TODO'].includes(searchBy))
      throw new BadRequestException('Tipo de busqueda invalido.');
    if (search) {
      const index = params.length;
      const expression =
        searchBy === 'TODO'
          ? `(UPPER(ISNULL(a.ART,'')) LIKE @${index} OR UPPER(ISNULL(a.UPC,'')) LIKE @${index} OR UPPER(ISNULL(a.DES,'')) LIKE @${index})`
          : `UPPER(ISNULL(a.${searchBy},'')) LIKE @${index}`;
      where.push(expression);
      params.push(`%${search}%`);
    }
    this.pushArticleNumericFilter(where, params, 'a.DEPA', query.depa);
    this.pushArticleNumericFilter(where, params, 'a.SUBD', query.subd);
    this.pushArticleNumericFilter(where, params, 'a.CLAS', query.clas);
    this.pushArticleNumericFilter(where, params, 'a.SCLA', query.scla);
    this.pushArticleNumericFilter(where, params, 'a.SCLA2', query.scla2);
    this.pushArticleNumericFilter(where, params, 'a.SPH', query.sph);
    this.pushArticleNumericFilter(where, params, 'a.CYL', query.cyl);
    this.pushArticleNumericFilter(where, params, 'a.ADIC', query.adic);
    const whereSql = where.join(' AND ');
    const count = await this.dataSource.query(
      `SELECT COUNT(1) total FROM dbo.DAT_ART a WHERE ${whereSql}`,
      params,
    );
    const rows = await this.dataSource.query(
      `SELECT a.ART art,a.UPC upc,a.DES descripcion,a.CTOP costo,a.STOCK stock,a.UN_COMP unidad,a.MARCA marca,
              ISNULL(a.STOCK,0)-ISNULL(r.RESERVADO,0) disponible
       FROM dbo.DAT_ART a
       OUTER APPLY(SELECT SUM(d.CTDA_BLOQ) RESERVADO FROM dbo.DEV_CTRL_PROVD d JOIN dbo.DEV_DOC_PROVD h ON h.DOC=d.DOC WHERE h.SUC=a.SUC AND h.ESTATUS='PENDIENTE' AND d.ACTIVO=1 AND d.ART=a.ART) r
       WHERE ${whereSql}
       ORDER BY a.DES,a.ART OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY`,
      [...params, (page - 1) * limit, limit],
    );
    return {
      items: rows ?? [],
      total: this.int(count?.[0]?.total),
      page,
      limit,
    };
  }

  async create(dto: CreateDevolucionProveedorDto, user: JwtPayload) {
    const ctx = await this.authorizedContext(user);
    const docOc = this.nullable(dto.docOc);
    const docRec = this.nullable(dto.docRec);
    if (docOc != null && docRec != null) {
      throw new BadRequestException(
        'Indique una orden de compra o una recepción de mercancía, no ambas.',
      );
    }
    const source =
      docRec != null
        ? await this.dataSource.query(
            `SELECT TOP 1 r.DOCREC,r.ESTATUS_REC FROM dbo.REC_CTRL_DOC_REC r JOIN dbo.REC_CAB_PED h ON h.NPED=r.NPED WHERE r.DOCREC=@0 AND UPPER(LTRIM(RTRIM(h.SUC)))=UPPER(LTRIM(RTRIM(@1))) AND TRY_CONVERT(INT,h.NPROV)=@2`,
            [docRec, dto.suc, dto.provd],
          )
        : docOc != null
          ? await this.dataSource.query(
              `SELECT TOP 1 h.NPED,h.ESTATUS FROM dbo.REC_CAB_PED h WHERE h.NPED=@0 AND UPPER(LTRIM(RTRIM(h.SUC)))=UPPER(LTRIM(RTRIM(@1))) AND TRY_CONVERT(INT,h.NPROV)=@2`,
              [docOc, dto.suc, dto.provd],
            )
          : [];
    if ((docOc != null || docRec != null) && !source?.length) {
      throw new BadRequestException(
        'El documento origen no existe o no corresponde a la sucursal y proveedor seleccionados.',
      );
    }
    const sourceStatus = this.text(
      source[0]?.ESTATUS_REC ?? source[0]?.ESTATUS,
    ).toUpperCase();
    if (docOc != null && !['PROCESADO', 'VALIDADO'].includes(sourceStatus)) {
      throw new BadRequestException(
        `La orden de compra debe estar en estatus PROCESADO o VALIDADO. Estatus actual: ${sourceStatus || 'SIN ESTATUS'}.`,
      );
    }
    if (
      docRec != null &&
      !['CONTABILIZADO', 'RECIBIDO'].includes(sourceStatus)
    ) {
      throw new BadRequestException(
        `La recepción de mercancía debe estar en estatus CONTABILIZADO o RECIBIDO. Estatus actual: ${sourceStatus || 'SIN ESTATUS'}.`,
      );
    }
    try {
      const rows = await this.dataSource.query(
        `EXEC dbo.sp_dev_provd_crear @SUC=@0,@ALMACEN=@1,@PROVD=@2,@TIPO_DEV=@3,@DOC_OC=@4,@DOC_REC=@5,@OBS=@6,@USR=@7`,
        [
          dto.suc,
          dto.almacen || '002',
          dto.provd,
          dto.tipoDev,
          docOc,
          docRec,
          this.nullable(dto.obs),
          ctx.username,
        ],
      );
      return this.findOne(
        this.required(rows?.[0]?.DOC ?? rows?.[0]?.doc, 'documento'),
        user,
      );
    } catch (error) {
      this.throwSql(error, 'No fue posible crear la devolucion.');
    }
  }

  async update(
    docRaw: string,
    dto: UpdateDevolucionProveedorDto,
    user: JwtPayload,
  ) {
    await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    await this.assertDraft(doc);
    if (dto.tipoDev != null) {
      const valid = await this.dataSource.query(
        `SELECT 1 ok FROM dbo.DEV_TIPO_PROVD WHERE ID=@0 AND ACTIVO=1`,
        [dto.tipoDev],
      );
      if (!valid?.length)
        throw new BadRequestException('Tipo de devolucion invalido.');
    }
    await this.dataSource.query(
      `UPDATE dbo.DEV_DOC_PROVD SET TIPO_DEV=COALESCE(@1,TIPO_DEV),DOC_OC=CASE WHEN @2='__KEEP__' THEN DOC_OC ELSE NULLIF(@2,'') END,DOC_REC=CASE WHEN @3='__KEEP__' THEN DOC_REC ELSE NULLIF(@3,'') END,OBS=CASE WHEN @4='__KEEP__' THEN OBS ELSE NULLIF(@4,'') END,FCNM=SYSDATETIME() WHERE DOC=@0`,
      [
        doc,
        dto.tipoDev ?? null,
        dto.docOc === undefined ? '__KEEP__' : this.text(dto.docOc),
        dto.docRec === undefined ? '__KEEP__' : this.text(dto.docRec),
        dto.obs === undefined ? '__KEEP__' : this.text(dto.obs),
      ],
    );
    return this.findOne(doc, user);
  }

  async addDetalle(
    docRaw: string,
    dto: AddDevolucionProveedorDetalleDto,
    user: JwtPayload,
  ) {
    const ctx = await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const bytes = dto.evidencia
      ? this.assertEvidence(dto.evidencia.contenido, dto.evidencia.mimeType)
      : null;
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const rows = await queryRunner.manager.query(
        `EXEC dbo.sp_dev_provd_agregar_articulo @DOC=@0,@ART=@1,@CTDA_DEV=@2,@CTOP=@3,@MOV_DEV=@4,@LOTE=@5,@CADUCIDAD=@6,@OBS=@7,@USR=@8`,
        [
          doc,
          dto.art,
          dto.cantidad,
          dto.costo != null && dto.costo > 0 ? dto.costo : null,
          dto.motivo,
          this.nullable(dto.lote),
          dto.caducidad ?? null,
          this.nullable(dto.obs),
          ctx.username,
        ],
      );
      const idpd = this.int(rows?.[0]?.IDPD ?? rows?.[0]?.idpd);
      if (idpd <= 0)
        throw new BadRequestException(
          'No fue posible identificar el renglon agregado.',
        );
      if (dto.evidencia) {
        await queryRunner.manager.query(
          `INSERT dbo.DEV_EVIDENCIA_PROVD(IDPD,NOMBRE_ARCHIVO,MIME_TYPE,CONTENIDO,PESO_BYTES,USR_CREA) VALUES(@0,@1,@2,@3,@4,@5)`,
          [
            idpd,
            this.nullable(dto.evidencia.nombreArchivo),
            dto.evidencia.mimeType.toLowerCase(),
            dto.evidencia.contenido,
            bytes,
            ctx.username,
          ],
        );
      }
      await queryRunner.commitTransaction();
      return this.findOne(doc, user);
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        try {
          await queryRunner.rollbackTransaction();
        } catch {
          // El procedimiento puede haber revertido la transacción anidada.
        }
      }
      this.throwSql(error, 'No fue posible agregar el articulo.');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async updateDetalle(
    docRaw: string,
    idpdRaw: string,
    dto: UpdateDevolucionProveedorDetalleDto,
    user: JwtPayload,
  ) {
    await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const idpd = this.positiveInt(idpdRaw, 'renglon');
    await this.assertDraft(doc);
    if (dto.motivo != null) {
      const valid = await this.dataSource.query(
        `SELECT 1 ok FROM dbo.DEV_MOTIVO_PROVD WHERE ID=@0 AND ACTIVO=1`,
        [dto.motivo],
      );
      if (!valid?.length) throw new BadRequestException('Motivo invalido.');
    }
    const result = await this.dataSource.query(
      `UPDATE dbo.DEV_CTRL_PROVD SET CTDA_DEV=COALESCE(@2,CTDA_DEV),CTOP=COALESCE(@3,CTOP),MOV_DEV=COALESCE(@4,MOV_DEV),LOTE=CASE WHEN @5='__KEEP__' THEN LOTE ELSE NULLIF(@5,'') END,CADUCIDAD=CASE WHEN @6='__KEEP__' THEN CADUCIDAD ELSE TRY_CONVERT(date,NULLIF(@6,'')) END,OBS=CASE WHEN @7='__KEEP__' THEN OBS ELSE NULLIF(@7,'') END,IMPT=CONVERT(MONEY,COALESCE(@2,CTDA_DEV)*COALESCE(@3,CTOP)),FCNM=SYSDATETIME() OUTPUT INSERTED.IDPD WHERE DOC=@0 AND IDPD=@1 AND ACTIVO=1`,
      [
        doc,
        idpd,
        dto.cantidad ?? null,
        dto.costo ?? null,
        dto.motivo ?? null,
        dto.lote === undefined ? '__KEEP__' : this.text(dto.lote),
        dto.caducidad === undefined ? '__KEEP__' : dto.caducidad,
        dto.obs === undefined ? '__KEEP__' : this.text(dto.obs),
      ],
    );
    if (!result?.length) throw new NotFoundException('Renglon no encontrado.');
    return this.findOne(doc, user);
  }

  async removeDetalle(docRaw: string, idpdRaw: string, user: JwtPayload) {
    await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const idpd = this.positiveInt(idpdRaw, 'renglon');
    await this.assertDraft(doc);
    const result = await this.dataSource.query(
      `SET XACT_ABORT ON;
       BEGIN TRANSACTION;
       UPDATE e SET IDPD=reemplazo.IDPD
       FROM dbo.DEV_EVIDENCIA_PROVD e
       CROSS APPLY(
         SELECT TOP 1 d.IDPD FROM dbo.DEV_CTRL_PROVD d
         WHERE d.DOC=@0 AND d.IDPD<>@1 AND d.ACTIVO=1 ORDER BY d.IDPD
       ) reemplazo
       WHERE e.IDPD=@1;
       UPDATE dbo.DEV_CTRL_PROVD
       SET ACTIVO=0,CTDA_BLOQ=0,FCNM=SYSDATETIME()
       OUTPUT INSERTED.IDPD
       WHERE DOC=@0 AND IDPD=@1 AND ACTIVO=1;
       COMMIT TRANSACTION;`,
      [doc, idpd],
    );
    if (!result?.length) throw new NotFoundException('Renglon no encontrado.');
    return this.findOne(doc, user);
  }

  async addEvidencia(
    docRaw: string,
    idpdRaw: string,
    dto: AddDevolucionProveedorEvidenceDto,
    user: JwtPayload,
  ) {
    const ctx = await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const idpd = this.positiveInt(idpdRaw, 'renglon');
    await this.assertDraft(doc);
    const bytes = this.assertEvidence(dto.contenido, dto.mimeType);
    const exists = await this.dataSource.query(
      `SELECT 1 ok FROM dbo.DEV_CTRL_PROVD WHERE DOC=@0 AND IDPD=@1 AND ACTIVO=1`,
      [doc, idpd],
    );
    if (!exists?.length) throw new NotFoundException('Renglon no encontrado.');
    await this.dataSource.query(
      `INSERT dbo.DEV_EVIDENCIA_PROVD(IDPD,NOMBRE_ARCHIVO,MIME_TYPE,CONTENIDO,PESO_BYTES,USR_CREA) VALUES(@0,@1,@2,@3,@4,@5)`,
      [
        idpd,
        this.nullable(dto.nombreArchivo),
        dto.mimeType.toLowerCase(),
        dto.contenido,
        bytes,
        ctx.username,
      ],
    );
    return this.findOne(doc, user);
  }

  async addEvidenciaDocumento(
    docRaw: string,
    dto: AddDevolucionProveedorEvidenceDto,
    user: JwtPayload,
  ) {
    const ctx = await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    await this.assertDraft(doc);
    const bytes = this.assertEvidence(dto.contenido, dto.mimeType);
    const detail = await this.dataSource.query(
      `SELECT TOP 1 IDPD FROM dbo.DEV_CTRL_PROVD WHERE DOC=@0 AND ACTIVO=1 ORDER BY IDPD`,
      [doc],
    );
    if (!detail?.length)
      throw new BadRequestException(
        'Agrega al menos un artículo antes de adjuntar evidencia.',
      );
    // La evidencia pertenece al documento: se reemplaza la anterior y no se
    // duplica por cada renglón.
    await this.dataSource.query(
      `DELETE e FROM dbo.DEV_EVIDENCIA_PROVD e JOIN dbo.DEV_CTRL_PROVD d ON d.IDPD=e.IDPD WHERE d.DOC=@0`,
      [doc],
    );
    await this.dataSource.query(
      `INSERT dbo.DEV_EVIDENCIA_PROVD(IDPD,NOMBRE_ARCHIVO,MIME_TYPE,CONTENIDO,PESO_BYTES,USR_CREA) VALUES(@0,@1,@2,@3,@4,@5)`,
      [
        detail[0].IDPD,
        this.nullable(dto.nombreArchivo),
        dto.mimeType.toLowerCase(),
        dto.contenido,
        bytes,
        ctx.username,
      ],
    );
    return this.findOne(doc, user);
  }

  async listEvidenciasDocumento(docRaw: string, user: JwtPayload) {
    await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const rows = await this.dataSource.query(
      `SELECT e.ID,e.NOMBRE_ARCHIVO,e.MIME_TYPE,e.CONTENIDO,e.FCNR
       FROM dbo.DEV_EVIDENCIA_PROVD e
       JOIN dbo.DEV_CTRL_PROVD d ON d.IDPD=e.IDPD
       WHERE d.DOC=@0 AND d.ACTIVO=1 ORDER BY e.FCNR DESC`,
      [doc],
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: `${row.ID ?? ''}`,
      nombreArchivo: this.text(row.NOMBRE_ARCHIVO),
      mimeType: this.text(row.MIME_TYPE),
      contenido: this.text(row.CONTENIDO),
      fecha: row.FCNR ?? null,
    }));
  }

  async updateEvidencia(
    docRaw: string,
    idpdRaw: string,
    evidenceIdRaw: string,
    dto: AddDevolucionProveedorEvidenceDto,
    user: JwtPayload,
  ) {
    const ctx = await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const idpd = this.positiveInt(idpdRaw, 'renglon');
    const evidenceId = this.required(evidenceIdRaw, 'evidencia');
    await this.assertDraft(doc);
    const bytes = this.assertEvidence(dto.contenido, dto.mimeType);
    const result = await this.dataSource.query(
      `UPDATE e SET NOMBRE_ARCHIVO=@3,MIME_TYPE=@4,CONTENIDO=@5,PESO_BYTES=@6,USR_CREA=@7,FCNR=SYSDATETIME()
       OUTPUT INSERTED.ID
       FROM dbo.DEV_EVIDENCIA_PROVD e
       JOIN dbo.DEV_CTRL_PROVD d ON d.IDPD=e.IDPD
       WHERE d.DOC=@0 AND d.IDPD=@1 AND d.ACTIVO=1 AND e.ID=@2`,
      [
        doc,
        idpd,
        evidenceId,
        this.nullable(dto.nombreArchivo),
        dto.mimeType.toLowerCase(),
        dto.contenido,
        bytes,
        ctx.username,
      ],
    );
    if (!result?.length)
      throw new NotFoundException('Evidencia no encontrada.');
    return this.listEvidencias(doc, `${idpd}`, user);
  }

  async solicitar(docRaw: string, user: JwtPayload) {
    const doc = this.required(docRaw, 'documento');
    const missing = await this.dataSource.query(
      `SELECT 1 ok WHERE NOT EXISTS (
         SELECT 1 FROM dbo.DEV_EVIDENCIA_PROVD e
         JOIN dbo.DEV_CTRL_PROVD d ON d.IDPD=e.IDPD
         WHERE d.DOC=@0 AND d.ACTIVO=1
       )`,
      [doc],
    );
    if (missing?.length) {
      throw new BadRequestException(
        'La devolución requiere una evidencia antes de enviar a autorización.',
      );
    }
    return this.runAction('sp_dev_provd_solicitar', doc, user);
  }
  async autorizar(docRaw: string, user: JwtPayload) {
    return this.runAction('sp_dev_provd_autorizar', docRaw, user);
  }

  async rechazar(
    docRaw: string,
    dto: DevolucionProveedorActionDto,
    user: JwtPayload,
  ) {
    const motivo = this.required(dto.motivo, 'motivo');
    return this.runAction('sp_dev_provd_rechazar', docRaw, user, motivo);
  }

  async cancelar(
    docRaw: string,
    dto: DevolucionProveedorActionDto,
    user: JwtPayload,
  ) {
    return this.runAction(
      'sp_dev_provd_cancelar',
      docRaw,
      user,
      this.nullable(dto.motivo),
    );
  }

  async enviarTransito(
    docRaw: string,
    dto: EnviarTransitoDevolucionProveedorDto,
    user: JwtPayload,
  ) {
    const ctx = await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    try {
      const rows = await this.dataSource.query(
        `EXEC dbo.sp_dev_provd_enviar_transito @DOC=@0,@TRANSPORTISTA=@1,@GUIA=@2,@CAJAS=@3,@RMA=@4,@OBS=@5,@USR=@6`,
        [
          doc,
          dto.transportista,
          dto.guia,
          dto.cajas,
          this.nullable(dto.rma),
          this.nullable(dto.obs),
          ctx.username,
        ],
      );
      return {
        doc,
        envio: this.text(rows?.[0]?.ENVIO ?? rows?.[0]?.envio),
        estatus: 'EN_TRANSITO',
      };
    } catch (error) {
      this.throwSql(error, 'No fue posible enviar la devolucion a transito.');
    }
  }

  async recibir(docRaw: string, user: JwtPayload) {
    return this.runAction('sp_dev_provd_recibir', docRaw, user);
  }

  async consolidar(dto: ConsolidarDevolucionesProveedorDto, user: JwtPayload) {
    const ctx = await this.authorizedContext(user);
    try {
      const rows = await this.dataSource.query(
        `EXEC dbo.sp_dev_provd_consolidar_envio @DOCUMENTOS=@0,@TRANSPORTISTA=@1,@GUIA=@2,@CAJAS=@3,@RMA=@4,@OBS=@5,@USR=@6`,
        [
          JSON.stringify(
            dto.documentos.map((doc) => this.required(doc, 'documento')),
          ),
          dto.transportista,
          dto.guia,
          dto.cajas,
          this.nullable(dto.rma),
          this.nullable(dto.obs),
          ctx.username,
        ],
      );
      return { envio: this.text(rows?.[0]?.ENVIO ?? rows?.[0]?.envio) };
    } catch (error) {
      this.throwSql(error, 'No fue posible consolidar el envio.');
    }
  }

  async listEnvios(user: JwtPayload) {
    await this.authorizedContext(user);
    const rows = await this.dataSource.query(
      `SELECT e.ENVIO,e.PROVD,COALESCE(NULLIF(p.ALIAS,''),p.RSOC,'') PROVEEDOR,e.ESTATUS,e.TRANSPORTISTA,e.GUIA,e.CAJAS,e.RMA,e.OBS,e.FCNR,e.FCN_SALIDA,e.USR_SALIDA,COUNT(ed.DOC) DOCUMENTOS
       FROM dbo.DEV_ENVIO_PROVD e JOIN dbo.DAT_PROVD p ON p.ID=e.PROVD LEFT JOIN dbo.DEV_ENVIO_DOC ed ON ed.IDENVIO=e.ID
       GROUP BY e.ENVIO,e.PROVD,p.ALIAS,p.RSOC,e.ESTATUS,e.TRANSPORTISTA,e.GUIA,e.CAJAS,e.RMA,e.OBS,e.FCNR,e.FCN_SALIDA,e.USR_SALIDA ORDER BY e.FCNR DESC`,
    );
    return (rows ?? []).map((row: Record<string, unknown>) =>
      this.mapShipment(row),
    );
  }

  async salidaFisica(envioRaw: string, user: JwtPayload) {
    const ctx = await this.authorizedContext(user);
    const envio = this.required(envioRaw, 'envio');
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_dev_provd_salida_fisica @ENVIO=@0,@USR=@1`,
        [envio, ctx.username],
      );
      return { envio, estatus: 'EN_TRANSITO' };
    } catch (error) {
      this.throwSql(error, 'No fue posible registrar la salida fisica.');
    }
  }

  private async runAction(
    procedure: string,
    docRaw: string,
    user: JwtPayload,
    motivo?: string | null,
  ) {
    const ctx = await this.authorizedContext(user);
    const doc = this.required(docRaw, 'documento');
    const allowed = new Set([
      'sp_dev_provd_solicitar',
      'sp_dev_provd_autorizar',
      'sp_dev_provd_rechazar',
      'sp_dev_provd_cancelar',
      'sp_dev_provd_recibir',
    ]);
    if (!allowed.has(procedure))
      throw new BadRequestException('Accion invalida.');
    try {
      if (
        procedure === 'sp_dev_provd_rechazar' ||
        procedure === 'sp_dev_provd_cancelar'
      ) {
        await this.dataSource.query(
          `EXEC dbo.${procedure} @DOC=@0,@USR=@1,@MOTIVO=@2`,
          [doc, ctx.username, motivo ?? null],
        );
      } else {
        await this.dataSource.query(`EXEC dbo.${procedure} @DOC=@0,@USR=@1`, [
          doc,
          ctx.username,
        ]);
      }
      return this.findOne(doc, user);
    } catch (error) {
      this.throwSql(error, 'No fue posible completar la accion.');
    }
  }

  private async headerRow(doc: string) {
    const rows = await this.dataSource.query(
      `SELECT h.*,COALESCE(NULLIF(p.ALIAS,''),p.RSOC,'') PROVEEDOR,t.CLAVE TIPO_CLAVE,t.[DESC] TIPO_DESC,
              ISNULL(x.RENGLONES,0) RENGLONES,ISNULL(x.CANTIDAD,0) CANTIDAD,ISNULL(x.IMPORTE,0) IMPORTE
       FROM dbo.DEV_DOC_PROVD h JOIN dbo.DAT_PROVD p ON p.ID=h.PROVD JOIN dbo.DEV_TIPO_PROVD t ON t.ID=h.TIPO_DEV
       OUTER APPLY(SELECT COUNT(1) RENGLONES,SUM(d.CTDA_DEV) CANTIDAD,SUM(d.IMPT) IMPORTE FROM dbo.DEV_CTRL_PROVD d WHERE d.DOC=h.DOC AND d.ACTIVO=1) x WHERE h.DOC=@0`,
      [doc],
    );
    if (!rows?.[0])
      throw new NotFoundException(`No existe la devolucion ${doc}.`);
    return rows[0] as Record<string, unknown>;
  }

  private async assertDraft(doc: string) {
    const row = await this.headerRow(doc);
    if (this.text(row.ESTATUS).toUpperCase() !== 'BORRADOR')
      throw new BadRequestException(
        'La devolucion solo es editable en BORRADOR.',
      );
  }

  private async authorizedContext(user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const role = new Set([ctx.roleCode, ctx.roleName]);
    if (
      ctx.isAdmin ||
      ctx.roleId === 2 ||
      role.has('INVJEF') ||
      role.has('JEFE DE INVENTARIOS') ||
      role.has('JEFE_INVENTARIOS')
    )
      return ctx;
    throw new ForbiddenException(
      'DEV_PROVD esta reservado al Jefe de Inventarios.',
    );
  }

  private async resolveUserContext(user: JwtPayload): Promise<UserContext> {
    const usernameClaim = this.text(
      (user as any).username || (user as any).user,
    );
    const userIdClaim = this.int((user as any).idUsuario ?? (user as any).sub);
    const rows = usernameClaim
      ? await this.dataSource.query(
          `SELECT TOP 1 u.IDUSUARIO,u.USERNAME,u.IDROL,r.CODIGO ROLE_CODE,r.NOMBRE ROLE_NAME FROM dbo.USUARIO u LEFT JOIN dbo.ROL r ON r.IDROL=u.IDROL WHERE UPPER(u.USERNAME)=UPPER(@0)`,
          [usernameClaim],
        )
      : await this.dataSource.query(
          `SELECT TOP 1 u.IDUSUARIO,u.USERNAME,u.IDROL,r.CODIGO ROLE_CODE,r.NOMBRE ROLE_NAME FROM dbo.USUARIO u LEFT JOIN dbo.ROL r ON r.IDROL=u.IDROL WHERE u.IDUSUARIO=@0`,
          [userIdClaim],
        );
    const row = rows?.[0] ?? {};
    const roleId = this.int((user as any).roleId ?? row.IDROL);
    const roleCode = this.text(row.ROLE_CODE).toUpperCase();
    const roleName = this.text(row.ROLE_NAME).toUpperCase();
    const isAdmin =
      [0, 1].includes(roleId) ||
      ['ADMIN', 'ADMINISTRADOR', 'ACCESTOTAL'].includes(roleCode) ||
      ['ADMIN', 'ADMINISTRADOR'].includes(roleName);
    return {
      userId: this.int(row.IDUSUARIO) || userIdClaim,
      username: this.text(row.USERNAME || usernameClaim),
      roleId,
      roleCode,
      roleName,
      isAdmin,
    };
  }

  private mapHeader(row: Record<string, unknown>) {
    return {
      id: this.int(row.ID),
      doc: this.text(row.DOC),
      suc: this.text(row.SUC),
      almacen: this.text(row.ALMACEN),
      provd: this.int(row.PROVD),
      proveedor: this.text(row.PROVEEDOR),
      docOc: this.text(row.DOC_OC),
      docRec: this.text(row.DOC_REC),
      fecha: this.iso(row.FCND),
      tipoDev: this.int(row.TIPO_DEV),
      tipoClave: this.text(row.TIPO_CLAVE),
      tipoDescripcion: this.text(row.TIPO_DESC),
      estatus: this.text(row.ESTATUS),
      obs: this.text(row.OBS),
      usuarioCrea: this.text(row.USR_CREA),
      usuarioSolicita: this.text(row.USR_SOLICITA),
      fechaSolicita: this.iso(row.FCN_SOLICITA),
      usuarioAutoriza: this.text(row.USR_AUTORIZA),
      fechaAutoriza: this.iso(row.FCN_AUTORIZA),
      motivoRechazo: this.text(row.MOTIVO_RECHAZO),
      renglones: this.int(row.RENGLONES),
      cantidad: this.number(row.CANTIDAD),
      importe: this.number(row.IMPORTE),
    };
  }

  private mapDetail(row: Record<string, unknown>) {
    return {
      idpd: this.int(row.IDPD),
      art: this.text(row.ART),
      upc: this.text(row.UPC),
      descripcion: this.text(row.DES),
      cantidad: this.number(row.CTDA_DEV),
      cantidadBloqueada: this.number(row.CTDA_BLOQ),
      costo: this.number(row.CTOP),
      importe: this.number(row.IMPT),
      lote: this.text(row.LOTE),
      caducidad: this.iso(row.CADUCIDAD),
      fechaCaptura: this.iso(row.FCNR),
      motivo: this.int(row.MOV_DEV),
      motivoCodigo: this.text(row.MOTIVO_CODIGO),
      motivoDescripcion: this.text(row.MOTIVO_DESC),
      requiereEvidencia: Boolean(row.REQUIERE_EVIDENCIA),
      requiereDocumento: Boolean(row.REQUIERE_DOCUMENTO),
      evidencias: this.int(row.EVIDENCIAS),
      obs: this.text(row.OBS),
      stock: this.number(row.STOCK),
      disponible: this.number(row.DISPONIBLE),
      marca: this.text(row.MARCA),
      depa: this.number(row.DEPA),
      subd: this.number(row.SUBD),
      clas: this.number(row.CLAS),
      scla: this.number(row.SCLA),
      scla2: this.number(row.SCLA2),
      sph: this.number(row.SPH),
      cyl: this.number(row.CYL),
      adic: this.number(row.ADIC),
    };
  }

  private mapShipment(row: Record<string, unknown>) {
    return {
      envio: this.text(row.ENVIO),
      provd: this.int(row.PROVD),
      proveedor: this.text(row.PROVEEDOR),
      estatus: this.text(row.ESTATUS),
      transportista: this.text(row.TRANSPORTISTA),
      guia: this.text(row.GUIA),
      cajas: this.int(row.CAJAS),
      rma: this.text(row.RMA),
      obs: this.text(row.OBS),
      fecha: this.iso(row.FCNR),
      fechaSalida: this.iso(row.FCN_SALIDA),
      usuarioSalida: this.text(row.USR_SALIDA),
      documentos: this.int(row.DOCUMENTOS),
    };
  }

  private assertEvidence(dataUrl: string, mimeType: string) {
    if (!mimeType.toLowerCase().startsWith('image/'))
      throw new BadRequestException('La evidencia debe ser una imagen.');
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match?.[1])
      throw new BadRequestException(
        'La evidencia debe ser una imagen base64 valida.',
      );
    const bytes = Buffer.from(match[1], 'base64').length;
    if (bytes <= 500)
      throw new BadRequestException('La evidencia debe superar 500 bytes.');
    if (bytes > 500 * 1024)
      throw new BadRequestException('La evidencia no debe exceder 500 KB.');
    return bytes;
  }

  private pushArticleNumericFilter(
    where: string[],
    params: unknown[],
    column: string,
    value: unknown,
  ) {
    const text = this.text(value);
    if (!text) return;
    const normalized = Number(text.replace(',', '.'));
    if (!Number.isFinite(normalized))
      throw new BadRequestException(`Filtro numerico invalido: ${text}`);
    where.push(`TRY_CONVERT(FLOAT,ISNULL(${column},0))=@${params.length}`);
    params.push(normalized);
  }

  private throwSql(error: unknown, fallback: string): never {
    let message = fallback;
    if (error instanceof QueryFailedError)
      message = this.text((error as any).driverError?.message) || fallback;
    else if (error && typeof error === 'object')
      message =
        this.text(
          (error as any).originalError?.info?.message ?? (error as any).message,
        ) || fallback;
    throw new BadRequestException(message.replace(/^.*?Error:\s*/i, '').trim());
  }

  private required(value: unknown, field: string) {
    const text = this.text(value);
    if (!text) throw new BadRequestException(`${field} es requerido.`);
    return text;
  }
  private positiveInt(value: unknown, field: string) {
    const result = this.int(value);
    if (result <= 0) throw new BadRequestException(`${field} invalido.`);
    return result;
  }
  private nullable(value: unknown) {
    const text = this.text(value);
    return text || null;
  }
  private text(value: unknown) {
    return value == null ? '' : String(value).trim();
  }
  private int(value: unknown) {
    const result = Number(value);
    return Number.isFinite(result) ? Math.trunc(result) : 0;
  }
  private number(value: unknown) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }
  private iso(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
