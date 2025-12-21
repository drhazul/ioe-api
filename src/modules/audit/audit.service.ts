import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>) {}

  async log(entry: Partial<AuditLogEntity>) {
    // Nunca dejar que el log rompa la request
    try {
      const row = this.repo.create({
        IDUSUARIO: entry.IDUSUARIO ?? null,
        ACTION: entry.ACTION ?? 'UNKNOWN',
        MODULO: entry.MODULO ?? null,
        ENTIDAD: entry.ENTIDAD ?? null,
        ENTIDAD_ID: entry.ENTIDAD_ID ?? null,
        SUC: entry.SUC ?? null,
        METADATA_JSON: entry.METADATA_JSON ?? null,
        IP: entry.IP ?? null,
      });
      await this.repo.save(row);
    } catch {
      // silencio intencional
    }
  }
}
