import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class TemplateResponseDto {
  @ApiProperty({ example: '100245' })
  @IsString()
  @Length(1, 30)
  pin: string;

  @ApiProperty({ example: 'HUELLA', enum: ['HUELLA', 'ROSTRO', 'PALMA'] })
  @IsString()
  @IsIn(['HUELLA', 'ROSTRO', 'PALMA', 'huella', 'rostro', 'palma'])
  tipo: string;

  @ApiProperty({
    example: 'QmFzZTY0VGVtcGxhdGU=',
    description: 'Template biométrico codificado base64',
  })
  @IsString()
  @Length(1, 2000000)
  templateBase64: string;

  @ApiPropertyOptional({ example: 'DEVICE-01' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'CDM-01' })
  @IsOptional()
  @IsString()
  suc?: string;
}
