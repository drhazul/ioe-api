import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async dbCheck() {
    const res = await this.dataSource.query('SELECT 1 AS ok');
    return { db: 'ok', result: res?.[0] ?? null };
  }
}
