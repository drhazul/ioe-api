import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const toBool = ({ value }: { value: unknown }) => {
  if (value == null) return undefined;
  const text = String(value).trim().toLowerCase();
  if (text == '1' || text == 'true' || text == 'si' || text == 'yes')
    return true;
  if (text == '0' || text == 'false' || text == 'no') return false;
  return undefined;
};

export class ListOverridesDto {
  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  suc?: string;

  @ApiPropertyOptional({ description: 'Usuario objetivo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUsuario?: number;

  @ApiPropertyOptional({ description: 'Solo overrides activos (default true)' })
  @IsOptional()
  @Transform(toBool)
  activeOnly?: boolean;

  @ApiPropertyOptional({ description: 'Pagina (1..n)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementos por pagina (max 500)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
