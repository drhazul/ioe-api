import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

enum JornadaTipoDto {
  DIURNA = 'DIURNA',
  NOCTURNA = 'NOCTURNA',
  MIXTA = 'MIXTA',
}

enum EstatusContratoDto {
  PRUEBA_30 = 'PRUEBA_30',
  PRUEBA_90 = 'PRUEBA_90',
  PLANTA = 'PLANTA',
  BAJA = 'BAJA',
}

export class CreateColaboradorDto {
  @ApiPropertyOptional({ example: 'MAT-23052001' })
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
  id_empleado: string;

  @ApiPropertyOptional({
    example: 1002,
    description: 'ID numérico COLABORADORES.id_usuario',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_usuario?: number;

  @ApiProperty({ example: '100245' })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.pin ?? obj?.PIN ?? '').trim(),
  )
  @IsString()
  @Length(1, 30)
  pin: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @Length(1, 120)
  nombre: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @Length(1, 120)
  apellido: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  apellido_paterno?: string;

  @ApiPropertyOptional({ example: 'García' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  apellido_materno?: string;

  @ApiPropertyOptional({ example: 'Operaciones' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  departamento?: string;

  @ApiPropertyOptional({ example: 'Jefe de Operaciones' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  cargo?: string;

  @ApiProperty({
    example: '1',
    description: 'FK a SUCURSALES.id (entero positivo en texto)',
  })
  @IsString()
  @Matches(/^[1-9][0-9]*$/, {
    message: 'sucursal_id debe ser entero positivo',
  })
  sucursal_id: string;

  @ApiPropertyOptional({ example: 0, description: '0 = Normal, 14 = Admin' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 14])
  privilegio?: number;

  @ApiPropertyOptional({
    example: 'TRABAJADOR',
    description: 'Rol lógico de usuario para sincronización',
  })
  @IsOptional()
  @IsString()
  @IsIn(['TRABAJADOR', 'ADMIN'])
  rol?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @Transform(
    ({ value, obj }) => value ?? obj?.status_activo ?? obj?.STATUS_ACTIVO,
  )
  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  app_access?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  gps_allowed?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  qr_allowed?: boolean;

  @ApiPropertyOptional({
    example: 'ABCD8601011A2',
    description: 'RFC persona física/moral en mayúsculas',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(([A-Z]|[a-z]){4})([0-9]{6})((([A-Z]|[a-z]|[0-9]){3}))$/, {
    message: 'RFC inválido',
  })
  rfc?: string;

  @ApiPropertyOptional({
    example: 'GODE561231HDFRRN09',
    description: 'CURP de 18 caracteres',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/, {
    message: 'CURP inválida',
  })
  curp?: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{11}$/, { message: 'NSS inválido' })
  nss?: string;

  @ApiPropertyOptional({ enum: JornadaTipoDto, default: JornadaTipoDto.DIURNA })
  @IsOptional()
  @IsEnum(JornadaTipoDto)
  jornada_tipo?: JornadaTipoDto;

  @ApiPropertyOptional({
    enum: EstatusContratoDto,
    default: EstatusContratoDto.PLANTA,
  })
  @IsOptional()
  @IsEnum(EstatusContratoDto)
  estatus_contrato?: EstatusContratoDto;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  documentacion_completa?: boolean;

  @ApiProperty({
    example: '2',
    description: 'FK a HORARIOS.id (entero positivo en texto)',
  })
  @IsString()
  @Matches(/^[1-9][0-9]*$/, {
    message: 'horario_id debe ser entero positivo',
  })
  horario_id: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Fecha contrato en formato YYYY-MM-DD',
  })
  @IsOptional()
  @IsDateString()
  vencimiento_contrato?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  es_admin_dispositivo?: boolean;

  @ApiPropertyOptional({
    example: [1, 3, 5],
    description: 'Sucursales extra para replicación de comandos ADMS',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  sucursales_ids?: number[];
}
