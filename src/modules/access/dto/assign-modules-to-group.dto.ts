import { IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignModulesToGroupDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  idModulos: number[];
}
