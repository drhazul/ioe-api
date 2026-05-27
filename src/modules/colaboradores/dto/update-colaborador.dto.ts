import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateColaboradorDto } from './create-colaborador.dto';

export class UpdateColaboradorDto extends PartialType(CreateColaboradorDto) {
  @IsOptional()
  @Transform(({ value, obj }) => value ?? obj?.id_usuario ?? obj?.ID_USUARIO)
  @IsInt()
  @Min(1)
  id_usuario?: number;

  @IsOptional()
  @Transform(({ value, obj }) =>
    String(
      value ??
        obj?.id_usuario ??
        obj?.id_empleado ??
        obj?.idEmpleado ??
        obj?.ID_EMPLEADO ??
        obj?.id_matricula ??
        obj?.ID_MATRICULA ??
        '',
    ).trim(),
  )
  @IsString()
  @Length(1, 40)
  id_empleado?: string;

  @IsOptional()
  @Transform(
    ({ value, obj }) => value ?? obj?.status_activo ?? obj?.STATUS_ACTIVO,
  )
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @Transform(({ value, obj }) =>
    (() => {
      const raw = String(value ?? obj?.pin ?? obj?.PIN ?? '').trim();
      if (!raw.length || raw === '••••') return undefined;
      return raw;
    })(),
  )
  @IsString()
  @Length(1, 30)
  pin?: string;
}
