import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class GetPolicyDto {
  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  suc?: string;

  @ApiPropertyOptional({ description: 'Departamento' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idDepto?: number;
}
