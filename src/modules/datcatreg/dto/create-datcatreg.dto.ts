import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatCatRegDto {
  @ApiProperty({ type: Number })
  @IsInt()
  C_REGIMENFISCAL: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DESCRIPCION?: string;
}
