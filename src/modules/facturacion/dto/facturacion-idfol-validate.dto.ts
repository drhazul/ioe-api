import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

const normalizeIdFols = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0);
  }

  const single = String(value ?? '').trim();
  return single.length ? [single] : [];
};

export class FacturacionIdFolValidateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @Transform(({ value }) => normalizeIdFols(value))
  idFols: string[];
}
