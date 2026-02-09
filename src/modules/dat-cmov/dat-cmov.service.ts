import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatCmovService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll() {
    let columns: Array<{ name: string; type_name: string; column_id: number }> = [];
    try {
      columns = await this.dataSource.query(
        `
        SELECT c.name, t.name AS type_name, c.column_id
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.DAT_CMOV')
        ORDER BY c.column_id ASC
        `,
      );
    } catch (err) {
      // Si la tabla no existe o hay permisos insuficientes, regresamos lista vacía
      return [];
    }

    if (!columns.length) return [];

    const lowerMap = new Map<string, string>();
    for (const row of columns) {
      const name = String(row.name ?? '').trim();
      if (name) lowerMap.set(name.toLowerCase(), name);
    }

    const pick = (candidates: string[]) => {
      for (const key of candidates) {
        const hit = lowerMap.get(key.toLowerCase());
        if (hit) return hit;
      }
      return null;
    };

    const numericTypes = new Set([
      'int',
      'bigint',
      'smallint',
      'tinyint',
      'float',
      'real',
      'numeric',
      'decimal',
      'money',
      'smallmoney',
    ]);
    const textTypes = new Set([
      'varchar',
      'nvarchar',
      'char',
      'nchar',
      'text',
      'ntext',
    ]);

    const codeColumn =
      pick(['CLSM', 'CLASE', 'CLAS', 'CLMOV', 'CMOV', 'MOV', 'CLASEMOV', 'CLASE_MOV']) ??
      columns.find(col => numericTypes.has((col.type_name ?? '').toLowerCase()))?.name ??
      columns[0]?.name ??
      null;

    const descColumn =
      pick(['DESCRIPCION', 'DES', 'TXT', 'NOMBRE', 'DESCR', 'DESCRIP']) ??
      columns.find(col => textTypes.has((col.type_name ?? '').toLowerCase()))?.name ??
      null;

    const selectParts: string[] = [];
    if (codeColumn) selectParts.push(`CAST([${codeColumn}] AS FLOAT) AS CLSM`);
    if (descColumn) selectParts.push(`[${descColumn}] AS DESCRIPCION`);
    if (!selectParts.length) selectParts.push('*');

    const orderBy = codeColumn ?? descColumn;
    const sql = `
      SELECT ${selectParts.join(', ')}
      FROM dbo.DAT_CMOV
      ${orderBy ? `ORDER BY [${orderBy}] ASC` : ''}
    `;

    try {
      return await this.dataSource.query(sql);
    } catch (err) {
      return [];
    }
  }
}
