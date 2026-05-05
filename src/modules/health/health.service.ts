import { Injectable } from '@nestjs/common';
import { constants, existsSync, accessSync, unlinkSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { ExportService } from '../asistencia/export.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly exportService: ExportService,
  ) {}

  async dbCheck() {
    const res = await this.dataSource.query('SELECT 1 AS ok');
    return { db: 'ok', result: res?.[0] ?? null };
  }

  async environmentCheck() {
    const storagePath = path.resolve(process.cwd(), 'uploads', 'asistencia');
    const db = await this.checkDatabaseConnection();
    const tables = await this.checkRequiredTables();
    const storage = this.checkStorageWritePermission(storagePath);
    const exportEngines = this.exportService.healthCheck();

    return {
      ok: db.ok && tables.ok && storage.ok && exportEngines.ok,
      timestamp: new Date().toISOString(),
      database: db,
      tables,
      storage,
      exportEngines,
    };
  }

  private async checkDatabaseConnection() {
    try {
      const row = await this.dataSource.query(
        "SELECT DB_NAME() AS database_name, @@VERSION AS sql_version",
      );
      return {
        ok: true,
        databaseName: this.readValue(row?.[0] ?? null, 'database_name'),
        sqlVersion: this.readValue(row?.[0] ?? null, 'sql_version'),
      };
    } catch (error) {
      return {
        ok: false,
        error: this.extractError(error),
      };
    }
  }

  private async checkRequiredTables() {
    try {
      const row = await this.dataSource.query(`
        SELECT
          CASE WHEN OBJECT_ID('dbo.COMANDOS_ADMS', 'U') IS NULL THEN 0 ELSE 1 END AS has_comandos_adms,
          CASE WHEN OBJECT_ID('dbo.ATT_ASISTENCIA_FOTO', 'U') IS NULL THEN 0 ELSE 1 END AS has_att_asistencia_foto,
          CASE WHEN OBJECT_ID('dbo.SUCURSALES', 'U') IS NULL THEN 0 ELSE 1 END AS has_sucursales,
          CASE WHEN OBJECT_ID('dbo.COLABORADORES', 'U') IS NULL THEN 0 ELSE 1 END AS has_colaboradores,
          CASE WHEN OBJECT_ID('dbo.BIO_TEMPLATES', 'U') IS NULL THEN 0 ELSE 1 END AS has_bio_templates,
          CASE WHEN OBJECT_ID('dbo.ATT_RULES_HORARIOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_horarios,
          CASE WHEN OBJECT_ID('dbo.COLABORADORES_SUCURSALES', 'U') IS NULL THEN 0 ELSE 1 END AS has_colaboradores_sucursales,
          CASE WHEN OBJECT_ID('dbo.COLABORADORES_HORARIOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_colaboradores_horarios,
          CASE WHEN OBJECT_ID('dbo.ATT_ASISTENCIA_ESTATUS', 'U') IS NULL THEN 0 ELSE 1 END AS has_att_asistencia_estatus,
          CASE WHEN OBJECT_ID('dbo.NOTIFICACIONES', 'U') IS NULL THEN 0 ELSE 1 END AS has_notificaciones,
          CASE WHEN OBJECT_ID('dbo.MARCAJES', 'U') IS NULL THEN 0 ELSE 1 END AS has_marcajes,
          CASE WHEN OBJECT_ID('dbo.ATT_PERMISOS_TIPOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_att_permisos_tipos,
          CASE WHEN OBJECT_ID('dbo.ATT_SOLICITUDES', 'U') IS NULL THEN 0 ELSE 1 END AS has_att_solicitudes,
          CASE WHEN OBJECT_ID('dbo.ATT_VACACIONES_SALDOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_att_vacaciones_saldos,
          CASE WHEN OBJECT_ID('dbo.ATT_NOM035_RESPUESTAS', 'U') IS NULL THEN 0 ELSE 1 END AS has_att_nom035_respuestas,
          CASE WHEN OBJECT_ID('dbo.HISTORICO_PUESTOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_historico_puestos,
          CASE WHEN OBJECT_ID('dbo.FESTIVOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_festivos,
          CASE WHEN OBJECT_ID('dbo.INCENTIVOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_incentivos,
          CASE WHEN OBJECT_ID('dbo.COLABORADORES_DOCUMENTOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_colaboradores_documentos,
          CASE WHEN OBJECT_ID('dbo.CONTRATOS', 'U') IS NULL THEN 0 ELSE 1 END AS has_contratos,
          CASE WHEN COL_LENGTH('dbo.SUCURSALES', 'latitud') IS NULL THEN 0 ELSE 1 END AS has_suc_latitud,
          CASE WHEN COL_LENGTH('dbo.SUCURSALES', 'longitud') IS NULL THEN 0 ELSE 1 END AS has_suc_longitud,
          CASE WHEN COL_LENGTH('dbo.SUCURSALES', 'radio_metros') IS NULL THEN 0 ELSE 1 END AS has_suc_radio_metros,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'rfc') IS NULL THEN 0 ELSE 1 END AS has_colab_rfc,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'curp') IS NULL THEN 0 ELSE 1 END AS has_colab_curp,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'nss') IS NULL THEN 0 ELSE 1 END AS has_colab_nss,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'jornada_tipo') IS NULL THEN 0 ELSE 1 END AS has_colab_jornada_tipo,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'estatus_contrato') IS NULL THEN 0 ELSE 1 END AS has_colab_estatus_contrato,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'documentacion_completa') IS NULL THEN 0 ELSE 1 END AS has_colab_documentacion_completa,
          CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'id_sueldo') IS NULL THEN 0 ELSE 1 END AS has_colab_id_sueldo,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'inicio_entrada') IS NULL THEN 0 ELSE 1 END AS has_hor_inicio_entrada,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'fin_entrada') IS NULL THEN 0 ELSE 1 END AS has_hor_fin_entrada,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'minutos_almuerzo') IS NULL THEN 0 ELSE 1 END AS has_hor_minutos_almuerzo,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'redondeo_entrada') IS NULL THEN 0 ELSE 1 END AS has_hor_redondeo_entrada,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'es_flexible') IS NULL THEN 0 ELSE 1 END AS has_hor_es_flexible,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'ot_minimo_minutos') IS NULL THEN 0 ELSE 1 END AS has_hor_ot_minimo_minutos,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'ot_requiere_autorizacion') IS NULL THEN 0 ELSE 1 END AS has_hor_ot_requiere_autorizacion,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'horas_jornada_minutos') IS NULL THEN 0 ELSE 1 END AS has_hor_horas_jornada_minutos,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'horas_extra_minimo_minutos') IS NULL THEN 0 ELSE 1 END AS has_hor_horas_extra_minimo,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'horas_extra_requiere_autorizacion') IS NULL THEN 0 ELSE 1 END AS has_hor_horas_extra_auth,
          CASE WHEN COL_LENGTH('dbo.ATT_RULES_HORARIOS', 'activo') IS NULL THEN 0 ELSE 1 END AS has_hor_activo,
          CASE WHEN COL_LENGTH('dbo.HISTORICO_PUESTOS', 'idrol') IS NULL THEN 0 ELSE 1 END AS has_hp_idrol,
          CASE WHEN COL_LENGTH('dbo.HISTORICO_PUESTOS', 'id_incent') IS NULL THEN 0 ELSE 1 END AS has_hp_id_incent,
          CASE WHEN COL_LENGTH('dbo.HISTORICO_PUESTOS', 'estado') IS NULL THEN 0 ELSE 1 END AS has_hp_estado,
          CASE WHEN COL_LENGTH('dbo.MARCAJES', 'punch_time') IS NULL THEN 0 ELSE 1 END AS has_marcajes_punch_time,
          CASE WHEN COL_LENGTH('dbo.MARCAJES', 'terminal_id') IS NULL THEN 0 ELSE 1 END AS has_marcajes_terminal_id;
      `);

      const first = (row?.[0] ?? null) as Record<string, unknown> | null;
      const checks = {
        COMANDOS_ADMS: this.readBool(first, 'has_comandos_adms'),
        ATT_ASISTENCIA_FOTO: this.readBool(first, 'has_att_asistencia_foto'),
        SUCURSALES: this.readBool(first, 'has_sucursales'),
        COLABORADORES: this.readBool(first, 'has_colaboradores'),
        BIO_TEMPLATES: this.readBool(first, 'has_bio_templates'),
        HORARIOS: this.readBool(first, 'has_horarios'),
        COLABORADORES_SUCURSALES: this.readBool(
          first,
          'has_colaboradores_sucursales',
        ),
        COLABORADORES_HORARIOS: this.readBool(first, 'has_colaboradores_horarios'),
        ATT_ASISTENCIA_ESTATUS: this.readBool(first, 'has_att_asistencia_estatus'),
        NOTIFICACIONES: this.readBool(first, 'has_notificaciones'),
        MARCAJES: this.readBool(first, 'has_marcajes'),
        ATT_PERMISOS_TIPOS: this.readBool(first, 'has_att_permisos_tipos'),
        ATT_SOLICITUDES: this.readBool(first, 'has_att_solicitudes'),
        ATT_VACACIONES_SALDOS: this.readBool(first, 'has_att_vacaciones_saldos'),
        ATT_NOM035_RESPUESTAS: this.readBool(first, 'has_att_nom035_respuestas'),
        HISTORICO_PUESTOS: this.readBool(first, 'has_historico_puestos'),
        FESTIVOS: this.readBool(first, 'has_festivos'),
        INCENTIVOS: this.readBool(first, 'has_incentivos'),
        COLABORADORES_DOCUMENTOS: this.readBool(
          first,
          'has_colaboradores_documentos',
        ),
        CONTRATOS: this.readBool(first, 'has_contratos'),
        SUCURSALES_latitud: this.readBool(first, 'has_suc_latitud'),
        SUCURSALES_longitud: this.readBool(first, 'has_suc_longitud'),
        SUCURSALES_radio_metros: this.readBool(first, 'has_suc_radio_metros'),
        COLABORADORES_rfc: this.readBool(first, 'has_colab_rfc'),
        COLABORADORES_curp: this.readBool(first, 'has_colab_curp'),
        COLABORADORES_nss: this.readBool(first, 'has_colab_nss'),
        COLABORADORES_jornada_tipo: this.readBool(first, 'has_colab_jornada_tipo'),
        COLABORADORES_estatus_contrato: this.readBool(
          first,
          'has_colab_estatus_contrato',
        ),
        COLABORADORES_documentacion_completa: this.readBool(
          first,
          'has_colab_documentacion_completa',
        ),
        COLABORADORES_id_sueldo: this.readBool(first, 'has_colab_id_sueldo'),
        HORARIOS_inicio_entrada: this.readBool(first, 'has_hor_inicio_entrada'),
        HORARIOS_fin_entrada: this.readBool(first, 'has_hor_fin_entrada'),
        HORARIOS_minutos_almuerzo: this.readBool(
          first,
          'has_hor_minutos_almuerzo',
        ),
        HORARIOS_redondeo_entrada: this.readBool(
          first,
          'has_hor_redondeo_entrada',
        ),
        HORARIOS_es_flexible: this.readBool(first, 'has_hor_es_flexible'),
        HORARIOS_ot_minimo_minutos: this.readBool(
          first,
          'has_hor_ot_minimo_minutos',
        ),
        HORARIOS_ot_requiere_autorizacion: this.readBool(
          first,
          'has_hor_ot_requiere_autorizacion',
        ),
        HORARIOS_horas_jornada_minutos: this.readBool(first, 'has_hor_horas_jornada_minutos'),
        HORARIOS_horas_extra_minimo: this.readBool(first, 'has_hor_horas_extra_minimo'),
        HORARIOS_horas_extra_auth: this.readBool(first, 'has_hor_horas_extra_auth'),
        HORARIOS_activo: this.readBool(first, 'has_hor_activo'),
        HISTORICO_PUESTOS_idrol: this.readBool(first, 'has_hp_idrol'),
        HISTORICO_PUESTOS_id_incent: this.readBool(first, 'has_hp_id_incent'),
        HISTORICO_PUESTOS_estado: this.readBool(first, 'has_hp_estado'),
        MARCAJES_punch_time: this.readBool(first, 'has_marcajes_punch_time'),
        MARCAJES_terminal_id: this.readBool(first, 'has_marcajes_terminal_id'),
      };
      return {
        ok: Object.values(checks).every(Boolean),
        checks,
      };
    } catch (error) {
      return {
        ok: false,
        checks: {},
        error: this.extractError(error),
      };
    }
  }

  private checkStorageWritePermission(storagePath: string) {
    if (!existsSync(storagePath)) {
      return {
        ok: false,
        path: storagePath,
        exists: false,
        writable: false,
        error: 'Carpeta no existe',
      };
    }

    const probeFile = path.join(storagePath, `healthcheck_${Date.now()}.tmp`);

    try {
      writeFileSync(probeFile, 'ok', { encoding: 'utf8' });
      accessSync(probeFile, constants.R_OK | constants.W_OK);
      unlinkSync(probeFile);

      return {
        ok: true,
        path: storagePath,
        exists: true,
        writable: true,
      };
    } catch (error) {
      try {
        unlinkSync(probeFile);
      } catch {
        // no-op
      }

      return {
        ok: false,
        path: storagePath,
        exists: true,
        writable: false,
        error: this.extractError(error),
      };
    }
  }

  private readBool(
    row: Record<string, unknown> | null,
    key: string,
  ): boolean {
    const value = this.readValue(row, key);
    return Number(value) === 1;
  }

  private readValue(row: Record<string, unknown> | null, key: string) {
    if (row == null) return null;
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];

    const lower = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower];

    const upper = key.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];

    return null;
  }

  private extractError(error: unknown) {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const obj = error as Record<string, unknown>;
      if (typeof obj.message === 'string' && obj.message.trim().length) {
        return obj.message;
      }
    }
    return String(error);
  }
}
