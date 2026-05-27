import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CreatePvCtrFolAsvrAutoDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TER?: string;

  @ApiPropertyOptional({
    description: 'Sucursal para alta de cotización (admin)',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 20)
  SUC?: string;

  @ApiPropertyOptional({ description: 'OPV para alta de cotización (admin)' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  OPV?: string;
}
