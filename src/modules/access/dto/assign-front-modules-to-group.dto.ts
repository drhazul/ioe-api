import { IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignFrontModulesToGroupDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  idModFront: number[];
}
