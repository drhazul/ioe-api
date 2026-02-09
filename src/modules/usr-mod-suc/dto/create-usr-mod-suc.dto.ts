import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateUsrModSucDto {
  @ApiProperty({ example: 'DAT_JAA_ALM' })
  @IsString()
  @Length(1, 50)
  MODULO: string;

  @ApiProperty({ example: 'udf01ja04' })
  @IsString()
  @Length(1, 60)
  USUARIO: string;

  @ApiProperty({ example: 'DF01' })
  @IsString()
  @Length(1, 10)
  SUC: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;
}
