import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type ConfigPayload = {
  nombreEmpresa: string;
  nitEmpresa: string;
  gpsObligatorio: boolean;
  livenessObligatorio: boolean;
  departamentos: string[];
  cargos: string[];
};

@Injectable()
export class MasterdataConfigService {
  constructor(private readonly dataSource: DataSource) {}

  async getConfig(): Promise<ConfigPayload> {
    const [departamentos, cargos, empresa] = await Promise.all([
      this.fetchDepartamentos(),
      this.fetchCargos(),
      this.fetchEmpresa(),
    ]);

    return {
      nombreEmpresa: empresa.nombreEmpresa,
      nitEmpresa: empresa.nitEmpresa,
      gpsObligatorio: false,
      livenessObligatorio: false,
      departamentos,
      cargos,
    };
  }

  async saveConfig(payload: Record<string, unknown>): Promise<ConfigPayload> {
    return {
      nombreEmpresa: this.asText(payload.nombreEmpresa),
      nitEmpresa: this.asText(payload.nitEmpresa),
      gpsObligatorio: this.asBool(payload.gpsObligatorio),
      livenessObligatorio: this.asBool(payload.livenessObligatorio),
      departamentos: this.asTextArray(payload.departamentos),
      cargos: this.asTextArray(payload.cargos),
    };
  }

  private async fetchDepartamentos() {
    const rows = await this.dataSource.query(`
      SELECT LTRIM(RTRIM(ISNULL(NOMBRE, ''))) AS NOMBRE
      FROM dbo.DEPARTAMENTO
      WHERE LTRIM(RTRIM(ISNULL(NOMBRE, ''))) <> ''
      ORDER BY NOMBRE ASC
    `);
    return rows
      .map((row: Record<string, unknown>) => this.asText(row.NOMBRE))
      .filter((name) => name.length > 0);
  }

  private async fetchCargos() {
    const rows = await this.dataSource.query(`
      SELECT LTRIM(RTRIM(ISNULL(NOMBRE, ''))) AS NOMBRE
      FROM dbo.ROL
      WHERE LTRIM(RTRIM(ISNULL(NOMBRE, ''))) <> ''
      ORDER BY NOMBRE ASC
    `);
    return rows
      .map((row: Record<string, unknown>) => this.asText(row.NOMBRE))
      .filter((name) => name.length > 0);
  }

  private async fetchEmpresa() {
    const rows = await this.dataSource.query(`
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(empresa, ''))) AS EMPRESA,
        LTRIM(RTRIM(ISNULL(nit, ''))) AS NIT
      FROM dbo.SUCURSALES
      ORDER BY id ASC
    `);
    const first = (rows?.[0] as Record<string, unknown> | undefined) ?? {};
    return {
      nombreEmpresa: this.asText(first.EMPRESA),
      nitEmpresa: this.asText(first.NIT),
    };
  }

  private asText(value: unknown) {
    return String(value ?? '').trim();
  }

  private asBool(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      return text === '1' || text === 'true';
    }
    return false;
  }

  private asTextArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.asText(item))
      .filter((item) => item.length > 0);
  }
}
