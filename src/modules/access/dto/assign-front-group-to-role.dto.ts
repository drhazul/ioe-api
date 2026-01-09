import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignFrontGroupToRoleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idRol?: number;

  @Type(() => Number)
  @IsInt()
  idGrupmodFront: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
