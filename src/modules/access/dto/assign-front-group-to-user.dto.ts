import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignFrontGroupToUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idUsuario?: number;

  @Type(() => Number)
  @IsInt()
  idGrupmodFront: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
