import {
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTransferenciaDetailDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  ctd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ctdLib?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ctdR?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  txt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['CONTABILIZADO', 'INCIDENCIA'])
  estatusR?: string;
}
