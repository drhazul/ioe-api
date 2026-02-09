import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AltaMasivaBatchDto {
  @ApiProperty()
  @IsUUID()
  batchId: string;
}
