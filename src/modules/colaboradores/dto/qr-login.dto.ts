import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class QrLoginDto {
  @ApiProperty({ description: 'Token QR en Base64' })
  @IsString()
  @Length(10, 4096)
  token: string;
}
