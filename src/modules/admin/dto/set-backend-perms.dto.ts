import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BackendPermDto } from './backend-perm.dto';

export class SetBackendPermsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BackendPermDto)
  perms: BackendPermDto[];
}
