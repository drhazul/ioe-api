import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUsrModSucDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;
}
