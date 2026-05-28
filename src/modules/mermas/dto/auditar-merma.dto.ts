import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AuditarMermaDto {
  @IsOptional()
  @IsString()
  obsAudit?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    const text = String(value ?? '')
      .trim()
      .toLowerCase();
    return text === '1' || text === 'true' || text === 'si' || text === 'yes';
  })
  @IsBoolean()
  confirmFisica?: boolean;
}
