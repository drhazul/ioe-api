import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RevokeOverrideDto {
  @ApiProperty({ description: 'Motivo de revocacion' })
  @IsString()
  @Length(1, 250)
  REASON: string;
}
