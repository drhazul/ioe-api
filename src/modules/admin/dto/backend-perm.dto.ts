import { IsBoolean, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class BackendPermDto {
  @Type(() => Number)
  @IsInt()
  idGrupModulo: number; // puede ser 0 para acceso total

  @IsBoolean()
  canRead: boolean;

  @IsBoolean()
  canCreate: boolean;

  @IsBoolean()
  canUpdate: boolean;

  @IsBoolean()
  canDelete: boolean;
}
