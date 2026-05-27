import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ResetBiometriaDto {
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  reset_face?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  reset_fingerprint?: boolean;
}
