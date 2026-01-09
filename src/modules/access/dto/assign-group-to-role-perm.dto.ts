import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignGroupToRolePermDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idRol?: number;

  @Type(() => Number)
  @IsInt()
  idGrupModulo: number;

  @IsOptional()
  @IsBoolean()
  canRead?: boolean;

  @IsOptional()
  @IsBoolean()
  canCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  canUpdate?: boolean;

  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
