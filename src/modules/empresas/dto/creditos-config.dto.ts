import {
  IsBoolean,
  IsDefined,
  IsIn,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreditosConfigDto {
  @IsIn(['EMPRESA', 'SUCURSAL'])
  modo: 'EMPRESA' | 'SUCURSAL';

  @IsBoolean()
  permitir: boolean;

  @Matches(/^[0-9a-fA-F]{16}$/)
  version: string;
}

export class CreditosSucursalConfigDto {
  // null explicitly removes the override; omitted values are rejected.
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsBoolean()
  permitir: boolean | null;

  @Matches(/^[0-9a-fA-F]{16}$/)
  version: string;
}
